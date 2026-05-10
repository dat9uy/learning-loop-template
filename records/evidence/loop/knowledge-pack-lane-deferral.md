# Knowledge-Pack Lane Deferral

## Context

Open question from `plans/reports/brainstorm-260511-0030-external-skills-integration.md` (Unresolved Questions): does the knowledge-pack publication-gate machinery (validators, `pack_ref`, gate checks) need to be quieted in the operator-facing doc surface to avoid confusion, or left as latent infrastructure for a future pack-using product line?

The same question carried forward verbatim from the superseded `plans/reports/brainstorm-20260510-external-skills-integration.md`.

## Session Actions (2026-05-10 doc-cleanup pass)

In the same session as this evidence note, the operator-facing doc surface was quieted:

- `docs/knowledge-pack-contract.md`: deleted.
- `README.md`, `docs/handoff.md`, `docs/charter.md`, `docs/lab-model.md`, `docs/red-team-review.md`: pack-as-active-lane framing removed; capability records and capability scripts promoted to first-class entities; capability-term glossary consolidated in `docs/handoff.md`.
- `docs/operator-guide.md`: nine surgical edits removed pack-creation guidance and re-pointed the agent intake flow to records-first language. Two intentional latent-marker lines remain (one in source-of-truth paragraph, one in the validator-allowlist note) that mark the lane as deferred rather than retired.
- `pnpm check` green afterwards (19 records validated).

## Latent Infra Retained (Intentional)

- `knowledge-packs/_template/` (capabilities.yaml, facts.yaml, manifest.yaml).
- `knowledge-packs/vnstock-data/manifest.yaml` (draft placeholder, untouched per superseded brainstorm guidance).
- `tools/validate-records/` allowlist: `local:knowledge-packs/...` remains an accepted source-ref root for non-capability records (per the capabilities-stack-migration per-record-type allowlist machinery).
- `tools/validate-records/pack-source-validation.js`, `tools/validate-records/publication-gate-validation.js`: pack-specific validators kept; they continue to no-op against the empty/draft pack manifests and pass `pnpm check`.

## Risk Surface

- Latent infra accrues without testing. Bit-rot risk if a future product line reactivates packs months/years later.
- Doc surface no longer provides a discovery path to the pack lane. New agents will not reach for packs without explicit operator hint or reading this evidence and the deferral decision.

## Allowlist Footprint Audit

`tools/validate-records/validate-records.js` references the allowlist message `"local source must stay under records/evidence or knowledge-packs"` (default) and `"local source must stay under records/evidence, knowledge-packs, product/*/capabilities"` (capability records). Both retain the `knowledge-packs` token as of this evidence capture; no current record cites `local:knowledge-packs/...` under any record type, so removal is mechanically safe but doctrinally premature.

## Outcome

This evidence supports the deferral decision drafted at `records/decisions/decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml`. No raw pack data, no manifest contents, no validator code captured here.
