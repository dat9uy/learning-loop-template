# Productization Master Tracker — Meta-Surface Atomic Front (Bridge 5+6 + Mastra Migration)

**Type:** tracker (canonical, in-flight)
**Date:** 2026-06-12
**Slug:** productization-master-tracker
**Status:** active — canonical source for productization phase state
**Aligned to:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 (operator-approved contract, 2026-06-12 reframe)
**Last updated:** 2026-06-12 (this session)
**Scope:** the meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface

---

## Why this report exists

The 2026-06-12 reframe collapsed Bridge 5 and Bridge 6 into one atomic front called the **meta-surface**, voided Bridges 1-4, and locked a 7-step implementation order (Step 0 → Step 7, per research report §3.8). The two source documents (Mastra research report + consistency report) are **contracts**, not trackers — they tell you *what* to do, not *where you are right now*. This report is the **canonical tracker**: one file that says which phases are open, which are closed, which are blocked, and what the next checkbox is.

**Update rule:** when a phase advances, edit this report FIRST, commit, then run `meta_state_log_change` with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` and a one-line `reason`. The tracker is canonical; `meta-state.jsonl` is the audit trail.

---

## Phase State Legend

- `[ ]` open
- `[x]` closed (link to plan dir / journal in the body text)
- `[~]` in progress (link to active `plans/.../plan.md` in the body text)
- `[!]` blocked (link to the finding that blocks it; cite `meta-state.jsonl` line)

---

## Phase A — Product-Surface Re-Debate (Bridge 7 question, parallel track)

**Bucket:** re-debate the unbound product-surface shapes using the meta-surface as substrate. The 2026-06-12 reframe *contractually* voids Bridges 1-4 (re-debate framing, not product work) and locks the meta-surface as the only bound surface. The *act* of re-debating is the Bridge 7 question, and it is the largest open surface. Q8 (observations) is the canonical first move but not the only one.

**Parallel track, not a blocker.** Phase A runs alongside Phase B-E. The conclusions feed Phase F (Bridge 7) but do not gate Bridge 5 engine construction or the Mastra migration.

**Inference disclosure.** Sub-phases A1-A5 are inferred from F3 of the consistency report + §3.10 "What the 2026-06-12 reframe eliminates" cascade. Only A1 (Q8) is explicitly reopened in the locked contract. The other four are open *by construction* (the meta-surface being the only bound surface means every product-surface schema is open). Each sub-phase is annotated `[verified | inferred]` so the next session knows which to defend and which to re-debate.

- [ ] **A1 [verified — §8 Q8 reopened 2026-06-12]** Q8: where do observations + resource budgets live? Options are A (5th meta-state kind, extend the union), B (separate file at root, e.g. `observations.yaml`), C (fold into `finding` entries with `kind: observation` discriminator), D (re-debate from meta-surface). Recommend D for consistency with the operator's "meta-surface is the only bound surface" intent, but a concrete answer (A/B/C) is acceptable if the meta-surface can defend it. The `gate_check` and `budget_check` tools read observations; the gate logic (`core/gate-logic.js`, `core/inbound-state.js`) reads observations; whatever storage choice we make, the gate logic must continue to work.
- [ ] **A2 [inferred — F3 cascade]** Q-index: are `index-entry` / `claim` / `evidence` the right shapes? The `meta_state_relationships` tool (added 2026-06-10) already provides 1-hop inbound/outbound cross-reference traversal via inverse indexes. The `meta_state_derive_status` tool provides per-entry truth. The `loop_describe` cold tier computes `records/meta/.cache/loop-describe-cold.json` from `meta-state.jsonl`. Decide: is the `index-entry` / `claim` schema pair still the right shape, or has the meta-surface's own tooling made them redundant?
- [ ] **A3 [inferred — §3.10 cascade]** Q-capability: `capability` schema exists but no `capability_*` tool is bound to the meta-surface (per §3.10 "What the 2026-06-12 reframe eliminates": capabilities are unbound product-surface; no tool representation). Decide: is `meta_state` `rule` entries (the 4 active rules: `rule-short-slug-for-risk-records`, `rule-no-new-artifact-types`, `rule-project-skill-boundary`, `rule-cold-session-test-must-pass-before-resolution`) the canonical capability representation, or does the loop still need a separate `capability` kind?
- [ ] **A4 [inferred — F3 evidence gap + §3.10 cascade]** Q-evidence + Q-resource-budget grouped: there is no `evidence.schema.json` (per F3); "evidence" in the meta-state is the `finding` entry's `description` + `evidence_code_ref` + `evidence_journal`. `resource-budget` is a separate schema. Decide: (a) is `finding.description` + `evidence_code_ref` + `evidence_journal` the canonical evidence shape (likely yes — quick decision), and (b) is `resource-budget` an observation variant or its own kind?
- [ ] **A5 [inferred — §3.10 "What the 2026-06-12 reframe eliminates" — "Product-surface binding for any record type"]** Q-bridge-5-instance: when Bridge 5 Approach 3 ships (Phase B), the engine *can* generate product-surface types. The locked contract says "unbound, not generated." Decide: should the engine generate product records, or stay meta-surface-only? If generate, the loop must commit to a binding target (the 4 meta-surface kinds, or 4 + product-surface additions). If stay meta-surface-only, document the rationale and defer to Phase F.

---

## Phase B — Bridge 5 Engine (Approach 3, meta-surface only)

**Bucket:** codegen for writers + validators for the 4 meta-surface entry kinds. Pre-condition: SP3 schema stability (mechanical check + 1 release cycle post-2026-06-05). Tied to Report 2 (Bridge 5 design proposal).

- [ ] **B1** Declare SP3 schema stability. Mechanical check: `git log --since="2026-06-05" -- schemas/*.schema.json` shows no diff for the 4 meta-surface kinds (`finding`, `change-log`, `rule`, `loop-design`).
- [ ] **B2** Bridge 5 Approach 3 — codegen for writers + validators (4 meta-surface kinds). The design proposal is `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md` (Report 2). Estimated cost: ~6h, 4 sub-phases.
- [ ] **B3** Apply Bridge 5 output to `meta_state_*` MCP tools. Each tool becomes a thin wrapper that pulls Zod from `buildZodFor('<meta-state-kind>')`. No per-tool zod is hand-written.
- [ ] **B4** Run the 985-test suite; resolve any divergence between hand-written and generated behavior. The §3.6 byte-for-byte parity test is the gate.
- [ ] **B5** Update `core/schema-to-zod.js` to be the single source for the 4 meta-surface kinds. Delete the 4 ad-hoc reader patches (buildRegistrySummary, fix-loop-design-refs.mjs, cold-tier-regression.test.js, fix-loop-design-refs.test.js) per the Bridge 5 design's Phase 3.
- [ ] **B6** Promote `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` to `status: inactive` (shipped) once Approach 3 lands. Run `meta_state_patch` to update the entry's `proposed_design_for` and `addresses`. Resolve `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (currently active, expires 2026-06-13).

---

## Phase C — Mastra Phase 0-1 (coexistence + mastrafy deterministic tools)

**Bucket:** add Mastra as a peer MCP server, then cut over the ~36 meta-state deterministic tools. The runtime hook layer is unchanged (per §3.9 Mode 1 matrix). Reproduce `coerceParamsToSchema` + `installWireFormatCoercion` in Mastra's `createTool` `inputSchema` (per F7 / §3.6 / §8 Q3).

- [ ] **C1** Add `@mastra/core` + `@mastra/mcp` to a new `tools/learning-loop-mastra/` package.
- [ ] **C2** Build a parallel `MCPServer` registering the ~36 meta-state deterministic tools (`gate_check`, `meta_state_*` algorithmic, `loop_describe`, `loop_get_instruction`, the bound `record_*` minus observation per §3.10).
- [ ] **C3** Run it as a peer MCP server on stdio (different `command` entry in `.mcp.json` + `.factory/mcp.json`).
- [ ] **C4** Verify byte-identical output for the meta-surface subset. The 985-test suite (verified 2026-06-12 via `pnpm test`: 984 pass, 1 skipped, 147 suites) is the gate.
- [ ] **C5** Reproduce `coerceParamsToSchema` + `installWireFormatCoercion` in Mastra's `createTool` `inputSchema` (per F7 / §3.6 / §8 Q3). The helpers are in `tools/learning-loop-mcp/tool-registry.js` lines 77-134 (`coerceParamsToSchema`) and 197-235 (`installWireFormatCoercion`); equivalent behavior in Mastra is `createTool({inputSchema})` with `.preprocess()` or a Zod transform, OR `beforeToolCall` lifecycle hook.
- [ ] **C6** Cut over: replace the existing `@modelcontextprotocol/sdk` `McpServer` with the Mastra `MCPServer` for the deterministic subset. Two servers during transition; one server post-cut-over.
- [ ] **C7** Update `tools/learning-loop-mcp/agent-manifest.json` to the new group names (per §3.4 Phase 4 + §3.10 tool surface table).

---

## Phase D — Mastra Phase 2-3 (workflows + agents + storage)

**Bucket:** promote workflow tools to `createWorkflow`, add 3-4 agents, fold in Storage Layer. **Phase 3 is where Storage Layer folds in per §3.7.**

- [ ] **D1** Promote ~8 meta-state workflow tools to `createWorkflow` (per §3.1 mapping table: `workflow_intake_orient`, `workflow_intake_plan`, `workflow_classify_prompt`, `workflow_verify_evidence`, `workflow_convert_evidence` as state machines).
- [ ] **D2** Use `stateSchema` to carry orientation context across steps (replaces per-call re-orientation that today requires the agent to remember prior state).
- [ ] **D3** Use `suspend`/`resume` for operator checkpoints without spinning up a new agent turn.
- [ ] **D4** Add 3-4 meta-state agents (per §3.4 Phase 3): `intakeAgent`, `scoutAgent`, `selfImprovementAgent`, `productBuildAgent`. These become MCP tools themselves (`ask_intake_agent`, etc.).
- [ ] **D5** Storage Layer fold-in (per §3.7): pick LibSQL as the Mastra storage backend. Meta-state in one SQLite file, Mastra memory in another. Schemas are unrelated; same engine, separate files.
- [ ] **D6** Phase 3 agents' memory (Q5 from §8): default LibSQL, separate file from meta-state. Audit whether agents need cross-session memory that single-session `Memory` doesn't provide.
- [ ] **D7** Document per-agent model config (the model-agnostic claim from §2.6 / §3.3). Per-session model selection via Droid's `/model`; per-agent override via `MASTRA_AGENT_MODEL` env var.

---

## Phase E — Mastra Phase 4-5 (cut over + embed in Mastra Code Mode 1)

**Bucket:** replace the legacy `learning-loop-mcp` server with the Mastra-based one. Embed in Mastra Code via Mode 1 (peer MCP servers) per Q6 / §8. Hook layer: confirm no Mode 1 changes (per §3.9).

- [ ] **E1** Replace the legacy `learning-loop-mcp` server with the Mastra-based one (the "cut over" decision; deferred per §3.4 Phase 4).
- [ ] **E2** Mark the old server `legacy` for one release.
- [ ] **E3** Update `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` to point at the new tool surface.
- [ ] **E4** Update `agent-manifest.json` to the new group names (per §3.4 Phase 4 + §3.10 tool surface table).
- [ ] **E5** Mode 1: Mastra Code connects via MCP to the loop's `MCPServer` (per Q6 / §8 resolved 2026-06-11). Mastra Code is the official Mastra product for coding agent runtime; TUI + Harness + Mastra Agent + LibSQL; npm `mastracode`; `createMastraCode({...})` factory.
- [ ] **E6** Hook layer: confirm no Mode 1 changes (per §3.9). Document the Mastra Code hook surface if it differs from Droid/Claude's. If it lacks an equivalent hook layer, document the gap and decide case-by-case.
- [ ] **E7** Mode 2 (same Mastra instance via `createMastraCode({...})`) decision: deferred per Q6. Only revisit if the operator's "final Mastra-fy" vision requires single-app coupling.

---

## Phase F — Bridge 7 (post-meta-surface product-surface binding)

**Bucket:** the end-state phase. Only kicks off after Phase B-E ship and the loop has meta-surface substrate to reason with. The Phase A re-debate conclusions feed this phase.

- [ ] **F1** Confirm Phase A re-debate conclusions are still right (1 release cycle of evidence since Phase A closed).
- [ ] **F2** If yes: generate product-surface records from the Bridge 5 engine, bind them to the registry. Update `core/schema-to-zod.js` to include the bound product-surface kinds.
- [ ] **F3** If no: re-debate again, document why. Reopen Phase A sub-phases as needed.
- [ ] **F4** Update `AGENTS.md` §1 to reflect the now-bound product surface (or confirm still unbound if Phase A's conclusions were "stay unbound").
- [ ] **F5** Move product-surface content from `records/<vendor>/` (archived per §3.10) to live registry, or confirm archival is the right end-state.

---

## Cross-References

- **Mastra research report (contract):** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` (operator-approved contract, 2026-06-12 reframe). Source of truth for §3.7, §3.8, §3.9, §3.10, §8.
- **Consistency report (audit baseline):** `plans/reports/consistency-260612-1300-mastra-research-report.md` (9 findings, all resolved 2026-06-12).
- **Bridge 5 design proposal:** `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md` (Report 2; the proposal text for the existing `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry).
- **`meta-state.jsonl` (status mirror):** do not edit from here. The tracker is canonical; the registry is the audit trail.
- **`AGENTS.md` §10** "Where This Project Is Heading" — the 2026-06-12 reframe that makes this tracker possible (meta-surface as the only bound surface; Bridges 1-4 voided; 7-step implementation order).
- **Active loop-design entry:** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (status: active; `proposed_design_for` and `addresses` empty; targeted by Report 2).
- **Active next-up finding:** `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (status: reported; expires 2026-06-13; cost estimate ~6h).
- **Wire-format quirk finding:** `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` (the latest empirical confirmation that the passthrough ZodObject is the structural blocker).
- **Related change-log:** `meta-260610T1025Z-tools-learning-loop-mcp-tool-registry-js-coerceparamstoschem` (the in-production coercion helpers that Phase C must reproduce in Mastra).

---

## Update Protocol (canonical, do not edit loosely)

1. **Before advancing a phase:** read the current `meta-state.jsonl` (last 50 lines, or `meta_state_list` with appropriate filters) to confirm the registry state matches the tracker. If the registry has findings the tracker doesn't know about, surface them and decide whether to add new sub-phases.
2. **Edit the tracker FIRST.** Change the checkbox from `[ ]` to `[x]` (or `[~]` for in-progress, `[!]` for blocked). Add a one-line body text with the link to the plan dir or journal.
3. **Commit the tracker change.** Trivial diff (one checkbox flip + one line of context).
4. **Run `meta_state_log_change`** with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'`, `change_dimension: 'semantic'`, and a one-line `reason` summarizing the phase advance.
5. **If the advance surfaces a new contract** (e.g., a previously-open product-surface question gets a definitive answer), follow the change-log with a `loop-design` entry or a `change-log` that locks the new contract. The tracker's job is to *reflect* contracts, not to *create* them.

**Reverse direction (rare):** if a previously-closed phase is reopened, flip `[x]` back to `[ ]`, add a body line citing the reopening, and run `meta_state_log_change` with `change_dimension: 'semantic'` and a `reason` explaining the reversal.

---

## What this report is NOT

- **Not a research report.** It cites the Mastra research report as a contract; it does not duplicate the contract.
- **Not a brainstorm.** The Phase A re-debate is *upcoming* work, not done work. The 5 sub-phases are open questions, not conclusions.
- **Not a plan.** A plan (`plans/.../plan.md`) ships code; the tracker surfaces state. Each phase will eventually get its own plan directory; the tracker links out to those plans when they exist.
- **Not a substitute for `meta-state.jsonl`.** The registry is the source of truth for *status*; the tracker is the source of truth for *what's next*. They are co-equal canonicals, each for its own concern.

---

## References

- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.7, §3.8, §3.9, §3.10, §8
- `plans/reports/consistency-260612-1300-mastra-research-report.md` (9 findings; F1-F9 resolutions)
- `AGENTS.md` §1, §10 (the 2026-06-12 reframe)
- `meta-state.jsonl` (registry; the audit trail)
- `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (active loop-design; targeted by Report 2)
- `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (active next-up finding; expires 2026-06-13)
- `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` (wire-format quirk; structural blocker)
- `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` (lines 77-134; in-production; Phase C must reproduce)
- `tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion` (lines 197-235; in-production; Phase C must reproduce)
- `__tests__/wire-format-top-level-coercion.test.js` (regression coverage for the coercion helpers)
- `__tests__/wire-format-coercion-fix.test.js` (regression coverage for the coercion helpers)
- `__tests__/wire-format-patch-recursion.test.js` (the 4 stdio regression tests for the related fix)
