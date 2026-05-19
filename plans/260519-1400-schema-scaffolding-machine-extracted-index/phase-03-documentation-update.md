---
phase: 3
title: "Documentation Update"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Documentation Update

## Overview

Update `docs/record-system-architecture.md` to reflect the new `records/index/` entity, the frozen-legacy status of claims, and the routing of state queries to the index. Preserve the rest of the document.

## Context Links

- Target doc: `docs/record-system-architecture.md`
- Brainstorm basis: `plans/reports/brainstorm-20260518-machine-extracted-index.md`
- Existing claims directory: `records/claims/`
- New index directory: `records/index/` (created in Phase 1)

## Key Insights

- The doc currently lists claims as a primary entity in the record ledger. The redesign makes claims frozen-legacy (read-only) and moves live assertions to `records/index/`.
- The doc already describes observations as mutable state captures distinct from records. Index entries are a new category: machine-derived records that are persistent (git-tracked) but agent-owned (humans never edit them).
- The core hierarchy diagram needs `records/index/` added and claims repositioned as legacy.
- The entity roles table needs a new row for index entries.

## Requirements

- Functional:
  - `records/index/` is documented as a load-bearing entity in the core hierarchy.
  - Claims are documented as frozen-legacy (read-only audit trail, no new entries).
  - State queries route to `records/index/` first.
  - The provenance chain `evidence → experiment → index entry` is documented.
- Non-functional:
  - Preserve all existing content unrelated to claims/index.
  - No speculative content about the extraction tool (that is Plan 2).

## Architecture

The record system now has three territories:
- `docs/` — human-only escape hatch
- `records/evidence/` — human-authored markdown, source of truth
- `records/index/` — machine-derived YAMLs, agent-owned, human-read-only

Plus the frozen-legacy `records/claims/` (read-only).

## Related Code Files

- Modify: `docs/record-system-architecture.md`
- Read for context: `docs/record-system-architecture.md` (current version)

## Implementation Steps

1. **Add `records/index/` to the Core Hierarchy** section:
   - In the `records ledger` line, note that claims are frozen-legacy and index is the live assertion store.
   - Add `records/index/` as a new line in the short hierarchy diagram.

2. **Add index entry to the Entity Roles table**:
   - New row: `Index entry` — `Machine-extracted atomic assertion from evidence ## Findings` — `Replaces claims as the canonical state query target; enables N=1/N>1 counting.`
   - Update the `Claim record` row to note it is frozen-legacy for existing entries.

3. **Update the Core Hierarchy diagram**:
   ```text
   records/evidence      -> durable source material
   records/index         -> machine-extracted assertions (agent-owned, human-read-only)
   records/claims        -> frozen-legacy (read-only audit trail, no new entries)
   records ledger        -> risks + experiments + decisions + capability records
   records/observations  -> mutable external state
   ...
   ```

4. **Add a new section: Machine-Extracted Index (after Record Ledger)**:
   - Describe the provenance chain: `experiment.id` → `evidence_refs[]` → `## Findings` bullet → `records/index/<assertion-id>.yaml`.
   - Note that index entries are self-contained — agents can answer state queries from the YAML alone without reading source evidence.
   - Document the three-territory model: `docs/` (human-only), `records/evidence/` (human writes, agent reads), `records/index/` (agent writes, human reads).

5. **Update the State-Machine Layer** if needed:
   - Index entries do not follow the `draft → reviewed → approved` editorial lifecycle. Their `status` is `active | superseded | pending_approval`, derived from evidence `validation_status`. Note this distinction.

6. **Update the Verification Axes table**:
   - Add row: `Index entry status` — `extracted-assertion` — `active | superseded | pending_approval; derived from evidence validation_status.`
   - Note that claim verification dimensions now apply to frozen-legacy claims only.

7. **Preserve existing sections** on observations, constraint gate, and product generation loop.

8. **Known gap (deferred to Plan 4):** `tools/generate-docs/generated-doc-content.js` counts claims and experiments but not `extracted-assertion` records, and its `.join(", ")` on `source_refs` will produce `"[object Object]"` for index entries. Patch the docs generator when index entries are populated.

## Success Criteria

- [ ] `docs/record-system-architecture.md` mentions `records/index/` as a load-bearing entity.
- [ ] Claims are documented as frozen-legacy (no new entries).
- [ ] State query routing is documented: index first, frozen claims for historical audit.
- [ ] No stale references to "claims as primary state store" remain.
- [ ] `pnpm check` still passes (docs are not validated, but records must still pass).

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Doc update introduces speculative details about extraction tool | Restrict scope to schema, directory, and routing; defer extraction mechanics to Plan 2. |
| Existing doc structure makes insertion awkward | Append new sections rather than rewrite; preserve existing headings and links. |

## Security Considerations

- No auth or data-protection changes.
- Doc updates are editorial only.

## Next Steps

- Phase 4: Acceptance validation — confirm `pnpm check` passes end-to-end.
