# Plan A — pnpm test probes data-gathering report

**Date:** 2026-06-22
**Status:** All 3 probes closed
**Source brainstorm:** `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md`

## Operator trade-off verdict

Probe 1 narrows Layer 1 to **Claude Code only** — the Mastra Agent never invokes `pnpm test`, so any stdout-based signal only helps Claude Code. Probe 4 confirms the `[ns] ==> start/pass/FAIL` prefix is safe: every executable consumer is exit-code-only, and no output parser exists. Probe 7 reframes the operator's "slow test is the signal" claim: the drift catch-mechanism is one test file (`cold-tier-regression.test.js`) that can run in isolation; the 10-minute suite is a convenience that populates `meta-state.jsonl`, not a hard dependency of the drift assertion. Plan B can preserve the forcing function while making the signal explicit, and may split the suite without losing drift detection.

## New constraints for brainstorm §7 (cross-linked from §12)

1. **Layer 1 fix surface is Claude Code only.** Mastra Agent is off the `pnpm test` invocation path; do not design Mastra-facing stdout streaming.
2. **Mastra Agent test visibility must use sidecars.** If Plan B wants the Mastra Agent to observe test progress, the channel is `meta_state_*` / `runtime_state_*` tools, not stdout prefixes.
3. **Prefix lines are safe for all consumers.** Every executable `pnpm test` consumer checks exit code only; no line-by-line parser exists.
4. **Drift detection does not require full E2E.** `cold-tier-regression.test.js` can run in isolation if `meta-state.jsonl` is populated.
5. **`meta-state.jsonl` population is the real dependency.** If the suite is split per-namespace, identify which tests/write paths populate the registry and run them first (or treat `meta-state.jsonl` as a fixture).
6. **Stale `evidence_code_ref` needs Plan B cleanup.** `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m`'s `evidence_code_ref` drifted from `package.json:7` to `package.json:17` when `--test-timeout=30000` was added. Refresh via `meta_state_refresh_fingerprint` or `meta_state_patch` as part of Plan B closeout.

## Probe 1: Runtime Parity

**Question:** Does the Mastra Agent invoke `pnpm test` via subprocess, or via a different mechanism?

**Answer:** The Mastra Agent does **not** invoke `pnpm test`. The only surface that actually runs `pnpm test` is Claude Code's native `Bash` tool. The Mastra MCP server exposes no shell-execution tool or workflow; `workflow_runtime_probe` only returns a static plan, and `workflow_prepare_runtime_request` only returns approval-request text.

**Evidence:**
- `tools/learning-loop-mastra/agent-manifest.json:5-31` — tool groups are `gate`, `workflow`, `meta_state`, `introspection`, `runtime_agnostic`. No `Bash`, `Execute`, or shell tool is declared.
- `tools/learning-loop-mastra/server.js:1-162` — registers 41 tools and 10 workflows; no `child_process`, `spawn`, `exec`, or `pnpm test` references.
- `tools/learning-loop-mastra/workflows/workflow-runtime-probe.js:11-24` — returns `{ probe_plan, shared_env_requirements, per_stack_commands, expected_outputs }`; pure lookup table, no execution.
- `tools/learning-loop-mastra/workflows/workflow-prepare-runtime-request.js:57,69` — returns approval-request text and pre-conditions checklist; explicitly states it does not approve or execute commands.
- `.claude/settings.local.json:6` — `Bash(pnpm test *)` is explicitly allowlisted for Claude Code's native Bash tool.
- `.factory/hooks/loop-surface-inject.cjs:314-320` — spawns the MCP server as a child process to call `mastra_loop_describe`; never invokes a test runner.
- `.claude/coordination/hooks/bash-coordination-gate.cjs:1-25` — gates Bash commands; does not spawn test runners.

**Trace:** When tests run, Claude Code's native `Bash` tool spawns `pnpm test` as a subprocess (allowlisted in `.claude/settings.local.json:6`). The Mastra MCP server has no equivalent execution capability; its workflows only emit text plans and approval requests. The Droid hook spawns the MCP server itself, not test commands. Therefore, `pnpm test` stdout is observable only by Claude Code; the Mastra Agent would see results only if Claude Code later records them via `meta_state_*` or `runtime_state_*` tools.

**New constraints:** Layer 1 fix is Claude Code-only; Mastra Agent stdout streaming will not work. Mastra Agent test visibility must go through meta-state / runtime-state sidecars.

## Probe 4: pnpm test consumers

**Question:** Can all `pnpm test` consumers tolerate a `[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL` prefix line per namespace?

**Answer:** **Yes.** Every executable consumer is exit-code-only. No Class B (line-by-line output parser) consumer exists.

**Consumer summary table:**

