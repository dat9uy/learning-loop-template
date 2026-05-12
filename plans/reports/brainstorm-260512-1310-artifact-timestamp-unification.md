# Artifact Timestamp Unification Brainstorm

## Problem Statement

The learning-loop corpus uses four distinct timestamp formats across artifact filenames:

| Format | Example | Used By |
|---|---|---|
| No timestamp | `claim-product-fastapi-reference.yaml` | claims, capabilities, meta-evidence |
| Date only (`YYYYMMDD`) | `decision-20260508-loop-dimension-model.yaml` | some decisions, some risks |
| Full ISO datetime (`YYYYMMDDThhmmssZ`) | `experiment-20260508T101723Z.yaml` | most decisions, most experiments, most domain evidence |
| Short-year compact (`YYMMDDTmmZ`) | `decision-260512T0046Z.yaml` | recent meta-decision, recent meta-experiment, some recent experiments |

This inconsistency:
- Breaks lexicographic sort predictability across artifact directories
- Confuses agents about which format to use when authoring new records
- Creates drift between the meta-evidence docs (which prescribe `<date>` only) and actual practice (which uses datetime)

## Current State Audit

### Decisions (`records/decisions/`)

| File | Timestamp Format |
|---|---|
| `decision-20260508-loop-dimension-model.yaml` | `YYYYMMDD` |
| `decision-20260509T070411Z-...yaml` | Full ISO datetime |
| `decision-20260509T192448Z-...yaml` | Full ISO datetime |
| `decision-20260509T192449Z-...yaml` | Full ISO datetime |
| `decision-20260510T160000Z-...yaml` | Full ISO datetime |
| `decision-20260510T170623Z-...yaml` | Full ISO datetime |
| `decision-20260510T172056Z-...yaml` | Full ISO datetime |
| `decision-20260510T174640Z-...yaml` | Full ISO datetime |
| `decision-20260511T003000Z-...yaml` | Full ISO datetime |
| `decision-260512T0046Z-...yaml` | **Short-year compact** |

### Experiments (`records/experiments/`)

| File | Timestamp Format |
|---|---|
| `experiment-vnstock-install-20260508T101723Z.yaml` | Full ISO datetime |
| `experiment-vnstock-install-20260508T171112Z.yaml` | Full ISO datetime |
| `experiment-vnstock-install-20260509T071800Z-sandbox-1.yaml` | Full ISO datetime |
| `experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml` | Full ISO datetime |
| `experiment-loop-capabilities-stack-allowlist-20260510T160000Z.yaml` | Full ISO datetime |
| `experiment-vnstock-capabilities-20260509T174957Z.yaml` | Full ISO datetime |
| `experiment-vnstock-runtime-403-fix-20260511T143500Z.yaml` | Full ISO datetime |
| `experiment-product-build-fastapi-reference-20260511T003000Z.yaml` | Full ISO datetime |
| `experiment-product-build-tanstack-reference-20260511T003000Z.yaml` | Full ISO datetime |
| `experiment-operator-product-shape-walkthrough-260511T1900Z.yaml` | **Short-year compact** |
| `experiment-product-dev-gate-removal-260512T0007Z.yaml` | **Short-year compact** |
| `experiment-meta-install-template-candidate-260512T0046Z.yaml` | **Short-year compact** |

### Evidence MDs (`records/evidence/`)

| File | Timestamp Format |
|---|---|
| `experiment-install-20260508T101723Z.md` | Full ISO datetime |
| `experiment-install-20260508T171112Z.md` | Full ISO datetime |
| `experiment-install-20260509T071800Z-sandbox-1.md` | Full ISO datetime |
| `experiment-install-20260509T071900Z-sandbox-2.md` | Full ISO datetime |
| `runtime-403-fix-20260511.md` | Date only |
| `install-experiment-template-gap.md` | No timestamp |
| `capability-schema-gap.md` | No timestamp |
| `capabilities-stack-migration.md` | No timestamp |

### Claims (`records/claims/`)

All 6 claim files have **no timestamp**.

### Capabilities (`records/capabilities/`)

Both capability files have **no timestamp**.

### Risks (`records/risks/`)

All 3 risk files use `YYYYMMDD`.

## Evaluated Approaches

### Format Options

| Approach | Example | Pros | Cons |
|---|---|---|---|
| **A. Full ISO datetime** | `20260512T131045Z` | Unambiguous year; fully ISO 8601 compliant; works past 2099 | Longer filenames (16 chars); 90% of those chars are redundant in daily use |
| **B. Short-year compact** | `260512T1310Z` | Matches recent meta artifacts; compact; sortable; sufficient for ~70 years | Y2K-style ambiguity in 70+ years; not strict ISO 8601 |
| **C. Date only** | `20260512` | Shortest; good for daily-granularity artifacts | Loses time-of-day precision; collisions when multiple artifacts created same day |

**Recommendation: B (short-year compact)**

Rationale: The corpus already shifted to this format for the most recent meta artifacts. It is compact, lexicographically sortable, and collision-safe at minute granularity. The 70-year horizon is acceptable for this project. It aligns with the existing `run_id` convention (`runtime-YYYYMMDD-HHMMSS-<random>`) by keeping datetime prefixes compact.

### Artifact Scope Options

| Approach | Timestamped | Not Timestamped | Rationale |
|---|---|---|---|
| **A. Timestamp everything** | decisions, experiments, evidence, claims, capabilities, risks | nothing | Maximum uniformity |
| **B. Timestamp event-like only** | decisions, experiments, run-specific evidence, risks | claims, capabilities, meta-evidence | Semantic distinction: events happen at a point in time; state declarations evolve |
| **C. Keep current chaos** | varies by artifact type | varies by artifact type | Zero migration cost; maximum confusion |

