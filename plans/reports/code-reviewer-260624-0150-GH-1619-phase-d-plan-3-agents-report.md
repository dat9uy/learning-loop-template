---
title: "Code Review — Phase D Plan 3 (Mastra Agents Migration, D4+D7)"
branch: "260623-1619-phase-d-plan-3-agents"
reviewer: code-reviewer subagent + spec/quality pass
date: 2026-06-24
status: pass-with-concerns
---

# Code Review — Phase D Plan 3 (Mastra Agents Migration, D4+D7)

## Scope

Branch: `260623-1619-phase-d-plan-3-agents` (5 commits, 43 files / +4068 net LOC including docs).
Plan dir: `plans/260623-1619-phase-d-plan-3-agents/` (plan.md + 6 phase files + pr-body.md).
Feature ship: `626335e feat(agents): ship Plan 3 — Mastra agents migration (D4+D7)`.
Refactor: `1a06efe refactor(test): separate e2e tests to debug directory`.

Reviewed against the plan's acceptance gate, the user's 5 review/validation sessions, and the code-reviewer subagent's Stage 2 findings.

---

## Verdict

**Status: DONE_WITH_CONCERNS — fit to land after 2 critical fixes (path containment, dead helper) and 1 important fix (test assertion strength).**

The branch ships D4 (3 meta-surface agents) + D7 (per-agent model config) + D-11 (legacy manifest reconciliation). All 9 test namespaces pass: 1162 total / 1161 pass / 0 fail / 1 skipped. Direct parity tests are tight. The e2e tests are correctly isolated behind `KIMI_API_KEY` + `__tests__/debug/`. Cold-session test scope is genuinely unchanged.

---

## Stage 1 — Spec Compliance (PASS)

| Plan deliverable | Shipped? | Evidence |
|---|---|---|
| `createLoopAgent` factory + 3-layer model lookup | ✅ | `tools/learning-loop-mastra/create-loop-agent.js:1-89` |
| `intakeAgent` (8 read-only tools, no memory) | ✅ | `agents/intake-agent.js:18-26`; `agent-direct-parity.test.js:14-40` |
| `scoutAgent` (9 tools: 8 + runScout, no memory) | ✅ | `agents/scout-agent.js:22-30`; `agent-direct-parity.test.js:44-60` |
| `selfImprovementAgent` (16 tools, excludes meta_state_batch) | ✅ | `agents/self-improvement-agent.js:19-27`; `agent-direct-parity.test.js:64-96` |
| `agents-manifest.json` (3 entries, snake_case keys) | ✅ | `agents-manifest.json:5-29` |
| `ask_intake_agent` / `ask_scout_agent` / `ask_self_improvement_agent` MCP tools | ✅ | `server.js:67-75` + `workflow-parity.test.cjs:166` (44 = 31 + 10 + 3) |
| `MASTRA_AGENT_MODEL` env var + 3-layer lookup | ✅ | `create-loop-agent.js:42`; `MASTRA_AGENT_MODEL.md:13-25` |
| `.claude/coordination/MASTRA_AGENT_MODEL.md` | ✅ | 70 lines, operator-facing |
| `.envrc` + `.env.example` (no `dotenv` in loop) | ✅ | `.envrc:1-2`; `.env.example:60-71`; `grep -rn dotenv tools/` returns 0 matches |
| D-11: legacy `agent-manifest.json` meta_state 15→19 | ✅ | `tools/learning-loop-mcp/agent-manifest.json:41-44` |
| `agent-manifest.json` (mastra) `agent` group (5→6) | ✅ | `tools/learning-loop-mastra/agent-manifest.json:33-38` |
| `workflow-parity.test.cjs` assertion 41→44 | ✅ | `__tests__/workflow-parity.test.cjs:166` |
| Agent parity harness (mocked LLM) | ✅ (7 tests, plan said 8) | `__tests__/agent-parity.test.cjs:1-123` |
| Conditional e2e tests (KIMI_API_KEY gated) | ✅ (now in `__tests__/debug/`) | `__tests__/debug/agent-e2e-integration.test.cjs` |
| `meta_state_log_change` filed (D4+D7 closure) | ✅ | `meta-state.jsonl` gained 2 entries (env-var + master-tracker) |
| Master tracker D4 + D7 + D-11 flipped `[x]` | ✅ | `plans/reports/productization-260612-1530-master-tracker.md:204,209,287` |
| Journal entry | ✅ | `docs/journals/260623-phase-d-plan-3-shipped.md` |
| PR body | ✅ | `plans/260623-1619-phase-d-plan-3-agents/pr-body.md` |
| All 3 agents have `memory === undefined` | ✅ | `create-loop-agent.js:87` (omitted); 3 assertions in `agent-direct-parity.test.js` |
| Cold-session test scope unchanged | ✅ | `loop-introspect.js` reads `tools/learning-loop-mcp/tools/manifest.json` (not the new 6-group manifest); verified by `pnpm test` green |

