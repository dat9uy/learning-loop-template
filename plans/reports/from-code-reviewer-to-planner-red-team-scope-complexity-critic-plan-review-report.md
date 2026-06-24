# Red-Team Review: Scope & Complexity Critic -- Phase D Plan 3

**Reviewer:** Contract Verifier / Scope & Complexity Critic
**Date:** 2026-06-23
**Plan:** plans/260623-1619-phase-d-plan-3-agents/plan.md + 6 phase files

---

## Finding 1: createMockModel import path is wrong -- plan-breaking

- **Severity:** Critical
- **Location:** Phase 1 step 1, Phase 2 Architecture (create-mock-model.cjs), Phase 5 Architecture (agent-parity.test.cjs)
- **Flaw:** The plan assumes import({ createMockModel } from "@mastra/core/test-utils") works. It does not. The package exports map does NOT include ./test-utils. The actual export is @mastra/core/test-utils/llm-mock.
- **Failure scenario:** Phase 1 probe throws ERR_PACKAGE_PATH_NOT_EXPORTED. Phase 2 helper fails. Phase 5 parity harness cannot import the mock. Plan blocks at Phase 1 step 1.
- **Evidence:** grep "test-utils" on the package.json shows the export is ./test-utils/llm-mock, not ./test-utils. Node -e import test throws ERR_PACKAGE_PATH_NOT_EXPORTED. Node -e import test-utils/llm-mock succeeds.
- **Suggested fix:** Replace every @mastra/core/test-utils reference with @mastra/core/test-utils/llm-mock across all 6 phases.

---

## Finding 2: D-11 reconciliation adds meta-state tools to the wrong group

- **Severity:** Critical
- **Location:** Phase 4 section D-11 reconciliation + plan.md count matrix
- **Flaw:** The plan says to add 4 tools (propose_design, relationships, re_verify, supersede) to the workflow group of the legacy manifest. These are meta_state tools. The legacy meta_state group has 15 tools; the mastra meta_state group has 19. The 4 missing tools belong in meta_state, not workflow.
- **Failure scenario:** If implemented as written, the legacy manifest workflow group will contain 3 workflow tools + 4 meta_state tools -- a semantically wrong grouping.
- **Evidence:** python3 analysis shows legacy manifest: workflow=3, meta_state=15. Mastra manifest: meta_state=19. The 4 extras are the D-11 tools. Plan count matrix says workflow group 3->7 which is wrong.
- **Suggested fix:** Change all references from workflow group to meta_state group. Update count matrix to meta_state 15->19.

---

## Finding 3: Phase 5 test code uses wrong callTool API

- **Severity:** Critical
- **Location:** Phase 5 Architecture + Implementation Steps 4-6
- **Flaw:** Phase 5 code shows handles.callTool({ name: "ask_intake_agent", arguments: { message: "..." } }) then JSON.parse(result.content[0].text). The with-mcp-server.js callTool: (1) takes (name, args) positional args, not a config object; (2) already parses content[0].text and returns the parsed object.
- **Failure scenario:** Tests throw type error or Cannot read properties of undefined. Every Phase 5 test fails.
- **Evidence:** with-mcp-server.js line 78-89: callTool = async (name, args) => ... return JSON.parse(result.content[0].text). workflow-parity.test.cjs line 37 comment confirms this. All existing calls use callTool("name", args) pattern.
- **Suggested fix:** Rewrite Phase 5 to use callTool("ask_intake_agent", { message: "..." }) and assert on the returned object directly.

---

## Finding 4: createMockModelWithSpy CJS helper imports wrong path

- **Severity:** High
- **Location:** Phase 2 Architecture -- create-mock-model.cjs
- **Flaw:** The helper uses require("@mastra/core/test-utils") but the export does not exist. The correct path is @mastra/core/test-utils/llm-mock. Even with the correct path, require() works because the exports map includes a require condition, but the plan path is wrong.
- **Failure scenario:** require() throws ERR_PACKAGE_PATH_NOT_EXPORTED. Helper cannot be created.
- **Evidence:** node -e require test-utils throws. The exports map shows test-utils/llm-mock with both import and require conditions.
- **Suggested fix:** Change to require("@mastra/core/test-utils/llm-mock").

---

## Finding 5: createLoopAgent factory resolveAgentModel call passes undefined manifest