**Recommendation: B (event-like only)**

Rationale:
- **Claims** represent assertions about the world ("FastAPI reference REST endpoints work"). Their identity is semantic, not temporal. They have `created_at` inside YAML for audit; the filename should be readable.
- **Capabilities** represent feature/function mappings. Their identity is the capability name. Same argument as claims.
- **Meta-evidence** (`records/evidence/meta/`) is policy/documentation. The meta-evidence self-improvement doc explicitly prescribes `descriptive-kebab-slug` with no timestamp. This is intentional — meta-evidence files are living documents that get amended, not events.
- **Decisions** and **experiments** are inherently temporal. They produce a result at a specific moment. The timestamp is part of their identity.
- **Domain evidence MDs** that capture specific runs (install experiments, runtime fixes) are event recordings and should be timestamped.
- **Risks** are created at a point in time. The meta-evidence doc prescribes `risk-<date>-loop-<slug>`; upgrading to datetime granularity aligns risks with decisions/experiments.

## Final Recommended Convention

### Unified Timestamp Format

```
YYMMDDTmmZ
```

Where:
- `YY` = 2-digit year (26 for 2026)
- `MM` = 2-digit month (05 for May)
- `DD` = 2-digit day (12)
- `T` = literal separator
- `HH` = 2-digit hour in UTC (13)
- `MM` = 2-digit minute (10)
- `Z` = literal Z for UTC

Total: 13 characters. Always 13 characters — fixed length enables reliable parsing.

### Filename Patterns By Artifact Type

| Artifact Type | Directory | Pattern | Timestamped? |
|---|---|---|---|
| Decision | `records/decisions/` | `decision-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Experiment | `records/experiments/` | `experiment-<scope>-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Risk | `records/risks/` | `risk-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Domain Evidence (run-specific) | `records/evidence/<domain>/` | `<type>-YYMMDDTmmZ[-<variant>].md` | Yes |
| Claim | `records/claims/` | `claim-<scope>-<slug>.yaml` | **No** |
| Capability | `records/capabilities/` | `capability-<stack>-<slug>.yaml` | **No** |
| Meta Evidence | `records/evidence/meta/` | `<descriptive-kebab-slug>.md` | **No** |

### Internal `id` Field Rule

The `id` field inside every YAML record MUST match the filename stem (filename without extension). This is already true for all existing records; the convention preserves it.

Examples:
- File: `decision-260512T1310Z-loop-timestamp-convention.yaml`
- `id`: `decision-260512T1310Z-loop-timestamp-convention`

### Existing Artifacts That Need Documentation Notes

The following files are "pre-convention" per `record:decision-20260509T192449Z-prospective-convention-application`. They keep their current names; no retroactive rename:

- All `decision-20260508*` through `decision-20260511*` files
- All `experiment-20260508*` through `experiment-20260511*` files
- All `risk-20260508*` files
- All domain evidence with full-year timestamps
- The date-only evidence MD `runtime-403-fix-20260511.md`

## Migration Strategy

**Prospective application only.** No file renames. New artifacts follow the convention.

This aligns with the existing prospective-convention-application policy: "New conventions apply prospectively unless an explicit migration is approved. A historical experiment authored before a convention lands does not need to be rewritten for cosmetic alignment; per-experiment immutability beats convention uniformity."

If the operator ever wants retroactive alignment, that requires a separate migration plan with:
1. Bulk rename script
2. `source_refs` / `claim_refs` / `affected_refs` update script (cross-references embed filenames)
3. Validation gate re-run

That is out of scope for this convention decision.

## Documents To Update

1. **`records/decisions/decision-<new-timestamp>-artifact-timestamp-convention.yaml`** (this decision itself)
2. **`.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`** — update the risk/decision filename examples from `<date>` to `YYMMDDTmmZ`
3. **`docs/operator-guide.md`** — add a "Record Naming Conventions" section

## Implementation Considerations

- The `experiment.schema.json` `scope` enum lacks a `meta` value. The recent meta-experiment used `schema-improvement` and documented the deviation in `notes`. This convention decision does not change that.
- The validator (`pnpm validate:records`) checks `id` against filename stem. No validator change needed — the convention is about human/agent authoring discipline, not automated enforcement.
- The short-year format means artifacts from 2026 and 2126 would have the same prefix. Acceptable given project horizon.

## Success Metrics

- [ ] Meta-decision YAML exists at `records/decisions/` pinning this convention
- [ ] Meta-evidence self-improvement doc updated with new filename examples
- [ ] Operator-guide updated with a "Record Naming Conventions" section
- [ ] Next artifact created after this decision uses `YYMMDDTmmZ` format
- [ ] `pnpm validate:records` passes after all doc updates

## Next Steps

1. Create the meta-decision YAML approving this convention
2. Update `meta-evidence-self-improvement.md` filename examples
3. Update `docs/operator-guide.md` with the convention table
4. Run `pnpm validate:records`

## Unresolved Questions

1. Should the validator emit a warning when a new artifact uses the old full-year format? (Soft enforcement vs. documentation-only)
2. Should meta-evidence ever gain timestamps? The current answer is no, but if meta-evidence accumulates enough versions that need disambiguation, a future loop-evolution decision could revisit.
3. The `run_id` convention in operator-guide uses `runtime-YYYYMMDD-HHMMSS-<random>` (hyphen-separated, full year, with seconds). Should `run_id` align with the short-year compact format, or is `run_id` intentionally different because it is a runtime artifact, not a durable record?
