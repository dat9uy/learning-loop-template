---
phase: 5
title: "Records and Documentation"
status: complete
priority: P2
effort: "45m"
dependencies: [4]
---

# Phase 5: Records and Documentation

## Overview

Capture the productized fundamental capability in the record ledger: capability YAML, evidence files with machine-extractable findings, and update project docs. Close the learning loop by documenting what was built and any deviations from the runtime probe.

## Requirements

- Functional:
  - Capability record for FastAPI fundamental REST
  - Capability record for TanStack fundamental render
  - Evidence file with runtime verification of endpoints
- Non-functional:
  - Records pass `pnpm validate:records`
  - Index entries regenerated via `pnpm extract:index`
  - Docs updated in `./docs/` if architectural changes warrant it

## Architecture

Record artifacts only. No code changes.

## Related Code Files

- Create: `records/capabilities/capability-fastapi-fundamental-rest.yaml`
- Create: `records/capabilities/capability-tanstack-fundamental-render.yaml`
- Create: `records/evidence/vnstock-data/fundamental-product-verification-260520T2150Z.md`
- Modify: `docs/codebase-summary.md` (if exists and needs update)
- Read for context: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Read for context: `schemas/capability.schema.json`

## Implementation Steps

1. **Create capability record: FastAPI fundamental REST**
   ```yaml
   id: capability-fastapi-fundamental-rest
   type: capability
   schema_version: "2.0"
   stack: api
   surface: HTTP/REST
   maps:
     - source: GET /fundamental/income/{symbol}
     - source: GET /fundamental/balance/{symbol}
     - source: GET /fundamental/cashflow/{symbol}
     - source: GET /fundamental/ratios/{symbol}
   ```

2. **Create capability record: TanStack fundamental render**
   ```yaml
   id: capability-tanstack-fundamental-render
   type: capability
   schema_version: "2.0"
   stack: web
   surface: TanStack Start route
   maps:
     - source: /fundamental/$symbol
   ```

3. **Create evidence file (operator-gated)**
   - The agent may draft evidence findings; the operator must author the evidence file under `records/evidence/vnstock-data/`.
   - The write gate blocks agent writes to `records/evidence/**`; operator approval and a `write-path` observation are required.
   - Draft content must include frontmatter: `capability: fundamental`, `dimension: product`, `scope: api+web`, `validation_status: verified`
   - `## Findings` with `[fundamental-endpoints]` and `[fundamental-frontend]` assertions
   - `source_refs` pointing to local code files and records

4. **Run validation and indexing**
   ```bash
   pnpm validate:records
   pnpm extract:index
   ```

5. **Update docs if needed**
   - Check `docs/codebase-summary.md` for accuracy
   - Add fundamental endpoints to API surface description
   - No changes needed if docs are generic enough

6. **Commit**
   - Stage all changes
   - Conventional commit: `feat(api,web): add fundamental data endpoints and UI`

## Success Criteria

- [ ] `records/capabilities/capability-fastapi-fundamental-rest.yaml` created and valid
- [ ] `records/capabilities/capability-tanstack-fundamental-render.yaml` created and valid
- [ ] Evidence file written with extractable findings
- [ ] `pnpm validate:records` passes
- [ ] `pnpm extract:index` produces new index entries
- [ ] Commit created with clean message

## Risk Assessment

- **Capability schema changed since reference records written**: Validate against `schemas/capability.schema.json` before creating.
- **Evidence findings not extracted**: Verify `[topic-tag]` format and top-level bullet structure.
- **Docs drift**: Only update docs if the change is user-visible. Internal capability records are self-documenting.
