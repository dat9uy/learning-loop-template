# Brainstorm: Capability Generation via Surface Adapters

**Date**: 2026-05-20
**Type**: brainstorm
**Topic**: Replacing hand-written capability records with runtime-derived generation
**Status**: agreed, debate closed, ready for plan

## Problem Statement

Capability records in `records/capabilities/` describe what product surfaces expose. They are currently hand-written YAML files. A drift validator compares them against actual product code (FastAPI routes, TanStack routes). The records drift because hand-written documentation always diverges from code.

The deeper issue: product surfaces use heterogeneous technologies (OpenAPI HTTP/REST, TanStack file-system routes, future WebSocket/gRPC). No unified artifact exists that other learning-loop artifacts can reference without understanding each surface's native spec.

## What Was Discussed

### 1. Is product code an artifact?

Product code (`product/api/src/routers/reference.py`, `product/web/src/routes/`) is the ground truth, but it is not a learning-loop artifact. Raw source code is too verbose, surface-specific, and mixed with implementation concerns for agents to consume directly.

Domain modeling (business logic) is the highest truth and cannot be tested against surfaces. Surfaces are projections of that logic.

### 2. Current architecture (validation model)

```
hand-written records  ←—— drift validator ——→  product surfaces
                        (regex parsers per surface)
```

Problems:
- Records are hand-written, so they drift
- Regex parsers are fragile; framework convention changes break them
- Adding a new surface type means writing a new parser + validator
- The validator only detects drift; it doesn't prevent it

### 3. Proposed architecture (generation model)

```
product surfaces (running, self-describing)
        |
        v
   Surface Adapters (per-surface modules)
        |
        v
   Adapter Registry (maps surface type → adapter)
        |
        v
   Capability Records (derived, canonical YAML)
        |
        v
   Other learning-loop artifacts (tests, docs, experiments, decisions)
```

### 4. Terminology (agreed)

| Term | Definition |
|------|------------|
| **Surface Adapter** | Per-surface module that connects to a running product surface, reads its native self-description, and emits normalized capability entries. |
| **Adapter Registry** | Centralized mapping of `surface` type strings to adapter modules. The single source of truth for supported surfaces. Adapters do not define their own surface type. |
| **Capability Record** | Canonical, surface-agnostic YAML in `records/capabilities/`. Other artifacts reference this, never raw product code. |

### 5. Trigger model

Extraction is **operator-triggered**, not automatic. Agents do not mutate state records. The operator (or a skill acting on explicit instruction) runs the extraction command after product code changes.

Command: `pnpm generate:capabilities` (or similar local script)

Why not pre-commit hooks or CI gates: the learning loop is local; it should not be tangled with shipping/push/PR to GitHub.

### 6. Surface types and native self-descriptions

| Surface | Native self-description | Adapter approach |
|---------|------------------------|-------------------|
| FastAPI / HTTP/REST | `/openapi.json` from running app | HTTP GET to OpenAPI endpoint; derive `source` from operation path |
| TanStack Router | Route definitions in `router.tsx` + route files | Read route definitions; derive `source` from route path |
| Future: WebSocket | Handshake schema | TBD |
| Future: gRPC | Server reflection or `.proto` | TBD |

Each surface brings its own adapter. The only shared code is the normalizer that turns native descriptions into `records/capabilities/*.yaml`.

**Source derivation principle:** `source` is derived directly from the native self-description, not from probe metadata or source-parsing. For HTTP/REST, `source` is the operation path (`GET /reference/equity`). For TanStack, `source` is the route path (`/reference/equity`). No custom probe metadata (`x-source`, `meta.source`) is required.

**Minimal design principle:** Capability records are reference artifacts, not exhaustive documentation. Agents read product code directly for implementation details. Generated `maps[]` contains only `source` (from native self-description). `route_class`, `response_class`, and `view_class` are not generated — they have no mechanical consumer in the learning loop and add noise.

## Final Recommended Solution

