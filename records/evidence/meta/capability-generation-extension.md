---
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
---

# Capability Generation Extension

## Findings

- [capability-generation] Run `pnpm generate:capabilities` after product surface changes to regenerate capability records from native self-descriptions.
- [drift-elimination] Records derived from ground truth by construction; drift detected via `--dry-run` during `pnpm check`.
- [generated-minimal] Generated records contain only `type`, `schema_version`, `stack`, `surface`, `maps[]` with `source`; no `id`, `status`, `created_at`, `updated_at`.
- [surface-registry] Per-surface adapters read native self-descriptions and emit normalized capability entries; each stack registers adapters in the surface registry.
- [extension-procedure] Five steps to add new surface: create adapter file, export `extract(root)` function, register in registry, add surface enum to schema, document in meta evidence.
- [unsupported-surfaces] Unsupported surfaces throw at generation time; registry must be fully populated.

## Observation

The generation pipeline uses per-surface adapters that map product source files to normalized capability entries. Surface adapters live at `tools/generate-capabilities/adapters/<surface-kebab>-adapter.js`.

## Trigger

- Event class: new-product-surface-integration
- Threshold: N=1
- Action when triggered: follow five-step extension procedure; add adapter before first use.
