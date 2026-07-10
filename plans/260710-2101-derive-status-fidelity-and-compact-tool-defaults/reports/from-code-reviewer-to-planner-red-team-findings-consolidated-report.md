# Consolidated Red Team Review Report

**Plan:** `plans/260710-2101-derive-status-fidelity-and-compact-tool-defaults/plan.md`
**Reviewers:** 3 (Security Adversary + Fact Checker, Failure Mode Analyst + Flow Tracer, Assumption Destroyer + Scope Auditor)
**Tier:** Standard (4 phases, Fact Checker + Contract Verifier)
**Date:** 2026-07-10

---

## Source Reports

The three reviewers (code-reviewer subagent type with adversarial lens overrides) returned findings inline (subagent lacked Write tool). Consolidated and de-duplicated below.

- **Security Adversary** — 10 findings (1 Critical, 3 High, 5 Medium, 2 Low)
- **Failure Mode Analyst** — 9 findings (2 Critical, 2 High, 4 Medium, 1 Low)
- **Assumption Destroyer** — 8 findings (2 Critical, 4 High, 2 Medium)

After de-duplication: **15 unique findings** (3 Critical, 8 High, 4 Medium). All carried file:line evidence — evidence filter passed for all 15.

---

## Severity Tally

- **3 Critical** — load-bearing; block ship until resolved in plan
- **8 High** — substantive; resolve before merge
- **4 Medium** — notable; address in plan or follow-up

---

## Findings (de-duplicated, ranked most-severe first)

### Critical (3)

#### Finding 1 — Test blast radius under-enumerated
- **Sources:** Security Adversary #1, Failure Mode Analyst #2, Assumption Destroyer #1
- **Location:** Phase 2 Step 5; Phase 1 Probe 1
- **Flaw:** Plan names only `sp1-derive-status-acceptance.test.js:42-51` (4 assertions) as the test to flip. Grep proves ≥5 more tests lock the old `mechanism-shipped`/`resolve` contract and break under Option B.
- **Evidence:**
  - `derive-status.test.js:36-48, 87-97, 122-141, 158-169, 171-180` — assert `mechanism-shipped` / `resolve` / `drift: true` with `baseContext()` (no `test_passed`)
  - `meta-state-derive-status-tool.test.js:63-113, 92-95` — locks `mechanism-shipped` / `resolved-by-mechanism` / `drift:true` with both files existing, default `run_tests:false`
  - `meta-state-stale-flag.test.js:109-126` (T5) — asserts `re_verify`
- **Disposition:** Accept — Phase 2 Step 5 must enumerate every test to flip; Symptom-file + suffixed-ref + `test_passed:true` cases must be added.

#### Finding 2 — `runtime_state_read` `count` is the LIMIT count, not the filtered total
- **Sources:** Failure Mode Analyst #1, Security Adversary #3
- **Location:** Phase 1 Probe 4; plan.md Q4; Phase 3 Risk Assessment
- **Flaw:** Plan stated "count reports the full filtered total so truncation is visible." Code proves `count: result.length` reads the **post-`slice(0, limit)`** array.
- **Evidence:** `runtime-state-read-tool.js:60` (`result = result.slice(0, limit)`) overwrites variable; line 65 (`count: result.length`) reads sliced length. No `filteredCount` / `totalBeforeCap` field.
- **Disposition:** Accept (Critical) — Add `total` field (count BEFORE slice); revise Q4 rationale; tool description must state truncation visibility via `total > count`.

#### Finding 3 — WS1 broadens `computeKind` semantics for evidence_test-less findings
- **Sources:** Assumption Destroyer #2, Security Adversary #5
- **Location:** Phase 2 Architecture (pseudo lines 24-34); Risk Assessment; Acceptance Criteria
- **Flaw:** Plan claims WS1 closes "two surgical false-positive modes." The pseudo `if (testPassed === true) return "mechanism-shipped"` is a **third behavior change** — for findings with `evidence_code_ref` only (no `evidence_test`), current code returns `mechanism-shipped`; new code returns `code-only`. Affects ~38 registry entries.
- **Evidence:** `derive-status.js:107-112` — current fallback is `mechanism-shipped`. Plan pseudo inserts `testPassed === true` gate. Registry: `meta-state.jsonl` has 165 entries with `evidence_code_ref`, 6 with `evidence_test`.
- **Disposition:** Accept — Document broader contract change as deliberate; Phase 2 Step 5.5 captures pre/post-PR `kind` diff via `meta_state_derive_status`; append to change-log.

