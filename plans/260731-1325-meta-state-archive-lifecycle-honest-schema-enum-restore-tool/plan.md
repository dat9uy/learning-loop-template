---
title: "Meta-State Archive Lifecycle — honest schema enum + restore tool"
description: "Promote `status:\"archived\"` into the per-kind write schemas (finding/rule/loop-design) so factory-built reads stop crashing on archived tombstones, delete the parseForRead read-tolerance shim, add a write-boundary guard preserving `archived` as append-only via archiveEntry/deleteEntry, and add a sanctioned `meta_state_unarchive` restore tool. Closes meta-260614T1236Z (write-side unarchive) and meta-260731T1102Z (read-side archive-status divergence)."
status: pending
priority: P1
effort: "1.5d"
branch: "main"
tags: [meta-state, archive-lifecycle, schema, versioned-append, cli-surface, meta-state-tools]
blockedBy: []
blocks: []
created: "2026-07-31T13:25:00.000Z"
createdBy: "ak:plan"
addresses:
  - "meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi"
  - "meta-260731T1102Z-under-the-append-only-versioned-append-cli-surface-meta-stat"
source: skill
---

# Meta-State Archive Lifecycle — honest schema enum + restore tool

## Overview

`status:"archived"` is a second-class citizen in the meta-state model. `archiveEntry`/`deleteEntry` write it directly as a versioned-append tombstone line, but the per-kind Zod write schemas deliberately exclude it from the status enum (`meta-state.js:242-245,362`). Every read path that builds an entry factory from a projected (max-version) row — `meta_state_relationships`, `validateCrossRefs`, `outboundRefsAll` — re-parses that row through the write schema, so an archived entry crashes `schema.parse` with a ZodError. A band-aid (`core/entry/parse-for-read.js`) strips+restores `"archived"` around the parse in the 3 factories. On the write side there is no sanctioned un-archive: recovering from an erroneous archival once required a direct edit of `meta-state.jsonl` (finding `meta-260614T1236Z`).

This plan gives the archive lifecycle official treatment (brainstorm approach A — honest schema):

- **Read:** promote `"archived"` into the finding/rule/loop-design status enums; delete `parse-for-read.js` + its 3 imports. `schema.parse` then accepts the reality the tombstone already writes; the parse-crash class vanishes by construction, not by workaround.
- **Write-boundary guard:** adding `"archived"` to the enums also lets the union `metaStateEntrySchema` (the write-validation gate) accept a caller-supplied `status:"archived"` on `writeEntry`/`metaStateBatch case:"write"` — eroding the invariant that `archived` is append-only via `archiveEntry`/`deleteEntry` (which bypass the union via `trueAppendAtomicRaw`). A union-level refine closes this forge vector in one DRY spot. Reads use per-kind schemas via factories, so the guard never touches read paths.
- **Restore:** add `restoreEntry` (core) + `meta_state_unarchive` (tool) — a true-appended line that supersedes the archive tombstone (max-by-version wins), wrapped with `assertinvariant`. Direct JSONL edits stop being a recovery path.

**Key research findings that shape the plan** (paths relative to `tools/learning-loop-mastra/`):
- `CANONICAL_STATUS_KEYS` already includes `"archived"` (`core/operation-envelope.js:68-73`); `by_status` stats already count archived tombstones. **The stats contract cost is zero** — the only contract change is the enum itself.
- The enum change must cover **three** enums (finding L362, rule L539, loop-design L615). `deleteEntry` appends `status:"archived"` tombstones for any non-change-log kind; removing `parseForRead` without adding `"archived"` to rule/loop-design enums would crash `createRule`/`createLoopDesign` on deleted rows.
- `loadPromotedRules` (`core/gate-logic.js:766`) already filters `status==="active"` before its `safeParse` (L773) — gate rule evaluation is safe before and after; no action.
- `parseForRead` is imported only by `finding.js`, `rule.js`, `loop-design.js` (not `change-log.js`); no other importers exist.
- `readRegistryAllVersions(root)` returns every version line per id (sorted id asc, version asc) — the helper `restoreEntry` uses to recover the pre-tombstone live status + content.
- assertinvariant-at-boundary is agent-enforced, not test-enforced (no boundary-coverage test exists; `check_assertinvariant_coverage` MCP tool is referenced in the rule but not wired). The plan adds a golden-fixture test for `restoreEntry` to make the invariant test-enforced.
- `meta_state_unarchive` must be classified in **three** places or tests fail: `tools/manifest.json`, `agent-manifest.json` `groups.meta_state.tools`, `core/cli-tools.js` `CLI_WRITE_TOOLS`. The drift test has no silent default.

