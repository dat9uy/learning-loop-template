# Phase 03 — tests

Atomic with phases 1–2. Tests hardcode the old enum strings; they must move to the new strings in
the same commit or the suite breaks (which is the safety net catching missed source refs).

## Test files with old enum literals (from grep)

Body updates (`"consult-checklist"`→`"agent-checklist"`, `"resolution-evidence-required"`→
`"determinism-checklist"`):

- `__tests__/legacy-mcp/consult-checklist-process-hints-coverage.test.js` (7 occ)
- `__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` (5)
- `__tests__/legacy-mcp/gate-logic-consult-checklist.test.js` (3)
- `__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` (2)
- `__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js` (1)
- `core/entry/rule.test.js` (3 — incl. `isConsultChecklist` callsites → `isAgentChecklist`)
- `__tests__/legacy-mcp/gate-resolution-evidence.test.js` (resolution-evidence-required)
- `__tests__/legacy-mcp/meta-state-dispatch-ttl-and-close-flow.test.js`
- `__tests__/legacy-mcp/meta-state-promote-rule-rule-entry.test.js`
- `__tests__/legacy-mcp/meta-state-resolve-cascade.test.js`

Also: any test that constructs a rule record with `pattern_type:"consult-checklist"` or
`"resolution-evidence-required"` must use the new values (schema would reject the old on
`.parse`).

## File renames (committed — operator-approved 2026-07-14)

Rename the 5 test files for vocabulary consistency. Before `git mv`, run a safety check and only
fall back to keeping a name if a hard dependency is found (do the rest regardless).

Safety check (do first):
- Confirm the vitest config discovers tests by glob (`**/*.test.js`), not an explicit path list —
  `grep -n "test.*\\*\\|include\\|exclude" vitest.config.mjs` (or the active config). Glob discovery
  → renames are path-safe.
- `grep -rn "gate-logic-consult-checklist\\|consult-checklist-process-hints\\|gate-resolution-evidence" tools/ .factory/ .claude/` — if any *non-test* file (CI workflow, package script, another test's `import`) references these by relative path, that one reference blocks its rename.

Renames (paths under `tools/learning-loop-mastra/__tests__/legacy-mcp/` unless noted):
- `gate-logic-consult-checklist.test.js` → `gate-logic-agent-checklist.test.js`
- `consult-checklist-process-hints-coverage.test.js` → `agent-checklist-process-hints-coverage.test.js`
- `gate-logic-consult-checklist-fallow-brief.test.js` → `gate-logic-agent-checklist-fallow-brief.test.js`
- `gate-logic-consult-checklist-tool-integration.test.js` → `gate-logic-agent-checklist-tool-integration.test.js`
- `gate-resolution-evidence.test.js` → `gate-determinism-checklist.test.js`

Also `core/entry/rule.test.js` — no rename (name is already generic), only body updates.

If the safety check finds a hard path dependency for one file, keep that one filename and update
only its body; rename the other four. Record which (if any) was kept in the commit body. Do not let
one stuck rename block the other four.

## Constraints

- Do not weaken assertions to make them pass. If a test asserts behavior tied to the old name (e.g.
  "an agent-enforced rule does NOT block resolve"), keep the assertion semantically; only the string
  literal changes. `rule-no-orphaned-evidence` is now `enforcement:"gate"` — any test that asserted
  it was `agent` must update to `gate` (this is the intended decision-1 change, not a weakening).
- `rule.test.js` `isConsultChecklist()` callsites → `isAgentChecklist()`.

## Verify

After body updates + (optional) renames, run the suite in phase-05.