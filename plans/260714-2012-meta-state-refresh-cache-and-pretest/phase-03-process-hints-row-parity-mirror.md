---
phase: 3
title: "PROCESS_HINTS Row + Parity Mirror"
status: completed
priority: P2
dependencies: [1, 2]
---

# Phase 3: PROCESS_HINTS Row + Parity Mirror

## Overview

Add a canonical PROCESS_HINTS row in `core/loop-introspect.js` teaching the agent the pretest-seed convention + the single-path `meta_state_refresh_file_index` escape hatch for mid-session drift after a debug/test loop. Mirror the row byte-for-byte in `.factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS`. The cold-session-discoverability drift-prevention test (`cold-session-discoverability.test.cjs:359-379`) enforces byte-for-byte parity between the canonical array and the hook mirror — same-shape contract as the existing rows for `pnpm test discipline`, `PR-body registry deltas`, etc.

## Requirements

- **Functional:** at agent session-start, `loop_describe({tier: "warm"})` returns the new PROCESS_HINTS row alongside the existing 7. The agent sees the row when it consults `process_hints` via `loop_get_instruction`.
- **Non-functional:** the row is short, declarative, and points to the canonical command paths (relative to repo root). No code blocks, no prose. Matches the in-line style of the surrounding rows.
- **Parity:** the row appears in BOTH `core/loop-introspect.js PROCESS_HINTS` and `.factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS`. `cold-session-discoverability.test.cjs` `it("canonical PROCESS_HINTS and hook LOCAL_PROCESS_HINTS arrays match exactly (drift prevention)")` passes.

## Architecture

The row declares (1) what the pretest-seed step does, (2) the escape hatch for mid-session drift after a debug/test loop, (3) when NOT to use the seed script (e.g., outside the test path). It does NOT enumerate the new MCP tools (none exist), does NOT include code blocks (in-line style of the surrounding rows), and does NOT mention plan IDs (per `rule-stable-code-artifacts`).

**Count context (Red Team F1, live-verified):** the canonical `PROCESS_HINTS` array currently has **8 entries** (`loop-introspect.js:L128-137`; the 8th was added by plan `260714-1358-rule-vocabulary-realignment`). The new row becomes index 8 (9th position). The 4-file lockstep mirror must all reach 9 in lockstep.

**4-file lockstep mirror (Red Team F3):** the plan modifies 4 files in lockstep, not 2:
1. `tools/learning-loop-mastra/core/loop-introspect.js` — canonical `PROCESS_HINTS` array
2. `.factory/hooks/loop-surface-inject.cjs` — `LOCAL_PROCESS_HINTS` (the existing cold-session-discoverability parity test enforces this)
3. `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` — `HINT_KEY_MAP_PROCESS` (slug → index) AND `HINT_SUGGESTIONS_PROCESS` (one-liner per index)

The 4th file (loop-get-instruction-tool.js) is the on-demand lookup surface for `loop_get_instruction({key: "<slug>"})`. Without updates there, the new row appears in `loop_describe` warm tier but is unreachable by name — silent rot already present for 5 of the 8 existing rows (only 3 keys exist for 8 rows). The drift-prevention test at `cold-session-discoverability.test.cjs:359-379` only checks the hook mirror; it does not catch `HINT_KEY_MAP_PROCESS` lag. This plan ships the 4th-file update in lockstep and adds a new sibling test mirroring the discoverability parity test for `HINT_KEY_MAP_PROCESS`.

