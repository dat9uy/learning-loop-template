---
phase: 2
title: "CLI bare-key JSON guardrail (C)"
status: complete
priority: P2
effort: "2h"
dependencies: []
---

# Phase 2: CLI bare-key JSON guardrail (C)

## Overview

When `loop.mjs <tool> '<json>'` gets bare-key JSON (e.g. `{surface:"runtime-state"}`), `JSON.parse` throws and the CLI exits 2 with `invalid JSON: ...` and no fix hint. The agent then detours to `--schema`. Emit a one-line quoted-keys hint on the bare-key shape so the agent self-corrects in one retry.

## Requirements

- Functional: `parseJsonArg('{surface:"x"}')` throws `UsageError` whose message names quoted keys as the fix (e.g. `hint: JSON requires quoted keys — use {"surface":"x"} not {surface:"x"}`).
- Functional: `parseJsonArg('{"surface":"x"}')` parses unchanged (no regression).
- Functional: a genuinely malformed payload (`{bad json`) throws `UsageError` with the existing `invalid JSON` message and **no** bare-key hint (the detector must not false-positive on non-bare-key garbage).
- Functional: the hint fires for both inline argv JSON and `--args-file` content (both flow through `parseJsonArg` / the same parse path — confirm `loadArgsFile` reaches the same guard).
- Non-functional: detection runs only on the `SyntaxError` path; zero overhead on valid JSON.

## Architecture

`bin/loop.mjs:82` `parseJsonArg(jsonArgs)` wraps `JSON.parse` and throws `UsageError("invalid JSON: " + err.message)`. Add a detector `looksLikeBareKeyJson(raw)` matching the unquoted-key shape `[{,]\s*[A-Za-z_][A-Za-z0-9_]*\s*:` (a key with no opening quote before it, after `{` or `,`). On `SyntaxError`, if the detector matches, append the hint to the `UsageError` message. The message renders through the existing `main().catch` exit-2 path (`bin/loop.mjs:281`), so no renderer change needed.

Confirm `--args-file` content reaches `parseJsonArg`: `loadArgsFile` (`bin/loop.mjs:191`) reads the file and `runTool(tool, content)` → the content is parsed inside the tool dispatch. Verify the parse site for args-file and route it through the same guard (or apply the detector at both parse sites — `bin/loop.mjs:54` is the manifest parse, do **not** touch that one).

## Related Code Files

- Modify: `tools/learning-loop-mastra/bin/loop.mjs` (`parseJsonArg`, ~line 82; confirm/cover args-file parse site)
- Optionally modify: `tools/learning-loop-mastra/core/cli-stderr.js` (if the hint belongs on `UsageError` rendering — prefer keeping it in `parseJsonArg` for locality)
- Test: `tools/learning-loop-mastra/__tests__/cli-stderr-format.test.js` and/or a new `__tests__/cli-bare-key-json-hint.test.js`

## Implementation Steps (TDD — tests first)

1. **Write failing tests** (spawn `loop.mjs` via `child_process` or unit-test `parseJsonArg` if exported; mirror the style in `cli-args-file-dispatch.test.js` / `cli-write-exit-codes.test.js`):
   - `{surface:"x"}` → exit 2, stderr contains `quoted keys` and `{"surface":"x"}`.
   - `{"surface":"x"}` → exit 0 (parses; pick a read tool like `loop_describe` to avoid write gates).
   - `{not even json` → exit 2, stderr contains `invalid JSON`, does **not** contain `quoted keys`.
   - `--args-file` with bare-key content → same hint as inline.
2. Run tests → red.
3. Add `looksLikeBareKeyJson(raw)` + append hint in `parseJsonArg`'s catch; cover the args-file parse site.
4. Run tests → green. Run `cli-stderr-format.test.js`, `cli-args-file-dispatch.test.js`, `cli-write-exit-codes.test.js`, `cli-schema-flag.test.js` → no regression.
5. `check_runtime_agnostic` against `bin/loop.mjs` (CLI is shared across runtimes).

## Success Criteria

- [x] Bare-key JSON exits 2 with a quoted-keys hint; valid JSON unaffected.
- [x] Non-bare-key garbage does not trigger the hint.
- [x] Inline and `--args-file` paths both covered.
- [x] `pnpm test:one` green; existing CLI suites unaffected; `check_runtime_agnostic` passes.

## Risk Assessment

- **Risk:** Detector false-positives on valid JSON containing colons (URLs `"https://..."`, time `"12:30"`). *Signal:* valid JSON flagged with the hint. *Response:* the detector only runs on `SyntaxError`, so valid JSON never reaches it; the only risk is bare-key-shaped garbage getting the hint, which is still a useful nudge. Test the negative case explicitly.
- **Risk:** `parseJsonArg` is not exported, blocking unit tests. *Signal:* test harness cannot import it. *Response:* test via spawned `loop.mjs` (the existing CLI tests already do this) or export it for testability.