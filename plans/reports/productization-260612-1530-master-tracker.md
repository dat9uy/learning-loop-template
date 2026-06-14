# Productization Master Tracker — Meta-Surface Atomic Front (Bridge 5+6 + Mastra Migration)

**Type:** tracker (canonical, in-flight)
**Date:** 2026-06-12
**Slug:** productization-master-tracker
**Status:** active — canonical source for productization phase state
**Aligned to:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 (operator-approved contract, 2026-06-12 reframe)
**Last updated:** 2026-06-14 (Phase B scoping decision: B3+B4 atomic, B5 re-scoped to fix LIM-2 only + park LIM-1, hardening LIMs out of scope; Phase B1+B2 remain shipped; 865 pass/0 fail/1 skip baseline)
**Scope:** the meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface; the `ck:*` skill family is owned by the loop as MCP tools via Phase G (post-productization, parallel dimension)

---

## Phase A Status (as of 2026-06-13)

**Phase A is fully closed.** All 5 sub-phases (A1-A5) are `[x]`, the 8-phase implementation plan at `plans/260612-1700-meta-surface-re-debate/plan.md` is complete, and the 5 audit-trail entries (3 change-logs + 1 finding + 1 master-tracker-flip) are filed in `meta-state.jsonl`. The post-Phase A state:

