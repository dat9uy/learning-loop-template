---
phase: 2
title: "Read-only CLI and parity tests"
status: complete
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Read-only CLI and parity tests

## Overview

Implement `tools/learning-loop-mastra/bin/loop.mjs` — a stateless one-shot CLI that resolves a manifest entry, imports its handler, parses args through the shared `normalizeInputSchema` + zod, runs it through the same `withR2Gate` execute wrapper as the MCP path, and prints the result as JSON to stdout. A `spawnSync`-based parity test locks CLI stdout against the direct handler result for the 7 read-only tools; exit-code tests lock the CLI contract (`list`, bad args, handler error, success).

## Requirements

- Functional: `node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json-args>'` returns the same JSON the MCP path returns for the 7 read-only tools (`loop_describe`, `loop_get_instruction`, `meta_state_list`, `meta_state_relationships`, `meta_state_derive_status`, `meta_state_check_grounding`, `runtime_state_read`). Parity is **structural**, not raw byte-equal: several handlers embed non-deterministic fields that differ across process boots (`meta_state_check_grounding` and `meta_state_derive_status` emit `checked_at` + `duration_ms` in `result.grounding` / `result.derivation` — `core/check-grounding.js:109,135,223`, `core/derive-status.js:97`; `loop_describe` warm/cold tiers emit `timing.*` / `built_at` — `loop-describe-tool.js:137,167,265`). The parity comparison strips a known set of non-deterministic fields from both sides before deep-equal (see Implementation Steps).
- Functional: `node tools/learning-loop-mastra/bin/loop.mjs list` prints the read-only slice (name + one-line description, bare canonical names — no `mastra_` prefix; the prefix is an MCP-transport concern applied only in `mastra/server.js:42,56`).
- Functional: exit codes — `0` success, `1` handler error (handler threw after args validated), `2` usage / caller-configuration error: no tool / unknown tool / bad JSON / wrong arg shape / **identity-pin preconditions** (`MISSING_LOOP_SURFACE` / `INVALID_LOOP_SURFACE` / `MISSING_RUNTIME_MAPPING` — caller-configuration, per repo convention `validate-registry-refs.js:240-274` which exits 2 on missing input / caught config errors). Stderr carries diagnostics; stdout carries only the result JSON on success.
- Non-functional: no `@mastra/*` import in `bin/loop.mjs` or its import closure through `core/`. No `initStorage()`, no long-lived process, no `server.startStdio()`.
- Non-functional: reuses `pinRuntimeIdAtBoot()`, `resolveToolImportUrl()`, `normalizeInputSchema()` (Phase 1), `adaptLegacyHandler()`, `withR2Gate()` — shim, not fork. No reimplementation of arg validation, R2 gating, or manifest loading.

## Architecture

The CLI mirrors `mastra/server.js`'s per-tool wiring but skips the Mastra server entirely:

```
loop.mjs <tool> '<json>'
  1. pinRuntimeIdAtBoot()                          // core/identity-pin.js — same LOOP_SURFACE contract
  2. load tools/manifest.json (JSONC strip)        // same shim as server.js:15-19
  3. validateToolManifest(MANIFEST)                 // R3 default-deny (pathFields present)
  4. find manifest entry whose handler export's .name === <tool>   // bare name match
  5. resolveToolImportUrl(entry.file) → import     // core/manifest-loader.js
  6. const legacy = mod[entry.export]
  7. const schema = normalizeInputSchema(legacy.schema)   // core/schema-normalize.js (Phase 1)
  8. const args = schema.parse(JSON.parse(argv))   // throws ZodError → exit 2
  9. const execute = withR2Gate({ id: <tool>, execute: adaptLegacyHandler(legacy), pathFields: [] })
 10. const result = await execute(args)             // R2 passthrough (pathFields: [])
 11. process.stdout.write(JSON.stringify(result))   // the MCP path returns this same object
```

`list` subcommand: reuse `core/loop-introspect.js#listAllTools(root)` (returns `{ name, description }` with bare names), then filter to the 7 read-only tool names. Reusing `listAllTools` avoids the manifest-rewrite drift the loader's header comment warns about; the per-handler dynamic import cost (~1s total) is acceptable for a discovery subcommand. If `<tool>` is omitted or is literally `list`, dispatch to the list path.

**Identity / root resolution.** `pinRuntimeIdAtBoot()` reads `process.env.LOOP_SURFACE` (throws `MISSING_LOOP_SURFACE` if unset — the CLI inherits this contract; a runtime invoking the CLI must set it, same as the MCP server). `resolveRoot()` (via handlers) honors `GATE_ROOT` for testing.

