# Per-workflow transport-home audit — classify the 11 workflow tools

**Baseline:** the L1 naming clarification landed this session in `docs/loop-engine.md` § "Workflow: definition vs execution" (change-log `meta-260722T2125Z-docs-loop-engine-md`). Definition = declarative ordering + per-step success contract (stateless data, bound-artifact-class, not a record kind, not agent-writable); execution = imperative shell with **3 state homes** — agent | runtime-state file (default durable) | Mastra process (exception, long suspend/resume). Transport consequence: agent/runtime-state homes are transport-portable; Mastra-homed are MCP-only.
**L2 criterion (sibling report `ak-problem-solving-260722-2050-l2-transport-capability-criterion.md`):** CLI-capable iff stateless adapter over the file-based core (no process-scoped state, no warm cache, no server-bound resource). MCP-only iff server-bound resource OR operator-only policy. **capability ≠ wiring.**
**Scope:** classify only. NO re-homing code (hard constraint — re-homing is evidence-driven and deferred). Answers P-Q3; informs P-Q1, P-Q2.
**Not a plan.** Evidence for which (if any) `run_workflow_*` leave the Mastra residue; the result decides whether any new L1 concept is needed.

---

## 0. Headline findings

1. **The drift test has a coverage blind spot, not a lumping problem.** `cli-write-tool-set-drift.test.js` reads `tools/manifest.json`, which registers **only the 3 `mastra_workflow_*` helpers** (lines 33-35). The **8 `run_workflow_*`** are registered via the Mastra workflow-registry path (`workflows-manifest.json` → `server.js`), so they are **invisible to the CLI_TOOLS/MCP_RESIDUE guard**. 8 of 11 workflow tools have no L3 classification at all. The "lumps them today" framing in the prior reports understates it: the guard doesn't lump them, it misses them.
2. **None of the 11 calls an LLM/agent.** Every workflow is single-step, no `generateText`/`streamText`/`.agent`/`model` import, no `suspend`/`resume`, no `stateSchema` cross-step accumulation. So "Mastra process (long suspend/resume)" is the home of **zero** tools in the current set — the exception home is unused. The Mastra dependence that exists is *storage* (`getParityDb()` / `LibSQLStore` / `initStorage`), not suspend/resume.
3. **The 3 helpers are NOT Mastra-bound — the `MCP_RESIDUE` "workflow registry (Mastra-bound)" label is wrong for all three.** `generate_prompt` is a stateless file read/transform; `notify_artifact` and `trigger` read a **static const** `WORKFLOW_REGISTRY` (3-entry trigger table, no warm cache, no `initStorage` — confirmed `core/workflow-registry.js:3`) plus file state (operator-message, gate-log). Re-importing per one-shot spawn is cheap and correct. They are CLI-capable by the L2 criterion. (P-Q3 answered.)

## 1. Classification table

Legend — **Home** (L1 execution home): `agent` (short deterministic, no durable state) | `runtime-state file` (durable, file-based, gate-enforceable) | `Mastra process` (process-scoped). **Transport** (L2 capability): `CLI-capable` (portable candidate) | `MCP-only`. **Reason tag** (for MCP-only): `server-state` | `operator-policy`. **In drift test?** whether the L3 guard currently sees the tool.

### 1a. The 8 `run_workflow_*` (registered via workflow registry; NOT in `manifest.json`; NOT in drift-test coverage)

| # | tool | LLM | storage | suspend/resume | process state | Home | Transport | Reason | In drift test? |
|---|------|-----|---------|----------------|---------------|------|-----------|--------|----------------|
| 1 | `run_workflow_classify_prompt` | no | no | no | no | agent | CLI-capable | — | NO (blind spot) |
| 2 | `run_workflow_prepare_runtime_request` | no | no | no | no | agent | CLI-capable | — | NO |
| 3 | `run_workflow_self_improvement` | no | no | no | no | agent | CLI-capable | — | NO |
| 4 | `run_workflow_intentional_skip` | no | no | no | no | agent | CLI-capable | — | NO |
| 5 | `run_workflow_report_phase_status` | no | no | no | no | agent | CLI-capable | — | NO |
| 6 | `run_workflow_runtime_probe` | no | no | no | no | agent | CLI-capable | — | NO |
| 7 | `run_workflow_storage_round_trip` | no | **yes** (`getParityDb`) | no | **yes** (libsql singleton) | Mastra process | MCP-only | server-state | NO |
| 8 | `run_workflow_storage_read` | no | **yes** (`getParityDb`) | no | **yes** (libsql singleton) | Mastra process | MCP-only | server-state | NO |