- 18 ledger events in `runtime-state.jsonl` (converted from `observation-vnstock-device-slot-ledger.yaml`)
- 8 unbound product-surface schemas deleted: `capability`, `claim`, `decision`, `experiment`, `index-entry`, `observation`, `resource-budget`, `risk` (`schemas/_unbound/_README.md` documents the deletions)
- 22 product-surface MCP tools deleted (per operator adjudication 2026-06-13; the plan's 13 was extended to include the 7 `record_crud` "survivors" + 2 more); manifest reduced from 56 → 38 entries
- 40+ product-surface records archived to `records/_unbound/<schema>/<vendor>/`
- 2 new MCP tools added: `runtime_state_read` (read-only), `runtime_state_record` (operator-preflighted)
- `core/inbound-state.js#checkObservationStaleness` partitioned by `affected_system` (14 new tests)
- `core/loop-introspect.js#DISCOVERABILITY_HINTS` H14 hint added
- Cold-session test fixed (regression: was calling deleted `record_create_decision`); `pnpm test:cold-session` passes 8/8
- `pnpm test` passes 934/937 (1 skipped, 2 pre-existing failures in `migrate-rule-entry-kind.test.js` unrelated to Phase A)
- **Verified baseline (2026-06-13):** `pnpm test` is **862 tests** (861 pass, 1 skip, 0 fail, 102 suites). The delta from 937 → 862 is from the 22 tool deletions in Phase 7 (each tool's `.test.js` sibling was also removed). The 934/937 figure above was the intermediate count before the cleanup settled.

**Audit-trail entries filed (queryable via `meta_state_list`):**
- `meta-260613T0138Z-phase-a-tools-deleted` (change-log, 22 tools removed)
- `meta-260613T0138Z-schemas-deleted` (change-log, 8 schemas removed; filed under the redaction in the JSONL — see § Phase A completion)
- `meta-260613T0138Z-vnstock-device-slot-ledger-converted` (finding, code_fingerprint: script sha256, mechanism_check: true)
- `meta-260613T0138Z-master-tracker-flip` (change-log, change_target: `plans/reports/productization-260612-1530-master-tracker.md#Phase A`)
- `meta-260613T1115Z-cold-session-l2-probe-test-is-flaky-due-to-fixed-60s-timeout` (finding, **resolved** 2026-06-13; replaced by protocol-level E2E test `mcp-protocol-e2e.test.cjs`)
- `meta-260614T0107Z-cold-session-discoverability-test-rewrite-260614-eliminated` (finding, **resolved** 2026-06-13; coverage gap filled by E2E test)
- `meta-260614T0143Z-tools-learning-loop-mcp-tests-mcp-protocol-e2e-test-cjs` (change-log, surface; added protocol E2E test)
- `meta-260614T0158Z-rule-cold-session-test-must-pass-before-resolution` (change-log, semantic; restored rule from archived to active, updated pattern to `mcp-protocol-e2e-test`)

**Resolved finding (post-Phase A):** the cold-session L2 probe test was timing-sensitive (fixed 60s timeout on real `droid exec`); resolved by eliminating the flaky sub-test and adding a protocol-level E2E test using `@modelcontextprotocol/sdk` Client. See `plans/260614-0900-mcp-protocol-e2e-test/`. The gate rule `rule-cold-session-test-must-pass-before-resolution` remains **active** — pattern updated to reference the new E2E test.

**No scope change from this update.** The 2026-06-13 changes are consistency-only: the sub-phases A1-A5 are unchanged in their content; this update adds the completion summary, aligns the A2/A3 schema counts with the implementation's 8-schema deletion, and notes the aggressive 22-tool deletion (vs the plan's 13) so the next session has accurate context.

---

## Why this report exists

The 2026-06-12 reframe collapsed Bridge 5 and Bridge 6 into one atomic front called the **meta-surface**, voided Bridges 1-4, and locked a 7-step implementation order (Step 0 → Step 7, per research report §3.8). The two source documents (Mastra research report + consistency report) are **contracts**, not trackers — they tell you *what* to do, not *where you are right now*. This report is the **canonical tracker**: one file that says which phases are open, which are closed, which are blocked, and what the next checkbox is.

**Phases A-F** are the content/code/self-model phases (what the loop records, what the loop builds, what the loop learns about itself). **Phase G** is the mechanics phase (how the work gets done in a single session — the `ck:*` skill migration track). Phase G is a parallel dimension: it does not gate any of A-F and A-F do not gate it. The two halves of the tracker are independent.

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

- [x] **A1 [verified — §8 Q8 reopened 2026-06-12]** Q8: where do observations + resource budgets live? **RESOLVED via Option D (re-debate from meta-surface)**: observations live in `runtime-state.jsonl` (Phase 2 of plan 260612-1700-meta-surface-re-debate); resource budgets live in the same sidecar as `kind: 'budget-state'`. The gate logic continues to work; the budget check moved to `runtime_state_read`. Implementation: `schemas/runtime-state.schema.json` + `runtime-state.jsonl` (**18** ledger events, not 19 — the design report's "19" was an off-by-one corrected by the plan's red-team). See `plans/260612-1700-meta-surface-re-debate/plan.md` Phase 2 + Phase 3.
- [x] **A2 [inferred — F3 cascade]** Q-index: are `index-entry` / `claim` / `evidence` the right shapes? **RESOLVED**: redundant. `meta_state_relationships` (1-hop cross-ref via inverse indexes) + `meta_state_derive_status` (per-entry truth) + `loop_describe` cold tier (`.cache/loop-describe-cold.json`) cover the same surface. The 3 schemas (index-entry, claim, evidence) are deleted. **The full 8-schema deletion in Phase 8 also covers `capability` (A3), `observation` + `resource-budget` (A4), and `decision` + `experiment` + `risk` (unbound by construction — no active binding; archived to `records/_unbound/<schema>/vnstock/` per red-team #4).** See plan 260612-1700-meta-surface-re-debate Phase 8.
- [x] **A3 [inferred — §3.10 cascade]** Q-capability: `capability` schema exists but no `capability_*` tool is bound to the meta-surface. **RESOLVED**: the active rules are the canonical capability representation. The `capability` schema and all 3 `capability_*` tools are deleted. Callers query via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})` directly. **The full tool-deletion count in Phase 7 is 22, not 13 — the plan's 13 was extended by operator adjudication 2026-06-13 to also remove the 7 `record_crud` "survivors" + 2 more from the `index` group. The `capability`, `index`, and `record_crud` groups are gone from `agent-manifest.json`; net manifest count is 38 (down from 56).** See plan 260612-1700-meta-surface-re-debate Phase 7 + Phase 8.
- [x] **A4 [inferred — F3 evidence gap + §3.10 cascade]** Q-evidence + Q-resource-budget grouped. **RESOLVED**: (a) `finding.description` + `evidence_code_ref` + `evidence_journal` is the canonical evidence shape. (b) `resource-budget` is a `kind: 'budget-state'` row in `runtime-state.jsonl`. The 2 schemas (`observation`, `resource-budget`) are deleted. The 8 ledger events from `observation-vnstock-device-slot-ledger.yaml` are converted to `runtime-state.jsonl` rows; the yaml is archived to `records/_unbound/observation/`. See plan 260612-1700-meta-surface-re-debate Phase 3 + Phase 8.
- [x] **A5 [inferred — §3.10 "What the 2026-06-12 reframe eliminates" — "Product-surface binding for any record type"]** Q-bridge-5-instance. **RESOLVED**: the Bridge 5 engine stays meta-surface-only. The 4-kind meta-state union (`finding` | `change-log` | `rule` | `loop-design`) is the only binding target. Product records stay unbound and re-debated from the meta-surface. This decision locks the contract for Phase B (Bridge 5 codegen) and Phase F (Bridge 7 binding). See `AGENTS.md` §1 + `plans/260612-1700-meta-surface-re-debate/plan.md` Architecture section.

---

## Phase B — Bridge 5 Engine (Approach 3, meta-surface only)

**Bucket:** codegen for writers + validators for the 4 meta-surface entry kinds. Pre-condition: SP3 schema stability (mechanical check + 1 release cycle post-2026-06-05). Tied to Report 2 (Bridge 5 design proposal).

**Scoping (2026-06-13):** Brainstorm at `plans/reports/brainstorm-260613-1146-phase-b-bridge-5-core-fix.md`. Decisions: adapt Report 2 (update numbers), proceed despite SP3 instability (TDD catches divergence), create `core/schema-to-zod.js` fresh, B1-B2 only this session (B3-B6 deferred). SP3 check shows 15 commits to `meta-state.js` since 2026-06-05 — schemas are NOT stable but TDD Phase 0 locks the contract. Ad-hoc patches are 6 locations (not 4 as Report 2 assumed). Wire-format tests updated to assert flat arrays.

**Scoping (2026-06-14, operator consultation):** Resolved the deferred B3-B6 disposition. The 9 LIMs split into 3 distinct tracks: **(a) Phase B scope** = LIM-1, LIM-2, LIM-7 (codegen adoption + script-caller passthrough bug + 22 hand-written schemas). **(b) Hardening track** = LIM-3, 4, 5, 6, 8, 9 (caller identity, path traversal, test harness, idempotency cache, passthrough leaks). **(c) YAGNI/parked** = LIM-1 (full codegen engine recreation is premature for current meta-surface scope; park as `loop-design` entry behind Bridge 7). Decision: ship **B3 + B4 + B5(re-scoped to LIM-2 only) + B6 in one session**; hardening LIMs in a separate security/quality audit. B3+B4 is the atomic unit (codegen adoption + verification gate). B6 ships post-merge as a one-line flip. Stacked PR strategy: read-only `meta_state_*` tools first, then writers.

- [x] **B1** Declare SP3 schema stability. Mechanical check: `git log --since="2026-06-05" -- tools/learning-loop-mcp/core/meta-state.js` — informational, not blocking (15 commits found; TDD Phase 0 catches divergence). **Closed 2026-06-13** via `plans/260613-1853-phase-b-bridge-5-core-fix/`.
- [x] **B2** Bridge 5 Approach 3 — codegen for writers + validators (4 meta-surface kinds). The design proposal is `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md` (Report 2). **Closed 2026-06-13** via `plans/260613-1853-phase-b-bridge-5-core-fix/`. `buildPatchSchemaFor(kind)` + `PATCH_KINDS` inlined in `core/meta-state.js`; `meta_state_patch#patch` is now a per-kind union (`.partial().strict()`); 9 ad-hoc reader patches reverted; 1 live wrap site migrated; 2 findings resolved; 1 change-log filed. Test baseline: 864 pass, 0 fail, 1 skip.
- [ ] **B3** Apply Bridge 5 output to `meta_state_*` MCP tools. Each tool becomes a thin wrapper that pulls Zod from `buildZodFor('<meta-state-kind>')`. No per-tool zod is hand-written. **Open — re-scoped 2026-06-14.** Closes LIM-7 (22 of 38 MCP tools still hand-write Zod). Migration order: read-only tools first (`meta_state_list`, `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_query_drift`, `meta_state_relationships`, `meta_state_sweep`, `loop_describe` warm tier), then writers (`meta_state_report`, `meta_state_ack`, `meta_state_resolve`, `meta_state_promote_rule`, `meta_state_propose_design`, `meta_state_log_change`, `meta_state_archive`, `meta_state_refresh_fingerprint`, `meta_state_batch`); `meta_state_patch` is already migrated via B2. Stacked PR strategy: read-only PR ships independently if writer migration hits a wall.
- [ ] **B4** Run the test suite; resolve any divergence between hand-written and generated behavior. The §3.6 byte-for-byte parity test is the gate. **Verified baseline (2026-06-13):** 864 tests (864 pass, 0 fail, 1 skip). **Open — paired with B3.** Verification per-tool after migration, then full suite at the end of the stacked PR series.
- [ ] **B5** Re-scoped 2026-06-14. **Fix LIM-2 only**: extend `buildPatchSchemaFor` (or `metaStateEntryPatchSchema`) to accept `_expected_version`, `mechanism_check`, `code_fingerprint` from script callers via `z.intersection` or scoped passthrough. ~30 lines + 3-5 tests. **Defer LIM-1** (full `core/schema-to-zod.js` recreation for B5/B6 codegen) as YAGNI for current meta-surface scope; park as `loop-design` entry behind Bridge 7 (`proposed_design_for: ['core/schema-to-zod.js']`, `addresses: ['<new finding id — to be filed when B5 ships>']`).
- [ ] **B6** Promote `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` to `status: inactive` (shipped). **Open — post-merge flip.** Trivial: one `meta_state_patch` on the loop-design entry (`status: inactive`, `shipped_in_plan: '<b3-b5-plan-dir>'`, `shipped_at: <iso>`) after B3-B5 ship + green CI. Reflects shipped state, not intended state.

