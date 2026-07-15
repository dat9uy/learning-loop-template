# Debug — State-2 Test-Parse Consumption Non-Determinism (session a014f8db)

## Question

After the hint-injection work around commit `8d49bfc`, session
`a014f8db-c329-4361-840a-1add595e009b` still behaves randomly: the agent
reliably uses `--bail=1` but inconsistently "exports the test as JSON."
Is this an injection problem, or a State-2 limitation (per
`docs/philosophy.md`) that must be pushed to State-3?

## Verdict

**State-2 limitation on the consumption side. Not an injection defect.**
Injection is confirmed working in that session. The non-determinism is
exactly the signature `docs/philosophy.md` ascribes to State-2:
deterministic injection + agentic consumption. The mechanical part of the
discipline is a legitimate State-3 candidate.

## Evidence

### 1. `8d49bfc` is docs-only — it is not the injection fix

`git show 8d49bfc --stat`: three files, all under `docs/journals/` and
`plans/reports/`. It *documents* the silent-degrade fix; it does not
change injection logic. The actual injection changes are:

- **Silent-degrade observability fix** (described in the journal): loader
  catch blocks now emit `*_source` / `*_error` flags so degradation is
  visible. The journal's own "What's NOT fixed" section states: *"The root
  cause of why the hook fails under SessionStart invocation but succeeds
  when run directly is still unidentified. The fix here makes the failure
  visible; it doesn't eliminate it."* So 8d49bfc's line of work is
  observability, not injection reliability.
- **Inline injection hook** `a46a316` (`feat(hooks): inject loop hints at
  SessionStart via additionalContext`): the companion
  `session-start-inject-process-hints.cjs` pushes PROCESS_HINTS row #1
  directly into `additionalContext` (the system-reminder channel) instead
  of only writing the sidecar. This is the real reliability win.

### 2. Injection was present in session a014f8db

Grep of the session jsonl for the inline-injection sentinel
`"Loop process hints (injected at session start"` → count = 2. Row #1
(the test-parsing rule) reached the model. Injection is **not** the
failure mode for this session.

Decisive corollary: if injection were broken, the agent would miss row #1
*wholesale* — neither `--bail=1` nor the JSON-parse discipline. Instead
`--bail=1` is reliably applied and only the parse discipline drifts. That
asymmetry rules out injection and points at consumption.

### 3. What the session actually did (from the jsonl)

- `vitest run --bail=1 <path>` — used consistently. ✓ matches "remembers --bail=1"
- `vitest run --bail=1 <path> 2>&1 | tail -N` (variants: tail -10/-15/-25/-30/-50) and `| grep -A 2` — **pipes raw vitest stdout to tail/grep**, which row #1 explicitly forbids ("Do NOT grep raw vitest stdout").
- `pnpm test 2>&1 | tail -10` — same raw-stdout pattern.
- `bash tools/scripts/vitest-failures.sh 2>&1 | tail -100 | head -60/-50/-40` — used the script (✓ the parse path) but then tailed/headed its output.

So the agent oscillated between the sanctioned parse path
(`vitest-failures.sh`) and the forbidden raw-stdout path (`| tail` / `|
grep`). This matches "sometimes remembers, sometimes not."

### 4. The JSON export is already deterministic by config — the agent doesn't need to "remember" it

`vitest.config.mjs`:
```js
reporters: ["default", "json"],
outputFile: { json: ".test-logs/vitest-results.json" },
```
Every `vitest run` (full or `--bail=1 <path>`) already writes
`.test-logs/vitest-results.json`. The remaining non-determinism is not
about *producing* the JSON — it is about whether the agent *consults* it
(via `vitest-failures.sh`) vs. reads the raw stdout that is sitting
right in front of it.

## Root Cause (consumption side, not injection)

Row #1 asks the model to do something counter-intuitive under load:
*run a command, then do NOT read the output it just printed — instead
invoke a separate script over a JSON file.* `--bail=1` is one short, salient
flag (stable). "Don't read the output in front of you; parse this other
artifact instead" is a multi-clause, friction-laden instruction
(non-stable). `docs/philosophy.md` defines this exact regime as State-2:

> "State-2 — wired: deterministic injection (a hook/gate surfaces it at
> the right moment), agentic consumption (model reads + decides)."
> "State-2 is not a waystation toward state-3. Content that needs
> judgment stays here permanently."

State-2 consumption is non-deterministic **by construction**. The model is
a probabilistic interpreter; "sometimes remembers" is its expected
behavior, not a bug to patch with more prose. Three sessions
(260715-1010, 260715-1100 per the silent-degrade journal, and now
a014f8db) have now hit the same drift — clearing the philosophy-doc bar
of "promote to a rule when the pattern recurs."

## Do we need State-3?

For the **mechanical** part of this discipline, yes — and it qualifies.
`docs/philosophy.md`: State-3 = "deterministic consumption; a rule/gate
fires without model judgment," and the migration bar is "smallest-first,
lowest-risk-first." The JSON-parse discipline is mechanical (no judgment),
so unlike content that "needs judgment [and] stays here permanently," it
is a legitimate State-3 candidate.

State-3 options (operator decision — this is a constraint on the agent,
so it is the operator's call, not mine):

1. **Wrapper command (cleanest).** Add `pnpm test:iter` = `vitest run
   --bail=1` then auto-invoke `vitest-failures.sh` and print only the
   parsed summary. The agent calls one command and never sees raw stdout.
   Nothing to remember → deterministic consumption. The config already
   guarantees the JSON exists, so the wrapper just reads it.
2. **Bash-gate rule (block path).** Add a regex rule to
   `tools/learning-loop-mastra/hooks/universal/bash-gate.js` matching
   `vitest run .* | (tail|grep)` and `pnpm test .* | (tail|grep)`,
   redirecting to the wrapper or `vitest-failures.sh`. Deterministic
   enforcement.
3. **Both** — wrapper + gate rule pointing at the wrapper.

Caveat: per `CLAUDE.md`, the gate's default mode is `warn`. A `warn`-mode
rule is **not** full State-3 (the agent can ignore the warning and stay
State-2). True State-3 requires `escalate` (block) for that specific
rule. That escalation is an operator decision.

## What is NOT the answer

- More hint prose / rewording row #1. The hint already reaches the agent.
  Rewording addresses injection-quality, not consumption-determinism.
  philosophy.md is explicit that State-2 consumption cannot be made
  reliable by re-prose-ing.
- The silent-degrade observability fix (8d49bfc lineage). That fixed
  *visibility* of loader failure, which is a real but separate concern.
  It does not touch consumption-side non-determinism.

## Unresolved questions

1. Should the operator approve a wrapper (`pnpm test:iter`) and/or a
   bash-gate rule for `vitest run | tail/grep`? (Operator decision —
   constrains the agent.)
2. If a gate rule is added, should it run in `escalate` (true State-3)
   or `warn` (State-2 with a nudge)? Escalate is the only mode that
   makes consumption deterministic.
3. Should the same treatment apply to the `pnpm test 2>&1 | tail` raw-
   stdout pattern, or only to the iterate/`--bail=1` path?