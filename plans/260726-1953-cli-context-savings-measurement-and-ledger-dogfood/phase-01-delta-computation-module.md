---
phase: 1
title: "Delta Computation Module (TDD)"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Delta Computation Module (TDD)

## Overview

Deliver a pure, dependency-free core module that computes the CLI transport's
context savings: manifest def bytes dropped from the MCP surface (the
`CLI_TOOLS` set) vs the SessionStart banner bytes that replace them. Pure
functions, no MCP server spawn, no ledger writes — fully unit-testable.

## Requirements

- Functional: given the manifest (JSONC-parsed), `CLI_TOOLS`, and both banner variants, return `{dropped_def_bytes, banner_bytes, savings_bytes, savings_pct}` with per-tool breakdown.
- Non-functional: zero new dependencies; JSONC parsing reuses the full-line-comment strip regex from `mastra/server.js:30-33`.

## Architecture

New module `tools/learning-loop-mastra/core/cli-context-savings.js`:

```js
// computeCliContextSavings({ manifest, cliTools, bannerBytes })
// → {
//     dropped_def_bytes,           // sum of byteLength(JSON.stringify(entry)) for manifest.tools where name ∈ cliTools
//     per_tool: [{name, bytes}],   // sorted desc, for drift debugging
//     banner_bytes,                // max(readsOnly, recordsViaCli) — conservative
//     savings_bytes,               // dropped_def_bytes - banner_bytes
//     savings_pct,                 // savings_bytes / dropped_def_bytes * 100, 1 decimal
//   }
export function parseManifestJsonc(text) { /* strip /^\s*\/\/.*$/gm, JSON.parse */ }
export function computeCliContextSavings({manifest, cliTools, bannerBytes}) { ... }
```

Header comment documents the static-approximation decision: manifest entry
bytes ≈ MCP wire def bytes; wire-truth absolutes live in
`tools/scripts/measure-context-surfaces.mjs`; this module is the trend metric.

Note: `buildTransportBanner` lives in a `.cjs` hook
(`hooks/universal/session-start-inject-discoverability.cjs`, exported line 418).
The core module must NOT import the hook (ESM→CJS hook pulls gate deps); the
*caller* (script, test) supplies banner bytes. Module stays pure.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/cli-context-savings.js`
- Create: `tools/learning-loop-mastra/__tests__/cli-context-savings.test.js`
- Read-only refs: `core/cli-tools.js`, `tools/manifest.json`, `mastra/server.js:30-33`, `hooks/universal/session-start-inject-discoverability.cjs:111,418`

## Implementation Steps (TDD)

1. RED: write `__tests__/cli-context-savings.test.js` —
   - parses JSONC manifest fixture (full-line comments stripped, inline content preserved)
   - counts bytes only for tools in the cliTools set (non-members excluded)
   - empty intersection → dropped 0, savings negative, pct 0 (no NaN/÷0)
   - banner_bytes = max of the two variants
   - savings_pct math on a known fixture (hand-computed expected value)
2. GREEN: implement `core/cli-context-savings.js` minimal to pass.
3. REFACTOR: naming/header comment per repo conventions.
4. Run `pnpm test` (pretest seed absorbs the new files into file-index).

## Success Criteria

- [ ] All new unit tests pass; `pnpm test` green
- [ ] Module has no imports beyond `node:` builtins
- [ ] No plan IDs or finding codes in code comments or test names (describe the invariant directly)

## Risk Assessment

- JSONC shim drift vs server.js copy → mitigate: identical regex, header comment points at the canonical copy; drift acceptable (both strip full-line comments only).
- Manifest byte count diverges from wire bytes → documented approximation; Phase 3 guard uses a conservative floor, not exact equality.
