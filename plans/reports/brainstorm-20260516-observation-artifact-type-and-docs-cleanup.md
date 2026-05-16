# Observation Artifact Type & Docs Cleanup

## Problem

The state-machine plan (`plans/260516-1200-state-machine-for-irreversible-operations/`) created observation files under `records/observations/` but never formalized "observation" as a typed record. Observations are listed as "Unschematized Record Types" in `artifact-reference.md` with no schema, no AJV validation, and no doc coverage. Meanwhile, `handoff.md` is largely redundant with `operator-guide.md` and will rot.

## Decisions Made

1. **Observation becomes a typed record** with `observation.schema.json` (loose common schema)
2. **Status values:** `active` / `archived` (factual state captures, no review/approval process)
3. **Migrate all 3 existing observation files** to add common envelope fields
4. **Delete `handoff.md`**, merge glossary into `artifact-reference.md`

## Design

### Schema: `schemas/observation.schema.json`

Loose common envelope. No `additionalProperties: false` — observations keep freeform body fields.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Observation",
  "type": "object",
  "required": ["id", "schema_version", "type", "status", "created_at", "updated_at", "source_refs"],
  "properties": {
    "id": { "type": "string" },
    "schema_version": { "type": "string" },
    "type": { "const": "observation" },
    "status": { "enum": ["active", "archived"] },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "source_refs": { "type": "array", "items": { "type": "string", "pattern": "^(local|record|legacy):.+" } },
    "notes": { "type": "string" }
  }
}
```

**Why loose:** Existing observations have wildly different structures (resource budget, device ledger, behavioral finding). Forcing a rigid body schema would either be too restrictive or too loose to be useful. The common envelope gives structure for validation/tracking; body fields stay freeform.

**Why `active`/`archived`:** Observations are factual state captures. They don't go through claim verification or decision approval. `active` = current state, `archived` = superseded or historical.

### File Migrations

Each observation gets the common envelope fields added. Existing body fields stay untouched.

| File | Fields to add |
|------|---------------|
| `observation-vnstock-resource-budget.yaml` | `schema_version`, `type: observation`, `status: active`, `source_refs`, `created_at`, `updated_at` |
| `observation-vnstock-device-slot-ledger.yaml` | `schema_version`, `type: observation`, `status: active`, `source_refs` (already has `created_at`, `updated_at`) |
| `observation-vnstock-import-reactivates-cleared-device.yaml` | `schema_version`, `type: observation`, `status: active`, `source_refs` (already has `created_at`, `updated_at`) |

### Doc Changes

#### `docs/artifact-reference.md`

- Add `observation` to the typed record discriminator: `type` enum now includes `claim`, `experiment`, `decision`, `risk`, `capability`, `observation`
- Add "Observation" section in schema reference (after Capability)
- Merge "Capability Term Glossary" from `handoff.md` (append as new section)
- Remove observations from "Unschematized Record Types" table (it's now typed)

#### `docs/charter.md`

- Add "observations" to scope list: "a small typed record ledger (claims, risks, experiments, decisions, capability records, observations)"

#### `docs/operator-guide.md`

- Add observation to "Artifact Patterns" naming table:
  | Observation | `records/observations/` | `observation-<scope>-<slug>.yaml` | No |
- Add to "Agent Intake Flow" step 1: "observation capture" as a classification
- Add to "Adding Or Updating Records" step 3: observation records
- Add observation to "Agent Anti-Confusion Checklist"

#### `docs/handoff.md`

- **Delete entirely.** Glossary merged into `artifact-reference.md`. All other content is redundant or will rot.

### Validation Tool Impact

No code changes needed. The validation tool (`tools/validate-records/record-validation-rules.js`) auto-discovers schemas from `schemas/{type}.schema.json`. Adding `observation.schema.json` + `type: observation` in records is sufficient.

## Scope Boundary

**In scope:**
- Create `observation.schema.json`
- Migrate 3 observation files
- Update 3 docs (artifact-reference, charter, operator-guide)
- Delete handoff.md

**Out of scope:**
- Changes to validation tooling (not needed)
- Changes to `resource-budget.schema.json` (stays as-is, separate concern)
- New observation files
- Changes to learning-loop skill

## Risk Assessment

- **Low risk:** Schema addition is purely additive. Existing validation passes because observations are currently unschematized (not loaded).
- **Migration risk:** Adding fields to existing YAML files. If field values are wrong, `pnpm check` will catch it.
- **Doc deletion risk:** handoff.md glossary content preserved in artifact-reference.md. No unique information lost.

## Validation

After implementation:
1. `pnpm check` passes (observation schema validates all 3 files)
2. All 3 observation files have `type: observation` and pass AJV
3. `artifact-reference.md` has observation section + glossary
4. `charter.md` mentions observations
5. `operator-guide.md` has observation naming + intake flow
6. `handoff.md` is deleted

## Unresolved Questions

None.
