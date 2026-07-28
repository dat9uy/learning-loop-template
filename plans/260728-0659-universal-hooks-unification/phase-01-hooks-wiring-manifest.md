---
phase: 1
title: "Hooks wiring manifest"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Hooks wiring manifest

## Overview
Author `hooks-lock.json` at repo root — the declarative source of truth for the 6 universal hooks and their per-runtime wiring. No code consumes it at runtime yet; it is the contract the parity test (Phase 2) and the manifest-aware `shims-in-sync` (Phase 3) read.

## Requirements
- Functional: 6 hook entries, one per file in `tools/learning-loop-mastra/hooks/universal/` (excluding `lib/`). Each entry has `path`, `event`, and a `wiring` map keyed by all 3 `SURFACES` (`.claude`, `.factory`, `.mastracode`). Each wiring value has `kind ∈ {shim, direct, adapter, none}`; `ref` required for non-`none`; `matcher` present for `PreToolUse`.
- Non-functional: JSON validates; order is stable (insertion = canonical hook order). No `hash` field (Q2). No materializer (Q1).

## Architecture
Manifest is pure data. Each entry is keyed by the **universal basename without extension, kebab-case** (e.g. `bash-gate`, `recurrence-check-on-start`, `session-start-inject-discoverability`) — this is the key `shimNameToHookKey` (Phase 3) maps shim filenames onto; using the kebab basename keeps manifest keys, universal filenames, and the shim→hook map consistent. `kind` semantics:
- `shim` — runtime config wires a `<surface>/coordination/hooks/*.cjs` shim that `execFileSync`'s the universal hook.
- `direct` — runtime config wires `node <universal-path>` directly.
- `adapter` — runtime config wires a runtime-local adapter (`.factory/hooks/loop-surface-inject.cjs`); single-source, no byte-parity.
- `none` — runtime does not wire this hook (pull-only or N/A).

`matcher` shapes: string (`"Bash"`, `"Edit|Write"`, `"Edit|Create|ApplyPatch"`) for `.claude`/`.factory` PreToolUse; object (`{"tool_name":"execute_command"}`) for `.mastracode` PreToolUse; array (`["write_file","string_replace_lsp","delete_file"]`) for `.mastracode` write-gate triple-wire (Q3); a SessionStart matcher where the runtime config carries one (`.factory` adapter carries `"startup"`); absent otherwise. **Transcribe `ref` AND `matcher` verbatim from each runtime's config** — the matrix in `plan.md` is illustrative; the actual config file is ground truth (red-team F3).

## Related Code Files
- Create: `hooks-lock.json` (repo root)
- Read: `tools/learning-loop-mastra/hooks/universal/` (6 hooks + `lib/`), `.claude/settings.json`, `.factory/settings.json`, `.factory/hooks.json`, `.mastracode/hooks.json`, `tools/learning-loop-mastra/core/surfaces.js` (SURFACES order: `.claude`, `.factory`, `.mastracode`)

## Implementation Steps (TDD)
1. **Red — manifest-shape test.** Create `tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-lock-manifest.test.js` asserting: file exists; `hooks` is an object; **the set of manifest keys equals the set of `tools/learning-loop-mastra/hooks/universal/*.{js,cjs}` basenames (excluding `lib/`), normalized to kebab-without-extension** (red-team F5 — this is what makes "a new universal hook never adopted" detectable; do NOT hard-code "6"); each entry has `path` (string), `event` ∈ {SessionStart, PreToolUse, UserPromptSubmit}; `wiring` has all 3 SURFACES; each wiring has `kind` in the enum; non-`none` has `ref`; `PreToolUse` has `matcher`; every `path` existsSync. Run → red (no file).
2. **Green — author `hooks-lock.json`.** Populate the entries from the actual runtime configs (NOT from memory or the matrix alone — cross-check each `ref`/`matcher` against `.claude/settings.json`, `.factory/settings.json`, `.factory/hooks.json`, `.mastracode/hooks.json`). `.mastracode` write-gate uses the array matcher; `.factory` SessionStart adapter entries carry `"matcher":"startup"`.
3. **Verify** the manifest-shape test goes green; `JSON.parse` sanity check.

## Success Criteria
- [ ] `hooks-lock.json` exists with 6 entries matching the verified matrix.
- [ ] Manifest-shape test (`hooks-lock-manifest.test.js`) passes.
- [ ] No `hash` fields; no materializer script added.

## Risk Assessment
**Low.** New declarative file; no runtime consumers. Only risk is mis-transcribing a `ref`/`matcher` — the shape test + Phase 2 parity test catch transcription errors against the actual config files. Mitigation: copy `ref` strings verbatim from the runtime configs, not from memory.