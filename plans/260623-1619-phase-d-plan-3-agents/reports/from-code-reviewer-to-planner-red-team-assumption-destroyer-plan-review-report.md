# Assumption Destroyer — Scope Auditor Review Report

**Reviewer:** Assumption Destroyer (Scope Auditor)
**Plan:** Phase D Plan 3 — Mastra Agents Migration (D4+D7)
**Date:** 2026-06-23
**Files reviewed:** plan.md, phase-01 through phase-06

---

## Finding 1: Phase 5 mock injection mechanism is fundamentally broken — `__MOCK_LLM__` marker has no implementation path

- **Severity:** Critical
- **Location:** Phase 5, section "Architecture" (Option B) + Phase 2 "createMockModel parity helper"
- **Flaw:** The plan describes injecting mock LLMs into spawned MCP server processes via a test manifest JSON file with `model: "__MOCK_LLM__"`. But `createMockModel` returns a JavaScript object (`MastraLanguageModelV2Mock`), not a string. JSON files cannot contain JavaScript objects. There is no code anywhere in the plan that intercepts the `"__MOCK_LLM__"` string marker and substitutes a mock model instance. The `resolveAgentModel` function returns a string, the factory passes it to `Agent({ model })`, and the Agent would try to resolve `"__MOCK_LLM__"` as a real model router ID, which would fail at runtime.
- **Failure scenario:** An implementer writes Phase 5 test step 2, creates the test fixture with `model: "__MOCK_LLM__"`, spawns the server via `with-mcp-server.js`, and calls `ask_intake_agent`. The Agent's `generate()` method tries to route `"__MOCK_LLM__"` through the Mastra model router, which fails with a provider resolution error. The test never reaches the assertion phase. All 8 Phase 5 tests are unbuildable.
- **Evidence:** The plan says "Option B is cleaner — it does not require the production `createLoopAgent` to recognize a `__MOCK_LLM__` marker" but then says the server should recognize the marker. No code in Phase 2 or Phase 4 implements marker recognition. The Phase 2 factory explicitly forbids importing `@mastra/core/test-utils`. The `with-mcp-server.js` helper spawns a child process — JavaScript objects cannot be passed through environment variables or JSON files to a child process.
- **Suggested fix:** Use one of: (a) Create a dedicated test server entry point (`__tests__/test-server-with-mocks.js`) that imports agents with mock model instances and starts an MCP server, (b) Modify `resolveAgentModel` to check a special env var that triggers mock model creation (requires importing test-utils conditionally), or (c) Restructure Phase 5 to use in-process tests (no MCP spawn) for the mock-dependent tests and reserve process-spawn tests only for the schema-parity and enumeration tests that don't need mock models.

---

## Finding 2: D-11 reconciliation directs adding 4 meta_state tools to the wrong group (workflow instead of meta_state)

