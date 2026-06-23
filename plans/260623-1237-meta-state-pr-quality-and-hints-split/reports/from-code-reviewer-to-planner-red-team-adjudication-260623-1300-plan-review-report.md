# Red Team Adjudication — Meta-state PR-quality + Hints Split Plan

**Plan:** `plans/260623-1237-meta-state-pr-quality-and-hints-split/`
**Date:** 2026-06-23
**Reviewers:** 4 (Security Adversary + Failure Mode Analyst + Assumption Destroyer + Scope & Complexity Critic)
**Total findings (raw):** 43
**After dedupe + evidence filter:** 15
**Severity breakdown:** 2 Critical, 8 High, 5 Medium (15 cap)

## Evidence Filter Applied

All 15 findings have `file:line` evidence from the codebase. No fabricated citations survived adjudication.

## Adjudicated Findings

### Critical (2)

**C1: `loop_get_instruction` slug break after Phase 3 ships**
- **Reviewer:** Assumption Destroyer
- **Location:** Phase 3, step 7; loop-get-instruction-tool.js:21,55-72
- **Flaw:** `HINT_KEY_MAP["pnpm-test-discipline"] = 16`. After Phase 3 splits the array into 16 + 1+, `buildDiscoverabilityHints()` returns indices 0-15 only. Lookup returns `undefined` → handler returns "Unknown hint key". Every agent calling `loop_get_instruction({key: "pnpm-test-discipline"})` breaks.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Concrete evidence; breaks production lookup.

**C2: Citation repair races the registry**
- **Reviewer:** Failure Mode Analyst
- **Location:** Phase 2 steps 4-5; meta-state.js:486-525
- **Flaw:** Two sequential `meta_state_patch` calls. If finding 1's patch succeeds and finding 2's CAS fails, registry is half-repaired. No rollback path. `meta_state_batch` (atomic, single-cache-invalidation) is available.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Atomic batch is documented capability; same applies for partial-failure rollback.

### High (8)

**H1: `meta_state_patch` does not validate journal file existence**
- **Reviewer:** Assumption Destroyer (+ Security Adversary + Failure Mode)
- **Location:** Phase 2 §6 (verification); meta-state-patch-tool.js:41-130
- **Flaw:** Plan rates as "very low" risk but verification only re-reads registry field, not filesystem. Operator typo or moved file leaves citation broken — same bug Phase 2 is fixing.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Adds `fs.existsSync` check before patch; trivially correct.

**H2: `HINT_SUGGESTIONS` parallel array not in plan**
- **Reviewer:** Assumption Destroyer
- **Location:** loop-get-instruction-tool.js:24-42; cold-session-discoverability.test.cjs:392-399
- **Flaw:** Parallel array of length 17. Test asserts `HINT_SUGGESTIONS.length === canonicalHints.length`. After Phase 3, length mismatch causes test failure.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Coupled with C1; both must be addressed together.

**H3: Cold-session parity test claim contradicts actual test**
- **Reviewer:** Assumption Destroyer + Failure Mode + Scope Critic
- **Location:** cold-session-discoverability.test.cjs:365-389; Phase 3 RED step 3
- **Flaw:** Test uses parameterized `parseFrozenStringArray` helper, not a hardcoded regex. Plan's "extend regex" framing is fictitious.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Rewrite RED step 3 with correct test mechanics.

**H4: Phase 4 fork PR base ref failure**
- **Reviewer:** Failure Mode Analyst
- **Location:** Phase 4 workflow YAML; test.yml:30 reference
- **Flaw:** `git fetch origin $GITHUB_BASE_REF` fails on fork PRs. Existing `test.yml` doesn't try this.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Real failure mode; needs `repository:` token + base-checkout pattern.

**H5: PR-body section trivially bypassable with empty headers**
- **Reviewer:** Security Adversary
- **Location:** Phase 4 step 8
- **Flaw:** Exact-match grep for `## Swept entries` doesn't verify content. Empty section header bypasses warning.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Add content-length invariant.

