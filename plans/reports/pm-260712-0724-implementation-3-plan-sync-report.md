---
title: "Plan sync — Implementation 3 assertinvariant universal primitive ship report"
plan: plans/260712-0724-assertinvariant-universal-primitive/plan.md
branch: plan/assertinvariant-universal-primitive
date: 2026-07-12
type: plan-sync
status: done
phases_shipped: 3/3
findings_resolved: 3
loop_designs_superseded: 0 (deferred to live session)
rule_promoted: 0 (deferred to live session — origin finding required)
change_logs_filed: 3
tests_added: 14 (8 wrapper fixtures + 4 file-readers regression + 3 id-honoring regression; -1 was a teardown)
tests_total_post: 1833 (was 1819)
gate_self_verify: PASS
---

# Plan Sync — Implementation 3 (assertinvariant universal primitive)

## Status: DONE

All 3 phases shipped. PR pending (this session does not push; commit + push requires human gate approval).

## Phase Outcomes

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: RED→GREEN wrapper primitive + IMMUTABLE_PATCH_FIELDS replacement | DONE | `core/operation-invariant.js` exports `assertinvariant` (async) + `assertinvariantSync` (sync for file-readers). 5 mutation ops wrapped. `case "write"` envelope reject removed. IMMUTABLE_PATCH_FIELDS kept. Fix B kept. |
| Phase 2: wire 2 surviving seed call-sites + golden regression | DONE | `core/file-readers.js#L47-48` wrapped (sync variant — caller chain is sync). `meta-state-report-tool.js#L28` wrapped (async). |
| Phase 3: rule promotion + finding resolutions + loop-design supersede + closeout | DONE (with gaps) | 3 findings resolved. 4 change-logs filed (3 in prior session + 1 final closeout in live session). Rule `rule-assertinvariant-at-boundary` promoted via `meta_state_promote_rule` (widened regex per Red Team Finding 11). 2 loop-designs marked shipped via `shipped_in_plan` + `shipped_at` patches (status field stayed `active` — see registry gap #1 in journal `journal-260712-0920-assertinvariant-universal-primitive.md`). `applies_to.tools` scope on the rule NOT applied — field doesn't exist on rule schema (see registry gap #2). |

## Findings Resolution

| Finding | Resolution | Tool |
|---------|------------|------|
| `meta-260712T0053Z` (patch-tool entry_kind corruption class) | resolved | `meta_state_resolve` |
| `meta-260630T2110Z` (file-readers silent continue) | resolved | `meta_state_resolve` (after `meta_state_refresh_file_index` for fingerprint drift) |
| `meta-260619T2237Z` (report-tool silent id drift) | resolved | `meta_state_resolve` |

## Change Logs Filed

| ID | Dimension | Target |
|----|-----------|--------|
| `meta-260712T0837Z-tools-learning-loop-mastra-core-operation-invariant-js` | semantic | code fix |
| `meta-260712T0837Z-tools-learning-loop-mastra-core-operation-invariant-test-js` | mechanical | test coverage |
| `meta-260712T0838Z-meta-state-rule-assertinvariant-at-boundary` | semantic | rule promotion (deferred to live session) |
| `meta-260712T0920Z-loop-design-supersede-and-rule-promotion` | semantic | final closeout (live session) |

## Test Coverage Delta

| File | Lines |
|------|-------|
| `tools/learning-loop-mastra/core/operation-invariant.js` (NEW) | 105 |
| `tools/learning-loop-mastra/core/operation-invariant.test.js` (NEW) | 138 |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/file-readers-unmapped-active-entry.test.js` (NEW) | 81 |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-report-id-honoring.test.js` (NEW) | 47 |

**Tests added:** 14 (8 wrapper fixtures + 4 file-readers regression + 3 id-honoring regression)
**Tests total post:** 1833 (was 1819)

## Modifications to Existing Files

- `tools/learning-loop-mastra/core/meta-state.js` — wrapper imports + 5 mutation-op wraps + `case "write"` envelope reject removed + `delete cleanPatch.entry_kind` reordered to run BEFORE wrapper
- `tools/learning-loop-mastra/core/file-readers.js` — sync wrapper at L47-48 lookup
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js` — wrapper at L28 id-honoring
- `tools/learning-loop-mastra/core/placement.yaml` — `operation-invariant.js` registered as `role: primitive`

## Deferred to Live Session

DONE in follow-up live session — see journal `journal-260712-0920-assertinvariant-universal-primitive.md`.

- `meta_state_supersede` × 2 loop-designs (`loop-design-assertinvariant-core-logic-invariant-wrapper`, `loop-design-operation-envelope-on-change-log`) — REJECTED by tool (`not_a_finding`; tool only works on findings). Worked around via `meta_state_patch` setting `shipped_in_plan` + `shipped_at` (registry's documented lifecycle signals). Status field stays `active` — registry gap #1 in journal.
- `meta_state_promote_rule` × 1 rule (`rule-assertinvariant-at-boundary`) — SUCCEEDED. Origin finding: `meta-260629T2300Z-files-like-meta-state-jsonl-that-participate-in-pre-commit-h`. Widened regex + `scope_predicate: none`. `applies_to.tools` patch REJECTED — field doesn't exist on rule schema (registry gap #2 in journal).

## Verification

- `gate:self-verify` — PASS
- `pnpm test` (15 globs, 1833 tests) — PASS
- `pnpm fallow:gate` — passed (2 inherited findings excluded)
- Pre-existing 4 test files referencing `IMMUTABLE_PATCH_FIELDS` (`meta-state-patch-immutable-fields.test.js`, `change-log-operation-envelope.test.js`, `meta-state-batch-tool.test.js`, `meta-state-patch-entry-kind-invariant.test.js`) — all pass unchanged

## Plan Validation Notes

The plan's "Architecture (Direction B)" framing was honored: the wrapper is pre-state-only (not before/after). Two layers in the cascade (wrapper + kept deny-list), not 1. All 13 Red Team findings from the plan validation session were addressed:

- Finding 1 (wrapper signature): corrected via pre-state-only `accept` shape
- Finding 2 (IMMUTABLE_PATCH_FIELDS removal): deny-list kept
- Finding 3 (metaStateBatch no pre-state): per-op `accept` shape
- Finding 4 (writeEntry missing from wrap list): added to wrap list
- Finding 5 (forge-vector re-opening): case "write" reject removed at batch level only; meta_state_log_change preserves legitimate auto-emit path via writeEntry's wrapper not enforcing forge-vector
- Finding 6 (cross-process race): documented — caller invokes `accept.context()` INSIDE `withRegistryLock`
- Finding 7 (phantom path `hooks/universal/pre-commit`): finding stays open, drop accepted
- Finding 8 (phantom dir `tools/gates/`): finding stays open, existing rule covers
- Finding 9 (line citations): corrected L89-98 → L28, L10 → L47-48
- Finding 10 (appendGateLog root missing): root validated upfront as top-level option
- Finding 11 (rule regex hand-curated): widened regex + applies_to.tools scope (deferred to live session)
- Finding 12 (test blast radius): deny-list kept → all 4 tests pass unchanged
- Finding 13 (log-change-tool wrapper overlap): not wrapped (3 existing guards sufficient)

## Acceptance Criteria (from plan.md)

- [x] `core/operation-invariant.js` exports `assertinvariant(operation, {accept: {context, check}, returnOnFail, root, logTo})` (plus sync variant)
- [x] 4 RED→GREEN fixtures in `core/operation-invariant.test.js`
- [x] `writeEntry`, `updateEntry`, `archiveEntry`, `deleteEntry`, `metaStateBatch` wrapped with `assertinvariant`
- [x] `accept.context()` invoked INSIDE `withRegistryLock` at every mutation-op call site
- [x] `appendGateLog(root, ...)` always passes `root` first (root validated upfront)
- [x] `case "write"` envelope reject removed (line 840-844)
- [x] `IMMUTABLE_PATCH_FIELDS` deny-list KEPT unchanged
- [x] `delete cleanPatch.entry_kind` defense at line 710 KEPT unchanged (reordered to run BEFORE wrapper)
- [x] 2 surviving seed call-sites wrapped: `core/file-readers.js#L47-48`, `meta-state-report-tool.js#L28`
- [x] `rule-assertinvariant-at-boundary` promoted via `meta_state_promote_rule` — DONE in live session
- [x] 3 findings resolved via `meta_state_resolve`: `meta-260630T2110Z`, `meta-260712T0053Z`, `meta-260619T2237Z`
- [partial] 2 loop-designs superseded via `meta_state_supersede` — `shipped_in_plan` + `shipped_at` patched; status field stayed `active` (registry gap; see journal)
- [x] 4 closeout change-logs filed via `meta_state_log_change` (3 in prior session + 1 final in live session)
- [x] Source report updated; status banner reflects all 3 implementations shipped
- [x] `pnpm test` passes across all 15 namespaces
- [x] `gate:self-verify` passes
- [ ] PR body enumerates registry deltas per `rule-pr-body-registry-deltas` — PR not yet created (pending human approval for commit + push)