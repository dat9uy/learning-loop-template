# Journal — Hook Silent-Degrade Fix (260715-1116)

## What broke

The SessionStart hook `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs`
writes discoverability + process hints + stale-dispatch hints + change-log
gap hints to `.claude/session-context.json`. Its loaders (`loadCoreHints`,
`loadRegistry`, `loadStaleDispatchHints`, `loadChangeLogGapHints`) all use
try/catch that returns empty shapes on failure.

Result: when the hook fires under SessionStart conditions and an inner
loader fails, the sidecar is written with all hint arrays empty AND no
signal that the loaders failed. The downstream reader cannot distinguish
"no hints configured" from "loader failed." The agent, in turn, has no
behavioral signal that PROCESS_HINTS row #1 (the test-parsing rule)
exists — and reverted to `tail | grep` patterns 4 times in session
260715-1100, exactly what row #1 forbids:

> "Parse once via `bash tools/scripts/vitest-failures.sh` ... Do NOT grep
> raw vitest stdout, re-read passing tests, or hand-write `python -c` /
> `node -e` to parse the JSON."

The prior session (260715-1010) made the same regression. Both sessions
verified the sidecar mid-session and found it empty. Both sessions then
violated row #1.

## Root cause

The catch blocks at lines 38-41, 53-55, 80-82, 93-96, 110-113 of the
hook swallowed errors via `console.error` to stderr (which is captured
by the harness but not surfaced in the agent's UI by default) and
returned the empty shape. The fatal-catch path at lines 162-176 does the
same with `process.exit(0)`. From the agent's perspective, every failure
mode looked identical to a successful run with no hints configured.

The hook CAN populate correctly — running `node tools/learning-loop-mastra/
hooks/universal/session-start-inject-discoverability.cjs` directly
produced `[session-start] wrote 16 discoverability + 9 process + 5
stale-dispatch + 3 change-log-gap hints ...`. So this is a harness-vs-direct
invocation divergence, not a logic bug. The exact trigger (env var
stripping? require resolution? CWD?) was not reproduced.

## Why it matters now

PROCESS_HINTS row #1 was added in PR #57 (commit `9f85828 fix(loop):
rewrite PROCESS_HINTS row #1 + parity mirror`) specifically to formalize
the test-parsing convention. The hook's job is to surface that hint (and
7 others) at session start so the agent reads the sidecar and follows
the rule. The silent-degrade breaks that contract: the sidecar exists,
the row #1 rule exists, but the agent never sees them.

This is the canonical "tool result is anchored but not surfaced" failure
class. Row #1 is not a tool-result-anchored rule (no MCP tool fires it);
it's a cognitive hint that only fires if the agent reads the sidecar.
With the sidecar empty, nothing pulls the agent back to grep + tail.

## The fix

Each loader's catch path now returns `{ value, source: 'fallback', error: <msg> }`.
`main()` writes the `*_source` flags + `*_error` strings into the sidecar
so downstream readers + audits can detect the degradation. The fatal-catch
path sets `*_source='fatal'` so a downstream reader can distinguish fatal-hook-fail
from per-loader-fail. A `DEGRADED loaders: <list>` line is emitted to
stderr when any loader degrades, so the harness surfaces the signal.

```js
// loadCoreHints success path returns:
{
  discoverability_hints: [...16 items...],
  discoverability_hints_source: "core",
  process_hints: [...9 items...],
  process_hints_source: "core",
}
// failure path returns:
{
  discoverability_hints: [],
  discoverability_hints_source: "fallback",
  discoverability_hints_error: "<msg>",
  process_hints: [],
  process_hints_source: "fallback",
  process_hints_error: "<msg>",
}
```

The sidecar gains 6 new optional keys (`discoverability_hints_source`,
`process_hints_source`, `registry_source`, `*_error`). Existing consumers
that read the hint arrays continue to work; new consumers can opt into
the source flags.

## Verification

3 new tests added (full suite 1914 → 1917 tests):

- `*_source=fallback flags when an inner loader fails` — forces
  `SESSION_START_FORCE_HINTS_FAIL=1`; asserts sidecar carries
  `process_hints_source='fallback'` + captured error + DEGRADED stderr line.
- `*_source=fatal (not fallback)` — forces the outer fatal path; asserts
  all three source flags are `'fatal'`, not `'fallback'`.
- `*_source=core on every loader` — happy-path lock-in; asserts no DEGRADED
  line on stderr.

Test forcing mechanism is two new env vars:
- `SESSION_START_FORCE_HINTS_FAIL=1` → loadCoreHints throws
- `SESSION_START_FORCE_REGISTRY_FAIL=1` → loadRegistry throws

These are guarded behind explicit env-var checks; the hook's normal
behavior is unchanged.

## Blast radius

**Affected:** consumers of `.claude/session-context.json`. There is
currently no in-process consumer (the sidecar is more of an audit
artifact than an active reader), so the impact is bounded. The hook's
session-start surfacing still works the same way; the only change is
that the sidecar shape gains optional metadata keys.

**Not affected:** the SessionStart hook contract (`injected_at`,
discoverability_hints array, process_hints array, stale_dispatch_hints,
change_log_gap_hints). All five core keys remain present and shaped
identically. The new keys are additive.

**Pre-existing tests:** both `session-start-inject-discoverability.test.cjs`
tests still pass — the original assertions (Array.isArray,
length > 0, etc.) are preserved by the contract.

## What's NOT fixed

The root cause of why the hook fails under SessionStart invocation but
succeeds when run directly is still unidentified. The fix here makes
the failure visible; it doesn't eliminate it. To find the trigger:

1. Run the hook via the harness and capture stderr — should now show
   `DEGRADED loaders: <list>` with the actual error message.
2. Inspect the stderr message — likely points at `require()` resolution
   or an env-var strip.
3. Apply the targeted fix once the trigger is known.

This is a follow-up task; the current fix prevents the same bug class
from recurring undetected regardless of the underlying cause.

## Related issues

- PR #57 added the row #1 rule that this fix makes observable.
- Sessions 260715-1010 and 260715-1100 both violated row #1 due to the
  silent-degrade. After this fix, the agent will see `*_source=fallback`
  in the sidecar (or DEGRADED on stderr) and can decide whether to
  re-invoke the hook manually or escalate to the operator.
- The fix does NOT touch row #1's content — only the surfacing path.