**H6: Phase 5 ordering unenforced at registry layer**
- **Reviewer:** Failure Mode Analyst
- **Location:** Phase 5 preamble; meta_state_promote_rule
- **Flaw:** Plan claims "strict ordering" but no registry-level gate prevents promoting a rule before `PROCESS_HINTS` ships.
- **Disposition:** **Accept** (High-confidence)
- **Rationale:** Add runtime assertion or schema-level check.

**H7: Plan should split into 2 PRs**
- **Reviewer:** Scope Critic
- **Location:** Plan "Why atomic fixup"
- **Flaw:** Plan 1b's atomicity precedent doesn't apply here — no resolved registry entry being re-opened. Both findings in `reported` status with TTL already expired (2026-06-23T10:08Z / 10:13Z).
- **Disposition:** **ASK USER** — high-impact structural decision
- **Rationale:** Plan 1b's atomicity argument was driven by C1 Critical TaskUpdate re-open; this plan has 2 first-of-kind findings, no resolved entry to re-open. Splitting is feasible.

**H8: Phase 4 7-category bash+jq parser is YAGNI**
- **Reviewer:** Scope Critic
- **Location:** Phase 4 script design
- **Flaw:** PR body is the source of truth (per Phase 5's rule). 80-120 line bash+jq parser with 7 RED tests creates maintenance burden for an advisory that doesn't enforce anything. `git diff --stat` + `grep` on `+` lines is enough.
- **Disposition:** **ASK USER** — coupled with M5 (other-patches item) and parser scope decision
- **Rationale:** Cuts Phase 4 from ~1h to ~15min. Trade-off: less granular categorization in step summary.

### Medium (5)

**M1: CI emits raw content without markdown escape** (Security Adversary #4)
- **Disposition:** **Accept** — add markdown-escape function + RED test for `<script>` payload.
- **Rationale:** Real XSS vector in `$GITHUB_STEP_SUMMARY`.

**M2: Plan claims "11 mutating tools"; actual is 16-22** (Assumption Destroyer #1 + Failure Mode #7)
- **Disposition:** **Accept** — recount and update claim.
- **Rationale:** Factual drift; affects parser scope.

**M3: PROCESS_HINTS text duplicates enforcement metadata** (Assumption Destroyer #5 + Security Adversary #3)
- **Disposition:** **Accept** — replace enforcement-shape duplicate with `See rule-pr-body-registry-deltas in meta-state.jsonl`.
- **Rationale:** Per hint #9 ("don't duplicate content across surfaces").

**M4: PR #8 merge SHA unverified** (Security Adversary #1 + Scope Critic #10)
- **Disposition:** **Accept** — Phase 1 step 5 must verify SHA via `git log --merges`; remove the unverified claim from the plan.
- **Rationale:** Retrospective review file (option b) is invalidated by unverified SHA.

**M5: Phase 5 `other-patches` rule item is YAGNI** (Scope Critic #4)
- **Disposition:** **Coupled with H8** — drops if parser simplified; keeps otherwise.
- **Rationale:** Routine fingerprint refreshes shouldn't require PR-body enumeration.

### Low (capped, not in final 15)

L1-L3 from reviewers were deduped or subsumed by higher-severity findings.

## Recommended Actions (priority order)

1. **Apply C1, C2, H1-H6, M1-M4 as straightforward fixes** (all high-confidence, evidence-backed).
2. **Ask user on H7** (split into 2 PRs?) and **H8** (simplify parser?).
3. **Whole-plan consistency sweep** after accepted findings are applied.
4. **Append `## Red Team Review` section to plan.md.**

## Unresolved Questions

1. H7: Does Plan 1b's atomicity precedent (rejected splitting) apply here? Plan 1b's C1 was a re-open; this plan has 2 unresolved findings.
2. H8: If parser is simplified, does Phase 5's rule still need the 7-category taxonomy? Or can it reference the simplified step summary?
3. Should the 2 source findings be `meta_state_ack`'d (extending TTL) before Phase 5 promotion, given their TTL is already expired?