### High (8)

#### Finding 4 — `computeKind` call-site instruction ambiguous
- **Source:** Assumption Destroyer #3
- **Location:** Phase 2 Step 3
- **Flaw:** Step 3 says "pass `codeContext.test_passed ?? null`" without specifying position. Current call is 4-arg, new pseudo is 5-arg at position 3.
- **Disposition:** Accept — Spell out the exact replacement line with `+` diff marker in the plan.

#### Finding 5 — Phase 1 Probe 4 lacks explicit grep + pass criterion
- **Source:** Assumption Destroyer #4
- **Location:** Phase 1 Probe 4 (lines 40-41); plan.md Validation Log line 90
- **Flaw:** Plan asserts "no consumer relies on `metadata` from defaults" but provides no literal grep + no zero-matches criterion. Probe not executed.
- **Disposition:** Accept — Add literal `rg` command and zero-matches pass criterion.

#### Finding 6 — "20 matches finding" — finding said "e.g., 20" (example, not prescription)
- **Source:** Assumption Destroyer #5
- **Location:** Phase 3 Risk; plan OQ4 answer; Phase 4 Step 5
- **Flaw:** Plan repeatedly asserts "20 matches the finding." Finding text: "lower default limit (e.g., limit=20)". Triage report has no number.
- **Disposition:** Accept — Drop "matches finding" claim; ground 20 as "one page of typical exploratory output."

#### Finding 7 — `node --test` does NOT detect ESM circular imports
- **Source:** Assumption Destroyer #6
- **Location:** Phase 2 Risk Assessment
- **Flaw:** `node --test` is a test runner; ESM circular imports resolve at first static-access time. Cycles can stay latent.
- **Disposition:** Accept — Replace with concrete probe: `node -e "import('./core/derive-status.js').then(m => import('./core/gate-logic.js')).then(g => console.log('cycle check:', typeof g.stripEvidenceAnchor))"` OR `madge --circular tools/learning-loop-mastra/core/` CI check.

#### Finding 8 — PR #47 precedent misapplied
- **Source:** Security Adversary #2
- **Location:** Phase 1 Probe 1, Phase 2 Step 5, Phase 2 Risk
- **Flaw:** PR #47's flipped test was a documented bug-passthrough. `derive-status.test.js` tests lock a positive semantic contract — not a bug-passthrough. Framing as "broken behavior fix" forecloses Option A.
- **Disposition:** Accept — Reframe flips as "deliberate contract change"; keep Option A as a documented alternative for future re-debate.

#### Finding 9 — `meta_state_resolve` no operator-only authorization gate
- **Source:** Security Adversary #4
- **Location:** Phase 4 Step 5
- **Flaw:** Handler has no caller-identity check (`resolved_by: z.enum(...).default("operator")` is a label, not auth). Plan's closeout relies on this un-gated tool.
- **Disposition:** Partial Accept — Document operator-mediated requirement in Step 5; flag missing gate as known gap; generate follow-up plan.

#### Finding 10 — `meta_state_refresh_file_index` re-grounds 3 anchored findings — not enumerated
- **Source:** Failure Mode Analyst #4
- **Location:** Phase 4 Step 5
- **Flaw:** Refresh for `core/derive-status.js` re-grounds 3 anchored entries. Plan doesn't enumerate them.
- **Evidence:** `grep -c "evidence_code_ref.*derive-status\.js" meta-state.jsonl` → 3; `meta-state-list-tool.js` → 1; `runtime-state-read-tool.js` → 0.
- **Disposition:** Accept — Step 5 enumerates "this refresh re-grounds N findings (3 + 1 + 0 = 4 total)"; update Acceptance Criteria.

#### Finding 11 — `drift` field flip cascades to gate-log audit trail
- **Source:** Failure Mode Analyst #5
- **Location:** Phase 2 Step 5; Phase 4 Step 6
- **Flaw:** `meta-state-derive-status-tool.js:52` writes `drift: result.drift` to gate-log on every call. After WS1, post-merge gate-log entries for previously-shipped findings read `drift: false` — silent divergence from query-drift's `active-uncertain → drift:true`.
- **Disposition:** Accept (with follow-up) — Generate follow-up plan to either drop `drift` from gate-log write, or annotate with `source_of_truth: "query_drift"`.

