# Brainstorm: Three-Layer Capability Model

## Problem Statement

The learning loop has two artifacts sharing the name "capability":

- **Executable scripts** under `product/<stack>/capabilities/` that test external library APIs directly (live vendor calls).
- **YAML records** under `records/capabilities/` that map verified library surfaces to product surfaces.

Both are called "capability" in docs, schemas, and filenames. This creates ontological confusion: a new agent cannot tell whether `capability-01-reference.py` and `capability-fastapi-reference-rest.yaml` are stages of the same thing or unrelated things. They are unrelated — they live in different layers, serve different purposes, and connect through citation, not evolution.

The downstream symptom: capability records cite frozen-legacy claims (`record:claim-product-fastapi-reference`) instead of live index entries, breaking the agent-orientation chain from assertion → product surface.

## Current State

Verified from live codebase:

| Artifact | Location | Role | Cites |
|----------|----------|------|-------|
| Runtime probe | `product/api/capabilities/vnstock-data/capability-01-reference.py` | Tests `vnstock_data` library directly (live VCI calls) | None (is execution substrate) |
| Experiment record | `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml` | Documents the runtime probe execution | The probe via `source_refs` |
| Evidence file | `records/evidence/vnstock-data/capability-runtime-output.md` | Captures findings from probe output | Experiment record |
| Index entry | `records/index/assertion-vnstock-data-runtime-live-api-surfaces-verified.yaml` | Extracted assertion: "Reference/Market/Fundamental/Insights/Macro surfaces work" | Evidence file + experiment |
| Capability record | `records/capabilities/capability-fastapi-reference-rest.yaml` | Maps library surface → product surface | **Live assertion** (`record:assertion-vnstock-data-runtime-live-api-surfaces-verified`) + probe |
| Product code | `product/api/src/routers/reference.py` | Implements FastAPI endpoints | Nothing in records (orphaned) |
| Product tests | `product/api/tests/test_reference.py` | Tests product code with mocked `FakeReference` | Nothing in records |

The chain from index entry to product code is broken at the capability record: it points backward to a frozen claim instead of forward from a live assertion.

The web stack has no runtime probes because it has no external library to probe. It calls the FastAPI backend internally. `product/web/capabilities/` contains only a README.

## The Three-Layer Model

The learning loop touches external boundaries at three distinct layers. Each layer has its own artifact types, verification method, and agent-orientation role.

### Layer 1 — Runtime Verification

**Question:** Does the external library work?

**Artifacts:**
- **Runtime probe** — executable script that calls the library directly against live endpoints.
- **Experiment record** — documents the probe execution, approval gate, and output policy.
- **Evidence file** — captures metadata + schema-shape + redacted sample output from the probe.
- **Index entry** — machine-extracted assertion derived from evidence `## Findings`.

**Properties:**
- Live external calls. Consumes vendor device slots and rate-limit budget.
- Shares the stack's persistent environment (`product/api/.venv`).
- Output is metadata-only or sample-output under approved policy.
- Agent never writes new probes without approved experiment + budget check.

**Example chain:**
```
probe-01-reference.py runs
  → experiment-vnstock-capabilities-20260509T174957Z.yaml records it
    → evidence capability-runtime-output.md captures findings
      → pnpm extract:index produces assertion-vnstock-data-runtime-live-api-surfaces-verified.yaml
```

### Layer 2 — Surface Mapping

**Question:** Given the library works, what product surfaces do we expose?

**Artifacts:**
- **Decision record** — approves or rejects product scope.
- **Capability record** (YAML) — maps verified library surface to product surface.

**Properties:**
- No live calls. Pure specification.
- `source_refs` must point to active index entries (Layer 1 output), not frozen claims.
- `maps[]` entries define the contract: library method → route/response model.
- Agent reads this to orient: "what product surfaces exist and what grounds them?"

**Example:**
```yaml
source_refs:
  - record:assertion-vnstock-data-runtime-live-api-surfaces-verified
  - local:product/api/capabilities/vnstock-data/capability-01-reference.py
maps:
  - source: vnstock_data.Reference.equity.list
    route_class: GET /reference/equity
    response_class: EquityListResponse
```

### Layer 3 — Product Implementation

**Question:** Does the product code implement the approved surfaces correctly?

**Artifacts:**
- **Product code** — FastAPI routes, React components, etc.
- **Product tests** — fixture-backed or mocked tests verifying product behavior.

**Properties:**
- No live external calls (mocked/stubbed in tests).
- Governed by normal software engineering practices (plan → cook → review), not learning-loop external-boundary governance.
- The loop does not scaffold or generate product code. It approves scope; humans build.

**Example:**
- `product/api/src/routers/reference.py` implements `GET /reference/equity`.
- `product/api/tests/test_reference.py` verifies it with `FakeReference`.

### Layer Boundaries

| Concern | Layer 1 | Layer 2 | Layer 3 |
|---------|---------|---------|---------|
| Live external calls | Yes | No | No |
| Consumes vendor budget | Yes | No | No |
| Requires experiment approval | Yes | No | No |
| Requires decision approval | No | Yes | No (decision gates entry) |
| Agent-orientation value | "Library works" | "What exists and why" | "How it's built" |
| Mutable during session | No (append-only) | No (append-only) | Yes (normal dev) |

## Naming / Ontology Resolution

The word "capability" is overloaded. Resolution:

| Current Name | New Concept Name | Rationale |
|--------------|------------------|-----------|
| Capability script | **Runtime probe** | Emphasizes it probes library runtime, not product. Eliminates collision with "capability record." |
| Capability record | **Capability record** (keep) | It records the capability mapping. No collision once "script" is renamed. |
| `product/<stack>/capabilities/` | **Runtime probe root** (keep path) | Directory stays for backward compatibility. Documented as probe root, not capability root. |

In docs and agent prompts, use the full term:
- "Runtime probe" — never "capability script" again.
- "Capability record" — never abbreviated to "capability" without context.

## Agent Orientation Flow

A future agent encountering the Reference slice for the first time:

1. **Read capability records** (`records/capabilities/capability-fastapi-reference-rest.yaml`) → learns product surfaces exist (`GET /reference/equity`, etc.).
2. **Follow `source_refs[0]`** → reads index entry (`assertion-vnstock-data-runtime-live-api-surfaces-verified.yaml`) → learns the library is verified.
3. **Follow `source_refs[1]`** → reads runtime probe (`capability-01-reference.py`) → can re-run the executable proof if needed.
4. **Read product code** (`product/api/src/routers/reference.py`) → verifies the implementation matches the capability record's `maps[]`.
5. **Read product tests** (`product/api/tests/test_reference.py`) → verifies tests cover the mapped surfaces.

This flow was previously broken at step 2 because `source_refs[0]` pointed to `record:claim-product-fastapi-reference` (frozen) instead of the live index entry. Fixed 2026-05-20 — both capability records now cite `record:assertion-vnstock-data-runtime-live-api-surfaces-verified`.

## Directions for Next Steps

Three follow-up workstreams derived from this model. Each is a separate plan.

### Workstream A: Re-ground Capability Records on Index Entries

Update `records/capabilities/capability-fastapi-reference-rest.yaml` and `capability-tanstack-reference-render.yaml` to replace frozen-claim `source_refs` with live index entry references. Validate that agent-orientation flow (steps 1–3 above) works end-to-end.

**Scope:** Editorial record changes. No schema changes. No code changes.

### Workstream B: Rename "Capability Script" to "Runtime Probe" in Docs

Walk `docs/operator-guide.md`, `docs/record-system-architecture.md`, `docs/artifact-reference.md`, and `docs/philosophy.md` to replace "capability script" with "runtime probe." Update directory comments and READMEs in `product/api/capabilities/` and `product/web/capabilities/`.

**Scope:** Editorial docs changes. No file moves. No code changes.

### Workstream C: Verify Product Code Against Capability Records

Build a lightweight validation tool (or extend `tools/validate-records/`) that checks whether product code implements every `route_class` declared in capability records. This makes Layer 2 → Layer 3 connection machine-checkable.

**Scope:** New tool or validator extension. Reads capability records + parses product source. Reports drift.

**Deferred:** Schema changes to capability records (e.g., adding `assertion_ref` per map). The current `source_refs` at record level is sufficient for agent orientation. Per-map traceability is a future enhancement if drift becomes frequent.

## Risks

| Risk | Mitigation |
|------|------------|
| "Runtime probe" rename confuses operators used to "capability script" | Update all docs in one pass; add note in `docs/operator-guide.md` glossary |
| Capability records still feel passive after re-grounding | Accept that Layer 2 is specification, not driver. Product code is driven by normal engineering, not loop artifacts |
| Web stack never gets runtime probes, creating asymmetry | Document explicitly: web stack probes the API layer (internal), not external libraries. Asymmetry is correct |
| Workstream C tool becomes brittle (regex parsing product code) | Start with regex/grep heuristics. Escalate to AST parsing only if N>=2 proves regex insufficient |

## Trade-off Summary

| Approach | Human Work | Machine Work | Clarity Gain |
|----------|-----------|-------------|--------------|
| Do nothing | None | None | None — confusion persists |
| A only (re-ground refs) | Low | None | Medium — chain restored, naming confusion remains |
| A + B (re-ground + rename) | Medium | None | **High** — chain restored + naming disambiguated |
| A + B + C (all three) | Medium | Medium | High — plus machine-checkable Layer 2→3 |

**Recommended:** A + B first (editorial, low risk, high clarity gain). C after A + B are stable.

## Implementation Plan

Workstreams A+B were planned in `plans/260520-1650-reground-capability-records-rename-runtime-probe/`.

**Phase 1** — Re-ground capability records on index entries (`phase-01-re-ground-capability-records-on-index-entries.md`)
**Phase 2** — Rename capability script to runtime probe in docs (`phase-02-rename-capability-script-to-runtime-probe-in-docs.md`)

### Scope Changes During Validation

The validation interview (2026-05-20) confirmed the original design and expanded scope in two areas:

| Original Scope | Validated Scope | Rationale |
|---------------|-----------------|-----------|
| Rename only the artifact term "capability script" → "runtime probe" | **Also** rename the experiment concept name "Capability Runtime Experiment" → "Runtime Probe Experiment" | User decision: full naming consistency |
| Docs + READMEs only (8 files) | Docs + READMEs + skill references (10 files) | `.claude/skills/learning-loop/references/learning-loop-rules.md` and `prompt-blueprints-product-build.md` included per user decision |
| Tanstack capability grounding left implicit | Explicitly confirmed: tanstack cites same API-layer assertion as fastapi | Web stack has no external library probes; it grounds on the verified API layer |

### Implementation Status

| Phase | Status | Date |
|-------|--------|------|
| 1 | Completed | 2026-05-20 |
| 2 | Completed | 2026-05-20 |

**Validation:** 10/10 claims verified, 0 failures. Plan implemented 2026-05-20.
**Next step:** Workstream C (machine-checkable Layer 2→3 validation) remains deferred.
