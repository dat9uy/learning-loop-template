---
phase: 2
title: "Bulk Index Update"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Bulk Index Update

## Overview

Bulk-update all 96 `records/meta/index/*.yaml` entries to replace `local:records/meta/evidence/...` source refs with `self:` prefix. This is the second step of Approach B (fix index entries first, then delete evidence). Without this, Phase 3 evidence deletion would break validation.

## Requirements

- **Functional:** All 96 index entries in `records/meta/index/` have `self:` source refs, not `local:records/meta/evidence/...`
- **Functional:** `self:` ref values are meaningful (e.g., `self:{assertion-id}` or `self:{topic_tag}`)
- **Non-functional:** `pnpm validate:records` passes after all changes
- **Non-functional:** `pnpm test` passes after all changes

## Architecture

Each index entry currently has `source_refs` with objects like:
```yaml
source_refs:
  - file: local:records/meta/evidence/capability-allowlist-deferred-axes.md
    section: "## Findings"
    bullet_index: 1
    line_anchor: L8
```

After update, the same entry should have:
```yaml
source_refs:
  - file: self:assertion-meta-static-capability-allowlist
    section: "## Findings"
    bullet_index: 1
    line_anchor: L8
```

Or simpler:
```yaml
source_refs:
  - file: self:
    section: "self-standing"
    bullet_index: 1
    line_anchor: ""
```

### Approach: Automated script with human review

1. Write a script that reads each `records/meta/index/*.yaml`
2. For each `source_refs` entry where `file` starts with `local:records/meta/evidence/`,
   - Replace `local:records/meta/evidence/{filename}.md` with `self:{assertion-id}`
   - Keep `section`, `bullet_index`, `line_anchor` as-is (they anchor to the index entry itself)
3. Run `pnpm validate:records` to verify
4. Review diffs manually or via git

### Decision: What `self:` value to use?

The brainstorm report says `self:` means "this assertion stands on its own, no external evidence needed." The simplest form is `self:` with the assertion ID as the path component:

```yaml
file: self:assertion-meta-static-capability-allowlist
```

This preserves the "what" and allows the validator to skip existence checks.

## Related Code Files

- **Modify:** `records/meta/index/*.yaml` (all 96 files)
- **Create:** `tools/bulk-update-meta-index.js` (one-time script, delete after use)
- **Modify:** `docs/artifact-concepts.md` (document `self:` prefix semantics)

## Implementation Steps

1. **Script:** Write `tools/bulk-update-meta-index.js` that:
   - Reads all `records/meta/index/*.yaml`
   - Replaces `local:records/meta/evidence/\S+\.md` with `self:{id}`
   - Preserves other `source_refs` fields
   - Writes back in place
2. **Run script:** `node tools/bulk-update-meta-index.js`
3. **Validate:** `pnpm validate:records` — must pass
4. **Test:** `pnpm test` — must pass
5. **Commit:** `git add records/meta/index/` — commit the bulk update
6. **Delete script:** Remove `tools/bulk-update-meta-index.js` (one-time use)

## Success Criteria

- [ ] All 96 `records/meta/index/*.yaml` files have `self:` source refs (zero `local:records/meta/evidence/` refs)
- [ ] `pnpm validate:records` passes with zero errors
- [ ] `pnpm test` passes with zero failures
- [ ] Git diff shows only the expected `source_refs` changes in index files
- [ ] No other record types (decisions, experiments, risks) are modified

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Script corrupts YAML frontmatter | Low | High | Use `yaml` library for parse-and-serialize; do not string-replace |
| Non-meta evidence refs are also modified | Medium | High | Script only targets `records/meta/index/*.yaml` and `records/meta/evidence/` local refs |
| Some index entries reference non-evidence local files | Low | Medium | Skip those; only replace `local:records/meta/evidence/` pattern |
| Missing a file or partially updating | Low | High | Count before/after: expect 96 files, 96 `self:` refs |
