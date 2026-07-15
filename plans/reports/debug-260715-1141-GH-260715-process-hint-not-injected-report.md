# Debug — PROCESS_HINT Not Injected Into Agent Context

## Executive Summary

PROCESS_HINTS row #1 (the test-parsing rule: "Do NOT grep raw vitest stdout…")
**never reaches the agent's working context**, even when the SessionStart hook
populates the sidecar perfectly. Session `4760ee34` used `pnpm test 2>&1 | grep`
4× because row #1 was not in its context — not because the hook degraded.

The 260715-1116 silent-degrade fix made the sidecar *correctly populated* and
*auditable*. It did not — and could not — fix the real defect, because the
**sidecar→agent-context delivery leg was never built**. The hook writes a file
and prints a stderr *summary*; neither the file nor the hint *content* is
injected into the agent's prompt.

## Technical Analysis

### The delivery path has three legs; only the first works

1. **Hook builds hints** → ✅ works. `loadCoreHints()` calls
   `buildProcessHints()` from `core/loop-introspect.js`. Verified: session
   4760ee34's SessionStart attachment shows
   `stderr: '[session-start] wrote 16 discoverability + 9 process + … hints'`
   — i.e. 9 process hints were produced, `process_hints_source` would be
   `"core"`. The sidecar on disk now carries all 9 hints including row #1.

2. **Hints travel to the agent** → ❌ **missing leg**. The hook's
   `session-start-inject-discoverability.cjs` does, in `main()`:
   - `writeContext(...)` → writes `.claude/session-context.json` (a file).
   - `console.error(...)` → a one-line *summary* ("wrote N hints to <path>") to
     **stderr**.
   - `stdout` is **empty**. No `hookSpecificOutput.additionalContext` JSON.

   SessionStart attachment capture for the discoverability hook (ts 04:18:17.504):
   ```
   stdout:  ''
   stderr:  '[session-start] wrote 16 discoverability + 9 process + … hints to …/.claude/session-context.json\n'
   content: ''
   ```
   - Hook `stdout` is the injection channel (see sibling `session-init.cjs`,
     whose `console.log` stdout *is* surfaced as agent context). Empty stdout →
     nothing injected.
   - Hook `stderr` is captured into the attachment record but is **not** injected
     as agent context. (In this session I likewise do not see the discoverability
     hook's stderr surfaced — only `session-init`'s stdout.)
   - The summary line carries *no hint content* — it only says "hints are in a
     file." Row #1's actual text never appears in anything the agent reads.

3. **Agent reads the sidecar** → ❌ does not happen. `grep` for readers of
   `session-context.json` returns only the test file
   (`session-start-inject-discoverability.test.cjs`). The journal itself
   concedes: *"There is currently no in-process consumer (the sidecar is more of
   an audit artifact than an active reader)."* In session 4760ee34 the 5
   occurrences of the string `session-context.json` are all incidental (the hook
   stderr, the session-init persisted-output path, a commit subject) — **the
   agent never opened the sidecar**, so it never saw row #1.

### Why the silent-degrade fix could not help

The fix changed what the hook writes to the *file* (`*_source` flags, `*_error`
strings) and what it prints to *stderr* (a `DEGRADED` line). Both are audit
surfaces. Neither is an agent-context surface. So:

- Happy path (`source: "core"`, 9 hints present): agent still sees nothing.
- Degraded path (`source: "fallback"`): agent still sees nothing — and the
  `DEGRADED` stderr line is not injected either.

The journal's own "Why it matters now" already names the failure class — *"tool
result is anchored but not surfaced"* — and notes row #1 is *"a cognitive hint
that only fires if the agent reads the sidecar."* With no reader, it never fires.

### Verified sequence in session 4760ee34 (UTC)

| ts | event |
|----|-------|
| 04:18:17.504 | SessionStart hook ran, **succeeded**: "wrote 16 discoverability + 9 process + … hints" (stderr-only; stdout empty) |
| 04:18:17.514 | `session-init.cjs` ran; its stdout *was* surfaced (the "Session startup…" block) — but it does not read the sidecar |
| 04:18:51 | agent began work; **never Read `.claude/session-context.json`** |
| 04:25:31 | `pnpm test 2>&1 \| grep -E "^(FAIL\|PASS) "` ← row #1 violation |
| 04:26:01 | `pnpm test 2>&1 \| grep -E "FAIL "` ← violation |
| 04:32:26 | `pnpm test 2>&1 \| grep -E "^ FAIL\|^ Test Files\|^ Tests"` ← violation |
| 04:36:11 | same pattern again ← violation |

