# Brainstorm: Records Surface-First Restructure

## Problem

The current `records/<artifact_type>/` structure mixes surface domains in every directory except `evidence/`. Meta loop mechanics sit next to vnstock integration decisions. Technology-specific knowledge (FastAPI endpoints, TanStack rendering) sits next to product approval decisions. This makes browsing, permissioning, and reasoning about a single surface harder than it should be.

Additionally, two placeholder directories (`backlog-items/`, `validation-gates/`) contain only `.gitkeep` and no actual records. The artifact type set is finalized — no need for speculative folders.

## Decisions from Gap Review

Three questions were resolved before planning:

**1. Claims stay frozen-legacy, not moved to index.** Per `decision-260519T1400Z-claim-deprecation`, claims are deprecated for *new* entries only. Existing 12 claims remain read-only audit trail with structured verification blocks (approval, confidence, blocked_actions) that index entries do not have. Moving claims to `index/` is explicitly blocked by that decision.

**2. All evidence migrates — including legacy without `## Findings`.** Of 58 evidence files, 36 have `## Findings` and 22 do not. The extraction tool already silently skips files without `## Findings`; validate-records does not validate markdown. Legacy files are referenced by `local:` paths in experiments/decisions/claims, so dropping them would break `source_refs`. Migrate all 58.

**3. Observations stay in a flat mixed folder.** Observations are constraint *state*, not knowledge packages. They cross-cut surfaces (`device_limit_blocks_reinstall` affects both `vnstock` and `product`). With only 10 files, per-surface observation dirs add walk-complexity to `file-readers.js`, `check-budget.js`, and `gate-utils.cjs` with no operational benefit. The write gate already blocks `records/observations/**` unconditionally. This path is the exception to the surface-first rule.

## Design Philosophy

Treat `records/` as a **registry of knowledge packages** — one self-contained directory per surface. Each surface owns its full ledger: evidence, experiments, decisions, risks, observations, index, and capabilities. New surfaces can be added without touching existing ones. No cross-surface leakage.

This is package-manager thinking applied to architecture knowledge:
- `vnstock/` = external vendor integration package
- `fastapi/` = backend framework knowledge package
- `tanstack/` = frontend framework knowledge package
- `product/` = composed output package (depends on fastapi + tanstack + vnstock)
- `meta/` = loop infrastructure package (depends on nothing)

Each package grows independently. A future `django/` or `nextjs/` surface slots in without restructuring anything.

## Current State

```
records/
  evidence/           ← only dir with surface subdirs
    meta/
    loop/             ← loop mechanics; merging into meta
    product/
    product-build/    ← technology knowledge (fastapi, tanstack); splitting into per-tech surfaces
    vnstock-data/     ← renaming to vnstock
  decisions/          ← flat, mixed surfaces
  experiments/        ← flat, mixed surfaces
  claims/             ← flat, frozen-legacy
  risks/              ← flat, mixed surfaces
  observations/       ← flat, mixed surfaces
  index/              ← flat, mixed surfaces
  capabilities/       ← flat, mixed surfaces
  backlog-items/      ← empty (.gitkeep only)
  validation-gates/   ← empty (.gitkeep only)
```

Every non-evidence file already embeds its surface in the filename:
- `decision-260512T1310Z-ajv-schema-validation-adoption.yaml` → surface: meta
- `experiment-vnstock-install-20260508T101723Z.yaml` → surface: vnstock
- `risk-loop-capability-allowlist-overreach.yaml` → surface: loop (merging into meta)
- `experiment-product-build-fastapi-reference-20260511T003000Z.yaml` → surface: fastapi (splitting out)
- `experiment-product-build-tanstack-reference-20260511T003000Z.yaml` → surface: tanstack (splitting out)

## Target State

