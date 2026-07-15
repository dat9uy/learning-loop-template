---
title: "Tier 1 closeout follow-ups: registry orphan semantics + union-driver hardening"
description: "Two Tier-1-closeout follow-ups. (A) Registry orphan semantics: the post-merge BLOCK validator (validate-registry-refs.js) flags 124 dangling refs (98 missing + 26 stale), but 54 are `consolidates` on IMMUTABLE change-logs (can't be patched) and 26 are stale-view targets (not corruption) — so a literal 'clean all then flip to BLOCK' is impossible. Fix = refine the validator's blocking policy (historical refs from immutable/terminal sources + stale-view → informational; only active-mutable-source missing → BLOCK), then triage + patch the residual mutable dangling refs (loop-design addresses/proposed_design_for, rule origin, finding reopens), then flip meta-state-refs-check.yml from WARN-mode to BLOCK-mode. (B) Union-driver hardening: the canonical `git merge-file --union %O %A %B` is wrong (silently drops the other side); corrected `%A %O %B` was documented this session in .gitattributes + AGENTS.md §8 but the per-clone `git config` is not committable — add a setup script + test so the merge=union payoff is real on fresh clones, and record the wrong-arg-order defect as a meta-state finding. Phase 4 is independent of 1-3."
status: completed
priority: P2
branch: "main"
tags: [meta-surface, registry, orphan-refs, validate-registry-refs, ci, merge-union, union-driver, tier1-followup]
blockedBy: []
blocks: []
created: "2026-07-15T09:15:46.009Z"
createdBy: "ck:plan"
source: skill
---

# Tier 1 closeout follow-ups: registry orphan semantics + union-driver hardening

## Overview