- **Severity:** High
- **Location:** Phase 2 Architecture factory code, Phase 3 intake-agent.js wrapper
- **Flaw:** Factory calls resolveAgentModel(id, undefined) when modelOverride is not set. With undefined manifest, Layer 1 (per-agent field) is always undefined. The 3-layer lookup degenerates to 2 layers. Phase 3 wrappers work around by passing modelOverride directly, bypassing resolveAgentModel.
- **Failure scenario:** Operator sets per-agent model in agents-manifest.json but factory resolveAgentModel never reads it. Falls through to code default. The 3-layer lookup contract documented in the plan is not exercised by the factory.
- **Evidence:** Phase 2 code: resolveAgentModel(id, /* agentsManifest passed by caller */ undefined). Phase 3: modelOverride: agentsManifest.intake_agent.model -- wrapper reads manifest, bypasses factory lookup.
- **Suggested fix:** Either add agentsManifest as factory parameter, or document that factory delegates manifest lookup to caller.

---

## Finding 6: Over-engineering -- 12 new files for 3 agents

- **Severity:** Medium
- **Location:** Phase 3 File Inventory
- **Flaw:** Phase 3 creates 12 new files including server-tools.js extraction, build-readonly-meta-state-tools.js, build-write-meta-state-tools.js. The server-tools.js extraction refactors server.js solely so agent wrappers can import tool instances. The two build-tool helpers are thin selectors over the 31-tool dict.
- **Failure scenario:** The server-tools.js extraction introduces a new module boundary. If extraction is incorrect, server breaks. The build-tool helpers duplicate the manifest static list and need updating on every tool rename.
- **Evidence:** Phase 3 File Inventory lists 12 new files + 1 server.js refactor. The simpler approach is direct imports from source modules in each wrapper.
- **Suggested fix:** Drop server-tools.js extraction and the two build-tool helpers. Have each wrapper import tools directly from source modules. Eliminates 3 files and the server.js refactor.

---

## Finding 7: MOCK_LLM marker design is unresolved

- **Severity:** Medium
- **Location:** Phase 5 Architecture -- Two design options for injecting the mock
- **Flaw:** Plan selects Option B (test-only manifest via env var) but never specifies how the MOCK_LLM string in the model field gets resolved to a mock model instance. resolveAgentModel returns the string as-is. Mastra router rejects it.
- **Failure scenario:** Phase 5 spawns server with test-only manifest. resolveAgentModel returns MOCK_LLM. Agent.generate() tries to route MOCK_LLM as a provider/model string and fails.
- **Suggested fix:** Document the chosen mock injection approach before implementation. Either monkey-patch agent instances or override resolveAgentModel in test setup.

---

## Finding 8: Test count math is inconsistent across files

- **Severity:** Medium
- **Location:** plan.md count math, Phase 2/3/5/6 success criteria
- **Flaw:** plan.md says 1155. Phase 6 says 1154-1156. Phase 5 says 7-9 tests but acceptance gate says 8. plan.md breakdown: +4+3+8=+15, 1140+15=1155. Phase 6 range comes from Phase 5 7-9 but plan.md locks at 8.
- **Failure scenario:** Implementor doesn't know which count to target. Only 8 Phase 5 tests matches plan.md 1155.
- **Evidence:** plan.md line 86: 1155. Phase 6 line 60: 1154-1156. Phase 5 line 170: 1155 expected. Phase 5 overview: 7-9 tests.
- **Suggested fix:** Lock Phase 5 at 8 tests. Update Phase 6 to 1155. Remove 7-9 range from Phase 5 overview.

---

## Finding 9: workflow-parity.test.cjs:159 line reference is wrong

- **Severity:** Low
- **Location:** plan.md, Phase 4 steps and success criteria
- **Flaw:** Plan references line 159 for the assertion to bump. Actual assertion is at line 166. Line 159 is blank.
- **Failure scenario:** Implementor looks at line 159, finds blank line, has to search. Minor confusion.
- **Evidence:** workflow-parity.test.cjs line 160: test description. Line 166: assert.equal(tools.length, 41).
- **Suggested fix:** Update references from :159 to :166.

---

## Finding 10: MASTRA_AGENTS_MANIFEST env var ownership is ambiguous

- **Severity:** Low
- **Location:** Phase 4 step 5, Phase 5 step 3
- **Flaw:** Phase 4 step 5 says add env var support. Phase 5 step 3 says add it if not already present. The ambiguity creates coordination gap.
- **Failure scenario:** Implementor adds in Phase 4, Phase 5 is no-op. Or skips Phase 4 thinking Phase 5 owns it.
- **Suggested fix:** Make Phase 4 the single owner. Phase 5 references Phase 4 as already done.
