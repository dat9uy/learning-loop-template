# Brainstorm Report — The Slow Test Suite & The Agent Loop

**Date:** 2026-06-21
**Operator:** datguy
**Trigger finding:** `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m` (active, escalate)
**Related finding:** `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` (operator-cited)
**Session context:** `caa56a15-2db7-4a83-9ec3-8ab26a8de2ff` — agent entered 1100-read / 190-TaskUpdate loop after storage tests passed
**Purpose:** Align on the actual problem before any fix. No solution in this report.
**Output requested:** Markdown only.

---

## TL;DR (one sentence)

The "10-minute test suite" finding is evidence of a **two-layer fragility** — (1) the agent has no way to observe incremental test progress, and (2) the agent itself has no defense against degenerate tool-call loops when given long-running commands with sparse feedback — and the operator has been using the slowness as a deliberate catch-mechanism for findings that only surface in E2E, so any fix must preserve that signal.

---

## 1. What the finding says (the stated problem)

The finding filed in meta-state on 2026-06-20:

> The full pnpm test glob (11 directories, 1100+ tests) takes 10+ minutes wall-clock and buffers spec-reporter output until completion. When an agent runs it via `pnpm test 2>&1 | tail -60`, the agent sees no progress, makes wrong assumptions about which test is running, and can enter degenerate loops: 1100+ redundant file reads followed by 190 identical TaskUpdate calls in 150 seconds.

Recommended fix (from the finding):
> Per-namespace test runs with `--test-reporter=spec` + 30s timeouts, capturing each namespace to a separate log file. Pre-commit hooks that block on full pnpm test should be relaxed to per-namespace gates, or removed in favor of CI.

`subtype: e2e-test-output-overflow` — the finding is filed under a **symptom classification**, not a cause.

---

## 2. Why we are not jumping to the recommended fix

The operator's correction (2026-06-21):

> "some error only appear when running e2e test sometime like `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` could only be catched by we see that the test suite take too long -> investigate. test:fast would be faster, but risker."

Translation:
- The 10-minute run is **not pure waste**. It is the catch mechanism for findings like `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` — fingerprint drift findings that only surface when the full E2E runs.
- A `test:fast` subset (e.g., unit tests only) would **silently miss** these findings.
- The "degenerate agent loop" is **the cost the operator accepts** to keep the catch mechanism.
- The recommended fix in the finding ("relax pre-commit to per-namespace gates") directly defeats the catch mechanism.

This means the finding's recommended fix contradicts operator intent. Per the meta-state rules ("Do not silently undo explicit user decisions"), we need a different approach.

---

## 3. Problem-first inversion: what is the actual problem?

The finding prescribes a runner-level fix. But the operator's correction suggests the runner is fine (it's the catch mechanism). The actual problem is **upstream** of the runner — at the agent↔test-runner interface and at the agent itself.

### Framing A/B — Agent observability gap (combined)

**A**: The agent runs `pnpm test 2>&1 | tail -60` and sees no output for 10 minutes. It cannot distinguish "tests are running" from "tests are hung" from "tests have failed and exited."
**B**: The spec reporter is designed for a human at a terminal who wants a final summary. The agent needs incremental checkpoints, not a final summary.

**Root problem:** The agent's input contract with the test runner is broken. The runner emits a stream-of-events (per-test pass/fail) that humans can ignore; the agent cannot ignore the absence of events and treats silence as a signal to do something.

**Evidence:**
- `pnpm test 2>&1 | tail -60` produces 0 bytes of output for 10+ minutes (verified: `bew1fgxm5.output` was 0 bytes after several minutes).
- `node --test` runs with `--test-isolation=process` (Node 24 default) + default spec reporter + no `--test-timeout`. Each test file runs in its own process, but stdout is held until the parent exits.
- The 7 directories that contain test files (107 + 2 + 4 + 1 + 3 + 11 + 8 = 136 test files) all run in a single process tree.

**Why A and B are merged:** A is the user-visible symptom; B is the structural cause. Both point to the same fix territory: the runner↔agent interface.

### Framing D — Agent has no loop protection

**D**: Even with a 10-minute test, a healthy agent should know: "tests are running, I will wait." The fact that session `caa56a15` entered a 1100-read / 190-TaskUpdate loop = the agent itself is the fragile thing, not the test runner.

**Root problem:** The agent has no defenses against degenerate tool-call loops when given a long-running command with sparse feedback.

