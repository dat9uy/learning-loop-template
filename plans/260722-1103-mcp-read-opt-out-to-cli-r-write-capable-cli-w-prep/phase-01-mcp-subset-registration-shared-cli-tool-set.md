---
phase: 1
title: "MCP subset registration + shared CLI tool set"
status: pending
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: MCP subset registration + shared CLI tool set

## Overview

Make the MCP server's tool registration **subset-aware** so an opted-in runtime can drop the 7 read-only tools from its MCP surface, and extract the read-only tool set into a shared `core/cli-tools.js` constant so the CLI's allowlist and the server's exclude set cannot drift. Add a CLI-vs-MCP response parity lock for the 7 tools so the opt-out is proven behavior-preserving (the shipped `cli-read-parity.test.js` only proves CLI == direct-handler, not CLI == MCP).

## Requirements

- Functional: `mastra/server.js:45-68` reads an env-var exclude set; when the runtime opts in, it skips registering manifest entries whose bare name is in the shared `CLI_READ_TOOLS`. Without the flag, behavior is unchanged (all 33 tools registered — the 32 manifest entries + `mastra_update_r2_allowlist` added at `server.js:77-107`).
- Functional: `bin/loop.mjs` imports `CLI_READ_TOOLS` from `core/cli-tools.js` instead of hardcoding `READ_ONLY_TOOLS` (`loop.mjs:45-53`). The `list` subcommand and the `runTool` guard both use the shared constant.
- Functional: a new test proves that for each of the 7 read tools, the CLI stdout response and the MCP-path response are structurally equal (normalized deep-equal, same non-deterministic-field strip set as `cli-read-parity.test.js`). This is the missing CLI-vs-MCP parity leg.
- Non-functional: the exclude mechanism is a **filter on registration**, not a fork of the registration loop. The shared constant is the single source of truth for "which tools the CLI exposes" — W extends this same module later (`CLI_WRITE_TOOLS`), not a parallel set.
- Non-functional: no change to the `mastra_` prefix logic (`server.js:42,56`) — the prefix is still applied to whatever subset is registered.

## Architecture

**Shared constant.** New `tools/learning-loop-mastra/core/cli-tools.js`:
```
// Single source of truth for the tools the CLI transport exposes.
// Consumed by bin/loop.mjs (allowlist) and mastra/server.js (MCP exclude set
// when a runtime opts into CLI reads via LOOP_READS_VIA_CLI).
export const CLI_READ_TOOLS = new Set([
  "loop_describe", "loop_get_instruction", "meta_state_list",
  "meta_state_relationships", "meta_state_derive_status",
  "meta_state_check_grounding", "runtime_state_read",
]);
```
`loop.mjs` replaces its local `READ_ONLY_TOOLS` with `import { CLI_READ_TOOLS } from "../core/cli-tools.js"` and uses `CLI_READ_TOOLS` in `runList` + `runTool`. The `list`-exempt / `pinRuntimeIdAtBoot` ordering is unchanged.

**Server exclude.** In `server.js:45-68`, before `createLoopTool`, read `process.env.LOOP_READS_VIA_CLI` (truthy: `"1"` / `"true"`). When set, skip entries whose `legacy.name` ∈ `CLI_READ_TOOLS`. The `mastra_update_r2_allowlist` tool (`server.js:77-107`) is NOT a read tool — it stays registered regardless. Pseudocode:
```
const readsViaCli = isTruthy(process.env.LOOP_READS_VIA_CLI);
for (const entry of MANIFEST) {
  const legacy = ...;
  if (readsViaCli && CLI_READ_TOOLS.has(legacy.name)) continue;   // excluded for this runtime
  const prefixed = PREFIX + legacy.name;
  tools[prefixed] = createLoopTool({ id: prefixed, ... });
}
```
The env var is set per-runtime in the opted-in runtime's `mcp.json` env block (Phase 3 wires the dogfood). Default unset → current behavior.

**Why a boolean, not a list.** The 7 read tools are a fixed, named set already captured in `CLI_READ_TOOLS`. A list env var would duplicate that set and could drift from the CLI's allowlist. The boolean says "this runtime routes the CLI's read set to CLI" — one source of truth. W later adds a second boolean `LOOP_WRITES_VIA_CLI` + `CLI_WRITE_TOOLS` in the same module; the server excludes the union. YAGNI: do not build the write boolean in R.

**Parity leg.** The shipped `cli-read-parity.test.js` compares CLI stdout vs a direct `adaptLegacyHandler(legacy)` call (documented at its lines 33-38: "CLI == direct-no-context, not CLI == MCP"). MCP parity is a separate file (`mcp-tools-list-parity.test.js`) that covers the MCP side. R adds the transitive lock: for the 7 read tools, assert CLI stdout == MCP-path response (normalized). The MCP path is `withR2Gate({ id, execute: adaptLegacyHandler(legacy), pathFields: [] })` — identical to what the CLI calls (`loop.mjs:116-120`). So the strongest lock is: both sides go through `createLoopTool`/`withR2Gate` with the same args, one via in-process call, one via `spawnSync` of `loop.mjs`. Reuses the `cli-read-parity` harness (two independent tmpdirs, `stripNonDeterministic`, `collectKeySet`).

