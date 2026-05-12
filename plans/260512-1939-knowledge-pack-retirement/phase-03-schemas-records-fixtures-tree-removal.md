---
phase: 3
title: "Schemas + Records + Fixtures + Tree Removal"
status: complete
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Schemas + Records + Fixtures + Knowledge-Packs Tree Removal

## Overview

Bring the rest of the tree in sync with Phase 2's code removal. Drop `pack` from the URI pattern in five schemas, drop `knowledge_pack_ids` from the experiment schema and from the 14 frozen experiment records, delete the entire `knowledge-packs/` directory, delete eleven pack-related negative fixtures. After this phase the only remaining pack-touch is in the four operator-facing docs (Phase 4) and in the journal/evidence history (intentionally preserved).

## Requirements

- Functional: Schemas validate against AJV; experiment records validate against the updated experiment schema; deleted fixtures no longer fail any "missing fixture" check in the validator (because Phase 2 already removed the references).
- Non-functional: No orphan files. No empty directories left under `fixtures/negative/`. `knowledge-packs/` absent from the working tree and from git.

## Architecture

### Schema edits (6 files)

In each of `schemas/{claim,experiment,decision,risk,capability}.schema.json`, change one line:

```diff
-"source_refs": { "type": "array", "items": { "type": "string", "pattern": "^(local|record|pack|legacy):.+" } },
+"source_refs": { "type": "array", "items": { "type": "string", "pattern": "^(local|record|legacy):.+" } },
```

In `schemas/experiment.schema.json` additionally:
- Remove `"knowledge_pack_ids"` from the top-level `required` array.
- Remove the `"knowledge_pack_ids": { "type": "array", "items": { "type": "string" } }` line from `properties`.

Also note `decision.schema.json` line 13 also references `pack` in its own `source_refs.items.pattern` — confirmed in Phase 2 grep that the same pattern is used in all five schemas. Apply the same edit consistently.

### Experiment record edits (14 files)

Every file matching `records/experiments/*.yaml` currently has a line `knowledge_pack_ids: []`. Drop that line:

- `records/experiments/experiment-loop-capabilities-stack-allowlist-20260510T160000Z.yaml`
- `records/experiments/experiment-meta-install-template-candidate-260512T0046Z.yaml`
- `records/experiments/experiment-operator-product-shape-walkthrough-260511T1900Z.yaml`
- `records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml`
- `records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml`
- `records/experiments/experiment-product-dev-gate-removal-260512T0007Z.yaml`
- `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`
- `records/experiments/experiment-vnstock-install-20260508T101723Z.yaml`
- `records/experiments/experiment-vnstock-install-20260508T171112Z.yaml`
- `records/experiments/experiment-vnstock-install-20260509T071800Z-sandbox-1.yaml`
- `records/experiments/experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml`
- `records/experiments/experiment-vnstock-runtime-403-fix-20260511T143500Z.yaml`

Note three of the listed are also referenced in the negative-fixture lookup (`fixtures/negative/.../experiments/*.yaml`). Those are fixtures-only; the negative fixtures get deleted wholesale in this phase, so no per-fixture YAML edit is needed.

### Knowledge-packs tree deletion

Delete the entire directory and its contents:
- `knowledge-packs/_template/capabilities.yaml`
- `knowledge-packs/_template/facts.yaml`
- `knowledge-packs/_template/manifest.yaml`
- `knowledge-packs/vnstock-data/manifest.yaml`
- `knowledge-packs/_template/`
- `knowledge-packs/vnstock-data/`
- `knowledge-packs/`

Use `git rm -r knowledge-packs/` so the deletion is staged as part of the commit (matters for the Phase 4 atomic-commit step).

### Negative fixture deletions (11 trees)

Delete the following fixture trees in full:
- `fixtures/negative/malformed-pack-ref/` (referenced from the `runNegativeFixtures` case dropped in Phase 2).
- `fixtures/negative/malformed-pack-source-ref-item/`
- `fixtures/negative/malformed-pack-source-refs/`
- `fixtures/negative/nested-pack-source-allowlist/`
- `fixtures/negative/pack-low-assurance/`
- `fixtures/negative/pack-missing-record-ref/`
- `fixtures/negative/pack-rejected-claim/`
- `fixtures/negative/pack-unresolved-conflict/`
- `fixtures/negative/source-allowlist-traversal/`
- `fixtures/negative/unapproved-pack/` (referenced from the `runNegativeFixtures` case dropped in Phase 2).
- `fixtures/negative/unsupported-pack-source-ref/`

Use `git rm -r` for each so deletions are staged.

## Related Code Files

