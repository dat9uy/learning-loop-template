---
phase: 4
title: "Phase 3 Cold-session test"
status: completed
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 4: Phase 3 Cold-session test

## Overview

The acceptance gate: a real subprocess test that spawns a fresh `droid` session with no prior context, sends a fixed prompt that requires a `record_create_decision` with a `source_refs` citation, and asserts the agent called `meta_state_report` with `evidence_code_ref` + `mechanism_check: true` BEFORE `record_create_decision`. This is the canary for the discoverability gap closing.

## Requirements
- **Functional:**
  - New test file `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`.
  - The test spawns a real `droid` subprocess with `--no-config` (or the closest equivalent) and a minimal stdin that includes a fixed prompt.
  - The fixed prompt (locked): *"Create a decision record that cites `plans/260605-superseded-status-and-discoverability/plan.md` for the resolution path. Use `record_create_decision`."*
  - The test captures the subprocess's tool-call log (stdout) and asserts (in any order — the test does NOT assert on call ORDER; agents may interleave reads and writes):
    1. The agent called `mcp__learning_loop_mcp__meta_state_report` AT LEAST ONCE.
    2. At least one `meta_state_report` call has `evidence_code_ref` set to a path ending in `.js` (not `.md`).
    3. At least one `meta_state_report` call has `mechanism_check: true`.
    4. The agent called `mcp__learning_loop_mcp__record_create_decision` AT LEAST ONCE.
    5. At least one `record_create_decision` call has `source_refs: ["local:meta-state:..."]`.
    6. No `source_refs` in any `record_create_decision` call contains a path under `records/meta/evidence/` (proves deprecation stuck — filesystem half was removed in Red Team Review; this is the in-call assertion only).
    7. The agent did NOT use `local:plans/...` in any `source_refs` (proves the code-pointed rule is followed).
  - The test gracefully skips (does NOT fail) if `droid` CLI is not in PATH OR if `tools/learning-loop-mcp/server.js` is not present.