**Evidence:**
- Session `caa56a15`: 1100+ redundant reads of 4 specific files (`MCP SDK types.js` × 592, `create-loop-workflow.js` × 418, `workflow-storage-round-trip.js` × 99, `workflow-storage-read.js` × 4) with no interleaving `Edit`/`Write`/`Bash`. Classic "stuck re-reading" pattern — the model kept hoping to spot something new.
- Same session: 190 identical `TaskUpdate(taskId:5, status:completed)` calls in 150 seconds (~1.3/sec). TaskUpdate returned "Updated task #5" each time without a "no-change" signal, so the loop never broke.

**Why D is the deeper problem:** D generalizes. Any long-running command with sparse feedback (vendor API install, container build, deploy, file copy) could trigger the same loop. The test runner is just the trigger; the agent is the bug.

> **Note on related work (added 2026-06-21 post-resolution):** A sibling failure on the same `pnpm test` surface — `meta-260621T1743Z` (hand-rolled MCP stdio JSON-RPC parsers deadlocking the pre-commit run) — was resolved by `plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/` via SDK conversion + 30s test timeout + memory storage default. That fix removes a *binary* failure mode (test hang) but does not address the *continuous* failure modes this brainstorm targets: the 10-min silent output (Layer 1) and the agent's lack of loop defense (Layer 2). The forcing-function trade-off and the Plan A + Plan B direction remain unchanged.

### The two-layer model (A/B + D)

```
+--------------------------------------------------+
| LAYER 1 (runner ↔ agent interface)               |
|   Symptom: silent for 10 min, then wall of text  |
|   Fix territory: reporter format, output stream, |
|                  agent-visible progress signals  |
+--------------------------------------------------+
                       |
                       v
+--------------------------------------------------+
| LAYER 2 (agent itself)                           |
|   Symptom: degenerate tool-call loops            |
|   Fix territory: idempotency signals,            |
|                  read-budget guards,             |
|                  stuck-detection,                |
|                  agent prompt engineering       |
+--------------------------------------------------+
```

The finding is filed at Layer 1. The operator's correction pushes the problem up to Layer 2.

---

## 4. Stakeholders (often missing in these debates)

| Stakeholder | Current effect | Hidden cost |
|---|---|---|
| **Agent (Claude Code subagent)** | Sees empty output, enters loops | Pays the cognitive cost of "what is happening"; wastes context on 1100+ redundant reads |
| **Human operator (datguy)** | Pre-commit blocks 10 min | Pays the time cost; uses slowness as a deliberate forcing function for drift findings |
| **Cold-session test** | One of 11 globs | Affected by any change to the runner topology |
| **Meta-state registry** | Holds 1 escalate-severity finding | Will need resolution evidence; mis-categorization risk |
| **Pre-commit hook** | Blocks on full run | Failure mode is "developer stops committing locally" |
| **CI** | Does not exist in this project | All enforcement is local; no parallel safety net |
| **The loop's self-model** | Needs grounded evidence | Agent cannot ground observations if it cannot see test output |
| **Future agent (3 days from now)** | Will read this finding via cold-session discoverability | Will pattern-match on the recommended fix, not the operator's actual trade-off |
| **`kimi-for-coding` model** (per session metadata) | Was invoked during the TaskUpdate loop | Model-level behavior may have contributed; needs investigation |

---

## 5. Operator trade-off (the one the message surfaced)