```
records/
  meta/                 ← merged meta + loop; loop infrastructure
    evidence/
    decisions/
    experiments/
    claims/             ← frozen-legacy (read-only audit trail)
    risks/
    index/
    capabilities/
  vnstock/              ← renamed from vnstock-data; external vendor integration
    evidence/
    decisions/
    experiments/
    claims/             ← frozen-legacy (read-only audit trail)
    risks/
    index/
    capabilities/
  fastapi/              ← split from product-build; backend framework knowledge
    evidence/
    decisions/
    experiments/
    claims/             ← frozen-legacy (read-only audit trail)
    risks/
    index/
    capabilities/
  tanstack/             ← split from product-build; frontend framework knowledge
    evidence/
    decisions/
    experiments/
    claims/             ← frozen-legacy (read-only audit trail)
    risks/
    index/
    capabilities/
  product/              ← composed output (website); depends on fastapi + tanstack + vnstock
    evidence/
    decisions/
    experiments/
    claims/             ← frozen-legacy (read-only audit trail)
    risks/
    index/
    capabilities/
  observations/         ← flat mixed folder (exception to surface-first rule)
```

**Naming convention (all artifact types):** `<artifact_type>-<surface>-<timestamp>-<topic>.yaml`

Examples:
- `records/meta/experiments/experiment-meta-capabilities-stack-allowlist-20260510T160000Z.yaml`
- `records/vnstock/decisions/decision-vnstock-260522T1200Z-bootstrap-script.yaml`
- `records/fastapi/experiments/experiment-fastapi-20260511T003000Z-reference.yaml`
- `records/tanstack/experiments/experiment-tanstack-20260511T003000Z-reference.yaml`
- `records/product/experiments/experiment-product-260511T1900Z-operator-walkthrough.yaml`

Surface slug stays in filename for grep-ability even though it is in the path.

**Removed:** `backlog-items/`, `validation-gates/` directories entirely.

**Renamed:** `vnstock-data` → `vnstock`.

**Merged:** `loop` → `meta`.

**Split:** `product-build` → `fastapi/` + `tanstack/` (technology knowledge); remaining product content stays in `product/` (composed output).

**Exception:** Observations remain in flat `records/observations/` with existing naming `observation-<scope>-<slug>.yaml`.

## Option A: Big-Bang Migration

Move all files in one commit, update all tools in the same commit.

Pros:
- Atomic — no intermediate broken state
- Git history shows the restructure as a single coherent change
- All path references update at once

Cons:
- Large blast radius — ~100+ files move, ~15 tool files change
- Higher risk of missed references
- Harder to review

## Option B: Surface-by-Surface Migration

Migrate one surface at a time (e.g., vnstock first, then meta, then loop, etc.). Leave existing flat dirs as "legacy mixed" until the last surface moves.

Pros:
- Smaller chunks, easier to review and rollback
- Can validate each surface's tools work before proceeding

Cons:
- Tools must support BOTH old and new paths during transition
- Prolonged mixed state creates confusion
- More total work (dual-path support + cleanup)

## Option C: Soft Migration (files move, symlink legacy paths)

Move files to new structure, keep symlinks at old paths for tools that haven't updated yet. Remove symlinks after all tools are migrated.

Pros:
- Tools can migrate incrementally
- Clear migration boundary

Cons:
- Symlinks complicate the write gate and git
- Windows/Git compatibility issues
- Overkill for a single-repo change

## Recommendation: Option A (Big-Bang)

The tool surface is small enough (~15 files) that a single coordinated change is cleaner than managing a transition. All path references are grep-able. The risk is manageable with a pre-commit validation check.

## Tool Impact

