---
phase: 6
title: "docs, plumbing, registry-wide regression"
status: completed
priority: P1
effort: ""
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: docs, plumbing, registry-wide regression

## Overview

Close the migration: update the L2 lifecycle doc, `AGENTS.md` §1, hint-registry
prose, and `operation_envelope` docs to the new model; extend the union-merge
plumbing (`.gitattributes` + the per-clone `git config` recipe + `registry-table.sh`)
to `citations.jsonl`; run the runtime-agnostic audit; and drive the full test
suite green. This is the consistency sweep that reconciles every doc/prose claim
touched by Phases 1–5.

## Requirements

- Functional: `docs/meta-state-lifecycle.md` reflects `open/accepted/resolved/
  archived` (no `superseded`), the new transitions, the terminal set, the
  `meta_state_accept` tool, the citation kind, and the rewritten Three-Mechanism
  Boundary § (file-index is grounding-only; `reopens` writers dropped, read path
  retained; citations are the asserted-relationship layer).
  `AGENTS.md` §1 finding-lifecycle line is updated. `hint-registry.js:83`
  status-count prose is updated. `operation_envelope` `by_status` docs include
  `accepted`. `.gitattributes` marks `citations.jsonl` `merge=union`; the
  per-clone `git config` recipe includes it; `registry-table.sh` reads the union
  of all three files. `check_runtime_agnostic` passes.
- Non-functional: no stale references to `superseded`/`consolidated_into`/
  `origin`/`supersedes`/`promoted_to_rule` as **written** record fields in docs or
  prose (they are inert-historical; the live edges are citations). The wire shape
  (`meta_state_relationships` → `cited_by` for migrated edges) and `ref_field:"citation"`
  are documented. The full `pnpm test` suite is green.

## Architecture

Docs are the escape hatch (`docs/philosophy.md`); this phase rewrites the L2
mechanism surface to match the new code so the next agent reads accurate
lifecycle mechanics. The union-merge plumbing keeps parallel-PR `citations.jsonl`
appends auto-merging (the same `merge=union` driver `change-log.jsonl` uses).
`registry-table.sh` is the shell-side union read; it must include citations so
the operator's `tail -20` inspection sees the full registry.

## Related Code Files

- Modify: `docs/meta-state-lifecycle.md` (status enum table L48-53; Status Definitions L62-69; Status Transitions L74-83; Terminal vs Non-Terminal L89-95; the Three-Mechanism Boundary L235-251; the `reopens`/`cascade_from` deferral L251 → drop-writers note; Finding Exit Roles table L15-23 — add `accept`, rewrite `supersede`; Tools table L161-175 — add `meta_state_accept`, update `supersede`)
- Modify: `AGENTS.md` (§1 finding-lifecycle line 65: `open → accepted | resolved | archived`)
- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (L83 status-count prose — final pass; ensure consistency with Phase 1/5 edits)
- Modify: `tools/learning-loop-mastra/core/operation-envelope.js` (`CANONICAL_STATUS_KEYS` L68 — ensure `by_status` doc/comment reflects `accepted`; no `superseded`)
- Modify: `.gitattributes` (add `citations.jsonl merge=union`)
- Modify: `AGENTS.md` (the per-clone `git config` recipe L127-137 — add `citations.jsonl` to the union-driver setup)
- Modify: `tools/scripts/registry-table.sh` (read the union of `meta-state.jsonl` + `change-log.jsonl` + `citations.jsonl`; dedupe by id)
- Verify: `tools/learning-loop-mastra/__tests__/runtime-agnostic.test.js` (run `check_runtime_agnostic` against the citation feature)

## Implementation Steps

