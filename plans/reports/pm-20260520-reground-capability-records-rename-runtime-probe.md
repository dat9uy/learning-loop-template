# PM Report — 2026-05-20

Plan: `260520-1650-reground-capability-records-rename-runtime-probe`
Status: completed

## What Changed

| Phase | Files | Action |
|---|---|---|
| 1 | `records/capabilities/capability-fastapi-reference-rest.yaml` | Re-grounded `source_refs[0]` from frozen claim `claim-product-fastapi-reference` to live assertion `assertion-vnstock-data-runtime-live-api-surfaces-verified`. Bumped `updated_at`. |
| 1 | `records/capabilities/capability-tanstack-reference-render.yaml` | Re-grounded `source_refs[0]` from frozen claim `claim-product-tanstack-reference-view` to same live assertion. Bumped `updated_at`. |
| 2 | `docs/philosophy.md`, `docs/charter.md`, `docs/record-system-architecture.md`, `docs/artifact-reference.md`, `docs/operator-guide.md`, `README.md`, `product/README.md`, `product/web/capabilities/README.md`, `.claude/skills/learning-loop/references/learning-loop-rules.md`, `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md` | Renamed "capability script" → "runtime probe", "Capability Runtime Experiment" → "Runtime Probe Experiment". |

## Validation

- `pnpm validate:records`: 78 records, 0 errors.
- `pnpm check`: 144 tests, 0 failures.
- `grep "capability script"` in active docs: 0 matches (journals exempt).
- `grep "Capability Runtime Experiment"` in active docs: 0 matches.
- Manual agent-orientation flow trace: chain unbroken.

## Unresolved Questions

None.
