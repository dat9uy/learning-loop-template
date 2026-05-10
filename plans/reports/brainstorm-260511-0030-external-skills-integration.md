# Brainstorm: External Skills Integration with Learning Loop

Date: 2026-05-11
Scope: Design integration contract + scope first product-build experiment.

Supersedes: `plans/reports/brainstorm-20260510-external-skills-integration.md` — original drafted before two predecessor plans landed. The structural assertions about repo layout, capability schema, and bootstrap entry have shifted; this report is rebased on the post-migration, post-bootstrap reality.

## Predecessor State (Verified Ground Truth)

Two plans completed between the original brainstorm and this revision. Their outputs are now load-bearing inputs for the product build.

| Predecessor plan | Outcome relevant to this build |
|---|---|
| `plans/260510-1600-capabilities-stack-migration/` (completed) | Capability scripts now live at `product/api/capabilities/vnstock-data/*.py`. `schemas/capability.schema.json` authored. Validator allowlist widened (per-record-type table) so capability records may cite `local:product/*/capabilities/...`. `claim-loop-capabilities-stack-allowlist` flipped to `verified`. `decision-20260510T160000Z-capabilities-stack-migration` approved. |
| `plans/260510-1744-vnstock-installer-bootstrap/` (completed) | `product/api/pyproject.toml` carries public deps only — no `vendor` extra. `product/api/scripts/install-vnstock.sh` is SHA-pinned and idempotent. Root `pnpm bootstrap:api` chains `uv sync` + `install-vnstock.sh`. `decision-20260510T170623Z-vnstock-installer-bootstrap` approved. Runtime evidence recorded for fresh-clone bootstrap. |