**Known Limitations from B1-B2 (LIM-1 through LIM-9):**

LIMs split into 3 tracks per 2026-06-14 scoping decision. Only LIM-1, LIM-2, LIM-7 are Phase B scope. LIM-3, 4, 5, 6, 8, 9 are hardening/quality issues confirmed "next-up" — they belong in a dedicated security/quality audit, not a codegen session. LIM-1's full-codegen-engine recreation is YAGNI for the current meta-surface scope; parked as a `loop-design` entry behind Bridge 7.

| ID | Gap | Track | Status | Suggested session |
|----|-----|-------|--------|-------------------|
| LIM-1 | `core/schema-to-zod.js` recreation for B5/B6 full codegen | Phase B (YAGNI/parked) | Open (parked) | Bridge 7 dependency (loop-design) |
| LIM-2 | `metaStateEntryPatchSchema` passthrough — strict typing would reject `_expected_version`; needs `z.intersection` | Phase B | Open | B5 (re-scoped 2026-06-14) |
| LIM-3 | `meta_state_resolve` / `meta_state_log_change` lack caller-identity check; `resolved_by: "operator"` is caller-supplied | Hardening (next-up) | Open | Security audit pass |
| LIM-4 | `meta_state_refresh_fingerprint` path traversal: `join(root, "../../../etc/passwd")` not contained | Hardening (next-up, security priority) | Open | Security audit pass |
| LIM-5 | Test harness `child.kill()` SIGTERM + no temp cleanup + full `process.env` forward | Hardening (next-up) | Open | Test-hardening pass |
| LIM-6 | `meta_state_log_change` 60s `_idempotencyCache` + silent gate-log failure | Hardening (next-up) | Open | Audit-trail hardening pass |
| LIM-7 | 22 of 38 MCP tools still hand-write Zod; B3 expands `buildPatchSchemaFor` adoption | Phase B | Open | B3 |
| LIM-8 | 3 other tools use `z.object({}).passthrough()`: `trigger-workflow-tool.js:11`, `workflow-intake-plan-tool.js:20,22`, `workflow-generate-prompt-tool.js:89` | Hardening (next-up) | Open | Passthrough-removal follow-up |
| LIM-9 | `meta_state_batch` update op at `meta-state-batch-tool.js:17` still uses `.passthrough()` — `Object.assign` at line 483 accepts arbitrary keys | Hardening (next-up) | Open | Passthrough-removal follow-up |