## Related Code Files

- Create: `tools/learning-loop-mastra/core/cli-tools.js`
- Create: `tools/learning-loop-mastra/__tests__/cli-mcp-subset-registration.test.js`
- Create or extend: `tools/learning-loop-mastra/__tests__/cli-mcp-read-parity.test.js` (the CLI-vs-MCP leg; see Implementation Steps)
- Modify: `tools/learning-loop-mastra/mastra/server.js` (registration loop, ~L45-68)
- Modify: `tools/learning-loop-mastra/bin/loop.mjs` (import shared constant; drop local `READ_ONLY_TOOLS`)
- Delete: none

## Implementation Steps (TDD)

1. **Test first — shared constant + CLI.** Add `__tests__/cli-mcp-subset-registration.test.js`:
   - Assert `CLI_READ_TOOLS` is a Set of exactly the 7 bare names (locks the set against drift).
   - Assert `bin/loop.mjs` `list` output equals the 7 names (regression: the import refactor must not change `list`).
   Run → fails (`core/cli-tools.js` does not exist).
2. **Create `core/cli-tools.js`** with `CLI_READ_TOOLS`. Refactor `bin/loop.mjs` to import it; delete the local `READ_ONLY_TOOLS`. Run the constant + `list` test → green.
3. **Test first — server subset.** In the same file, add a registration test:
   - Extract the registration loop into a testable function if it is not already (e.g. `buildToolSet({ manifest, readsViaCli })` returning the `{ prefixedName: tool }` map, called by `main()`). Keep the extraction minimal — the goal is observability, not a rewrite.
   - Assert `buildToolSet({ readsViaCli: false })` registers all 33 (32 manifest + `update_r2_allowlist`).
   - Assert `buildToolSet({ readsViaCli: true })` registers 26 (33 − 7) and the 7 excluded are exactly `CLI_READ_TOOLS`.
   - Assert the write tools (`meta_state_report`, `runtime_state_record`, `gate_mark_preflight`, …) are present in both branches.
   Run → fails (no exclude logic).
4. **Implement the exclude** in `server.js` per the architecture pseudocode (read `LOOP_READS_VIA_CLI`; `continue` on `CLI_READ_TOOLS.has(legacy.name)`). Run the registration test → green.
5. **Test first — CLI-vs-MCP parity.** Add the 7-tool CLI-vs-MCP parity leg. Preferred: extend `cli-read-parity.test.js` with a second comparison axis (direct == CLI already; add MCP-path == CLI using `createLoopTool`/`withR2Gate` for the MCP side), reusing its `stripNonDeterministic` + `collectKeySet` + two-tmpdir harness. If extending muddies the existing file, create `cli-mcp-read-parity.test.js` instead. For each of the 7 tools, assert MCP-path response == CLI stdout (normalized deep-equal + field-set guard). Run → green (both paths call the same `withR2Gate`-wrapped handler with `pathFields: []`; this is the transitivity lock).
6. Run `pnpm test` (full suite) → green. The exclude is config-gated and default-off; no MCP regression.
7. Smoke: with `LOOP_READS_VIA_CLI=1`, the server registers 26 tools; without it, 33 (probe via the registration test's `buildToolSet` or a `tools/list` stdio probe — not a manual server boot).

## Success Criteria

- [ ] `core/cli-tools.js` exports `CLI_READ_TOOLS` (Set of the 7 bare names); `bin/loop.mjs` imports it; no local duplicate.
- [ ] `server.js` with `LOOP_READS_VIA_CLI` unset registers 33 tools; with it set, registers 26 and excludes exactly `CLI_READ_TOOLS`. `mastra_update_r2_allowlist` stays registered in both cases.
- [ ] CLI-vs-MCP response parity green for the 7 read tools (normalized deep-equal + field-set guard).
- [ ] `pnpm test` full suite green; no MCP regression for the two non-opted runtimes.

## Risk Assessment

- **Exclude logic breaks the non-opted runtimes.** The default (env unset) must be byte-identical to today. Mitigation: the `continue` is guarded by `readsViaCli`; the registration test pins both branches; `pnpm test` covers the existing MCP parity suites.
- **`createLoopTool` extraction scope creep.** Step 3 may need a small extraction to make registration observable. Risk: refactoring the server's main path. Mitigation: keep the extraction to a pure `buildToolSet` function; `main()` calls it and starts the server. If extraction is risky, alternatively spin the server in a child process and probe `tools/list` over stdio (heavier but zero refactor). Prefer the extraction only if it is genuinely small.
- **Parity test flakiness from non-deterministic fields.** Reuse the exact `stripNonDeterministic` set from `cli-read-parity.test.js` (`checked_at`, `duration_ms`, `built_at`, `fingerprint_was_recorded`, `timing.*`) and the two-independent-tmpdir discipline. Both sides auto-record the fingerprint in their own empty root, so `fingerprint_was_recorded` stays `true` on both and stays in the assertion.
- **Rollback:** delete `core/cli-tools.js` + the test files; revert `server.js` and `loop.mjs` imports. The exclude is default-off, so reverting leaves all runtimes on full MCP.