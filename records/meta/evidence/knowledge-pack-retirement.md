# Knowledge-Pack Retirement Evidence

## Context

Decision `record:decision-20260510T174640Z-knowledge-pack-lane-deferral` held the lane in a draft deferred state after the May-10 quieting pass. The brainstorm context for that draft remains in `plans/reports/brainstorm-260511-0030-external-skills-integration.md` and the superseded May-10 brainstorm report. The validator simplification scout report `plans/reports/problem-solving-260512-1714-validate-records-simplification.md` later identified pack-file schemas and walker collapse as Phase B candidates.

## Disposition Pair

The deferral decision remains at `status: draft`. The approved retirement decision `record:decision-260512T1316Z-knowledge-pack-retirement` supersedes it and carries the disposition signal. Historical deferral evidence remains at `records/evidence/loop/knowledge-pack-lane-deferral.md`.

## Session Actions

Commit 1 records the approved retirement decision and this evidence only. Commit 2 removes the retired code, schemas, fixtures, directory, record fields, operator docs surface, and skill-facing guidance in one bundle.

## Files Touched

- New decision: `records/decisions/decision-260512T1316Z-knowledge-pack-retirement.yaml`.
- New evidence: `records/evidence/loop/knowledge-pack-retirement.md`.
- Retirement bundle: validator modules, generated-doc content, five record schemas, experiment records, `knowledge-packs/`, eleven pack-related negative fixtures, README, charter, operator guide, red-team review, and project-local learning-loop skill docs.

## Audit Trail

The retirement plan records the pre-change audit: no active record carries a `pack:<id>` source_ref, and existing experiment `knowledge_pack_ids` values are empty arrays. Retirement therefore removes inert structure rather than migrating live pack consumption.

## Outcome

This evidence anchors the approved retirement decision. No raw pack data is captured here.
