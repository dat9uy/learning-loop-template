---
phase: 1
title: "enum-and-code-rename"
status: pending
effort: ""
dependencies: [2, 3, 4]
---

# Phase 01 — schema + core/handler code rename

Atomic with phases 2–3. Do not commit until 2–4 are also done.

## Files to edit

### `tools/learning-loop-mastra/core/meta-state.js`
- L281 `pattern_type` enum: `["regex","glob","resolution-evidence-required","consult-checklist"]`
  → `["regex","glob","determinism-checklist","agent-checklist"]`. Keep `.describe("Pattern language")`.
- L286 `applies_to_resolution` describe: `For pattern_type=resolution-evidence-required:` →
  `For pattern_type=determinism-checklist:`.

### `tools/learning-loop-mastra/core/gate-logic.js`
- L617 comment `"Check if a resolution-evidence-required rule is satisfied."` → `"determinism-checklist"`.
- L719 comment `"Branch 2: existing per-finding resolution-evidence-required rules"` → `"determinism-checklist"`.
- L750 `if (rule.pattern_type === "consult-checklist")` → `"agent-checklist"`. Keep the comment
  ("Design-time rule; no command/path matching…").
- L767 `if (pattern_type === "resolution-evidence-required")` → `"determinism-checklist"`. Keep
  comment ("not a command-path match. The check happens in meta_state_resolve").
- `checkResolutionEvidence` (L652+) logic is pattern-type-agnostic (branches on `rule_id ===
  "rule-no-orphaned-evidence"` and on `subtype === "mcp-client-loading" && session_id === pattern`).
  No literal change needed there.
- `loadPromotedRules` (L587) uses generic `safeParse` — no literal change. (This is the atomicity
  constraint: after the enum rename, the 6 records must already carry the new values or they are
  warn-and-skipped. Phase 2 lands them in the same commit.)

### `tools/learning-loop-mastra/core/entry/rule.js`
- L14 `isConsultChecklist() { return parsed.pattern_type === "consult-checklist"; }` → rename method
  to `isAgentChecklist()` and value to `"agent-checklist"`.
- L17 `if (parsed.pattern_type === "consult-checklist" || parsed.pattern_type === "resolution-evidence-required")`
  → `==="agent-checklist" || ==="determinism-checklist"`.
- Update any in-file comment referencing the old names.

### `tools/learning-loop-mastra/core/loop-introspect.js`
- L469 comment `"resolution-evidence-required rules are not discoverable via command/path matching."`
  → `"determinism-checklist"` (match the new vocabulary).
- L477 `.filter((r) => r.pattern_type !== "resolution-evidence-required")` → `"!== \"determinism-checklist\""`.
  This filter is what makes `promotedRules.length === 9` (7 agent-checklist + 2 regex; the 2
  determinism-checklist records stay filtered). **Post-validation Q3:** with the 3 advisory rules
  reclassified to `agent-checklist`, the distribution shifts: 7 agent-checklist + 2 regex (gate) +
  0 glob = 9 non-determinism-checklist records returned by `listPromotedRules`.