- **1–6 (the portable six):** pure deterministic single-step transforms (keyword score, template assembly, table lookup, arithmetic). No model, no storage, no suspend, no process state. They ARE built as Mastra workflow objects via `createLoopWorkflow` (`createWorkflow(...).then(step).commit()`), but use **no Mastra-specific feature** — the factory wrapper is mechanical, not load-bearing for their correctness. **Home = agent** (the step is its own result; no durable execution state to track). **Transport = CLI-capable.** Re-homing = unwrap from `createLoopWorkflow` to a plain handler module (the `run_workflow_*` → `pathFields: []` handler form). **Deferred** per hard constraint; the audit names them, the re-home is a separate evidence-driven step.
- **7–8 (storage):** `storage.js:30` keeps a `memoryParityDb` singleton ("a separate process cannot see this singleton"); `storage.js:60` `new LibSQLStore(...)` + `initStorage()`. A one-shot CLI process can reconstruct the *file* but not the *shared in-process client* cheaply/correctly under the `driver=memory` path, and the parity substrate is the Mastra storage surface by design. **Stays Mastra, MCP-only, reason `server-state`.** (Read is idempotent, but the substrate ownership is Mastra's; not a portable candidate without a storage adapter, which is out of scope.)

### 1b. The 3 `mastra_workflow_*` helpers (in `manifest.json` lines 33-35; in `MCP_RESIDUE` today under "workflow registry (Mastra-bound)")

| # | tool (handler `name:`) | what it does | process state | Home | Transport | Reason | In drift test? |
|---|------|-------------|--------------|------|-----------|--------|----------------|
| 9 | `workflow_generate_prompt` (`mastra_workflow_generate_prompt`) | read blueprint markdown, regex-extract skeleton, sanitize + substitute context, return structured prompt | none (const tables + `resolveRoot` file read) | agent | **CLI-capable** | — | YES (mis-labeled Mastra-bound) |
| 10 | `workflow_notify_artifact` (`mastra_workflow_notify_artifact`) | match changed path against `WORKFLOW_REGISTRY` triggers, return recommended tools, append gate-log | static const `WORKFLOW_REGISTRY` + file state (operator-message, gate-log) | runtime-state file | **CLI-capable** | — | YES (mis-labeled) |
| 11 | `workflow_trigger` (`mastra_workflow_trigger`) | look up `WORKFLOW_REGISTRY[name]`, return recommended tool sequence, append gate-log | static const `WORKFLOW_REGISTRY` + gate-log file | runtime-state file | **CLI-capable** | — | YES (mis-labeled) |

- **9 `generate_prompt`:** cleanest portable candidate. Stateless file read/transform over `tools/learning-loop-mcp/references/` via `resolveRoot`. No registry, no storage, no model. Home = agent. Portability caveat: reads blueprint files under a *different* tool subtree (`learning-loop-mcp`, not `learning-loop-mastra`); `resolveRoot` must resolve the repo root correctly in the target transport — a wiring concern, not a capability one.
- **10 `notify_artifact` / 11 `trigger`:** read the in-process `WORKFLOW_REGISTRY` singleton. **Verified static** (`core/workflow-registry.js:3` — a 3-entry const object, `globMatch` over trigger patterns; no mutable field, no warm cache, no `initStorage`). Plus file-based state: `readLastOperatorMessage` / `checkObservationStaleness` (file-derived, `core/inbound-state.js`) and `appendGateLog` (file write). By the L2 criterion these are stateless adapters over file-based state + a cheaply-reconstructable static table → **CLI-capable**, home = **runtime-state file** (they read and append the loop's file-based state). The "Mastra-bound" `MCP_RESIDUE` label conflates *the Mastra workflow registry* (live `createWorkflow` objects + `initStorage`) with *this static trigger table* — they are not the same thing; the helpers depend on the latter, not the former.

## 2. Answers to the open questions

- **P-Q3 (classify the 3 helpers separately) — ANSWERED.** The 3 helpers are a different surface from the 8 `run_workflow_*` AND are not Mastra-bound. `generate_prompt` → agent home, CLI-capable. `notify_artifact`/`trigger` → runtime-state file home, CLI-capable (registry confirmed static). The drift-test `MCP_RESIDUE` comment "workflow registry (Mastra-bound)" is wrong for all three and should be replaced with per-tool reason tags (none of these three is `server-state` or `operator-policy`; they are CLI-capable and belong out of `MCP_RESIDUE` entirely, conformance to the L2 criterion — same move as the aux-read-ish fold).
- **P-Q1 (new `kind` for per-step success records?) — ANSWERED: no, not justified by this audit.** The portable six are single-step deterministic — there is no multi-step ordering and no per-step success to record (the step's return *is* the success). The storage two already use the parity substrate. No `kind: "workflow_step"` is warranted now. It would only become relevant if a future *multi-step* deterministic workflow is re-homed to agent execution — and that workflow does not exist in the current set.
- **P-Q2 (gate-observed vs agent-asserted step success?) — does not bite for the current set.** For single-step deterministic sequences, "step N succeeded" is trivially the step's return value — there is no ordering to enforce and no gap between observed and asserted. P-Q2 only becomes live if/when a *multi-step* deterministic workflow is re-homed to the agent home (then step-success should be gate-observed, not agent-asserted, to keep ordering enforceable). Flag for then; not a prerequisite now. This confirms the predict's framing that P-Q2 lives in the runtime-state layer's contract, surfaced by — not blocking — this audit.

## 3. Drift-test gaps (L3 enforcement of the L2 criterion)

1. **Coverage blind spot (the big one).** The drift test reads `tools/manifest.json` only. The 8 `run_workflow_*` are registered via `workflows-manifest.json` → `server.js`, so they are outside the guard. A new `run_workflow_*` tool would not trip the "unclassified" assertion — it is invisible by construction. **Recommend:** extend the drift test to also enumerate `workflows-manifest.json` (resolving each to its `run_workflow_*` MCP name) and require each to be in `CLI_TOOLS` or `MCP_RESIDUE` with a reason tag. This is the L3 fix that makes the L2 criterion enforceable over the full workflow surface, not just the 3 helpers.
2. **Mis-labeling of the 3 helpers.** `MCP_RESIDUE` comment "workflow registry (Mastra-bound)" is wrong: none of the 3 depends on the live Mastra workflow runtime. They are CLI-capable. Moving them out of `MCP_RESIDUE` is conformance to the L2 criterion, the same move as the aux-read-ish fold (rec #3 of the sibling report) — and gated on the same W T2 sequencing, not a separate judgment call.
3. **Reason-tag discipline (Q-A, both reports agree).** Every `MCP_RESIDUE` entry should declare `server-state` or `operator-policy`. After this audit the only `server-state` workflow entries are the 2 storage tools; `operator-policy` remains `check_runtime_agnostic` + `update_r2_allowlist`; the 3 helpers + 5 aux-read-ish leave the residue. An untagged entry fails the test.

## 4. Side observation (out of scope, noted not solved)

`WORKFLOW_REGISTRY.recommended_tools` references `index_extract`, `index_validate`, `capability_generate` — tools **not in the current `manifest.json`**. `notify_artifact`/`trigger` return these names to callers. Either a dead forward-reference to an unbuilt index/capability subsystem, or the registry predates a manifest cleanup. Tangential to transport home; flagged for a separate sweep, not this audit.

## 5. Recommendation (sequencing, no code this session)

1. **Land this audit as the evidence** (done — this report). No new L1 concept is justified: the L1 naming clarification already covers the vocabulary; P-Q1/P-Q2 do not require a new `kind` or contract change for the current set.
2. **Extend the drift test to cover `workflows-manifest.json`** (L3 fix) so all 11 are classified, with reason tags. This is the durable, low-risk output; it can land before any re-homing.
3. **Reclassify the 3 helpers out of `MCP_RESIDUE`** as CLI-capable (conformance, gated on W T2 alongside the aux-read-ish fold) — *after* the drift test is extended, so the move is enforced, not hand-written.
4. **Defer the portable-six re-homing.** The audit names `run_workflow_classify_prompt`, `_prepare_runtime_request`, `_self_improvement`, `_intentional_skip`, `_report_phase_status`, `_runtime_probe` as CLI-capable candidates (unwrap from `createLoopWorkflow` → plain handler). No re-homing code until a plan names the unwrap contract (factory normalization in `create-loop-workflow.js` is load-bearing for MCP-path callers — `attachParityJSONSchema` / envelope stripping — and must be preserved or moved). Evidence-driven, separate plan.
5. **Storage two stay Mastra** (`server-state`); no action.

## 6. Unresolved questions

- **U-Q1:** When the portable six are re-homed, does the `createLoopWorkflow` factory's schema-normalization (`attachParityJSONSchema`, envelope strip) move into a shared pre-handler, or is it duplicated per tool? Decided by the re-homing plan, not this audit.
- **U-Q2:** `resolveRoot` in `generate_prompt` reads blueprint files under `learning-loop-mcp` — is that subtree path stable across transports, or should blueprints move under `learning-loop-mastra`? Wiring question for the re-classify step.
- **U-Q3:** The `WORKFLOW_REGISTRY` recommended-tools forward-reference (§4) — dead code or pending subsystem? Separate sweep.