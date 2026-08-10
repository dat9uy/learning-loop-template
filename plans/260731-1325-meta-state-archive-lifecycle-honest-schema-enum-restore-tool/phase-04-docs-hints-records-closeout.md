---
phase: 4
title: "Docs + hints + records closeout + journal"
status: completed
priority: P1
effort: "1.5h"
dependencies: [3]
---

# Phase 4: Docs + hints + records closeout + journal

## Overview

Reconcile `docs/meta-state-lifecycle.md` and the `hint-registry.js` warm hint with the new lifecycle (`archived` is schema-valid; write-boundary guard; restore tool), log a loop-design entry recording the decision, cite it from both source findings, refresh drifted evidence, resolve both findings, and write a journal entry.

## Requirements

- **Functional:** `docs/meta-state-lifecycle.md` reflects `archived` as a schema-valid status (not "runtime-only / outside the persisted enum") with the write-boundary guard and the restore tool. The warm hint at `core/hint-registry.js:84` is updated. Both findings resolved. A loop-design entry cites the lifecycle decision; both findings' `source_refs` cite it.
- **Non-functional:** Docs churn is scoped to behavior that changed (the lifecycle model, the restore tool) — no evergreen churn for internal edits. `meta_state_derive_status` runs before each resolve; `meta_state_refresh_file_index` runs after touching cited code (the enum/guard/restore sites) to re-ground cited findings' hashes.

## Architecture

Docs/hints to update (behavior changed → required per documentation-management rule):

1. `docs/meta-state-lifecycle.md`:
   - **Decision #1 (L219)** "Why `archived` is outside the schema enum" — invert: `archived` is now schema-valid (finding/rule/loop-design); the write-boundary guard preserves append-only-via-`archiveEntry`/`deleteEntry`; the trade-off flipped because the parseForRead band-aid was accruing callers and the parse-crash class was load-bearing.
   - **Status Definitions table (L67)** — `archived` row: change "runtime-only" → schema-valid; add the restore tool as an exit.
   - **Terminal vs Non-Terminal (L89-95)** — after the enum change, the schema-enum terminal set (`{resolved,superseded,archived}` for the 3 kinds) and the predicate-effective terminal set (`constants.js:45`, `{resolved,superseded,archived}`) are **identical**. Collapse the two-set framing to one (red-team L1): the "archived is in the predicate terminal set but not the schema enum" distinction (L95) no longer holds. Fix the stale `core/meta-state.js:91` ref (the enum is at L362). State explicitly that `core/meta-state.js:247` `TERMINAL_STATUSES` (`{resolved,superseded}`, WITHOUT archived) is a code-internal open-predicate helper (used by the write path), NOT the schema-enum terminal set — do not conflate the two.
   - **Archive Mechanics (L99-110)** — note `archived` is schema-validated on read now; add a Restore subsection (true-append supersedes tombstone; `meta_state_unarchive` restores the pre-archive **live** status + content; rejects delete-tombstone unconditionally — no flag). The restored line IS the pre-archive state at a new version — no `restored_*` audit fields are persisted; the version sequence is the audit trail, and the restore *action* is logged in the gate log (validation decision — "when we read, we always read the final version").
   - **Transitions (L73-81)** — add `archived --[meta_state_unarchive]--> <pre-archive status>`.
   - **Tools table (L154-167)** — add a `meta_state_unarchive` row.
2. `tools/learning-loop-mastra/core/hint-registry.js:84` — the warm hint says `archived` is "applied at runtime by `meta_state_archive` (not in the persisted enum)". Update to: `archived` is a schema-valid terminal status (finding/rule/loop-design), append-only via `archiveEntry`/`deleteEntry` (write-guard on the union), restorable via `meta_state_unarchive`.

