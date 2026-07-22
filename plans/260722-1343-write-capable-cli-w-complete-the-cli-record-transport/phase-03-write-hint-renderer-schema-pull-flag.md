---
phase: 3
title: "Write-hint renderer + schema pull flag"
status: pending
priority: P2
effort: "0.5d"
dependencies: [1]
---

# Phase 3: Write-hint renderer + schema pull flag

## Overview

Keep write-path ergonomics without re-injecting full schemas into SessionStart context:
extend the hint renderer with per-write-tool one-line arg sketches and add a pull-on-demand
`loop.mjs <tool> --schema` flag that prints the zod input schema. Tests first per `--tdd`.

## Requirements

- Functional:
  - `loop.mjs <tool> --schema` prints the normalized input schema for that tool (the same
    `normalizeInputSchema(legacy.schema)` the CLI parses with) as JSON to stdout, exit 0.
    Works for any tool in `CLI_TOOLS`. No `LOOP_SURFACE` required (schema is static, reads
    no runtime records — mirror `list`'s exemption).
  - The SessionStart hint renderer emits a usable one-line command form for each write tool
    (e.g. `loop.mjs meta_state_report '{category,severity,affected_system,description}'`)
    without embedding the full zod schema. Deeper shape is available via `--schema`.
  - `--schema` and `list` are the only pre-pin subcommands; passing `--schema` with a
    non-`CLI_TOOLS` name is exit 2 usage.
- Non-functional:
  - Pull, not push — no new schema bytes in the SessionStart banner beyond the one-line
    sketch. The context-size win is preserved.
  - Reuse the existing hint renderer variant built for R; add write-tool forms, do not fork.

## Architecture

- `bin/loop.mjs` `main`: detect `--schema` in `process.argv` **after the argv destructure
  but before the runtime-pin step** (the existing destructure reads `subcommand`/`jsonArgs`
  first; `--schema` would otherwise be parsed as `jsonArgs` and fail JSON parse → exit 2).
  Resolve the tool by bare name (reuse `resolveToolByBareName`), `normalizeInputSchema`,
  print `JSON.stringify(schema, null, 2)`, exit 0. If the tool is not in `CLI_TOOLS`,
  throw `UsageError` → exit 2. This mirrors `runList`'s pre-pin exemption.
- **Import-time safety (M2):** `runList` uses `importWithTimeout` (`core/loop-introspect.js`,
  1s timeout) while `resolveToolByBareName` uses a bare `await import(...)` with no timeout.
  Verify no handler module has import-time env-dependent side effects (grep top-level
  `process.env` reads in `tools/handlers/*-tool.js`). If any exist, or for defense-in-depth,
  reuse `importWithTimeout` for the `--schema` resolution so a hung import cannot block the
  CLI. The `--schema` path reads no runtime records, so no `LOOP_SURFACE`/`GATE_ROOT` needed.
- Hint renderer: the R variant already produces command forms for read tools. Extend its
  tool-form table with one write-tool entries. Each entry is a one-line arg sketch listing
  the top-level required keys only — enough for the agent to compose the JSON string; the
  full shape (enums, nested objects) is pulled via `--schema`. Keep sketches in the
  renderer's data table (one source), not inline in `bin/loop.mjs`. Also surface the
  rejection-vs-`InternalError` recovery policy (from Phase 2) in the hint prose.

## Related Code Files

- Modify: `tools/learning-loop-mastra/bin/loop.mjs` (`--schema` subcommand)
- Modify: the SessionStart hint renderer (R variant — locate via `hint-render-cli.test.cjs` / `session-start-inject-discoverability.cjs`)
- Create: `tools/learning-loop-mastra/__tests__/cli-schema-flag.test.js`
- Modify: `tools/learning-loop-mastra/__tests__/hint-render-cli.test.cjs` (write-tool forms)

## Implementation Steps (TDD)

1. **Test — `--schema` flag.** Create `cli-schema-flag.test.js`:
   - `loop.mjs meta_state_report --schema` → exit 0, stdout is valid JSON containing the
     top-level keys (`category`, `severity`, `affected_system`, `description`, …).
   - `loop.mjs <unknown> --schema` → exit 2.
   - `--schema` works without `LOOP_SURFACE` set (no pin).
   - `--schema` for a `CLI_WRITE_TOOLS` member and a `CLI_READ_TOOLS` member both succeed.
   Run → red.
2. **Implement `--schema`.** Add the pre-pin branch in `bin/loop.mjs` `main`. Run → green.
3. **Test — write-tool hint forms.** Extend `hint-render-cli.test.cjs`: assert the
   rendered banner includes one-line sketches for the write tools (e.g.
   `meta_state_report`, `meta_state_batch`, `meta_state_resolve`) and that no full zod
   schema text appears in the banner. Run → red.
4. **Extend the hint renderer.** Add write-tool entries to the renderer's form table.
   Run → green.
5. **Verify context budget (locked).** Add a byte-size assertion to
   `hint-render-cli.test.cjs`: `bannerBytes < READS_ONLY_BANNER_BYTES + N_WRITE_TOOLS *
   MAX_SKETCH_BYTES` (cap the per-sketch bytes). This locks the "no schema re-injection"
   invariant so a future renderer edit cannot silently erode the context-size win. Record
   the delta in the phase-4 dogfood change-log.

## Success Criteria

- [ ] `cli-schema-flag.test.js` passes for read and write tools, with and without `LOOP_SURFACE`.
- [ ] `hint-render-cli.test.cjs` passes: write-tool sketches present, no full schema in
      banner, byte-size assertion holds.
- [ ] Banner byte delta is one-line-per-write-tool (no schema re-injection), locked by the
      byte-size assertion.
- [ ] `--schema` import path verified safe (no import-time env side effects) or guarded by
      `importWithTimeout`.
- [ ] `pnpm test` green.

## Risk Assessment

- **Sketch staleness** — a one-line sketch can drift from the real schema after a handler
  change. Mitigation: the `--schema` flag is authoritative; the sketch is a hint only. Add
  a test that the sketch's listed keys are a subset of the real schema's top-level keys
  (cheap guard against drift).
- **Renderer fork risk** — do not duplicate the renderer; extend the existing R variant so
  read and write forms share one code path (runtime-agnostic, DRY).
- **`--schema` arg-position ambiguity** — support both `loop.mjs <tool> --schema` and
  `loop.mjs --schema <tool>` if cheap; otherwise pick `<tool> --schema` and lock it in the
  test. KISS — pick one form.