**Plan adherence score: 19 of 19 in-scope items shipped.** Two items shipped in a way the plan mis-described (see Spec Drift below).

---

## Spec Drift (Plan vs. Ship)

### D1 — `__MOCK_LLM__` marker kept (plan claimed it was redesigned to `__testMockModels__`)

The Session 3 red-team report (Finding #2, accepted) flagged the `__MOCK_LLM__` marker as "fundamentally broken" and proposed a `__testMockModels__` registry. The shipped code did NOT apply that redesign — it kept the marker.

**Why this is OK:** the marker works in the shipped design because the string check happens inside the server process (line 32-37 of `create-loop-agent.js`), which has direct access to `@mastra/core/test-utils/llm-mock`. The `__MOCK_LLM__` string does NOT cross a process boundary; it is read from the test fixture, evaluated by the server's `resolveAgentModel`, and replaced with a real mock model object IN the server process. The "cross-process data transfer" concern in Session 3 was a false alarm.

**But:** the plan's Session 3 finding and Session 4 validation claim the marker was redesigned. The plan body now misrepresents the implementation. This is documentation drift, not a bug.

**Fix:** add a Session 6 note to `plans/260623-1619-phase-d-plan-3-agents/plan.md` explaining why the marker was kept (and why Session 3's `__testMockModels__` proposal was unnecessary). Operator's local docs match the code; only the cross-plan history record needs updating.

### D2 — Test count math (plan said 1155, actual 1162)

| Source | Plan estimate | Actual |
|---|---|---|
| Plan 1b baseline | 1140 | ? (not independently verified) |
| Phase 2 invariant tests | +4 | +7 (`create-loop-agent.test.js`: per-agent wins, env wins, default, Agent construction, throws on missing id, throws on missing instructions, rejects uppercase id) |
| Phase 3 direct unit tests | +3 | +3 |
| Phase 5 parity harness | +8 | +7 (missing: per-agent manifest field override MCP-integration test) |
| Total post-Plan 3 | **1155** | **1161 pass + 1 skip = 1162** (per journal) |

The journal transparently reports this discrepancy. The math is internally consistent (Phase 2 had +3 extra; Phase 5 had -1; net +2; 1155+2=1157 ≠ 1162 — gap of 5 unaccounted). The 5-test gap is likely from the actual Plan 1b baseline being 1145 (not 1140) due to intervening test additions between Plan 1b and Plan 3.

**Fix:** re-state the baseline in the plan's count matrix or update the journal's "Breakdown" table. Low priority — the test suite passes, and the count is documented.

---

## Stage 2 — Code Quality

Full Stage 2 review is in `plans/reports/code-reviewer-260623-1857-GH-1619-phase-d-plan-3-agents-stage2-code-quality-report.md`. Top findings (3 critical, 5 important, 7 minor):

### Critical (block merge)

- **[C1] `MASTRA_AGENTS_MANIFEST` path-containment check is weak.** `server.js:60` uses `resolvedManifestPath.startsWith(resolve(__dirname))`. Two flaws: (a) sibling-prefix ambiguity (`learning-loop-mastra-evil/...` passes the check); (b) symlink bypass. **Fix:** `resolved === root || resolved.startsWith(root + path.sep)` + `realpathSync` containment. This is the only defense between a test-only env var and arbitrary file reads in production.

- **[C2] `createMockModelWithSpy` is shipped but never imported.** `__tests__/helpers/create-mock-model.cjs:1-27` exports a wrapper that adds `spyGenerate` to the upstream `createMockModel`. Repo-wide grep shows zero consumers. Pure dead code from a Phase 5 design that didn't ship. **Fix:** delete the file OR wire at least one `agent-parity.test.cjs` case to it (the doc comment at lines 6-9 even shows the intended usage). Currently the file is a maintenance liability and a signal of the test design's drift.

- **[C3] `agent-parity.test.cjs` parity assertions are smoke-grade.** The 7 mocked-LLM tests assert only `typeof text === "string" && text.length > 0` (lines 53, 63, 71, 79). The plan's Phase 5.1 "empirical probe" was supposed to "lock the response format" but doesn't — there is no format-shape assertion, no tool-call order check, no prompt-content check. The mock's `mockText: "mock-agent-response"` is what surfaces; the test never proves the agent's instructions or tool surface are honored. **Fix:** wire `createMockModelWithSpy` (if C2 is fixed) or another spy mechanism to assert at least one agent's prompt contains its locked instruction marker (e.g., `Bound surface: the meta-surface` for `intakeAgent`).

### Important (should fix before Plan 4)

- **[I1] `runScoutTool` doesn't explicitly pin write flags to `false`.** The wrapper at `run-scout-tool.js:18-23` calls `runScout({ projectRoot, excludeGlobs })` without `writeJson`/`writeMarkdown`. The read-only contract relies on `run-scout.js:330,336` defaulting to `undefined` (which fails the `if` check). The plan's promise is "write flags hidden from agent wrapper" — currently they're absent, not pinned. **Fix:** pass `writeJson: false, writeMarkdown: false` explicitly so the contract is local to the wrapper, not derived from defaults in another file.

- **[I2] Per-agent wrappers re-read `agents-manifest.json` independently.** Each of the 3 agent wrappers (lines 12-15) re-parses the same manifest the server.js already loaded. 4× disk read + 4× JSON.parse per server start; risk of test/prod divergence if the manifest is malformed. **Fix:** load the manifest once in `server.js` and pass the parsed object to the agent wrappers as a constructor arg, or expose a cached `loadAgentsManifest()` helper.

- **[I3] `MASTRA_AGENT_MODEL.md:17` has contradictory wording on lookup precedence.** "Takes precedence over the per-agent `model` field in `agents-manifest.json`, but is overridden by the per-agent field if that is also set." The "3-Layer Lookup Order" section below gets it right (Layer 1 > Layer 2 > Layer 3). **Fix:** rewrite the per-env-var sentence as "Per-agent `model` field overrides this env var; this env var overrides the code default."

- **[I4] `build-meta-state-tools.js` silent skip on missing tools.** `getToolDict()` line 40 (`if (!legacy) continue;`) drops a missing tool from `_toolCache` without warning. The downstream `pick()` silently drops it from the agent's tool list. A missing D-11 tool would not fail any test by default — only the 8/9/16 exact-count assertions in `agent-direct-parity.test.js` catch it. **Fix:** throw on missing tool in `getToolDict()` so server start fails fast.

- **[I5] `agents-manifest.test.json` drift hazard.** The test fixture is a hand-maintained clone of `agents-manifest.json` with only the `model` field swapped. The header doc (line 3) warns about divergence but no test enforces it. **Fix:** add a `before()` diff check, or generate the fixture from production at test time.

### Minor (nice-to-have)

- [M1] `create-loop-agent.js:1-16`: 16-line header doc for a 90-line factory. Trim.
- [M2] Three identical `__dirname` + manifest-load blocks across the 3 agent wrappers. Extract.
- [M3] `build-meta-state-tools.js:30-31`: dynamic `await import("node:fs" | "node:url" | "node:path")` is unnecessary — these are Node built-ins. Static imports.
- [M4] `server.js:177` description embeds the magic "31 + 10 + 3 = 6 groups" number. Add a comment pointing at the master-tracker D4 line.
- [M5] `MASTRA_AGENT_MODEL.md:17` contradictory sentence (same as I3).
- [M6] `agents-manifest.test.json` `description` field duplicates production. Drift risk.
- [M7] `scripts/probe-create-mock-model.mjs`: standalone probe with no `pnpm` script hook. Either wire as `pnpm probe:mastra-llm` or delete.

### AI-slop patterns detected

1. **Phased "TDD order" comments** that read like developer stream-of-consciousness (`__tests__/agent-parity.test.cjs:4-7`).
2. **Marketing-flavored instruction strings** ("the substrate is replaceable; your job is the meta-surface self-model"). The 23-27-line agent instructions are verbose; a 10-line terser version would likely perform equally well.
3. **Forward-pointing comments** to future plans (`create-loop-agent.js:14-15` "OM off; Phase 5 consumer"). Per `documentation-management.md`, these belong in future-plan docs, not current code.
4. **Helper extraction without consumer** (`create-mock-model.cjs`, C2).
5. **Doc blocks restating the next array** (`build-meta-state-tools.js:1-18` duplicates the `READ_ONLY_NAMES`/`WRITE_NAMES` arrays 30 lines below).

### Security

- **Path containment (C1):** see above.
- **Prompt injection via instruction strings:** the instructions are static template literals. No operator-supplied input or file content flows in. **No injection vector in this branch.**
- **Tool surface containment:** agents' tool lists are computed statically from `READ_ONLY_NAMES`/`WRITE_NAMES`. `mastra_meta_state_batch` is correctly excluded (operator-grade tool).
- **Secret handling:** no `dotenv` in loop code. `.env` is gitignored. `.envrc` is committed with only `dotenv .env` (no secrets). **Clean.**
- **`runScout` write flags:** see I1 — contract is derived, not pinned.

---

## Stage 3 — Verification

### Test execution

```
$ pnpm test
[9 globs, 24.85s]
- mcp-tests:        901 tests, 900 pass, 1 skipped, 0 fail
- mcp-core-tests:    9 tests,   9 pass, 0 skipped, 0 fail
- mcp-core:         40 tests,  40 pass, 0 skipped, 0 fail
- mcp-lib:          24 tests,  24 pass, 0 skipped, 0 fail
- mcp-tools:        11 tests,  11 pass, 0 skipped, 0 fail
- mastra-js:        70 tests,  70 pass, 0 skipped, 0 fail
- mastra-cjs:       36 tests,  36 pass, 0 skipped, 0 fail
- claude-coord-cjs: 58 tests,  58 pass, 0 skipped, 0 fail
- factory-cjs:      13 tests,  13 pass, 0 skipped, 0 fail
─────────────────────────────────────────
Total:           1162 tests, 1161 pass, 1 skipped, 0 fail
```

✅ **All 9 namespaces pass. 0 failures.** Matches the journal's 1162 / 1161 / 1 / 0 claim.

### Per-file verification (new tests)

| File | Tests | Pass | Verified |
|---|---|---|---|
| `__tests__/create-loop-agent.test.js` | 7 | 7 | ✅ 376ms |
| `__tests__/agent-direct-parity.test.js` | 3 | 3 | ✅ 493ms |
| `__tests__/agent-parity.test.cjs` | 7 | 7 | ✅ 1003ms |
| `__tests__/debug/agent-e2e-integration.test.cjs` | 3 (gated) | skip without KIMI_API_KEY | ✅ correctly skipped |

### Cold-session test scope

Verified: `tools/learning-loop-mcp/core/loop-introspect.js` reads `tools/learning-loop-mcp/tools/manifest.json` (the 31-entry manifest), NOT the new 6-group `agent-manifest.json`. The 5→6 group addition in `tools/learning-loop-mastra/agent-manifest.json` cannot break the cold-session test. Plan's "scope unchanged" claim holds.

### No-dotenv verification

`grep -rn dotenv tools/` returns 0 matches. The loop code reads `process.env.*` directly. ✅

---

## Final Verdict

**Status: DONE_WITH_CONCERNS — fit to land after 3 critical fixes.**

The branch ships all in-scope deliverables from the plan's acceptance gate. The agent factory, server wiring, env-var contract, and direct-parity tests are solid. The mocked-LLM parity tests are smoke-grade. The e2e tests are correctly isolated. The cold-session test is genuinely unchanged. The test suite is green (1162 / 1161 pass / 0 fail / 1 skipped).

### Pre-merge action items

| # | Severity | File | Action |
|---|---|---|---|
| 1 | Critical | `server.js:60` | Tighten path containment: `resolved === root || resolved.startsWith(root + path.sep)` + `realpathSync` check |
| 2 | Critical | `__tests__/helpers/create-mock-model.cjs` | Delete the file (or wire it into a parity test) |
| 3 | Critical | `__tests__/agent-parity.test.cjs` | Strengthen at least one mocked-LLM test to assert on prompt content or tool-call order |
| 4 | Important | `agents/run-scout-tool.js:18-23` | Pin `writeJson: false, writeMarkdown: false` explicitly |
| 5 | Important | `agents/{intake,scout,self-improvement}-agent.js:12-15` | Extract manifest loading to a shared helper; pass parsed manifest from server.js |
| 6 | Important | `.claude/coordination/MASTRA_AGENT_MODEL.md:17` | Fix contradictory lookup-precedence sentence |
| 7 | Important | `agents/build-meta-state-tools.js:40` | Throw on missing tool in `getToolDict()` |
| 8 | Important | `__tests__/fixtures/agents-manifest.test.json` | Add a shape-diff test against production manifest |

### Pre-Plan-4 follow-ups (not blocking this branch)

- Document the rationale for keeping `__MOCK_LLM__` (vs Session 3's `__testMockModels__` proposal) in a Session 6 note.
- Resolve the test count math: 1162 - 1140 - 17 (Plan 3 addition) = 5 unaccounted tests. Either the baseline was 1145 or the journal miscounted.
- The `scripts/probe-create-mock-model.mjs` probe has no `pnpm` script entry. Wire or delete.

### Acceptance gate verification

- ✅ D4 + D7 closure: 3 agents + per-agent model config shipped
- ✅ D-11 closure: legacy manifest meta_state 15 → 19
- ✅ Agent parity harness: 7 mocked + 3 conditional e2e (gated on KIMI_API_KEY)
- ✅ `tools/list` enumeration 41 → 44 (verified by `workflow-parity.test.cjs:166`)
- ✅ `agent-manifest.json` (mastra) 5 → 6 groups
- ✅ `meta_state_log_change` filed (2 entries)
- ✅ Master tracker D4 + D7 + D-11 flipped
- ✅ Journal entry written
- ✅ PR body drafted (with count matrix)
- ✅ All 3 agents have `memory === undefined`
- ✅ No `dotenv` import in loop code
- ✅ Cold-session test passes (scope unchanged)
- ⚠️ Test count: 1162 actual vs 1155 plan estimate (+7; documented in journal)

---

## Files cited

See the Stage 2 report at `plans/reports/code-reviewer-260623-1857-GH-1619-phase-d-plan-3-agents-stage2-code-quality-report.md` for the full file:line evidence trail.