Replace the drift validator with a **capability generation pipeline**:

1. **Surface Adapters**: Build per-surface adapters that read native self-descriptions and emit normalized capability entries. FastAPI adapter reads OpenAPI JSON; TanStack adapter reads route definitions from `router.tsx` and route files.

2. **Adapter Registry**: Centralized registry maps surface type strings to adapter modules. Adapters do not define their own surface type.

3. **Generation CLI**: Add `pnpm generate:capabilities` that runs all registered adapters and writes `records/capabilities/*.yaml`. One record per (stack, domain module), ID derived from `capability-{stack}-{domain}-{surface-slug}`.

4. **Capability records are minimal**: No `id`, `status`, `supersedes`, `created_at`, `updated_at`, `source_refs` inside the body. Only `type`, `schema_version`, `stack`, `surface`, `maps[]` (containing `source`). Verification linkage lives in index entries (Tier 1), not capability records (Tier 2). Schema version bumps to `2.0` to signal the new minimal format.

5. **Post-generation check**: `pnpm check` runs `generate:capabilities --dry-run` and fails if records are stale. The operator runs `pnpm generate:capabilities` to update after modifying product routes. No separate drift validator — drift is impossible when records are generated.

6. **Cut-over**: Delete old `tools/validate-capability-product-drift/` entirely after generated records are verified. Only 2 existing capability records to migrate.

## Risks

| Risk | Mitigation |
|------|-----------|
| Adapters require running product surfaces | Document startup prerequisites; fail fast with clear error if surfaces not running |
| TanStack adapter reads source files directly | Route definitions in `router.tsx` are the native self-description for now; document limitation |
| Operator forgets to regenerate after surface changes | Make generation a documented step in `ck:*` ship phase and local skill references |
| Adapter output format changes, breaking record consumers | Version the capability record schema; adapters emit schema-versioned output |
| Agents skip product-code reading step and infer dependencies from capability names | Pattern document explicitly warns against inference; lookup chain mandates reading product code as ground truth |

### 7. Which surfaces get adapters

Not every code boundary gets an adapter. A surface gets an adapter only if it meets both criteria:

1. **Product surface** — code we own. External libraries (vnstock_data) are verified via assertions in `records/index/`, not capability records.
2. **Native self-description** — the surface exposes its routes/endpoints mechanically (OpenAPI spec, route definitions). Surfaces without this cannot be read by an adapter.

**What does NOT get an adapter:**
- **External libraries** (vnstock_data) — upstream dependencies verified by assertions and experiments, not product surfaces.
- **UI-only routes** — a root layout or static marketing page has no exposed interface to describe.
- **Internal utility modules** — middleware, helpers, config files have no exposed interface to describe.

## Next Steps

1. Create `/ck:plan` for implementation phases
2. Build FastAPI surface adapter (reads OpenAPI JSON, derives `source` from operation paths)
3. Build TanStack surface adapter (reads `router.tsx` + route files, derives `source` from route paths)
4. Add `pnpm generate:capabilities` script
5. Build `tools/list-probes/` CLI helper (`pnpm list-probes --stack {stack}`)
6. Build `tools/search-index/` CLI helper (`pnpm search-index --capability {cap} --dimension {dim} --status {status}`)
7. Update docs (full list below)
8. Update capability record schema (`schemas/capability.schema.json`) to reflect minimal generated format
9. Update `.claude/skills/learning-loop/` to reference adapters in workflow rules
10. Add Tier 2 Verification Lookup pattern to skill references (`orchestration-patterns.md` or `context-retrieval-patterns.md`)
11. Update `package.json` scripts (`generate:capabilities`, `list-probes`, `search-index`, update `check`)

### Docs to Update