### Medium (4)

#### Finding 12 — Cache invalidation order unverified
- **Source:** Security Adversary #8
- **Location:** Phase 4 Step 5/6; Risk Assessment
- **Flaw:** Plan asserts "resolve-then-refresh" ordering but doesn't trace (a) where `meta_state_query_drift` reads fingerprints, (b) whether refresh invalidates read-side cache, (c) whether resolve triggers invalidation.
- **Disposition:** Accept — Step 6 sanity sweep uses `meta_state_query_drift({ run_grounding: true })`; invalidation chain traced in Phase 1.

#### Finding 13 — `code-only → investigate` change has no consumer audit
- **Source:** Security Adversary #6
- **Location:** Phase 2 Step 4
- **Flaw:** Flips recommendation for `code-only` from `no_action` to `investigate`. Plan doesn't grep consumers branching on `no_action` for `code-only`.
- **Disposition:** Accept — Add `rg -n 'recommendation.*no_action'` step with zero-matches pass criterion.

#### Finding 14 — `stripEvidenceAnchor` doesn't handle malformed `:foo` anchors
- **Source:** Failure Mode Analyst #3
- **Location:** Phase 2 Architecture (Step 2)
- **Flaw:** Helper strips only `:digits` / `:dotted.path` / `#anchor.spaces`. `:foo` passes through unchanged → `checkExists` returns false → same bug pattern WS1 claims to close is reintroduced for non-canonical anchors.
- **Disposition:** Partial Accept (follow-up) — Pre-existing limitation; plan reuses helper as-is. Document in Phase 2 Risk Assessment; generate follow-up plan to tighten.

#### Finding 15 — `runtime_state_read` fingerprint drop is scope creep
- **Source:** Failure Mode Analyst #8
- **Location:** Phase 3 Architecture (`toCompactRow`); Probe 4
- **Flaw:** WS2 finding specifically recommended dropping `metadata` (multi-KB blob). It did NOT recommend dropping `fingerprint` (SHA-256 integrity hash).
- **Disposition:** Accept — Compact mode drops `metadata` only; retain `fingerprint` (it's a hash, not a blob).

---

## Findings NOT raised (verified safe)

- **Phase 1 Probe 3 — manifest path resolution**: Verified. `mastra/server.js:46` does `import(\`../tools/handlers/${file.replace('tools/', '')}\`)`. The manifest's `tools/runtime-state-read-tool.js` rewrites to `tools/handlers/runtime-state-read-tool.js`. No manifest edit needed.
- **Circular import (initial claim, pre-Finding 7)**: Verified. `core/gate-logic.js` imports no `derive-status.js`. `core/check-grounding.js:10` already imports `stripEvidenceAnchor` from `gate-logic.js`, mirroring the new edge. Safe.
- **Phase 2 Step 6 re-derive correctness**: Under Option B, the two escalate findings (`meta-260619T2233Z`, `meta-260626T1419Z`) correctly derive `code-only`/`investigate`. Verified against `meta-state.jsonl:148,181`.

---

## Application Summary

All 12 accepted + 2 partial-accept findings applied to plan.md + phase-01..04. Edits verified by whole-plan consistency sweep:

- **Files reread:** plan.md, phase-01 (73 lines), phase-02 (121 lines), phase-03 (53 lines), phase-04 (78 lines), plan.md (229 lines).
- **Decision deltas checked:** 15 (one per applied finding).
- **Reconciled stale references:** 0 outstanding contradictions.
- **New follow-up plans (3):** operator gate for `meta_state_resolve`; `stripEvidenceAnchor` tightening; gate-log drift annotation.
- **Plan ready for:** `/ck:plan validate {plan-directory}` → `/ck:cook {plan-path}`.

## Status

```
Status: DONE
Summary: 15 findings (3 Critical, 8 High, 4 Medium) all applied to plan files. Critical findings forced a deliberate broader contract change documented in the change-log, fixed the factually-wrong `count` truncation claim via a new `total` field, and enumerated the test-blast-radius that was originally under-counted by 5x. Three follow-up plans generated (operator gate, malformed-anchor tightening, gate-log drift annotation). Plan is ready for `/ck:cook`.
Concerns/Blockers: none.
```
