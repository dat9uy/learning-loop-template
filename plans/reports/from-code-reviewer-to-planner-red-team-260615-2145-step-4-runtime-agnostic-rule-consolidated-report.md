# Red-Team Review — Step 4 Plan (Consolidated)

**Plan:** `/home/datguy/codingProjects/learning-loop-template/plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/`
**Session date:** 2026-06-15
**Branch:** `260614-1259-phase-b-codegen-adoption`

## Summary

- **15 findings** (4 Critical, 8 High, 3 Medium) — **all accepted and applied**
- 4 adversarial reviewers, evidence-based with `file:line` citations
- Whole-plan consistency sweep: **zero unresolved contradictions**
- Plan is ready for `/ck:plan validate` or `/ck:cook`

## Reviewer Lenses

| Reviewer | Lens | Findings | Severity |
|----------|------|----------|----------|
| Security Adversary | Attacker | 10 | 4 High, 4 Medium, 2 Low |
| Failure Mode Analyst | Murphy's Law | 10 | 3 Critical, 3 High, 4 Medium |
| Assumption Destroyer | Skeptic | 12 | 2 Critical, 2 High, 5 Medium, 1 verified, 2 Low |
| Scope & Complexity Critic | YAGNI | 14 | 3 Critical, 4 High, 5 Medium, 2 Low |

After dedup (multiple reviewers flagged the same root cause), the unique findings count is 15.

## Applied Findings (severity-sorted)

| # | Finding | Severity | Reviewer | Applied To |
|---|---------|----------|----------|------------|
| 1 | `consult-checklist` pattern type not in `metaStateRuleEntrySchema` zod enum → rule fails to load | Critical | A + S | Phase 5 |
| 2 | Baseline test count wrong (957/958 not 949/950); all 5 projected totals off by 8 | Critical | F + A | plan.md + all phases |
| 3 | Phase 4 "no hand-rolled loops" test fails on `gate-override.js:49` (readGateOverride still has loop) | Critical | F | Phase 3 (refactor readGateOverride too) |
| 4 | Phase 4 shim-mirror test fails on `README.md` asymmetry (.claude/ has it, .factory/ doesn't) | Critical | F | Phase 4 (filter to .cjs only) |
| 5 | Path traversal in `check_runtime_agnostic.feature_path` (no containment check) | High | S + S | Phase 6 (resolveFeaturePath) |
| 6 | Phase 7 recommends direct file write of rule entry, bypassing `meta_state_promote_rule` | High | S | Phase 7 (require MCP tool) |
| 7 | Fail-open `unlinkSync` in `readModifyWriteOnAllSurfaces` allows silent file deletion | High | S | Phase 3 (opt-in removeOnNull) |
| 8 | `consult-checklist` branch is dead code: `enforcement !== "gate"` filter at `gate-logic.js:739` skips agent rules before the new branch | High | S | Phase 5 (move branch before filter) |
| 9 | Plan self-contradicts on Step 2 cleanup item 2.4 (line 132: NOT in scope; line 84/147/151: RESOLVED) | High | A | plan.md (3 → 2 items) |
| 10 | `readModifyWriteOnAllSurfaces` is per-surface atomic, not cross-surface atomic | High | F | Phase 3 (JSDoc) |
| 11 | Phase 5 no-op branch is untested; combined w/ #8 the branch is unreachable | High | S | Phase 5 (add unit test) |
| 12 | Phase 6 `check_runtime_agnostic` duplicates Phase 4 regression test logic; should share a module | High | S | Phase 4 + 6 (extract `runtime-agnostic-checklist.js`) |
| 13 | `EISDIR` DoS: `feature_path` to a directory throws uncaught from `readFileSync` | Medium | S | Phase 6 (in resolveFeaturePath) |
| 14 | `console.error` in new helpers leaks user-derived paths (PII) | Medium | S | Phase 1 + 3 (sanitize to surface + basename) |
| 15 | "5-line addition" claim is actually 7+ lines; complexity budget at `gate-logic.js:729` already over | Medium | A | Phase 5 (drop debug warning) |

## Test count cascade (corrected)

- **Baseline:** 957/958 (1 skipped) — verified by live `pnpm test` 2026-06-15
- **Phase 1:** +3 → 960/961 (surfaces-append)
- **Phase 2:** +3 → 963/964 (surfaces-read-jsonl)
- **Phase 3:** +3 → 966/967 (surfaces-rmw)
- **Phase 4:** +10 → 976/977 (runtime-agnostic)
- **Phase 5:** +1 → 977/978 (new consult-checklist test)
- **Phase 6:** +5 → 982/983 (check-runtime-agnostic-tool; was 4, +1 security test)
- **Phase 7:** 0 → 982/983
- **Final:** 982/983 (1 skipped)

**Total new tests: 25** (was 23; +1 for consult-checklist, +1 for security path-traversal).

## Whole-Plan Consistency Sweep

After applying all 15 findings, re-read `plan.md` and every `phase-*.md` file. **Zero unresolved contradictions.**

Verified:
- Test counts reconciled across plan.md and all phase files
- Cleanup items reconciled (2.1, 2.2 RESOLVED; 2.4 stays in CLEANUP)
- Per-file test counts reconciled (12 + 6 + 9 = 27)
- Phase 3 refactor scope expanded (readGateOverride too)
- Phase 5 + Phase 7 schema contract verified
- Phase 6 path security verified
- Phase 6 + Phase 4 share `core/runtime-agnostic-checklist.js`
- Phase 3 fail-open unlink now opt-in
- PII-safe logging in helpers

## Files Modified

- `/home/datguy/codingProjects/learning-loop-template/plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/plan.md` — test counts, cleanup items, Red Team Review section, Whole-Plan Consistency Sweep
- `phase-01-appendtoallsurfaces-helper.md` — test counts, PII-safe logging
- `phase-02-readjsonlfromallsurfaces-helper.md` — test counts
- `phase-03-readmodifywriteonallsurfaces-helper.md` — refactor readGateOverride too, opt-in removeOnNull, PII-safe logging, JSDoc on cross-surface atomicity, import list assertion
- `phase-04-runtime-agnostic-regression-test.md` — shim-mirror filter to .cjs only, shared CHECKLIST module reference
- `phase-05-consult-checklist-pattern-type.md` — zod enum extension, branch before filter, drop debug warning, new unit test
- `phase-06-check-runtime-agnostic-mcp-tool.md` — resolveFeaturePath, EISDIR check, security test, shared CHECKLIST import
- `phase-07-rule-entry-and-discoverability.md` — require meta_state_promote_rule, schema-aware promoted_at, change-log `added` list expanded, test counts
- `phase-08-annotate-planning-order-report.md` — "2 items" wording, "25 new tests" count, defer-to-CLEANUP note

## Out of Scope (Advisory, Not Blocking)

- Phase 8 is a 20-minute annotation; can be deferred to CLEANUP batch if preferred. (C14 / scope critic)
- Q2 follow-up (recurrence-tracker MCP-mediation) deferred to post-4-step brainstorm. (C10 / scope critic)
- `surfaces.js` import drift addressed by explicit import list assertion in Phase 3. (S10 / security)
- `promoted_by: "operator"` unverifiable; resolved by Finding 6 (MCP tool). (S9 / security)

## Next Steps

Plan is ready for `/ck:plan validate` (cheap gate) or `/ck:cook` (start implementation).

**Status:** DONE
**Concerns/Blockers:** None. All 15 findings applied; zero unresolved contradictions.