| Doc | Why | Severity |
|---|---|---|
| `docs/operator-guide.md` | Replace "Capability Validation" drift section with generation workflow, surface adapter criteria, new `pnpm generate:capabilities` command, update agent intake flow step 12 | Major |
| `docs/artifact-reference.md` | Update Capability schema reference to v2.0 minimal format (drop `id`, `status`, `supersedes`, `created_at`, `updated_at`, `source_refs`; `route_class` dropped, only `source` in `maps[]`); update Capability Term Glossary to reflect generation model | Major |
| `docs/record-system-architecture.md` | Update capability record description in entity roles; update product generation loop section to reflect generated records; update verification axes | Minor |
| `docs/red-team-review.md` | Update capability record review checklist to reflect native-derived `source` and generation model | Minor |
| `docs/charter.md` | Verify no stale references to hand-written capability records; clarify `product/<stack>/capabilities/` = runtime probes (unchanged) | Trivial |
| `.claude/skills/learning-loop/references/orchestration-patterns.md` | Add "Tier 2 Verification Lookup Pattern" (or split to `context-retrieval-patterns.md` if >200 lines); document 7-step lookup chain, CLI helper references, STOP guards | Major |
| `.claude/skills/learning-loop/references/learning-loop-rules.md` | Add `list-probes` and `search-index` to validation commands section if applicable; add cross-reference to new lookup pattern | Minor |

---

## Pre-Planning Resolutions

The following gaps were identified in the gap analysis and are now resolved. These decisions feed directly into `/ck:plan`.

### Gap 1 — Probe metadata mechanism (RESOLVED → REVISED)

**No probe metadata required.** `source` is derived directly from native self-description.

**FastAPI:** Adapter reads OpenAPI JSON from the running app. `source` is the operation path (`GET /reference/equity`). No `x-source` extensions needed.

**TanStack:** Adapter reads route definitions from `router.tsx` and route files. `source` is the route path (`/reference/equity`). No `meta.source` needed. No Vite plugin needed.

### Gap 2 — Adapter → record grouping logic (RESOLVED)

Group by route path prefix. `/reference/equity` and `/reference/company/{symbol}` → domain `reference`. Record ID: `capability-{stack}-{domain}-{surface-slug}` (e.g., `capability-api-reference-http-rest`). Multiple prefixes → multiple records. Deterministic, zero config.

### Gap 3 — Schema transition plan (RESOLVED)

Two-phase transition:
- **Phase 1:** Update schema to v1.1 — make `id`, `status`, `created_at`, `updated_at`, `source_refs`, `supersedes` optional. Keep existing records as-is. Add optional `generated: boolean` field.
- **Phase 2 (post cut-over):** Bump to v2.0 with minimal format as canonical. Old records regenerated or grandfathered.

### Gap 4 — `source` content and derivation (RESOLVED)

`source` is the product surface identifier derived directly from native self-description. Required.
- HTTP/REST: `GET /reference/equity` (operation path from OpenAPI)
- TanStack: `/reference/equity` (route path from router)

`source` answers "where in the product surface is this capability exposed?" It is not a library API path, not an index entry ID, and not a runtime probe reference. It is a stable reference to the product surface itself.

### Gap 5 — `source_refs` provenance (RESOLVED)

`source_refs` is fully removed from capability records. In the inverted model, capability records carry no verification linkage whatsoever — they are pure structural descriptions (Tier 2). Verification linkage lives in index entries (Tier 1). To answer "is this safe to build?", agents trace from capability → product code → runtime probes → index entries.

This eliminates the frontend-dependency question entirely: frontend capability records do not reference API capability records or index entries directly. The lookup chain discovers the dependency graph through product code reading.

### Gap 6 — Adapter testing strategy (RESOLVED)

Unit tests with fixtures. Each adapter gets a `fixtures/` directory:
- `http-rest/`: Mock OpenAPI JSON
- `tanstack/`: Mock route files

Tests verify correct normalized entries from fixtures (no running servers). One integration test runs against actual dev servers in CI.

### Gap 7 — `pnpm check` integration (RESOLVED)

`check` becomes: `generate:capabilities --dry-run && validate:records && test`.

