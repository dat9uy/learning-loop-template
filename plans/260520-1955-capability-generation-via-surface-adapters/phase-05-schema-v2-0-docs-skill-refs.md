---
phase: 5
title: "Schema v2.0 + Docs + Skill Refs"
status: pending
priority: P2
effort: "1.5h"
dependencies: [4]
---

# Phase 5: Schema v2.0 + Docs + Skill Refs

## Overview

Bump capability schema to v2.0 minimal format. Update all docs per the brainstorm doc-update table. Add Tier 2 Verification Lookup Pattern to skill references.

## Requirements
- Functional: v2.0 schema drops `id`, `status`, `created_at`, `updated_at`, `source_refs`, `supersedes` from `properties` entirely
- Functional: `maps[]` items require only `source`; all other fields removed from schema
- Functional: All major docs updated per severity table
- Non-functional: Schema file < 50 lines; docs updates are surgical, not rewrites

## Architecture

v2.0 is the canonical minimal format. All optional fields from v1.1 are removed. Records become pure structural descriptions with no metadata overhead.

```yaml
type: capability
schema_version: "2.0"
stack: api
surface: HTTP/REST
maps:
  - source: GET /reference/equity
  - source: GET /reference/company/{symbol}
  - source: GET /reference/search
```

## Related Code Files
- Modify: `schemas/capability.schema.json`
- Modify: `docs/operator-guide.md`
- Modify: `docs/artifact-reference.md`
- Modify: `docs/record-system-architecture.md`
- Modify: `docs/red-team-review.md`
- Modify: `docs/charter.md`
- Modify: `.claude/skills/learning-loop/references/orchestration-patterns.md` (or create `context-retrieval-patterns.md`)
- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md`

## Implementation Steps
1. Update `schemas/capability.schema.json` to v2.0:
   - `required: ["type", "schema_version", "stack", "surface", "maps"]`
   - `properties` drops `id`, `status`, `created_at`, `updated_at`, `source_refs`, `supersedes`
   - `surface` gets an enum: `["HTTP/REST", "TanStack Start route"]` — single source of truth shared with adapter registry
   - `maps.items.properties` drops `route_class`, `view_class`, `response_class`; keeps only `source` (required)
2. Regenerate records with v2.0 schema version
3. Delete `schemas/capability-v1.1.schema.json` (transition backup no longer needed)
4. Run `pnpm validate:records` — must pass
4. Update docs (in order of severity):
   - `docs/operator-guide.md` — Major: replace "Capability Validation" drift section with generation workflow, surface adapter criteria, `pnpm generate:capabilities`, update agent intake flow step 12
   - `docs/artifact-reference.md` — Major: update Capability schema reference to v2.0 minimal format; update Capability Term Glossary
   - `.claude/skills/learning-loop/references/orchestration-patterns.md` — Major: add "Tier 2 Verification Lookup Pattern" (if file > 200 lines after addition, split to `context-retrieval-patterns.md`)
   - `docs/record-system-architecture.md` — Minor: update capability record description in entity roles; update product generation loop section
   - `docs/red-team-review.md` — Minor: update capability record review checklist
   - `.claude/skills/learning-loop/references/learning-loop-rules.md` — Minor: add cross-reference to lookup pattern
   - `docs/charter.md` — Trivial: verify no stale references to hand-written capability records
5. Run `pnpm validate:records && pnpm test` — must pass

## Success Criteria
- [ ] v2.0 schema validates regenerated records
- [ ] `pnpm validate:records` passes with v2.0 schema
- [ ] All docs listed in severity table are updated
- [ ] Skill references contain Tier 2 Verification Lookup Pattern with 7-step lookup chain
- [ ] No stale references to hand-written capability records or drift validator

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Doc update scope balloons | Follow severity table; major = rewrite section, minor = update paragraph, trivial = grep + fix |
| v2.0 schema breaks something unexpected | Run full `validate:records` after schema change; if non-capability records fail, revert |
| Lookup pattern file exceeds 200 lines | Split to `context-retrieval-patterns.md` per modularization rule |

## Security Considerations
- Docs changes are cosmetic; no security impact
- Lookup pattern must warn agents against inferring dependencies from capability filenames alone
