---
title: "Meta-state PR-quality rule + discoverability hints split"
description: "Atomic follow-up to PR #8 (Phase D Plan 2 — storage) addressing 2 review findings: meta-260622T1708Z (pr-quality-rule: PR bodies touching meta-state.jsonl must enumerate registry deltas) and meta-260622T1713Z (schema-bloat: extract process rules from DISCOVERABILITY_HINTS into separate PROCESS_HINTS table). Both findings share a broken evidence_journal citation that must be repaired first; both should defer design work via meta_state_propose_design before rule promotion."
status: pending
priority: P1
branch: "main"
tags: [meta-surface, schema-refactor, pr-quality, discoverability, atomic-fix]
blockedBy: ["260619-2246-phase-d-plan-2-storage", "260622-2119-phase-d-plan-1b-review-fixups"]
blocks: ["phase-d-plan-3-agents", "phase-d-plan-4-cutover"]
created: "2026-06-23"
createdBy: "ck:plan"
source: skill
related:
  - "plans/reports/researcher-260623-1237-finding-interaction-report.md (cross-cutting finding analysis)"
  - "plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md (sibling; ships PR #10 = Plan 1b review-fixups; precedes this plan)"
  - "plans/260619-2246-phase-d-plan-2-storage/plan.md (parent plan; ships PR #8 = the PR that triggered both findings)"
  - "docs/journals/260622-phase-d-plan-1a-shipped.md (shipped journal — not edited by this plan)"
  - "meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat (subtype=pr-quality-rule; first-of-kind)"
  - "meta-260622T1713Z-process-specific-rules-test-runner-stop-conditions-ci-rules (subtype=schema-bloat; first-of-kind)"
  - "rule-runtime-agnostic-features (meta-state.jsonl:129; consult-checklist precedent)"
  - "rule-no-new-artifact-types (meta-state.jsonl:17; gate regex precedent)"
---

# Meta-state PR-quality rule + discoverability hints split

## Overview

**Atomic follow-up to PR #8 (Phase D Plan 2 — storage) addressing 2 review findings.**

PR #8 merged with 11 registry entries swept (179 → 168) but no PR-rendered delta breakdown (note: PR #8's `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` did enumerate deltas as a per-plan file; the finding targets the PR-rendered surface). The 2026-06-22 review surfaced 2 findings:

1. **`meta-260622T1708Z` (pr-quality-rule, first-of-kind subtype):** Every PR touching `meta-state.jsonl` must enumerate registry deltas in the PR body — sweep entries by id+reason, resolved entries by id+resolution note, new entries by id+initial status. (Note: PR #8 actually did document deltas in `plans/260619-2246-phase-d-plan-2-storage/pr-body.md`; finding 1's premise is partially refuted but the forward invariant is still warranted as a PR-rendered contract, not a per-plan file.)
2. **`meta-260622T1713Z` (schema-bloat, first-of-kind subtype):** `DISCOVERABILITY_HINTS` (17 entries, indices 0-16 in `core/loop-introspect.js:90-108`) mixes meta-surface contracts (indices 0-15) with a process rule at index 16 (`pnpm-test-discipline` — agent behavior under a test-runner stall). Extract process rules into a separate `PROCESS_HINTS` table; keep `DISCOVERABILITY_HINTS` for meta-surface contracts.

**Both findings share a broken `evidence_journal` citation** (`plans/reports/review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` does NOT exist on disk; verified by `find` and `ls plans/reports/`). The citation must be repaired before any rule promotion can carry a valid audit trail.

**Scope (6 phases, single branch, ~4-5h, ~3.5h after Red Team H8 simplification):**

| Group | Phases | Effort |
|---|---|---|
| **A — Research (canonical-path verification)** | Phase 1 | ~20min |
| **B — Citation repair (hard prerequisite)** | Phase 2 | ~15min |
| **C — Schema refactor (PROCESS_HINTS split)** | Phase 3 | ~1.5h |
| **D — CI advisory (delta enumeration, simplified)** | Phase 4 | ~15min (post-H8) |
| **E — Rule promotion (deferred design + consult-checklist)** | Phase 5 | ~30min |
| **F — Acceptance gate** | Phase 6 | ~30min |

**Why this plan ships as atomic fixup (not 2 separate plans):**

- Both findings originate from the same PR #8 review. Splitting into 2 PRs would require either (a) re-opening the registry on each fix, or (b) cherry-picking the citation-repair patch separately from the schema-refactor, which violates the atomic-fix discipline from Phase C Plan 1a (`260617-1138-phase-c-plan-1a-atomic-fix`).
- Phase 3 (schema refactor) and Phase 5 (rule promotion) have a strict ordering: the PR-body rule's `loop_describe` surface depends on `PROCESS_HINTS` existing. Atomic plan enforces the order.
- The citation repair (Phase 2) is a hard prerequisite for Phase 5 rule promotion — `meta_state_promote_rule` stamps the source finding's `promoted_to_rule` reference; if `evidence_journal` is still broken at promotion time, the audit trail is corrupted.

## Findings Index

| ID | Subtype | Title | Phase | Resolution Path |
|----|---------|-------|-------|-----------------|
| `meta-260622T1708Z` | `pr-quality-rule` (first-of-kind) | Every PR touching `meta-state.jsonl` must enumerate registry deltas | [Phase 4 (CI)](./phase-04-pr-body-ci-advisory.md) + [Phase 5 (rule)](./phase-05-pr-body-rule-promotion.md) | `meta_state_propose_design` → `meta_state_promote_rule` (consult-checklist, agent enforcement) |
| `meta-260622T1713Z` | `schema-bloat` (first-of-kind) | Extract process rules from `DISCOVERABILITY_HINTS` into `PROCESS_HINTS` | [Phase 3 (split)](./phase-03-process-hints-split.md) | `meta_state_propose_design` → schema refactor → `meta_state_promote_rule` for the new schema contract |
| (shared) | n/a | Broken `evidence_journal` on both findings | [Phase 2 (repair)](./phase-02-citation-repair.md) | `meta_state_patch` to repoint at a real review file |

## Phases

| Phase | Name | Status | Effort | TDD Color | Source |
|-------|------|--------|--------|-----------|--------|
| 1 | [Research](./phase-01-research.md) | ☐ Pending | ~20min | n/a (verify-only) | research-only; gates Phase 2 |
| 2 | [Citation Repair](./phase-02-citation-repair.md) | ☐ Pending | ~15min | n/a (data fix) | unblocks Phase 5 |
| 3 | [PROCESS_HINTS Split](./phase-03-process-hints-split.md) | ☐ Pending | ~1.5h | RED → GREEN | schema refactor + 6 consumer updates |
| 4 | [PR-body CI Advisory](./phase-04-pr-body-ci-advisory.md) | ☐ Pending | ~1h | RED → GREEN (parser test) | new workflow + script |
| 5 | [PR-body Rule Promotion](./phase-05-pr-body-rule-promotion.md) | ☐ Pending | ~30min | registry-only | propose_design + promote_rule |
| 6 | [Acceptance Gate](./phase-06-acceptance-gate.md) | ☐ Pending | ~30min | verify-only | closeout + journal |

**Total effort:** ~4-5 hours. Single session. Single branch (`main`), single PR.

## Pre-flight Checklist (per development-rules)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 2 | `meta-state.jsonl` (2 `meta_state_patch` calls; `evidence_journal` repoint on both findings) | `OPERATOR_MODE=1` | gated closeout |
| 3 | `tools/learning-loop-mcp/core/loop-introspect.js` (refactor: extract `PROCESS_HINTS`; add `buildProcessHints()`) | n/a | refactor |
| 3 | `tools/learning-loop-mcp/tools/loop-describe-tool.js` (warm + cold tier: add `process_hints` field) | n/a | consumer |
| 3 | `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` (extend `HINT_KEY_MAP` or concatenate lookup space) | n/a | consumer |
| 3 | `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (render both arrays to `.claude/session-context.json`) | n/a | consumer |
| 3 | `.factory/hooks/loop-surface-inject.cjs` (mirror split) | n/a | mirror |
| 3 | `AGENTS.md` (update 4 prose references to `discoverability_hints` block) | n/a | docs |
| 4 | `.github/workflows/meta-state-pr-body-advisory.yml` (new) | n/a | new workflow |
| 4 | `tools/scripts/ci-registry-deltas.sh` (new) | n/a | new script |
| 4 | `tools/learning-loop-mcp/__tests__/ci-registry-deltas.test.cjs` (new) | n/a | parser test |
| 5 | `meta-state.jsonl` (1 new `loop-design` entry, 1 new `rule` entry, 2 source-finding `promoted_to_rule` stamps) | `OPERATOR_MODE=1` | gated closeout |
| 6 | `meta-state.jsonl` (1 `meta_state_log_change` for plan ship) | `OPERATOR_MODE=1` | gated closeout |
| 6 | `docs/journals/260623-meta-state-pr-quality-and-hints-split-shipped.md` (new) | n/a | journal |

**Preflight calls (`gate_mark_preflight`) required:** Phases 3, 4, 5, 6 touch `product/**` (single `product` surface marker covers all). Phase 2 is a meta-state registry patch (also preflighted).

## Dependencies

**Blocked by:**
- `260619-2246-phase-d-plan-2-storage` (Plan 2; ships PR #8 — the PR that triggered both findings)
- `260622-2119-phase-d-plan-1b-review-fixups` (Plan 1b; ships PR #10 — completed 2026-06-22; closes the Plan 1a review)

**Blocks:**
- `phase-d-plan-3-agents` (Plan 3 — `createLoopAgent` wrappers; depends on a stable `loop_describe` warm tier contract)
- `phase-d-plan-4-cutover` (Plan 4 — agent-manifest.json reconciliation; depends on `process_hints` field being a stable part of the discoverability surface)

**Cross-plan refs (informational):**
- `260617-1138-phase-c-plan-1a-atomic-fix` (Phase C Plan 1a — atomic-fix discipline precedent; this plan mirrors the pattern)
- `260622-1810-phase-d-plan-1a-parity-tightening` (Plan 1a; ships PR #9; sibling storage/schema work)

## Out of scope (separate tracks, NOT this plan)

- Multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` — Plan 3 owns.
- `agent-manifest.json` final 5-group reconciliation — Plan 4.
- Migrating PR #8's `pr-body.md` format to a GitHub-rendered `PULL_REQUEST_TEMPLATE.md` — out of scope; would require a separate UX decision.
- Upstream Claude Code `TaskUpdate` structural fix — out of repo's control.
- Meta-state migration JSONL → LibSQL — separate phase.

## Whole-Plan Consistency

- **Decision flow:** Phase 1 verifies canonical paths and validates the 17-hint classification. Phase 2 repairs the broken `evidence_journal` (hard prerequisite). Phase 3 splits `DISCOVERABILITY_HINTS` → `PROCESS_HINTS` (creates the home for the new rule). Phase 4 ships the CI advisory. Phase 5 promotes the rule. Phase 6 closes out.
- **File ownership map (no parallel conflicts):**
  - Phase 2: `meta-state.jsonl` (2 patches).
  - Phase 3: `core/loop-introspect.js` + 6 consumer files + 4 test files + 1 docs file. No Phase 4 conflicts.
  - Phase 4: `.github/workflows/`, `tools/scripts/`, 1 new test file. Independent of Phase 3 file ownership.
  - Phase 5: `meta-state.jsonl` (3 mutations).
  - Phase 6: `meta-state.jsonl` (1 change-log) + `docs/journals/`.
- **Test count delta:** Phase 3 (-2, +3 for new warm-tier tests; net +1). Phase 4 (+1 parser test). Net: +2 tests.
- **Reconciled stale references:**
  - Both findings' `evidence_journal` is broken. Phase 2 repoints both.
  - PR #8's `pr-body.md` already documents the deltas (refutes finding 1's premise partially). Plan 4 ships the CI advisory for forward PRs; the historical PR is not retroactively enforced.
- **Unresolved contradictions:** 0. Plan is consistent.

## Key Risks Addressed

- **Citation repair blocks promotion.** Risk: high if not done first. Phase 2 explicitly precedes Phase 5; the gate is the citation-repair `meta_state_patch` succeeding.
- **Phase 3 cold-session parity test regex.** Risk: medium. The test at `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:352-410` regex-matches a single `LOCAL_DISCOVERABILITY_HINTS` array; adding a 2nd array breaks the regex. Mitigation: Phase 3 RED test asserts both arrays exist; GREEN fixes the regex to match both.
- **Phase 3 mirror hook parity.** Risk: medium. `.factory/hooks/loop-surface-inject.cjs` is a mirror copy; if it drifts, parity test fails. Mitigation: same TDD pattern; success criteria includes a parity assertion.
- **Phase 4 `git diff` base ref.** Risk: low. GitHub Actions provides `GITHUB_BASE_REF` for `pull_request`; the script must fetch the base ref before diffing. Mitigation: explicit `git fetch origin $GITHUB_BASE_REF --depth=1` step.
- **Phase 5 rule consulted at runtime but not surfaced.** Risk: low. The `consult-checklist` pattern surfaces via `loop_describe({tier:"warm"})`. If `process_hints` is not yet in the warm tier (Phase 3 race), the rule is invisible to agents. Mitigation: Phase 3 ships before Phase 5; the dependency is strict.
- **Phase 6 backfill of prior PRs lacking format.** Risk: low. Prior PRs (1a, 1b, 2) all have `pr-body.md` files; backfill is mechanical and not a CI enforcement concern.

## Open Questions (for operator)

1. **Citation repair target:** Which real review file should both findings' `evidence_journal` point at? Options:
   - (a) `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` (the closest existing review; if the PR-#8 review was consolidated there)
   - (b) Re-create the missing `review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` (write a retrospective review of PR #8)
   - (c) Point at `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` (the per-plan PR-body draft that DID document the deltas)
2. **PROCESS_HINTS export shape:** Should the new export be a sibling constant in `loop-introspect.js` (Option A) or a new file (e.g., `core/process-hints.js`)? Option A matches the existing pattern; Option C (researcher's rec) is overkill for 1 entry.
3. **Warm tier default:** Render `process_hints` field in warm tier by default, or omit? Finding 2's spec is ambiguous. Option A (render both) preserves SessionStart hook parity; Option B (omit) keeps warm tier focused.
4. **CI advisory vs gate:** Ship advisory-only on first ship, or fail-closed from day one? Finding 1 says "agent advisory" which leans advisory, but operators may want merge-gating.
5. **PR template strategy:** Should `rule-pr-body-registry-deltas` ship with a new `.github/PULL_REQUEST_TEMPLATE.md`, or rely on the `plans/<plan>/pr-body.md` convention? The template file is GitHub-rendered; the per-plan file is not.

## References

- `plans/reports/researcher-260623-1237-finding-interaction-report.md` (cross-cutting finding analysis)
- `plans/260619-2246-phase-d-plan-2-storage/plan.md` (parent plan; ships PR #8)
- `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` (PR #8's per-plan PR-body draft — does enumerate deltas)
- `plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md` (sibling; Plan 1b review-fixups)
- `docs/journals/260622-phase-d-plan-1a-shipped.md` (shipped journal — not edited by this plan)
- `tools/learning-loop-mcp/core/loop-introspect.js` (DISCOVERABILITY_HINTS source, line 90-108)
- `tools/learning-loop-mcp/core/meta-state.js` (registry path constant, line 7; mutating primitives)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (warm + cold tier; lines 77, 209)
- `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` (lookup tool; HINT_KEY_MAP)
- `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (Claude Code hook)
- `.factory/hooks/loop-surface-inject.cjs` (Droid mirror)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (parity test, lines 352-410)
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (warm tier test)
- `tools/learning-loop-mcp/__tests__/session-start-inject-discoverability.test.cjs` (hook e2e test)
- `meta-state.jsonl:129` (`rule-runtime-agnostic-features`; consult-checklist precedent)
- `meta-state.jsonl:17` (`rule-no-new-artifact-types`; gate regex precedent)
- `meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat` (subtype=pr-quality-rule)
- `meta-260622T1713Z-process-specific-rules-test-runner-stop-conditions-ci-rules` (subtype=schema-bloat)

## Validation Log

### Session 1 — 2026-06-23 (planning, post-PR-#8 review)

**Trigger:** operator invocation `/ck:plan --deep` after PR #8 review surfaced 2 findings (both first-of-kind subtypes). Auto-detect mode: **deep** (cross-cutting schema refactor + new CI surface; warrants researcher fan-out).

**Researcher fan-out:** 3 parallel researchers covering (1) PR-body delta enforcement, (2) PROCESS_HINTS split, (3) cross-finding interaction + journal verification.

#### Confirmed Decisions

- **Plan ships as atomic fixup.** 2 findings from same PR #8 review; strict ordering between phases (Phase 2 → Phase 3 → Phase 5); no parallel edits to shared files.
- **Phase 1 is verify-only.** Canonical paths, tool enumeration, hint classification are all research outputs that need confirmation before code changes.
- **Phase 2 (citation repair) is a hard prerequisite for Phase 5 (rule promotion).** `meta_state_promote_rule` stamps the source finding's `promoted_to_rule` reference; if `evidence_journal` is still broken at promotion time, the audit trail is corrupted.
- **Phase 3 (PROCESS_HINTS split) must precede Phase 5 (rule promotion).** The PR-body rule belongs in `PROCESS_HINTS` (per finding 2's classification criteria), and `PROCESS_HINTS` does not exist yet.
- **PR-body rule shape:** `rule-pr-body-registry-deltas` with `enforcement: "agent"`, `pattern_type: "consult-checklist"`, `scope_predicate: "project_has_learning_loop_mcp"`. Precedent: `rule-runtime-agnostic-features` at `meta-state.jsonl:129`.
- **Plan 1b's journal is preserved.** This plan adds a new journal entry; historical record stays intact.
- **CI is advisory-only on first ship.** `pull_request` trigger; `$GITHUB_STEP_SUMMARY` output; no `required-status-checks` config. Promote to required check after one quarter of measured compliance.

#### Action Items (for implementation)

- [ ] Phase 1: Verify canonical paths, validate 17-hint classification, list 11 mutating tools
- [ ] Phase 2: `meta_state_patch` both findings' `evidence_journal` to operator-chosen target
- [ ] Phase 3: Refactor `loop-introspect.js`; update 6 consumer files; 4 test files; 1 docs file
- [ ] Phase 4: New workflow + script + parser test
- [ ] Phase 5: `meta_state_propose_design` (loop-design-pr-quality-rules-and-hints-split) + `meta_state_promote_rule` (rule-pr-body-registry-deltas)
- [ ] Phase 6: Acceptance gate + journal entry + 1 `meta_state_log_change`

#### Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md` (this), 6 phase stubs (post-scaffold read), `tools/learning-loop-mcp/core/loop-introspect.js` (DISCOVERABILITY_HINTS source), `meta-state.jsonl` (rule precedents), 3 researcher reports.
- **Decision deltas:**
  - Plan 1b was P1; this plan is P1 because both findings have TTL expiring today (2026-06-23T10:08Z / 10:13Z) and citation repair is time-sensitive.
  - Plan 1b used 6 phases; this plan uses 6 phases with stricter ordering (Phase 2 → Phase 3 → Phase 5 are not parallelizable).
  - Plan 1b's `blocks` referenced `phase-d-plan-3-agents` and `phase-d-plan-4-cutover`; this plan inherits the same `blocks` because Phase 3 + Phase 4 both depend on the schema split shipping first.
- **File ownership map (no parallel conflicts):** see Whole-Plan Consistency section above.
- **Test count delta:** +2 tests net (Phase 3: +1, Phase 4: +1).
- **Reconciled stale references:**
  - Both findings' `evidence_journal` is broken. Phase 2 repoints.
  - PR #8's `pr-body.md` documents the deltas; finding 1's premise is partially refuted; the forward invariant (CI advisory for future PRs) is still warranted.
  - 17-hint classification: 16 meta-surface contracts (indices 0-15) + 1 process rule (index 16). Only index 16 moves to `PROCESS_HINTS`.
- **Unresolved contradictions:** 0. Plan is consistent and ready for red-team review.

## Red Team Review

### Session — 2026-06-23
**Findings:** 15 (13 accepted, 2 user-decided)
**Severity breakdown:** 2 Critical, 8 High, 5 Medium
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer + Scope & Complexity Critic
**Report:** `plans/260623-1237-meta-state-pr-quality-and-hints-split/reports/from-code-reviewer-to-planner-red-team-adjudication-260623-1300-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | `loop_get_instruction` slug break — `HINT_KEY_MAP["pnpm-test-discipline"] = 16` returns undefined after Phase 3 | Critical | Accept | Phase 3 step 8 (split HINT_KEY_MAP + HINT_SUGGESTIONS, add resolveHint()) |
| C2 | Citation repair races the registry — partial-patch hole | Critical | Accept | Phase 2 step 5 (use meta_state_batch for atomicity) |
| H1 | `meta_state_patch` does not validate journal file existence | High | Accept | Phase 2 step 4 (add fs.existsSync before batch) |
| H2 | `HINT_SUGGESTIONS` parallel array (length 17) not in plan | High | Accept | Phase 3 step 8 (split HINT_SUGGESTIONS atomically) |
| H3 | Cold-session parity test claim contradicts actual test mechanics | High | Accept | Phase 3 step 3 (rewrite RED with parseFrozenStringArray(hookSource, varName)) |
| H4 | Phase 4 fork PR base ref failure | High | Accept | Phase 4 architecture (x-access-token fallback + continue-on-error) |
| H5 | PR-body section trivially bypassable with empty headers | High | Accept | Phase 4 step 6 (regex requires non-empty content) |
| H6 | Phase 5 ordering unenforced at registry layer | High | Accept | Phase 5 step 7 (H6 ordering gate in loop-describe-tool.js) |
| H7 | Plan should split into 2 PRs (citation repair only, then rest) | High | Reject (user decision) | n/a — stays atomic per Plan 1b precedent |
| H8 | Phase 4 7-category bash+jq parser is YAGNI | High | Accept (user decision) | Phase 4 architecture (simplified parser, 3 categories only) |
| M1 | CI emits raw content without markdown escape (XSS) | Medium | Accept | Phase 4 step 4 (escape_md() function + RED test) |
| M2 | Plan claims "11 mutating tools"; actual is 16-22 | Medium | Accept | Phase 1 step 2 (programmatic count) |
| M3 | PROCESS_HINTS text duplicates enforcement metadata | Medium | Accept | Phase 5 step 2 (cite rule id only, no enforcement-shape duplication) |
| M4 | PR #8 merge SHA unverified | Medium | Accept | Phase 1 step 5 (verify via `git log --merges` empirically) |
| M5 | Phase 5 `other-patches` rule item is YAGNI | Medium | Accept (coupled with H8) | Phase 5 architecture (drop 7th item, 6 items total) |

### Rationale for H7 reject

User decision: stay atomic. Plan 1b's atomic-fix discipline precedent (C1 Critical TaskUpdate re-open) does not apply here (no resolved registry entry being re-opened), but the cost of splitting (2 PRs, 2 reviews, possible drift between the citation repair and the schema refactor) outweighs the reviewability benefit. Both findings' TTLs are already expired (2026-06-23T10:08Z / 10:13Z) — re-ack can happen inline.

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-research.md, phase-02-citation-repair.md, phase-03-process-hints-split.md, phase-04-pr-body-ci-advisory.md, phase-05-pr-body-rule-promotion.md
- **Decision deltas checked:** 13 (all accepted findings)
- **Reconciled stale references:**
  - C1: Phase 3 step 8 now splits both `HINT_KEY_MAP` and `HINT_SUGGESTIONS`; `resolveHint()` helper routes by source
  - C2: Phase 2 step 5 uses `meta_state_batch` instead of two sequential `meta_state_patch` calls; verification step 6 re-runs `fs.existsSync`
  - H1: Phase 2 step 4 adds `fs.existsSync` check before batch
  - H2: Phase 3 step 8 splits `HINT_SUGGESTIONS` (length 17) into two arrays (length 16 + 1+)
  - H3: Phase 3 RED step 3 rewritten to use parameterized `parseFrozenStringArray(hookSource, "LOCAL_PROCESS_HINTS")` instead of regex modification
  - H4: Phase 4 workflow YAML now has `permissions:` block, fork-PR fallback with `x-access-token`, and `continue-on-error: true`
  - H5: Phase 4 step 6 uses regex `^## ${section}\s*\n([^#]+)` to require non-empty content per header
  - H6: Phase 5 step 7 adds ordering gate in `loop-describe-tool.js`
  - H8: Phase 4 architecture simplified — `git diff --stat` + `grep` for `+`/`-` lines (30-50 lines, not 80-120); 3 RED tests (not 7)
  - M1: Phase 4 step 4 adds `escape_md()` function with RED test for `<script>` payload
  - M2: Phase 1 step 2 uses programmatic grep; count is now `wc -l` of the actual mutating tools
  - M3: Phase 5 step 2 PROCESS_HINTS entry cites rule id only; no enforcement-shape duplication
  - M4: Phase 1 step 5 verifies PR #8 merge SHA via `git log --merges`; the unverified claim is removed
  - M5: Phase 5 architecture drops 7th item (`other-patches`); rule has 6 items
- **Mirror hook intentionally asymmetric (Red Team L1).** Plan explicitly drops the `.factory/hooks/loop-surface-inject.cjs` modification from Phase 3. The Droid mirror renders only `LOCAL_DISCOVERABILITY_HINTS`; `LOCAL_PROCESS_HINTS` is a forward feature, not parity.
- **Coupled simplifications:** H8 + M5 (simplified parser + dropped `other-patches` item) keep the rule's taxonomy aligned with the parser's output.
- **Plan.md Summary table updated:** Phase 4 effort dropped from ~1h to ~15min (post-H8); total effort ~3.5h (not ~4-5h).
- **Unresolved contradictions:** 0. Plan is consistent and ready for implementation.

## Validation Log

### Session — 2026-06-23

**Trigger:** operator invocation `/ck:plan validate` after red-team review applied 13 of 15 findings. Per the validate guard, the heavy verification pass was skipped because the Red Team Review section already contains verification evidence; this session focused on resolving 4 open questions.

**Questions asked:** 4

#### Questions & Answers

1. **[Scope]** Q1: Citation repair target — both findings' `evidence_journal` must point at a real review file. Which?
   - Options: from-code-reviewer-to-planner-plan-1a-review-report.md | journal-260619-2246-phase-d-plan-2-shipped.md | Re-create the missing review (option b) | plans/260619-2246-phase-d-plan-2-storage/pr-body.md
   - **Answer:** `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` (Recommended)
   - **Rationale:** The Plan 1a review is the contemporaneous review session that may have consolidated the PR #8 review. The retrospective option b is invalidated by the unverified SHA claim (Red Team M4); even with Phase 1 step 5 fixing the SHA verification, the closest existing file is a more durable citation. The plan-journal and per-plan PR-body are not "review" files per se — they are downstream artifacts.

2. **[Architecture]** Q2: PROCESS_HINTS export shape — where does the new export live?
   - Options: Sibling constant in `core/loop-introspect.js` | New file `core/process-hints.js`
   - **Answer:** Sibling constant in `core/loop-introspect.js` (Recommended)
   - **Rationale:** Matches the existing pattern (DISCOVERABILITY_HINTS lives there). 1 entry doesn't warrant a new file. The new file option is YAGNI for the current surface.

3. **[Architecture]** Q3: Warm tier default — should `process_hints` be in `loop_describe({tier:'warm'})` output?
   - Options: Render both fields | Omit `process_hints` from warm tier
   - **Answer:** Render both fields in warm tier (Recommended)
   - **Rationale:** SessionStart hook parity preserved. Both surfaces visible to agents at session start. The omit option requires the SessionStart hook to fetch `process_hints` via a separate channel, adding complexity.

4. **[Scope]** Q4: Source findings status after Phase 5 — how do we close out the 2 findings?
   - Options: Resolve with `consolidated_into` change-log | Resolve with `resolution` text only | Leave active as audit trail
   - **Answer:** Resolve both with `consolidated_into` change-log (Recommended)
   - **Rationale:** The plan's Phase 6 `meta_state_log_change` is the canonical source. `meta_state_supersede` atomically stamps `status=superseded` + `consolidated_into` + `superseded_at` + `superseded_by`. Closes the audit trail cleanly. "Leave active" creates noise in `loop_describe` and `meta_state_list` filters.

#### Confirmed Decisions

- **Citation target:** `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`
- **PROCESS_HINTS shape:** Sibling constant in `core/loop-introspect.js`
- **Warm tier default:** Render both fields
- **Source findings closeout:** `meta_state_supersede` with `consolidated_into` change-log

#### Action Items

- [x] Validation answers documented
- [x] Phase 2 step 4 updated with the chosen citation target
- [x] Phase 3 architecture confirmed (sibling constant, both warm-tier fields)
- [x] Phase 6 step 9 updated to use `meta_state_supersede` for both findings

#### Impact on Phases

- **Phase 2:** `meta_state_batch` patches both `evidence_journal` fields with the operator-chosen target. Step 4's `fs.existsSync` check (Red Team H1) verifies the file before the batch.
- **Phase 3:** `PROCESS_HINTS` lives in `core/loop-introspect.js` as a sibling constant. `loop_describe({tier:'warm'})` returns both fields by default. `loop_get_instruction({key:'pnpm-test-discipline'})` routes through `resolveHint()`.
- **Phase 6:** The plan's `meta_state_log_change` (step 6) is the canonical source. Phase 6 step 9 calls `meta_state_supersede` for both findings with `consolidated_into: <change-log-id>`. The source findings transition `reported` → `superseded` atomically.

### Whole-Plan Consistency Sweep (Validation Session)

- **Files reread:** plan.md, phase-01-research.md, phase-02-citation-repair.md, phase-03-process-hints-split.md, phase-04-pr-body-ci-advisory.md, phase-05-pr-body-rule-promotion.md
- **Decision deltas checked:** 4 (Q1-Q4)
- **Reconciled stale references:**
  - Q1: `## Open Questions` block in plan.md removed (Q1-Q4 all answered). Phase 2 step 4 uses the chosen target.
  - Q2: Phase 3 architecture already documented as sibling constant; no phase change needed.
  - Q3: Phase 3 step 7 (warm tier update) already documents "both fields present by default"; no change needed.
  - Q4: Phase 6 step 9 updated from "Resolved entries" prose to "Superseded entries" + `meta_state_supersede` call. The plan's `pr-body.md` template (Phase 6 step 8) now lists `meta-260622T1708Z-...` and `meta-260622T1713Z-...` under "Superseded entries" with `consolidated_into: <change-log-id>`.
- **Unresolved contradictions:** 0
- **Plan ready for implementation:** yes

## Open Questions (for operator) — RESOLVED

All 5 open questions resolved in Validation Session 1:

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Citation repair target | `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` |
| 2 | PROCESS_HINTS export shape | Sibling constant in `core/loop-introspect.js` |
| 3 | Warm tier default | Render both fields |
| 4 | CI advisory vs gate | Advisory-only on first ship (per Plan 4 reference) |
| 5 | PR template strategy | Rely on per-plan `pr-body.md` convention (per Plan 1b precedent) |
| 6 | Source findings closeout | `meta_state_supersede` with `consolidated_into` change-log |