What is NOT yet done (still this build's job): `claim-vnstock-install-sandbox.verification.product` is `claimed`; `decision_refs: []`. The product flip to `approved` is gated by the new `decision-<ts>-product-approval-vnstock-reference-slice.yaml` authored in phase 01 of this plan. `records/capabilities/` directory exists and is empty — first capability records land here in phase 01.

## Planner Handoff (Read First)

This report is the brainstorm output. The next step is `/ck:plan`, run in a fresh session after a context clear. This section is self-contained context for that session — read this whole report, then plan; do not need chat history.

### Your role as the planner

Produce a phase plan under `plans/<ts>-fastapi-reference-build/` matching the **Phase plan shape** section below. Do not implement code, do not author records, do not modify the `learning-loop` skill, do not edit `docs/`. Plan only.

### Required reading order

1. This report top-to-bottom.
2. `docs/operator-guide.md` — Capability Runtime Experiment, Agent Intake Flow, Runtime Validation Request Protocol.
3. `docs/lab-model.md` — entity roles + verification axes.
4. `docs/claim-verification.md` — dimension semantics for the claim updates this build will trigger.
5. `records/claims/claim-vnstock-install-sandbox.yaml` — the upstream library claim that this build's product decision flips.
6. `records/decisions/decision-20260510T160000Z-capabilities-stack-migration.yaml` — per-stack capability layout + per-record-type allowlist (binds the source-ref shape of capability records authored here).
7. `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml` — two-stage bootstrap; binds the env contract (`product/api/.venv` is created via `pnpm bootstrap:api`, not `uv sync` alone, not via a vendor extra).
8. `product/api/capabilities/vnstock-data/capability-01-reference.py` + `records/evidence/vnstock-data/capability-runtime-output.md` — the verified Reference-layer surfaces this build wraps.
9. `schemas/capability.schema.json` — authoritative shape for capability records (already shipped; do NOT redraft). Required fields: `id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`, `stack`, `surface`, `maps`. `stack` is an open string; `maps[]` requires `source` and supports `route_class`, `view_class`, `response_class`.
10. `schemas/{claim,decision,experiment,risk}.schema.json` — schemas for record drafting.

### What the plan must produce

Phase files matching the structure in **Phase plan shape**, with each phase carrying:

- A title naming the phase type (loop / skill).
- Inputs the phase reads (specific file paths).
- Outputs the phase writes (specific file paths) + write-allowlist.
- A pre-drafted prompt block:
  - Loop phases: record-authoring prompt, structured per `references/prompt-blueprints.md` from the `learning-loop` skill.
  - Skill phases: constraint prompt naming the external skill(s), read-allowlist, write-allowlist, forbidden actions, stop conditions.
- Approval gates (operator approval required between phases — call them out explicitly).
- Validation commands (`pnpm validate:records`, `pnpm check`).
- Phase success criteria (process steps + experiment outcome — orthogonal axes per `docs/operator-guide.md` "Phase Success Criteria").

The plan must reference `claim-vnstock-install-sandbox.verification.product` flip (claimed → approved) as a phase-01 deliverable, gated by the new `decision-<ts>-product-approval-vnstock-reference-slice` decision record.

### What the plan must NOT do

- Implement code (no `product/api/src/*.py`, no `product/web/src/*.tsx`).
- Author records under `records/` (drafting prompts is OK; writing actual YAMLs is for phase 01 execution, not planning).
- Edit `docs/` (the harmonization task is Next Step #3, separate from this plan).
- Modify the `learning-loop` skill (Next Step #2, separate).
- Modify `schemas/capability.schema.json` (already shipped via the capabilities-stack-migration plan; treat it as a hard contract).
- Modify `product/api/pyproject.toml` to re-add a `vendor` extra (forbidden by `decision-20260510T170623Z`).
- Replace `pnpm bootstrap:api` with `uv sync --extra vendor` in any prompt or doc snippet (the `vendor` extra no longer exists).
- Move capability scripts back to `product/capabilities/` (forbidden by `decision-20260510T160000Z`).
- Run `pnpm validate:records` against draft content (no draft records exist yet at planning time).
- Use bare "capability" without qualifier — always **capability script**, **capability record**, or **Capability Runtime Experiment** (per Terminology section).
- Use the word `user` or feature/user-story language anywhere in the plan or its prompt blueprints.

### Canonical sections in this report

| Need | Section |
|---|---|
| Naming rule for "capability" | Terminology |
| Locked architectural choices | Decisions Locked This Session |
| Why this approach over alternatives | Approach Evaluation |
| Pipeline shape | Final Solution → Three-layer build pipeline |
| File layout for plan | Final Solution → Phase plan shape |
| What records to author when | Final Solution → First build experiment scope (Records authored) |
| Capability record YAML shape | Implementation Considerations |
| Acceptance signal | Success Criteria |
| Risks the plan must mitigate | Risks |
| Open items the plan inherits | Unresolved Questions |

### Skill split for phase 04

Phase 04 invokes both `ck:tanstack` (TanStack Start scaffold: project init, file-based routes under `product/web/src/routes/`, server functions, route loaders) and `ck:frontend-development` (React components inside routes: data table, detail view, Suspense, MUI styling). The constraint prompt for phase 04 must split write paths to prevent overlap — see Unresolved Questions for the open glob-list decision.

### Stop conditions for the planning session

- If any required reading file is missing or unreadable → stop, report blocker.
- If the user asks for code or records during planning → redirect; this session is plan-only.
- If `claim-vnstock-install-sandbox` shows `runtime` not `verified` or `install` not `verified` → stop; the upstream claim is not ready for product decision.
- If `product/api/.venv/bin/python` is missing or cannot import `vnstock_data` → stop; bootstrap state is broken, run `pnpm bootstrap:api` and re-verify before planning continues.
- If `schemas/capability.schema.json` is missing or its `stack` field is absent → stop; the capabilities-stack-migration decision contract is broken and predecessor work needs investigation.

## Problem

Loop is stable. Library `vnstock_data` install + runtime dimensions verified (sandbox). Five capability scripts at `product/api/capabilities/vnstock-data/*.py` prove Reference/Market/Fundamental/Insights/Macro return usable data. Per-stack capability layout migrated. Two-stage `pnpm bootstrap:api` reproduces `product/api/.venv` from a fresh clone with a SHA-pinned vendor installer. Product dimension still `claimed`.

User wants to build a product: lightweight FastAPI service wrapping `vnstock_data` + TanStack Start frontend. Build via external skills `ck:backend-development`, `ck:frontend-development`, `ck:tanstack`.

External skills are loop-agnostic. They produce code, not records. Loop requires every product surface backed by claim → experiment → decision → evidence → capability record. Need a contract that makes external-skill output produce loop-compliant artifacts. The records ledger (claims + capabilities + experiments + decisions + evidence) is the product's knowledge base. Knowledge packs are not used in this product line; the existing `knowledge-packs/vnstock-data/manifest.yaml` stays a draft placeholder, untouched.

## Terminology

The word "capability" is currently overloaded across the repo. This report uses two distinct senses; agents and future docs/skill text MUST keep them separate.

| Term | Path | Created when | Role |
|---|---|---|---|
| **Capability script** | `product/<stack>/capabilities/<scope>/*.py` (e.g., `product/api/capabilities/vnstock-data/capability-01-reference.py`) | During runtime-verification work (already done for vnstock-data, scripts now at the per-stack home). NOT created during product build. | Python feasibility probe. Tests API-return-data runtime. Read by skill-phase external skills as input during product build. |
| **Capability record** | `records/capabilities/capability-*.yaml` | During pre-build phase 01 of a product-build plan. NEW for product builds. Directory currently exists but is empty. | Record-style YAML mapping verified library surfaces (from claims) to product surfaces (route_class, view_class). Schema at `schemas/capability.schema.json`. Authored by orchestrator in loop phase. |
| **Capability Runtime Experiment** | (concept, not a path) | When verifying a library's runtime dimension. | Existing prior pattern. Documented in `docs/operator-guide.md`. Not created during product build. |

**Disambiguation rule:** "create a capability" without qualifier defaults to **capability record** in product-build plans. Scripts live at `product/<stack>/capabilities/`; records live at `records/capabilities/`. Always qualify in writing — never bare "capability" in prompts, plan files, or skill blueprints.

## Decisions Locked This Session

| Decision | Choice | Rationale |
|---|---|---|
| Goal | Design contract + scope first build experiment | Stops short of implementation; produces a runnable plan template. |
| Repo layout | `product/api/` (FastAPI) + `product/web/` (TanStack Start) + `product/api/capabilities/` (capability scripts, per-stack home, already migrated) | Per-stack layout matches `decision-20260510T160000Z-capabilities-stack-migration`. The `product/web/capabilities/` slot is reserved for any future TS probes; not used in this build. |
| Bootstrap entry | `pnpm bootstrap:api` (chains `uv sync` over public deps + `bash scripts/install-vnstock.sh`) | Matches `decision-20260510T170623Z-vnstock-installer-bootstrap`. Skill phases that need the env import via `product/api/.venv/bin/python` after operator runs the bootstrap. Build does NOT trigger fresh installer runs (no extra device-slot consumption). |
| Claim grain | Hybrid: surface claims + endpoint sub-evidence in experiment | Same record volume as per-layer; endpoint-level traceability via experiment `method` + `observations`. |
| Pack scope | None — knowledge packs not used in this product line. Capability mappings live in `records/capabilities/` as record-style YAMLs. Existing `knowledge-packs/vnstock-data/manifest.yaml` stays a draft placeholder, untouched. | Records ledger is the knowledge base. No `facts.yaml`, no `pack capabilities.yaml`, no `record_ref: pack:...`, no `user`/feature language. Business/feature/user-story layer deferred to a separate session. |
| Contract approach | Approach 1 — phase-gated orchestration | N=1 product build; YAGNI on wrapper skill (Approach 3) and draft-records staging (Approach 2). Plain plan-file alternation. |
| First slice | Reference vertical: 3 FastAPI endpoints + 2 TanStack Start route views | Smallest end-to-end test of the contract. Reference has the simplest schemas. |
| Frontend framework | TanStack Start (file-based routes, server functions, route loaders). NOT TanStack Router-only, NOT TanStack Form, NOT TanStack AI. | Full-stack React framework matches the FastAPI-wrapped data flow; route loaders are the natural place for data fetching against the FastAPI backend. |
| Capability schema field | `stack` (open string, e.g. `api`, `web`) — already shipped in `schemas/capability.schema.json`. Resolves the original brainstorm's open question. | Open string defers nesting decisions while still binding records to a per-stack home. |

## Approach Evaluation

### Approach 1 — Phase-gated orchestration (chosen)
Plan files alternate loop phases (records authored by hand) with skill phases (external skill invoked with constraint prompt). Zero new skills, zero new conventions outside an extended task class on the existing `learning-loop` skill.

Pros: explicit gates; phase files are the audit trail; plain text; no premature abstraction.
Cons: most manual; orchestrator authors records by hand each phase.

### Approach 2 — Draft-records staging (rejected for now)
Same phases; skill phases write draft records to `plans/<id>/draft-records/`; orchestrator promotes after review.

Pros: less manual record authoring; captures observations while skill context is fresh.
Cons: new staging convention; promotion step; skill outputs may not match schema; one more directory.

Defer until manual record authoring in Approach 1 hurts.

### Approach 3 — Local `product-build` wrapper skill (rejected for now)
Build `.claude/skills/product-build/` that wraps external skills + authors records. Single invocation does pre-build + skill call + post-build.

Pros: most automation; reusable across builds.
Cons: skill engineering before N=1 ships; locks orchestration before friction observed; same anti-pattern the loop already named (`runtime-run-schema-deferral.md`, `n-equals-one-gap-class.md`).

Defer until N>=2 product builds reveal a stable pattern.

## Final Solution

### Three-layer build pipeline

```
Layer 1 - PRE-BUILD (loop authors records, no code yet)
  surface claims (claim-product-fastapi-<surface>.yaml)
  product-build experiment (status: draft)
  product-approval decision (claim-vnstock-install-sandbox.product -> approved)
  capability records (records/capabilities/capability-<id>.yaml) — technical mapping only
    schema: schemas/capability.schema.json (stack, surface, maps[])

Layer 2 - EXTERNAL SKILLS (code only, records untouched)
  Pre-flight: operator has run `pnpm bootstrap:api`; product/api/.venv exists with
    pandas, requests, uv (public) + vnstock_data (vendor, pinned-SHA installer).
  ck:backend-development reads surface claim + product/api/capabilities/.../capability-XX.py + capability records
    -> code under product/api/src/ + tests
  ck:tanstack + ck:frontend-development read same inputs, route by concern:
    ck:tanstack       -> project scaffold, file-based routes, server functions, loaders
    ck:frontend-development -> React components, Suspense, data table, detail view, styling
  -> code under product/web/src/ + tests

Layer 3 - POST-BUILD (loop closes the loop)
  build-experiment fills method, observations, result
  evidence MD: records/evidence/product-build/<surface>.md
  surface claim verification.runtime -> verified
  pnpm validate:records / pnpm check
```

### Phase plan shape

```
plans/<ts>-fastapi-reference-build/
  plan.md
  phase-01-pre-build-records.md         (loop)
  phase-02-fastapi-reference-impl.md    (skill: ck:backend-development)
  phase-03-post-build-records-api.md    (loop)
  phase-04-tanstack-reference-impl.md   (skills: ck:tanstack + ck:frontend-development)
  phase-05-post-build-records-web.md    (loop)
```

Loop phases hold a record-authoring prompt (drafted by `learning-loop` skill).
Skill phases hold a constraint prompt (drafted by `learning-loop` skill) that wraps the external-skill invocation with read-allowlist + write-allowlist + forbidden-actions + stop-conditions. A skill phase may invoke multiple external skills under one prompt — phase 04 routes scaffold work (project init, file-based routes, server functions, route loaders) to `ck:tanstack` and component work (data table, detail view, Suspense, styling) to `ck:frontend-development`. The constraint prompt names which skill owns which write paths to prevent overlap.

### `learning-loop` skill extension (only skill change)

Add task class `product-build` to `.claude/skills/learning-loop/SKILL.md`. Add reference file `references/prompt-blueprints-product-build.md` with three skeletons:

1. Pre-build record-authoring prompt (claims, capability records, draft experiment, product decision).
2. Skill-phase constraint prompt (read claims/capability-record/capability-script, write code paths, forbid record/evidence edits, stop conditions). MUST require a pre-flight check that `product/api/.venv/bin/python -c 'import vnstock_data'` succeeds; if it fails, stop with "run `pnpm bootstrap:api`" — never trigger installer from the skill phase.
3. Post-build verification prompt (run tests, capture metadata-only output, fill experiment, write evidence, flip claim dimension).

Existing security policy (no secret exfil, no raw data, no bypassed gates) applies unchanged to skill-phase constraint prompts.

### First build experiment scope

Reference vertical slice:

- Backend (`product/api/src/`): FastAPI exposing 3 reference endpoints — equity list, company info, symbol search. Pytest suite. Schema-passthrough Pydantic models (column names mirror DataFrame columns from `product/api/capabilities/vnstock-data/capability-01-reference.py`).
- Frontend (`product/web/src/`): TanStack Start, 2 routes — equity list table view + company detail view. Smoke test rendering against a recorded backend response (no live backend during frontend test).

Records authored:

- `claim-product-fastapi-reference.yaml`
- `claim-product-tanstack-reference-view.yaml`
- `experiment-product-build-fastapi-reference-<ts>.yaml` (status: draft pre-build, approved post-build)
- `experiment-product-build-tanstack-reference-<ts>.yaml` (same)
- `decision-<ts>-product-approval-vnstock-reference-slice.yaml`
- `records/capabilities/capability-fastapi-reference-rest.yaml` (3 reference surfaces; first record under the new dir)
- `records/capabilities/capability-tanstack-reference-render.yaml` (2 render surfaces)
- Update `claim-vnstock-install-sandbox.yaml` verification.product → approved with `decision_refs` populated.

## Success Criteria

Contract validation criteria (after first slice ships):

- All authored records pass `pnpm validate:records` and `pnpm check`.
- FastAPI tests pass (3/3 endpoints).
- TanStack Start smoke tests pass.
- Per-endpoint metadata captured in evidence MD matches the `capability-runtime-output.md` shape (route, status, columns, row count) — no raw data.
- Capability records under `records/capabilities/` validate against `schemas/capability.schema.json` (`stack`, `surface`, `maps[]` populated; `source_refs` cite surface claims; capability-script citations use `local:product/api/capabilities/...` and pass the per-record-type allowlist gate from `decision-20260510T160000Z-capabilities-stack-migration`).
- No `user`/feature language anywhere in capability records.
- Surface claims flip `verification.runtime` to `verified`.
- `claim-vnstock-install-sandbox.verification.product` flipped to `approved`.

Contract failure signal (drives Approach 2/3 reconsideration):

- Manual record authoring in loop phases consistently >30% of build time.
- External skills repeatedly violate write-allowlist (touch records/, evidence/) despite constraint prompt.
- Schema drift between FastAPI Pydantic models and capability evidence (passthrough breaks).

## Risks

| Risk | Mitigation |
|---|---|
| External skills ignore constraint prompt and write to forbidden paths | Constraint prompt names exact write-allowlist; orchestrator reviews diffs before commit; revoke phase if violated. |
| External skill triggers `bash scripts/install-vnstock.sh` from inside a skill phase | Constraint prompt forbids running the installer; skill phases run on the operator-bootstrapped venv only. Pre-flight is a metadata-only `import vnstock_data`, not an install. |
| Pydantic schema drift from `vnstock_data` DataFrames | Pre-build phase pins column lists from `capability-runtime-output.md` evidence; post-build experiment compares observed columns vs pinned. |
| Frontend tests require live backend (couples web tests to api running) | Record a sample response during post-build api phase; frontend smoke test uses recorded response. No live calls in web tests. |
| Capability records drift from claims as endpoints expand | Loop phase 3/5 includes a check: every `records/capabilities/` entry has a current `record_ref` to a `verified` surface claim and a current `local:product/api/capabilities/...` source-ref; reject promotion otherwise. |
| Capability records cite paths outside the per-record-type allowlist | The validator enforces capability-record-only `local:product/*/capabilities/...` per `decision-20260510T160000Z`. Plan prompts must NOT instruct skill phases or other record types to cite capability-script paths. |
| Vendor installer SHA rotates mid-build | `decision-20260510T170623Z` makes rotation a loop-recorded event. If a fresh `pnpm bootstrap:api` fails between phases, the build pauses; phase 01 must re-confirm bootstrap evidence is still current before product decision. |

## Implementation Considerations

- The repo layout migration is **already complete**. Capability scripts at `product/api/capabilities/vnstock-data/`. `product/api/pyproject.toml` carries public deps only. `product/api/.venv` is created by `pnpm bootstrap:api`. No layout work belongs in this plan.
- `decision-<ts>-product-approval-vnstock-reference-slice.yaml` is scoped to the Reference slice only. Market/Fundamental/Insights/Macro require their own product decisions later.
- TanStack Start frontend uses recorded backend responses for tests. Live integration test deferred until a separate decision approves it.
- `records/capabilities/` is currently empty. First capability records under it land in this build via phase 01. The schema (`schemas/capability.schema.json`) is the authoritative shape — do not redraft. Required fields: `id`, `schema_version`, `type: capability`, `status`, `created_at`, `updated_at`, `source_refs` (array), `stack` (open string), `surface` (string), `maps` (array of objects with `source` required; `route_class`, `view_class`, `response_class` optional).

Sample capability records (technical only, no user/feature words; matches `schemas/capability.schema.json`):

```yaml
id: capability-fastapi-reference-rest
schema_version: "1.0"
type: capability
status: draft
created_at: "2026-05-11"
updated_at: "2026-05-11"
source_refs:
  - record:claim-product-fastapi-reference
  - local:product/api/capabilities/vnstock-data/capability-01-reference.py
stack: api
surface: HTTP/REST
maps:
  - source: reference.equity.list
    route_class: GET /reference/equity
    response_class: schema-passthrough
  - source: reference.company({sym}).info
    route_class: GET /reference/company/{symbol}
    response_class: schema-passthrough
  - source: reference.search.symbol
    route_class: GET /reference/search
    response_class: schema-passthrough
```

```yaml
id: capability-tanstack-reference-render
schema_version: "1.0"
type: capability
status: draft
created_at: "2026-05-11"
updated_at: "2026-05-11"
source_refs:
  - record:claim-product-tanstack-reference-view
  - record:capability-fastapi-reference-rest
stack: web
surface: TanStack Start route
maps:
  - source: capability-fastapi-reference-rest:GET /reference/equity
    view_class: data-table
  - source: capability-fastapi-reference-rest:GET /reference/company/{symbol}
    view_class: detail-view
```

Note: the `web` capability record cites only a sibling capability record + a surface claim. It does NOT cite `local:product/web/capabilities/...` because no TS probe exists; the per-record-type allowlist permits but does not require capability-script citation.

## Next Steps

1. Hand off to `/ck:plan` with this report as input. Output: phase plan under `plans/<ts>-fastapi-reference-build/` with prompts pre-drafted for each phase.
2. Extend `learning-loop` skill: add `product-build` task class + `references/prompt-blueprints-product-build.md`. Two small edits, one new file. The constraint-prompt blueprint MUST include the bootstrap pre-flight rule (skill phases verify `import vnstock_data` against `product/api/.venv`; never trigger `install-vnstock.sh`).
3. Harmonize terminology in core docs. Edit `docs/operator-guide.md`, `docs/lab-model.md`, `docs/knowledge-pack-contract.md`, and `docs/handoff.md` so every "capability" mention is qualified as **capability script**, **capability record**, or **Capability Runtime Experiment**. The disambiguation table from this report's Terminology section is the canonical wording (note the per-stack path: `product/<stack>/capabilities/<scope>/`). Run `pnpm check` after.
4. Harmonize terminology in `learning-loop` skill. Update `.claude/skills/learning-loop/SKILL.md` task-class list and `references/learning-loop-rules.md` + `references/prompt-blueprints.md` to use the qualified terms. The new `prompt-blueprints-product-build.md` reference file (from step 2) MUST use the qualified terms throughout.
5. Author pre-build records (phase 01) — first concrete loop action; tests whether capability records validate cleanly against the already-shipped `schemas/capability.schema.json` and pass the per-record-type allowlist gate.
6. Approval gate required before phase 02:
   - Operator approves product-decision record (Reference slice scope only).
7. After phase 05 ships: review record-authoring effort vs total build time. If >30% manual loop work, schedule a separate brainstorm on Approach 2 (draft-records staging).

## Unresolved Questions

- Should capability records include a `version` field tracking schema drift across `vnstock_data` library upgrades? Defer until first library bump after build. Note: the upstream `decision-20260510T170623Z` constrains pandas-floor bumps to require a re-verify sandbox, which is a related but distinct lever.
- Should frontend smoke tests use Playwright or a lighter renderer? Joint `ck:tanstack` + `ck:frontend-development` choice — defer to skill-phase constraint prompt drafting.
- Phase 04 write-path split between `ck:tanstack` and `ck:frontend-development`: scaffold paths (`product/web/src/routes/`, `app.config.ts`, `router.tsx`) vs component paths (`product/web/src/components/`, `product/web/src/features/`) — defer exact glob list to constraint prompt drafting; risk of overlap on `routes/*.tsx` files where scaffold ends and component begins.
- How are device-limit re-trips during build flagged in records? Build itself does not consume slots (no installer runs from skill phases). The risk surface narrows to a vendor SHA rotation forcing operator re-bootstrap mid-build; whether that needs its own risk record is open.
- Where does the application/business/feature layer (the deferred discussion) live in the repo? Likely a new record type or a new sibling layer above `records/capabilities/`, but explicit layering is for that future session.
- Knowledge packs: the existing `knowledge-packs/vnstock-data/manifest.yaml` stays a draft placeholder. Does the publication-gate machinery (validators, `pack_ref`, gate checks) need to be quieted to avoid confusion, or left as latent infrastructure for a future pack-using product line? Defer.
- TS-side capability scripts: the per-stack layout reserves `product/web/capabilities/` but no TS probe exists yet. Should the build's `capability-tanstack-reference-render` record cite a placeholder TS probe path, or is a record-only mapping (claim + sibling capability record) sufficient under the schema? Resolve during phase-01 record drafting against the validator.
