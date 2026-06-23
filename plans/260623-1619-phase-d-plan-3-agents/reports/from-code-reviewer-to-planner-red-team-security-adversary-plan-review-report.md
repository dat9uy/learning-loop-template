# Security Adversary + Fact Checker Review -- Plan 3 (Mastra Agents Migration)

**Reviewer:** Security Adversary / Fact Checker
**Date:** 2026-06-23
**Plan files reviewed:** plan.md, phase-01 through phase-06

---

## Finding 1: `@mastra/core/test-utils` import subpath does not exist

- **Severity:** Critical
- **Location:** Phase 1 step 1, Phase 2 Architecture (CJS helper), Phase 5 harness
- **Flaw:** The plan references `@mastra/core/test-utils` as the import path for `createMockModel`. This subpath is NOT exported by the package. The only exported test-utils subpath is `./test-utils/llm-mock`.
- **Failure scenario:** Phase 1 step 1 runs a node import probe that exits non-zero with ERR_PACKAGE_PATH_NOT_EXPORTED. Phase 2 CJS helper does require() on the same path -- same failure. All downstream parity tests (Phase 2 invariant tests, Phase 3 direct unit tests, Phase 5 agent-parity harness) fail at import time. The entire test harness is dead on arrival.
- **Evidence:** The package exports map contains `./test-utils/llm-mock` but NOT `./test-utils`. Runtime verification confirmed: importing `@mastra/core/test-utils` produces ERR_PACKAGE_PATH_NOT_EXPORTED. The correct import `@mastra/core/test-utils/llm-mock` works (confirmed, returns createMockModel, MockProvider, MastraLanguageModelV2Mock, simulateReadableStream).
- **Suggested fix:** Replace every `@mastra/core/test-utils` reference with `@mastra/core/test-utils/llm-mock` across Phase 1 step 1 probe script, Phase 2 CJS helper, and Phase 5 harness.

---

## Finding 2: D-11 reconciliation targets wrong manifest group

- **Severity:** High
- **Location:** Phase 4 Architecture, Phase 4 step 7, plan.md count matrix
- **Flaw:** The count matrix states legacy workflow group goes 3 to 7. Phase 4 step 7 says 'Add 4 entries to the workflow group.' But the 4 D-11 tools are `meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede` -- meta_state tools, not workflow tools. The master tracker line 287 explicitly says 'Plan 3 Group 1.2 -- extended meta_state group'.
- **Failure scenario:** The legacy manifest meta_state group (15 tools) stays incomplete. The workflow group (3 tools: workflow_generate_prompt, workflow_notify_artifact, workflow_trigger) gets 4 unrelated meta_state tools appended. The runtime-agnostic-checklist reads this manifest for verification; misclassified tools confuse the tool taxonomy.
- **Evidence:** Legacy manifest has meta_state group with 15 tools and workflow group with 3 tools. D-11 tools are prefixed meta_state_*. Master tracker line 287: 'Plan 3 Group 1.2 -- extended meta_state group'.
- **Suggested fix:** Add 4 D-11 tools to legacy meta_state group (15 to 19), not workflow group (stays at 3). Update count matrix accordingly.

---

## Finding 3: `createLoopAgent` factory never passes agentsManifest -- Layer 1 dead code

- **Severity:** High
- **Location:** Phase 2 Architecture (factory code)
- **Flaw:** Factory signature is `createLoopAgent({ id, name, description, instructions, modelOverride, tools })` -- no agentsManifest parameter. Factory always calls `resolveAgentModel(id, undefined)`, so Layer 1 (per-agent manifest field) is never reached through the factory. Plan describes the factory as applying the 3-layer lookup -- misleading.
- **Failure scenario:** Future caller uses createLoopAgent without modelOverride expecting per-agent manifest field to work. It silently falls through to Layer 2 (env var) or Layer 3 (code default). Phase 3 wrappers compensate via modelOverride, so behavior is accidentally correct, but API contract does not match documentation.
- **Evidence:** Phase 2 Architecture: `const model = modelOverride ?? resolveAgentModel(id, undefined);`. Function signature has no agentsManifest field. Test 1 tests resolveAgentModel directly, not through factory.
- **Suggested fix:** Either add agentsManifest as a factory parameter, or document that Layer 1 is only accessible via modelOverride in wrapper files.

---

## Finding 4: intakeAgent tool count contradiction -- 9 in test vs 8 in checklist

- **Severity:** High
- **Location:** Phase 3 step 2 vs step 3, Function/Interface Checklist, Test Scenario Matrix
- **Flaw:** Phase 3 step 2 says Test 1 asserts 9 entries. Step 3 says 'Phase 3 ships 8 read-only tools.' Checklist says 8 entries. Test Matrix says '8 read-only tools.' Scout step 9 confirms scout has 9 (8+runScoutTool), so intake has 8.
- **Failure scenario:** Implementer following step 2 writes test asserting 9 tools. buildReadOnlyMetaStateTools() returns 8. Test fails RED, never turns GREEN. Implementer must reconcile contradiction across 4 places.
- **Evidence:** Step 2: 'tools has 9 entries.' Step 3: '8 read-only tools.' Checklist: '8 entries.' Test Matrix: '8 read-only tools.'
- **Suggested fix:** Change step 2 assertion from 9 to 8. Add comment about canonical name resolution (mastra_meta_state_get_relationship resolved to mastra_meta_state_relationships).

---

