---
phase: 2
title: "Validator Code Retirement"
status: complete
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Validator Code Retirement

## Overview

Delete the three pack-specific modules and surgically drop pack plumbing from four other modules. After this phase the working tree's JavaScript no longer knows the word `pack`. Standalone `pnpm check` would not pass yet (schemas and records still carry pack references); Phases 3 and 4 bring the rest of the tree in sync. All Phase 2/3/4 changes land as one atomic commit.

## Requirements

- Functional: After Phases 2 + 3 + 4 land together, `pnpm check` exit 0 with all remaining records validated and the reduced negative-fixture suite intact.
- Non-functional: No dead code left behind. Every import dropped, every call-site dropped, every parameter narrowed.

## Architecture

### Files deleted (3)

- `tools/validate-records/pack-source-validation.js` (85 LoC). Only `validate-records.js` imports it; the import is dropped in the same phase.
- `tools/validate-records/publication-gate-validation.js` (139 LoC). Only `validate-records.js` imports it; the import is dropped in the same phase.
- `tools/generate-docs/pack-summary.js` (17 LoC). Only `generated-doc-content.js` imports it; the import is dropped in the same phase.

### Files edited (4)

- `tools/validate-records/validate-records.js`
  - Remove imports for `validatePackSources`, `validatePublicationGates`, `loadPackStatuses` (the last alongside `loadRecords`).
  - In `runNegativeFixtures` `cases` array: remove the row `["unapproved-pack", "experiment consumes unreviewed pack"]` and the row `["malformed-pack-ref", "/source_refs/0 pattern: must match pattern"]`.
  - Delete the `runNegativePackFixtures(recordIds)` function in full (lines 97-113 in the current shape).
  - Delete the `runNegativePublicationGateFixtures()` function in full (lines 78-95).
  - In `main()`: remove the `loadPackStatuses(root)` call; remove the `validatePublicationGates(root, records, ...)` call; remove the `validatePackSources(root, recordIds)` call; remove the `runNegativePackFixtures(recordIds)` call; remove the `runNegativePublicationGateFixtures()` call.
  - Drop `packStatuses` from `validateRecords(...)`'s argument list (it now passes through `records, schemas, root, allowDisallowedFixtures`).
  - Drop `recordIds` local var if no remaining consumer needs it. (Audit: after removing `runNegativePackFixtures(recordIds)`, the only other user was the deleted `validatePackSources(root, recordIds)`; both gone, so `recordIds` is dead — delete it.)

- `tools/validate-records/record-validation-rules.js`
  - In `validateSourceRefs`: drop the entire `if (sourceRef.startsWith("pack:"))` branch (the three-line short-circuit at the current lines 89-91).
  - In `recordLocalRoots`:
    - `default.roots`: change from `["records/evidence", "knowledge-packs"]` to `["records/evidence"]`.
    - `default.description`: change from `"records/evidence or knowledge-packs"` to `"records/evidence"`.
    - `capability.roots`: change from `["records/evidence", "knowledge-packs", "product/*/capabilities"]` to `["records/evidence", "product/*/capabilities"]`.
    - `capability.description`: change from `"records/evidence, knowledge-packs, product/*/capabilities"` to `"records/evidence, product/*/capabilities"`.
  - Delete the `validateExperimentPacks(record, errors, packStatuses)` function in full (current lines 159-168).
  - Drop the call `validateExperimentPacks(record, errors, packStatuses)` from the `for (const record of records)` loop in `validateRecords` (current line 56).
  - Drop `packStatuses` from `validateRecords`'s signature so consumers don't pass it.

- `tools/validate-records/record-loader.js`
  - Delete the `loadPackStatuses(root)` function in full (current lines 24-34). Keep `recordDirs` and `loadRecords` unchanged.

- `tools/generate-docs/generated-doc-content.js`
  - Remove the `import { loadPacks } from "./pack-summary.js";` line (line 2).
  - Remove the `const packs = loadPacks(root);` call (line 9).
  - In `renderOverview`: drop the `packs` parameter and remove the "Eligible Knowledge Packs" section from the rendered output.
  - Delete the entire `renderCapabilities` function (currently lines 28-31) and drop `"docs/generated/capabilities.md": renderCapabilities(packs)` from the returned object literal.
  - In `renderProposal` (current line 62): simplify the Evidence rendering so the section reads `section("Evidence", list(experiment.source_refs || []))` — drop the spread that combines `(experiment.knowledge_pack_ids || []).map(...)` with `source_refs`.
  - Note: `tools/generate-docs/generate-docs.js` currently errors with `"docs generation disabled until metadata structure is finalized"` and exits before `generated-doc-content.js` ever runs. These edits are therefore hygienic — they prevent shipping a broken static import + dead pack-only renderers when the rendering pipeline is later re-enabled. No other file under `tools/` imports `loadPacks`; confirmed by grep at plan-authoring time.

## Related Code Files

- Delete: `tools/validate-records/pack-source-validation.js`
- Delete: `tools/validate-records/publication-gate-validation.js`
- Delete: `tools/generate-docs/pack-summary.js`
- Modify: `tools/validate-records/validate-records.js`
- Modify: `tools/validate-records/record-validation-rules.js`
- Modify: `tools/validate-records/record-loader.js`
- Modify: `tools/generate-docs/generated-doc-content.js`

