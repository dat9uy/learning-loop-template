---
phase: 2
title: "Observation Recording"
status: complete
priority: P1
effort: 1h
dependencies: [1]
---

# Phase 2: Observation Recording

## Overview

Add `record_observation` tool to the MCP server. Writes observation YAML files to `records/observations/`. Tool params designed to match observation schema — auto-generates required fields, accepts domain-specific inputs.

## Context Links

- Observation schema: `schemas/observation.schema.json`
- Existing observations: `records/observations/`
- Brainstorm: `plans/reports/brainstorm-20260517-constraint-gate-architecture.md`

## Requirements

**Functional:**
- `record_observation(constraint_type, constraint, description, source_refs)` tool registered
- Auto-generates: `id`, `schema_version` ("1.0"), `type` ("observation"), `status` ("active"), `created_at`/`updated_at` (ISO timestamp)
- Maps inputs: `constraint_type` → `constraint_type` field (new), `constraint` → `constraint` field (freeform), `description` → `notes` field, `source_refs` → `source_refs` field
- Validates output against observation schema (AJV)
- Writes YAML file to `records/observations/`
- Filename: `observation-{kebab-case-slug}.yaml` where slug derived from `constraint` param
- Path traversal protection: `path.basename()` on slug, verify resolved path starts with `records/observations/`
- Duplicate detection: by filename slug (deterministic, one observation per file)
- Returns `{ recorded: true, id, path }` or `{ recorded: false, reason: "already_exists", existing_id }`

**Non-functional:**
- Atomic write (write to temp, rename)
- Schema validation before write
- Deterministic filenames (no timestamps in name)

## Architecture

```
record_observation handler:
1. Sanitize constraint → kebab-case slug via path.basename() + slugify
2. Resolve full path: records/observations/observation-{slug}.yaml
3. Verify path starts with records/observations/ (traversal guard)
4. Check if file exists → if yes, return { recorded: false, reason: "already_exists" }
5. Build YAML object with auto-generated fields + input fields
6. Validate against observation.schema.json (AJV)
7. Atomic write (temp + rename)
8. Return { recorded: true, id, path }
```

**Note on observation schema:** The `constraint` and `constraint_type` fields are NOT in `observation.schema.json` — they are freeform extension fields used by existing observations. The tool writes them as extra YAML keys. Schema validation uses `additionalProperties: true` (AJV default) to allow these fields.

## Related Code Files

- Modify: `tools/constraint-gate/server.js` (add tool registration)
- Create: `tools/constraint-gate/observation-writer.js` (write logic)
- Create: `tools/constraint-gate/observation-writer.test.js`
- Read: `schemas/observation.schema.json` (validation)
- Write: `records/observations/observation-*.yaml` (output)

## Tests Before (TDD)

1. **`observation-writer.test.js`** — test write flow:
   - Valid input → file created with all required schema fields (`id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`)
   - Auto-generated fields have correct values (`type: "observation"`, `status: "active"`, `schema_version: "1.0"`)
   - `constraint_type` and `constraint` written as extra YAML keys
   - Duplicate filename → returns `{ recorded: false, reason: "already_exists" }`
   - Missing required inputs → returns validation error

2. **`observation-writer.test.js`** — test path safety:
   - Normal constraint → correct filename in `records/observations/`
   - Constraint with `../` → sanitized via `path.basename()`, stays in directory
   - Constraint with `/` → sanitized, no directory escape
   - Empty constraint → rejected

3. **`observation-writer.test.js`** — test filename generation:
   - "Docker stale mount" → `observation-docker-stale-mount.yaml`
   - "sudo requirement" → `observation-sudo-requirement.yaml`
   - "../../etc/evil" → `observation-etc-evil.yaml` (basename strips traversal)

4. **`server.test.js`** — test MCP tool integration:
   - `record_observation` call → file created, response has `recorded: true`
   - Duplicate call → response has `recorded: false`

## Implementation Steps

1. Implement `observation-writer.js`:
   - `generateObservationId()` → `obs-{timestamp}-{random}` format
   - `generateFilename(constraint)` → `observation-{kebab-case-slug}.yaml`
   - `sanitizeSlug(text)` → `path.basename(text)`, strip non-alphanumeric, kebab-case
   - `buildObservationYaml(params)` → YAML object with auto-generated + input fields
   - `writeObservation(observation, root)` → atomic write (temp + rename)
   - `findExistingObservation(filename, dir)` → check file existence
2. Add path traversal guard: resolve full path, verify it starts with `records/observations/`
3. Implement schema validation using AJV (allow additional properties for `constraint`/`constraint_type`)
4. Add `record_observation` tool to `server.js`
5. Run all tests

## Success Criteria

- [ ] `record_observation` tool writes valid YAML to `records/observations/`
- [ ] Written files have all required schema fields auto-generated
- [ ] `constraint_type` and `constraint` present as extension fields
- [ ] Path traversal attempts blocked (no writes outside `records/observations/`)
- [ ] Duplicate observations rejected by filename
- [ ] Filename follows kebab-case convention
- [ ] All unit tests pass

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Filename collisions | Deterministic slug from constraint text, duplicate check |
| Schema validation rejects extra fields | AJV `additionalProperties: true` (default) |
| Write to wrong directory | path.basename + resolved path verification |
| Existing observations have no `constraint_type` | Tool adds it; existing files read as-is |

## Regression Gate

```bash
node --test tools/constraint-gate/*.test.js
```

Note: `pnpm validate:records` does NOT validate observation files (only claims/experiments/decisions/risks/capabilities). Validation is handled by AJV in the test suite.
