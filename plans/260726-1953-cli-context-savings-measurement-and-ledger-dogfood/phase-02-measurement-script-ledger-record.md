---
phase: 2
title: "Measurement Script + Ledger Record"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Measurement Script + Ledger Record

## Overview

Committed entry point that runs the Phase-1 computation against the real
manifest + banner and, with `--record`, appends a `runtime_state_record`
ledger row so savings are tracked across sessions and regressions are
detectable from the loop's own ledger.

## Requirements

- Functional: `pnpm measure:context` prints the delta JSON; `pnpm measure:context -- --record` additionally writes one ledger row via `bin/loop.mjs runtime_state_record`.
- Non-functional: recording is opt-in only; tests and default runs never mutate the registry.

## Architecture

New script `tools/scripts/measure-cli-context.mjs` (thin, mirrors
`measure-context-surfaces.mjs` conventions: shebang, repo-root resolution,
JSON stdout):

1. Read + JSONC-parse `tools/learning-loop-mastra/tools/manifest.json` (Phase-1 `parseManifestJsonc`).
2. `createRequire` → require the hook `.cjs` for `buildTransportBanner`; compute both variants, take max bytes.
3. `computeCliContextSavings(...)` → print pretty JSON with `measured_at`, `cli_tool_count`, and the delta fields.
4. `--record`: shell `spawnSync(process.execPath, [bin/loop.mjs, "runtime_state_record", JSON.stringify(row)], {env: {...process.env, LOOP_SURFACE: ".claude"}})`; exit non-zero on non-zero child.

Ledger row (schema-verified):
```js
{
  affected_system: "runtime-state",
  kind: "ledger-event",
  id: `ctx-savings-${measured_at}`,          // unique per run (dedupe is id+kind)
  source_ref: "local:meta-state:meta-260722T1546Z-the-write-capable-cli-transport-s-context-savings-dogfood-ch",
  value: savings_bytes,                       // current savings
  delta: savings_bytes - <previous row value>,// null on first run
  timestamp: measured_at,
  metadata: { dropped_def_bytes, banner_bytes, savings_pct, cli_tool_count },
}
```
Previous-row lookup: `runtime_state_read` via the same CLI, filter
`id` prefix `ctx-savings-`, take latest by timestamp; `delta: null` when none.

## Related Code Files

- Create: `tools/scripts/measure-cli-context.mjs`
- Modify: `package.json` (add `"measure:context": "node tools/scripts/measure-cli-context.mjs"`)
- Create: `tools/learning-loop-mastra/__tests__/cli-context-savings-script.test.js` (shape test only)
- Read-only refs: `tools/scripts/measure-context-surfaces.mjs` (conventions), `bin/loop.mjs`

## Implementation Steps (TDD)

1. RED: script-shape test — run the script via `spawnSync` against the repo, assert stdout parses as JSON with required keys and sane value ranges (`dropped_def_bytes > 0`, `savings_pct > 0`, `cli_tool_count === CLI_TOOLS.size`). No `--record` in tests.
2. GREEN: implement the script + package.json entry.
3. Manual verify: `pnpm measure:context` output sane (expect savings_pct ≈ 90s).
4. Record one real row: `pnpm measure:context -- --record`, then verify via `bin/loop.mjs runtime_state_read` that the row exists with expected fields. Capture output for Phase 3 evidence.
5. `pnpm test` green.

## Success Criteria

- [ ] Script prints required JSON keys; shape test passes
- [ ] A real ledger row recorded and read back via `runtime_state_read`
- [ ] Default run (no flag) leaves the registry untouched (git status clean on records/)
- [ ] No direct file I/O to runtime-state records; all writes via the CLI tool (canonical-tool rule)

## Risk Assessment

- CLI write blocked by gate → record step uses the same `loop.mjs` path the runtime session uses; if a preflight gate intervenes, surface the child stderr verbatim (script exits non-zero with child output).
- Runtime-state schema change (enum/pattern) → row construction is in one function; schema re-verified by the shape test's record path only in manual step, not CI.
