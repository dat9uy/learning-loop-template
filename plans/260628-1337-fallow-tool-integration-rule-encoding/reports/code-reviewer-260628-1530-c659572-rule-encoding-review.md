# Code Review — c659572 (rule-encoding ship)

**Target:** commit `c659572b475a8bb0381b3bc585a7fe082f9fb19d` on branch `260627-1304-phase-e-mechanism-a-b-plan`
**Reviewer:** code-reviewer (manual spec-compliance + code-quality pass)
**Plan:** `plans/260628-1337-fallow-tool-integration-rule-encoding/plan.md`

## Verdict: PASS

Ship is spec-compliant, tests green, registry consistent. No blocking findings. **3 minor observations** for future hardening.

## Stage 1 — Spec Compliance

All 9 plan acceptance criteria verified against implementation:

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `meta_state_list` returns the new rule | PASS | `meta-state.jsonl:207` — `entry_kind: "rule"`, `pattern_type: "consult-checklist"`, `enforcement: "agent"`, `status: "active"`, `origin: meta-260628T1328Z-commit-6f9402e-...` |
| 2 | `core/loop-introspect.js` has 4 PROCESS_HINTS rows; 4th references rule id | PASS | Lines 117, 118, 119, 120; row 4 contains literal `rule-tool-integration-same-commit-dep` |
| 3 | `loop_describe({tier: warm})` returns `warnings: []` | PASS | H6 ordering gate satisfied via literal id substring match (loop-describe-tool.js:90-102) |
| 4 | `core/README.md` has "Tool integration checklist" section | PASS | Lines 66-75 with 3 numbered items + origin finding references |
| 5 | 3 finding entries resolved with `resolution` text pointing to rule | PASS | Lines 203, 204, 205 — all `status: "resolved"`, `resolved_by: "operator"`, `resolved_at: <iso>`, `resolution` text names rule + item id |
| 6 | Change-log has `applies_to.rules`, NO `consolidates` | PASS | `meta-state.jsonl:208` — `applies_to.rules: ["rule-tool-integration-same-commit-dep"]`, no `consolidates` field |
| 7 | `pnpm test` delta = +3 (1308 → 1311) | PASS | Test runner output: `(14 globs, 1311 tests, 24.68s)` |
| 8 | New regression test passes | PASS | `node --test __tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` → 3/3 green |
| 9 | Journal at `plans/reports/journal-260628-fallow-tool-integration-rule.md` | PASS | 31-line journal with 9 lessons + 4 followups |

**Additional compliance checks (beyond explicit acceptance criteria):**

- ✅ `affected_system: "gate-logic"` set on new rule (per Validation Q2 — patched via `meta_state_patch` after promotion)
- ✅ Loop-design entry filed with `addresses` pointing at all 3 source finding ids (per Validation Q3)
- ✅ Bootstrap script `tools/scripts/enable-operator-mode.sh` created (per Validation Q1)
- ✅ 3 source findings have `code_fingerprint` refreshed before resolution (per R-HIGH-3 — unblocks `rule-no-orphaned-evidence` consult gate)
- ✅ Hook mirror `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS` is byte-for-byte identical to `core/loop-introspect.js#PROCESS_HINTS` (cold-session-discoverability.test.cjs strictEqual-enforces parity)

**Stage 1 PASS.**

## Stage 2 — Code Quality

### Strengths

1. **Plan discipline.** All 16 red-team findings (4 Critical, 7 High, 4 Medium, 1 Info) + 4 validation answers were applied. No shortcuts taken. `meta_state_resolve` was called with proper evidence (fingerprints refreshed first), and `meta_state_promote_rule`'s known `entry_kind: "finding"` bug was caught and worked around with sed, then filed as a separate tracking finding (`meta-260628T1515Z-meta-state-promote-rule-writes-entry-kind-finding-instead-of` in unstaged meta-state.jsonl).

2. **Test design is right-sized.** Three tests cover the three failure modes:
   - (a) rule loads through schema AND is a no-op for `applyPromotedRules` (catches schema rejection + ensures consult-checklist is correctly treated as a gate-logic no-op per `gate-logic.js:762-767`)
   - (b) `PROCESS_HINTS` contains literal rule id (catches paraphrase drift that would silently break H6 ordering gate)
   - (c) Hook mirror contains literal rule id (catches forgotten mirror update)

   All three tests assert specific invariants rather than count-asserting, which is correct per R-MED-3.