- **PROCESS_HINTS rows 6, 7, 8** (validation Q3 — added because the 3 reclassified advisory rules
  become `agent-checklist` and trigger the H6 ordering gate's substring check on `rule.id`). Append
  3 new rows to the `Object.freeze([...])` array at line 122, in the same insertion-point style as
  the existing 5 rows. Mirror each row byte-for-byte in `.factory/hooks/loop-surface-inject.cjs`
  LOCAL_PROCESS_HINTS at lines 39-40. The cold-session parity test
  (`__tests__/legacy-mcp/cold-session-discoverability.test.cjs:359-379`) enforces byte-for-byte
  parity. Row texts (placeholder — finalize at execution time; each row MUST cite the literal rule
  id as a substring):

  - **Row #6** — `Short slug for risk records. Before creating a YAML record under
    \`records/**/risks/\`, use a short kebab-case slug (≤40 chars). Slug generators should match
    \`rule-short-slug-for-risk-records\` in \`meta-state.jsonl\`: \`sanitizeSlug\` in
    \`tools/learning-loop-mcp/record-writer.js\` is the canonical generator. Use
    \`check_record_slug\` MCP tool to verify compliance before writing.`
  - **Row #7** — `Import-chain analysis after tool deletion. When deleting a tool file or any .js
    file under \`tools/learning-loop-mcp/\`, do NOT rely on keyword matching (\`grep\` for the
    deleted file's basename). Instead, run import-chain analysis: walk all .js files, extract
    \`import\`/\`require\` statements, build a reverse map, and find files with zero live
    importers. This is the canonical dead-code detection method (replaces the keyword-based
    cleanup process). See \`rule-import-chain-analysis-after-tool-deletion\` in
    \`meta-state.jsonl\`.`
  - **Row #8** — `Assertinvariant at boundary. Every mutation operation in \`core/\` that owns an
    invariant the agent depends on (writeEntry, updateEntry, archiveEntry, deleteEntry,
    metaStateBatch) MUST be wrapped with \`assertinvariant(operation, {accept: {context, check},
    returnOnFail, root, logTo})\` from \`core/operation-invariant.js\`. The wrapper is pre-state-only;
    \`accept.context()\` is called INSIDE the lock at the call site. Use
    \`check_assertinvariant_coverage\` MCP tool to audit. See
    \`rule-assertinvariant-at-boundary\` in \`meta-state.jsonl\`.`

### `.factory/hooks/loop-surface-inject.cjs`
- Append LOCAL_PROCESS_HINTS rows 6, 7, 8 mirroring the new PROCESS_HINTS rows in
  `core/loop-introspect.js` byte-for-byte. The cold-session parity test
  (`__tests__/legacy-mcp/cold-session-discoverability.test.cjs:359-379`) enforces parity.

### `tools/learning-loop-mastra/core/patterns.json`
- **DELETE** the `"consult-checklist"` key (line 9) and any `"resolution-evidence-required"` key if
  present. They are dead code: `gate-logic.js:28-32` compiles every value in this file via
  `new RegExp(pattern)`, but the values are prose descriptions, not regex bodies — no gate pattern
  consumer reads them. `loop-introspect.js:402-407` exposes the raw keys via `listAllGatePatterns`
  (which surfaces as `gate_patterns` in warm tier); renaming would perpetuate a misleading array
  entry. If the keys are documentation, move them to a separate `patterns-legend.json` — but YAGNI:
  just delete.

### `tools/learning-loop-mastra/core/README.md`
- L68 prose `"Encoded as the \`rule-tool-integration-same-commit-dep\` consult-checklist rule (see
  \`meta-state.jsonl\`) with a corresponding \`PROCESS_HINTS\` row in \`core/loop-introspect.js\`."`
  → `"agent-checklist"`. (The rule id and PROCESS_HINTS row are unchanged; only the vocabulary
  name moves.)

### `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`
- L20 enum: `["regex","glob","resolution-evidence-required","consult-checklist"]` → new enum. Update
  `.describe(...)`: "resolution-evidence-required is a consult gate, not a command-path match" →
  "determinism-checklist is a resolve consult-gate, not a command-path match".
- L21 `.describe(...)` for `pattern` field: "Pattern string (regex body, glob path, or session_id for
  resolution-evidence-required)" → "...session_id for determinism-checklist".
- L85/100 preview branches: `pattern_type === "regex"` / `"glob"` unchanged; any
  `=== "resolution-evidence-required"` → `"determinism-checklist"`.
- L127 `if (pattern_type === "glob")` unchanged.
- L170 `...(pattern_type === "resolution-evidence-required" && { applies_to_resolution: pattern })`
  → `"determinism-checklist"`.

### `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js`
- L84 comment `"Consult resolution-evidence-required rules before resolving"` →
  `"determinism-checklist"`.
- L89, L100 `if (rule.pattern_type !== "resolution-evidence-required") continue;` →
  `"determinism-checklist"`. (Both branches: global `applies_to_resolution === "*"` and per-finding.)
- Comments referencing the name → update.

### `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js`
- L94 comment `"H6 ordering gate: every consult-checklist rule must have a PROCESS_HINTS row."` →
  `"agent-checklist"`.
- H6 gate L97 `if (rule.pattern_type === "consult-checklist")` → `"agent-checklist"`.
- L101 warning text `"H6 ordering gate: consult-checklist rule \"${rule.id}\" has no corresponding
  PROCESS_HINTS row."` → `"agent-checklist"`. (The warning string is runtime user-facing; the §5.2
  grep guard will reject it if not updated.)

### `tools/learning-loop-mastra/docs/schemas.md`
- L97 enum table row: `regex, glob, resolution-evidence-required, consult-checklist` →
  `regex, glob, determinism-checklist, agent-checklist`. (Also covered in phase-04, but it's a tool
  doc; edit here.)

## Constraints

- No behavior change. The skip/continue logic stays identical; only the matched string changes.
- Do not touch `rule-no-orphaned-evidence`'s `pattern_type` value string here — that's the registry
  (phase 2). The code matches `"determinism-checklist"`; the record must carry `"determinism-checklist"`
  after phase 2.
- `applies_to_resolution` *field name* stays (it describes the target, not the enum).

## Tests for this phase

Run `pnpm test` only after phases 2–3 (atomic). Phase-05 owns verification.