## Implementation Steps

1. Read each of the seven affected files to confirm current line numbers (codebase may have minor drift since plan authoring).
2. Delete the three pack-specific modules with `rm` (or via editor delete).
3. Edit `validate-records.js`: drop imports, drop the two case rows, delete the two negative-fixture functions, drop the four `main()` call sites, drop `packStatuses` plumbing, drop now-dead `recordIds` if confirmed unused.
4. Edit `record-validation-rules.js`: drop the `pack:` branch in `validateSourceRefs`; update both `recordLocalRoots` entries (`roots` and `description`); delete `validateExperimentPacks`; drop its call site in the `validateRecords` body; drop `packStatuses` from the exported signature.
5. Edit `record-loader.js`: delete `loadPackStatuses`.
6. Edit `generated-doc-content.js`: drop the `loadPacks` import (line 2) + `loadPacks(root)` call (line 9); drop the `packs` parameter and "Eligible Knowledge Packs" section from `renderOverview`; delete `renderCapabilities` entirely and drop its key from the returned object; simplify `renderProposal`'s Evidence section to `list(experiment.source_refs || [])`.
7. Do not run `pnpm check` after this phase alone — schemas still carry the `pack:` URI alternative and the `knowledge_pack_ids` required field, and 14 experiment records still carry the `knowledge_pack_ids: []` field. Validator will fail until Phase 3 lands.
8. Do not stage the changes individually — they will be staged together with Phase 3 and Phase 4 in the single Phase-4 atomic commit.

## Todo List

- [x] Delete `tools/validate-records/pack-source-validation.js`.
- [x] Delete `tools/validate-records/publication-gate-validation.js`.
- [x] Delete `tools/generate-docs/pack-summary.js`.
- [x] Edit `tools/validate-records/validate-records.js` per plan (imports, cases, two functions, main() calls, signatures).
- [x] Edit `tools/validate-records/record-validation-rules.js` per plan (pack: branch, allowlist tokens + descriptions, validateExperimentPacks, signature).
- [x] Edit `tools/validate-records/record-loader.js` — delete `loadPackStatuses`.
- [x] Edit `tools/generate-docs/generated-doc-content.js` — drop loadPacks import + call, drop `packs` param + Eligible Knowledge Packs section, delete `renderCapabilities` entirely, simplify Evidence rendering in `renderProposal`.
- [x] Confirm no remaining references to `pack`, `loadPacks`, `loadPackStatuses`, `validatePackSources`, `validatePublicationGates`, `validateExperimentPacks`, `packStatuses`, `knowledge_pack_ids` inside `tools/`.

## Success Criteria

- [ ] `git status` shows 3 deleted files + 4 modified files under `tools/`.
- [ ] `grep -rn "pack\|knowledge_pack" tools/` returns no hits (other than possibly the conventional commit message in `git log`, which is not in the tree).
- [ ] Node-side import graph: no broken imports in `tools/validate-records/validate-records.js` or `tools/generate-docs/generated-doc-content.js`.
- [ ] `node -e "import('./tools/validate-records/validate-records.js')"` from repo root runs (or fails only on missing schema/record fixtures that Phase 3 will clean up — that's expected at this midpoint).

## Risk Assessment

- **Risk:** `recordIds` local var in `validate-records.js` `main()` is dropped prematurely while still consumed by something not yet noticed.
  - **Mitigation:** Audit at edit time: after both `validatePackSources(root, recordIds)` and `runNegativePackFixtures(recordIds)` are gone, search the file for any remaining `recordIds` reference; only drop the declaration if zero remain.

- **Risk:** `validateRecords`'s exported signature change (`packStatuses` param dropped) breaks an external caller.
  - **Mitigation:** Grep repo for `validateRecords(` callers; only `tools/validate-records/validate-records.js` itself imports + calls it. No external caller. Update the single call site in lockstep.

- **Risk:** `generated-doc-content.js`'s `renderProposal` Evidence rendering combines `(experiment.knowledge_pack_ids || []).map(id => `knowledge-pack:${id}`)` with `experiment.source_refs` inside one spread; mechanical removal could yield malformed JS.
  - **Mitigation:** Edit spec already enumerated above (drop the entire spread, leave only `list(experiment.source_refs || [])`). Read the file once before editing to confirm current line shape; the edit is a single-line replacement, not multi-line surgery.

- **Risk:** `renderCapabilities` is referenced as a value in the returned object (`"docs/generated/capabilities.md": renderCapabilities(packs)`); deleting only the function definition without dropping the object-literal key would yield a ReferenceError at next import time.
  - **Mitigation:** Edit spec drops both the function definition and the object-literal key in lockstep. After the edit, grep `renderCapabilities` in `tools/generate-docs/`; expect zero matches.

- **Risk:** Future re-enabling of `generate-docs.js` discovers the renderer was simplified mid-retirement and rehydrates the pipeline against a now-narrower API surface (no `packs` parameter, no capabilities renderer).
  - **Mitigation:** Acceptable per the AJV-adoption decision's "schema-driven API change is the explicit price of simplification" precedent; the retirement decision's `tradeoffs` block documents that future product lines wanting pack-style rendering must rebuild the API.