**Red-team corrections (deep-mode adversarial review, locked into the phases):**
- **C1 (CRITICAL):** deleting `parse-for-read.js` makes finding `meta-260731T1102Z` its own orphan in the global `rule-no-orphaned-evidence` consult-gate, blocking BOTH resolves. Phase 4 repoints its `evidence_code_ref` to `core/meta-state.js` + refreshes the file index BEFORE the first resolve.
- **D1 (HIGH):** `restoreEntry`'s recovery filter excludes prior tombstones (`status !== "archived"`) so `archive→batch-delete→restore` can't pick a prior archive tombstone and produce a "restored" line that is still archived.
- **D2/H2 (MEDIUM):** rejection shape is the archive-style bucket `{restored:false, reason, id}` (DRY with `archiveEntry`), not a divergent `{ok, reason_code}`. assertinvariant wraps the single `not_archived` pre-condition (via `assertArchivedTombstone`) for gate-log audit — that one wrapper covers both already-active and change-log targets.
- **H1:** no `change_log_immutable` branch in `restoreEntry` (change-logs are always `status:"active"` → `assertArchivedTombstone` returns `not_archived` first); adding the branch would be dead code.
- **M1 (YAGNI):** no `allow_delete_restore` flag — delete-tombstones reject unconditionally (`delete_not_restorable`). The incident was an erroneous archive, not delete.
- **M2/L1:** `restored_*` fields were dropped entirely (validation decision — the restored line is the pre-archive state at a new version; the version sequence is the audit trail, the restore action is gate-logged), so the M2 read-visibility concern is moot; the docs two-set terminal framing collapses to one after the enum change.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `status:"archived"` is schema-valid for finding/rule/loop-design; factory-built reads never crash on archived tombstones without a per-call workaround | P0 |
| 2 | `archived` remains append-only via `archiveEntry`/`deleteEntry` — a write-boundary guard rejects forged `status:"archived"` through `writeEntry`/batch-write | P0 |
| 3 | `meta_state_unarchive` restores an archived entry via a true-appended line, through CLI + MCP, wrapped with `assertinvariant` — no direct JSONL edit needed | P0 |
| 4 | Docs + warm hints reflect the new lifecycle; both source findings resolved with corrected evidence | P1 |

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Phase 1: Honest schema enum + write-boundary guard + remove parseForRead](./phase-01-honest-schema-enum-write-guard-remove-parseforread.md) | Pending | 4h |
| 2 | [Phase 2: restoreEntry core function + assertinvariant wrapping](./phase-02-restoreentry-core-assertinvariant.md) | Pending | 3h |
| 3 | [Phase 3: meta_state_unarchive tool — manifest + classification + handler](./phase-03-meta-state-unarchive-tool-manifest-classification.md) | Pending | 3h |
| 4 | [Phase 4: Docs + hints + records closeout + journal](./phase-04-docs-hints-records-closeout.md) | Pending | 1.5h |

## Dependencies

- **Blocked by:** none (the two relevant priors are done: `260712-0724-assertinvariant-universal-primitive` shipped the wrapper primitive; `260717-1451-meta-state-list-include-all-versions` shipped `readRegistryAllVersions`, which `restoreEntry` reuses).
- **Blocks:** none (no pending plans depend on this — verified via cross-plan scan 2026-07-31).
- **In-plan ordering:** strict. Phase 1 makes the read-side honest; Phase 2 ships the core restore primitive; Phase 3 exposes it as a tool; Phase 4 reconciles docs/hints and closes the findings. Phase 2 depends on Phase 1's enum change (restore roundtrip test asserts `meta_state_relationships` over an archived entry doesn't crash — that needs the enum fix).

## Acceptance Criteria (whole plan)