## Finding 5: MASTRA_AGENTS_MANIFEST env var enables arbitrary code execution

- **Severity:** High
- **Location:** Phase 4 Architecture, Phase 5 architecture
- **Flaw:** The env var allows pointing server.js to an arbitrary JSON file. entry.file from that JSON is passed to `await import()` with no path validation, no containment check, no allowlist. Red-team accepted with 'obscurity is the protection.'
- **Failure scenario:** In CI/CD, a compromised config sets MASTRA_AGENTS_MANIFEST to a crafted manifest with file paths outside the project (e.g., `../../../attacker.js`). The dynamic import executes attacker-controlled code.
- **Evidence:** Phase 4 Architecture: `const mod = await import(entry.file)` with entry.file from JSON at AGENTS_MANIFEST_PATH. Red-team Session 2: 'No code guard; no NODE_ENV check.'
- **Suggested fix:** Validate that entry.file resolves within tools/learning-loop-mastra/. Better: use an allowlist of known agent files.

---

## Finding 6: Mastra manifest count matrix claims meta_state 19 to 20 but D-11 tools already present

- **Severity:** Medium
- **Location:** plan.md count matrix
- **Flaw:** Count matrix says mastra meta_state goes 19 to 20 with D-11. But mastra agent-manifest.json already has 19 tools including all 4 D-11 tools (propose_design, relationships, re_verify, supersede). D-11 applies ONLY to legacy manifest.
- **Failure scenario:** Implementer adds 20th tool to mastra meta_state group or wastes time investigating count mismatch.
- **Evidence:** Python verification: mastra agent-manifest.json meta_state has 19 tools, all 4 D-11 tools confirmed present.
- **Suggested fix:** Update count matrix: mastra meta_state stays at 19. Add row: legacy meta_state 15 to 19.

---

## Finding 7: Phase 3 and 4 both modify server.js with stale line references

- **Severity:** Medium
- **Location:** Phase 3 step 5, Phase 4 steps 1-4
- **Flaw:** Phase 3 extracts server.js lines 22-39 into server-tools.js. Phase 4 step 1 says 'Read server.js:18-50' -- stale line numbers after refactor.
- **Failure scenario:** After Phase 3, server.js is shorter. Phase 4 line references don't match. Implementer must re-read but plan doesn't call this out.
- **Evidence:** Phase 3 step 5: 'Extract lines 22-39.' Phase 4 step 1: 'Read server.js:18-50.'
- **Suggested fix:** Add note in Phase 4 step 1 that Phase 3 refactored server.js and line numbers changed.

---

## Finding 8: Test count math inconsistency -- 7, 8, or ~1154 depending on section

- **Severity:** Medium
- **Location:** plan.md acceptance gate, count math, Phase 5, Phase 6
- **Flaw:** Acceptance gate says 1155 (8 Phase 5 tests). Phase 5 says '7-9 tests.' Phase 6 matrix says '~1154' (7 tests). Count math says '+8 from Phase 5' (1155).
- **Failure scenario:** Implementer ships 7 tests (1154 total), Phase 6 acceptance gate fails expecting 1155.
- **Evidence:** Phase 6 matrix: '~1154.' Acceptance gate: '1155.' Count math: '+8.'
- **Suggested fix:** Lock Phase 5 at 8 tests. Update Phase 6 matrix to 1155. Remove '7-9' range.

---

## Finding 9: server-tools.js creates shared import with circular dependency risk

- **Severity:** Medium
- **Location:** Phase 3 Architecture, Phase 3 step 5
- **Flaw:** server-tools.js exports 31-tool dict. Both server.js and agent wrappers import it. But server.js dynamically imports agent wrappers, creating cycle: server.js -> agent wrappers -> server-tools.js -> tool modules.
- **Failure scenario:** If createLoopTool has top-level dependencies on server.js state, circular import produces uninitialized tool dict for agent wrappers.
- **Evidence:** Phase 3 describes extraction pattern. Current create-loop-tool.js imports only from ./schema-parity.js (no server deps), so risk is low but unverified.
- **Suggested fix:** Verify createLoopTool has no server.js dependencies. Add note that server-tools.js must be a pure data module.

---

## Finding 10: runScoutTool default projectRoot may not be the project root

- **Severity:** Medium
- **Location:** Phase 3 Architecture (run-scout-tool.js)
- **Flaw:** Plan uses process.cwd() as default projectRoot. When server runs via startStdio(), process.cwd() is wherever the process started, not necessarily the project root.
- **Failure scenario:** Operator starts server from home directory. Scout pipeline walks wrong directory tree.
- **Evidence:** Phase 3: `projectRoot: z.string().default(() => process.cwd())`. Underlying runScout at run-scout.js:230 uses same pattern.
- **Suggested fix:** Use project-root anchor relative to server file location. At minimum, document the constraint.

---

## Positive Observations

(Items that clarify risk calibration.)

- MCPServerConfig.agents field confirmed in types -- wiring claim correct.
- ask_ key conversion logic confirmed in MCP package -- naming matches.
- createMockModel exists at claimed file path -- only export subpath is wrong.
- Cold-session test reads legacy manifest, not mastra one -- non-interference claim correct.
- Zero dotenv references in loop packages -- confirmed by grep.
- Agent memory field is optional (confirmed in types) -- omitting it is valid.
- kimi-for-coding/k2p6 as ModelRouterModelId is string-typed (not enum) -- plan claim correct.