Records (via MCP/CLI tools — never direct file writes):
3. **CRITICAL — repoint finding 2's evidence BEFORE either resolve (red-team C1):** finding `meta-260731T1102Z` has `evidence_code_ref = tools/learning-loop-mastra/core/entry/parse-for-read.js`, `mechanism_check: true`, `status: open`. Phase 1 *deletes* that file. The `rule-no-orphaned-evidence` consult-gate (`gate-logic.js:844-901`) scans **all** `isOpen && mechanism_check===true` findings on every resolve (global, not per-finding) and hashes each `evidence_code_ref` live. Once the file is gone, finding 2 becomes its own orphan (`code_ref_missing`) → `satisfied:false` → blocks resolving **both** findings (not just finding 2). `meta_state_refresh_file_index` cannot hash a deleted file; `meta_state_re_verify` cannot pass against a missing file. So, before either `meta_state_resolve`: `meta_state_patch({ id:"meta-260731T1102Z…", entry_kind:"finding", patch:{ evidence_code_ref:"tools/learning-loop-mastra/core/meta-state.js" } })` (`evidence_code_ref` is NOT on `IMMUTABLE_PATCH_FIELDS` — patchable) → `meta_state_refresh_file_index({ path:"tools/learning-loop-mastra/core/meta-state.js" })` to baseline the new ref. This repoints finding 2 at a live path this plan touches (the enum/guard/restore logic all land in `core/meta-state.js`), clearing the closeout deadlock.
4. Log a loop-design entry via `meta_state_propose_design` recording the lifecycle decision (honest-schema approach A + write-guard + restore tool), then ship it via `meta_state_ship_loop_design` citing this plan id once phases ship. (Red-team verified no existing loop-design matches this decision; idempotency concern is moot.)
5. `meta_state_derive_status` on both findings → `meta_state_resolve` each, citing the loop-design id in `source_refs`. The write-side finding's stale premise ("`IMMUTABLE_PATCH_FIELDS` does NOT include `status`" — it does, `meta-state.js:688`) is corrected in its resolution note. Its dead `evidence_test` (`tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` — the `loop-mcp` dir no longer exists; live path is `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-archive-tool.test.js`) is corrected for hygiene (red-team M3: `evidence_test` is never file-hashed by the consult-gate, so this does NOT block resolve — but correct it for accuracy).
6. `meta_state_refresh_file_index({ path })` for each touched cited code path (the 3 enums, the union guard, the factories, `restoreEntry`) so anchored findings re-ground — in addition to the C1 repoint in step 3.

## Related Code Files

- Modify: `docs/meta-state-lifecycle.md`
- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (L84 warm hint)
- Records: via `meta_state_propose_design` / `meta_state_ship_loop_design` / `meta_state_derive_status` / `meta_state_resolve` / `meta_state_refresh_file_index` (CLI: `LOOP_SURFACE=.mastracode node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'`)

## Implementation Steps

1. Update `docs/meta-state-lifecycle.md` sections listed in Architecture #1 (collapse the two-set terminal framing per L1).
2. Update `core/hint-registry.js:84` warm hint per Architecture #2.
3. **C1 (before any resolve):** `meta_state_patch` finding `meta-260731T1102Z` `evidence_code_ref` → `tools/learning-loop-mastra/core/meta-state.js` → `meta_state_refresh_file_index` on that path. (Do this AFTER Phase 1 deletes `parse-for-read.js` but BEFORE the first `meta_state_resolve`.)
4. `meta_state_propose_design` → record the lifecycle decision → `meta_state_ship_loop_design` citing this plan.
5. For each source finding: `meta_state_derive_status` → `meta_state_resolve` with the loop-design id in `source_refs`; correct the write-side finding's stale `IMMUTABLE` premise + dead `evidence_test` path.
6. `meta_state_refresh_file_index` for each touched cited code path.
7. `/ak:journal` — concise entry: the archive-lifecycle gap, the honest-schema decision + write-guard rationale, the restore tool, both findings closed.

## Success Criteria

- [x] **C1:** finding `meta-260731T1102Z` `evidence_code_ref` repointed to `core/meta-state.js` + file-index refreshed BEFORE the first resolve; both findings resolve without the consult-gate blocking.
- [x] `docs/meta-state-lifecycle.md` reflects `archived` as schema-valid + write-guard + restore tool (Decision #1 inverted; Status Definitions, Terminal vs Non-Terminal collapsed to one set, Archive Mechanics + Restore subsection noting no persisted `restored_*` fields, Transitions, Tools table updated).
- [x] `hint-registry.js:84` warm hint updated.
- [x] Loop-design entry logged + shipped citing this plan; both findings resolved with the loop-design id in `source_refs`.
- [x] Write-side finding's stale `IMMUTABLE` premise + dead `evidence_test` path corrected.
- [x] `meta_state_refresh_file_index` re-grounds touched cited paths.
- [x] Journal entry written.

## Risk Assessment

- **Risk (red-team C1, resolved):** deleting `parse-for-read.js` makes finding 2 its own orphan in the global `rule-no-orphaned-evidence` consult-gate, blocking both resolves. **Mitigation:** step 3 repoints finding 2's `evidence_code_ref` to `core/meta-state.js` + refreshes the file index BEFORE any resolve. This is the load-bearing closeout step; skipping it makes criterion #10 unachievable.
- **Risk:** Docs churn beyond what changed (evergreen pollution). **Mitigation:** scope strictly to the lifecycle model + restore tool + the collapsed terminal framing; do not rewrite unrelated sections.
- **Risk:** Resolving a finding whose evidence has drifted triggers the `rule-no-orphaned-evidence` consult-gate. **Mitigation:** C1 repoint + `meta_state_derive_status` first + `meta_state_refresh_file_index` on cited paths before resolve; if the gate still blocks, re-verify via `meta_state_re_verify({id, refresh:true})`.
- **Risk:** The loop-design entry's `addresses`/`proposed_design_for` set must match an existing design's for idempotency. **Mitigation:** red-team verified no existing loop-design matches this decision; if one is found at execution time, ship that one rather than creating a duplicate.