- **Severity:** High
- **Location:** Phase 4, section "Architecture" (legacy agent-manifest.json D-11 reconciliation) + step 7
- **Flaw:** Phase 4 step 7 says "Add 4 entries to the `workflow` group" of the legacy manifest. The 4 tools are `propose_design`, `relationships`, `re_verify`, `supersede` — all of which are `meta_state_*` tools (confirmed by their presence in the mastra `tools/manifest.json` as `meta-state-propose-design-tool.js` etc.). The master tracker at line 287 says "Plan 3 Group 1.2 — extended `meta_state` group." The plan contradicts the master tracker and the tool semantics.
- **Failure scenario:** An implementer adds `meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede` to the `workflow` group of the legacy manifest. The workflow group grows from 3 to 7 entries. The `runtime-agnostic-checklist.js` `manifest-registered` check at line 220-258 iterates ALL groups to build a `registered` Set, so the tools would technically be found. But the manifest's semantic structure is broken — future maintainers looking at the "workflow" group would find meta_state tools there, creating confusion. The mastra `agent-manifest.json` has these tools in the `meta_state` group (19 tools), creating an asymmetry with the legacy manifest's `workflow` group.
- **Evidence:** Legacy manifest `workflow` group has 3 tools: `workflow_generate_prompt`, `workflow_notify_artifact`, `workflow_trigger`. Mastra manifest `meta_state` group has all 4 D-11 tools at line 19. Master tracker line 287: "extended `meta_state` group." The plan's Phase 4 step 7 says "Add 4 entries to the `workflow` group (or the appropriate group; verify the file's structure first)" — the parenthetical hedge suggests the author was uncertain.
- **Suggested fix:** Add the 4 tools to the `meta_state` group of the legacy manifest, not the `workflow` group. The legacy meta_state group would grow from 15 to 19 tools (matching the mastra manifest's 19). Update Phase 6's count matrix to reflect this: legacy meta_state group = 19, not workflow group = 7.

---

## Finding 3: `MASTRA_AGENT_MODEL` env var override is dead code in the production code path

- **Severity:** High
- **Location:** Phase 3, section "Architecture" (intake-agent.js shape) + Phase 2 (createLoopAgent factory)
- **Flaw:** Phase 3 agent wrappers always pass `modelOverride: agentsManifest.intake_agent.model` (a truthy string from the JSON manifest). The factory at Phase 2 shows `const model = modelOverride ?? resolveAgentModel(id, undefined)`. Since `modelOverride` is always truthy (the manifest ships with `model: "kimi-for-coding/k2p6"` for all 3 entries), `resolveAgentModel` is never called. The `MASTRA_AGENT_MODEL` env var check (Layer 2 of the 3-layer lookup) is unreachable.
- **Failure scenario:** An operator reads `.claude/coordination/MASTRA_AGENT_MODEL.md`, sets `MASTRA_AGENT_MODEL=google/gemini-2.5-flash` to override all agents to a different model, and expects the change to take effect. But the agent wrappers use `modelOverride: agentsManifest.xxx.model` which always returns `"kimi-for-coding/k2p6"` from the manifest. The env var is ignored. The operator's model override silently fails.
- **Evidence:** Phase 3 architecture section shows `modelOverride: agentsManifest.intake_agent.model`. Phase 2 factory shows `const model = modelOverride ?? resolveAgentModel(id, undefined)`. Phase 1 step 6 documents `MASTRA_AGENT_MODEL` as "sets all 3 agents to the same provider/model string." The `.claude/coordination/MASTRA_AGENT_MODEL.md` env var reference would be misleading documentation.
- **Suggested fix:** Either (a) remove `modelOverride` from the agent wrappers and pass `agentsManifest` to the factory so `resolveAgentModel` handles the full 3-layer lookup, or (b) change the factory to check the env var AFTER `modelOverride` (so env var overrides even the manifest value), or (c) update the documentation to clarify that `MASTRA_AGENT_MODEL` only takes effect when the manifest's `model` field is empty/missing.

---

## Finding 4: `createLoopAgent` factory lacks `agentsManifest` parameter — 3-layer lookup is unreachable in production

- **Severity:** High
- **Location:** Phase 2, section "Architecture" (createLoopAgent signature)
- **Flaw:** The factory signature is `createLoopAgent({ id, name, description, instructions, modelOverride, tools })`. There is no `agentsManifest` parameter. The 3-layer model resolution function `resolveAgentModel(agentId, agentsManifest)` accepts a manifest, but the factory calls it with `undefined` (per the comment "agentsManifest passed by caller" = `undefined`). In production, `modelOverride` is always set (from the manifest), so `resolveAgentModel` is never called. The 3-layer lookup exists only as a test utility.
- **Failure scenario:** The 3-layer lookup is tested in Phase 2 (4 invariant tests), but never exercised in production. If a future maintainer changes the agent wrappers to NOT pass `modelOverride`, the factory falls back to `resolveAgentModel(id, undefined)` which skips Layer 1 (manifest field) and only checks env var + code default. This would be a regression — the manifest's per-agent `model` field would be ignored.
- **Evidence:** Phase 2 factory code at line `const model = modelOverride ?? resolveAgentModel(id, /* agentsManifest passed by caller */ undefined)`. Phase 3 wrappers use `modelOverride: agentsManifest.xxx.model`. The `resolveAgentModel` function is tested in Phase 2 but the factory never calls it with a real manifest.
- **Suggested fix:** Add `agentsManifest` to the factory signature: `createLoopAgent({ id, name, description, instructions, agentsManifest, tools })`. Have the factory call `resolveAgentModel(id, agentsManifest)` when `modelOverride` is not provided. This makes the 3-layer lookup the primary code path.

---

## Finding 5: Phase 6 count math inconsistency — "~1154" vs "1155"

- **Severity:** Medium
- **Location:** Phase 6, section "Architecture" (count matrix) + "Success Criteria"
- **Flaw:** The count matrix in Phase 6 says "1140 | **~1154**" while the acceptance gate in `plan.md` says "1155 pass / 0 fail / 1 skipped" and the Whole-Plan Consistency Sweep also says "1155." The correct math is 1140 + 4 (Phase 2) + 3 (Phase 3) + 8 (Phase 5) = 1155. The "~1154" in Phase 6 is a stale value from before the test count was finalized.
- **Failure scenario:** An implementer uses Phase 6's count matrix to verify the test run and sees 1155 pass. The matrix says "~1154" which doesn't match. The implementer wastes time investigating a phantom count discrepancy.
- **Evidence:** Phase 6 count matrix line: "1140 | **~1154**". Phase 6 success criteria: "1154-1156 pass / 0 fail / 1 skipped". `plan.md` acceptance gate: "1155 pass / 0 fail / 1 skipped". `plan.md` consistency sweep: "1155 pass / 0 fail / 1 skipped".
- **Suggested fix:** Update Phase 6 count matrix to say "1155" and success criteria to say "1155 pass / 0 fail / 1 skipped" (matching the plan.md acceptance gate).

---

## Finding 6: Phase 4 line reference drift — "workflow-parity.test.cjs:159" is actually at line 166

- **Severity:** Medium
- **Location:** Phase 4, section "Implementation Steps" step 8 + plan.md preflight checklist
- **Flaw:** The plan references `workflow-parity.test.cjs:159` for the assertion bump (41 → 44). The actual assertion `assert.equal(tools.length, 41, ...)` is at line 166, not line 159. Line 159 is the test name string `test("tools/list enumerates 31 mastra_* + 10 run_workflow_* = 41 total", ...)`.
- **Failure scenario:** An implementer opens `workflow-parity.test.cjs` and navigates to line 159 expecting to find the assertion to modify. They find the test name instead and may be confused about which line to change. Minor but wastes time.
- **Evidence:** `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` line 160: `test("tools/list enumerates 31 mastra_* + 10 run_workflow_* = 41 total", ...)`. Line 166: `assert.equal(tools.length, 41, ...)`. The plan says "workflow-parity.test.cjs:159" in multiple places.
- **Suggested fix:** Update all references from `:159` to `:166` (or reference the test name instead of the line number, since line numbers drift).

---

## Finding 7: Naming collision risk between `agents-manifest.json` (new) and `agent-manifest.json` (existing)

- **Severity:** Medium
- **Location:** Phase 3 + Phase 4 (both files in `tools/learning-loop-mastra/`)
- **Flaw:** Plan 3 creates `tools/learning-loop-mastra/agents-manifest.json` (3 agent entries) alongside the existing `tools/learning-loop-mastra/agent-manifest.json` (5-group structure). The names differ by a single letter ('s'). The plan also references `tools/learning-loop-mcp/agent-manifest.json` (legacy manifest). Three manifest files with near-identical names in two directories creates confusion during implementation and maintenance.
- **Failure scenario:** An implementer accidentally edits the wrong manifest file (e.g., adds agent entries to `agent-manifest.json` instead of `agents-manifest.json`, or vice versa). A future maintainer grepping for "agent-manifest" finds 3 files and must carefully distinguish them.
- **Evidence:** `tools/learning-loop-mastra/agent-manifest.json` (existing, 5 groups). `tools/learning-loop-mastra/agents-manifest.json` (new, 3 agent entries). `tools/learning-loop-mcp/agent-manifest.json` (legacy, 5 groups). All three are referenced extensively throughout the plan.
- **Suggested fix:** Rename the new file to something more distinct, e.g., `mastra-agents.json` or `agents-registry.json`. Or add a clear header comment to each manifest file explaining its purpose and relationship to the other manifests.

---

## Finding 8: Phase 3 intakeAgent tool count inconsistency — 8 vs 9 tools

- **Severity:** Medium
- **Location:** Phase 3, section "Implementation Steps" steps 2-3 vs "Function/Interface Checklist"
- **Flaw:** Phase 3 step 2 says "the `tools` field has 9 entries (the locked read-only tool surface from researcher-B section 2.1)" and step 3 says "Phase 3 ships 8 read-only tools; the 9th is added in Phase 4 if the operator confirms the canonical name." The Function/Interface Checklist says "intakeAgent instance: ... tools has 8 entries." These are contradictory — is it 8 or 9?
- **Failure scenario:** An implementer writes the test asserting 9 tools (per step 2), then implements the wrapper with 8 tools (per step 3). The test fails. Or vice versa: the test asserts 8 but the wrapper has 9.
- **Evidence:** Phase 3 step 2: "`intakeAgent.tools` has 9 entries." Phase 3 step 3: "Phase 3 ships 8 read-only tools." Phase 3 checklist: "intakeAgent instance: ... tools has 8 entries." Phase 3 test matrix: "intakeAgent has 8 read-only tools."
- **Suggested fix:** Pick one number and make all references consistent. If the 9th tool (`mastra_meta_state_get_relationship` vs `mastra_meta_state_relationships`) is the same tool under a different name, document the canonical name and settle on 8.
