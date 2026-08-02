---
title: "Loop CLI file arguments"
description: "Allow loop.mjs tool payloads to be read from a file so gate-sensitive prose does not need to travel in shell argv, and make the meta_state_report category contract visible in the SessionStart sketch."
status: completed
priority: P1
effort: "2-4h"
tags: [cli-transport, discoverability, meta-state]
created: 2026-08-02
blockedBy: []
---

# Loop CLI file arguments

## Outcome

Operators and agents can invoke any CLI-portable loop tool with JSON loaded from a local file rather than embedding the payload in shell argv. This removes the observed gate false-positive and shell-escaping failure mode while preserving the existing inline JSON contract.

## Constraints

- Preserve `loop.mjs <tool> '<json-args>'`, `list`, and both `--schema` forms.
- File contents must pass through the same JSON parsing, schema validation, runtime pinning, handler, and exit-code paths as inline arguments.
- Do not add stdin support, temp-file lifecycle management, or a second handler path.
- Keep SessionStart transport guidance within its existing byte budget.
- Do not place the meta-state finding ID in stable code comments or test names.

## Non-goals

- Changing gate matching rules.
- Accepting YAML, JSONC, URLs, or arbitrary shell expansion.
- Publishing every schema enum in the compact banner.
- Changing tool schemas or mutation behavior.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [File-backed CLI arguments and discoverability](./phase-01-start.md) | Completed | None |

## Acceptance Criteria

- [x] `loop.mjs <tool> --args-file <path>` executes a valid payload through the same tool path as inline JSON.
- [x] Missing path, unreadable file, malformed JSON, extra arguments, and incompatible flag combinations fail as caller-configuration errors with exit 2 and no handler execution.
- [x] Existing inline JSON, `list`, and `--schema` behavior remains compatible.
- [x] CLI usage comments and SessionStart transport guidance advertise the file form.
- [x] The `meta_state_report` sketch names all accepted required `category` values without weakening required-key drift checks.
- [x] Focused CLI and SessionStart tests pass; broader changed tests pass.
- [x] Runtime-agnostic audit passes for the touched feature surface.
- [x] The originating finding is derived, verified, and resolved only after implementation evidence is green.

## Risks and Rollback

- **Argument ambiguity:** explicit dispatch rejects missing/extra operands instead of guessing. Tests lock precedence and error behavior.
- **Path exposure:** errors should identify the caller problem without printing file contents. No file data is echoed.
- **Banner growth:** extend the existing budget test rather than adding full schemas.
- **Rollback:** revert the dispatch/helper and banner additions; inline JSON remains the unchanged baseline.

## Open Questions

None.

<!-- slug: loop-cli-file-arguments -->