**Scoping decision (2026-06-14, operator consultation — full reasoning):**

The 9 LIMs are not all the same shape. Conflating them under "Phase B" obscured the actual work. The 2026-06-14 operator consultation split them into 3 tracks and locked the disposition:

- **Phase B scope (3 LIMs)**: LIM-7 is the real codegen work (22 hand-written schemas → generated; load-bearing DRY win). LIM-2 is a real bug (script callers can't pass `_expected_version` / `mechanism_check` / `code_fingerprint` through the patch schema). LIM-1 is the full-codegen-engine recreation — *YAGNI for the current meta-surface scope*: the B2 inline approach is "Approach 3 lite" and the patch tool (the only load-bearing surface) is already migrated. Full codegen is only needed when other tool surfaces need it, which means product-surface binding (Bridge 7, explicitly deferred until meta-surface ships). Park LIM-1 as a `loop-design` entry with `proposed_design_for: ['core/schema-to-zod.js']` and `addresses: ['<new finding id>']`. Re-evaluate when Bridge 7 un-pauses.

- **Hardening track (6 LIMs)**: LIM-3 (caller identity), LIM-4 (path traversal), LIM-5 (test harness), LIM-6 (idempotency cache + silent gate-log), LIM-8 (3 workflow tool passthroughs), LIM-9 (`meta_state_batch` passthrough). These are security/quality issues that deserve a dedicated audit pass, not a codegen session. Confirmed "next-up" by the operator on 2026-06-14 — not blocking Phase B. File as separate `meta_state_report` findings post-Phase B; LIM-4 is the security priority (CVE-shape), batch the rest into a single audit-trail pass.

- **Sequencing inside Phase B**: B3 + B4 is the atomic unit (codegen adoption + verification gate). B5 is a small bug fix when re-scoped (LIM-2 only). B6 is a one-line metadata flip post-merge. Total: ~6-7 hours of work in one session, one stacked PR series (read-only first, then writers). The 864-test baseline + §3.6 byte-for-byte parity test is the gate. The `coerceParamsToSchema` + `installWireFormatCoercion` helpers in `tool-registry.js` (lines 77-134, 197-235) are upstream of tool execution and must compose with B3's generated schemas, not be replaced by them.

**Flaky test finding (2026-06-13, resolved):**
- `meta-260614T0107Z-cold-session-discoverability-test-rewrite-260614-eliminated` — cold-session test flaky (21 prior failures with `session_id=test-cold-session-mcp-client-loading`); the flaky sub-test was eliminated and replaced by a deterministic protocol-level E2E test at `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` using `@modelcontextprotocol/sdk` Client. Status: **resolved** (4 test cases: server init, tools/list, tools/call loop_describe, tools/call meta_state_list). Full suite: 865 pass, 0 fail, 1 skip.
- **Gate rule `rule-cold-session-test-must-pass-before-resolution` remains active** — pattern updated from `test-cold-session-mcp-client-loading` to `mcp-protocol-e2e-test`. This rule gates resolution of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` on the E2E test passing.

---

## Phase C — Mastra Phase 0-1 (coexistence + mastrafy deterministic tools)

**Bucket:** add Mastra as a peer MCP server, then cut over the ~36 meta-state deterministic tools. The runtime hook layer is unchanged (per §3.9 Mode 1 matrix). Reproduce `coerceParamsToSchema` + `installWireFormatCoercion` in Mastra's `createTool` `inputSchema` (per F7 / §3.6 / §8 Q3).

- [ ] **C1** Add `@mastra/core` + `@mastra/mcp` to a new `tools/learning-loop-mastra/` package.
- [ ] **C2** Build a parallel `MCPServer` registering the ~36 meta-state deterministic tools (`gate_check`, `meta_state_*` algorithmic, `loop_describe`, `loop_get_instruction`, the bound `record_*` minus observation per §3.10).
- [ ] **C3** Run it as a peer MCP server on stdio (different `command` entry in `.mcp.json` + `.factory/mcp.json`).
- [ ] **C4** Verify byte-identical output for the meta-surface subset. The test suite (verified 2026-06-13: 862 tests, 861 pass, 1 skip, 102 suites, 0 fail; pre-Phase A baseline was 985 tests / 147 suites) is the gate.
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

## Phase G — Skill Migration Track (post-productization, parallel dimension)

**Bucket:** move the `ck:*` skill family from session-scoped markdown skills into loop-owned MCP tools. This is a **mechanics** track, not a content/code/self-model track — Phases A-F are about *what the loop records / builds*; Phase G is about *how the work gets done* in a single session. **It can ship before, alongside, or after any of A-F, in any order** — the migration does not depend on the product surface binding.

**Why this is its own phase, not a sub-phase of A-F:** none of A-F constrain the skill-migration shape. Phase A re-debates the product surface. Phase B ships the codegen engine. Phase C-E is the Mastra migration. Phase F binds the product surface. None of these touch the question of whether `ck:plan` should be an MCP tool — that's a different axis entirely (mechanics vs. content).

**Origin (2026-06-12):** operator-confirmed in `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` §11 closeout (the dependency-balance convention + the post-productization migration target). Full design lives in `docs/trajectory.md` §4.7. Pillar-level framing: `docs/philosophy.md` Pillar 4 (Skill Authority vs. Loop Authority).

**Migration sequence (smallest-first, lowest-risk-first):**

- [ ] **G1 — `ck:plan` → `loop_plan_create` (and related) MCP tool(s).** The smallest surface, the lowest risk, the highest citation value. The MCP tool writes the plan file *and* creates a `loop-design` entry with `proposed_design_for` + the plan path as `evidence_journal`. The plan file is no longer an escape-hatch artifact the loop encounters later; it is loop-citable at creation time. The markdown skill stays as the readable spec.
- [ ] **G2 — `ck:journal` → `loop_journal_record` MCP tool.** Citation-only, no execution. The MCP tool writes to `docs/journals/...` *and* files a `finding` (or `change-log` if the journal is post-implementation) with `evidence_journal` pointing at the journal file. The journal stays a journal; what changes is that it is loop-cited.
- [ ] **G3 — `ck:cook` → `loop_cook` MCP tool.** The largest surface, the highest risk. The MCP tool reads the plan file, executes phases, files `change-log` entries per phase boundary, and checks the consult-gates (including `mechanism_check` + fingerprint freshness) before each phase. The execution is *recorded*, not *witnessed*. This is the migration that closes the 2026-05-22 `/ck:cook` bypass gap (experiment: `experiment-product-macro-cook-no-loop-20260522T055121Z.yaml`).

**Stop condition (what "owned" means for a skill):**

- (a) The MCP tool creates the loop-citable artifact.
- (b) The MCP tool records the meta-surface event at creation (a `loop-design`, `finding`, or `change-log` entry).
- (c) The MCP tool enforces the consult-gates the markdown skill was skipping (preflight markers, fingerprint freshness, plan-phase 0, etc.).

When all three are true for a given skill, that skill is loop-owned. The markdown skill remains as the readable spec and the prompt-author docs. The two-tier governance model shifts: the *citation* of a skill invocation moves into the loop, but the *execution mechanics* of internal-implementation work stays in the skill layer. The shift is citation, not replacement.

**Pre-conditions to start the track:**

- Phase A of this tracker ships (the meta-surface is stable, the sidecar is in place, the 4-kind union remains load-bearing). G1/G2 can technically start in parallel with Phase A — the convention is already in `docs/philosophy.md` Pillar 4 — but the implementation plan should be authored after Phase A's plan exists, so the codegen engine (Phase B) is available to generate the tool surface.
- The dependency-balance convention is operational — plan-file authoring is internalizing cleanly, `ck:*` skills are being cited, the contract stays meta-surface-owned. (This is a self-check: the cold-session test can grow a probe that verifies `evidence_journal` citations land on real plan files.)

**What this track is NOT:**

- **Not a replacement for skills.** The skill markdown stays. The migration is additive: the MCP tool gains authoritative ownership (cite-or-else semantics), the skill keeps its role as the readable spec.
- **Not a refactor of the 4-kind union.** The track may add a `kind: 'tool-version'` or similar to the meta-surface for MCP-tool release tracking, but it does not touch the 4-kind union. The 4 kinds stay load-bearing.
- **Not Bridge 1-4.** The product surface is unbound; the track does not depend on it shipping.
- **Not a Phase A concern.** Phase A closes the convention; the migration itself is this track. Phase A and Phase G share the convention but not the scope.
- **Not a sequential dependency for A-F.** This track can ship in parallel with any other phase.

---

## Cross-References

- **Mastra research report (contract):** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` (operator-approved contract, 2026-06-12 reframe). Source of truth for §3.7, §3.8, §3.9, §3.10, §8.
- **Consistency report (audit baseline):** `plans/reports/consistency-260612-1300-mastra-research-report.md` (9 findings, all resolved 2026-06-12).
- **Bridge 5 design proposal:** `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md` (Report 2; the proposal text for the existing `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry).
- **`meta-state.jsonl` (status mirror):** do not edit from here. The tracker is canonical; the registry is the audit trail.
- **`AGENTS.md` §10** "Where This Project Is Heading" — the 2026-06-12 reframe that makes this tracker possible (meta-surface as the only bound surface; Bridges 1-4 voided; 7-step implementation order).
- **Skill-migration design:** `docs/trajectory.md` §4.7 (origin, sequence, stop condition, pre-conditions, NOTs). Phase G of this tracker operationalizes it.
- **Skill-migration pillar:** `docs/philosophy.md` Pillar 4 (Skill Authority vs. Loop Authority). The convention that Phase G implements.
- **Skill-migration closeout:** `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` §11 (the operator-confirmed consensus that produced the dependency-balance convention and the post-productization migration target).
- **Active loop-design entry:** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (status: active; `proposed_design_for` and `addresses` empty; targeted by Report 2).
- **Resolved next-up finding:** `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (status: resolved 2026-06-13; schema derivation shipped via B2-1+B2-2+B2-3).
- **Resolved wire-format quirk finding:** `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` (status: resolved 2026-06-13; structural blocker eliminated by derived union schema).
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
- **Not a brainstorm.** Phase A is *closed* (A1-A5 flipped `[x]` 2026-06-13). Phases B-F remain open as the next work; the tracker surfaces that state, not the design.
- **Not a plan.** A plan (`plans/.../plan.md`) ships code; the tracker surfaces state. Each phase will eventually get its own plan directory; the tracker links out to those plans when they exist.
- **Not a substitute for `meta-state.jsonl`.** The registry is the source of truth for *status*; the tracker is the source of truth for *what's next*. They are co-equal canonicals, each for its own concern.
- **Not a single-dimension tracker.** Phases A-F are content/code/self-model. Phase G is mechanics (the `ck:*` skill migration track). The two halves share a tracker but are otherwise independent.

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