| File | Current Path Reference | Change |
|---|---|---|
| `tools/validate-records/record-loader.js:5` | `recordDirs` flat list | Walk `records/*/<dir>` for each surface |
| `tools/validate-records/record-loader.js:12` | `join(baseDir, dirName)` | Nested walk: surface → artifact_type |
| `tools/validate-records/validate-records.js:19-23` | Error strings mention `records/evidence` | Update to `records/<surface>/evidence` |
| `tools/validate-records/record-validation-rules.js` | `default: ["records/evidence"]` | `default: ["records/*/evidence"]` |
| `tools/extract-index/extract-index.js:250` | `records/evidence` | Walk `records/*/evidence` |
| `tools/extract-index/extract-index.js:48` | `records/experiments` | Walk `records/*/experiments` |
| `tools/extract-index/extract-index.js:145` | `records/index` | Walk `records/*/index` |
| `tools/extract-index/extract-index.js:382` | `records/claims` | Walk `records/*/claims` |
| `tools/extract-index/file-writer.js:28` | `records/index` | Write to `records/<surface>/index` |
| `.claude/coordination/hooks/write-coordination-gate.cjs:39` | `records/observations/**` | `records/*/observations/**` |
| `.claude/coordination/hooks/write-coordination-gate.cjs:72` | `records/evidence/**` | `records/*/evidence/**` |
| `.claude/coordination/hooks/write-coordination-gate.cjs:103` | `records/index/**`, `records/capabilities/**` | `records/*/index/**`, `records/*/capabilities/**` |
| `.claude/coordination/hooks/bash-coordination-gate.cjs:153` | `records/observations/` prefix check | Regex for `records/<surface>/observations/` |
| `.claude/coordination/hooks/bash-coordination-gate.cjs:159` | `records/evidence/` prefix check | Regex for `records/<surface>/evidence/` |
| `tools/constraint-gate/file-readers.js:24,52` | Reads `records/observations/` flat | Update to `records/observations/` (unchanged — observations stay flat) |
| `tools/constraint-gate/gate-logic.js:18` | Hardcodes `PATH_PATTERNS` with flat paths | Update patterns to `records/*/evidence/**`, `records/*/index/**`, `records/*/capabilities/**` |
| `tools/check-budget/check-budget.js:58` | Reads budget files from `records/observations/` | Unchanged — observations stay flat |
| `tools/generate-capabilities/generate-capabilities.js:16` | Writes to `records/capabilities` | Update to `records/<surface>/capabilities` |
| `tools/list-verified/list-verified.js` | Reads `records/index` | Update to walk `records/*/index` |
| `tools/search-index/search-index.js` | Reads `records/index` | Update to walk `records/*/index` |
| `tools/claim-verification/verify-claim.js` | Reads `records/claims` | Update to walk `records/*/claims` |
| `.claude/coordination/__tests__/*.test.cjs` | Hardcoded `records/evidence/`, `records/observations/`, `records/index/`, `records/capabilities/` paths in tests | Update all test fixtures and assertions |
| `.claude/skills/learning-loop/references/*.md` | Hardcoded flat paths in blueprints | Update path references in skill documentation |
| `docs/artifact-concepts.md` | References `records/evidence/`, `records/index/`, etc. | Update all path references |
| `docs/record-system-architecture.md` | References `records/evidence/`, `records/index/`, etc. | Update all path references |
| `README.md` | References `records/observations/`, `records/evidence/` | Update path references |

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Missed tool path reference | Pre-migration: grep all `records/` references in `tools/`, `.claude/`, `docs/`, `README.md`. Post-migration: run `pnpm check`, `pnpm extract:index`, and all test suites |
| Observation write-path gate breaks | Observations stay flat — no gate pattern change needed for `records/observations/**`. Update `WRITE_PATH_PATTERNS` in `gate-utils.cjs` for `records/*/evidence/**`, `records/*/index/**`, `records/*/capabilities/**` |
| Index entry `source_refs` point to old evidence paths | Index is machine-derived — delete old index files and run `pnpm extract:index` after move to regenerate |
| `local:` references inside records break | These reference `records/evidence/...` paths — must update to `records/<surface>/evidence/...`. Validate with `pnpm check` |
| Claims frozen-legacy references break | Claims cite experiments by `record:` id, not `local:` path — safe. Claim file paths change but no hardcoded claim paths in tools |
| Test fixtures reference old paths | `.claude/coordination/__tests__/` has hardcoded flat paths. Update all test assertions and fixture paths |
| Skill blueprints reference old paths | `.claude/skills/learning-loop/references/*.md` has flat path examples. Update all path references |
| Git history fragmentation | Use `git mv` for moves to preserve history. Acceptable trade-off for structural improvement |

## Open Questions

