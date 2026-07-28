---
phase: 2
title: "Hooks wiring parity test"
status: pending
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 2: Hooks wiring parity test

## Overview
Author `hooks-wiring-parity.test.js` — the CI drift backstop (sibling to `skills-mirror-parity.test.js`). It reads `hooks-lock.json` and each runtime's `settings.json`/`hooks.json` and asserts the declared wiring matches reality. This is the mechanism that makes "a runtime silently losing a hook" and "a new universal hook never adopted" **visible** — the gap the finding identifies.

## Requirements
- Functional: for each hook entry × each surface, assert the runtime's config wires (or does not wire) the hook with the declared `kind` and `ref`. Cover both drift directions: declared-wired → IS wired; declared-`none` → is NOT wired. Assert every canonical `path` exists. Assert every wired `ref` (shim/adapter file) exists.
- Non-functional: vitest; lives in `tools/learning-loop-mastra/__tests__/legacy-mcp/`; uses `SURFACES` from `core/surfaces.js`; no mutation. Shim byte-identity is NOT re-asserted here — delegated to the `shims-in-sync` checklist item (Phase 3) to avoid DRY.

## Architecture
Three runtime config shapes, resolved by a `loadRuntimeHooks(surface)` helper:
- `.claude` → `.claude/settings.json` → `hooks.<Event>[].hooks[].command` (nested under matcher groups for `PreToolUse`).
- `.factory` → **two** files: `.factory/settings.json` (gates) + `.factory/hooks.json` (SessionStart adapter). Both nested. The helper **merges** both files' events into one per-surface list.
- `.mastracode` → `.mastracode/hooks.json` → flat array per event with `command` + `matcher` (object form).

The helper returns a normalized per-surface list: `{ event, command, matcher }[]`. **Env-token canonicalization (red-team F6):** `.factory`/`.claude` commands may carry literal `$FACTORY_PROJECT_DIR`/`$CLAUDE_PROJECT_DIR` prefixes (e.g. `node "$FACTORY_PROJECT_DIR"/.factory/coordination/hooks/bash-coordination-gate.cjs`). The helper MUST strip/expand these env tokens to the surface-relative path before any comparison against `ref`. The match must be **anchored at the end of the command string AND not preceded by a path separator** (reject `evil/.factory/hooks/loop-surface-inject.cjs` path-traversal prefixes).

Per manifest entry × surface, the test checks:
- `kind:"shim"` → a command resolving to `<surface>/coordination/hooks/<shim>.cjs` exists under the entry's `event` with a `matcher` matching the manifest's (after normalization).
- `kind:"direct"` → a command resolving to `node tools/learning-loop-mastra/hooks/universal/<file>` exists under the entry's `event`. **Array-matcher cardinality (red-team F8):** when the manifest `matcher` is an array (`.mastracode` write-gate, 3 elements), assert the runtime config has exactly `array.length` DISTINCT wiring entries under that event, each with the same command and one distinct matcher from the array (in the surface's native matcher shape) — NOT a single "command exists" check, which would miss a 2-of-3 wire loss.
- `kind:"adapter"` → a command resolving to the entry's `ref` (`.factory/hooks/loop-surface-inject.cjs`) exists under SessionStart, with the manifest's `matcher` (`"startup"`) if declared.
- `kind:"none"` → NO command under the entry's `event` references this hook's universal path or shim path (catches silent adoption).

## Related Code Files
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-wiring-parity.test.js`
- Read: `hooks-lock.json` (Phase 1), `.claude/settings.json`, `.factory/settings.json`, `.factory/hooks.json`, `.mastracode/hooks.json`, `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js` (pattern to mirror), `tools/learning-loop-mastra/core/surfaces.js`

## Implementation Steps (TDD)
1. **Red — write the specs first** (see Test Cases below). Run against the Phase-1 manifest + current configs. The test's JOB is to catch any mismatch between the manifest and reality — so a red spec here means either a manifest transcription error (fix the manifest) or a helper bug (fix the helper), NOT "reality is wrong." Do not assume "go green immediately"; verify each spec deliberately. The `.factory` adapter spec (adapter wired via `hooks.json` with `matcher:"startup"`, not `settings.json`) and the `.mastracode` write-gate array-matcher cardinality spec (3 distinct wires) are the most likely first-red specs.
2. **Green — fix the helper, not the configs.** If a spec fails, the mismatch is either a manifest transcription error (fix the manifest, transcribing verbatim from the runtime config) or a helper bug (fix the helper — most likely env-token canonicalization or matcher-shape normalization). Do NOT change runtime configs in this phase.
3. **Mutation check (manual).** (a) Remove one hook command from a runtime config → the corresponding spec goes red → restore. (b) Add an undeclared hook command (e.g. wire a `kind:"none"` hook) → the negative spec goes red → restore. This proves the test detects drift in both directions.

### Test Cases (from research report §2 + red-team F6/F8)
- 6 × `"<hook> is wired with declared kind on every surface"` (one per hook; iterates SURFACES, branches on kind).
- 6 × `"<hook> canonical path exists"`.
- Negative branches within the 6 wiring specs: `kind:"none"` surfaces do NOT wire the hook (catches silent adoption).
- 1 × `"loadRuntimeHooks resolves all 3 runtime config shapes"` (shape test for the helper — includes `.factory` two-file merge).
- 1 × `"every wired shim/adapter ref exists on disk"`.
- 1 × `"env-token canonicalization: $FACTORY_PROJECT_DIR/$CLAUDE_PROJECT_DIR stripped before comparison"` (red-team F6).
- 1 × `".mastracode write-gate array-matcher: 3 distinct wires exist, one per matcher element"` (red-team F8 — cardinality, not existence).
- 1 × `"SessionStart adapter matcher (startup) is asserted"` (red-team F7).

## Success Criteria
- [ ] `hooks-wiring-parity.test.js` passes against the Phase-1 manifest + current runtime configs.
- [ ] Both drift directions proven: removing a hook command turns a spec red; adding an undeclared hook command turns a spec red.
- [ ] Shim byte-identity is NOT asserted here (delegated to `shims-in-sync`).
- [ ] No runtime config file modified in this phase.

## Risk Assessment
**Medium.** Three config-file shapes (nested, two-file, flat) are the main complexity. The `.factory` two-file split is the trap: the SessionStart adapter lives in `hooks.json`, the gates in `settings.json` — the helper must read both or the adapter spec false-fails. Mitigation: the helper is per-surface, not per-file; it merges `.factory/settings.json` + `.factory/hooks.json` events. Second risk: matcher-shape variance (string vs object vs array) + env-token prefixes (`$FACTORY_PROJECT_DIR`) — normalize both in the helper (canonicalize env tokens to surface-relative paths; normalize matchers to the surface's native shape) and keep the manifest's `matcher` as-is. Third risk: the `.mastracode` write-gate array-matcher — assert cardinality (3 distinct wires), not existence.