**Position:** append at the END of the existing `PROCESS_HINTS` array. Appending avoids re-indexing the existing rows; the byte-for-byte comparator at the drift-prevention test checks matching `length + per-index string equality`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (append one entry to `PROCESS_HINTS` array)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (append the SAME string to `LOCAL_PROCESS_HINTS` array — byte-for-byte)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` (append `"file-edit-drift-and-fingerprints": 8` to `HINT_KEY_MAP_PROCESS` and a corresponding one-liner to `HINT_SUGGESTIONS_PROCESS`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js:74` (assertion `processHints.length` 8 → 9; same-commit fix per `rule-pr-body-registry-deltas`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` (new sibling test mirroring the existing HINT_KEY_MAP coverage check, but for `HINT_KEY_MAP_PROCESS` — closes the silent-rot gap)
- Verify (no edit): existing drift-prevention parity test at `cold-session-discoverability.test.cjs:359`

## Implementation Steps

1. **Re-read `core/loop-introspect.js:L128-137`** and `.factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS = [...]` block to confirm the current array length (should be **8**) and the surrounding row style. Do NOT copy any row text verbatim; write a new one.
2. **Draft the row text** (declarative, in-line style, no code blocks, no plan IDs). Red-team fixes baked in: **no `pnpm test:cold-session` reference** (F4: that script is not seeded per Phase 2 architecture); **explicit audit distinction** between `seed-file-index.mjs` (no gate-log) and `meta_state_refresh_file_index` (audited) (F11). Recommended final text:
   ```
   File-edit drift and fingerprints. Fingerprints in `file-index.jsonl` are load-bearing for loop grounding; `pnpm test` auto-seeds them via the prepended `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` step before `vitest run`, so a legitimate Edit/Write during a fix is absorbed at test time without operator action. For deliberate per-path drift acceptance with operator audit (gate-log entry recording who/when/why), use `meta_state_refresh_file_index({path, reason})` instead — `seed-file-index.mjs` is a mechanical bulk re-seed that intentionally omits per-path gate-log entries (git history is its audit). If you edit files DURING a debug/test loop and hit a `file-index.jsonl` drift error before re-running the suite, run `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` once (or set `SKIP_PRESEED=1` for a single pre-commit bypass) before re-running tests. The cold-tier cache is keyed on both `meta-state.jsonl` AND `file-index.jsonl` SHAs — either change invalidates. Do NOT call refresh per Edit/Write when the next `pnpm test` will do it; targeted scripts (`pnpm test:cold-session`, `pnpm test:debug`, `pnpm check:freshness`) do NOT run the seed step, so cold-session runs against a stale file-index can still surface drift at vitest time.
   ```
3. **Edit `core/loop-introspect.js:L137`:** append the new string as the 9th entry of the `PROCESS_HINTS = Object.freeze([...])` array. Ensure the trailing comma placement matches the surrounding rows.
4. **Edit `.factory/hooks/loop-surface-inject.cjs`:** locate the `LOCAL_PROCESS_HINTS = Object.freeze([...])` array and append the SAME string as the 9th entry. Re-read the existing array first to confirm position semantics.
5. **Edit `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js`:** add `"file-edit-drift-and-fingerprints": 8` to `HINT_KEY_MAP_PROCESS` (after the existing 3 entries) and add a one-liner suggestion (e.g., `"File-edit drift and fingerprints — pretest seed + escape hatches."`) to `HINT_SUGGESTIONS_PROCESS` at the same index.
6. **Edit `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js:74`:** update `processHints.length === 8` → `=== 9` (in the same commit as the row append per `rule-pr-body-registry-deltas`).
7. **Add a new sibling test in `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs`** mirroring the `HINT_KEY_MAP covers every discoverability hint index` test (line 390-399), but for `HINT_KEY_MAP_PROCESS`. Assert every key in the map maps to an index that is `< processHints.length`. This closes the silent-rot gap for future PROCESS_HINTS additions.
8. **Re-read all 5 files** to verify:
   - The new row appears at index 8 in all 4 mirror locations (canonical, hook, key-map, suggestions).
   - The strings in canonical + hook are byte-for-byte identical.
   - The sibling-test assertion is updated from 8 → 9.
9. **Run the parity tests:**
   ```
   pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs
   pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js
   ```
   Expect: all tests green, including the existing drift-prevention parity test and the new sibling test. If `Hint[8] differs…`, the two strings are not byte-identical — diff them line-by-line.
10. **Run `loop_describe` warm tier once** to confirm the new row appears:
    ```
    node -e 'import("./tools/learning-loop-mastra/core/loop-introspect.js").then(m => console.log(m.buildProcessHints().length, "process hints"))'
    ```
    Expect: `9 process hints` (was 8).

## Success Criteria

- [ ] `PROCESS_HINTS` in `core/loop-introspect.js` has 9 entries; the new one is at index 8.
- [ ] `LOCAL_PROCESS_HINTS` in `.factory/hooks/loop-surface-inject.cjs` has 9 entries; the new one is at index 8.
- [ ] `HINT_KEY_MAP_PROCESS` and `HINT_SUGGESTIONS_PROCESS` in `loop-get-instruction-tool.js` each have 9 entries; new entry at index 8.
- [ ] Both text entries (canonical + hook) are byte-for-byte identical.
- [ ] `cold-session-discoverability.test.cjs` drift-prevention test passes.
- [ ] New sibling test for `HINT_KEY_MAP_PROCESS` coverage passes.
- [ ] `gate-logic-consult-checklist-fallow-brief.test.js:74` length assertion updated to 9; passes.
- [ ] No code blocks in the row; no plan IDs; no AI/commit references (per `rule-stable-code-artifacts`).
- [ ] Process-hint length confirmation: `buildProcessHints().length === 9`.

## Risk Assessment

- **Parity drift between canonical and 3 mirrors** is the canonical failure mode for PROCESS_HINTS rows. The existing drift-prevention test catches the canonical/hook pair; manual byte-comparison at step 8 catches it earlier. The new sibling test for `HINT_KEY_MAP_PROCESS` closes the silent gap for the key-map mirror. Mitigation: write the row into a shared string constant (locally in the controller session) and use the SAME literal in BOTH text-mirror Edit calls.
- **Backslash / template-literal escaping.** The row contains backticks inside a JS string literal. If either file uses a regular string (not template literal), the backticks are literal characters and need no escape. If template-literal is used, the row can still pass through unmodified (no `${` interpolation in the proposed text). Verify both files use the same string-delimiter style before editing.
- **AI-style slop risk.** Per `rule-stable-code-artifacts`, the row must not mention plan IDs, finding codes, or audit labels. The drafted text uses invariant-level language ("fingerprints…are load-bearing", "the cold-tier cache is keyed on…") directly, satisfying the rule.
- **Length bomb.** The drafted row is ~990 chars. Other rows in the array range 350–900 chars; this is the longest row in the array by ~10%. Drift-prevention test enforces split-must-mirror across BOTH files.
- **Slug collision (Red Team F3 follow-up).** the slug `file-edit-drift-and-fingerprints` is unique to the new row. Verify with a grep before adding; no other `HINT_KEY_MAP_PROCESS` key uses this slug.
- **HINT_SUGGESTIONS_PROCESS staleness (inherited rot):** the existing 3 entries already lag the 8-entry `PROCESS_HINTS`. This plan fixes the lag for the new row (index 8) and adds the sibling test to prevent future drift. The 5 stale existing entries are NOT backfilled in this plan — that is a separate cleanup.
