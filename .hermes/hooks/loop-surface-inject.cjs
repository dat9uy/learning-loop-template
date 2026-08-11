#!/usr/bin/env node
/**
 * Hermes Agent session-start inject adapter (pre_llm_call, first-turn only).
 *
 * Hermes' SessionStart injection equivalent: Hermes has no SessionStart
 * context-injection channel — on_session_start is an observer (stdout
 * ignored) — so the loop's discoverability surface rides the pre_llm_call
 * hook, gated to the first turn of each session (`is_first_turn: true`).
 * This mirrors the .factory adapter (`.factory/hooks/loop-surface-inject.cjs`)
 * which re-implements injection for Droid's wire instead of reusing the
 * Claude-Code inject-* hooks.
 *
 * Single-source architecture (same as the .factory adapter):
 *   - hints come from canonical core/loop-introspect.js builders (no LOCAL mirror)
 *   - counts come from cheap sync core readers (manifest.json, schemas/, registry)
 *   - NO MCP spawn — the previous loop_describe stdio handshake was a hot-path
 *     tax with no consumer.
 *
 * Output: `{"context": "<formatted block>"}` on stdout (Hermes pre_llm_call
 * context injection). Sidecar: `.hermes/session-context.json` (the Hermes
 * mirror of `.claude/session-context.json`). Fail-open: any throw emits
 * nothing and exits 0.
 *
 * To update hint content: edit core/hint-registry.js (standalone entries) or
 * the rule's `hint_text` in meta-state.jsonl (rule-derived process entries).
 * The builders in core/loop-introspect.js only project — never edit text there.
 */

'use strict';

const { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

function resolveProjectRoot() {
  return resolve(__dirname, '..', '..');
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function readToolCount(root) {
  const manifestPath = join(root, 'tools/learning-loop-mastra/tools/manifest.json');
  if (!existsSync(manifestPath)) return '?';
  const raw = readFileSync(manifestPath, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  try {
    const manifest = JSON.parse(raw);
    return Array.isArray(manifest) ? manifest.length : '?';
  } catch {
    return '?';
  }
}

function readRecordTypeCount(root) {
  const schemasDir = join(root, 'schemas');
  if (!existsSync(schemasDir)) return '?';
  try {
    return readdirSync(schemasDir).filter((f) => f.endsWith('.schema.json')).length;
  } catch {
    return '?';
  }
}

async function loadCore(root) {
  const introspect = await import(join(root, 'tools/learning-loop-mastra/core/loop-introspect.js'));
  const metaState = await import(join(root, 'tools/learning-loop-mastra/core/meta-state.js'));
  const gateLogic = await import(join(root, 'tools/learning-loop-mastra/core/gate-logic.js'));
  const { isOpen } = await import(join(root, 'tools/learning-loop-mastra/core/constants.js'));
  return { introspect, metaState, gateLogic, isOpen };
}

function writeSessionContext(root, payload) {
  const contextPath = join(root, '.hermes', 'session-context.json');
  try {
    mkdirSync(join(root, '.hermes'), { recursive: true });
    writeFileSync(contextPath, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error(`[loop-surface-inject] sidecar write failed: ${err.message}`);
  }
  return contextPath;
}

function formatBlock(counts, hints, surface) {
  const safeHints = hints ?? { discoverability_hints: [], process_hints: [], hint_index: [] };
  const lines = [
    '=== loop surface (auto-injected at first turn) ===',
    `tools: ${counts.tool_count ?? '?'}`,
    `record types: ${counts.record_type_count ?? '?'}`,
    `active rules: ${counts.rule_count ?? '?'}`,
    `active findings: ${counts.active_finding_count ?? '?'}`,
  ];
  if (safeHints.discoverability_hints.length > 0) {
    lines.push('');
    lines.push('--- discoverability_hints ---');
    for (const hint of safeHints.discoverability_hints) lines.push(hint);
  }
  if (safeHints.process_hints.length > 0) {
    lines.push('');
    lines.push('--- process_hints ---');
    for (const hint of safeHints.process_hints) lines.push(hint);
  }
  const hintIndex = safeHints.hint_index ?? [];
  if (hintIndex.length > 0) {
    lines.push('');
    lines.push('--- hint_index ---');
    lines.push('On-demand hints: fetch full text via loop_get_instruction({key}).');
    for (const entry of hintIndex) lines.push(`${entry.slug} — ${entry.suggestion}`);
  }
  lines.push('');
  lines.push('Record surface: node tools/learning-loop-mastra/bin/loop.mjs <tool> \'<json-args>\'');
  lines.push(`  Set LOOP_SURFACE=${surface} before invoking; set GATE_ROOT when reading a different repo.`);
  lines.push('MCP residue: mcp_learning_loop_* tools (workflow / storage / allowlist / audit + agent wrappers).');
  lines.push('========================================================');
  return lines.join('\n');
}

async function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }

  // Project scope guard: Hermes shell hooks are global; only inject the loop
  // surface block in sessions inside this repo.
  const projectRoot = resolveProjectRoot();
  const cwd = input.cwd ?? process.cwd();
  if (cwd && typeof cwd === 'string' && cwd !== projectRoot && !cwd.startsWith(projectRoot + '/')) {
    process.exit(0);
  }

  // First-turn gate: pre_llm_call fires every turn; only the first turn of a
  // new session is the SessionStart injection site.
  if (input.is_first_turn !== true && input.first_turn !== true) process.exit(0);

  // Escape hatch for debugging (matches the .factory adapter).
  if (process.env.LL_DISABLE_LOOP_SURFACE_INJECTION === '1') process.exit(0);

  // Guard: only fire when this surface's mcp.json declares the learning-loop
  // server (the surface is actually wired).
  const mcpCfg = readJsonSafe(join(projectRoot, '.hermes', 'mcp.json'));
  if (!mcpCfg?.mcpServers?.['learning-loop']) process.exit(0);

  const surface = mcpCfg.mcpServers['learning-loop']?.env?.LOOP_SURFACE || '.hermes';

  const toolCount = readToolCount(projectRoot);
  const recordTypeCount = readRecordTypeCount(projectRoot);
  let ruleCount = '?';
  let activeFindingCount = '?';
  let discoverability = [];
  let processHints = [];
  let hintIndex = [];

  try {
    const core = await loadCore(projectRoot);
    const { introspect, metaState, gateLogic, isOpen } = core;
    discoverability = introspect.buildDiscoverabilityHints({ tier: 'startup' });
    const entries = metaState.readRegistry(projectRoot);
    const rules = gateLogic.loadPromotedRules(projectRoot);
    ruleCount = rules.length;
    const rulesById = new Map(rules.map((r) => [r.id, r]));
    processHints = introspect.buildProcessHints({ rulesById, tier: 'startup' });
    hintIndex = introspect.buildHintIndex({ rulesById });
    activeFindingCount = entries.filter(
      (e) => e.entry_kind === 'finding' && isOpen(e),
    ).length;
  } catch (err) {
    console.error(`[loop-surface-inject] core import failed: ${err.message}`);
  }

  const contextPath = writeSessionContext(projectRoot, {
    discoverability_hints: discoverability,
    process_hints: processHints,
    hint_index: hintIndex,
    tool_count: toolCount,
    record_type_count: recordTypeCount,
    rule_count: ruleCount,
    active_finding_count: activeFindingCount,
    injected_at: new Date().toISOString(),
  });
  console.error(`[loop-surface-inject] wrote session-context to ${contextPath}`);

  const block = formatBlock(
    { tool_count: toolCount, record_type_count: recordTypeCount, rule_count: ruleCount, active_finding_count: activeFindingCount },
    { discoverability_hints: discoverability, process_hints: processHints, hint_index: hintIndex },
    surface,
  );
  if (block) console.log(JSON.stringify({ context: block }));
  process.exit(0);
}

main().catch(() => process.exit(0));
