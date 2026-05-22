---
phase: 1
title: "Gate Content Scanning"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Gate Content Scanning

## Overview

Augment `write-coordination-gate.cjs` to read plan frontmatter and detect `product-build` tags. When a new `plans/**/plan.md` file is written with `tags: [product-build]`, the gate checks whether decision records exist for the surfaces declared in the plan. Start in **warn** mode — allow the write but emit a strong warning. Graduate to **escalate** after operator validates the mapping across 3+ builds.

## Requirements

- **Functional**: Gate reads YAML frontmatter from plan files on first write. Detects `tags` containing `product-build`. Checks for surface declarations in plan frontmatter or Phase 0 content.
- **Non-functional**: Scan only on first write of a new plan file, not on every edit. Latency < 50ms for frontmatter extraction. No marker files — read content directly.

## Architecture

```
write-coordination-gate.cjs
  └── parsePlanFrontmatter(filePath, content)
        ├── Extracts YAML frontmatter between --- delimiters
        ├── Returns: { tags: string[], surfaces: string[] | null }
        └── null if not a plan file or no product-build tag

  └── checkDecisionRecords(surfaces)
        ├── Maps surfaces to decision record paths
        ├── Flat fallback: records/decisions/*
        ├── Surface-first fallback: records/<surface>/decisions/*
        └── Returns: { missing: string[], found: string[] }

  └── stagedResponse(mode, context)
        ├── warn: allow write, emit JSON warning to stderr
        ├── escalate: block write, require operator approval
        └── mode controlled by GATE_RESPONSE_MODE env var (default: warn)
```

## Related Code Files

- **Create**: `.claude/coordination/hooks/lib/frontmatter-reader.cjs` — shared frontmatter parsing utility
- **Modify**: `.claude/coordination/hooks/write-coordination-gate.cjs` — add content scanning branch for `plans/**/plan.md`
- **Modify**: `.claude/coordination/hooks/lib/gate-utils.cjs` — add `readDecisionRecords()`, `parsePlanFrontmatter()` exports
- **Create**: `.claude/coordination/hooks/write-coordination-gate.test.js` — TDD test suite

## Implementation Steps

1. **Write tests first** (`write-coordination-gate.test.js`):
   - Test: plan.md without `product-build` tag → allowed (no content scan)
   - Test: plan.md with `tags: [product-build]` and existing decision records → allowed
   - Test: plan.md with `tags: [product-build]` and missing decision records → warn mode emits warning
   - Test: plan.md with `tags: [product-build]` and missing records + escalate mode → blocked
   - Test: edit to existing plan.md → no content scan (skip)
   - Test: non-plan file in `plans/**` → allowed
   - Test: malformed frontmatter → allowed (fail-open for parse errors)

2. **Create `frontmatter-reader.cjs`**:
   - `extractFrontmatter(content: string): object | null`
   - `hasProductBuildTag(frontmatter: object): boolean`
   - `extractSurfaces(frontmatter: object): string[]`
   - Fail-open: any parse error → return null, gate allows write
   - Lightweight: only read first 2KB of file for frontmatter extraction
   - **Content source**: PreToolUse hooks receive `input.tool_input.content` for Write and `input.tool_input.new_string` for Edit operations (verified: `.claude/coordination/hooks/README.md:55-61`).

3. **Add decision record check to `gate-utils.cjs`**:
   - `checkDecisionRecords(surfaces: string[], recordsDir: string): { missing, found }`
   - Try surface-first: `records/<surface>/decisions/*.yaml`
   - Fallback flat: `records/decisions/*.yaml`
   - Match by file existence (not content parsing)
   - Return empty arrays for unknown surfaces

4. **Modify `write-coordination-gate.cjs`**:
   - After the unconditional blocks (observations, schemas, build artifacts), before the allowed domains check:
   - If `globMatch('plans/**/plan.md', relPath)`:
     - Check if file already exists (skip if edit)
     - Read first 2KB of content
     - Parse frontmatter
     - If `hasProductBuildTag`:
       - Extract surfaces
       - `checkDecisionRecords(surfaces)`
       - If missing and mode === 'warn' → allow but emit warning JSON
       - If missing and mode === 'escalate' → block with reason listing missing surfaces
   - Add `GATE_RESPONSE_MODE` env var support (default: 'warn')

5. **Run tests**: `node write-coordination-gate.test.js`

## Success Criteria

- [ ] All 7 test cases pass
- [ ] Gate allows non-product-build plans unconditionally
- [ ] Gate warns on product-build plans with missing decision records (warn mode)
- [ ] Gate blocks on product-build plans with missing decision records (escalate mode)
- [ ] Gate skips content scan on edits to existing plans
- [ ] Gate fail-open on malformed frontmatter
- [ ] Frontmatter read limited to 2KB (performance)
- [ ] Surface-first and flat path conventions both supported

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Frontmatter parsing breaks on edge cases | Fail-open design; extensive test coverage for edge cases |
| 2KB limit truncates frontmatter | Frontmatter is typically < 500 bytes; 2KB is 4x safety margin |
| Reading file content in hook adds latency | Only on first write; 2KB read is ~1ms on SSD |
| Surface-restructure plan changes path conventions | Support both flat and surface-first paths; phase 2 will harden |
