---
phase: 1
title: "Probe 1: Runtime Parity — Mastra Agent vs direct pnpm test"
status: completed
priority: P2
dependencies: []
---

# Phase 1: Probe 1 — Runtime Parity

## Overview

Determine whether the Mastra Agent invokes `pnpm test` via a subprocess (Bash-equivalent, agent sees full stdout stream) or via a different mechanism (workflow step, in-process call, batched). This constrains Plan B's Layer 1 fix shape: if the Mastra Agent sees batched output, the per-namespace streaming approach won't help it; if it sees a stream, the prefix-line approach works for both surfaces.

## Why This Probe Is Blocking

Plan B's Layer 1 design (`[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL` prefix per the brainstorm) assumes the runner's stdout is observable by the agent. If the Mastra Agent wraps `pnpm test` in a workflow that buffers output, the prefix-line approach is invisible to it. Probe 1 settles this.

## Requirements

- Functional: trace the call chain from "Mastra Agent wants to run the test suite" to the actual process invocation; identify where stdout goes.
- Non-functional: read-only. Do not modify any source files. Do not invoke `pnpm test` (the run is 10 min and not needed for this probe).

## Related Code Files (read-only)

- `tools/learning-loop-mastra/server.js` — primary entry point; check for `Bash` tool, `child_process`, `exec`, `spawn` usage
- `tools/learning-loop-mastra/create-loop-workflow.js` — check for test-invocation hooks
- `tools/learning-loop-mastra/workflows/workflow-runtime-probe.js` — the `runtime_probe` workflow is a candidate for test invocation; check what it actually invokes
- `tools/learning-loop-mastra/workflows/workflow-prepare-runtime-request.js` — approval flow for runtime commands; check whether it gates `pnpm test`
- `tools/learning-loop-mastra/agent-manifest.json` — declares the Mastra Agent's tools; check if a `Bash` tool is declared
- `tools/learning-loop-mastra/workflows-manifest.json` — list of available workflows
- `.factory/hooks/loop-surface-inject.cjs` — Droid-side hook (uses SDK Client post-resolution; check if it spawns test runners)
- `.claude/coordination/hooks/bash-coordination-gate.cjs` — Claude Code bash hook; check if it gates `pnpm test`
- `.claude/coordination/hooks/write-coordination-gate.cjs` — Claude Code write hook; check if it gates `pnpm test`
- `.claude/coordination/hooks/inbound-state-gate.cjs` — Claude Code inbound state hook; check if it gates `pnpm test`
- `.claude/coordination/hooks/recurrence-check-on-start.cjs` — Claude Code start hook; check if it gates `pnpm test`

## Implementation Steps

1. **Read `tools/learning-loop-mastra/agent-manifest.json`**. Identify declared tools. If `Bash` is declared, the Mastra Agent has a Bash-equivalent tool. If not, it uses a custom surface.

2. **Read `tools/learning-loop-mastra/server.js`**. Search for: `pnpm test`, `child_process`, `spawn`, `exec`, `Bash`, `workflow-runtime-probe`. Record each occurrence with line numbers.

3. **Read `tools/learning-loop-mastra/create-loop-workflow.js`**. Search for the same patterns. Record each occurrence.

4. **Read `tools/learning-loop-mastra/workflows/workflow-runtime-probe.js`**. Determine what the `runtime_probe` workflow actually does — is it the test-invocation path, or is it for vendor API probes? (Note: the brainstorm §7 Probe 1 says "Mastra Agent invokes `pnpm test`" — verify this is the path, not just an assumption.)

5. **Read `tools/learning-loop-mastra/workflows/workflow-prepare-runtime-request.js`**. This is the approval flow before any runtime command. If `pnpm test` passes through here, the approval flow is part of the call chain.

6. **Check `.factory/hooks/loop-surface-inject.cjs`** (Droid side). Does it spawn a test runner, or just inject context?

7. **Check `.claude/coordination/hooks/{bash,write,inbound-state}-coordination-gate.cjs`** (Claude Code side). These are the actual Claude Code hooks (the `.claude/hooks/loop-surface-inject.cjs` path does not exist on this surface — only the Droid side has it). The question is the same: do any of these spawn a test runner, or are they coordination gates only?

8. **Trace end-to-end.** Write a 1-paragraph trace: "When the Mastra Agent wants to run `pnpm test`, the call goes from X to Y, invoking Z as a subprocess (or not). Stdout is observable by the Mastra Agent at point W (or not)."

## Success Criteria

- [x] A concrete answer exists: "Mastra Agent invokes `pnpm test` via [subprocess | in-process | workflow step | N/A — does not invoke pnpm test]"
- [x] If the Mastra Agent does NOT invoke `pnpm test` directly, the answer includes: "The surface that does invoke it is [Claude Code | Droid CLI | both | neither]; the Mastra Agent sees test results via [runtime_state | direct invocation | other]"
- [x] File:line evidence for each claim in the answer
- [x] The 1-paragraph trace is recorded in the phase notes
- [x] If the answer is "does not invoke pnpm test" (Probe 1 negative), record this as a new constraint for the brainstorm §7 ("Layer 1 fix is Claude Code/Droid only; Mastra Agent is not on this path")

## Risk Assessment

- **Risk:** The Mastra Agent invokes `pnpm test` through a path not yet documented. **Mitigation:** the 1-paragraph trace from Step 8 is the source of truth; if Step 4 reveals a different path, update the trace.
- **Risk:** The probe reveals a buffering layer we didn't know about (e.g., the workflow logs to a sidecar file and only returns a summary). **Mitigation:** record this as a new constraint for Plan B; the Layer 1 fix may need to address the buffering layer too, not just the runner.
- **Risk:** The probe reveals the Mastra Agent does not invoke `pnpm test` at all (only Claude Code and Droid do). **Mitigation:** the constraint "Mastra Agent is off the runner path" is still useful — it means Plan B's Layer 1 fix can be simpler (only needs to handle Claude Code + Droid, not three surfaces).

## Output Format

Append to `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` under `## Probe 1`:

```markdown
### Probe 1: Runtime Parity

**Question:** Does the Mastra Agent invoke `pnpm test` via subprocess, or via a different mechanism?

**Answer:** [1-2 sentences, concrete, no hedging]

**Evidence:**
- `tools/learning-loop-mastra/server.js:LINE` — [what is there]
- `tools/learning-loop-mastra/workflows/workflow-runtime-probe.js:LINE` — [what is there]
- ...

**Trace:** [1 paragraph from Step 8, inline under the Answer block per Validation Session 1 D4]

**New constraints (if any):** [List of constraints to add to brainstorm §7, or "None"]
```
