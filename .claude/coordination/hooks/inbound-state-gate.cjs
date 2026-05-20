#!/usr/bin/env node
/**
 * Inbound State Gate — UserPromptSubmit hook.
 *
 * Intercepts operator messages before the agent processes them.
 * Detects state-change signals (operator reporting external state changes)
 * and injects context reminding the agent to update observations.
 *
 * Also writes a marker file so the outbound gate can escalate if observations
 * are stale relative to the last operator message.
 *
 * Format: CJS (matches existing coordination hooks).
 * Hook type: UserPromptSubmit (fires before agent processes prompt).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('./lib/gate-utils.cjs');

// --- State-change signal patterns ---
// Operator messages that indicate external state has changed.
const STATE_CHANGE_PATTERNS = [
  // Device/resource clearance
  /\b(i|we)?\s*(cleared|clear|removed|delete[ds]?|wiped|reset)\s*(the|my|all)?\s*(device|slot|container|sandbox|cache|venv|vnstock)\b/i,
  // Device/resource registration or creation
  /\b(i|we)?\s*(registered|created|installed|started|launched|ran|executed|bootstrapped)\b/i,
  // State reports
  /\b(it'?s?|it\s+is|that'?s?|that\s+is|everything'?s?|everything\s+is|all)\s+(working|running|fixed|ready|done|complete|success|good|ok)\b/i,
  // Container/service state
  /\b(container|service|server|process|app)\s*(is|are|was)\s*(up|running|alive|ready|started|stopped|killed|dead)\b/i,
  // Slot/device status
  /\b(slot|device|fingerprint)\s*(is|are|was|now)?\s*(free|available|clear|empty|open|used|occupied|taken)\b/i,
  // Operator action reports
  /\b(i|we)?\s*(just\s+)?(did|finished|completed|succeeded|failed)\b/i,
  // Environment state changes
  /\b(the\s+)?(env|environment|venv|sandbox|docker)\s*(is|was|has\s+been)?\s*(cleared|reset|ready|clean|dirty|broken|fixed)\b/i,
  // Explicit state change language
  /\bstate\s*(change|update|shift|changed|updated)\b/i,
  /\bchanged\s*(the|my|our)\b/i,
  // Budget/resource updates
  /\b(budget|resource|limit|quota)\s*(is|was|has\s+been)?\s*(exhausted|reset|replenished|full|empty|cleared)\b/i,
  // Direct "the X is Y" state assertions
  /\bthe\s+\w+\s+(is|was|has\s+been)\s+(cleared|reset|fixed|ready|running|working|broken|done)\b/i,
];

// --- Observation staleness threshold ---
// If an observation hasn't been updated in this many ms, it's considered stale
// when a state-change message arrives.
const STALENESS_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Read payload from stdin. Matches simplify-gate.cjs format.
 */
function readPayload() {
  const stdin = fs.readFileSync(0, 'utf8').trim();
  return stdin ? JSON.parse(stdin) : {};
}

/**
 * Check if the operator message contains state-change signals.
 * Returns true if any pattern matches.
 */
function detectStateChange(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return STATE_CHANGE_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Read active observations from records/observations/.
 * Returns array of { id, constraint_type, constraint, updated_at, status }.
 */
function readActiveObservations(root) {
  const obsDir = path.join(root, 'records', 'observations');
  try {
    const yaml = require('yaml');
    const files = fs.readdirSync(obsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const observations = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(obsDir, file), 'utf8');
        const parsed = yaml.parse(content, { uniqueKeys: false });
        if (parsed && parsed.status === 'active') {
          observations.push(parsed);
        }
      } catch { /* skip unparseable */ }
    }
    return observations;
  } catch {
    return [];
  }
}

/**
 * Check if any observation is stale relative to the current time.
 * Returns array of stale observations.
 */
function findStaleObservations(observations, now) {
  return observations.filter(obs => {
    if (!obs.updated_at) return true; // no timestamp = stale
    const updated = new Date(obs.updated_at).getTime();
    if (isNaN(updated)) return true;
    return (now - updated) > STALENESS_THRESHOLD_MS;
  });
}

/**
 * Write operator message marker for outbound gate to read.
 * Records timestamp of last state-change message.
 */
function writeOperatorMessageMarker(root, prompt) {
  try {
    const markerPath = process.env.GATE_MARKER_PATH || path.join(root, '.claude', 'coordination', '.last-operator-message');
    const marker = {
      timestamp: new Date().toISOString(),
      prompt_snippet: prompt.slice(0, 200),
    };
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    const tmpMarkerPath = markerPath + '.tmp';
    fs.writeFileSync(tmpMarkerPath, JSON.stringify(marker, null, 2));
    fs.renameSync(tmpMarkerPath, markerPath);
  } catch {
    // marker write failure never blocks
  }
}

/**
 * Emit soft warning (inject context, don't block).
 */
function emitSoft(message) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: message }
  }));
}

/**
 * Build the context injection message.
 */
function buildContextMessage(staleObservations) {
  const ids = staleObservations.map(o => o.id || o.constraint || 'unknown').join(', ');
  return [
    'INBOUND STATE GATE: Operator message contains a state-change signal.',
    `Active observations may be stale: ${ids}`,
    'Before proceeding, update affected observations via record_observation MCP tool.',
    'Do NOT assume external state matches observation records — verify first.',
  ].join('\n');
}

function main() {
  const payload = readPayload();
  const prompt = String(payload.prompt || payload.user_prompt || '').trim();
  if (!prompt) process.exit(0);

  // Short messages are usually not state-change reports
  if (prompt.length < 10) process.exit(0);

  // Questions ending with ? are usually not state-change reports (F11)
  if (prompt.endsWith('?')) process.exit(0);

  // Detect state-change signal
  if (!detectStateChange(prompt)) process.exit(0);

  const root = findProjectRoot();

  // Read active observations
  const observations = readActiveObservations(root);
  if (observations.length === 0) process.exit(0);

  // Check for stale observations
  const now = Date.now();
  const stale = findStaleObservations(observations, now);
  if (stale.length === 0) process.exit(0);

  // Write operator message marker for outbound gate
  // Only write marker when observations are actually stale (F1 fix)
  writeOperatorMessageMarker(root, prompt);

  // Inject context — soft warning, not a hard block
  const message = buildContextMessage(stale);
  emitSoft(message);
  process.exit(0);
}

try { main(); } catch { process.exit(0); }
