---
phase: 1
title: "Spec and Parser"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Spec and Parser

## Overview

Create the core parsing modules for `tools/extract-index/`. This phase delivers frontmatter splitting, `## Findings` bullet extraction, and hash computation. All modules are pure functions for testability. No CLI or file I/O yet.

## Context Links

- Brainstorm design: `plans/reports/brainstorm-20260518-machine-extracted-index.md`
- Index entry schema: `schemas/index-entry.schema.json`
- Plan 1 completion: `plans/260519-1400-schema-scaffolding-machine-extracted-index/plan.md`

## Requirements

- Functional: Parse evidence markdown into structured findings; compute SHA-256 hash; validate required frontmatter fields.
- Non-functional: Zero new npm dependencies; each module under 200 lines; pure functions for unit testing.

## Architecture

```
frontmatter-splitter.js  ->  { meta: object, body: string }
findings-parser.js       ->  array of { topicTag, assertion, context, caveats, lineAnchor, bulletIndex }
hash-computer.js         ->  sha256 hex string
```

### frontmatter-splitter.js

- Split file content on first `---` pair **at line boundaries only** (regex `^---$`).
- **Skip `---` inside fenced code blocks** (` ``` ` delimited). Track code-block state while scanning lines.
- Parse frontmatter with existing `yaml` package (`parseYaml`).
- Return `{ meta, body }` where `meta` is the parsed frontmatter object and `body` is the markdown remainder.
- If file does not start with `---` on line 1, return `{ meta: null, body: text }`.
- If opening `---` has no matching closing `---` on its own line, throw with clear message.

### findings-parser.js

Line-based state machine:

1. Find `## Findings` heading via regex `/^## Findings\s*$/m`.
2. Scan lines below until next `## ` heading or EOF.
3. Track indentation. Top-level bullet = `- ` at base indent. Nested = greater indent.
4. Extract `[topic-tag]` via `/^\s*-\s+\[([a-z0-9-]+)\]\s+(.*)$/`.
5. Nested bullets under top-level:
   - `Context:` -> push to `context` string
   - `Caveat:` -> push to `caveats` array
   - Other -> warn (stderr) and ignore
6. Concatenate continuation lines (non-bullet, non-heading, non-blank) to the **current field**, tracked by parser state:
   - State transitions: after a top-level bullet -> `currentField = 'assertion'`; after `Context:` -> `currentField = 'context'`; after `Caveat:` -> `currentField = 'caveat'`.
   - A continuation line appends to whichever field the most recent nested bullet (or top-level bullet) opened.
   - Blank lines reset no state; they are simply skipped.
   - **Max assertion length:** 8,192 chars; **max continuation lines per bullet:** 50. Exceeding either throws with line number.

### hash-computer.js

- `createHash("sha256")` from `node:crypto`.
- **Input: Buffer only** — caller must pass `readFileSync(path)` (no encoding) to guarantee raw-byte hashing.
- Output: `sha256:<hex>` format string (e.g., `sha256:a1b2...`), matching the existing test fixture convention.

## Related Code Files

- Create: `tools/extract-index/frontmatter-splitter.js`
- Create: `tools/extract-index/findings-parser.js`
- Create: `tools/extract-index/hash-computer.js`
- Modify: `tools/extract-index/` (new directory)

## Implementation Steps

1. Create `tools/extract-index/` directory.
2. Write `hash-computer.js` — simplest module, establishes pattern.
3. Write `frontmatter-splitter.js` — use existing `yaml` package; handle missing frontmatter, unclosed delimiters, and parse errors.
4. Write `findings-parser.js` — line-based scanner. Handle:
   - Multi-line assertions and context/caveat continuation
   - Missing `[tag]` -> throw error with line number
   - Empty `## Findings` -> return empty array
   - Multiple `## Findings` -> use first, ignore rest
   - Unknown nested bullets -> warn and ignore
5. Wire modules together in a temporary integration script to verify against a fixture.

## Success Criteria

- [x] `frontmatter-splitter.js` parses valid frontmatter correctly.
- [x] `frontmatter-splitter.js` returns `meta: null` for files without frontmatter.
- [x] `frontmatter-splitter.js` throws on unclosed `---`.
- [x] `findings-parser.js` returns empty array when `## Findings` is absent.
- [x] `findings-parser.js` extracts tagged bullets with context and caveats.
- [x] `findings-parser.js` throws on bullets missing `[topic-tag]` or with invalid tag (not matching `[a-z0-9-]+`).
- [x] `findings-parser.js` handles multi-line assertions.
- [x] `hash-computer.js` produces deterministic SHA-256 for identical input.

## Risk Assessment

- Parser may fail on unconventional markdown. Mitigation: line-based scanner is scoped to the rigid `## Findings` convention; unknown patterns warn rather than crash.

## Security Considerations

- SHA-256 is for drift detection, not cryptographic security. Using `node:crypto` is appropriate.