**Exit-code mapping** (repo convention, scout-verified: `validate-registry-refs.js:240-274`, `migrate-change-log-stream.mjs:120`):
- `0` — success.
- `2` — usage / caller-configuration error: no/unknown tool, JSON parse failure, ZodError (bad arg shape), **and identity-pin preconditions** (`MISSING_LOOP_SURFACE` / `INVALID_LOOP_SURFACE` / `MISSING_RUNTIME_MAPPING` thrown by `pinRuntimeIdAtBoot()`). An unset/mis-set `LOOP_SURFACE` is a caller precondition, not a runtime finding — the repo convention exits 2 on caught config errors. The CLI's top-level catch detects the identity-pin error codes (match against `mastra/identity-errors.json` canonical messages) and exits 2.
- `1` — handler threw, or any other runtime error after args are validated.

**`pinRuntimeIdAtBoot()` runs before arg validation** and throws synchronously on a missing/invalid `LOOP_SURFACE`. That throw surfaces as exit 2 (per above), not exit 1.

## Related Code Files

- Create: `tools/learning-loop-mastra/bin/loop.mjs`
- Create: `tools/learning-loop-mastra/__tests__/cli-read-parity.test.js`
- Modify: none (Phase 1 already moved `normalizeInputSchema`)
- Delete: none

## Implementation Steps (TDD)

1. **Test first — parity.** Write `__tests__/cli-read-parity.test.js` (ESM vitest). For each of the 7 tools, pick a representative args payload:
   - `loop_describe` → `{ tier: "summary" }` (summary tier chosen deliberately: the warm/cold branches emit `timing.*` / `built_at` and the cold tier writes a cache file as a side effect, both of which diverge across process boots / run order; summary emits no timing fields and writes no cache).
   - `loop_get_instruction` → `{ key: 0 }` (first hint)
   - `meta_state_list` → `{ compact: true }`
   - `meta_state_relationships` → `{ id: "<a fixture id>", direction: "both" }` (seed a minimal `meta-state.jsonl` with one finding + one change-log)
   - `meta_state_derive_status` → `{ id: "<fixture id>" }`
   - `meta_state_check_grounding` → `{ id: "<fixture id with evidence_code_ref + mechanism_check: true>" }`
   - `runtime_state_read` → `{ limit: 5 }` (seed `runtime-state.jsonl` with one row)

   **Use TWO independent freshly-seeded tmpdirs per tool — one per side** (not a shared tmpdir). Two reasons a shared tmpdir breaks parity: (a) `meta_state_check_grounding` auto-records the fingerprint on the FIRST call only (`tools/handlers/meta-state-check-grounding-tool.js:87-105`), so `fingerprint_was_recorded` flips `true`→`false` across the direct→CLI run order in a shared root; (b) several handlers `appendGateLog` (`meta-state-check-grounding-tool.js:128`, `meta-state-list-tool.js:195`, `meta-state-derive-status-tool.js:51`, `meta-state-relationships-tool.js:177`) — a shared root lets one side observe the other's gate-log writes. Independent roots make both sides see identical empty state. Both tmpdirs are seeded from the SAME fixture bytes so the inputs are byte-identical.

   For each tool: build the two tmpdirs via `makeTempRoot()` (mirror `agent-parity.test.cjs:18-26`: create `records/meta/{index,decisions,capabilities,evidence}`), then:
   - **Direct side:** `const legacy = (await import(handlerPath))[export]; const direct = adaptLegacyHandler(legacy); const want = await direct({...args});` with `process.env.GATE_ROOT = tmpdirA`.
   - **CLI side:** `const { status, stdout, stderr } = spawnSync("node", [loopPath, tool, JSON.stringify(args)], { env: { ...process.env, GATE_ROOT: tmpdirB, LOOP_SURFACE: ".claude" } });` assert `status === 0`, `stderr` empty.
   - **Normalized deep-equal:** strip the known non-deterministic fields from both `want` and `JSON.parse(stdout)` before `deepStrictEqual`. The set: `grounding.checked_at`, `grounding.duration_ms`, `derivation.checked_at`, `derivation.duration_ms`, `built_at`, and any `timing.*` keys (recurse into `result.grounding`, `result.derivation`, and the top-level result). Keep `fingerprint_was_recorded` and `fingerprint_valid` IN the comparison — with independent roots both sides auto-record, so the field is `true` on both and stays in the assertion (locks the auto-record behavior).
   - **Field-set guard:** also assert the set of top-level + nested keys of the stripped objects match, so a future handler field rename/drop is caught even if values are normalized away.
   Run → fails (no `loop.mjs`).
