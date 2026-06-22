---
phase: 4
title: "layer-2-prompt-teaching"
status: pending
priority: P1
dependencies: [phase-01-runner-script, phase-02-per-namespace-logs]
effort: "M"
---

# Phase 4: layer-2-prompt-teaching

## Overview

Add a new `pnpm-test-discipline` hint to `DISCOVERABILITY_HINTS` (R2 §Probe 10 recommendation) that teaches the agent to NOT enter degenerate read loops on long-running commands, with 3 concrete rules. Mirror the hint in the Droid surface-inject hook. Add a one-line pointer in `AGENTS.md:139`. Add a parity test to detect drift between the two arrays.

## Why discoverability hints (R2 §Probe 5)

- The agent in session `caa56a15` ran 1100+ reads AFTER the warm-tier hints scrolled out of context. Static rules in `AGENTS.md` are read at session start and forgotten.
- The `DISCOVERABILITY_HINTS` array is the re-injection surface: it's served at warm tier via `loop_describe({tier: "warm"})`, retrievable on demand via `loop_get_instruction({key: '<slug>'})`, and (for Droid) auto-injected at SessionStart.
- 3 layers of defense in one place: at-start (Droid), on-demand (Claude Code via `loop_get_instruction`), warm-tier (Claude Code via `loop_describe`).

## Requirements

- **Functional:**
  - 1 new entry in `DISCOVERABILITY_HINTS` with slug `pnpm-test-discipline`
  - 1 new entry in `HINT_KEY_MAP` mapping `pnpm-test-discipline` → index 16
  - 1 new entry in `HINT_SUGGESTIONS` with a 1-line suggestion for the hint
  - 1 mirror entry in `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS`
  - 1 one-line pointer in `AGENTS.md` after line 139
  - 1 parity test asserting the two arrays are in sync
- **Non-functional:**
  - Hint is ≤ 200 words (R2 §Idempotency signal design)
  - No new MCP tool, no new schema, no new registry entry
  - Wording follows the existing 16 hints' style (operator voice, file:line refs)

## Hint wording (R2 §Idempotency signal design) — REVISED per Red Team H8

**Removed Rule 3 (TaskUpdate-noop):** the operator-locked constraint says "TaskUpdate idempotency is a separate Layer 2-general fix (out of scope)." Including Rule 3 in the hint contradicts that decision — the agent would be taught to act on a fix that is explicitly out of Plan B scope. The hint now covers only Rule 1 and Rule 2, both of which are observable stop conditions the agent can self-check.

Append this string to `DISCOVERABILITY_HINTS` at `tools/learning-loop-mcp/core/loop-introspect.js` (after line 105):

```
pnpm test discipline. `pnpm test` runs 9 namespaces / 1100+ tests in ~13s on this dev machine (was claimed 10 min before the runner was added). Per-namespace log files at .test-logs/<ns>.log mirror progress. **Rule 1 (silent-command):** if a Bash call has been running and silent for >2 min, do not re-read files; tail .test-logs/<ns>.log or trust the silence. **Rule 2 (same-file-read):** if you have read the same file path >5 times in 60 seconds with no intervening Edit/Write/Bash, STOP — you are in a degenerate read loop; write a one-line journal entry to plans/reports/ and ask the operator. The runner preserves the *principle* of observable per-namespace progress (the old 10-min claim was an agent-side `tail -60` artifact, not a runner defect).
```

## AGENTS.md pointer (R2 §Probe 10)

Add this single line after `AGENTS.md:139`:

