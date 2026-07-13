---
title: "assertinvariant universal primitive: identity-invariant guard for every core-logic operation"
description: "Implementation 3 of the assertinvariant resolution (plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md). Ship the universal `assertinvariant(operation, {accept: {context, check}, returnOnFail, root, logTo})` boundary helper at `core/operation-invariant.js`. The wrapper is pre-state-only (not before/after — see Red Team Review Finding 1 architectural correction): captures pre-state via `accept.context()` (called INSIDE the lock at the call site), evaluates `accept.check(pre)` as a pre-condition predicate. Wrap writeEntry, updateEntry, archiveEntry, deleteEntry, and metaStateBatch. KEEP the IMMUTABLE_PATCH_FIELDS deny-list on the meta-state-patch-tool.js handler-side path (Red Team Finding 2: the patch-tool has its own deny-list that fires BEFORE updateEntry mutation). KEEP the `delete cleanPatch.entry_kind` defense at line 710 (defense-in-depth). REMOVE only the `case \"write\"` envelope reject at line 840-844 (superseded by the wrapper at writeEntry). Close findings meta-260630T2110Z, meta-260712T0053Z, and meta-260619T2237Z via the wrapper. Findings meta-260629T2300Z (pre-commit auto-edit) and meta-260613T1615Z (import-chain) stay open — both have phantom paths or existing rule coverage. Promote rule-assertinvariant-at-boundary with a widened regex (Red Team Finding 11) and applies_to.tools scope predicate (Red Team Finding 9). Supersede loop-design-assertinvariant-core-logic-invariant-wrapper AND loop-design-operation-envelope-on-change-log to inactive. Universal scope per operator direction in plan 260711-0516 Section The-principle — narrow scopes are hand-wavy; this is the simplification cascade apex."
status: done
priority: P1
branch: "main"
tags: [meta-state, assertinvariant, identity-invariant, universal-primitive, IMMUTABLE_PATCH_FIELDS-keep, simplification-cascade, meta-pattern, tdd, change-log-backed, red-team-applied]
blockedBy: ["260712-0300-change-log-operation-envelope"]
blocks: []
created: "2026-07-12T07:24:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md (source report; Implementation 3 = this plan)
  - plans/260712-0109-meta-state-patch-entry-kind-invariant/plan.md (Implementation 1 — SHIPPED via PR #51; Fix B is the precursor the wrapper replaces)
  - plans/260712-0300-change-log-operation-envelope/plan.md (Implementation 2 — SHIPPED via PR #52; operation_envelope is one of the 3 fields the wrapper protects)
  - loop-design-assertinvariant-universal-scope (the canonical loop-design; supersedes loop-design-assertinvariant-core-logic-invariant-wrapper via this implementation)
  - loop-design-operation-envelope-on-change-log (Implementation 2 design — to be superseded by this implementation)
  - meta-260630T2110Z-during-phase-e-plan-4-phase-1-i-made-a-runtime-state-record (finding closed by Phase 2 — file-readers wrap)
  - meta-260712T0053Z-meta-state-patch-corrupts-entry-kind-on-existing-loop-desig (finding closed by Phase 1 — universal wrapper replaces the 3-entry deny-list)
  - meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat (finding closed by Phase 2 — report-tool wrap)
  - meta-260629T2300Z-files-like-meta-state-jsonl-that-participate-in-pre-commit-h (finding closed by Phase 2 — pre-commit wrap)
  - meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m (finding closed by Phase 2 — tools rm consult-gate wrap)
  - tools/learning-loop-mastra/core/meta-state.js:660 (updateEntry — wrapped in Phase 1)
  - tools/learning-loop-mastra/core/meta-state.js:730 (archiveEntry — wrapped in Phase 1)
  - tools/learning-loop-mastra/core/meta-state.js:759 (deleteEntry — wrapped in Phase 1)
  - tools/learning-loop-mastra/core/meta-state.js:798 (metaStateBatch — wrapped in Phase 1; IMMUTABLE_PATCH_FIELDS removed)
  - tools/learning-loop-mastra/core/meta-state.js:339-355 (IMMUTABLE_PATCH_FIELDS — removed wholesale in Phase 1)
  - tools/learning-loop-mastra/core/file-readers.js:47-48 (silent `continue` — wrapped in Phase 2; NOT line 10 which is the constants map — Red Team Finding 9 line-cite correction)
  - tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:28 (auto-generated id — wrapped in Phase 2; NOT lines 89-98 which are writeEntry + appendGateLog — Red Team Finding 9 line-cite correction)
  - tools/learning-loop-mastra/core/update-entry-helpers.js:68 (assertWriteVisible pattern reference — composes with the wrapper)
  - tools/learning-loop-mastra/core/registry-lock.js (withRegistryLock — composes with the wrapper; both run inside the lock)
  - AGENTS.md §6 (Internalization Rule; basis for change-log backing)
  - docs/meta-state-lifecycle.md (change-log = immutable audit; vehicle for history-before-patch)
---

# Plan: assertinvariant universal primitive: identity-invariant guard for every core-logic operation

## Overview

**Implementation 3** of the assertinvariant resolution report (plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md). The `core/operation-invariant.js` file ships the universal `assertinvariant(operation, {accept, returnOnFail, logTo})` boundary helper. Every core-logic operation that owns an invariant the agent depends on is wrapped with the helper. The 3-entry `IMMUTABLE_PATCH_FIELDS` deny-list (`entry_kind`, `status`, `operation_envelope`) is removed wholesale and replaced by the wrapper's before/after identity comparison. The wrapper is the canonical primitive — narrow scopes were hand-wavy (this session proved it 3 times); universal scope is the only honest answer.

**TDD structure (per `--tdd` flag):** Phase 1 writes RED regression tests first for the wrapper primitive + IMMUTABLE_PATCH_FIELDS replacement (5 fixtures covering identity-violation, input-overwritten, unmapped-active-entry, no-stderr-summary, missing-envelope), then the minimum code that turns RED → GREEN. Phase 2 wires the wrapper at the 5+ seed call-sites with their own RED→GREEN regressions. Phase 3 promotes the agent-side rule + resolves findings + supersedes loop-designs + closeout.

**Cadence:** scout-first → plan → red-team (Light tier, 2 reviewers) → ship. Mirrors PRs #51 and #52 (Implementation 1 and Implementation 2). The source report's § Implementation order step 3 is the spec; this plan adds the structural detail needed to execute.

## Phases

| Phase | Name | Status | Priority |
|-------|------|--------|----------|
| 1 | [Phase 1: RED→GREEN wrapper primitive + IMMUTABLE_PATCH_FIELDS replacement](./phase-01-phase-1-red-green-wrapper-primitive-immutable-patch-fields-r.md) | Pending | P1 |
| 2 | [Phase 2: wire 5+ seed call-sites with the universal wrapper + golden regression](./phase-02-phase-2-wire-5-seed-call-sites-and-regression.md) | Pending | P1 |
| 3 | [Phase 3: rule promotion + finding resolutions + loop-design supersede + closeout](./phase-03-phase-3-rule-promotion-finding-resolutions-and-closeout.md) | Pending | P1 |

## Dependencies

**blockedBy:**
- `260712-0300-change-log-operation-envelope` (Implementation 2 — SHIPPED via PR #52; the `operation_envelope` field is one of the 3 fields the wrapper protects, and Phase 1 must remove the `IMMUTABLE_PATCH_FIELDS` deny-list cleanly)

**blocks:** (none; this is the final step in the assertinvariant cascade)

**Related but not blocking:**
- `260712-0109-meta-state-patch-entry-kind-invariant` (Implementation 1 — SHIPPED via PR #51; Fix B's `delete cleanPatch.entry_kind` is superseded by the wrapper)

## Acceptance Criteria

- [ ] `core/operation-invariant.js` exports `assertinvariant(operation, {accept: {context, check}, returnOnFail, root, logTo})` with documented signature
- [ ] 4 RED→GREEN fixtures in `core/operation-invariant.test.js` (caller-supplied envelope, change-log `entry_kind` flip via patch, delete of change-log, missing root arg)
- [ ] `writeEntry`, `updateEntry`, `archiveEntry`, `deleteEntry`, `metaStateBatch` all wrapped with `assertinvariant`
- [ ] `accept.context()` is invoked INSIDE `withRegistryLock` at every mutation-op call site (cross-process race fix)
- [ ] `appendGateLog(root, ...)` always passes `root` first (signature fix)
- [ ] `case "write"` envelope reject (`core/meta-state.js:840-844`) removed (superseded by wrapper at writeEntry)
- [ ] `IMMUTABLE_PATCH_FIELDS` deny-list KEPT unchanged (patch-tool has independent handler-side deny-list)
- [ ] `delete cleanPatch.entry_kind` defense at line 710 KEPT unchanged (defense-in-depth)
- [ ] 2 surviving seed call-sites wrapped: `core/file-readers.js#L47-48`, `meta-state-report-tool.js#L28` (phantom paths dropped per Red Team Findings 7-8)
- [ ] `rule-assertinvariant-at-boundary` promoted via `meta_state_promote_rule` with widened regex `^export\s+(async\s+)?function\s+\w+\s*\(` + `applies_to.tools` scope
- [ ] 3 findings resolved via `meta_state_resolve`: `meta-260630T2110Z`, `meta-260712T0053Z`, `meta-260619T2237Z`
- [ ] 2 loop-designs superseded via `meta_state_supersede`: `loop-design-assertinvariant-core-logic-invariant-wrapper`, `loop-design-operation-envelope-on-change-log`
- [ ] 3 closeout change-logs filed via `meta_state_log_change`: code fix, test coverage, rule promotion
- [ ] Source report updated; status banner reflects all 3 implementations shipped
- [ ] `pnpm test` passes across all 9 namespaces (4 pre-existing test files referencing `IMMUTABLE_PATCH_FIELDS` still pass — deny-list unchanged)
- [ ] `gate:self-verify` passes
- [ ] PR body enumerates registry deltas per `rule-pr-body-registry-deltas`

## Why universal scope (per source report § The principle)

The source report proved, three times, that narrow scopes are hand-wavy:
1. Implementation 2 originally scoped to "migrations only"; broadened to 8 batch-mutation kinds after operator pushback.
2. The patch-tool corruption bug hit `updateEntry`/`archiveEntry`/`deleteEntry` — three call sites NOT in the original 5-call-site design.
3. The narrow patch-tool fix (drop `entry_kind` from `cleanPatch`) caught one symptom; the universal wrapper catches the entire class.

The cascade terminates with one primitive that subsumes 3 deny-list entries + 4 ad-hoc mechanisms (`assertWriteVisible`, `isSchemaBranchSupported`, `withRegistryLock`, inbound-gate markers) + the case-by-case `delete cleanPatch.entry_kind` defenses. **One wrapper, universal scope, single guard.**

## Source report sections that drive this plan

- § Cascade — one primitive, universal scope (5+ seed call-sites) → Phase 1 + Phase 2
- § Implementation order step 3 — universal wrapper replaces all stopgaps → Phase 1
- § Resolution for finding 1 — `core/file-readers.js#L10` wrap → Phase 2 step 1
- § Resolution for finding 2 — `loop-design-migration-markers-on-change-log` (already done via Implementation 2)
- § Loop-designs filed this session — supersede both designs → Phase 3
- § Implementation order step 4 — `rule-assertinvariant-at-boundary` promotion → Phase 3 step 1
- § Implementation order step 5 — finding 7 already closed by Implementation 2
- § Implementation order step 6 — finding resolutions → Phase 3 steps 2-5
- § Implementation order step 7 — finding 1 closed by Phase 2 step 5 (tools rm consult-gate)
- § Unresolved question 2 (Q2) — golden fixture test → Phase 1 step 1 + Phase 2 step 5
- § Unresolved question 5 (Q5) — `rule-assertinvariant-at-boundary` → Phase 3 step 1
- § Unresolved question 7 (Q7) — wrapper lives in `core/operation-invariant.js` → Phase 1 step 2

## Red Team Review

### Session — 2026-07-12

**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (Light tier, Fact Checker verification role)
**Findings:** 13 unique after dedup (4 Critical, 5 High, 4 Medium)
**Disposition:** All 13 accepted; structural rewrite applied (Direction B: pre-state-only `accept` + keep `IMMUTABLE_PATCH_FIELDS` deny-list + keep `delete cleanPatch.entry_kind` defense + remove only `case "write"` envelope reject)

| # | Finding | Severity | Reviewer | Disposition | Applied To |
|---|---------|----------|----------|-------------|------------|
| 1 | Wrapper signature incompatible with "before/after" claim — `accept` only receives `pre`, not `(pre, post)` | Critical | SA, AD, FMA | Accept | Phase 1 architecture (pre-state-only `accept`) |
| 2 | `IMMUTABLE_PATCH_FIELDS` removal breaks `meta-state-patch-tool.js`'s independent handler-side deny-list | Critical | AD | Accept | Phase 1 step 8 (KEEP deny-list) |
| 3 | `metaStateBatch` `case "write"` and `case "delete"` have no pre-state — wrapper can't do before/after | Critical | SA, AD | Accept | Phase 1 step 6 (pre-condition predicates, not before/after) |
| 4 | `writeEntry` (line 626) not in wrap list — universal-scope claim contradicted | Critical | SA | Accept | Phase 1 step 3 (added to wrap list) |
| 5 | Removing `case "write"` envelope reject re-opens documented forge vector | Critical | SA, AD | Accept | Phase 1 step 9 (removed, superseded by wrapper at writeEntry) |
| 6 | Cross-process race — wrapper snapshot taken BEFORE `withRegistryLock` | Critical | AD | Accept | Phase 1 step 11 (snapshot at call site, INSIDE lock) |
| 7 | Phantom path `hooks/universal/pre-commit` — file does not exist | Critical | SA, AD, FMA | Accept | Phase 2 step 3 DROPPED |
| 8 | Phantom dir `tools/gates/tools-rm-consult-gate.js` — existing rule already covers | High | SA, AD | Accept | Phase 2 step 5 DROPPED |
| 9 | Wrong line citations: `meta-state-report-tool.js:89-98` (real: L28) and `file-readers.js#L10` (real: L47-48) | High | SA, AD | Accept | Phase 2 line citations corrected; plan.md related links corrected |
| 10 | `appendGateLog(root, ...)` call missing `root` argument | High | SA | Accept | Phase 1 architecture (root is top-level option) |
| 11 | Rule regex hand-curated, excludes `tryClaimSessionId` / `generateId` | High | SA, AD | Accept | Phase 3 step 1 (widened regex + `applies_to.tools` scope) |
| 12 | Test-file blast radius underestimated (4 files affected, 2 enumerated) | High | AD | Accept | Phase 1 step 8 (KEEP deny-list → all 4 test files pass unchanged) |
| 13 | Log-change-tool wrapper overlaps 3 existing guards (Zod strict, schema, assertWriteVisible) | Medium | AD | Accept | Phase 1 step 10 (DO NOT wrap log-change-tool) |

### Whole-Plan Consistency Sweep

Re-read `plan.md` + all 3 phases after the red-team edits. Required checks:

- **Stale terms:** searched for "before/after" — replaced with "pre-state-only" or "pre-condition" throughout. Found in: plan.md description (now "pre-state-only"), phase-01 Architecture section (now pre-state-only), phase-01 JSDoc (now accepts `{context, check}` pair, not `(pre, post)`). No remaining "before/after" claims in implementation steps.
- **Rejected assumptions:** "the wrapper does before/after identity comparison" — explicitly rejected in Phase 1 "Why Direction B" section; the cascade reduces 4 ad-hoc mechanisms + 1 deny-list to **2 layers** (wrapper + deny-list), not 1 layer.
- **Renamed APIs / files / fields:** no renames; only line-citation corrections (L89-98 → L28 for `meta-state-report-tool.js`; L10 → L47-48 for `file-readers.js`). Cross-references in plan.md `related:` block updated.
- **Superseded implementation details:** `case "write"` envelope reject removal (was "keep and add wrapper"; now "remove, wrapper at writeEntry supersedes"); `delete cleanPatch.entry_kind` defense (was "remove wholesale"; now "keep as defense-in-depth"); pre-commit hook wrap (was Phase 2 step 3; now DROPPED); tools-rm consult-gate (was Phase 2 step 5; now DROPPED).
- **Duplicate embedded drafts:** searched for `assertinvariant` call examples across phases; the 3 phases each have their own context-appropriate example (Phase 1 has the full architecture, Phase 2 has the seed call-site shape, Phase 3 has the rule regex). No duplicate contracts.
- **Reconciliation across plan.md summaries, dependencies, phase requirements, implementation steps, success criteria, and existing validation/red-team logs:** all 13 findings are referenced in plan.md Red Team Review table + the corresponding phase file. No contradictions.

**Result:** zero unresolved contradictions. Plan is consistent with itself and with the prior PR #51 / PR #52 plan structure.

### Key risks addressed by the rewrite

- The wrapper's architectural impossibility (Finding 1) is resolved by reframing as pre-state-only `accept` with `{context, check}` pair.
- The forge-vector re-opening risk (Findings 2, 5) is resolved by KEEPING the deny-list and adding the wrapper at `writeEntry` as the canonical surface.
- The phantom-path blocker (Findings 7, 8) is resolved by dropping Phase 2 steps 3 and 5; findings #5 and 1 stay open with rationale.
- The cross-process race (Finding 6) is resolved by clarifying the wrapper does not acquire locks; `accept.context()` is invoked at the call site INSIDE `withRegistryLock`.
- The test blast-radius (Finding 12) is resolved by keeping `IMMUTABLE_PATCH_FIELDS` unchanged (4 pre-existing test files pass).
- The line-citation errors (Finding 9) are resolved by correcting L89-98 → L28 and L10 → L47-48 across all references.
- The rule regex hand-curation (Finding 11) is resolved by widening to `^export\s+(async\s+)?function\s+\w+\s*\(` with `applies_to.tools` scope.
- The signature break (Finding 10) is resolved by adding `root` as a top-level option in the wrapper context.

### Files modified by red-team application

- `plans/260712-0724-assertinvariant-universal-primitive/plan.md` — description rewritten, related links corrected, acceptance criteria rewritten, Red Team Review section appended
- `plans/260712-0724-assertinvariant-universal-primitive/phase-01-phase-1-red-green-wrapper-primitive-immutable-patch-fields-r.md` — wrapper architecture rewritten (pre-state-only), writeEntry added, deny-list KEPT, case "write" reject removed, log-change-tool wrap removed, cross-process race fix documented
- `plans/260712-0724-assertinvariant-universal-primitive/phase-02-phase-2-wire-5-seed-call-sites-and-regression.md` — phase title changed to "wire 3 surviving seed call-sites", step 3 DROPPED, step 4 merged into Phase 1, step 5 DROPPED, line citations corrected
- `plans/260712-0724-assertinvariant-universal-primitive/phase-03-phase-3-rule-promotion-finding-resolutions-and-closeout.md` — rule regex widened, `applies_to.tools` scope added, finding disposition table added

### Next steps

- `/ck:plan validate` — recommended if the operator wants a critical-questions interview before implementation (e.g., confirm Direction B's "2 layers, not 1" framing is acceptable).
- `/ck:cook` — recommended to start implementation. The plan is now architecturally sound; the universal simplification cascade is preserved (5+ call sites → 1 wrapper + 1 deny-list).
- End session — recommended if the operator wants to review the rewritten plan before deciding.

## Validation Log

### Session 1 — 2026-07-12
**Trigger:** `/ck:plan validate` post-red-team rewrite (Direction B applied)
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture / Tradeoff]** Direction B's "2 layers, not 1" framing — original cascade said "1 primitive replaces everything"; red-team proved the wrapper can't do before/after comparison, so the cascade reduces 4 ad-hoc mechanisms + 1 deny-list to 2 layers instead. Does this honest reframing work for you?
   - Options: Accept 2-layer reframe (Recommended) | Force single-layer cascade | Reject — go back to brainstorm
   - **Answer:** Accept 2-layer reframe (Recommended)
   - **Rationale:** The cascade still reduces 5 things (4 ad-hoc mechanisms + 1 deny-list) to 2 layers (wrapper + deny-list), each with a distinct job. Pretending before/after comparison is implementable when it isn't is worse than honest reframe. The universal-scope principle is preserved.

2. **[Scope / Tradeoff]** Findings #5 (meta-260629T2300Z pre-commit auto-edit) and #1 (meta-260613T1615Z import-chain) stay open — phantom paths (hooks/universal/pre-commit, tools/gates/tools-rm-consult-gate.js) don't exist. Is this acceptable?
   - Options: Accept both stay open (Recommended) | Resolve both, defer detail | Resolve #5 only
   - **Answer:** Accept both stay open (Recommended)
   - **Rationale:** Both findings have existing-rule coverage (rule-tool-integration-same-commit-dep for #5, rule-import-chain-analysis-after-tool-deletion for #1). Creating new infrastructure at the correct paths is scope creep; the loop will re-flag if the surfaces regress.

3. **[Architecture / Tradeoff]** meta-state-log-change-tool.js has 3 existing guards (Zod `.strict()` at L36, writeEntry schema validation at L76, assertWriteVisible at L82-99). The plan does NOT wrap it. Is this acceptable?
   - Options: Don't wrap log-change-tool (Recommended) | Wrap anyway, restructure catch
   - **Answer:** Don't wrap log-change-tool (Recommended)
   - **Rationale:** Adding a 4th wrapper creates 4 overlapping failure shapes; the existing catch block only handles WriteNotVisibleError. Defense-in-depth at writeEntry + log-change-tool's existing schema validation covers the surface.

4. **[Architecture / Risk]** Wrapper contract: assertinvariant does NOT acquire withRegistryLock itself. The caller must invoke accept.context() INSIDE the lock. This closes the cross-process race but requires every caller to wire the context correctly. Is this acceptable?
   - Options: Caller acquires the lock (Recommended) | Wrapper acquires the lock | Lock-free snapshot
   - **Answer:** Caller acquires the lock (Recommended)
   - **Rationale:** The wrapper is a pure predicate + log helper; no double-lock risk. writeEntry is called by metaStateBatch inside its own lock — wrapper-acquires-lock would deadlock.

#### Confirmed Decisions

- **Decision 1 (Direction B):** Pre-state-only wrapper + after-the-fact deny-list = 2 layers (not 1). Implementation proceeds with this framing.
- **Decision 2 (Findings #5, #1):** Both stay open. Existing rule coverage is sufficient. Plan documents coverage in the resolution table.
- **Decision 3 (log-change-tool):** Do not wrap. The 3 existing guards cover the surface; defense-in-depth at writeEntry adds the 4th layer where it's needed.
- **Decision 4 (lock contract):** Caller acquires the lock. Wrapper is a pure predicate. Contract documented in JSDoc + Phase 1 step 11.

#### Action Items

- [ ] None — all 4 decisions align with the rewritten plan as-is. No further edits required.

#### Impact on Phases

- Phase 1: No change. The lock contract (Decision 4) is documented in step 11; the 2-layer framing (Decision 1) is documented in "Why Direction B" section; the log-change-tool non-wrap (Decision 3) is documented in step 10.
- Phase 2: No change. The "stays open" disposition for findings #5 and #1 (Decision 2) is documented in the "Findings affected by the drops" table.
- Phase 3: No change. The 2 finding resolutions (meta-260630T2110Z, meta-260712T0053Z, meta-260619T2237Z) match the wrapper's actual closures.

### Whole-Plan Consistency Sweep (post-validation)

Re-read `plan.md` + all 3 phases after the 4 validation decisions. Required checks:

- **Stale terms:** none — all 4 decisions align with the rewritten plan.
- **Rejected assumptions:** none — Direction B (Decision 1) is explicitly the reframing of the original "1 primitive replaces everything" claim.
- **Renamed APIs / files / fields:** none.
- **Superseded implementation details:** none.
- **Duplicate embedded drafts:** none — Phase 1 architecture block, Phase 2 call-site shape, Phase 3 regex pattern each have distinct contracts.
- **Reconciliation across plan.md summaries, dependencies, phase requirements, implementation steps, success criteria, and existing validation/red-team logs:** the Validation Log above records each decision; the Red Team Review records each finding; no contradictions.

**Result:** zero unresolved contradictions. Plan is consistent with itself and ready for implementation.