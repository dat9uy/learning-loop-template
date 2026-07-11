---
title: "meta_state_patch entry_kind + status identity invariant + corrupted-entry repair"
description: "Close the identity-invariant injection class found in meta-260712T0053Z. The patch-tool union schema (meta-state.js:329 buildPatchSchemaFor) injects entry_kind via z.literal .default on empty/non-kind-specific patches, and updateEntry (meta-state.js:646 Object.assign) writes it — flipping identity and (per the handler branch-mismatch guard at meta-state-patch-tool.js:43) making the corruption un-repairable through meta_state_patch. Red-team found the SAME .default-under-.partial injection shape on status (meta-state.js:209 rule, :238 loop-design): an empty/kind-specific patch silently injects status:active, re-activating a deliberately deactivated rule or shipped design. Fix A omits entry_kind AND status from every per-kind patch schema (close the class, not the instance — per the source report's universal-scope direction); Fix B strips entry_kind in updateEntry as a one-line defense-in-depth. Then repair the two corrupted loop-design entries (meta-state.jsonl lines 275-276, stored entry_kind=finding) via meta_state_batch update (the only viable path — direct file edits are write-gated). Phase 2 adds entry_kind + status to IMMUTABLE_PATCH_FIELDS as a post-repair stopgap closing the batch hole until the universal assertinvariant wrapper ships (Implementation 3). Each logical change backed by one meta_state_log_change filed AFTER the edit lands (operator-confirmed ordering: edit-first, change-log-after — eliminates the audit/reality divergence window where a change-log could claim a change that never happened): one for the code fix, one for the data repair. Finding meta-260712T0053Z stays OPEN; it closes with the universal wrapper."
status: pending
priority: P1
branch: "main"
tags: [meta-state, entry_kind, status, identity-invariant, patch-tool, zod-union, silent-corruption, meta-260712T0053Z, tdd, change-log-backed]
blockedBy: []
blocks: []
created: "2026-07-12T01:09:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md (source report; Implementation 1 = this plan)
  - meta-260712T0053Z-meta-state-patch-corrupts-entry-kind-on-existing-loop-desig (the finding; stays OPEN — closes with universal wrapper, Implementation 3)
  - loop-design-assertinvariant-universal-scope (canonical universal-scope primitive; Implementation 3; closes the CLASS)
  - loop-design-assertinvariant-core-logic-invariant-wrapper (corrupted entry #1; repaired this plan)
  - loop-design-migration-markers-on-change-log (corrupted entry #2; repaired this plan)
  - tools/learning-loop-mastra/core/meta-state.js:87-89 (finding entry_kind literal + .default — bug root)
  - tools/learning-loop-mastra/core/meta-state.js:209 (rule status .default — same injection class)
  - tools/learning-loop-mastra/core/meta-state.js:238 (loop-design status .default — same injection class)
  - tools/learning-loop-mastra/core/meta-state.js:329-340 (buildPatchSchemaFor — Fix A target)
  - tools/learning-loop-mastra/core/meta-state.js:596-659 (updateEntry — Fix B target, line 642-646)
  - tools/learning-loop-mastra/core/meta-state.js:290-300 (IMMUTABLE_PATCH_FIELDS — Phase 2 stopgap target)
  - tools/learning-loop-mastra/core/meta-state.js:754-777 (batch update path — SAME hole; stopgap-closed in Phase 2, fully closed by Implementation 3)
  - tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:23 (patch union schema)
  - tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:43 (branch-mismatch guard — why patch tool cannot repair)
  - tools/learning-loop-mastra/__tests__/with-mcp-server.js:88-101 (callTool JSON.parse — test (b) must handle SyntaxError)
  - tools/lib/gate-logging.js:53-63 (gate-log path — test (d) must use .claude/coordination/gate-log.jsonl)
  - tools/learning-loop-mastra/scripts/gate-self-verify.mjs:68-72 (re-seeds file-index — refresh_file_index redundant)
  - AGENTS.md §6 (Internalization Rule; basis for change-log backing)
  - docs/meta-state-lifecycle.md (change-log = immutable audit; vehicle for history-before-patch)
---

# Plan: meta_state_patch entry_kind + status identity invariant + corrupted-entry repair

## Overview

**Implementation 1** of the assertinvariant resolution report. `meta_state_patch` corrupts `entry_kind` on existing entries (finding `meta-260712T0053Z`). Two loop-design entries were corrupted this session — stored `entry_kind` flipped `"loop-design"` → `"finding"`, and the patch tool's branch-mismatch guard made them un-repairable through `meta_state_patch`.

Red-team (Security lens) found the **same injection class on `status`**: `status: z.enum(["active","inactive"]).default("active")` on the rule (`meta-state.js:209`) and loop-design (`:238`) schemas. Under `.partial()`, an empty or kind-specific patch on a rule/loop-design silently injects `status:"active"` — re-activating a deliberately deactivated rule or a shipped/superseded design. Empirically confirmed with the project's Zod 4.4.3. Per the source report's universal-scope direction ("curating the field list is a hand-wave — the next session will hit a domain not on the list"), Fix A omits **both** `entry_kind` and `status` from every per-kind patch schema. Fix B is a one-line `delete cleanPatch.entry_kind` in `updateEntry` (defense-in-depth for direct core callers; the finding's own recommended fix). Then a one-shot `meta_state_batch` repair re-asserts `entry_kind:"loop-design"` on the two corrupted entries. Phase 2 adds `entry_kind` + `status` to `IMMUTABLE_PATCH_FIELDS` as a post-repair stopgap, closing the batch identity hole until the universal `assertinvariant` wrapper ships (Implementation 3).

Per the operator's expand-scope, **each logical change is backed by one `meta_state_log_change` filed AFTER the edit lands** — operator-confirmed ordering (edit-first, change-log-after) eliminates the audit/reality divergence window red-team raised: the change-log records what actually happened, so it never claims a change that didn't land. Two change-logs: one for the code fix (Fix A + Fix B together — same file, same finding, same edit session), one for the data repair (`meta-state.jsonl` — different target). The finding stays `open`; it closes with the universal wrapper.

**Scope honesty:** Fix A (schema-level `.omit`) goes **beyond** the finding's recommended fix (the finding recommends only Fix B — strip in `updateEntry`). The report's § The principle point 3 calls the updateEntry strip a "symptom fix"; Fix A is the deeper root-cause fix. This plan ships both because red-team proved the schema injection is the actual vector and the `status` sibling is the same class. This is an explicit, acknowledged expansion of "Implementation 1," not a claim of faithful adherence to the report's literal recommended fix.

**TDD structure (per `--tdd` flag):** Phase 1 writes RED regression tests first through the `withMcpServer`/`callTool` harness (the bug only fires at the MCP schema layer — direct handler calls bypass validation), then the minimum code that turns RED → GREEN.

## The bug chain (confirmed from source)

1. `meta-state-patch-tool.js:23` — `patch: z.union(PATCH_KINDS.map(k => buildPatchSchemaFor(k)))`. Each branch is `metaStateXxxSchema.partial().strict()`.
2. `meta-state.js:89` (and 209, 238) — `entry_kind: z.literal("finding").default("finding")` / `status: z.enum(["active","inactive"]).default("active")`. Under `.partial()`, an empty `{}` matches the first union branch and `.default()` injects `{entry_kind:"finding"}` (and, on rule/loop-design branches, `{status:"active"}`).
3. `meta-state.js:642-646` — `Object.assign(entry, cleanPatch)` writes the injected fields into the stored entry. Identity/lifecycle flips; version bumps.
4. `meta-state-patch-tool.js:43` — `if (entry.entry_kind !== entry_kind) return branch_mismatch`. After corruption the stored kind is `"finding"`; declaring `entry_kind:"loop-design"` is refused. The patch tool **cannot repair** its own corruption.

`entry_kind` and `status` are NOT in `IMMUTABLE_PATCH_FIELDS` (`meta-state.js:290-300`) — the deny-list provides zero identity/lifecycle protection. Fix A is the sole schema-level guard; Fix B is defense-in-depth at the core layer; the Phase 2 stopgap extends the guard to the batch path.

## Architecture

| Layer | Today | After this plan |
|---|---|---|
| Patch schema (`buildPatchSchemaFor`) | Each branch is `metaStateXxxSchema.partial().strict()`; `.default()` on entry_kind + status injects on every patch | `.omit({ entry_kind: true, status: true })` on rule + loop-design, `.omit({ entry_kind: true })` on finding + change-log, before `.partial().strict()`; no injection (Fix A) |
| Core (`updateEntry`) | `Object.assign(entry, cleanPatch)` writes whatever is in the patch, including a smuggled entry_kind | `delete cleanPatch.entry_kind` (one line alongside the existing `__proto__`/`constructor` strips); identity preserved (Fix B) |
| Batch (`IMMUTABLE_PATCH_FIELDS`) | entry_kind + status ∉ set; batch update can flip identity/lifecycle on any entry | Phase 2 adds both to the set post-repair; batch identity hole stopgap-closed until Implementation 3 |
| Repair path | Two entries stored as `entry_kind:"finding"`; patch tool refuses; direct file edit write-gated | `meta_state_batch` update op re-asserts `entry_kind:"loop-design"` (no branch check, clears the deny-list BEFORE the Phase 2 stopgap) |
| Audit trail | Change-log entries filed ad hoc | Each logical change followed by one `meta_state_log_change` (edit-first, change-log-after — no audit/reality divergence); 2 total |

### Architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| Fix A scope | Omit `entry_kind` on all 4 branches + `status` on rule + loop-design | Red-team proved `status` is the same `.default()`-under-`.partial()` injection class. The source report's universal-scope direction says curating the field list is a hand-wave. `entry_kind` is identity; `status` is lifecycle identity (deactivation/ship is an operator decision). Both are set by dedicated tools (branch-selector param / promote_rule / propose_design), never by a field patch. |
| Fix B | One-line `delete cleanPatch.entry_kind` in `updateEntry`, no dedicated phase/test/change-log | Defense-in-depth for direct core callers (promote-rule, dispatch, re-verify, resolve, supersede) that bypass the patch schema. The finding's own recommended fix. R2/R1: 6 of 7 `updateEntry` callers never send entry_kind — the strip is a no-op for them. Demoted from a phase to a one-liner (red-team Scope #1): Fix A is the load-bearing fix; Fix B is belt-and-suspenders. |
| Fix B scope | `updateEntry` ONLY — NOT the batch update path (`meta-state.js:754-777`) | The batch path is the Phase 1 repair mechanism. Stripping there would break the repair. The batch hole is closed by the Phase 2 `IMMUTABLE_PATCH_FIELDS` stopgap (deny-list) and fully closed by Implementation 3's universal wrapper (before/after comparison, not deny-list). |
| Batch hole closure | Add `entry_kind` + `status` to `IMMUTABLE_PATCH_FIELDS` in Phase 2 (post-repair) | Red-team (Assumption #1): the during-repair constraint ("adding blocks the batch repair") vanishes once Phase 1's repair completes. Phase 2 adds both fields post-repair as a stopgap until Implementation 3. Zero downside; closes the open identity hole. |
| Repair mechanism | `meta_state_batch` update op | Direct file edit to `meta-state.jsonl` is blocked by `bound-artifacts.js:57-64` (no preflight unlock). `meta_state_patch` cannot repair (branch-mismatch guard). Batch has no branch check + no re-validation — the only viable MCP path. Confirmed end-to-end. |
| Finding closure | `meta-260712T0053Z` stays `open` | Report Implementation order step 3 closes it (universal wrapper). This plan is step 1. The finding is an instance of the meta-pattern; the CLASS closes with the canonical primitive. (Red-team Assumption #6 noted the instance-vs-class ambiguity; the plan follows the report's literal assignment.) |
| Change-log granularity | One per logical change (2 total): code fix, data repair | Operator confirmed: "every patch" = every logical change, not every file edit. Fix A + Fix B are one logical change (same file, same finding, same edit session). The repair is a second logical change (different target: `meta-state.jsonl`). |
| Change-log timing | Filed AFTER the edit lands | Operator-confirmed (validation interview): edit-first, change-log-after. Eliminates the audit/reality divergence window red-team (Security #4) raised — the change-log records what actually happened, never a change that didn't land. The "before" reading would have the change-log claim a change before the file changes, lying if the edit crashed. |

## Phases

| Phase | Name | Status | TDD Color | Dependencies |
|-------|------|--------|-----------|--------------|
| 1 | [Fix + repair](./phase-01-fix-a-omit-entry-kind-from-patch-union-schema.md) | In Progress | RED (4 tests) → GREEN + repair read-back | — |
| 2 | [Regression and closeout](./phase-04-full-regression-and-closeout.md) | Pending | CLOSE + stopgap | Phase 1 |

> **Phase file naming:** the CLI scaffolded 4 phases. Collapsed to 2 per red-team (Scope #2). Phase 1 reuses `phase-01-...`; Phase 2 reuses `phase-04-...` (renamed in its frontmatter). The intermediate stubs `phase-02-...` and `phase-03-...` are deleted. The `ck plan status` frontmatter `phases` count is regenerated by the CLI on next status read.

**Total effort estimate:** ~2h (RED tests ~0.5h, GREEN fixes ~0.25h, repair + read-back ~0.25h, regression + stopgap + change-logs + journal ~1h).

## Dependencies

### Outgoing
- **None.** Self-contained bug fix. The universal `assertinvariant` wrapper (Implementation 3, tracked by `loop-design-assertinvariant-universal-scope`) builds on this plan's fixes but is a separate plan.

### Incoming
- **None.** Foundational bug fix.

### Out of scope (deferred — Implementation 3, universal `assertinvariant` wrapper)
- Replacing the Phase 2 `IMMUTABLE_PATCH_FIELDS` stopgap with before/after identity comparison at both `updateEntry` and the batch path.
- Wrapping `updateEntry`/`archiveEntry`/`deleteEntry` + the batch path in the `assertinvariant` primitive.
- Resolving finding `meta-260712T0053Z` (closes when the universal wrapper ships).
- Flipping `loop-design-assertinvariant-core-logic-invariant-wrapper` to `inactive` via supersede (when the canonical universal-scope design ships).
- Promoting `rule-assertinvariant-at-boundary` (agent-side consult).
- Field-level batch gate-log audit (red-team Security #5 — batch logs only `op_count`; deferred to Implementation 3).

## Acceptance Criteria

- [ ] Empty patch `{}` on a loop-design preserves `entry_kind:"loop-design"` (Phase 1 RED — no first-union-branch injection)
- [ ] Empty patch `{}` on an inactive rule preserves `status:"inactive"` (Phase 1 RED — no status re-activation)
- [ ] `entry_kind` inside `patch` is rejected (Phase 1 RED — registry state unchanged; test handles `callTool` SyntaxError)
- [ ] Gate-log `fields_patched` for an empty patch is `[]`, not `["entry_kind"]` (Phase 1 honest-logging, gate-log path `.claude/coordination/gate-log.jsonl`)
- [ ] `updateEntry` strips a smuggled `entry_kind` (Phase 1 Fix B defense-in-depth)
- [ ] Two corrupted entries have `entry_kind:"loop-design"` after the `meta_state_batch` repair (Phase 1 read-back)
- [ ] Each logical change backed by a `meta_state_log_change` filed AFTER the edit lands (2 total: code fix, data repair; edit-first, change-log-after)
- [ ] `IMMUTABLE_PATCH_FIELDS` includes `entry_kind` + `status` after Phase 2 (batch hole stopgap)
- [ ] Existing test suite passes; `pnpm gate:self-verify` passes (Phase 2 — `gate:self-verify` re-seeds `file-index.jsonl` via `seed-file-index.mjs`)
- [ ] Finding `meta-260712T0053Z` remains `open`

## Files Modified Summary

### Create
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js` (Phase 1 RED — 4 tests via `withMcpServer`/`callTool`)

### Modify
- `tools/learning-loop-mastra/core/meta-state.js` (Phase 1: `buildPatchSchemaFor` lines 329-340 — Fix A omit entry_kind + status; `updateEntry` lines 642-646 — Fix B strip; `IMMUTABLE_PATCH_FIELDS` jsdoc lines 280-289 — update. Phase 2: `IMMUTABLE_PATCH_FIELDS` lines 290-300 — add `entry_kind` + `status`)
- `tools/learning-loop-mastra/core/meta-state.test.js` (Phase 1 RED — 1 Fix B test calling `updateEntry` directly)

### Mutated via MCP (no source-file edit)
- `meta-state.jsonl` (Phase 1: `meta_state_batch` re-asserts `entry_kind:"loop-design"` on the two corrupted ids; + 2 `meta_state_log_change` entries backing the code fix and the repair)

### Delete
- `plans/.../phase-02-fix-b-strip-entry-kind-in-updateentry.md` (collapsed into Phase 1)
- `plans/.../phase-03-repair-two-corrupted-loop-design-entries.md` (collapsed into Phase 1)

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Test (b) `callTool` throws `SyntaxError` from `JSON.parse` on non-JSON MCP validation error (red-team Failure #1) | High | Phase 1 test (b) wraps `callTool` in try/catch and asserts the **registry state** (`entry.entry_kind` unchanged) as the primary check, not `result.patched`. Verified: `with-mcp-server.js:90-101` does `JSON.parse(content[0].text)` with no `isError` check. |
| Test (d) gate-log path wrong (red-team Failure #2) | High | Phase 1 test (d) reads `join(tempRoot, ".claude", "coordination", "gate-log.jsonl")` (verified via `gate-logging.test.js:79`), not `join(tempRoot, "gate-log.jsonl")`. |
| Concurrent pre-fix session re-corrupts repaired entries via empty-patch injection (red-team Failure #5) | Medium | Phase 1 notes the deployment risk: the fix only protects sessions running the new code. Mitigation: pull the fix to all concurrent sessions before repairing, or repair last. |
| Batch hole left open between Phase 1 repair and Phase 2 stopgap | Medium | Phase 2 adds `entry_kind` + `status` to `IMMUTABLE_PATCH_FIELDS` immediately after the repair; the window is within one plan execution. |
| `IMMUTABLE_PATCH_FIELDS` stopgap blocks a future legitimate entry_kind/status set | Low | No legitimate caller sets these via batch update after the repair; lifecycle transitions use dedicated tools. Implementation 3 replaces the deny-list with a comparison wrapper. |
| Change-log filed but edit crashes (audit/reality divergence) | Low | Phase 1 post-edit reconciliation read confirms the change landed; if not, file a superseding change-log. |
| Fallow false positive on edited `meta-state.js` | Low | AGENTS.md §7: `introduced:true` without `crap`/`coverage_pct` is a local artifact; `gate:self-verify` re-seeds first. CI SARIF is source of truth. |

## Open Questions

None at plan-creation time. Decisions settled by red-team + operator:

1. **Resolve `meta-260712T0053Z` here?** — No. Closes with Implementation 3 (universal wrapper). This plan is step 1.
2. **Close the batch hole here?** — Stopgap in Phase 2 (add to `IMMUTABLE_PATCH_FIELDS` post-repair); full closure with Implementation 3.
3. **Expand Fix A to `status`?** — Yes (operator-confirmed). Same injection class; universal-scope direction.
4. **Change-log granularity?** — Per logical change (operator-confirmed): 2 total (code fix, data repair).
5. **Phase count?** — 2 (operator-confirmed). Fix + repair in Phase 1; regression + stopgap + closeout in Phase 2.

### Red-team findings rejected (with reason)
- **Failure #6** (`.omit` × `stripEnvelope` interaction): empirically verified safe — `.omit` preserves `z.preprocess(stripEnvelope,...)` on `proposed_design_for`/`addresses`. No action.
- **Failure #7** (compaction divergence updateEntry vs batch): pre-existing, not plan-introduced, doesn't affect the repaired (active) entries. No action.
- **Failure #8** (version jump to 2): CAS is comparison-based; no starting-version assumption. No action.
- **Scope #9** ("leave hole open" dance is complexity): forced by the write-gate constraint, not chosen. Documented.

## Post-Plan Handoff

After both phases complete + Phase 2 regression passes, recommend `/ck:cook plans/260712-0109-meta-state-patch-entry-kind-invariant/plan.md`. The plan is small and well-understood; red-team (4-lens) + validation gates ran in this `--deep` session. The next broader step is Implementation 3 (universal `assertinvariant` wrapper), tracked by `loop-design-assertinvariant-universal-scope` — a separate plan.

## Red Team Review

### Session — 2026-07-12
**Reviewers:** Security Adversary · Failure Mode Analyst · Assumption Destroyer · Scope & Complexity Critic (4 lenses)
**Findings applied:** 11 (1 Critical schema-scope expansion, 2 Critical test-robustness fixes, 1 High batch-stopgap, 1 High scope-honesty ack, structural collapse 4→2 phases, 2 change-logs, redundant steps dropped)
**Findings rejected:** 4 (verified safe or pre-existing — see Open Questions § Red-team findings rejected)

Key accepted findings (full detail in phase files):
- **Security #1 (Critical):** `status` `.default("active")` is the same injection class → Fix A expanded to omit `status` too.
- **Failure #1/#2 (Critical/High):** test (b) must handle `callTool` `SyntaxError`; test (d) gate-log path is `.claude/coordination/gate-log.jsonl`.
- **Assumption #1 (High):** batch hole stopgap (`IMMUTABLE_PATCH_FIELDS` post-repair) — during-repair constraint vanishes after Phase 1.
- **Assumption #2 (High):** Fix A is scope expansion beyond the report's Fix B → acknowledged explicitly in Overview.
- **Scope #1/#2/#3:** Fix B demoted to one-liner; 4 phases → 2; 3 change-logs → 2.

### Whole-Plan Consistency Sweep

After red-team edits, re-read `plan.md` and both phase files. Reconcile:
- ✅ Phase table shows 2 phases (4→2 collapse applied)
- ✅ "finding stays open" stated once (decisions table) + once (acceptance) + once (Phase 2); trimmed from 8× to 3×
- ✅ `status` appears in Fix A scope, acceptance criteria, risks, and Phase 1 — consistent
- ✅ `IMMUTABLE_PATCH_FIELDS` stopgap appears in Architecture, Phase 2, acceptance — consistent
- ✅ Test (b) SyntaxError handling + test (d) gate-log path applied in Phase 1
- ✅ `refresh_file_index` removed (gate:self-verify re-seeds); duplicate read-back removed