- Modify: `schemas/claim.schema.json`, `schemas/decision.schema.json`, `schemas/capability.schema.json`, `schemas/risk.schema.json` (URI pattern edit only).
- Modify: `schemas/experiment.schema.json` (URI pattern + `required` array + `properties`).
- Modify: 14 experiment record YAMLs under `records/experiments/`.
- Delete: `knowledge-packs/` directory (4 files + 3 directories).
- Delete: 11 fixture trees under `fixtures/negative/`.

## Implementation Steps

1. Read each of the five schema files to confirm the URI pattern line shape and that the `pack` alternative is the only delta needed.
2. Edit the five schemas: drop `|pack` from `source_refs.items.pattern`.
3. Edit `experiment.schema.json` additionally: drop `"knowledge_pack_ids"` from `required`; drop the corresponding entry from `properties`.
4. For each of the 14 experiment record YAMLs, drop the `knowledge_pack_ids: []` line. Preserve key order and YAML formatting; do not reorder unrelated keys.
5. Run `git rm -r knowledge-packs/` to stage the directory deletion.
6. Run `git rm -r fixtures/negative/{malformed-pack-ref,malformed-pack-source-ref-item,malformed-pack-source-refs,nested-pack-source-allowlist,pack-low-assurance,pack-missing-record-ref,pack-rejected-claim,pack-unresolved-conflict,source-allowlist-traversal,unapproved-pack,unsupported-pack-source-ref}` (one command, brace expansion).
7. Do not run `pnpm check` yet — Phase 4 has the doc edits that complete the bundle, and the final validation pass is at end of Phase 4.

## Todo List

- [x] Edit 5 schemas: drop `|pack` from `source_refs.items.pattern`.
- [x] Edit `experiment.schema.json`: drop `knowledge_pack_ids` from `required` + `properties`.
- [x] Edit 12 experiment record YAMLs to drop `knowledge_pack_ids: []` (actual current tree count).
- [x] `git rm -r knowledge-packs/`.
- [x] `git rm -r fixtures/negative/{11-tree-list}`.
- [x] Add `fixtures/negative/retired-pack-source-ref/` to prove retired `pack:` source refs fail schema validation.
- [x] Confirm `grep -rEn "pack:[a-zA-Z0-9_-]+" records/ schemas/` returns only preserved historical decision/evidence surfaces.
- [x] Confirm `find knowledge-packs/ 2>/dev/null` returns empty.
- [x] Confirm `ls fixtures/negative/ | grep -i pack` returns only `retired-pack-source-ref`.

## Success Criteria

- [ ] All 5 record schemas carry `pattern: "^(local|record|legacy):.+"` on `source_refs.items`.
- [ ] `experiment.schema.json` `required` no longer contains `knowledge_pack_ids`; `properties` no longer contains it.
- [ ] No experiment record contains the `knowledge_pack_ids` key.
- [ ] `knowledge-packs/` is absent from `git ls-files`.
- [ ] The 11 listed fixture trees are absent from `git ls-files`.
- [ ] Working tree carries no orphan empty directories under `fixtures/negative/`.

## Risk Assessment

- **Risk:** A schema edit accidentally touches a different `pattern:` (e.g. timestamp pattern) instead of the URI pattern.
  - **Mitigation:** Target the edit by full-line match on `"source_refs":` rather than by partial `pattern:` substring. Confirm via diff before staging.

- **Risk:** Experiment YAMLs use trailing-comment YAML or sparse-block formatting that complicates a line-drop edit.
  - **Mitigation:** Read each file first; use `Edit` with the exact `knowledge_pack_ids: []` line plus minimal surrounding context to scope the replacement. Do not rewrite the file wholesale.

- **Risk:** A negative fixture besides the 11 listed silently depends on knowledge-packs/ being present (e.g. via a `local:` source_ref under `knowledge-packs/...`).
  - **Mitigation:** Grep all `fixtures/negative/**/*.yaml` for `knowledge-packs/`, `pack:`, and `knowledge_pack_ids`; if any non-listed fixture matches, surface and re-plan.

- **Risk:** `git rm -r` of `knowledge-packs/` leaves an empty `fixtures/negative/source-allowlist-traversal/knowledge-packs/` subtree visible to a future operator and confusing the audit.
  - **Mitigation:** `source-allowlist-traversal` is in the deletion list; the entire fixture tree gets removed.

- **Risk:** The 14 experiment record edits are sequential and one error in the middle leaves the tree half-converted.
  - **Mitigation:** Each YAML edit is independent and idempotent (drop a single fixed-format line). Edit in a deterministic order; verify each with `git diff` before moving on; if any edit fails, abort and re-plan the remaining edits.
