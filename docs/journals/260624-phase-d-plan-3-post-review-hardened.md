# Phase D Plan 3 — Post-Review Hardening — Shipped

**Date:** 2026-06-24
**Branch:** `260623-1619-phase-d-plan-3-agents` (deleted post-merge)
**Plan:** `plans/260623-1619-phase-d-plan-3-agents/`
**PR:** [#13](https://github.com/dat9uy/learning-loop-template/pull/13) — MERGED at `a7e2612` on 2026-06-24T03:58:19Z
**Code review:** `plans/reports/code-reviewer-260624-0150-GH-1619-phase-d-plan-3-agents-report.md`

## Summary

Follow-up to the Phase D Plan 3 ship (`626335e` + `1a06efe`). The code review surfaced **3 critical + 5 important** findings; all addressed in two commits (`28b2f92` + `39ce1af`) on top of the original feature ship. PR #13 was updated and merged to `main`.

**Net result:** the agents migration ships hardened against path traversal, dead-code rot, weak parity assertions, fixture drift, and silent tool-drop in `pick()`.

## What shipped in the hardening commits

### Critical (block-merge → resolved)

- **C1 — `MASTRA_AGENTS_MANIFEST` path containment hardened.** Extracted the inline `startsWith(__dirname)` check to `tools/learning-loop-mastra/agents/load-agents-manifest.js` with three-layer defense: `resolved === root || resolved.startsWith(root + path.sep)` + `realpathSync` containment. The previous check was vulnerable to sibling-prefix bypass (a path like `/home/.../learning-loop-mastra-evil/agents-manifest.json` would pass `startsWith` because the prefix string overlaps) and symlink bypass (a symlink at `tools/learning-loop-mastra/x` pointing outside defeats `resolve`).
- **C2 — Dead `createMockModelWithSpy` helper deleted.** `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` shipped with zero importers — a cargo-cult helper from a Phase 5 design that didn't ship. Repo-wide grep confirmed it was unreferenced. Pure delete.
- **C3 — `agent-prompt-content.test.cjs` added (4 tests).** Wires `@mastra/core/test-utils/llm-mock#createMockModel` with `spyGenerate` to assert the agent's locked instruction marker (e.g., `Bound surface: the meta-surface`) reaches the LLM prompt. The previous mocked-LLM parity tests asserted only on response shape (`typeof result.text === "string" && result.text.length > 0`) — they would have passed even if the agent's instructions were stripped. The new tests are content-aware: the mock's `doGenerate` callback captures the prompt and we substring-match against the locked marker.

### Important (should-fix → resolved)

- **I1 — `runScoutTool` write flags pinned explicitly.** The wrapper at `agents/run-scout-tool.js` now passes `writeJson: false, writeMarkdown: false` to `runScout()`. Previously the read-only contract was derived from `undefined` defaults in `tools/learning-loop-mcp/scout/run-scout.js`. If a future plan flipped those defaults to `true`, the agent's read-only contract would silently break with no test asserting it. Now the contract is local to the wrapper.
- **I2 — `agents-manifest` loading extracted to `loadAgentsManifest()`.** Previously the server.js + 3 agent wrappers each did their own `process.env.MASTRA_AGENTS_MANIFEST ?? join(__dirname, "..", "agents-manifest.json")` + `JSON.parse(readFileSync(...))`. 4× disk read + 4× parse per server start. Now: one disk read, one parse, one path check. The path containment (C1) lives in the helper as the single source of truth.
- **I3 — `MASTRA_AGENT_MODEL.md:17` contradictory sentence fixed.** Original: "Takes precedence over the per-agent `model` field in `agents-manifest.json`, but is overridden by the per-agent field if that is also set." — says it both ways. Rewritten to align with the 3-Layer Lookup Order table: "The per-agent `model` field in `agents-manifest.json` overrides this env var; this env var overrides the code default."
- **I4 — `build-meta-state-tools.js#pick()` fails fast on missing tool.** Previously, `pick()` silently dropped a missing tool from the agent's tool list (`if (dict[name]) result[name] = dict[name];` else skip). The downstream agent would construct with one fewer tool than the manifest promised. Now `pick()` throws on missing tool, surfacing drift at server start. The 8/9/16 exact-count assertions in `agent-direct-parity.test.js` would have caught the missing tool — but only by luck, not by design.
- **I5 — `fixtures-shape.test.cjs` added (3 tests).** Diff-checks the test fixture against production `agents-manifest.json` (excluding the `model` field, which is replaced with `__MOCK_LLM__`). The fixture's header comment warns about drift but no test enforced it — until now. Catches silent drift if a new field lands in production but not the fixture.

### Meta-state fingerprint refresh

Two resolved findings anchored to `tools/learning-loop-mastra/server.js` had their fingerprints refreshed via `mastra_meta_state_refresh_fingerprint`:

- `meta-260617T2356Z-f4-meta-260616t2123z-the-learning-loop-mastra-peer-mcp-serve` (F4 — peer MCP server)
- `meta-260621T1743Z-the-full-pnpm-test-glob-fired-by-pre-commit-hook-package-jso` (pre-commit test deadlock)

Both findings are `status: resolved` and describe fixes that remain in place. The F4 issue (peer MCP server registers 29 deterministic tools) is still resolved. The pre-commit test deadlock fix (`@modelcontextprotocol/sdk Client` + `MASTRA_STORAGE_DRIVER=memory`) is still in place. Only the file content at `server.js:13` drifted because the I2 refactor moved the path-containment code out of `server.js` into the shared loader (the imports now occupy that line). SP2 fingerprint refresh is the correct action per the mechanism.

## Lessons

1. **Defense-in-depth at every public entry point.** The original `startsWith(__dirname)` check was the only defense between `MASTRA_AGENTS_MANIFEST` and arbitrary file reads. Tightening to `root + sep + realpath` is one extra line of code and dramatically hardens the surface. Always assume any env var is potentially attacker-controlled unless the code path itself proves otherwise.
2. **Cargo-cult helpers rot.** `createMockModelWithSpy` was a Phase 5 placeholder with no consumer. Even with no imports, it would have been kept in the codebase until someone noticed. **Catching unused exports during code review (via grep) is cheap insurance.**
3. **Smoke tests hide weak assertions.** The original 7 mocked-LLM parity tests all checked `typeof text === "string" && text.length > 0`. That's not parity — it's "the response isn't an error." The agent's instructions could be deleted and the tests would still pass. **Wire `spyGenerate` (or any prompt-capture mechanism) into at least one mock-LLM test** so prompt content is provable, not implied.
4. **Derived contracts are fragile.** `runScoutTool`'s read-only contract relied on `writeJson`/`writeMarkdown` defaulting to `undefined` in another file. Pin the contract locally — don't depend on defaults in another module to stay safe.
5. **Path duplication = drift risk.** Four independent manifest loads (server.js + 3 wrappers) means four places to update when the manifest schema evolves. The shared `loadAgentsManifest()` helper centralizes the read, parse, cache, and containment check.
6. **A fail-quiet `pick()` is a fail-loud inventory mismatch.** The 8/9/16 exact-count assertions in `agent-direct-parity.test.js` would have caught a missing tool — but only because the test asserts the exact count. Throwing in `pick()` makes the inventory mismatch self-evident, regardless of whether downstream tests happen to assert the count.

## Forward-looking

- **Plan 4 (cutover)** is now unblocked. Owns the final 5→6 group `agent-manifest.json` reconciliation (D-9), the cold-session discoverability enumeration update for the 3 new `ask_*` tools, and the §3.10 reconciliation in `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md`.
- **Post-Plan-3 verification** (per plan §"Post Plan 3 prerequisites for Plan 4") still required before Plan 4 starts: operator runs `pnpm test:debug` with a real `KIMI_API_KEY` and journals the agent outputs at `docs/journals/260623-post-plan-3-verification.md`. This is the gating step that proves the agents actually follow the loop (not just the mocked machinery).
- **Phase 5 (per-agent memory)** is deferred. When it ships, each agent gets a `memory: { observationalMemory: true }` field. The factory already supports this — adding it is a config change, not a migration.
- **Open test count math question.** Plan estimated 1155 tests; actual was 1169 (1168 pass + 1 skip). Journal at `260623-phase-d-plan-3-shipped.md` reports 1162 — a 5-test gap is unaccounted (likely from an intervening Plan 2 addition that pushed the baseline from 1140 to 1145). Low priority; the count is documented in the journal breakdown.

## Verification

```
$ pnpm test
[9 globs, 25.45s]
- mcp-tests:        901 (900 pass, 1 skip, 0 fail)
- mcp-core-tests:    9
- mcp-core:         40
- mcp-lib:          24
- mcp-tools:        11
- mastra-js:        70
- mastra-cjs:       43  (+7 from new tests: 4 prompt-content + 3 fixture-shape)
- claude-coord-cjs: 58
- factory-cjs:      13
─────────────────────────────────────
Total:           1169 tests, 1168 pass, 1 skip, 0 fail

$ pnpm test:cold-session
✔ 11/11 (scope unchanged)
```

CI on PR #13: both `registry-deltas` and `test` checks passed before merge.

## Files changed in the hardening

```
M  .claude/coordination/MASTRA_AGENT_MODEL.md                         (I3)
M  meta-state.jsonl                                                   (2 fingerprint refreshes)
A  plans/reports/code-reviewer-260624-0150-GH-1619-...report.md       (review artifact)
D  tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs (C2)
M  tools/learning-loop-mastra/agents/build-meta-state-tools.js         (I4)
M  tools/learning-loop-mastra/agents/intake-agent.js                  (I2)
M  tools/learning-loop-mastra/agents/run-scout-tool.js                (I1)
M  tools/learning-loop-mastra/agents/scout-agent.js                   (I2)
M  tools/learning-loop-mastra/agents/self-improvement-agent.js        (I2)
A  tools/learning-loop-mastra/agents/load-agents-manifest.js          (C1, I2)
M  tools/learning-loop-mastra/server.js                              (C1, I2)
A  tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs (C3)
A  tools/learning-loop-mastra/__tests__/fixtures-shape.test.cjs       (I5)
```

12 files changed: 9 modified, 2 added (the new tests), 1 deleted (dead helper).
Plus 1 docs file (the review report itself).

## Acceptance gate (verbatim from plan)

> "All 12 test namespaces pass; `createLoopAgent` factory applies parity-shim + 3-layer model resolution; 3 `createAgent` wrappers (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`) instantiate with the locked instruction strings + per-agent tool surfaces; `agents-manifest.json` registered and loaded by `server.js`; `MCPServer` auto-converts to 3 `ask_*` tools (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`); `agent-manifest.json` adds `agent` group (3 entries); legacy `agent-manifest.json` reconciled (D-11: 4 tools added to `meta_state` group); agent-parity harness proves each agent invokes the mocked LLM and produces expected output deterministically (7 tests in `agent-parity.test.cjs`); conditional e2e integration test ships with 3 tests gated on `KIMI_API_KEY`; tools/list enumeration = 44 tools total; cold-session test passes against the legacy 31-entry manifest; No `dotenv` import in loop code; Operator's local-dev workflow: `direnv` (recommended) or shell rc (fallback); No `memory` field on any agent; `MASTRA_AGENT_MODEL` + `KIMI_API_KEY` env vars documented; `MASTRA_AGENTS_MANIFEST` env var is test-only; Whole-suite count: 1155 pass / 0 fail / 1 skipped (default) OR 1158 pass / 0 fail / 1 skipped (with `KIMI_API_KEY`). Plan 4 pre-flight requires Post Plan 3 verification."

✅ All 19 in-scope items shipped.
⚠️ Test count: 1169 actual (plan said 1155; +14 due to 7 Phase 2 invariant tests, 4 prompt-content tests, 3 fixture-shape tests). Documented above.