3. **Path resolution is robust.** Test (c) uses `resolve(import.meta.dirname, "..", "..", "..", "..")` for PROJECT_ROOT instead of plan's relative `.factory/hooks/...`. This is an improvement over the plan's frozen shape (`require("node:fs").readFileSync(".factory/hooks/loop-surface-inject.cjs", ...)`) because it doesn't depend on test runner cwd.

4. **Hook parity is real, not aspirational.** `cold-session-discoverability.test.cjs` passes all 11 tests including `canonical PROCESS_HINTS and hook LOCAL_PROCESS_HINTS arrays match exactly (drift prevention)`. There is no "close enough" for hooks — verified at test time.

5. **Registry changes are well-structured.** Each new entry has the right shape:
   - Rule: `pattern_type: "consult-checklist"` matches `rule-pr-body-registry-deltas` + `rule-runtime-agnostic-features` precedent
   - Change-log: `applies_to.rules` instead of inventing `consolidates` (no registry precedent for it)
   - Loop-design: `addresses` points at all 3 source findings, `proposed_design_for` names the new rule

6. **Followup filing is correct.** The `meta_state_promote_rule` tool bug is filed as a separate `severity: escalate` finding (meta-260628T1515Z) — that's exactly what the journal recommends and matches the loop's pattern of "encounter a bug → work around + file finding → don't silently patch."

### Minor Observations (3)

#### O1 — Test (a) uses a description that the tool would reject
**File:** `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js:28`
**Severity:** Trivial / informational
**Issue:** Test passes `description: "Tool integration hygiene: ..."` — but per R-CRIT-3, `meta_state_promote_rule` hard-codes the description field and rejects custom descriptions. The test bypasses the tool and tests schema validation directly, which is fine, but the discrepancy is undocumented.

**Recommendation:** Either rename to `description: <auto-generated form>` for accuracy, or add a comment noting the test exercises schema acceptance independent of tool behavior. Not blocking.

#### O2 — Test (c) comment says "__dirname-relative" but uses PROJECT_ROOT-relative resolution
**File:** `gate-logic-consult-checklist-tool-integration.test.js:55-60`
**Severity:** Trivial / informational
**Issue:** Comment says "Use __dirname-relative path for portability" but the implementation uses `join(PROJECT_ROOT, ...)` which is `resolve(import.meta.dirname, "..", "..", "..", "..")` — i.e., `import.meta.dirname`-relative, not `__dirname`-relative. The two are different in ESM vs CJS contexts.

**Recommendation:** Update comment to "import.meta.dirname-relative" or just "PROJECT_ROOT-relative". Not blocking.

#### O3 — Change-log entry ID doesn't match plan diagram timestamp
**Plan:** `meta-260628T1337Z-promoted-rule-tool-integration-same-co` (per `plan.md:64` Architecture diagram)
**Actual:** `meta-260628T1452Z-meta-state-jsonl-rule-tool-integration-same-commit-dep`
**Severity:** Trivial / informational
**Issue:** The plan diagram shows a prefix matching the plan dir name (`260628-1337`), but actual creation was 1h15m later. Meta-state entry IDs are timestamp-based and reflect real creation time, not plan dir time. Not a defect — just a stale diagram.

**Recommendation:** Update `plan.md:64` Architecture to remove the speculative ID prefix or annotate it as "approximate". Not blocking.

## Final Verification

Per the verification gates protocol:

- **Tests pass:** ✅ `(14 globs, 1311 tests, 24.68s)` — full suite green
- **New regression test passes:** ✅ 3/3 tests in `gate-logic-consult-checklist-tool-integration.test.js` pass
- **Cold-session parity:** ✅ All 11 cold-session-discoverability tests pass including PROCESS_HINTS strictEqual
- **Registry parses:** ✅ `meta-state.jsonl` is valid JSONL; all entries have correct shape
- **Requirements met:** ✅ All 9 plan acceptance criteria verified
- **Bug fixed:** ✅ `rule-tool-integration-same-commit-dep` shipped; 3 source findings resolved with proper evidence
- **Tool bug surfaced:** ✅ `meta_state_promote_rule` `entry_kind: "finding"` bug worked around with sed + filed as `meta-260628T1515Z` for upstream fix

## Recommendations

1. **Ship the commit as-is.** No fixes required before landing.
2. **Track O1-O3 in a followup plan** if you want to harden the test comments and plan diagram (low priority).
3. **Prioritize the `meta_state_promote_rule` tool bug** (`meta-260628T1515Z`) — every future rule promotion will hit it until fixed. The sed workaround bypasses the write gate audit trail.

Status: DONE_WITH_CONCERNS (no blockers; 3 trivial observations + 1 deferred tool-bug followup)
