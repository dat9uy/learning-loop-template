---
phase: 1
title: "File-backed CLI arguments and discoverability"
status: completed
priority: P1
effort: "2-4h"
dependencies: []
---

# Phase 1: File-backed CLI arguments and discoverability

## Overview

Add one file-backed payload form to the existing CLI dispatch, document it in the SessionStart transport banner, and expose the required `meta_state_report.category` values in the compact sketch.

## Requirements

- Functional: support `loop.mjs <tool> --args-file <path>` for every `CLI_TOOLS` member.
- Functional: parse file content with the existing `parseJsonArg` and validate with the existing normalized tool schema.
- Functional: keep inline JSON and schema/list dispatch unchanged.
- Non-functional: reject invalid invocation shapes deterministically as exit 2.
- Non-functional: avoid a forked execution path and stay within banner size limits.

## Architecture

Extend argv dispatch only. A small resolver reads the file synchronously before runtime pinning and returns the JSON text consumed by `runTool`; after resolution, both inline and file-backed forms converge on the existing parse/validate/R2/handler pipeline. SessionStart guidance gains the alternate command form. The sketch retains machine-checkable property tokens while adding a literal enum annotation for `category` that the drift test parser explicitly ignores or understands.

## Related Code Files

- Modify: `tools/learning-loop-mastra/bin/loop.mjs`
- Modify: `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs`
- Modify: `tools/learning-loop-mastra/__tests__/cli-sessionstart-banner.test.js`
- Modify: the closest existing CLI subprocess test, or create one focused kebab-case test under `tools/learning-loop-mastra/__tests__/`
- Modify if required: `tools/learning-loop-mastra/__tests__/cli-write-hint-sketch-drift.test.js`

## Implementation Steps

1. Add failing subprocess tests for valid file payload parity and caller-error cases: missing path, unreadable path, malformed JSON, extra args, and `--schema` incompatibility.
2. Extend CLI dispatch to recognize exactly `<tool> --args-file <path>` and read UTF-8 content, translating read failures into `UsageError`.
3. Route the loaded text through the existing `runTool` path; keep runtime pinning and result serialization unchanged.
4. Add failing SessionStart assertions for the advertised file form and explicit `meta_state_report` category values.
5. Update usage comments/banner and category sketch while preserving required-key drift validation and the byte budget.
6. Run focused tests, changed tests, and the runtime-agnostic audit.
7. Derive the originating finding status; if the mechanism is proven fixed, refresh cited grounding as needed and resolve it with test evidence.

## Success Criteria

- [x] Valid payload files produce the same JSON result as equivalent inline payloads.
- [x] Invalid file invocations exit 2 and do not emit handler success output.
- [x] Existing CLI contract tests stay green.
- [x] SessionStart banner advertises `--args-file` and all allowed report categories.
- [x] Banner remains under `BANNER_BYTES_BUDGET`.
- [x] Runtime-agnostic checklist passes.

## Risk Assessment

Main risk is ambiguous argument parsing. Mitigate with exact accepted shapes and subprocess tests. Reading a local file adds no new mutation authority because the payload still passes the same schema, gate, and handler path. Roll back by removing only the file dispatch branch and banner text.