| Class | Description | Count | Prefix tolerance | Evidence |
|-------|-------------|-------|------------------|----------|
| D | Script/config definitions | 3 | n/a — by inspection | `package.json:17` (test), `package.json:36` (pre-commit), `.claude/settings.local.json:6,20` |
| C | Documentation / prose | 5+ | n/a — by inspection | `README.md:104`, `AGENTS.md:211`, `AGENTS.old.260612-1300.md:230`, `product/web/README.md:32`, `plans/*` |
| E | Test fixture / comment | 3 | n/a — by inspection | `tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js:12,17`, `tools/learning-loop-mcp/__tests__/meta-state-check-grounding-tool.test.js:150`, `tools/learning-loop-mcp/__tests__/meta-state-derive-status-tool.test.js:149` |
| A | Exit-code-only executable | 3 | **Yes** | `package.json:36`, `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js:23`, `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js:22-27` |
| B | Output parsed | 0 | — | — |

**Class A consumers (executable, exit-code only):**
- `package.json:36` — `simple-git-hooks.pre-commit`: `pnpm test`; git hooks check `$?` only.
- `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js:23` — `spawnSync("pnpm", ["test", "--", fullPath])`; passes if `result.status === 0`.
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js:22-27` — routes through `verification-runner.js:48`, which passes if `result.status === expectedExit`.

**Class B consumers:** None.

**Global verdict:** The prefix is safe to add. No consumer parses stdout line-by-line, so non-spec-reporter prefix lines will not break any existing invocation.

**New constraints:** None.

## Probe 7: Fingerprint-drift dependency

**Question:** Does the fingerprint-drift finding require the FULL E2E test suite to be detected, or just one specific namespace / test file?

**Answer:** **One test file.** `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` is self-contained: it reads `meta-state.jsonl` and calls `checkGrounding()` (a pure function that computes file SHA-256 hashes) for each `mechanism_check: true` finding. The drift assertion does not require the test runner to have executed any other tests.

**Evidence:**
- `meta-state.jsonl:165` — finding `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift`: `evidence_code_ref = tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:113`, `evidence_test = tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`, `subtype = fingerprint-drift-pre-closeout`.
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:66-118` — iterates `current.all_findings.filter((f) => f.mechanism_check === true)`, calls `checkGrounding(finding, { root })`, and asserts `grounding.status === "grounded"` at lines 113-117.
- `tools/learning-loop-mcp/core/check-grounding.js:67-74` — `computeFileHash(absPath)` computes SHA-256 via `createHash("sha256")`; no subprocess, no test execution.
- `tools/learning-loop-mcp/core/check-grounding.js:84-192` — `checkGrounding()` is a pure function of `(entry, codeContext)`; returns `status`/`drift_kind` independently of the test runner.
- `package.json:17` — `pnpm test` runs 11 globs covering all namespaces; `cold-tier-regression.test.js` is one file in the first glob.

**Dependency chain:** The drift assertion lives entirely in `cold-tier-regression.test.js`. It fetches the cold tier via `loopDescribeTool.handler({ tier: "cold" })` (reads `meta-state.jsonl`) and calls `checkGrounding()` for each opted-in finding. `checkGrounding()` only hashes files on disk. The only external dependency is a populated `meta-state.jsonl`; if that is present (from a prior run, CI pre-population, or a targeted population step), the test can run in isolation with `node --test tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`.

**Isolated runtime (if measurable without running):** Not empirically verified. Estimated < 5 seconds (one JSONL read + N file hashes). Plan B should measure if runtime data is needed for design.

**Operator's "slow test is the signal" claim verdict:** Reframed. The 10-minute suite is not required by the drift-detection mechanism; it is the current mechanism that populates `meta-state.jsonl` as a side effect. The actual signal is one test file. If `meta-state.jsonl` is pre-populated, the drift test can run alone.

**New constraints:**
- `meta-state.jsonl` must be populated before `cold-tier-regression.test.js` runs.
- The test imports only within the `learning-loop-mcp` namespace; no `mastra` dependency.
- `cold-session-freshness.test.js` is unrelated to drift detection.

## Constraints for Plan B

Consolidated from all 3 probes:

1. Layer 1 stdout signal is Claude Code only — Mastra Agent is off the runner path.
2. Mastra Agent progress visibility, if desired, must use `meta_state_*` / `runtime_state_*` sidecars.
3. The `[ns] ==> start/pass/FAIL` prefix is safe for every existing `pnpm test` consumer.
4. Drift detection does not require the full 10-minute E2E; it requires one test file plus a populated `meta-state.jsonl`.
5. If the suite is split per-namespace, the population path for `meta-state.jsonl` must be identified and preserved.
6. Plan B closeout must refresh the stale `evidence_code_ref` on `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m` (`package.json:7` → `:17`).

## Open questions

None — all 3 probes closed with concrete answers. The next step is Plan B (fix design + implementation) using the constraints above.