2. **Test first — contract.** Add cases:
   - `loop.mjs` (no args) → `status === 2`, stderr non-empty.
   - `loop.mjs no_such_tool '{}'` → `status === 2`.
   - `loop.mjs meta_state_list 'not-json'` → `status === 2`.
   - `loop.mjs meta_state_list '{"limit: 5}'` (bad shape / ZodError) → `status === 2`.
   - **`LOOP_SURFACE` unset → `status === 2`** (identity-pin precondition, not a runtime error). Spawn with `env` that omits `LOOP_SURFACE` (and does not inherit one); assert exit 2 + stderr names the canonical `MISSING_LOOP_SURFACE` message. This locks H1.
   - `loop.mjs list` → `status === 0`, stdout contains all 7 bare tool names, does NOT contain `mastra_`.
   - Handler-error path: `loop.mjs meta_state_check_grounding '{"id": "missing-id"}'` against a tmpdir where the id does not exist — pin whichever the handler actually does (throws → `status === 1`; returns a not-found object → `status === 0`).
   Run → fails.
3. **Implement `bin/loop.mjs`** per the architecture pseudocode. Keep it ≤ ~90 LOC. Use `process.argv[2]` (tool), `process.argv[3]` (json). Wrap the body in a top-level `async main()` with a `try/catch` that maps `ZodError` + `SyntaxError` (JSON) + missing-arg + identity-pin errors → `process.exit(2)`, and any other error → `console.error` + `process.exit(1)`. Detect identity-pin errors by matching the canonical messages in `mastra/identity-errors.json` (or import the error strings) so the precondition→exit-2 mapping is explicit, not positional.
4. Run the parity + contract tests → green.
5. Run `pnpm test` (full suite) → green (no MCP regression; the CLI is additive).
6. Smoke: `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs list | head` prints the 7 tools; `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs loop_describe '{"tier":"summary"}'` prints a real summary against the live repo root.

## Success Criteria

- [x] `__tests__/cli-read-parity.test.js` green: all 7 tools pass **normalized** deep-equal (non-deterministic fields stripped from both sides) + field-set guard, with independent freshly-seeded tmpdirs per side.
- [x] Exit-code contract tests green: `0` success, `1` handler error, `2` for no/unknown tool / bad JSON / ZodError / **unset `LOOP_SURFACE`** (identity-pin precondition).
- [x] `loop.mjs list` prints the 7 bare tool names, no `mastra_` prefix.
- [x] `grep -rn "@mastra" tools/learning-loop-mastra/bin/loop.mjs` returns nothing (and the closure through `core/` is Mastra-free — Phase 1's boundary test already locks `core/schema-normalize.js`).
- [x] `pnpm test` full suite green.
- [x] `bin/loop.mjs` is ≤ ~90 LOC; no arg-parse / normalize logic beyond the slice (a phase-2 smell if it grows).

## Risk Assessment

- **No parity precedent for raw stdout.** Existing parity tests use MCP SDK `StdioClientTransport`; this test writes a new `spawnSync` helper. Risk: stdout framing (trailing newline, encoding). Mitigation: `.trim()` stdout before `JSON.parse`; assert `stderr` is empty on the success path so a stray log doesn't corrupt stdout.
- **`meta_state_check_grounding` auto-records the fingerprint on the first call only** (`meta-state-check-grounding-tool.js:87-105`): when the fixture entry has `mechanism_check: true` + an existing `evidence_code_ref`, the first call writes the fingerprint to `file-index.jsonl` and sets `fingerprint_was_recorded: true`; a second call in the SAME root sees the now-populated index, skips the branch, and leaves `fingerprint_was_recorded: false`. A shared tmpdir therefore flips the field across run order. The parity test uses **independent freshly-seeded tmpdirs per side** so both sides see an empty index and both auto-record (the field stays `true` on both and stays IN the assertion, locking the auto-record behavior). Create `records/meta/index` in each tmpdir so the write doesn't take the silent-failure branch.
- **`findProjectRoot()` is called before the R2 short-circuit** (`mastra/with-r2-gate.js:42`) and never throws (`core/gate-logic.js:498-507` — `existsSync`/`dirname` are throw-free; the loop breaks at filesystem root). When `GATE_ROOT` is unset it resolves to the loop's OWN repo root (`__dirname/../../..` — the location of `core/gate-logic.js`), **regardless of cwd**. "Invoke from the repo root" has NO effect on resolution — that framing is wrong and must not be documented. The correct contract: a runtime embedding the CLI for a DIFFERENT repo MUST set `GATE_ROOT`; otherwise the CLI silently reads the loop's own meta-state with no error. Wrong-root is silent — document this failure mode in the CLI header explicitly. The test sets `GATE_ROOT` per side (it does).
- **`LOOP_SURFACE` unset → `MISSING_LOOP_SURFACE` throw.** This is the correct, shared contract — the CLI does NOT default it (defaulting would diverge from the MCP server). The throw is a caller-configuration precondition, so it surfaces as **exit 2** (per the H1 mapping above and the repo convention), with the canonical error message on stderr. Document in the CLI usage text.
- **Blast radius:** additive. The CLI does not modify any existing path; removing it cannot affect MCP. Rollback: `rm bin/loop.mjs` + delete the test file.