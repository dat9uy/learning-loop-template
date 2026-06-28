# Red Team Plan Review — Security Adversary / Fact Checker

**Plan:** `plans/260628-1337-fallow-tool-integration-rule-encoding/`
**Reviewer role:** Fact Checker + Security Adversary
**Date:** 2026-06-28
**Files reviewed:** `plan.md`, `phase-01..05-*.md`

---

## Scope of Fact-Check

Sampled 50+ claims across the 5 phase files. Verified against:
- `meta-state.jsonl` (206 lines, lines 17/127/167/168 are the cited precedents; lines 203-205 are the 3 source findings)
- `tools/learning-loop-mastra/core/loop-introspect.js` (531 lines; `PROCESS_HINTS` at lines 116-120)
- `tools/learning-loop-mastra/core/README.md` (91 lines)
- `tools/learning-loop-mastra/core/meta-state.js` (`metaStateRuleEntrySchema` at line 164; `consolidated_into` docstring at lines 75-76; `consolidates` docstring at lines 140-141)
- `tools/learning-loop-mastra/core/gate-logic.js:752-767` (consult-checklist is a `continue` no-op at line 762-767)
- `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js` (schema line 25-36; category guard line 68; rule_id+id parameters line 37)
- `tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js:90-102` (H6 ordering gate, exact line 90-98)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs:366-386` (strictEqual hook mirror parity assertion)
- `.factory/hooks/loop-surface-inject.cjs` (mirror hook with `LOCAL_PROCESS_HINTS` array)
- `.github/workflows/test.yml:55-77` (real fallow CI wiring)

---

## Finding 1: PROCESS_HINTS insertion line is wrong; the new row would land on the closing `]);`
- **Severity:** High
- **Location:** Phase 2, section "Implementation Steps" step 5; also Phase 2 "Architecture" diagram and Plan "Architecture" diagram (line 66 of `plan.md`)
- **Flaw:** Plan claims "append 4th PROCESS_HINTS row at line 120" (Phase 2 step 5, plan.md line 66 says "append 4th PROCESS_HINTS row at line 120"). The actual file has:
  - `const PROCESS_HINTS = Object.freeze([` at line 116
  - 3 string rows at lines 117, 118, 119
  - `]);` (closing array literal) at line 120
  Inserting at line 120 means inserting AFTER the array is closed — the file would become syntactically broken or, more likely, the agent will attempt insertion at line 119 (between the existing 3rd row and `]);`), which contradicts the cited "line 120" claim. The plan in Phase 5 step 7 says "tools/learning-loop-mastra/core/loop-introspect.js: +1 PROCESS_HINTS row (line 120)" — same wrong line.
- **Failure scenario:** Phase 2 implementation agent reads "line 120", attempts to edit that exact line, and either (a) breaks the file by inserting after `]);` (since `const` is immutable outside the array literal), or (b) silently shifts the insertion to line 119, producing a plan-vs-actual drift in the journal. The TDD gate "PROCESS_HINTS has a row referencing the rule id" passes either way, masking the line-number discrepancy.
- **Evidence:** `tools/learning-loop-mastra/core/loop-introspect.js:116-120` (verified). `grep -n "PROCESS_HINTS\|DISCOVERABILITY_HINTS" tools/learning-loop-mastra/core/loop-introspect.js` → 95, 115, 116, 127, 136. PROCESS_HINTS array literal is at lines 116-120 inclusive.
- **Suggested fix:** Specify "append a 4th string literal to the array before line 120 (the closing `]);`); the 4th row will be at line 120, shifting the existing `]);` to line 121." Update plan.md "Architecture" diagram and Phase 2 step 5 to say "between line 119 and line 120".

## Finding 2: Hook mirror `.factory/hooks/loop-surface-inject.cjs` must be updated — plan omits this entirely
- **Severity:** Critical
- **Location:** Plan "Architecture" section, Phase 2 "Related Code Files"
- **Flaw:** Plan claims only `core/loop-introspect.js` (canonical) needs a 4th PROCESS_HINTS row. The cold-session parity test at `cold-session-discoverability.test.cjs:366-386` strictly asserts `hookProcessHints.length === canonicalProcessHints.length` via `assert.strictEqual`. The mirror hook at `.factory/hooks/loop-surface-inject.cjs` exports `LOCAL_PROCESS_HINTS` and MUST also receive a 4th row. The plan does not list this file in "Modify" or any step. This is not a hypothetical — the file exists (`./.factory/hooks/loop-surface-inject.cjs` confirmed via glob) and the test enforces equality today (line 376 strictEqual assertion).
- **Failure scenario:** Phase 2 implementation updates only `core/loop-introspect.js`. `pnpm test` runs `cold-session-discoverability.test.cjs`, the `processHints.length` assertion fails (canonical=4, hook=3), the pre-commit hook blocks the commit. The plan's own R2 ("PROCESS_HINTS array break") does not cover this — R2 only mentions missing comma/unclosed bracket. The plan's R4 in plan.md line 113 ("Cold-session discoverability test fails on new PROCESS_HINTS row") acknowledges the risk but the mitigation ("verify doesn't count-assert strictly") is factually wrong: the test DOES assert strict equality (verified at line 373-377).
- **Evidence:** `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs:366-386` — `assert.strictEqual(hookProcessHints.length, canonicalProcessHints.length, ...)` at line 373-377. The hook file `./.factory/hooks/loop-surface-inject.cjs` exists.
- **Suggested fix:** Add `.factory/hooks/loop-surface-inject.cjs` to "Modify" files; add a Phase 2 implementation step mirroring the canonical row to `LOCAL_PROCESS_HINTS`.

## Finding 3: `meta_state_promote_rule` is called with wrong parameter name (`id` should be the source finding id, not the rule id)
- **Severity:** Critical
- **Location:** Phase 2 "Implementation Steps" step 2; also "Related Code Files"
- **Flaw:** Phase 2 step 2 says:
  > Call `meta_state_promote_rule` with the frozen body... `rule_id`: `rule-tool-integration-same-commit-dep`... `enforcement`: `agent`... `pattern_type`: `consult-checklist`... `pattern`: the JSON body...
  
  This list omits the REQUIRED `id` parameter (the source finding id). The MCP tool schema at `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:25-36` requires BOTH `id` (source finding id, line 27) AND `rule_id` (new rule id, line 28). Without `id`, the handler fails at line 40 (`const entry = entries.find((e) => e.id === id);` returns `undefined`) and returns `{promoted: false, reason: "not_found"}`. Worse, the schema at line 28-32 lists 5 REQUIRED fields (id, rule_id, enforcement, pattern_type, pattern), but Phase 2 step 2 lists only 4 (rule_id, enforcement, pattern_type, pattern).
- **Failure scenario:** Operator calls `meta_state_promote_rule({rule_id: "rule-tool-integration-same-commit-dep", enforcement: "agent", pattern_type: "consult-checklist", pattern: "..."})` — tool returns `{promoted: false, reason: "not_found"}`. Operator thinks the rule already exists (per the unique-id check on line 141-154) when actually `id` was never passed. Phase 2 TDD gate "returns 1 entry with status: active" fails; no automatic detection, no remediation.
- **Evidence:** `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:27` (`id: z.string().describe("Exact entry id to promote")`), line 37 (`handler: async ({ id, rule_id, ...})`), line 40-44 (the `not_found` branch). Plan's existing precedent for `rule-runtime-agnostic-features` at meta-state.jsonl:127 has origin = `meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n` — that finding id is the `id` parameter to `promote_rule`. The plan should mirror this: `id: "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but"` (the broadest of the 3 findings, already correctly used as `origin` in Appendix A).
- **Suggested fix:** Phase 2 step 2 must add `id` to the parameter list with the source finding id. Add `id: "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but"` (matches `origin` in Appendix A). The plan already chose "broadest category: tool-integration-incomplete" as the origin — that same id is the `id` parameter for promote_rule.

## Finding 4: Plan claims "rule-tool-integration-same-commit-dep is `active`" via `meta_state_list` query; the new rule doesn't exist yet at Phase 2 verification step
- **Severity:** High
- **Location:** Phase 2 step 3, Phase 4 step 1
- **Flaw:** Phase 2 step 3 verifies the rule was promoted via `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})`. Phase 4 step 1 pre-condition also checks this. The plan correctly sequences: promote first, then verify. But Phase 4 step 1's wording "from Phase 2" is correct. However, the bigger gap: the plan never checks `meta_state_resolve` actually transitions finding 203/204/205 from active → resolved. The Phase 4 step 5 verification `meta_state_list({entry_kind: "finding", id: [...]})` returns the entry, but does not assert the `resolved_by: "operator"` field was set (the MCP tool schema doesn't require it). Phase 4 step 6's `consolidates` is on the change-log entry, NOT the findings. So Phase 4 succeeds even if `resolved_by` is missing.
- **Failure scenario:** `meta_state_resolve` accepts the call but only sets `status: "resolved"` + `resolved_at`; the agent later auditing the registry sees `resolved_by: null` (a recurrence of finding meta-260623T1458Z's pattern, see meta-state.jsonl:169 for the exact precedent). The plan's success criterion "All 3 finding entries have `status: resolved`, `resolved_by: operator`, `resolved_at: <iso>`, finding-specific `resolution` text" requires `resolved_by: operator` but the implementation step never confirms the tool actually sets this. The tool schema at `tools/learning-loop-mastra/tools/legacy/meta-state-resolve-tool.js` was not grepped in plan — I checked the prompt for `meta_state_resolve` and no step validates the `resolved_by` field post-call.
- **Evidence:** Phase 4 implementation steps 2-4 only pass `resolution` and `resolved_by: 'operator'` as INTENT, but step 5 verification only checks `status: resolved`. The plan's R3 mitigation says "standard operator resolution path works" — but the path is unverified.
- **Suggested fix:** Phase 4 step 5 should explicitly assert `resolved_by: "operator"` AND `resolved_at` is present (not null) for all 3 entries. Add to the verification step: `assert.strictEqual(entry.resolved_by, "operator")`.

## Finding 5: Plan describes `meta-260622T1708Z-...` (line 158) as "resolved-by-promotion format" but the entry is `status: "superseded"`
- **Severity:** High
- **Location:** `plan.md` line 31 and Phase 4 "Overview" (Critical callout); References line 139
- **Flaw:** Plan claims "The canonical 'encoded as rule-X' pattern is `resolved` with the rule id named in the resolution string (precedent: `meta-260622T1708Z-...` line 158)." This is a factual misread of meta-state.jsonl:158. The entry is actually:
  ```
  "status":"superseded","mechanism_check":false,"expires_at":"2026-06-23T10:08:28.223Z",
  "acked_at":null,"resolved_at":null,"resolved_by":null,"version":4,
  "superseded_at":"2026-06-23T07:54:32.632Z","superseded_by":"operator",
  "consolidated_into":"meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan",
  "resolution":"rule-pr-body-registry-deltas promoted; PROCESS_HINTS split shipped; CI advisory in place."
  ```
  The entry is `status: "superseded"`, NOT `status: "resolved"`. Its `resolution` text says "rule-pr-body-registry-deltas promoted" (so the precedent does name the rule in resolution text), but it uses the `superseded` + `consolidated_into` mechanism, NOT the `resolved` mechanism the plan claims. This contradicts the plan's own Critical callout in Phase 4: "use `status: resolved` + `resolution` text, NOT `status: superseded` + `consolidated_into: rule-...`."
- **Failure scenario:** Plan's rationale for using `resolved` instead of `superseded` cites a precedent that actually uses `superseded`. The plan contradicts its own citation. An auditor reading both will find the design rationale ungrounded. Worse, the meta-state schema at `core/meta-state.js:75-76` says: "For status='superseded' entries: the id of the change-log entry that is the canonical source." The plan correctly avoids `superseded` for findings (since the schema enforces `consolidated_into` must point to a change-log), but cites a `superseded` finding as the precedent for `resolved` — the opposite mechanism.
- **Evidence:** `meta-state.jsonl:158` (full entry shown above; verified via grep). The plan's own Phase 4 Critical callout says: "consolidated_into targets change-log entries per core/meta-state.js:140-141" (verified at lines 75-76 and 140-141 in `core/meta-state.js`).
- **Suggested fix:** Drop the `meta-260622T1708Z-...` precedent. Either (a) find an actual `status: "resolved"` finding with a rule-id in `resolution` text (none exists per my grep of 50+ findings), or (b) reframe the design decision: "no precedent exists for `resolved`+rule-id-in-resolution; we're establishing a new pattern because the canonical `superseded`+`consolidated_into` requires the rule_id to actually be a change-log id, which a rule entry is not."

## Finding 6: Test file claims to import `PROCESS_HINTS` from `core/loop-introspect.js` — verify export
- **Severity:** Medium
- **Location:** Phase 5 step 2 (the test file's frozen shape); Step 5 "3 tests"
- **Flaw:** Phase 5 step 2 imports `PROCESS_HINTS` directly: `import { PROCESS_HINTS } from "../../core/loop-introspect.js";`. But `core/loop-introspect.js` does NOT export `PROCESS_HINTS`. The file has:
  - `const DISCOVERABILITY_HINTS = Object.freeze([...])` at line 95 — not exported as a binding
  - `const PROCESS_HINTS = Object.freeze([...])` at line 116 — not exported as a binding
  - `export function buildDiscoverabilityHints() { return DISCOVERABILITY_HINTS; }` at line 126-128
  - `export function buildProcessHints() { return PROCESS_HINTS; }` at line 135-137
  
  The import `import { PROCESS_HINTS } from ...` will fail with `SyntaxError: The requested module ... does not provide an export named 'PROCESS_HINTS'`. The precedent test `gate-logic-consult-checklist.test.js` correctly imports `metaStateRuleEntrySchema` and `applyPromotedRules` (both exported), but never imports `PROCESS_HINTS` directly.
- **Failure scenario:** Phase 5 test file is created with the planned imports. `node --test` reports `SyntaxError`. The Phase 5 TDD gate fails immediately. The Phase 5 step 8 risk "if it fails, the error message identifies the field" does not cover this import-time failure (it's a module load error, not a field error).
- **Evidence:** `tools/learning-loop-mastra/core/loop-introspect.js:95, 116, 126-128, 135-137` (only `buildDiscoverabilityHints` and `buildProcessHints` are exported). `__tests__/legacy-mcp/gate-logic-consult-checklist.test.js:1-4` (precedent does NOT import `PROCESS_HINTS`).
- **Suggested fix:** Change the test import to `import { buildProcessHints } from "../../core/loop-introspect.js";` and call `const PROCESS_HINTS = buildProcessHints();` at the top of the test file. Update the test assertions to use the local constant.

## Finding 7: Test count claim "1308 → 1309 (+1)" is unverifiable and inconsistent with the plan's own description
- **Severity:** Medium
- **Location:** Plan acceptance criterion: "pnpm test passes with net delta = +1 test (1308 → 1309)"; Phase 5 success criteria
- **Flaw:** Plan asserts `pnpm test` test count = 1308 currently, will become 1309 after the new file. The change-log at meta-state.jsonl:206 (the 9ed520d ship entry) says "1308 tests pass" — so 1308 is consistent with the current state. The plan claims the new test file adds 3 tests (Phase 5 "Architecture" diagram), but the delta is "1308 → 1309 (+1)". This is internally inconsistent: adding 3 tests should produce delta = +3, not +1. Either the test file is described wrong (only 1 test) or the delta is wrong.
- **Failure scenario:** Operator runs `pnpm test`, sees delta = +3 (matching the 3 tests in the planned file). The plan's success criterion "delta = +1" fails. Operator has to choose between believing the count or the plan.
- **Evidence:** Phase 5 step 2 lists 3 tests: (a) rule loads through schema, (b) rule is no-op for applyPromotedRules, (c) PROCESS_HINTS row count is 4. Phase 5 "Architecture" diagram says "3 tests". Success criteria say "+1 test (1308 → 1309)". Self-contradictory.
- **Suggested fix:** Change success criterion to "1308 → 1311 (+3 tests)" or reduce the test file to 1 test that covers all 3 assertions.

## Finding 8: `origin` field in Appendix A references a `meta-260628T1328Z-commit-6f9402e-...` finding whose `category` allows promotion, but the tool's category guard checks the SOURCE finding
- **Severity:** Medium
- **Location:** Phase 2 step 2 implicit; Appendix A `origin: "meta-260628T1328Z-commit-6f9402e-..."`
- **Flaw:** Plan correctly identifies `meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but` as the source for promotion. The `meta_state_promote_rule` handler at line 67-78 enforces `entry.category !== "loop-anti-pattern"` returns `category_must_be_loop_anti_pattern`. The finding's category is `loop-anti-pattern` (verified at meta-state.jsonl:203: `"category":"loop-anti-pattern"`). Promotion is allowed. However, this only works because the plan picked the right source finding. If the agent picks the wrong `id` (per Finding 3, the plan omits `id` entirely), the tool rejects with `not_found` (line 42-44), not `category_must_be_loop_anti_pattern`. The plan's "Verify pre-conditions" step (Phase 4 step 1) checks the rule is active — it should ALSO check the source finding's category is `loop-anti-pattern`.
- **Failure scenario:** If the agent substitutes a different source finding (e.g., one of the other 2 source findings), all 3 are `loop-anti-pattern` so the guard passes — no risk here. But the plan's omission of `id` parameter (Finding 3) is the real risk; this finding documents the secondary check that's missing from the pre-conditions.
- **Evidence:** `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:67-78` (category guard), `meta-state.jsonl:203-205` (all 3 findings are `category: "loop-anti-pattern"`).
- **Suggested fix:** Add to Phase 2 step 1 pre-condition verification: assert source finding's `category === "loop-anti-pattern"` before calling `promote_rule`.

## Finding 9: `meta_state_promote_rule` sets source finding `status: "active"` (not `superseded`), which contradicts plan's "Phase 2 does not touch the 3 source findings"
- **Severity:** Medium
- **Location:** Plan Architecture section (claims only meta-state.jsonl gets a new rule entry, no mutation of findings); Phase 2 "Related Code Files"
- **Flaw:** Plan claims Phase 2 only appends 1 rule entry to meta-state.jsonl. But the `meta_state_promote_rule` handler at line 178-179 ALSO calls `updateEntry(root, id, { status: "active" })` — this UPDATES the source finding's status (or sets it to active if not already). All 3 source findings are already `status: "active"` (verified at meta-state.jsonl:203-205), so the update is a no-op for status, but it WILL increment the finding's `version` field (per the version-bumping logic in updateEntry). The plan's Architecture diagram shows the 3 source findings untouched in Phase 2; they will in fact be touched (version bump).
- **Failure scenario:** A code reviewer comparing the diff will see `version` increment on lines 203/204/205 in meta-state.jsonl after Phase 2. The plan says these stay untouched. The change-log entry written in Phase 4 won't mention this side effect. Reviewer flags drift.
- **Evidence:** `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:178-179` (`await updateEntry(root, id, { status: "active" })`). `meta-state.jsonl:203` already has `"status":"active"`.
- **Suggested fix:** Update Plan Architecture diagram and Phase 2 description: "Phase 2 appends 1 rule entry AND bumps version on the source finding (id=meta-260628T1328Z-commit-6f9402e-...)". The change-log in Phase 4 should mention this side effect in `change_diff.changed`.

## Finding 10: Plan's reference to `core/loop-introspect.js:120` is wrong — `PROCESS_HINTS` array ends at line 120 (the `]);`), so "line 120" is the closing brace, not a row insertion point
- **Severity:** Medium
- **Location:** Plan references list line 142 ("PROCESS_HINTS row at `core/loop-introspect.js:120`"); Phase 2 Architecture diagram line 24-27
- **Flaw:** Plan's reference list at line 142 cites `core/loop-introspect.js:120` as the PROCESS_HINTS row location. The actual `PROCESS_HINTS` rows are at lines 117, 118, 119 (3 rows), with the array literal closing `]);` at line 120. So line 120 is the closing bracket, not a row. The reference is structurally wrong — it implies the 3rd existing row is at line 120 when it's actually at line 119. This is the same factual issue as Finding 1, but in a different surface (References list vs Implementation step).
- **Failure scenario:** Operator uses the References list as a navigation aid. Looks for `core/loop-introspect.js:120` expecting to find a PROCESS_HINTS row; finds `]);` instead. Minor confusion; not blocking.
- **Evidence:** `tools/learning-loop-mastra/core/loop-introspect.js:116-120` (PROCESS_HINTS array is 5 lines: opening + 3 rows + closing).
- **Suggested fix:** Correct the reference to `core/loop-introspect.js:119` for the existing 3rd row, or omit the specific line number and say "PROCESS_HINTS array, lines 116-120".

---

## Verifications Confirmed

The following plan claims were VERIFIED against the codebase:

1. Rule id regex `/^rule-[a-z0-9-]+$/` matches `rule-tool-integration-same-commit-dep` — VERIFIED (id conforms to all-lowercase, no uppercase, no underscores; matches `core/meta-state.js:166` regex).
2. `pattern_type: "consult-checklist"` is a valid Zod enum value — VERIFIED (`core/meta-state.js:169`).
3. `applyPromotedRules` treats `consult-checklist` as a no-op (returns `{decision: "ok"}` for any input) — VERIFIED (`core/gate-logic.js:762-767`).
4. H6 ordering gate exists at `tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js:90-98` with exact text "H6 ordering gate: consult-checklist rule ... has no corresponding PROCESS_HINTS row" — VERIFIED.
5. The 3 source finding ids are real, `loop-anti-pattern` category, `status: "active"`, at meta-state.jsonl:203-205 — VERIFIED.
6. `core/meta-state.js:140-141` `consolidates` field targets finding ids (comma-separated) — VERIFIED.
7. `rule-runtime-agnostic-features` precedent at meta-state.jsonl:127 matches the JSON-encoded pattern shape exactly (same field names `version`, `items`, `id`, `description`) — VERIFIED.
8. `rule-pr-body-registry-deltas` precedent at meta-state.jsonl:167 also matches the shape — VERIFIED. Both precedents use the same `pattern: "{\"version\":1,\"items\":[...]"` format.
9. `gate-logic-consult-checklist.test.js` precedent correctly mirrors `metaStateRuleEntrySchema.parse(...)` → `applyPromotedRules(...)` → `assert.deepStrictEqual(result, { decision: "ok" })` shape — VERIFIED.
10. The .github/workflows/test.yml fallow CI wiring at lines 55-77 confirms the fallow integration is real (not speculative) — VERIFIED. This validates the source findings' factual content.
11. `.fallowrc.json` exclusion of `__tests__/legacy-mcp/**` is consistent with the plan's claim that the new test file won't trip the fallow dead-code gate — VERIFIED (cited in core/README.md:53).
12. Plan's claim that `meta_state_promote_rule` writes via MCP tool (not direct write) matches the write gate's behavior — VERIFIED (write gate blocks direct meta-state.jsonl writes; only MCP tools mutate).
13. `core/loop-introspect.js` does NOT export `PROCESS_HINTS` directly (only via `buildProcessHints()` builder) — VERIFIED (Finding 6 evidence).

---

## Summary

The plan has 2 Critical defects (Finding 2: missing hook-mirror update; Finding 3: missing `id` parameter for `meta_state_promote_rule`), 3 High defects (Finding 1: wrong line for PROCESS_HINTS insert; Finding 4: missing resolved_by verification; Finding 5: precedent cites a superseded finding as proof for resolved pattern), and 4 Medium defects (Findings 6-10). The plan's overall design (single consult-checklist rule, PROCESS_HINTS row, README section, 3 finding resolutions + 1 change-log) is sound and aligns with existing precedents. The defects are concentrated in (a) Phase 2 (parameter name, hook mirror omission, line numbers) and (b) Phase 5 (import shape, test count math). All Critical and High defects are fixable with single-step edits to the affected phase files.

Status: DONE_WITH_CONCERNS
Summary: Plan's design is sound but has 2 Critical defects (hook mirror missing, `id` param omitted from promote_rule call) and 3 High defects (PROCESS_HINTS line, resolved_by verification, precedent misread). All blockers are fixable in-plan.
Concerns/Blockers: Finding 2 will cause `pnpm test` to fail in CI even if Phase 2 completes successfully (cold-session-discoverability.test.cjs strictEqual assertion). Finding 3 will cause Phase 2 `meta_state_promote_rule` call to return `not_found` on first attempt. Recommend fixing both before approving the plan.