```
For long-running pnpm test discipline (read-loop, stuck-detection), call `loop_get_instruction({key: 'pnpm-test-discipline'})` — see `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS`.
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/loop-introspect.js:90-107` — append new hint at index 16
- **Modify:** `.factory/hooks/loop-surface-inject.cjs:14-31` — mirror new hint
- **Modify:** `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js:4-19` — back-fill HINT_KEY_MAP (indices 13/14/15) AND add `"pnpm-test-discipline": 16` (per Red Team C2)
- **Modify:** `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js:21-35` — back-fill HINT_SUGGESTIONS (indices 13/14/15) AND add new entry at 16 (per Red Team C2)
- **Modify:** `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js:16-17` — resolve duplicate `"meta-vs-product-split": 11` and `"loop-get-instruction": 11` collision
- **Modify:** `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js:14,96,101` — update length assertion from 16 to 17
- **Modify:** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:341-387` — extend hint-count parity to exact-string equality on all 3 surfaces (per Red Team H9 + M29)
- **Modify:** `AGENTS.md:139` — append one-line pointer

## Implementation Steps

1. **Audit existing `HINT_KEY_MAP` / `HINT_SUGGESTIONS` gaps** (per Red Team C2):
   ```bash
   grep -E "^[ ]*\"" tools/learning-loop-mcp/tools/loop-get-instruction-tool.js | head -30
   ```
   Identify the 3 missing slugs (indices 13, 14, 15 — likely the Phase A reframe, session-id hint, and runtime-agnostic hint). Back-fill `HINT_KEY_MAP` (e.g., `"rule-and-loop-design-lifecycle": 7, "session-id-query": 14, "runtime-agnostic-features": 15`) and `HINT_SUGGESTIONS` for those indices.
2. **Resolve the duplicate at index 11** in `HINT_KEY_MAP`: keep only one of `"meta-vs-product-split": 11` or `"loop-get-instruction": 11` (pick the more specific slug).
3. **Append the hint string** to `DISCOVERABILITY_HINTS` in `loop-introspect.js`. Keep the array frozen.
4. **Mirror the same string** in `.factory/hooks/loop-surface-inject.cjs`'s `LOCAL_DISCOVERABILITY_HINTS`. The Droid file is a hardcoded local copy; sync by hand.
5. **Add to `HINT_KEY_MAP`:**
   ```js
   "pnpm-test-discipline": 16,
   ```
6. **Add to `HINT_SUGGESTIONS`:**
   ```js
   16: "Long-running pnpm test discipline: per-namespace log files, read-loop stop conditions.",
   ```
7. **Update `loop-describe-warm-tier.test.js`** length assertions from 16 to 17 at lines 14, 96, 101.
8. **Extend the existing parity test** in `cold-session-discoverability.test.cjs:341-387` to cover all 3 surfaces (`DISCOVERABILITY_HINTS`, `LOCAL_DISCOVERABILITY_HINTS`, `HINT_SUGGESTIONS`) and assert exact string equality.
9. **Append the pointer** in `AGENTS.md` after line 139. The new line must be a single sentence and reference the slug and the source file.
10. **Run `pnpm test:cold-session`** to verify the warm-tier hint is surfaced.

## Success Criteria

- [ ] `DISCOVERABILITY_HINTS` has 17 entries (16 existing + 1 new)
- [ ] `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` has 17 entries
- [ ] `HINT_KEY_MAP` is back-filled for indices 13, 14, 15 AND has `"pnpm-test-discipline": 16`
- [ ] `HINT_SUGGESTIONS` is back-filled for indices 13, 14, 15 AND has a new entry at 16
- [ ] Duplicate at index 11 in `HINT_KEY_MAP` is resolved
- [ ] `loop_get_instruction({key: "pnpm-test-discipline"})` returns the new hint text with a non-undefined `suggestion`
- [ ] `mcp__learning-loop-mastra__loop_describe` (warm tier) surfaces the new hint
- [ ] `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` length assertions pass with 17
- [ ] Extended parity test passes
- [ ] `AGENTS.md` has the one-line pointer
- [ ] `pnpm test:cold-session` still passes (no regression in existing hints)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| The two Droid arrays drift after the first edit | Medium | Medium | Extended parity test catches drift; CI failure on next run |
| Claude Code never calls `loop_get_instruction` (the latent gap R2 §Concerns 2 flagged) | High | Medium | The hint is also in warm-tier payload; the pointer in AGENTS.md nudges the agent. **Document the gap in a follow-up loop-design entry** (deferred, not in Plan B scope) |
| Wording triggers the bash gate regex `rule-no-new-artifact-types` | None | None | The hint is a `DISCOVERABILITY_HINTS` array entry, not a new artifact type |
| The hint embeds a finding id that becomes stale on resolve (per H17) | Low | Low | Hint text uses behavior-level phrasing, not finding ids; review hint text before each closeout |
| Back-filling HINT_KEY_MAP for 13/14/15 hits a different bug (e.g., a slug that doesn't match the actual hint at that index) | Medium | Low | The 3 back-filled slugs must be grep-verified against `DISCOVERABILITY_HINTS[13/14/15]` text |
