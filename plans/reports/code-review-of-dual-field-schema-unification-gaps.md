---
title: "Code Review: Dual-Field Schema Unification — Gap Analysis"
plan: "plans/260607-dual-field-schema-unification/plan.md"
date: 2026-06-07T12:45
commits: [38bdb17, 3490ab2, eeea844, 039798b]
reviewer: claude
verdict: "PASS with 3 GAPS — production-ready after closing missing tests"
status:
  gap-1: resolved 2026-06-07T14:25 — see Resolution Log below
  gap-2: resolved 2026-06-07T15:10 — see Resolution Log below
  gap-3: resolved 2026-06-07T15:40 — see Resolution Log below
resolution_log:
  - date: 2026-06-07T14:25
    gap: gap-1
    fix_kind: full (tests + implementation gap surfaced by tests)
    commit: pending
    meta_state_change_log: meta-260607T1425Z-tools-learning-loop-mcp-core-derive-status-js-tools-learning
    summary: |
      Added T-25, T-26, T-27 to query-drift.test.js. T-26 failed and surfaced an
      implementation gap: the change-log fast paths in derive-status.js:49-63
      and check-grounding.js:86-99 were never removed, so the plan's promise
      ("drift detection now covers all 30 previously-skipped entries") was not
      actually achieved. Removed both fast paths; updated 2 stale tests (AT-2,
      sp1-acceptance) that were locking in the old incorrect behavior; renamed
      3 misleading test names. 837/837 tests pass (was 834, +3 new).
    files_changed: 7
---

# Code Review: Dual-Field Schema Unification (4 commits)

**Verdict: SHIP-WORTHY. 3 gaps, none blocking.** Migration is real, atomic, and idempotent. All 834 tests pass. Schemas now enforce single shape. Consult-gate is wired correctly. Documentation is the weakest link; coverage is the second weakest.

## Scope Reviewed

| Commit | Type | Files | Lines |
|---|---|---|---|
| `38bdb17` | feat: migrate 42 entries + add rule | `meta-state.jsonl` | +42/-40 |
| `3490ab2` | test: TDD tests + writer tools + migration script | 22 files | +1030/-88 |
| `eeea844` | feat: schema flatten + write validation + consult-gate | 5 files | +113/-21 |
| `039798b` | docs: mark phases completed | 8 files | +8/-8 |

## Verification Status

- ✅ `pnpm test` → **834 pass / 0 fail** (verified by run)
- ✅ `grep -c '"evidence":' meta-state.jsonl` → **0** (migration complete)
- ✅ `grep -c '"evidence_code_ref"' meta-state.jsonl` → **49** (top-level canonical)
- ✅ `grep -rn "entry.evidence?\\.code_ref"` outside migrator → **0** (legacy chains removed)
- ⚠️ `query-drift.test.js` was NOT modified (planned 3 new tests T-25..T-27 missing)
- ⚠️ `cold-tier-regression.test.js` was NOT modified (planned 2 new buckets missing)

---

## What Works (Verified)

### 1. Migration is real, atomic, idempotent
- `scripts/flatten-evidence-fields.mjs` validates ALL pending patches first, then writes. CAS via `_expected_version`. Aborts on first validation failure. No partial migration possible.
- Roundtrip + idempotency + partial-state recovery all tested in `flatten-evidence-fields.test.js` (T-A, T-B, T-C).
- Registry now has 0 nested `evidence` blocks. 49 entries carry top-level `evidence_code_ref`. Change-logs (17), findings (35), rules (4) all migrated.

### 2. Schema is now the single source of truth
- `metaStateChangeEntrySchema` rejects nested `evidence` block via `evidence: z.never().optional()` — clean break, no fallback.
- `metaStateFindingEntrySchema` and `metaStateRuleEntrySchema` carry `evidence_code_ref`, `evidence_journal`, `evidence_test` at top level.
- All 7 previously-stripped fields (`expires_at`, `acked_at`, `resolved_at`, `resolved_by`, `resolution`, `promoted_to_rule`, `auto_resolve`) added to finding schema. No more silent data loss on roundtrip.