1. **Claims are frozen-legacy** — should they be moved and renamed to the new convention, or left in place (or archived)? Their IDs are referenced by experiments via `record:` refs which are id-based, not path-based, so moving is safe. But renaming changes filenames which are not part of the ID reference. **Decision: move to surface dir, rename to new convention. Claims stay as claims — NOT moved to index.**
2. **Index is machine-derived** — should the old index files be deleted and regenerated, or should they be moved and the extractor updated to write to the right surface? **Decision: delete and regenerate after move.**
3. **`product/` top-level vs `records/product/`** — The write gate allows `product/**` for runtime probes and product code. This is separate from `records/product/**` (the record ledger). No conflict.
4. **Split surface naming** — `experiment-product-build-fastapi-reference-...` becomes `experiment-fastapi-20260511T003000Z-reference.yaml`. The `fastapi` surface is explicit in path and filename; topic drops redundant tech name. Same for tanstack. Loop→meta merges follow same pattern (`loop` prefix becomes `meta`).
5. **Evidence without `## Findings`** — 22 of 58 evidence files lack `## Findings`. Migrate all or only templated ones? **Decision: migrate all 58.** Extract-index already skips non-templated files; validate-records ignores markdown. Dropping them would break `local:` refs in experiments/decisions/claims.
6. **Observations per-surface vs mixed** — Should observations follow the surface-first rule? **Decision: mixed flat folder.** Observations are constraint state, not knowledge packages. They cross-cut surfaces. Per-surface adds walk-complexity to `file-readers.js`, `check-budget.js`, `gate-utils.cjs` for 10 files with no benefit.

## Ambiguous File Surface Assignments (Resolved)

| File | Surface | Reasoning |
|---|---|---|
| `claim-product-fastapi-reference.yaml` | `product/` | Product-level claim about endpoint exposure, not FastAPI framework knowledge |
| `claim-product-tanstack-reference-view.yaml` | `product/` | Product-level claim about view rendering, not TanStack framework knowledge |
| `decision-20260510T172056Z-yaml-parser-library-swap.yaml` | `meta/` | Tooling/infrastructure decision (YAML parser), not product-specific |
| `decision-20260509T192448Z-experiment-result-convention.yaml` | `meta/` | Meta convention about experiment result formatting |
| `decision-20260509T192449Z-prospective-convention-application.yaml` | `meta/` | Meta convention application rule |
| `decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml` | `meta/` | Knowledge pack infrastructure decision |
| `decision-20260514T190131Z-observations-artifact-type.yaml` | `meta/` | Observation schema infrastructure |
| `decision-20260517T1200Z-observation-state-check-rule.yaml` | `meta/` | Observation checking rule |
| `decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` | `meta/` | Loop meta evidence gap |
| `decision-260512T0944Z-ajv-schema-validation-adoption.yaml` | `meta/` | Schema validation tooling |
| `decision-260512T1316Z-knowledge-pack-retirement.yaml` | `meta/` | Knowledge pack infrastructure |
| `decision-260512T1321Z-artifact-timestamp-convention.yaml` | `meta/` | Timestamp convention meta rule |
| `decision-260512T1915Z-source-ref-uri-pattern-adoption.yaml` | `meta/` | Source ref pattern meta rule |
| `decision-260521T0000Z-add-update-observation-to-mcp-server.yaml` | `meta/` | MCP server infrastructure |
| `decision-260521T2101Z-envelope-pattern-reuse.yaml` | `product/` | Product data pattern (envelope) |
| `decision-260521T2102Z-fundamental-live-gate.yaml` | `product/` | Product live gate behavior |
| `decision-260521T2103Z-frontend-route-tabs.yaml` | `product/` | Product frontend routing |
| `decision-260521T2104Z-no-caching-layer.yaml` | `product/` | Product architecture decision |

All other files have unambiguous surface prefixes in their existing filenames.

## Next Steps

1. Create implementation plan (delegate to `planner` agent)
2. Run full test suite as baseline — all must pass before migration starts
3. Update `gate-utils.cjs` `WRITE_PATH_PATTERNS` to `records/*/<type>/**` BEFORE moving files
4. Execute file moves (`git mv`) + tool updates in a single branch
5. Delete old index files, run `pnpm extract:index` to regenerate
6. Run `pnpm check`, full test suite, verify all tests pass
7. Fix any broken references
8. Commit with conventional commit: `refactor(records): surface-first directory restructure`
9. Update docs (`docs/artifact-concepts.md`, `docs/record-system-architecture.md`, `README.md`)

## Rollback Plan

If migration breaks validation or tests irreparably:
1. `git reset --hard HEAD` on the migration branch (all moves are `git mv`, so single commit rollback)
2. Restore old index files from git if deleted
3. Re-run `pnpm check` and test suite to confirm clean state
4. Branch off fresh and retry with smaller surface batch