The violations began 7 minutes after a *successful* injection that injected
nothing into context.

## Root Cause

`session-start-inject-discoverability.cjs` writes hint **content** only to a
sidecar file and emits a content-less **summary** to stderr. It emits **nothing
to stdout** and uses **no `hookSpecificOutput.additionalContext`** injection.
SessionStart hook `stdout` is the agent-context injection channel (proven by
sibling `session-init.cjs`); stderr and the sidecar file are not consumed by
the agent. Therefore PROCESS_HINTS row #1 — and all 9 process hints — are
populated but never delivered. The 260715-1116 fix hardened the *populated*
sidecar against silent degrade; it left the *delivery* leg unbuilt.

This is the canonical anchored-but-not-surfaced defect: the rule exists, the
sidecar exists, the hook succeeds, the agent never sees them.

## Recommendations

**Primary fix** — make the hook inject hint content via stdout, the same channel
`session-init.cjs` already uses successfully. Two viable shapes:

- **(A) Structured (preferred):** emit
  `{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": <text> } }`
  to stdout, mirroring `subagent-init.cjs` / `team-context-inject.cjs` (which
  use `SubagentStart`). Keeps the file write + stderr summary as-is; adds
  stdout injection.
- **(B) Plain stdout:** `console.log(<text>)` as `session-init.cjs` does.

Content choice (decision for operator — context-budget tradeoff):
- Inject **all 9 process hints** (highest fidelity; ~sidecar is 17 KB — risk of
  persisted-and-truncated treatment like `session-init`'s 41 KB output got).
- Inject **only row #1** (the test-parsing rule) — smallest, targets the
  observed regression directly; but other rows remain un-surfaced.
- Inject a **compact index** ("N process hints in `.claude/session-context.json`
  — read it before parsing test output") that pushes the agent to open the file.
  Cheapest, but still relies on the agent voluntarily reading the sidecar.

**Guard before claiming done** — verify injection end-to-end:
1. Add a forced-injection smoke test asserting the hook's stdout contains
   `additionalContext` (or the row #1 text) on the happy path, and a degraded
   marker on the `SESSION_START_FORCE_HINTS_FAIL=1` path.
2. Start a fresh session and confirm row #1's text appears in the surfaced
   SessionStart context (not just in the attachment record's stderr).

**Do NOT** assume the 260715-1116 fix resolved the behavioral regression. It
resolved observability of *loader failure*, not *hint delivery*. Until the
stdout-injection leg ships, row #1 is effectively unenforced for any agent that
does not manually open the sidecar.

## Open questions

1. Does `SessionStart` accept `hookSpecificOutput.additionalContext` exactly as
   `SubagentStart` does? Sibling hooks prove the `SubagentStart` shape; the
   `SessionStart` variant should be confirmed with a one-line smoke test before
   relying on it. (Plain-stdout fallback (B) is known-working via
   `session-init.cjs` and is the safe default.)
2. Context-budget: is full-hint injection acceptable, or only row #1 / a compact
   index? This is a user decision (context cost vs. enforcement fidelity).
3. Should the sidecar remain as an audit artifact, or should a reader be added
   so non-SessionStart entry points (resume, compact) also get the hints?

## Evidence

- Hook source: `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs:152-203` (empty stdout, stderr summary only).
- Sibling injection pattern: `~/.claude/hooks/subagent-init.cjs:206-214`, `~/.claude/hooks/team-context-inject.cjs:147-153` (`hookSpecificOutput.additionalContext`).
- Surfaced-stdout proof: `~/.claude/hooks/session-init.cjs:286` (`console.log` → surfaced as "Session startup…").
- No sidecar reader: `grep -rn "session-context.json"` → only the test file.
- Journal concession: `docs/journals/journal-260715-1116-hook-silent-degrade-fix.md:111-115` ("no in-process consumer… audit artifact").
- Failing session transcript: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/4760ee34-d2ec-45a6-9181-f411b42fb521.jsonl` — hook success at 04:18:17.504 (stderr-only), first grep-violation at 04:25:31, no sidecar Read.