1. `createFinding`/`createRule`/`createLoopDesign` survive a `status:"archived"` row via direct `schema.parse` (no `parseForRead`); `core/entry/parse-for-read.js` is deleted and no production module imports it.
2. `meta_state_relationships({ id })` over an archived finding/rule/loop-design returns without a ZodError (regression test).
3. `writeEntry` and `metaStateBatch` `case:"write"` reject a caller-supplied `status:"archived"` with a clear reason (write-boundary guard test).
4. `CANONICAL_STATUS_KEYS`/`by_status` stats are unchanged (archived already counted); no stats-contract regression.
5. `restoreEntry` restores an archived entry to its pre-archive **live** status + content (read via `readRegistryAllVersions`, filtering out prior tombstones), clears `archived_*` + `tombstone_kind`, bumps `version` past the tombstone, and is the new max-version line. Wrapped with `assertinvariant`.
6. `restoreEntry` rejects already-active (`not_archived`), change-log (`not_archived` — change-logs can never be archived), and `tombstone_kind:"delete"` unconditionally (`delete_not_restorable`, no flag) — bucket `{restored:false, reason, id}` shape (DRY with `archiveEntry`), mutation does not run (golden-fixture test). The recovery filter excludes prior tombstones (`status !== "archived"`) so a restored line is never itself archived (red-team D1).
7. `meta_state_unarchive({ id, reason? })` rides CLI + MCP; classified in `tools/manifest.json` + `agent-manifest.json` + `CLI_WRITE_TOOLS`; `cli-write-tool-set-drift` + `runtime-agnostic.test.js` green; `check_runtime_agnostic` audit passes. No `allow_delete_restore` flag (red-team M1 — YAGNI; the incident was an erroneous archive, not delete).
8. End-to-end: `archive → meta_state_relationships (no crash) → meta_state_unarchive → readRegistry shows restored status → meta_state_relationships again` is green.
9. `docs/meta-state-lifecycle.md` (Decision #1, Status Definitions, Terminal vs Non-Terminal, Archive Mechanics, transitions, tools table) + `core/hint-registry.js:84` warm hint reflect `"archived"` as schema-valid with the write-boundary guard + the restore tool.
10. Both source findings resolved via `meta_state_resolve` (after `meta_state_derive_status`); finding `meta-260731T1102Z`'s `evidence_code_ref` is repointed from the deleted `parse-for-read.js` to `core/meta-state.js` and file-index refreshed BEFORE the first resolve (red-team C1 — the global `rule-no-orphaned-evidence` consult-gate would otherwise block both resolves); the write-side finding's stale "IMMUTABLE doesn't include status" premise is corrected; a loop-design entry logs the lifecycle decision and is cited in both findings' `source_refs`; `meta_state_refresh_file_index` run after touching cited code.

## Open Questions

None. All design forks resolved during research + red-team (see Overview + phase red-team corrections). Follow-ups flagged out-of-scope: (a) a `restore` op in `metaStateBatch` (`BATCH_OP_TYPES` has no `"restore"`); (b) wiring the referenced-but-absent `check_assertinvariant_coverage` MCP tool; (c) bulk multi-id unarchive; (d) an `allow_delete_restore` flag if an erroneous-delete incident occurs (red-team M1); (e) upstream hardening — make `deleteEntry` + batch `case:"delete"` reject already-archived targets via `assertNotArchived` so tombstones can never stack (red-team D1; the recovery `status !== "archived"` filter is sufficient alone, this is defense-in-depth); (f) `updateEntry` lacks an `IMMUTABLE_PATCH_FIELDS` check for direct core callers (pre-existing, red-team S5).

## Validation Log

### Verification Results (validate Step 2.5, Standard tier — 4 phases)

- Claims checked: 14 (load-bearing claims across all 4 phases, verified against live source)
- Verified: 14 | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Verification method: 3 read-only researchers + 2 adversarial red-team reviewers (invariant/correctness lens + contract/scope lens), each grounding claims in `core/meta-state.js`, `core/operation-invariant.js`, `core/constants.js`, `core/entry/*`, `core/gate-logic.js`, `docs/meta-state-lifecycle.md`, live CLI registry queries.

**Verified claims (key):**
- `CANONICAL_STATUS_KEYS` already includes `"archived"` (`core/operation-envelope.js:68-73`); `by_status` z.record uses `z.enum(CANONICAL_STATUS_KEYS)` (`meta-state.js:463,468`); stats contract cost is zero.
- The enum change must cover 3 enums (finding L362, rule L539, loop-design L615); `deleteEntry` (L1425-1469) appends `status:"archived"` for any non-change-log kind.
- `writeEntry` (L1186) forwards caller `status` via `metaStateEntrySchema.safeParse` → persists `validation.data`; the union write-guard is real-needed and write-only (reads use per-kind factories; `archiveEntry`/`deleteEntry`/`restoreEntry` bypass the union via `trueAppendAtomicRaw`).
- `loadPromotedRules` filters `status==="active"` before `safeParse` (gate-logic.js:766/773) — gate eval safe.
- `parseForRead` imported only by `finding.js`/`rule.js`/`loop-design.js`.
- `readRegistryAllVersions` returns all version lines per id (sorted id asc, version asc).
- C1 (CRITICAL): finding `meta-260731T1102Z` `evidence_code_ref = parse-for-read.js`, `mechanism_check:true`, `status:open`; the consult-gate (gate-logic.js:844-901) scans all `isOpen && mechanism_check===true` findings globally → deleting the file blocks both resolves; `evidence_code_ref` is patchable (not on `IMMUTABLE_PATCH_FIELDS`, L677-694).
- D1 (HIGH): `deleteEntry` (L1433) + batch `case:"delete"` (L1765) do NOT reject already-archived targets (only `case:"archive"` calls `assertNotArchived` at L1788) → `archive→batch-delete→restore` reachable; recovery `status !== "archived"` filter is the load-bearing fix.
- Docs surface set complete: "archived outside enum" claims live only in `docs/meta-state-lifecycle.md` (L49/67/90/91/95/219) + `core/hint-registry.js:84`. `docs/architecture.md:333` ("status: active or archived") is Observation Records (product-surface, out of scope); `AGENTS.md:68` ("→ archived") is a loose conceptual lifespan unchanged by this plan.

### Red-Team Corrections Applied

C1 (CRITICAL) → Phase 4 repoint step; D1 (HIGH) → Phase 2 recovery filter; D2/H2 (MEDIUM) → bucket rejection shape; H1 (HIGH) → drop dead `change_log_immutable` branch; M1 (YAGNI) → drop `allow_delete_restore` flag; M2 → moot (validation dropped `restored_*` fields); L1 (LOW) → collapse two-set terminal framing. **Validation interview decisions:** drop persisted `restored_*` audit fields (restore line = pre-archive state at new version; gate log is the action audit); leave deleteEntry hardening as follow-up; C1 repoint target = `core/meta-state.js`. All corrections + validation decisions propagated to phases; whole-plan consistency sweep clean (no residual `tombstone_kind:"restore"`, no `{ok:false,reason_code}` as return shape, no `allowDeleteRestore` in stub signatures, no dead `change_log_immutable` assertinvariant claim, no persisted `restored_*` fields).

### Validation Interview (3 questions, 3 confirmed)

1. **`restored_*` audit fields** → **Drop them.** Operator rationale: "when we read, we always read the final version" — the restored line IS the pre-archive state at a new version, so restore is self-evident from the version sequence; no persisted audit cruft. Propagated: Phase 2 stub drops `restored_at`/`restored_by`/`restored_reason` + the `restoredBy` param; the restore action is gate-logged via the return's `restored_at`. Phase 4 Restore subsection updated; M2 moot.
2. **Upstream `deleteEntry`/batch-delete hardening** → **Leave as follow-up.** The recovery `status !== "archived"` filter is load-bearing and sufficient; hardening deleteEntry is a separate behavior change with no incident justifying it now. Stays as follow-up (e); no scope change.
3. **C1 repoint target** → **`core/meta-state.js`.** The enum + write-guard + restoreEntry all land there — the substantive heart of the fix the finding diagnoses. Confirms the existing plan text; no change.

### Whole-Plan Consistency Sweep (post-validation)

Re-read `plan.md` + all 4 `phase-*.md`. Searched for stale terms, rejected assumptions, superseded decisions across: `restored_*` fields, `allow_delete_restore`/`allowDeleteRestore`, `change_log_immutable` branch, `{ok:false, reason_code}` return shape, `tombstone_kind:"restore"`, two-set terminal framing, C1 repoint target. All residual mentions are in "dropped/corrected/follow-up" context, not kept-design context. The restoreEntry stub signature (`restoreEntry(root, id, reason)`) and handler call (`restoreEntry(root, id, reason ?? ...)`) match. No unresolved contradictions. **Eligible for implementation.**