The `--dry-run` flag generates to a temp directory, diffs against existing records, and fails if any file differs. `validate:records` and `test` stay unchanged.

### Gap 8 — Cut-over criteria (RESOLVED)

Cut-over accepted when:
1. All existing records regenerate with equivalent content (or documented acceptable diffs)
2. `pnpm generate:capabilities` output passes `pnpm validate:records`
3. `pnpm check` passes with new pipeline
4. Operator manually reviews generated records
5. Old drift validator deleted; `check` no longer references it

### Gap 9 — Adapter registry location and format (RESOLVED)

JS module at `tools/generate-capabilities/adapters/registry.js`:

```js
export const adapterRegistry = {
  "HTTP/REST": () => import("./fastapi-adapter.js"),
  "TanStack Start route": () => import("./tanstack-adapter.js"),
};
```

Lazy-loaded dynamic imports. Each adapter exports: `async function extract(root) => { entries: [{source, domain}] }`.

---

## Open Debate: Inverted Model and Context Retrieval Strategy

**Status:** closed — resolved in follow-up session 2026-05-20.

### Resolution 1 — Inverted Model Confirmed

The inverted model is the correct entity relationship between Tier 1 (index entries) and Tier 2 (capability records). Capability records remain pure structural descriptions with no verification state. The dependency graph is:

```
capability (Tier 2, structural)
  → product surface (ground truth)
    → external dependency (vendor API, library)
      → index entry (Tier 1, verified)
```

Flattening this into a direct capability → index link would violate tier separation and reintroduce drift. The lookup chain through product code is the feature, not the bug — it forces agents to read ground truth.

### Resolution 2 — No Mapping Artifact

No component-specific mapping artifact is needed. Coarse-grained index entries + targeted keyword search across pre-filtered results is sufficient for "is this safe to build?" questions. No concrete failing query identified. Trade-off accepted: do not build index for things that do not exist yet.

### Resolution 3 — `source_refs` Fully Removed

`source_refs` is removed from capability records entirely (not optional, not present). In the inverted model, capability records carry no verification linkage whatsoever. The v2.0 minimal format contains only `type`, `schema_version`, `stack`, `surface`, `maps[]` (containing `source`).

### Resolution 4 — Context Retrieval as Deterministic Pattern

The lookup chain is documented as a deterministic reference pattern in `.claude/skills/learning-loop/references/`, not as a new mechanism. The pattern is universal — any Tier 2 artifact that depends on external boundaries follows the same trace.

**Mechanical steps (1, 3, 4, 5):** Wrapped in CLI helpers in `tools/`:
- `pnpm list-probes --stack {stack}` — list runtime probes in `product/<stack>/capabilities/`
- `pnpm search-index --capability {cap} --dimension runtime --status active` — query index entries

**Reasoning steps (2, 6, 7):** Agent reads product code and assertion text; no mechanization.

**Pattern location:** `orchestration-patterns.md` (or `context-retrieval-patterns.md` if file exceeds 200 lines after addition). Pattern title: "Tier 2 Verification Lookup Pattern" or "External Boundary Trace."

**Pattern guard:** Capability records contain no dependency metadata. The only source of external dependency truth is the product code itself. Never infer dependencies from capability record filenames or domains.

### Resolution 5 — No New Skill or MCP

The CLI helpers are plain scripts in `tools/`, referenced by the existing `learning-loop` skill. No new skill created. Constraint-gate MCP stays untouched — query helpers do not belong in constraint enforcement.

### Closed Blockers

| Blocker | Resolution |
|---|---|
| Inverted model needs mapping artifact, granular index entries, or neither | Neither. Coarse-grained entries + keyword search sufficient. |
| `source_refs` fully removed or made truly optional? | Fully removed. v2.0 has no `source_refs` field. |
| `docs/operator-guide.md` agent intake flow rewrite for inverted lookup chain | Document lookup pattern in skill references; update operator-guide to reference pattern. |