| Option | Speed | Catches drift findings | Breaks agent on long runs | Operator-acceptable? |
|---|---|---|---|---|
| **Full suite, current** | slow (10 min) | yes | yes (loops) | yes (deliberate forcing function) |
| **test:fast subset** | fast (<30s) | **no** (drift slips through) | no | **no** (per operator message) |
| **Full suite + streaming output** | slow (10 min) | yes | no (agent sees progress) | likely yes (preserves forcing function, fixes agent) |
| **Full suite + streaming + loop guard** | slow (10 min) | yes | no | likely yes (defense in depth) |
| **Move full suite to CI, drop pre-commit** | fast locally | yes (in CI) | no (pre-commit doesn't block) | unknown — needs operator input |
| **Test pyramid restructure** | depends | yes | no | unknown — multi-plan scope |

**Key constraint from operator message:** "test:fast would be faster, but risker." → the forcing function must be preserved. Any fix that loses the slow-test-as-signal is rejected.

---

## 6. Scope of this brainstorm (per operator decision)

**In scope:**
- This specific finding (`meta-260620T2108Z-the-full-pnpm-test-glob-...`)
- The agent-degenerate-loop class (Framing D generalized) — same shape, any trigger
- Layer 1 (agent↔runner interface) and Layer 2 (agent itself) — both
- Trade-off preservation: the slow-test-as-catch-mechanism must survive

**Out of scope:**
- Pre-commit / CI boundary redesign (Framing C) — separate plan if pursued
- Test pyramid restructuring (Framing E) — multi-plan scope, separate
- Test count reduction (subset of E) — not the focus
- Finding recategorization (Framing G) — only if the fix demands it

---

## 7. Open questions (for operator input before any solution talk)

These are the questions whose answers constrain which Layer 1 and Layer 2 fixes are viable:

1. **Layer 1 fix depth.** Output streaming alone (e.g., `--test-reporter=spec` with `tee` to a log file the agent can `tail -f`)? Or full reporter redesign (e.g., structured JSON events to a named pipe the agent subscribes to)? Or neither (let the operator catch the loop manually)?

2. **Layer 2 fix depth.** Defensive agent prompts ("when a bash command returns no output for >2 min, do not re-read files — wait or re-run the command with `--test-reporter=spec`")? Or infrastructure-level (TaskUpdate idempotency signals, read-budget guard in the orchestrator)? Or both?

3. **Slowness preservation.** Is 10 minutes the right forcing function? Or should the slow-test-as-signal be made explicit (e.g., a per-namespace progress bar that's *visible to the agent* but not optimized away)? This is a design question about what the operator wants the agent to learn from running the test.

4. **Pre-commit blocking.** Is "10-minute pre-commit" an acceptable cost given the catch mechanism? Or should pre-commit drop to a fast subset (e.g., unit tests only) and the full suite move to CI? This is the Framing C question — explicitly out of scope for THIS brainstorm but worth noting.

5. **`kimi-for-coding` model.** The session metadata for `caa56a15` indicates a model other than the main one was invoked during the TaskUpdate loop. Was that a model-level failure (kimi emits TaskUpdate as a "safe" no-op) or a tool-level failure (TaskUpdate returned the same result without a no-change signal)? If model-level, the fix is "don't use that model for storage tasks." If tool-level, the fix is "make TaskUpdate return `{changed: false, already: Y}` when status is unchanged."

6. **Finding recategorization.** Should `subtype: e2e-test-output-overflow` be changed to a cause-level subtype (e.g., `agent-degenerate-loop` or `runner-interface-fragility`)? This affects how the next cold-session agent interprets the finding.

---

## 8. Constraints (already established)

From the codebase, the operator's history, and meta-state rules:

- **No silent reversals of operator decisions.** Slowness preservation is decided. Don't propose a fix that loses it.
- **Cite code, not markdown.** The fix (if any) must be pointable at `package.json`, a script file, an agent prompt, or a tool — not a doc.
- **Mechanism checks are required for findings with `mechanism_check: true`.** The original finding has `mechanism_check: true` and `evidence_code_ref: package.json:7` (the `imports` field, not the test command — note the citation is to the file, not the test line; this is fragile and may need to be updated if the fix changes the file structure).
- **Public contracts: `pnpm test` must still exist and still run the full suite.** Anything that changes this is a breaking change to all downstream consumers (CI, docs, future cold-session agents).
- **Pre-commit hook is currently `pnpm test`.** Per operator, this should not be relaxed without explicit approval.
- **`simple-git-hooks`** is the chosen git-hook framework; don't introduce husky or another tool.
- **Project has no CI.** Pre-commit is the only automated gate. If pre-commit stays slow, there is no parallel safety net for accidental local bypasses.

---

## 9. What is explicitly NOT in this report

- No recommended fix. The user asked for problem-first alignment. Solutions are for the next phase.
- No code changes.
- No plan structure. The plan file from the prior turn has been scrapped (the user said "scrap the plan").
- No resolution of the meta-state finding. Resolution requires a fix, which is downstream of this report.
- No claim that one framing is "right." All framings are evidence; the operator decides which is dominant.

---

## 10. What comes next (after operator review of this report)

Pending operator input on the open questions in §7, the natural next step is:
- If the operator wants to fix Layer 1 + Layer 2 now → spawn a `/ck:plan` (default mode) on the agreed fix shape
- If the operator wants to recategorize the finding first → file a `meta_state_patch` to update `subtype` and `description` to reflect the cause-level diagnosis
- If the operator wants to defer the fix → leave the finding active, write a journal entry recording the operator's decision
- If the operator wants to discuss further → ask another round of questions; this report is not final

The user's prompt was "scrap the plan, let's do the brainstorm report so that we on the same page of what's the problem first." This report is the alignment artifact. Once the operator confirms "yes, this is the problem" (with or without changes to the open questions), the next phase can begin.

---

## 11. Direction for 2 plans ahead (operator decision, 2026-06-21)

After the brainstorm + `/ck:predict` 5-persona + `--chain probe` cycle, the operator
chose a 2-plan approach. The probes harvested in the predict are split across the
two plans by their dependency role: Plan A is data-gathering (probes whose answers
constrain Plan B's design); Plan B is the design + fix (using the data + closing
the remaining probes as acceptance criteria).

### Plan A — Data gathering: close the blocking probes (1, 4, 7)

**Scope:** pure read-only investigation. No code changes. No meta-state mutations.

**Probes to close:**

1. **Probe 1 (Runtime parity).** Does the Mastra Agent runtime invoke `pnpm test` via
   subprocess (Bash-equivalent) or via a different mechanism (workflow step,
   in-process call)? Read the Mastra Agent's test-invocation path in
   `tools/learning-loop-mastra/`. Trace the call chain. Verify the runner's stdout
   (with the proposed prefix) is visible to the Mastra Agent.

4. **Probe 4 (Existing pnpm test consumers).** Run
   `grep -r "pnpm test" --exclude-dir=node_modules .` to enumerate every consumer.
   For each, classify: (a) does the consumer care about the prefix line? (b) would
   the consumer break if a `[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL`
   line appeared? (c) does the consumer's parser fail on a non-spec-reporter line?

7. **Probe 7 (Fingerprint-drift dependency).** Read
   `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift`'s
   `evidence_code_ref` and `verification.steps`. Determine: does the fingerprint
   drift finding actually require the FULL E2E suite, or just one specific
   namespace (e.g., `mcp` or `mastra`)? This determines whether the operator's
   "slow test is the signal" claim is at the full-suite level or per-namespace.

**Deliverable:** a short data-gathering report (target: <300 lines) at
`plans/<date>-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` with the three probe answers
and any new constraints discovered in the process.

**Acceptance criteria:**
- Each of the 3 probes has a concrete answer (not "probably" or "unclear")
- Each answer cites the file:line evidence that grounds it
- Any new constraints discovered are added back to the brainstorm report's §7

**Out of scope for Plan A:** design, code, meta-state changes, fix proposal.

### Plan B — Fix design + implementation

**Scope:** design the Layer 1 + Layer 2 fix using Plan A's data. Implement,
verify, and resolve the meta-state finding.

**Probes to close as acceptance criteria:**
- Probe 2 (Claude Code system prompt location)
- Probe 3 (Mastra Agent system prompt location)
- Probe 5 (operator signal mechanism)
- Probe 6 (per-namespace timing — runs as part of Plan B's verification)
- Probe 8 (cold-session test impact)
- Probe 9 (regression test for the fix)
- Probe 10 (Layer 2 prompt placement)

**Pre-conditions for Plan B to start:** Plan A's report exists with all 3 probes
closed. Without Plan A, Plan B would be designing in the dark.

**Design shape (subject to Plan A's data):**
- Layer 1 (runner): explicit prefix + per-namespace log files + drop 3 dead globs
- Layer 2 (agent): system-prompt teaching for both Claude Code and Mastra Agent
- Re-categorize the finding from `e2e-test-output-overflow` to a cause-level subtype

**Operator trade-off preservation (locked from this brainstorm):**
- 10-min slowness stays
- Pre-commit stays on `pnpm test` (full suite)
- `test:fast` is developer convenience only, not in pre-commit
- TaskUpdate selectivity is a separate Layer 2-general fix (out of scope)

---

## 12. Plan A data-gathering results

Probe answers are now closed in `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` — see that report for the concrete file:line evidence and the new constraints added back to §7.

## Unresolved questions (per development-rules.md)

These remain after the 2-plan direction was added:

1. **kimi-for-coding model behavior.** Was the TaskUpdate loop in `caa56a15` model-induced?
   Plan A does not close this; it's a separate investigation. If model-induced, the Layer 2
   fix changes shape (don't dispatch storage tasks to kimi). If tool-induced (TaskUpdate
   lied about no-change), the fix is "make TaskUpdate honest" (Layer 2 general fix, out
   of scope for this round per the vnstock analogy).
2. **PR#8 dependency.** Per operator decision, fix before PR#8. Plan A is the next
   deliverable; PR#8 review happens after Plan A and Plan B complete.
3. **Plan A's three probes may surface new constraints** that change Plan B's design.
   The brainstorm's §7 is a snapshot; it will be re-evaluated after Plan A's data is in.

### Resolved by the brainstorm + ck:predict + chain probe (closed)

- ~~Layer 1 vs Layer 2 weighting~~ → Both layers, with Layer 1 explicit prefix + per-namespace logs and Layer 2 system-prompt teaching. Recategorize the finding.
- ~~Is 10 min the right forcing-function cost~~ → Preserve 10 min as-is. Make the signal explicit via prefix, do not shorten.
- ~~PR#8 dependency resolution~~ → Fix before PR#8 (per operator decision in the chain-probe Q&A round).

---

**End of report.** Awaiting operator review.