Two follow-ups surfaced by the Tier 1 closeout (`plans/260715-0801-change-log-stream-split-tier1/`, PR #60, resolved session 260715-1547):

**(A) Registry orphan semantics + BLOCK-mode activation.** The post-merge ref validator `tools/learning-loop-mastra/scripts/validate-registry-refs.js` (shipped WARN-mode in PR #60 via `meta-state-refs-check.yml` with `continue-on-error: true`) currently flags **124 dangling refs** across the `meta-state.jsonl` + `change-log.jsonl` union (measured 2026-07-15):

| reason | count | by source kind |
|---|---|---|
| `missing` | 98 | change-log 55 (all `consolidates`), loop-design 34 (`addresses` 33 + `proposed_design_for` 1), rule 9 (`origin`), finding 1 (`reopens`) |
| `stale` | 26 | change-log 9, loop-design 8, finding 8, rule 1 |

The validator already exempts `superseded`/`resolved` **targets** as informational. The problem: it blocks on `missing` + `stale`, but **55 `missing` are `consolidates` on immutable change-logs** (Tier 1 invariant — change-logs can't be mutated, so these refs to retired findings can never be patched) and **26 `stale` are stale-view targets** (target exists but is >7d old — a freshness signal, not ref corruption). A literal "fix all 124 then flip to BLOCK" is impossible. The fix is to refine the blocking **policy** so only real corruption blocks, then clean the residual mutable dangling refs, then flip to BLOCK. After Phase 1's policy (immutable-source + terminal-source `missing` → `historical`; `stale` → `informational`; + a `duplicate_id` guard), the residual blocking set is measured **~27** (16 active loop-design `addresses` + 1 active `proposed_design_for` + 9 active rule `origin` + 1 open finding `reopens`; 18 inactive loop-design `addresses` auto-exempt). Phase 1 step 6 is a HARD GATE that records the exact count + ids before Phase 2 begins.

**(B) Union-driver-config hardening.** The Tier 1 Phase 4 merge=union dry-run surfaced that the canonical `git merge-file --union %O %A %B` driver is **wrong** — `git merge-file` writes its result to the first arg, so the result lands in `%O` and git reads the unchanged `%A` (ours), silently dropping the other side (the data-loss `merge=union` exists to prevent). Corrected order `%A %O %B` was documented this session in `.gitattributes` (comment) + `AGENTS.md` §8, but `git config merge.union.driver` is per-clone (not committable), so the attribute is a no-op on fresh clones. Add a `tools/scripts/setup-git-merge-drivers.sh` one-time setup script + a shell test asserting the corrected driver unions both appends, and record the wrong-arg-order defect as a meta-state finding so it is not lost.

**Scope boundary:** Tier 2 (mutable stream → versioned append + jq projection) is NOT in this plan — it stays tracked by the open `meta-260715T0633Z-finding-stream-…` finding. This plan does not touch the read seam, write dispatch, or immutability guards shipped in PR #60.

**Related (non-overlapping) plans:** `260710-0104-drift-driven-registry-closeout` (open-finding status drift, not cross-ref orphans) and `260626-1734-phase-e-registry-drift-fix` (a `meta_state_consistency_check` tool + 3 audit-trail orphans) — both address different orphan classes; no file/mechanism conflict, no blocking dependency.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Validator blocking-policy refinement](./phase-01-validator-blocking-policy-refinement.md) | Pending |
| 2 | [Mutable-source dangling-ref triage and cleanup](./phase-02-mutable-source-dangling-ref-triage-and-cleanup.md) | Pending |
| 3 | [Flip refs-check to BLOCK-mode](./phase-03-flip-refs-check-to-block-mode.md) | Pending |
| 4 | [Union-driver-config hardening](./phase-04-union-driver-config-hardening.md) | Pending |

## Dependencies

- **internal order:** Phase 1 → Phase 2 → Phase 3 (semantics refine → clean residual mutable refs → flip to BLOCK once exit 0). Phase 4 is **independent** (no blockedBy on 1-3; can ship in any order or a separate PR).
- **blockedBy:** none. The Tier 1 plan (`260715-0801`) is completed; this plan consumes its outputs (the validator, the workflow, the `change-log.jsonl` split).
- **blocks:** none. Activating the post-merge BLOCK (Phase 3) closes the Tier-1 acceptance criterion that was shipped WARN-mode pending this cleanup; no downstream plan is gated on it.
- **TDD:** Phases 1 and 4 are code-bearing — tests first. Phase 2's regression gate IS the validator (run before/after). Phase 3's gate is `validate-registry-refs.js` exit 0 on the real union.

## Acceptance Criteria

- [x] `validate-registry-refs.js#computeDanglingRefs` classifies `missing` refs from immutable change-log sources as `historical` (informational, not blocking); `missing` from terminal-status sources as `historical` (`inactive` counts as terminal for `rule` + `loop-design`, NOT findings); `stale` targets as informational; only `missing` from active/open mutable sources blocks. A `duplicate_id` guard blocks on any id appearing >1 time across the union. Covered by unit tests (TDD).
- [x] `isStaleViewLike` kept (creation-age), NOT switched to canonical `isStaleView`; divergence documented in-code.
- [x] Relationships-tool `dangling_refs` divergence from the validator's `historical` bucket is documented (no refactor; flat reasons retained).
- [x] A pre-merge BLOCK gate validates new `consolidates`/`supersedes` refs on the PR's own change-log diff resolve (backstop for the post-merge source-keyed exemption).
- [x] `metaStateBatch` `update` op rejects change-log entries with `change_log_immutable` (no silent no-op).
- [x] The residual blocking set (measured ~27 per Phase 1 step 6 hard gate) is triaged and resolved: each dangling ref patched (`origin` → `""`, arrays via read→filter→verify-len→patch→re-query) or justified/exempted. Target residual: 0 blocking on the real union.
- [x] Phase 2 provenance written INCREMENTALLY per batch (`meta_state_log_change` + triage report appended as decided); a bury-by-supersede audit lists every blocking→historical reclassification with justification; recovery procedure documented.
- [x] `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` exits 0 on the live `meta-state.jsonl` + `change-log.jsonl` union.
- [x] `meta-state-refs-check.yml` flipped from WARN-mode to BLOCK-mode (`continue-on-error: true` removed), gated on a pre-flip `workflow_dispatch` whose checkout SHA matches the merged Phase 2 cleanup PR; post-flip run green.
- [x] `tools/scripts/setup-git-merge-drivers.sh` exists, sets `merge.union.driver` to the corrected `git merge-file --union %A %O %B`, idempotent, warns+exit 1 on a wrong-order existing config (no silent overwrite).
- [x] A shell test asserts: with the corrected driver, two branches from a shared base each appending a change-log line at the same EOF position merge with no conflict and BOTH lines present (driver correctness); the two fixture ids are distinct by construction (asserted at fixture-gen, not merge time); (regression) the wrong `%O %A %B` order keeps only one side.
- [x] `meta-state-refs-check.yml` has a `git config merge.union.driver` step (red-team F13 middle-ground) so ephemeral CI runners carry the corrected driver.
- [x] A meta-state finding records the canonical-wrong-arg-order defect (evidence_code_ref = `.gitattributes` or `AGENTS.md`).
- [x] `pnpm test` green; no regressions in `meta_state_relationships`, the cold-tier, or the read seam.

## Risks

- **Over-exemption masks real corruption.** Exempting immutable-source + terminal-source `missing` could hide a real typo in an active finding's `consolidated_into`. Mitigation: Phase 1 policy blocks on **active/open mutable** sources only; the `meta-260704T0443Z-meta-state-finding-categories` 30-ref cluster is immutable change-log → historical by design. Unit tests pin each branch.
- **BLOCK-mode breaks main.** If Phase 3 flips to BLOCK before the residual is truly 0, every push to main fails. Mitigation: Phase 3 gates on a green `validate-registry-refs.js` exit 0 on the real union + a manual `workflow_dispatch` run; do not flip until both pass.
- **Mutable cleanup mutates registry history.** Patching loop-design `addresses`/`proposed_design_for` arrays removes provenance. Mitigation: Phase 2 records a `meta_state_log_change` (semantic, target the affected entries) capturing what was removed and why; prefer removing only the dangling id, not the whole array; do not touch immutable change-logs.
- **Union-driver test is environment-sensitive.** The merge=union dry-run needs a configured `merge.union.driver` in the test repo. Mitigation: the test sets up its own isolated temp git repo + driver config (mirrors the session 260715-1517 dry-run); never touches the real working tree.
- **Validator/handler drift.** `validate-registry-refs.js#outboundRefsOf` mirrors `meta-state-relationships-tool.js`; a policy change here must not diverge from the interactive tool's `dangling_refs` semantics. Mitigation: Phase 1 updates both in the same commit if their blocking classification diverges; the existing same-commit comment at `validate-registry-refs.js:65` is honored.

## Out of Scope

- Tier 2 (mutable stream → versioned append + last-wins-by-max-version projection; CI advisory for same-id concurrent mutations) — tracked by `meta-260715T0633Z-finding-stream-…`.
- A CI guard that warns when `merge.union.driver` is absent/misconfigured on the runner (considered, declined — setup script + AGENTS.md §8 doc is sufficient; CI guard adds maintenance surface for a per-clone concern).
- Hard-deleting tombstones for retired findings so `missing` becomes distinguishable from "deleted without trace" — a deeper registry-integrity change, not needed for the blocking-policy fix (immutable-source exemption covers the historical case).

## Red Team Review

### Session — 2026-07-15
**Findings:** 24 raw → 14 consolidated (13 accepted, 1 accepted-with-user-decision)
**Severity breakdown:** 0 Critical, 6 High, 8 Medium
**Reviewers:** Security Adversary (Fact Checker) + Failure Mode Analyst (Flow Tracer) + Assumption Destroyer (Scope Auditor) — Standard tier (Fact Checker + Contract Verifier active for all)
**Reports:** `plans/260715-1608-.../reports/from-code-reviewer-to-planner-red-team-{security-adversary,failure-mode-analyst,assumption-destroyer}-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 rule-`origin` cleanup prescribed `null` (zod-rejected); `meta_state_patch` replaces whole arrays (no remove-element op) | High | Accept | Phase 2 |
| 2 | Relationships-tool parity is a signature refactor, not a label — accept divergence (YAGNI) + document | High | Accept | Phase 1 |
| 3 | `isStaleViewLike` diverges from canonical `isStaleView` — keep + document, remove "mirror canonical" instruction | High | Accept | Phase 1 |
| 4 | Phase 2 mid-triage session death = no provenance/recovery — incremental change-log + triage report + recovery procedure | High | Accept | Phase 2 |
| 5 | Phase 3 pre-flip `workflow_dispatch` sees stale state — merge Phase 2 cleanup to main before dispatch; confirm SHA | High | Accept | Phase 3 |
| 6 | Change-log exemption source-keyed → `supersedes` typos uncaught — add pre-merge change-log diff BLOCK gate + supersedes TDD + document backstop | High | Accept (scope +) | Phase 1 |
| 7 | Terminal-source exemption: include `inactive` for rules; bury-by-supersede audit; legacy no-status→blocking TDD | Medium | Accept | Phase 1, Phase 2 |
| 8 | No duplicate-id guard in validator union (last-write-wins masking vector) | Medium | Accept | Phase 1 |
| 9 | Phase 2 "SHA unchanged except append" criterion is a tautology → first-N-lines byte-identical + git-diff-additions-only | Medium | Accept | Phase 2 |
| 10 | Load-bearing counts off (55 `consolidates`/34 `addresses`) + residual overestimated (~27, not ≤44; 18 inactive auto-exempt) | Medium | Accept | plan.md, Phase 1, Phase 2 |
| 11 | Live-gate invariant false — `meta_state_patch`/`meta_state_log_change` are NOT live-gated (only ship_loop_design/supersede/promote_rule/dispatch are) | Medium | Accept | Phase 2 |
| 12 | Phase 4 "0 duplicate ids" not guaranteed by `git merge-file --union` — separate driver-correctness from fixture-id-uniqueness | Medium | Accept | Phase 4 |
| 13 | Phase 4 per-clone script doesn't cover ephemeral CI runners — add `git config merge.union.driver` step to `meta-state-refs-check.yml` (middle-ground; full CI guard declined) | Medium | Accept (user decision) | Phase 4 |
| 14 | `metaStateBatch` `update` op on change-log is silent no-op — add `change_log_immutable` guard (mirror `delete` op) | Medium | Accept | Phase 1 |

### Whole-Plan Consistency Sweep
**Files reread:** plan.md, phase-01-validator-blocking-policy-refinement.md, phase-02-mutable-source-dangling-ref-triage-and-cleanup.md, phase-03-flip-refs-check-to-block-mode.md, phase-04-union-driver-config-hardening.md
**Decision deltas checked:** 14
**Reconciled stale references:**
- plan.md Overview counts: 54→55 `consolidates`, 33→34 `addresses`; "≤44" residual → "~27" with the 18-inactive-auto-exempt breakdown (F10).
- plan.md acceptance criteria: added `duplicate_id` guard (F8), pre-merge change-log BLOCK gate (F6), batch `update` `change_log_immutable` guard (F14), `isTerminalSource` inactive-for-rules (F7a), `isStaleViewLike` keep+document (F3), relationships-tool divergence (F2), incremental provenance + bury-audit (F4/F7b), Phase 3 SHA-sequencing (F5), Phase 4 fixture-id separation (F12) + CI driver step (F13), rule-origin `""` (F1), live-gate correction (F11).
- Phase 1: removed "mirror canonical `isStaleView`" instruction (F3); changed relationships-tool parity from "if parity requires" to "accept divergence + comment" (F2); added `duplicate_id` guard (F8), `isTerminalSource` inactive-for-rules (F7a), legacy-no-status TDD (F7c), supersedes-from-change-log TDD (F6), batch `update` immutability guard (F14), pre-merge backstop gate (F6), step-6 hard-gate with measured ~27 (F10).
- Phase 2: rule-origin `null`→`""` + read→filter→verify-len→patch→re-query array procedure (F1/F3); incremental provenance + recovery procedure (F4); SHA→first-N-lines-byte-identical (F9); residual ~27 (F10); live-gate correction (F11); bury-by-supersede audit (F7b).
- Phase 3: added merge-cleanup-PR-before-dispatch + confirm-SHA sequencing (F5).
- Phase 4: separated driver-correctness from fixture-id-uniqueness, dropped "0 dup ids" as driver assertion (F12); added `meta-state-refs-check.yml` CI driver-config step + residual-limitation note (F13).
**Unresolved contradictions:** 0
**Post-sweep state:** no contradictions remain. Plan ready for `/ck:plan validate` or `/ck:cook`.

## Validation Log

### Session 1 — 2026-07-15
**Trigger:** Post-red-team critical-questions interview (red-team already fact-checked with file:line evidence, so the verification pass was skipped per the `## Red Team Review` guard; no `[UNVERIFIED]` tags).
**Questions asked:** 5
**Tier:** Standard

#### Questions & Answers

1. **[Architecture]** Red-team #6 added a pre-merge BLOCK gate on the PR's own change-log diff to backstop the post-merge source-keyed exemption. Where should it live?
   - Options: Harden the advisory workflow | New dedicated pre-merge workflow | No pre-merge gate (accept the hole)
   - **Answer:** Harden the advisory workflow (Recommended)
   - **Rationale:** Reuses `meta-state-pr-body-advisory.yml`'s existing path-filter + `ci-registry-deltas.sh` jq extraction; smallest blast radius; one workflow to maintain. Non-change-log diffs stay advisory.

2. **[Risks]** Red-team #3 downgraded `stale`-target refs (target open + >7d) from blocking to informational. How visible should they be?
   - Options: Silent informational | Surfaced WARN (exit 0, listed) | Keep stale blocking
   - **Answer:** Silent informational (Recommended)
   - **Rationale:** Stale-view is a freshness signal handled by `meta_state_check_grounding`/`sweep`, not this ref-corruption gate; surfacing per-ref on every green run adds noise.

3. **[Architecture]** Red-team #8 added a `duplicate_id` guard (same id >1 time across the union). Should it BLOCK or WARN?
   - Options: BLOCK (exit 1) | WARN (exit 0, listed) | No dup-id guard
   - **Answer:** BLOCK (exit 1) (Recommended)
   - **Rationale:** The last-write-wins masking vector (an appended change-log with an existing open finding's id + `status:superseded` overwrites the open entry) is a present-day integrity risk, not just Tier-2; BLOCK closes it hard. Today 0 dups, so it's dormant.

4. **[Architecture]** Phase 3 flips `meta-state-refs-check.yml` to BLOCK-mode. Should it be a REQUIRED branch-protection check (blocks merges) or a non-required red check (surfaces only)?
   - Options: Required branch-protection check | Non-required (red badge only) | Required + admin override label
   - **Answer:** Required branch-protection check (Recommended)
   - **Rationale:** A BLOCK that doesn't enforce merges is a red badge; the Tier-1 "load-bearing defense" (Red Team F4) only bites if required. Required only AFTER the post-flip green run, so an unexpected orphan doesn't halt all merges.

5. **[Tradeoffs]** Red-team #2: the validator's new `historical` bucket can't be mirrored to the interactive `meta_state_relationships` tool without a signature refactor. How should the interactive tool relate to `historical`?
   - Options: Accept divergence (YAGNI) | Refactor for parity | Diverge + filter historical out
   - **Answer:** Accept divergence (YAGNI) (Recommended)
   - **Rationale:** Avoids a signature refactor of an agent-facing MCP tool for a classification only the post-merge CI gate needs; documented in-code. Agents see `dangling_refs` flat reasons as today.

#### Confirmed Decisions
- Pre-merge change-log gate: harden `meta-state-pr-body-advisory.yml` in place (fail the change-log ref-resolution step on a new unresolved ref; non-change-log diffs stay advisory).
- `stale`-target: silent informational (exit 0, count only).
- `duplicate_id`: BLOCK (exit 1).
- Phase 3 BLOCK: required branch-protection check on main (after the post-flip green run).
- Relationships-tool: accept divergence (no refactor; `dangling_refs` shape unchanged).

#### Action Items
- [x] Phase 1: pre-merge gate spec changed from "new job or harden" to "harden `meta-state-pr-body-advisory.yml` in place" (Architecture + Related Code Files + Implementation Step 7).
- [x] Phase 3: add required-branch-protection-check step (Implementation Steps 7 + Success Criteria + Architecture enforcement note).
- (No change for Q2/Q3/Q5 — confirmed the red-team dispositions already written into the plan.)

#### Impact on Phases
- **Phase 1:** pre-merge backstop gate is now specified as hardening the advisory workflow (not a new workflow); `stale` silent-informational + `duplicate_id` BLOCK already in the success criteria.
- **Phase 3:** new step 7 makes `meta-state-refs-check` a required branch-protection check on main after the post-flip green run; new success criterion added.
- **Phase 4:** unaffected by this validation session.
- **Phase 2:** unaffected (live-gate correction, `origin:""`, incremental provenance already applied via red-team).

### Whole-Plan Consistency Sweep (post-validation)
**Files reread:** plan.md, phase-01-validator-blocking-policy-refinement.md, phase-02-mutable-source-dangling-ref-triage-and-cleanup.md, phase-03-flip-refs-check-to-block-mode.md, phase-04-union-driver-config-hardening.md
**Decision deltas checked:** 5 (Q1-Q5)
**Reconciled stale references:**
- phase-01: "a new job (or a hardening of the advisory)" → "harden `meta-state-pr-body-advisory.yml` in place" (3 locations: Architecture, Related Code Files, Step 7).
- phase-03: fixed Implementation Steps numbering collision (stale duplicate steps 4/5 from the red-team F5 edit) → clean 1-8 sequence; added required-branch-protection step 7 + success criterion + Architecture enforcement note.
**Unresolved contradictions:** 0
**Verification Results:** Claims checked: 0 (skipped — `## Red Team Review` with verification evidence present; no `[UNVERIFIED]` tags). Verified: 0 | Failed: 0 | Unverified: 0. Tier: Standard.
**Post-validation state:** no contradictions remain. Plan eligible for implementation (Failed: 0). Recommend `/ck:cook` when ready.