1. Rewrite `docs/meta-state-lifecycle.md`:
   - Status enum table: `finding` → `open | accepted | resolved | archived`
     (4-status; `superseded` gone).
   - Status Definitions + Transitions: add `accepted` (standing trade-off;
     `isOpen` excludes; `meta_state_accept`); collapse `superseded` into
     `resolved`+citation; terminal set `{accepted, resolved, archived}` for
     `isOpen`.
   - Finding Exit Roles table: add `accept` → `meta_state_accept`; rewrite
     `supersede` → "flavor of resolve + a citation to the change-log".
   - Three-Mechanism Boundary §: file-index is grounding-only (NOT a
     relationship layer — correct the investigation's premise); asserted
     relationships are the `citation` kind in `citations.jsonl` (untyped verb in
     `rationale`, surfaced as generic `cited_by`); the 3 migrated fields' named
     inverse maps collapsed into `citations_inverse` (`reopens`/`addresses`/
     `proposed_design_for` named maps stay); `reopens` writers dropped (read path
     retained for 17 historical edges); `cascade_from` removed; migrated fields are
     inert-historical (`.optional()`, de-routed), not deleted.
   - Tools table: add `meta_state_accept`; update `meta_state_supersede` (emits
     citation, no `consolidated_into`); note `meta_state_report` no longer takes
     `reopens`, `meta_state_resolve` no longer takes `cascade_from`,
     `meta_state_patch` emits a rule→rule `supersedes` citation.
2. Update `AGENTS.md` §1 line 65 finding lifecycle; update the per-clone
   `git config` union-driver recipe to include `citations.jsonl`.
3. Add `citations.jsonl merge=union` to `.gitattributes`.
4. Extend `registry-table.sh` to union `citations.jsonl` (dedupe by id across all
   three files).
5. Final `hint-registry.js` L83 prose pass + `operation-envelope.js` `by_status`
   doc (ensure `accepted` present, `superseded` absent).
6. Run `check_runtime_agnostic` against the citation feature (the 6-item
   shim-not-fork + cross-surface-iteration checklist); fix any failures.
7. Run the full `pnpm test` suite; fix any regressions surfaced by the
   whole-plan consistency sweep.
8. **Consistency sweep:** grep the repo (docs + `tools/learning-loop-mastra/`
   non-test) for stale `superseded`/`consolidated_into`/`origin`/`supersedes`/
   `promoted_to_rule`-as-**written**-record-field references and reconcile
   (inert-historical `.optional()` retention is expected, not stale). Confirm the
   wire shape is consistently `cited_by` for migrated edges and named for
   `reopens`/`addresses`/`proposed_design_for`. Confirm zero unresolved
   contradictions.

## Success Criteria

- [ ] `docs/meta-state-lifecycle.md` reflects the new status enum, transitions,
      terminal set, `meta_state_accept`, the citation kind (untyped verb in
      `rationale`; generic `cited_by` wire shape; `citations_inverse`), and the
      rewritten Three-Mechanism Boundary (file-index grounding-only; reopens writers
      dropped; migrated fields inert-historical).
- [ ] `AGENTS.md` §1 finding-lifecycle line + the union-driver `git config`
      recipe include `citations.jsonl`; `.gitattributes` marks it `merge=union`.
- [ ] `registry-table.sh` unions all three files.
- [ ] `hint-registry` + `operation_envelope` prose consistent with the new enum.
- [ ] `check_runtime_agnostic` passes.
- [ ] Full `pnpm test` suite green; consistency sweep reports zero unresolved
      contradictions.

## Risk Assessment

- **Doc drift** is the core risk: the L2 doc has many cross-references (exit
  roles, transitions, terminal set, Three-Mechanism Boundary, the
  `reopens`/`cascade_from` deferral note). The consistency sweep (step 8) is the
  guard; reconcile every stale reference.
- **`registry-table.sh` union** must dedupe by id across all three files (a
  citation id could collide with a `meta-` finding id prefix? — citation ids use
  `citation-` prefix, so no collision; verify in the script).
- **Runtime-agnostic audit**: the citation feature spans the CLI + MCP residue;
  ensure the shim-not-fork pattern holds (the citation substrate is in `core/`,
  shared across runtimes — no runtime-specific fork).
- **`.gitattributes` union driver** requires the per-clone `git config` setup
  (documented in `AGENTS.md`); without it, `merge=union` is a silent no-op and
  parallel citation PRs conflict. The recipe update is load-bearing.