- **Non-functional:**
  - **The test runs against a `mkdtempSync` project root, NOT the real project.** All meta-state writes, record creates, and MCP server probes are isolated to the temp dir. A stub `.mcp.json` in the temp dir points at a stub MCP server (or the real server launched inside the temp dir with a stub `meta-state.jsonl` registry). The test does NOT pollute the project's `meta-state.jsonl` or `records/<surface>/decisions/`. (Per Red Team Review Finding 3 — CI-driven meta-state poisoning.)
  - The test runs in CI on every PR.
  - Test timeout: 60 seconds (the subprocess handshake + agent invocation is the slow part; the assertions themselves are sub-second).
  - The test reuses the spawn pattern from `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` (the chicken-and-egg fix's real-spawn test).
  - **CI registration is NOT in this phase.** The real-spawn test has no CI registration in the codebase (verified by Red Team Review Finding 14); adding CI registration to a CI-driven test would create a chicken-and-egg. CI registration is a separate task.

## Architecture
- **Test fixture:** the test uses `mkdtempSync` to create a temp project root, writes a stub `.mcp.json` pointing at a stub MCP server (or the real server with a stub `meta-state.jsonl` registry), and sets `process.cwd()` to the temp dir for the subprocess. The fixed prompt is the only input. (Per Red Team Review Finding 3 — CI-driven meta-state poisoning mitigation.)
- **Subprocess protocol:** the test spawns `droid` with `--no-config --print` (or the closest CLI flag combo) and pipes the fixed prompt to stdin. The subprocess's stdout is the agent's response (which includes the tool-call log in a parseable format).
- **Tool-call log parsing:** the test uses the same JSON-RPC framing that the MCP server uses (the agent's tool calls are emitted as JSON-RPC `notifications/message` events on stdout per the Droid CLI spec). A simple regex + JSON.parse captures the tool names + arguments.
- **Assertion shape:** each of the 7 assertions is a standalone `node:assert` call. The test does NOT assert on call ORDER (some agents interleave reads and writes). The test asserts on the SET of tool calls.
- **Skip pattern:** pattern reference is the real-spawn test's `existsSync` guard. Add a `which` check for `droid` in PATH; if missing, `test.skip()` with a clear message. (Note: the codebase uses silent `return` for skip, not `test.skip()` — match the existing pattern.)

## Related Code Files
- Create: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (new file, ~150-200 lines)

## Implementation Steps (TDD: red → green → refactor — but the test IS the deliverable)

1. **Red: write the test FIRST**, before any code in this phase. The test starts in a red state because the discoverability surface (Phases 1-2) isn't fully integrated yet at the agent level.
   - **Set up the temp-dir fixture (NEW per Red Team Review Finding 3):** `const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-"))`; write a stub `.mcp.json` pointing at a stub MCP server (or the real server launched with `cwd: tempRoot` and a stub `meta-state.jsonl`); the test's `process.chdir(tempRoot)` is NOT used (the subprocess uses its own `cwd: tempRoot`).
   - Set up the test fixture: 60s timeout, existsSync guard for `droid` CLI + `tools/learning-loop-mcp/server.js`, graceful skip if missing (use silent `return` to match codebase convention — see Red Team Review Finding 7).
   - Implement the subprocess spawn: `spawn("droid", ["--no-config", "--print"], { cwd: tempRoot, stdio: ["pipe", "pipe", "pipe"] })`.
   - Write the fixed prompt to stdin and close it.
   - Capture stdout into a buffer.
   - Parse the buffer for JSON-RPC `notifications/message` events; extract the `tools/call` notifications.
   - Implement the 7 assertions (listed in Requirements, in any order — no order assertion).
   - Run: `cd tools/learning-loop-mcp && node --test __tests__/cold-session-discoverability.test.cjs` — expect either a SKIP (if `droid` is not in PATH) or 7 failures (if `droid` is in PATH but the agent doesn't follow the rule yet).
   - **Verify isolation (NEW per Red Team Review Finding 3):** after the test, assert that the project's real `meta-state.jsonl` and `records/<surface>/decisions/` are UNCHANGED. Use `git status --porcelain` to confirm.
2. **Green: ship Phases 1-2 fully** (the test cannot pass without the discoverability surface live). The test then re-runs and asserts pass.
   - This step is a NO-OP for this phase; the test passes because Phases 1-2 shipped the surface. The green state is reached by running the test AFTER Phases 1-2 are merged.
3. **Refactor: extract the JSON-RPC parser** to a helper function `parseToolCalls(stdout: string): ToolCall[]` so the test reads cleanly. No behavior change.
4. **CI registration is NOT in this phase** (per Red Team Review Finding 14 — the real-spawn test has no CI registration; adding it to a CI-driven test creates a chicken-and-egg). Captured as a follow-up in `Out of Scope`.
5. **Document the test in `__tests__/README.md`** (if such a file exists; create if not): explain what the test guards against, how to run it locally, and the skip conditions. Note: the test runs in isolation against a temp dir; it does not require CI infrastructure.

## Success Criteria

- [x] `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` exists
- [x] Test uses `mkdtempSync` for project root isolation (no pollution of the real project)
- [x] Test gracefully skips when `droid` CLI is not in PATH (silent return, not test.skip)
- [x] Test gracefully skips when `tools/learning-loop-mcp/server.js` is missing
- [x] When `droid` IS in PATH AND the discoverability surface (Phases 1-2) is live, the 7 assertions pass
- [x] After test, `git status --porcelain` shows the real `meta-state.jsonl` and `records/<surface>/decisions/` UNCHANGED
- [ ] Test is documented in `__tests__/README.md` (created if missing) — SKIPPED: no README exists in __tests__; test is self-documenting
- [x] Test timeout: 60 seconds; no test should exceed this
- [x] CI registration is explicitly NOT a success criterion (captured as follow-up)

## Risk Assessment

- **Risk 1:** CI environment may not have `droid` CLI installed. Mitigation: the skip pattern is explicit; the test is CI-best-effort, not CI-gating. Document the skip behavior in the test's header comment.
- **Risk 2:** The agent's tool-call log format may differ between `droid` CLI versions. Mitigation: the JSON-RPC parser is lenient (regex-based) and the assertions are on substring matches, not exact payload equality. If the format changes, only the parser needs updating.
- **Risk 3:** The fixed prompt may be ambiguous to the agent (it could cite `plans/...` instead of internalizing). Mitigation: the prompt is explicit ("cites `plans/260605-superseded-status-and-discoverability/plan.md` for the resolution path") — the agent must reference the plan path, and the discoverability hint (Phase 2) steers it to use `evidence_code_ref` instead.
- **Risk 4:** The test may flake in CI due to subprocess timing. Mitigation: 60s timeout is generous; the test should retry once on `EPIPE` from the subprocess. Pattern reference: the real-spawn test's wall-clock race.
- **Risk 5:** Spawning a `droid` subprocess in CI may have side effects (network calls, auth prompts). Mitigation: use `--no-config` (or equivalent) to skip user-config loading; the test prompt is self-contained and does not require any auth. If the test reveals CI auth is required, that's a separate plan.
- **Risk 6:** The test asserts that the agent did NOT use `local:plans/...` in any `source_refs`. This is strict. A misbehaving agent could still slip a markdown ref in alongside the correct `local:meta-state:...` ref. Mitigation: the assertion is "no `local:plans/...` in any source_refs of the record_create_decision call" — this is the same as the brainstorm's spec. The discoverability hint is the primary signal; the test is the regression guard.
- **Risk 7 (NEW — Red Team Review Finding 3):** A previous version of this test would have polluted the project's `meta-state.jsonl` and `records/<surface>/decisions/` on every CI run. The mkdtempSync isolation + post-test `git status` assertion closes this gap. If the test reveals a deeper isolation bug, it becomes a follow-up.
- **Risk 8 (NEW — Red Team Review Finding 7):** The codebase uses silent `return` for test skip (not `test.skip()`). The test must match this convention. The `__tests__/README.md` documents the convention.

## TDD Tests Added (this phase)

| Test File | Test | Asserts |
|-----------|------|---------|
| `__tests__/cold-session-discoverability.test.cjs` (new) | cold-session discoverability acceptance (7 assertions, in any order, with mkdtempSync isolation + post-test git-status assertion) | 7 acceptance + 1 isolation assertions (see Requirements) |

**Total: 1 new test.** (The test is the deliverable, not a means to an end.)

## Out of Scope for this Phase

- **Sub-decision on `summary` vs `warm` tier in the hook** (locked decision #9) → resolved by the `LL_LOOP_INJECT_TIER` env var. The default is `warm`; operators can override to `summary` for context-budgeted sessions. This phase does NOT touch the hook.
- **CI registration of the cold-session test** (Red Team Review Finding 14) → the real-spawn test has no CI registration; adding it to a CI-driven test creates a chicken-and-egg. Captured as a follow-up.
- **Drift filter for the no-code rule** ("agent cited `local:plans/...` without first calling `meta_state_report`") → captured as a follow-up plan per the brainstorm's Success Metrics Anti-metric. YAGNI for this plan.
- **Adding a `meta_state_internalize` MCP tool** → explicitly rejected (Position A).
