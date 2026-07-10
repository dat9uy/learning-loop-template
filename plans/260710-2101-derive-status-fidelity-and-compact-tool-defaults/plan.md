---
title: derive-status derivation fidelity + compact-by-default tool defaults
description: >-
  Two L3-hygiene workstreams from the 07-09 triage refresh. WS1 fixes
  derive_status's pure file-existence gate (symptom-file false-positives +
  path-suffix false-negatives) by reusing stripEvidenceAnchor + making
  test_passed the positive signal for mechanism-shipped (SP1/SP2 symmetry). WS2
  flips meta_state_list compact-by-default + adds a runtime_state_read compact
  mode + lower default limit (cascade of PR #45's pointer-not-dump). Ships as a
  single PR bundling both workstreams; multi-PR-per-finding revert deferred until
  meta-260709T1017Z-…-parallel-prs is fixed (no cross-PR EOF conflict).
status: in-progress
priority: P2
branch: main
tags:
  - meta-state-tools
  - mcp-tools
  - l3-hygiene
blockedBy: []
blocks: []
created: '2026-07-10T14:05:33.575Z'
createdBy: 'ck:plan'
source: skill
---

# derive-status derivation fidelity + compact-by-default tool defaults

## Overview

Two independent low-risk workstreams selected from the post-#48 triage refresh (`plans/reports/from-problem-solving-to-operator-260709-0450-rec456-shipped-next-move-findings-triage-report.md`). Both ship in one plan as **a single PR** bundling both workstreams. Multi-PR-per-finding revert (the report's hygiene practice) is deferred until `meta-260709T1017Z-…-parallel-prs` is fixed — until then, one PR avoids the append-only `meta-state.jsonl` EOF conflict class entirely (sequential two-PR shipping only moves the add/add collision to PR-B's rebase).

- **WS1 — derive_status derivation fidelity** (`meta-260710T0141Z`, escalate-adjacent, affected_system: meta-state-tools). `core/derive-status.js#computeKind` is a pure file-existence gate with two false-positive modes: (a) a *symptom-file* `evidence_code_ref` (`.gitignore`, `.mcp.json`, `manifest.json`) flips the verdict to `mechanism-shipped`/`resolve` when the mechanism is NOT shipped — this is exactly what fooled the #48 closeout; (b) a `:line-range`/`#anchor`-suffixed ref returns `code-missing`/`investigate` when the file exists. Root cause: SP1 ignores the `test_passed` signal it already collects, and calls `resolveSafePath` on the raw ref without stripping suffixes (SP2 already does both).
- **WS2 — compact-by-default tool defaults** (`meta-260704T1014Z`, affected_system: mcp-tools). The pointer-not-dump cascade (landed at the gate layer in PR #45) applied to the MCP tool-default layer: `meta_state_list` defaults `compact:false` (~85KB verbose); `runtime_state_read` defaults `limit:100` with no compact mode. Flip the defaults; add a `runtime_state_read` compact mode.

**Shared framing:** both are "the loop's self-facing tooling should be sharp, not blunt" — WS1 is *fidelity* (stop fooling itself), WS2 is *efficiency* (stop wasting its own context). Same risk class (L3 hygiene, low-risk, post-#48), different mechanisms. Do not force-fit them under one meta-pattern label.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Design Lock](./phase-01-design-lock.md) | In Progress |
| 2 | [Derive-Status Fidelity](./phase-02-derive-status-fidelity.md) | Pending |
| 3 | [Compact Tool Defaults](./phase-03-compact-tool-defaults.md) | Pending |
| 4 | [Ship and Registry Closeout](./phase-04-ship-and-registry-closeout.md) | Pending |

## Dependencies

- No cross-plan blockers. The two unfinished plans touching nearby surfaces (`260707-0812-lifecycle-status-stale-mechanism`, `260708-1216-rec12-closed-loop`) are status-collateral work, not file-overlapping with `derive-status.js` or the two tool handlers.
- **Sequencing:** Phases 2 and 3 are implemented on a single branch (disjoint files, no shared edit) and shipped as **one PR** in Phase 4. Multi-PR-per-finding revert is deferred until `meta-260709T1017Z-…-parallel-prs` is properly fixed (`.gitattributes merge=union` / post-merge logging); sequential two-PR shipping does not actually avoid the EOF class — it only moves the add/add collision to PR-B's rebase — so a single PR is the zero-conflict mitigation chosen now.

## Acceptance Criteria

- [ ] `derive_status` no longer returns `mechanism-shipped`/`resolve` from bare file existence — a passing test (`test_passed === true`) is required for `mechanism-shipped`; suffixed refs (`:line`, `:line-range`, `#anchor`) resolve to the base file.
- [ ] `meta_state_list` defaults to `compact:true`; verbose is opt-in (`compact:false`).
- [ ] `runtime_state_read` defaults to `limit:20` and supports `compact:true` (drops `metadata` + `fingerprint` blobs).
- [ ] `pnpm test` green; `pnpm fallow:gate` clean on all touched files.
- [ ] One PR resolves both `meta-260710T0141Z` and `meta-260704T1014Z`; two in-PR change-logs filed (WS1 `semantic`, WS2 `surface`). Post-merge: re-ground fingerprints for all touched source files.

## Open Questions

> All 4 resolved in Validation Session 1 (see `## Validation Log`). Summary: OQ1 → **Option B** (test must pass); OQ2 → **`investigate`**; OQ3 → **no manifest edit** (loader rewrites `tools/`→`tools/handlers/`); OQ4 → **`limit:20` + compact default**.

1. **WS1 contract change blast radius.** Requiring `test_passed === true` for `mechanism-shipped` means `meta_state_derive_status` with the default `run_tests:false` can no longer return `resolve` for existing-code findings — operators must opt into `run_tests:true` (or use `meta_state_re_verify`) to get a `resolve` recommendation. Phase 1 confirms the consumer surface (query-drift, the derive-status tool test, acceptance test) tolerates this. **Fallback (Option A):** require only that `evidence_test` *exists* (not passes) for `mechanism-shipped` — narrower blast radius but breaks SP1/SP2 symmetry. Recommend Option B; Phase 1 locks the call.
2. **WS1 `computeRecommendation` honesty.** Should `code-only` map to `investigate` (files exist, no positive evidence → investigate whether shipped) instead of the current `no_action`? Recommend yes (a live-bug finding getting `no_action` is a milder mis-lead). 1-line addition; no existing test breaks.
3. **WS2 manifest path.** `tools/manifest.json:33,35` lists `tools/runtime-state-read-tool.js` / `tools/meta-state-list-tool.js` but the files live at `tools/handlers/...`. Phase 1 confirms the resolution layer (post-Rec-5 rename) and whether the manifest needs a path edit or just the handler.
4. **WS2 `runtime_state_read` compact projection.** Drop `metadata` + `fingerprint`, keep `kind, affected_system, id, value, delta, source_ref, timestamp, status`. Confirm no consumer relies on `metadata` from the default path (callers needing it pass `compact:false`).

---

## Validation Log

### Session 1 — 2026-07-10
**Trigger:** operator `/ck:plan validate` after plan creation; pressure-test the 4 open questions + the Option A/B contract change before implementation.
**Questions asked:** 4 (config: mode=prompt, 3-8)

### Verification Results
- **Tier:** Standard (4 phases → Fact Checker + Contract Verifier, 10 claims/phase)
- **Claims checked:** 11 | **Verified:** 11 | **Failed:** 0 | **Unverified:** 0

**Verified (Fact Checker):**
- `stripEvidenceAnchor` exported at `core/gate-logic.js:636`; already used by `core/check-grounding.js:154`. `derive-status.js#checkExists:96` calls `resolveSafePath` on the raw ref (no strip) — mode (b) root cause. Reuse is a clean 2-line import.
- `test_passed` plumbed end-to-end (`meta-state-derive-status-tool.js:38-43` computes it; `derive-status.js:66` collects it into `signals`) but never passed to `computeKind` (line 70) — the dead positive-signal path.
- No circular import: `core/gate-logic.js` imports no `derive-status`.
- Both escalate findings carry `:line-range` refs (`meta-state-log-change-tool.js:102-113`, `meta-state-supersede-tool.js:52-73`) — the live re-ground is real.
- `sp1-derive-status-acceptance.test.js:42-51` calls `handler({ id })` (default `run_tests:false`), writes no test file, asserts `mechanism-shipped` + `resolve` + `drift:true` — locks the contract the finding calls buggy.

**Verified (Contract Verifier):**
- `query-drift.js:87,90,93` — `resolved-by-mechanism`, `active-uncertain`, AND `code-missing` all count as drift; `query-drift.js:129-130` already maps `active-uncertain → investigate`. So the WS1 downgrade preserves drift *detection* and is consistent with query-drift's recommendation.
- `mastra/server.js:46`: `import(\`../tools/handlers/${file.replace('tools/', '')}\`)` — the manifest's `tools/...` paths are rewritten to `tools/handlers/...` by the loader. **The manifest does NOT need editing.** Pre-resolves OQ3.
- Runtime rows carry `metadata` + `fingerprint` (sampled `runtime-state.jsonl`); `runtime-state-record-tool.js:36` confirms `metadata` schema field.

### Questions & Answers

1. **[Tradeoff/Architecture]** For `computeKind`'s `mechanism-shipped` verdict (OQ1): both Option A and B fix all currently-affected findings (none have `evidence_test`); the difference is future findings that DO carry an `evidence_test`. Which semantics?
   - Options: Option B: test must pass | Option A: test file must exist | Neither — strip fix only
   - **Answer:** Option B: test must pass
   - **Rationale:** Strongest fidelity + SP1/SP2 symmetry (check-grounding already requires test_passed); the finding's own recommendation. Operators run `run_tests:true` / `meta_state_re_verify` to get `resolve`.

2. **[Risk]** Under the chosen fix, `derive_status`'s OUTPUT `drift` field flips true→false for downgraded findings (`computeDrift` only true for `resolved-by-mechanism`), while query-drift still reports them as drift. How to handle the divergence?
   - Options: Accept divergence, flip the assertion | Extend computeDrift to count active-uncertain as drift
   - **Answer:** Accept divergence, flip the assertion
   - **Rationale:** query-drift is the drift-DETECTION source of truth; derive_status's `drift` field means strictly "resolved-by-mechanism vs raw_status". Two notions, honest separation, smallest change.

3. **[Assumptions]** (OQ2) when `computeKind` returns `code-only`, should the recommendation be `investigate` instead of `no_action`?
   - Options: Yes — investigate | No — keep no_action
   - **Answer:** Yes — investigate
   - **Rationale:** A live-bug finding getting `no_action` is a milder mis-lead; `investigate` is honest. Consistent with `query-drift.js:129-130`; verification found no downstream break.

4. **[Scope/Assumptions]** (OQ4) `runtime_state_read` defaults `limit:100`; the finding recommends `limit:20`. Lowering can silently truncate. Which?
   - Options: Lower to 20 + compact default | Keep limit:100, add compact only | Lower to 20 but keep verbose default
   - **Answer:** Lower to 20 + compact default
   - **Rationale:** Matches the finding + pointer-not-dump intent; `count` reports the full filtered total so truncation is visible; callers needing all rows pass `limit`.

### Confirmed Decisions
- **OQ1 → Option B:** `mechanism-shipped` requires `test_passed === true`. Option A rejected (kept as documented alternative only).
- **OQ2 → `investigate`:** `code-only` recommendation is `investigate` (1-line).
- **OQ3 → no manifest edit:** `server.js:46` loader rewrites `tools/`→`tools/handlers/`; WS2 edits only the two handler files.
- **OQ4 → `limit:20` + compact default:** `runtime_state_read` compact mode (drop `metadata`+`fingerprint`) + default limit lowered to 20.
- **Drift-field divergence accepted:** `sp1-derive-status-acceptance.test.js:42-51` flips 4 assertions (`mechanism-shipped`/`resolve`/`drift:true` → `code-only`/`investigate`/`drift:false`); query-drift stays the drift-detection source of truth.

### Action Items
- [ ] Phase 2: explicitly include the `drift:true → false` assertion flip in the test-flip list (Step 5) + success criteria.
- [ ] Phase 2: soften the Option A fallback risk note to "rejected alternative" (Option B locked).
- [ ] Phase 3: remove the `tools/manifest.json` "possibly modify" hedging (OQ3 resolved — not edited).
- [ ] Phase 1: reframe probes as *confirm the locked answer* (validation pre-resolved all four).

### Impact on Phases
- **Phase 1:** probes become confirmations of validation-locked answers, not open debates.
- **Phase 2:** Option B is definitive; the SP1 acceptance test's `drift:true` flip is now explicit.
- **Phase 3:** edit surface narrows to the two handler files (no manifest).
- **Phase 4:** rewritten to single-PR shipping (see Revision below).

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-design-lock.md, phase-02-derive-status-fidelity.md, phase-03-compact-tool-defaults.md, phase-04-ship-and-registry-closeout.md
- **Decision deltas checked:** 5 (OQ1→Option B / Option A rejected; OQ2→investigate; OQ3→no manifest edit; OQ4→limit:20+compact; drift-field divergence accepted)
- **Reconciled stale references:** 3 — `phase-01:53` "fall back to Option A" (→ Option B locked); `phase-04:45` dead manifest-edit conditional (→ removed); `phase-01:32` "Lock: Option A vs B" (→ "Locked: Option B")
- **Unresolved contradictions:** 0
- Notes: `plan.md` OQ bodies retain original phrasing (historical question text) — resolved by the banner + this log, not a contradiction. `phase-02:46` "drift detection is preserved" is accurate (refers to query-drift detection); the derive_status `drift`-field flip is handled explicitly in phase-02 Step 5 + success criteria.

### Revision — Single-PR Shipping (2026-07-10)
**Trigger:** operator decision — "do all phases in one PR, since we need to fix `meta-260709T1017Z-…-parallel-prs` first before allowing multiple PRs."
**Change:** two sequential PRs (PR-A + PR-B) → **one PR** bundling WS1 + WS2.
**Reason:** `meta-260709T1017Z-…-parallel-prs` is not yet fixed. Sequential two-PR shipping does not avoid the `meta-state.jsonl` EOF class — it only moves the add/add collision to PR-B's rebase (where the `git merge-file --union` recipe would be needed). A single PR is the zero-conflict mitigation.
**Trade-off:** loses per-finding code-revert granularity (cannot revert WS1 without WS2). Accepted: both changes are low-risk, disjoint-file, independently green; the two separate change-logs + findings still allow per-workstream registry resolution.
**Scope of the parallel-PRs fix:** remains a separate future workstream (the `.gitattributes merge=union` / post-merge-logging debate tied to `meta-260708T0355Z` M2 single-writer-gate) — NOT added to this plan. It unblocks multi-PR shipping for later work.
**Files updated:** plan.md (frontmatter, Overview, Dependencies, Acceptance, this Revision); phase-02/phase-03 (header + Overview PR framing); phase-04 (full rewrite to single-PR steps).

#### Whole-Plan Consistency Sweep (post-Revision)
- **Files reread:** plan.md, phase-02, phase-03, phase-04
- **Decision delta checked:** 1 (two-PR → single-PR)
- **Reconciled stale references:** 4 — plan.md frontmatter "two PRs for per-finding revert"; plan.md Overview "separate PRs"; plan.md Dependencies "ship sequentially (PR-A merge first, rebase PR-B)"; plan.md Acceptance "PR-A … PR-B …"; plus phase-02/03 "→ PR-A"/"→ PR-B" headers and phase-04 full two-PR body
- **Unresolved contradictions:** 0
- Notes: every residual `PR-A`/`PR-B`/"two sequential PRs" mention is now in the historical Validation Log body or this Revision note, both framed as the prior→current transition, not as live instructions. All live instructions (frontmatter, Overview, Dependencies, Acceptance, phase headers/Overviews, phase-04 Steps 1-6) say single PR.
