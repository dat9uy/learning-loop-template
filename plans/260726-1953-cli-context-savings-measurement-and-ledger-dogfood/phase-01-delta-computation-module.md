---
phase: 1
title: "Delta Computation Module (TDD)"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Delta Computation Module (TDD)

## Overview

Deliver a pure, dependency-free core module that computes the CLI transport's
context savings: wire def bytes dropped from the MCP surface (the
`CLI_TOOLS` set) vs the SessionStart banner bytes that replace them. Wire
bytes — not manifest stubs — so the metric matches the finding's measured
31.8 KB. Pure functions, no MCP server spawn, no ledger writes — fully
unit-testable.

## Requirements

- Functional: given the manifest (JSONC-parsed), `CLI_TOOLS`, and both banner variants, return `{dropped_def_bytes, banner_bytes, savings_bytes, savings_pct}` with per-tool breakdown.
- Non-functional: zero new dependencies; JSONC parsing reuses the full-line-comment strip regex from `mastra/server.js:34` (line range corrected from earlier `30-33` draft); wire-byte computation uses dynamic import of each handler's `legacy` + `z.toJSONSchema(...)` + JSON.stringify (matching the parity view at `mastra/create-loop-tool.js:24-63`).

## Architecture

New module `tools/learning-loop-mastra/core/cli-context-savings.js`:

```js
// computeCliContextSavings({ manifest, cliTools, bannerBytes })
// → {
//     dropped_def_bytes,           // sum of byteLength(JSON.stringify(wireDef)) for manifest.tools where handler.toolName ∈ cliTools
//     per_tool: [{name, bytes}],   // sorted desc, for drift debugging
//     banner_bytes,                // max(readsOnly, recordsViaCli) — conservative
//     savings_bytes,               // dropped_def_bytes - banner_bytes
//     savings_pct,                 // savings_bytes / dropped_def_bytes * 100, 1 decimal
//   }

// Wire def = JSON.stringify({ name, description, inputSchema: z.toJSONSchema(legacy.schema, {target: "draft-7", io: "input"}) })
// — the same bytes MCP clients receive via `tools/list`. Manifest entries
// carry only {file, export, pathFields} (see tools/manifest.json:25-66), so
// the `manifest.tools where name ∈ cliTools` filter requires name resolution
// from the handler's `legacy.name`. The CLI_TOOLS set is keyed on
// `legacy.name` (e.g. "loop_describe"), not on `entry.file` or `entry.export`.
export async function resolveWireBytesForCliTools(manifest, cliTools) { /* dynamic import each entry; return [{name, bytes}] */ }
export function parseManifestJsonc(text) { /* strip /^\s*\/\/.*$/gm, JSON.parse */ }
export function computeCliContextSavings({wireBytes, cliTools, bannerBytes}) { ... }
```

Header comment documents the wire-byte choice: manifest stub bytes (~85 B ×
30 tools ≈ 2.5 KB) measure the wrong quantity; wire def bytes include
`z.toJSONSchema(legacy.schema)` parity output (`create-loop-tool.js:24-63`)
which is what the model sees on the MCP wire. The finding's measured 31.8 KB
is wire bytes; this module reproduces that quantity.

Note: `buildTransportBanner` lives in a `.cjs` hook
(`hooks/universal/session-start-inject-discoverability.cjs`, exported line 418).
The core module must NOT import the hook (ESM→CJS hook pulls gate deps); the
*caller* (script, test) supplies banner bytes. Module stays pure.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/cli-context-savings.js`
- Create: `tools/learning-loop-mastra/__tests__/cli-context-savings.test.js`
- Read-only refs: `core/cli-tools.js` (CLI_TOOLS set, keyed on `legacy.name`), `tools/manifest.json:25-66` (entry shape), `mastra/server.js:34` (canonical JSONC regex), `mastra/create-loop-tool.js:24-63` (parity view), `mastra/server.js:75-85` (wire def assembly), `hooks/universal/session-start-inject-discoverability.cjs:418` (buildTransportBanner export), `bin/loop.mjs:135-145` (`--schema` output reference)

## Implementation Steps (TDD)

1. RED: write `__tests__/cli-context-savings.test.js` —
   - parses JSONC manifest fixture (full-line comments stripped, inline content preserved)
   - resolves handler names from dynamic import (manifest entries lack `name`; resolution comes from each entry's `legacy.name`)
   - computes wire bytes via `JSON.stringify({name, description, inputSchema: z.toJSONSchema(legacy.schema, {target:"draft-7", io:"input"})})` per CLI_TOOLS member
   - non-CLI_TOOLS members excluded
   - empty intersection → dropped 0, savings negative, pct 0 (no NaN/÷0)
   - banner_bytes = max of the two variants
   - savings_pct math on a known fixture (hand-computed expected value)
2. GREEN: implement `core/cli-context-savings.js` minimal to pass.
3. REFACTOR: naming/header comment per repo conventions.
4. Run `pnpm test` (pretest seed absorbs the new files into file-index).

## Success Criteria

- [ ] All new unit tests pass; `pnpm test` green
- [ ] Module has no imports beyond `node:` builtins and `zod` (already a workspace dep)
- [ ] Wire-byte formula reproduces the finding's measured 31.8 KB magnitude (test asserts within ±10% of the cited 31.8 KB against the live manifest)
- [ ] No plan IDs or finding codes in code comments or test names (describe the invariant directly)

## Risk Assessment

- JSONC shim duplication — this module adds a 3rd copy of the strip-full-line-comments regex (after `mastra/server.js:34` and `bin/loop.mjs:54`; the predict-report verdict also flagged this). Mitigate: header comment cross-references both canonical copies; if the canonical regex evolves (e.g. trailing-comma support per `tools/manifest.json:6` rule), all three sites must update together. Future plan may extract a shared `core/jsonc.js` helper — out of scope here.
- Dynamic-import side effects — importing each handler module pulls its `legacy` constant and any top-level state. Mitigate: catch and re-throw with module path; degraded handler doesn't crash the whole delta.
- `z.toJSONSchema` parity view differs from MCP wire — `create-loop-tool.js:24-63` mutates `schema._zod.toJSONSchema` (line 63) so that MCP sees the parity view. The wire def assembled here MUST call `legacy.schema._zod.toJSONSchema()` (post-mutation) to match. Document this in the module header.