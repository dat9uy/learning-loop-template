---
phase: 3
title: "Vendor Snapshot Kind Marker"
status: completed
priority: P2
effort: "30m"
dependencies: []
---

# Phase 3: Vendor Snapshot Kind Marker

## Overview

Add a `_KIND.md` marker file to `records/evidence/vnstock-data/unified-ui-snapshot/` identifying the subtree's true class: vendor documentation snapshot, not human-authored findings. This prevents future extraction tools from treating it as evidence-with-findings.

## Requirements

- Functional: `_KIND.md` exists and names the subtree's class as a vendor documentation snapshot.
- Non-functional: No territory restructure — files stay where they are. Marker is conceptual documentation, not mechanical enforcement.

## Architecture

The `unified-ui-snapshot/` directory contains 9 markdown files (00-migration-guide.md through 08-schema-reference.md + README.md) that are vendor documentation captured verbatim. They lack `## Findings` sections and evidence frontmatter, so the extraction tool already skips them. The `_KIND.md` marker makes the intent explicit for human readers.

### Marker Format

```markdown
# Evidence Subtree Kind

**Class:** vendor-documentation-snapshot
**Source:** Vnstock unified UI documentation (captured verbatim from vendor package)
**Human-authored:** No
**Extractable:** No — no `## Findings` sections; no evidence frontmatter
**Purpose:** Reference material for operators debugging vendor behavior. Not source of truth for index extraction.
```

## Related Code Files

- Create: `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md`

## Implementation Steps

1. Create `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md` with the marker format above.
2. Verify the file exists and is readable.

## Success Criteria

- [ ] `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md` exists
- [ ] Marker names class as `vendor-documentation-snapshot`
- [ ] Marker states `Extractable: No`
- [ ] `pnpm check` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Extraction tool does not read `_KIND.md` — marker is informational only | Expected | None | Marker is conceptual documentation for humans, not a mechanical gate. The extraction tool already skips files without `## Findings` sections and evidence frontmatter. |
