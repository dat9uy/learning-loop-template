# Phase 01 — schema + core/handler code rename

Atomic with phases 2–3. Do not commit until 2–4 are also done.

## Files to edit

### `tools/learning-loop-mastra/core/meta-state.js`
- L281 `pattern_type` enum: `["regex","glob","resolution-evidence-required","consult-checklist"]`
  → `["regex","glob","determinism-checklist","agent-checklist"]`. Keep `.describe("Pattern language")`.
- L286 `applies_to_resolution` describe: `For pattern_type=resolution-evidence-required:` →
  `For pattern_type=determinism-checklist:`.

### `tools/learning-loop-mastra/core/gate-logic.js`
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
- Grep shows one `resolution-evidence-required` ref — update to `determinism-checklist` (likely a
  describe/comment in the cold tier; confirm exact line at edit time).

### `tools/learning-loop-mastra/core/patterns.json`
- Key `"consult-checklist"` → `"agent-checklist"` (keep its description).
- Add/rename key `"resolution-evidence-required"` → `"determinism-checklist"` with an appropriate
  description (e.g. "Resolve consult-gate; blocks meta_state_resolve when grounded evidence has
  drifted. Not a command/path match."). Check the file has a `resolution-evidence-required` key first;
  if absent, only rename `consult-checklist`.

### `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`
- L20 enum: `["regex","glob","resolution-evidence-required","consult-checklist"]` → new enum. Update
  `.describe(...)`: "resolution-evidence-required is a consult gate, not a command-path match" →
  "determinism-checklist is a resolve consult-gate, not a command-path match".
- L85/100 preview branches: `pattern_type === "regex"` / `"glob"` unchanged; any
  `=== "resolution-evidence-required"` → `"determinism-checklist"`.
- L127 `if (pattern_type === "glob")` unchanged.
- L170 `...(pattern_type === "resolution-evidence-required" && { applies_to_resolution: pattern })`
  → `"determinism-checklist"`.

### `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js`
- L89, L100 `if (rule.pattern_type !== "resolution-evidence-required") continue;` →
  `"determinism-checklist"`. (Both branches: global `applies_to_resolution === "*"` and per-finding.)
- Comments referencing the name → update.

### `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js`
- H6 gate L97 `if (rule.pattern_type === "consult-checklist")` → `"agent-checklist"`.
- L101 warning text `Add a hint referencing this rule to core/loop-introspect.js PROCESS_HINTS.` —
  unchanged (still accurate). Optionally update the gate label string if it names the pattern type.

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