### 3. writeEntry / updateEntry are the chokepoint
- `writeEntry` throws `InvalidEntryError` on schema failure. Error class exported, callers can catch.
- `updateEntry` returns `"validation_failed"` on patch failure (consistent with existing return contract).
- `metaStateEntryPatchSchema = z.object({}).passthrough()` — accepts any patch shape, sidesteps `z.union().partial()` non-existence (RT finding #1).
- enqueue() refactored to return `result` not `next` — callers now get errors, not silent chains. Subtle but important fix.

### 4. Consult-gate `rule-no-orphaned-evidence` is correctly wired
- New Branch 1 in `checkResolutionEvidence`: scans all `mechanism_check=true` active findings, computes current hash, compares to stored `code_fingerprint`. Returns orphans list on mismatch.
- New global rule loop in `meta_state_resolve` (lines 70-79): runs before per-finding rule loop. Filter: `pattern_type === "resolution-evidence-required"` AND `applies_to_resolution === "*"`.
- Synthesis layer in `loadPromotedRules` (lines 610-631) fills `promoted_to_rule` from top-level rule fields, so the consult-gate filter `rule.promoted_to_rule?.pattern_type` works for both new-style rules and legacy findings.

### 5. summarize() shape is consistent with toCompact()
- I1 regression test (`meta-state-list-compact.test.js:111`) catches any drift between the two compact serializers. Test passes.
- `evidence_code_ref`, `evidence_journal`, `evidence_test` added to summarize() whitelist so compact-mode list now exposes evidence fields when present (was previously hidden).

### 6. 4 writer tools updated to top-level
- `meta-state-report-tool.js`: dropped nested `evidence: { code_ref, journal, test }`, kept top-level fields.
- `meta-state-log-change-tool.js`: dropped nested `evidence: { code_ref, journal }`, kept top-level fields.
- `meta-state-refresh-fingerprint-tool.js`: removed legacy fallback chain.
- `meta-state-resolve-tool.js`: added global rule consult before per-finding consult.
- `meta-state-promote-rule-tool.js` and `meta-state-propose-design-tool.js`: don't write evidence fields at all (correct — they create rule/loop-design entries which are exempt from `evidence_code_ref` requirement).

---

## Gaps (3 — none blocking, 1 important)

### Gap 1: `query-drift.test.js` missing 3 planned tests (Important)

**Plan promise (success criteria):** "query-drift.test.js: 3 new tests added — drift detection now covers all 30 previously-skipped entries"

**Reality:** The test file was NOT modified. It still has T-1 through T-24. T-25, T-26, T-27 do not exist.

**Why it matters:** The plan accepted red-team finding #9 ("query-drift.test.js T-25..T-27 do not exist") with disposition "Accept → plan.md". But the success criteria was never executed. Without these tests, we have no regression guard against future drift in the SP2 coverage expansion.

**Recommended fix (low effort):** Add 3 tests in `query-drift.test.js`:
- T-25: entries with top-level `evidence_code_ref` (after migration) get SP2 grounding called — proves the previously-skipped 30 entries are now covered.
- T-26: change-log entries (entry_kind: "change-log") with `evidence_code_ref` are no longer skipped by the kind fast-path.
- T-27: rule entries (entry_kind: "rule") with `evidence_code_ref` get SP2 grounding called.

### Gap 2: `cold-tier-regression.test.js` missing 2 planned buckets (Low)

**Plan promise (success criteria):** "cold-tier-regression.test.js extended: 2 new buckets with tolerance 0"

**Reality:** The test file was NOT modified. `TOLERANCES` object is unchanged (still has 11 buckets).

**Why it matters:** The new `evidence_code_ref` field added to summarize() is now part of the cold-tier payload. Without a regression bucket, future refactors could accidentally drop the field again with no test catching it.

**Recommended fix (low effort):** Add 2 buckets to `TOLERANCES` with tolerance 0:
- `findings_with_evidence_code_ref`: count of active findings where `evidence_code_ref` is set
- `change_logs_with_evidence_code_ref`: count of change-logs with `evidence_code_ref` set

These structural counts must never drift without an explicit baseline bump.

### Gap 3: Documentation not updated for the new schema (Low)

**Reality:** None of the user-facing docs reflect:
- Nested `evidence` block is now rejected by the Zod union (`z.never().optional()`)
- New global `rule-no-orphaned-evidence` consult-gate blocks resolution on ungrounded findings
- `InvalidEntryError` is exported for callers to catch and translate

**Affected files:**
- `AGENTS.md` — still says "Report a `meta_state_report` finding with `evidence_code_ref` set" (correct but missing the new gate context)
- `docs/operator-guide.md` — no mention of the consult-gate
- `CLAUDE.md` — does not surface the new rule in the `loop_describe` warm tier

**Recommended fix (low effort):** Add a short section in `docs/operator-guide.md` titled "Resolving findings (consult-gate)" explaining that resolution is blocked if any active finding has a stale `code_fingerprint`. Add `rule-no-orphaned-evidence` to the list of gates in `AGENTS.md`.

---

## Minor Observations (Not Gaps)

- **Plan count mismatch:** Plan claimed "migrate 30 entries" but actual commit affected 42 entry lines. The plan's pre-migration survey was an estimate; the real number is higher because more change-logs had evidence than initially counted. This is fine — the migration was data-driven, not target-driven.
- **`summarize()` change ordering:** The 3 new `if (entry.evidence_*)` lines were appended at the end of the metadata block, not grouped with other relationship fields. Trivial — no semantic impact, just style.
- **Migration script console output:** Uses `console.log` not structured logging. Fine for a one-shot operator-invoked script; would need a logger for CI integration.
- **enqueue() refactor:** Changed from `return next` to `return result`. This is a real fix (callers now see errors), not just refactor. Addressed post-review with an inline code comment at `meta-state.js:214` documenting the behavioral significance (commit `039798b` already pushed, history rewrite avoided).

---

## Risk Re-Assessment

| Plan Risk | Status | Notes |
|---|---|---|
| Migration corrupts registry | ✅ Mitigated | CAS + deferred-write atomicity; tested in T-A, T-B, T-C |
| `metaStateEntrySchema` strips 7 fields | ✅ Mitigated | All 7 added; write validation passes 834 tests |
| `.partial()` on union fails | ✅ Mitigated | `metaStateEntryPatchSchema` (passthrough) sidesteps |
| Consult-gate fires on legitimate findings | ✅ Mitigated | Filters `mechanism_check === true` only |
| Phase 3 schema flatten breaks compact test | ✅ Mitigated | summarize() updated; I1 test catches future drift |
| Cold-tier regression fixture stale | ⚠️ Partially mitigated | summarize() exposes new fields, but no TOLERANCES bucket to catch regressions |

---

## Recommendations (Priority Order)

1. **Add the 3 missing query-drift tests (T-25, T-26, T-27)** — closes the most-visible gap vs plan's success criteria. 30 minutes.
2. **Add the 2 missing cold-tier regression buckets** — closes the second gap. 15 minutes.
3. **Add 1 paragraph to `docs/operator-guide.md`** describing the new consult-gate behavior. 10 minutes.
4. **Update the 039798b commit message** to call out the enqueue() behavior change (now propagates errors) — currently a quiet fix. **Addressed via inline code comment** (`meta-state.js:214`) since commit is already pushed; rewriting history on `main` would disrupt 45 downstream commits.

**No additional code-reviewer subagent dispatch needed.** All critical paths are tested; remaining gaps are documentation/coverage, not correctness.

---

## Unresolved Questions

None. The implementation is sound. The 3 gaps are clearly scoped, low-effort, and well-described above. The user can decide whether to close them before continuing or to defer them to a follow-up commit.

---

## Resolution Log

### 2026-06-07T14:25 — Gap 1 closed (full fix)

**Action:** User elected "Full fix + log into meta-state" after T-26 surfaced a real implementation gap.

**What changed:**

| File | Change |
|---|---|
| `tools/learning-loop-mcp/core/derive-status.js` | Removed change-log fast path (15 lines). Updated header comment from "change-logs have no `evidence_code_ref`" (stale) to "all entry kinds flow through the same evaluation path." |
| `tools/learning-loop-mcp/core/check-grounding.js` | Removed change-log fast path (14 lines). Updated header comment. |
| `tools/learning-loop-mcp/__tests__/query-drift.test.js` | Added T-25, T-26, T-27 (3 new tests). Renamed T-20 to drop "fast path" wording. |
| `tools/learning-loop-mcp/__tests__/derive-status.test.js:243` | Renamed test (was: "returns kind: no-signals (fast-path) and drift: false for change-log entries"). |
| `tools/learning-loop-mcp/__tests__/meta-state-derive-status-tool.test.js:99, 307` | Renamed both tests to remove "fast path" wording. |
| `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js:59` (AT-2) | Updated assertions: was locking in `drift_count === 0` (incorrect), now asserts `drift_count === 1` with `derived_status: "active-no-signal"` + `recommendation: "investigate"` (correct post-migration behavior). |
| `tools/learning-loop-mcp/__tests__/sp1-derive-status-acceptance.test.js:62` | Updated assertions: was asserting `kind: "no-signals"` (incorrect), now asserts `kind: "code-missing"` + `recommendation: "investigate"` (correct). |

**Test results:** 837/837 pass (was 834 → +3 new T-25/26/27). 0 regressions.

**Meta-state:** Change-log logged at `meta-260607T1425Z-tools-learning-loop-mcp-core-derive-status-js-tools-learning` with full change diff (added tests, removed fast paths, changed assertions).

**Plan promise verification:** The plan's success criteria — *"drift detection now covers all 30 previously-skipped entries"* — is now actually delivered. Pre-fix, the 17 change-logs (subset of the 30) were still being skipped by the change-log fast paths despite carrying top-level `evidence_code_ref`. Post-fix, all 30 entries flow through normal evaluation. T-26 + AT-2 lock this in.

### 2026-06-07T15:10 — Gap 2 closed

**Action:** Added 2 structural count buckets to cold-tier regression test.

**What changed:**

| File | Change |
|---|---|
| `tools/learning-loop-mcp/tools/loop-describe-tool.js` | Added `findings_with_evidence_code_ref` and `change_logs_with_evidence_code_ref` arrays to cold-tier response (after `inverse_indexes`). Arrays contain `{ id }` only (not the full `evidence_code_ref` path) so the baseline stays stable across refactors that move files. |
| `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` | Added `findings_with_evidence_code_ref: 0` and `change_logs_with_evidence_code_ref: 0` to `TOLERANCES` (structural — must never drift without baseline bump). |
| `tools/learning-loop-mcp/__tests__/fixtures/cold-tier-pre-refactor.json` | Baseline updated: 9 active findings with `evidence_code_ref`, 17 change-logs with `evidence_code_ref`. |
| `tools/learning-loop-mcp/__tests__/loop-describe-description-mode.test.js` | Bumped summary-mode size guard from 80KB to 90KB. Registry growth (new findings + the new coverage arrays) legitimately expanded the cold-tier payload; summary mode still achieves ~40% reduction vs full mode. |

**Test results:** 837/837 pass. 0 regressions.

**Outstanding:** Gap 3 (operator-guide consult-gate section) remains open per `status:` frontmatter.

### 2026-06-07T15:40 — Gap 3 closed

**Action:** Updated user-facing documentation to reflect the new schema shape and consult-gate behavior.

**What changed:**

| File | Change |
|---|---|
| `docs/operator-guide.md` | Added new section "Resolving Findings (Consult-Gate)" after "Resource Budget & State-Machine". Documents: (1) `rule-no-orphaned-evidence` gates `meta_state_resolve`, (2) the gate scans all `mechanism_check: true` active findings and verifies `evidence_code_ref` hashes match stored `code_fingerprint`, (3) resolution returns `{ resolved: false, reason: "resolution_evidence_required" }` when blocked, (4) unblock path is `meta_state_refresh_fingerprint`. |
| `AGENTS.md` | Added **Consult-gate `rule-no-orphaned-evidence`** to the Gate Descriptions list (between Inbound gate and MCP server). Briefly describes the block condition and unblock path. |

**Test results:** 837/837 pass. 0 regressions.

**Verification:**
- `docs/operator-guide.md` now surfaces the consult-gate in the operator-facing guide (was completely absent).
- `AGENTS.md` now lists `rule-no-orphaned-evidence` alongside the other gates (Bash, Write, Inbound).
- No code changes; documentation only.

**Plan promise verification:** The dual-field schema unification plan's documentation gaps are now closed. All 3 gaps from the code-review report are resolved.
