---
phase: 3
title: "Compact Tool Defaults"
status: pending
priority: P2
dependencies: [1]
---

# Phase 3: Compact Tool Defaults (WS2)

## Overview

Apply PR #45's pointer-not-dump cascade to the MCP tool-default layer. Two changes: (1) `meta_state_list` defaults `compact:false` → `compact:true` (verbose opt-in); (2) `runtime_state_read` adds a `compact` mode + lowers `limit` default `100` → `20`. Bundled with WS1 in a single PR (Phase 4); multi-PR deferred until `meta-260709T1017Z-…-parallel-prs` is fixed (one change-log append per change, no cross-PR EOF conflict).

## Requirements

- Functional: exploratory calls return token-efficient output by default; verbose remains a deliberate opt-in (`compact:false` / higher `limit`).
- Non-functional: no public contract removed — `compact:false` still returns the full shape; `limit` max stays `1000`; the default-lower is additive safety. No new dependency.

## Architecture

**`meta_state_list`** (`tools/handlers/meta-state-list-tool.js:74,199`): the `compact` flag and `toCompact` projection already exist (lines 51-54). Only the default flips: `z.coerce.boolean().optional().default(false)` → `.default(true)`, and the output `compact: compact || false` (line 199) becomes `compact: compact ?? true`. The description already advertises the compact path; update it to state compact is the default.

**`runtime_state_read`** (`tools/handlers/runtime-state-read-tool.js`): no compact mode exists. Add `compact: z.coerce.boolean().optional().default(true)` to the schema. Define `toCompactRow(row)` dropping **only `metadata`** (Red-Team Finding 15: `fingerprint` is a SHA-256 integrity hash computed by `appendLedgerEvent` (`core/runtime-state.js:58-61`), not a metadata blob — keep it in compact mode for default-mode integrity verification). Compact field set: `kind, affected_system, id, value, delta, source_ref, fingerprint, timestamp, status`. Lower `limit` default `100` → `20`. Add a `total` field to the response (count BEFORE `slice(0, limit)`) so callers can detect truncation — `count` alone is misleading (Red-Team Finding 2: `count: result.length` reads the **post-slice** array). Output: `{ total, count, rows: compact ? result.map(toCompactRow) : result }`. Update the tool description to state: "compact drops `metadata`; `limit:20` default; truncation visible via `total > count`; pass `limit: 1000` for completeness."

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` (schema default + output + description).
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js` (add `compact` schema + `toCompactRow` + `limit` default + output + description).
- Modify tests: `__tests__/legacy-mcp/meta-state-list-compact.test.js` (flip default expectation: bare call now compact), `tools/handlers/runtime-state-read-tool.test.js` (assert default `limit:20` behavior + compact default drops `metadata`/`fingerprint`; add `compact:false` opt-in full-shape test).
- Not modified: `tools/manifest.json` — OQ3 resolved in validation: `mastra/server.js:46` rewrites manifest `tools/...` paths to `tools/handlers/...` via `.replace('tools/', '')`, so the manifest is stale-by-design. WS2 edits only the two handler files.
- Create: none.

## Implementation Steps

1. **TDD — `meta_state_list` default (Red).** In `meta-state-list-compact.test.js`: add a test calling the handler with *no* `compact` arg and assert the returned entries are compact-shape (no `description`/full fields). Will fail while default is still `false`. (Probe 3 lock first: confirm the test's import path matches the canonical handler.)
2. **Flip `meta_state_list` default.** `schema.compact`: `.default(false)` → `.default(true)`. Output line 199: `compact: compact || false` → `compact: compact ?? true` (so explicit `false` is honored; the `||` coercion would treat `false` as falsy correctly here, but `??` is the honest intent — match whichever the codebase's other `z.coerce.boolean` defaults use; Phase 1 confirms). Update description: "By default returns compact …; pass `compact: false` for the full shape." Run the test → Green.
3. **TDD — `runtime_state_read` compact + limit (Red).** In `runtime-state-read-tool.test.js`: (a) a sidecar with rows carrying `metadata` + `fingerprint`; bare handler call (no `compact`) → assert returned rows have no `metadata`/`fingerprint` and `count` reflects `limit:20` ceiling when >20 rows. (b) `compact: false` → full shape with `metadata` present. (c) explicit `limit: 50` honored. Will fail until Step 4.
4. **Add `runtime_state_read` compact + lower limit.** Add `compact` schema field (default `true`) + a `toCompactRow` helper; lower `limit` default `100` → `20`; apply projection in output; update description. Run tests → Green.
5. **Fallow + full suite.** `pnpm fallow:gate` on the two handler files + any manifest edit; `pnpm test` green.

## Success Criteria

- [ ] `meta_state_list` with no args returns compact entries; `compact: false` returns full.
- [ ] `runtime_state_read` with no args returns ≤20 compact rows (no `metadata`/`fingerprint`); `compact: false` returns full rows; `limit` honored up to `1000`.
- [ ] No existing consumer breaks (Probe 4 confirmed no default-path `metadata` dependency).
- [ ] `pnpm test` green; `pnpm fallow:gate` clean.

## Risk Assessment

- **Default-flip surprise to existing callers:** any in-repo or test caller that expected verbose output from a bare `meta_state_list`/`runtime_state_read` call now gets compact. Phase 1 Probe 4 + the literal grep (per the probe's pass criterion) mitigates. Any such call-site is itself the smell WS2 fixes — update it to pass `compact: false` explicitly if it needs the full shape.
- **`limit:20` truncation is silent (Red-Team Finding 2):** an exploratory caller expecting all rows is silently truncated. **The `count` field does NOT make truncation visible** — `count: result.length` reads the post-`slice(0, limit)` array, not the filtered total (verified at `runtime-state-read-tool.js:60,65`). Mitigation: the new `total` field reports the filtered count BEFORE slicing; callers detect truncation via `total > count`. Tool description must state this explicitly. The 20 default is grounded as "one page of typical exploratory output" — the WS2 finding said "e.g., limit=20" as an example (Red-Team Finding 6), not a hard prescription; the rationale no longer claims "matches the finding."
- **Manifest-path (OQ3 resolved):** no manifest edit needed — `server.js:46` loader rewrites the path. No bound-artifact change; Phase 4 change-log covers only the two handler files.
