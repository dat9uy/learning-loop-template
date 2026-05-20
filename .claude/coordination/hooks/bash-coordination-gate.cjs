#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { matchConstraintPattern, readObservations, checkObservationStaleness, pathMatchesObservation } = require('./lib/gate-utils.cjs');

function findProjectRoot() {
  // Walk up from coord dir to find project root (contains records/)
  // Override via GATE_ROOT env var for testing.
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = path.join(__dirname, '..', '..', '..');
  while (!fs.existsSync(path.join(dir, 'records'))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

const PATH_WRITE_PATTERNS = [
  />{1,2}\s*records\/[^\s;&|]+/,
  /<<['"]?\w+['"]?\s*>\s*records\//,
  /\btee\b.*records\/[^\s;&|]+/,
];

function extractRecordsPath(command) {
  if (!command || typeof command !== 'string') return null;
  for (const pattern of PATH_WRITE_PATTERNS) {
    const match = command.match(pattern);
    if (match) {
      let rawPath = match[0];
      // Strip redirect operators and tee prefix
      rawPath = rawPath.replace(/^>{1,2}\s*/, '');
      rawPath = rawPath.replace(/^<<['"]?\w+['"]?\s*>\s*/, '');
      rawPath = rawPath.replace(/^\btee\b\s*/, '');
      // Strip tee flags (-a, -i, --append, etc.) and -- separator
      const parts = rawPath.split(/\s+/);
      let i = 0;
      while (i < parts.length && (parts[i].startsWith('-') || parts[i] === '--')) {
        i++;
      }
      rawPath = parts.slice(i).join(' ');
      // Strip quotes and ./ prefix
      rawPath = rawPath.replace(/^["']|["']$/g, '');
      rawPath = rawPath.replace(/^\.\//, '');
      return rawPath;
    }
  }
  return null;
}

function readBudgets(observationsDir) {
  try {
    const files = fs.readdirSync(observationsDir).filter(f => f.endsWith('-resource-budget.yaml'));
    const budgets = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(observationsDir, file), 'utf8');
        const parsed = yaml.parse(content, { uniqueKeys: false });
        if (parsed && typeof parsed === 'object') budgets.push(parsed);
      } catch (err) {
        console.error(`bash-gate: failed to parse budget ${file}: ${err.message}`);
      }
    }
    return budgets;
  } catch {
    return [];
  }
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }

  // Only gate Bash
  if (input.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = input.tool_input?.command;
  if (!command || typeof command !== 'string') {
    process.exit(0);
  }

  const coordDir = path.join(__dirname, '..');
  const root = findProjectRoot();
  const obsDir = path.join(root, 'records', 'observations');

  let constraintResult = null;
  let pathResult = null;

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(command);
  if (constraintMatch) {
    // Side-effect imports always block
    if (constraintMatch === 'side-effect-import') {
      constraintResult = {
        decision: 'block',
        reason: 'Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.',
        constraint_type: constraintMatch,
        hard_block: true,
        command,
      };
    } else {
      // Budget check
      const budgets = readBudgets(obsDir);
      for (const budget of budgets) {
        const current = budget.current ?? 0;
        const limit = budget.budget ?? 0;
        const exhausted = current >= limit;
        const windowActive = budget.validation_window?.active === true;
        if (exhausted || windowActive) {
          constraintResult = {
            decision: 'escalate',
            reason: exhausted
              ? `Budget exhausted for constraint "${constraintMatch}".`
              : `Validation window active for constraint "${constraintMatch}".`,
            constraint_type: constraintMatch,
          };
          break;
        }
      }

      if (!constraintResult) {
        // Observation check
        const observations = readObservations(obsDir);
        const hasObservation = observations.some(
          obs => obs.status === 'active' &&
            (obs.constraint_type === constraintMatch || obs.constraint === constraintMatch)
        );

        if (!hasObservation) {
          constraintResult = {
            decision: 'block',
            reason: `Constraint "${constraintMatch}" detected in command. No active observation found. Record an observation via the constraint-gate MCP tool before proceeding.`,
            observation_required: true,
            constraint_type: constraintMatch,
            command,
          };
        } else {
          // Staleness check
          const staleness = checkObservationStaleness(observations, coordDir);
          if (staleness.stale) {
            constraintResult = {
              decision: 'escalate',
              reason: staleness.reason,
              constraint_type: constraintMatch,
              observation_id: staleness.observation_id,
              inbound_gate: true,
            };
          }
        }
      }
    }
  }

  // --- Path-write detection check ---
  const recordsPath = path.normalize(extractRecordsPath(command) || '');
  if (recordsPath) {
    if (recordsPath.startsWith('records/observations/')) {
      pathResult = {
        decision: 'block',
        reason: 'records/observations/** is blocked unconditionally',
        hard_block: true,
      };
    } else if (recordsPath.startsWith('records/evidence/')) {
      const observations = readObservations(obsDir);
      const matchingObs = observations.find(obs => pathMatchesObservation(obs, recordsPath));
      if (!matchingObs) {
        pathResult = {
          decision: 'block',
          observation_required: true,
          constraint_type: 'write-path',
        };
      } else {
        const staleness = checkObservationStaleness([matchingObs], coordDir);
        if (staleness.stale) {
          pathResult = {
            decision: 'escalate',
            reason: staleness.reason,
            observation_id: staleness.observation_id,
            inbound_gate: true,
          };
        }
      }
    }
    // Other records/** paths → allow (no pathResult)
  }

  // --- Combine results ---
  if (constraintResult?.hard_block || pathResult?.hard_block) {
    console.log(JSON.stringify(constraintResult?.hard_block ? constraintResult : pathResult));
    process.exit(2);
  }
  if (constraintResult) {
    console.log(JSON.stringify(constraintResult));
    process.exit(2);
  }
  if (pathResult) {
    console.log(JSON.stringify(pathResult));
    process.exit(2);
  }

  process.exit(0);
}

main();
