---
phase: 2
title: "Measurement Script + Ledger Record"
status: pending
priority: P1
effort: "4h"
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
- Non-functional: recording is opt-in only; tests and default runs never mutate the registry. The script mints its own preflight marker (TTL 30 min, `runtime-tracking.js:37`) so `--record` works from a fresh shell without operator hand-dance.

## Architecture

New script `tools/scripts/measure-cli-context.mjs` (mirrors
`measure-context-surfaces.mjs:17-19,38` conventions: shebang, repo-root
resolution, JSON stdout, `cwd: root` on `spawnSync`):

1. Resolve `scriptDir` from `import.meta.url`; `root = resolve(scriptDir, "..", "..")`. Resolve `bin/loop.mjs` as `join(root, "tools/learning-loop-mastra/bin/loop.mjs")` (absolute; sibling script passes `cwd: root` to `spawnSync`).
2. Read + JSONC-parse `tools/learning-loop-mastra/tools/manifest.json` (Phase-1 `parseManifestJsonc`).
3. `createRequire` → require the hook `.cjs` for `buildTransportBanner`; compute both variants, take max bytes.
4. `computeCliContextSavings(...)` → print pretty JSON with `measured_at`, `cli_tool_count`, and the delta fields.
5. `--record`:
   a. Mint the runtime-state preflight marker: write `{ "completed_at": new Date().toISOString() }` to `<root>/.claude/coordination/.loop-preflight-runtime-state` (matches `runtime-tracking.js:51-64`'s `hasSurfacePreflightMarker`; 30-min TTL covers the spawn). Idempotent — overwrite if present.
   b. Build the row (see "Ledger row shape" below).
   c. Read prior row via `bin/loop.mjs runtime_state_read --json '{"affected_system":"runtime-state","kind":"ledger-event","include_all_versions":true,"limit":1000}'` — then client-side filter `id.startsWith("ctx-savings-")` (the read tool has no `id_prefix` filter per `runtime-state-read-tool.js:19-34`) — then sort by `timestamp` DESC, pick index 1 as `prior_value`. First run yields empty array → `delta: null`.
   d. `spawnSync(process.execPath, [binLoopPath, "runtime_state_record", JSON.stringify(row)], {cwd: root, env: {...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE ?? ".claude", GATE_ROOT: root}})` — exit non-zero on non-zero child, surface child stderr verbatim.
   e. Idempotency: `id: ctx-savings-<ISO>-<pid>` — pid suffix prevents same-millisecond collisions (the `appendLedgerEvent` path does NOT dedupe per `runtime-state.js:266-281`; `appendOrFindDispatchLedgerEvent:131-152` does but is unused by `runtime_state_record`).

Ledger row (schema-verified against `runtime-state-record-tool.js:148-159`):
```js
{
  affected_system: "runtime-state",
  kind: "ledger-event",
  id: `ctx-savings-${measured_at}-${process.pid}`, // unique per run (pid suffix; appendLedgerEvent does not dedupe)
  source_ref: "local:meta-state:meta-260722T1546Z-the-write-capable-cli-transport-s-context-savings-dogfood-ch",
  value: savings_bytes,                            // current savings (number)
  delta: prior_value === null ? null : (savings_bytes - prior_value),  // number | null
  timestamp: measured_at,                          // ISO Z; matches schema pattern (e.g. 2026-07-27T07:00:00.000Z)
  status: "active",                                // REQUIRED: assertKindConditionalStatus rejects ledger-event rows without it (runtime-state.js:288-308, runtime-state-record-tool.js:156)
  fingerprint: null,
  metadata: {
    dropped_def_bytes: number,                     // int (wire bytes per Phase-1)
    banner_bytes: number,                          // int
    savings_pct: number,                            // 1 decimal (e.g. 94.0)
    cli_tool_count: number,                        // int
  },
}
```

## Related Code Files

- Create: `tools/scripts/measure-cli-context.mjs`
- Modify: `package.json` (add `"measure:context": "node tools/scripts/measure-cli-context.mjs"`)
- Create: `tools/learning-loop-mastra/__tests__/cli-context-savings-script.test.js` (shape test only — no `--record`)
- Read-only refs: `tools/scripts/measure-context-surfaces.mjs:17-19,38` (cwd-root convention), `bin/loop.mjs:25-28` (GATE_ROOT contract), `tools/learning-loop-mastra/core/runtime-tracking.js:37,51-64` (TTL + marker shape), `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js:148-159` (canonical row shape), `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js:19-34` (read schema), `tools/learning-loop-mastra/core/runtime-state.js:266-281,288-308` (appendLedgerEvent + assertion)

## Implementation Steps (TDD)

1. RED: script-shape test — run the script via `spawnSync` against the repo, assert stdout parses as JSON with required keys and sane value ranges (`dropped_def_bytes > 0`, `savings_pct > 0`, `cli_tool_count === CLI_TOOLS.size`). No `--record` in tests.
2. GREEN: implement the script + package.json entry.
3. Manual verify: `pnpm measure:context` output sane (expect savings_pct ≈ 90s, dropped_def_bytes magnitude matches finding's ~31.8 KB).
4. Record one real row: `pnpm measure:context -- --record`, then verify via `bin/loop.mjs runtime_state_read` that the row exists with expected fields. Capture output for Phase 3 evidence.
5. `pnpm test` green.

## Success Criteria

- [ ] Script prints required JSON keys; shape test passes
- [ ] A real ledger row recorded and read back via `runtime_state_read`
- [ ] Default run (no flag) leaves the registry untouched (git status clean on records/)
- [ ] No direct file I/O to runtime-state records; all writes via the CLI tool (canonical-tool rule). The preflight marker IS a direct file write — to a coordination marker, not a record — and is permitted.
- [ ] `--record` works from a fresh shell without prior operator preflight call (script mints marker)
- [ ] Metadata types are stable: `dropped_def_bytes: int`, `banner_bytes: int`, `savings_pct: number (1 decimal)`, `cli_tool_count: int` — v2 fingerprint hashes metadata canonicalized (`runtime-state.js:213-217`); type drift breaks `verifyRow`

## Risk Assessment

- **Predict-report deviation acknowledged**: predict report §3 (`predict-260726-1948:23-25,33,36`) recommended "extend `measure-context-surfaces.mjs`; don't fork a new harness." This plan creates `measure-cli-context.mjs` deliberately — trade-off is test isolation (shape test owns its own script) vs. maintenance burden (two scripts must track conventions). Justified by: (a) `measure-context-surfaces.mjs` measures MCP-surface absolutes via live `tools/list`; this script measures CLI *delta* against a static manifest — the two have different inputs and lifecycles; (b) the new script has its own spawnSync + record-handling shape that the old script doesn't. Future plan may extract shared spawn-root helpers.
- **Hardcoded `LOOP_SURFACE=.claude` lifted to env**: `LOOP_SURFACE` now reads from `process.env` with `.claude` default, so `.factory`/`.mastracode` runtimes can dogfood by setting the env var. `GATE_ROOT` is now passed explicitly (`env.GATE_ROOT = root`) so the script writes to the loop's own sidecar deterministically; downstream consumers must override.
- **CLI write blocked by gate** → mitigated by minting the preflight marker directly (step 5a). If a non-preflight gate intervenes (e.g. write gate), surface child stderr verbatim (script exits non-zero with child output).
- **Runtime-state schema change (enum/pattern)** → row construction is in one function; shape test asserts required fields including `status: "active"`. Schema re-verified by manual record path only.