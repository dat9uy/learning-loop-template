# Productization Master Tracker — Meta-Surface Atomic Front (Bridge 5+6 + Mastra Migration)

**Type:** tracker (canonical, in-flight)
**Date:** 2026-06-12
**Slug:** productization-master-tracker
**Status:** active — canonical source for productization phase state
**Aligned to:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 (operator-approved contract, 2026-06-12 reframe)
**Last updated:** 2026-06-24 (Phase D Plan 4 cutover: agent-manifest.json reconciled to 44 tools across 6 groups; tools/learning-loop-mcp/tools/ moved to tools/learning-loop-mastra/tools/legacy/; #mcp/* import alias deleted; MCP server key renamed learning-loop-mastra → learning-loop in .mcp.json + .factory/mcp.json + .claude/settings.local.json; D9/D15 flipped ✅ DONE; E1/E4 flipped ✅ DONE; E2 flipped 🟡 PARTIAL; §3.10 + AGENTS.md §1+§2 reconciled; 1 semantic change-log filed; journal + PR body drafted)
**Scope:** the meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface; the `ck:*` skill family is owned by the loop as MCP tools via Phase G (post-productization, parallel dimension)

---

## Current State Snapshot (as of 2026-06-17)

| State | Phases / Items |
|-------|----------------|
| **Done** | Phase A (A1–A5) — product-surface re-debate closed 2026-06-13. Phase B (B1–B6) — Bridge 5 codegen engine + LIM-2 fix + loop-design flip closed 2026-06-14. LIM-2 and LIM-7 resolved. |
| **Open** | Phase C — Mastra Phase 0-1 (coexistence + deterministic tools); Plan 1, Plan 1a, Plan 2, Plan 3 closed. Phase D — Mastra Phase 2-3 (workflows + agents + storage); Plan 1 (D1+D2+D3) + Plan 2 (D5+D6) closed; Plans 3-4 open. Phase E — Mastra Phase 4-5 (cut over). Phase F — Bridge 7 (product-surface binding). Phase G — Skill Migration Track (`ck:*` → MCP tools). |
| **Parked** | LIM-1 — full `core/schema-to-zod.js` codegen engine recreation (YAGNI for current meta-surface scope; behind Bridge 7). |
| **Next-up / Hardening** | LIM-3 (caller identity), LIM-4 (path traversal, security priority), LIM-5 (test harness), LIM-6 (idempotency cache + silent gate-log), LIM-8 (3 workflow tool passthroughs), LIM-9 (`meta_state_batch` passthrough). |

**Recommended next move:** Phase C (Mastra Phase 0-1) is the next unblocked content phase. The hardening LIMs can run in a dedicated security/quality audit in parallel or immediately before Phase C, per operator preference.

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
- **Verified baseline (2026-06-13):** all 9 test namespaces passing; see 'Test namespace anchor' near Phase C for the durable anchor. (Count was 862 tests / 861 pass / 1 skip / 0 fail / 102 suites at the time; counts drift.) The delta from 937 → 862 was from the 22 tool deletions in Phase 7 (each tool's `.test.js` sibling was also removed). The 934/937 figure above was the intermediate count before the cleanup settled.

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
- [x] **B3** Apply Bridge 5 output to `meta_state_*` MCP tools. **Closed 2026-06-14** via `plans/260614-1259-phase-b-codegen-adoption/phase-01-b3-b4-codegen-adoption-and-verification.md`. Migrated only the 2 genuine codegen candidates (`meta_state_log_change`, `meta_state_propose_design`) using `.pick()` / `.merge()` projections from `metaStateEntrySchema`. Reclassified `meta_state_promote_rule`, `meta_state_batch`, `meta_state_resolve`, `meta_state_supersede` as NOT candidates. Test baseline preserved.
- [x] **B4** Run the test suite; resolve any divergence between hand-written and generated behavior. **Closed 2026-06-14** via `plans/260614-1259-phase-b-codegen-adoption/phase-01-b3-b4-codegen-adoption-and-verification.md`. Verified baseline: 886 tests (886 pass, 0 fail, 1 skip, 105 suites). Wire-format coercion regression tests pass.
- [x] **B5** Re-scoped 2026-06-14. **Fix LIM-2 only**: extend `meta_state_patch` tool schema with top-level `mechanism_check` and `code_fingerprint` optional fields; handler forwards them into `patch` for `entry_kind: 'finding'` (code_fingerprint remains immutable, use `meta_state_refresh_fingerprint`). **Closed 2026-06-14** via `plans/260614-1259-phase-b-codegen-adoption/phase-02-b5-lim-2-script-caller-passthrough-fix.md`. Rejected `z.intersection` design (breaks wire-format coercion). **Defer LIM-1** (full `core/schema-to-zod.js` recreation for B5/B6 codegen) as YAGNI for current meta-surface scope; park as `loop-design` entry behind Bridge 7 (`proposed_design_for: ['core/schema-to-zod.js']`, `addresses: ['<new finding id — to be filed when B5 ships>']`).
- [x] **B6** Promote `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` to `status: inactive` (shipped). **Closed 2026-06-14** via `plans/260614-1259-phase-b-codegen-adoption/phase-03-b6-loop-design-flip.md`. One `meta_state_patch` call flipped status active → inactive and populated `shipped_in_plan: 'plans/260614-1259-phase-b-codegen-adoption'` + `shipped_at: 2026-06-14T10:36:12.742Z`.

**Known Limitations from B1-B2 (LIM-1 through LIM-9):**

LIMs split into 3 tracks per 2026-06-14 scoping decision. Only LIM-1, LIM-2, LIM-7 are Phase B scope. LIM-3, 4, 5, 6, 8, 9 are hardening/quality issues confirmed "next-up" — they belong in a dedicated security/quality audit, not a codegen session. LIM-1's full-codegen-engine recreation is YAGNI for the current meta-surface scope; parked as a `loop-design` entry behind Bridge 7.

| ID | Gap | Track | Status | Suggested session |
|----|-----|-------|--------|-------------------|
| LIM-1 | `core/schema-to-zod.js` recreation for B5/B6 full codegen | Phase B (YAGNI/parked) | Open (parked) | Bridge 7 dependency (loop-design) |
| LIM-2 | `meta_state_patch` script-caller passthrough for `mechanism_check` / `code_fingerprint` | Phase B | **Resolved 2026-06-14** via `plans/260614-1259-phase-b-codegen-adoption/phase-02-b5-lim-2-script-caller-passthrough-fix.md` | B5 |
| LIM-3 | `meta_state_resolve` / `meta_state_log_change` lack caller-identity check; `resolved_by: "operator"` is caller-supplied | Hardening (next-up) | Open | Security audit pass |
| LIM-4 | `meta_state_refresh_fingerprint` path traversal: `join(root, "../../../etc/passwd")` not contained | Hardening (next-up, security priority) | Open | Security audit pass |
| LIM-5 | Test harness `child.kill()` SIGTERM + no temp cleanup + full `process.env` forward | Hardening (next-up) | Open | Test-hardening pass |
| LIM-6 | `meta_state_log_change` 60s `_idempotencyCache` + silent gate-log failure | Hardening (next-up) | Open | Audit-trail hardening pass |
| LIM-7 | 22 of 38 MCP tools still hand-write Zod; B3 expands `buildPatchSchemaFor` adoption | Phase B | **Resolved 2026-06-14** via `plans/260614-1259-phase-b-codegen-adoption/phase-01-b3-b4-codegen-adoption-and-verification.md` | B3 |
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

**Bucket:** add Mastra as a peer MCP server, then cut over the deterministic meta-surface tools. The runtime hook layer is unchanged (per §3.9 Mode 1 matrix). Reproduce `coerceParamsToSchema` + `installWireFormatCoercion` in Mastra's `createTool` `inputSchema` only if a Mastra envelope probe proves it is necessary (per F7 / §3.6 / §8 Q3, revised 2026-06-14).

### Phase C design direction (2026-06-14 brainstorm)

- **Package location:** new `tools/learning-loop-mastra/` package, separate from the legacy `tools/learning-loop-mcp/` server. Keeps the existing server untouched during coexistence.
- **Tool subset:** deterministic meta-surface tools only — `gate_check`, `gate_mark_preflight`, `runtime_state_read`, `runtime_state_record`, `loop_describe`, `loop_get_instruction`, and all `meta_state_*` algorithmic tools. Workflow tools (`workflow_*`) are excluded; they move to Phase D.
- **Coercion (resolved 2026-06-16 via runtime probe):** install previously blocked by the bash gate's package-manager constraint reading the deleted `records/observations/*.yaml` surface; unblocked by `meta-260614T1842Z-the-bash-gate-still-reads-constraint-observations-from-recor` (resolved 2026-06-14, switched `core/file-readers.js#readRuntimeObservations` to `runtime-state.jsonl`). Probe ran in `/tmp/mastra-probe.E2yMsg` against `@mastra/core` `createTool({inputSchema})` with 6 wire-format cases (cross-referenced to `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js`). Result: **1 of 6 PASS** — Mastra's `coerceStringifiedJsonValues` retry pass at `packages/core/src/tools/validation.ts` handles only string→array. It does NOT coerce string→boolean, string→number, or strip `{item: X}` envelopes (object or array). MCPServer stdio handler (`packages/mcp/src/server/server.ts`) passes raw `request.params.arguments` straight through with no envelope strip. **Decision:** use the `createLoopTool({ id, description, inputSchema, execute })` factory wrapping `inputSchema` with `z.preprocess()` for `ZodBoolean`/`ZodNumber` plus an `unwrapItem` step for `ZodArray`/`ZodObject`. Test scope owned by C5 (see below).
- **Factory shape:** `createLoopTool({ id, description, inputSchema, execute })` returns `createTool({ ... })` from `@mastra/core/tools`. The factory is the single place coercion is applied if the probe shows it is needed.
- **Parity gate:** dedicated dual-server test harness that calls both `learning-loop-mcp` and `learning-loop-mastra` with identical inputs for the migrated subset and compares outputs. Full `pnpm test` continues to run against the legacy server during Phase C; it cannot pass against Mastra until enough tools are migrated.
- **Cut over:** deferred to Phase C6/C7 only after the probe + parity harness prove byte-identical behavior on the deterministic subset.

### Phase C plan stack (2026-06-16 decision)

Phase C ships as a **3-plan stack**, mirroring Phase B's proven pattern (atomic unit → verification gate → operational flip). Plan split decided via brainstorm at `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`; operator confirmed 2026-06-16.

| Plan | Sub-phases | Purpose | Gate |
|------|-----------|---------|------|
| **Plan 1** | C1 + C2 + C3 + C5 | Atomic adoption — peer server + factory + 4 ported regression tests | All 10 test namespaces pass against legacy + 4 wire-format tests pass against factory |
| **Plan 1a** | — (corrective) | Atomic fix — 2 active findings + CR-1 + CR-2 from PR #3 review | All 10 namespaces pass; 4 RED tests GREEN; 2 findings resolved |
| **Plan 1b** | — (hygiene) | CR-3 to CR-6 + Plan 1a review followups + doc drift corrections | All 10 namespaces pass; deterministic race + inverse-map dedup + doc drift closed |
| **Plan 2** | C4 | Verification gate — byte-identical parity harness | All 10 test namespaces pass against both servers; output diffs = empty |
| **Plan 3** | C6 + C7 | Operational flip — cut over + agent-manifest.json update | All 10 test namespaces pass against Mastra server post-cut-over |

**Why 3 plans, not 1 or 2:** C4 (parity gate) cannot pass without C5's factory (probe-confirmed 2026-06-16: 1/6 wire-format cases pass against raw `createTool`; `z.preprocess()` + `unwrapItem` are mandatory). C6+C7 (cut-over) is operational and should be reviewable separately from technical adoption. Phase B's 3-plan pattern (B3+B4 → B5 → B6) shipped successfully 2026-06-14 with no test regressions.

### Test namespace anchor (2026-06-16, replaces count-based baseline)

The test suite is anchored on **10 namespace directories** declared in `package.json#scripts.test`. Counts drift with each PR; namespaces are durable.

| # | Namespace | Semantic role |
|---|-----------|---------------|
| 1 | `tools/learning-loop-mcp/__tests__/` | **MCP tool contract** — main meta-surface tool surface |
| 2 | `tools/learning-loop-mcp/core/__tests__/` | Core logic invariants (sub-dir) |
| 3 | `tools/learning-loop-mcp/core/` | Core logic invariants (co-located) |
| 4 | `tools/learning-loop-mcp/scout/` | Scout helper tests |
| 5 | `tools/learning-loop-mcp/lib/` | Library helper invariants |
| 6 | `tools/learning-loop-mcp/evals/` | Runtime-agnostic feature audits |
| 7 | `tools/learning-loop-mcp/tools/` | MCP sub-tool narrow modules |
| 8 | `.claude/coordination/__tests__/` | **Meta-surface coordination** — cross-cutting rules |
| 9 | `.factory/hooks/__tests__/` | **Droid CLI hook layer** — universal-hook contract |
| 10 | `tools/learning-loop-mastra/__tests__/` | **Mastra parity surface** — deterministic tool parity + spawn infra |

**Phase C gate language:** "all 10 namespaces pass" replaces the prior "862 tests pass" formulation. Plan 2 (C4) cannot pass until the migrated tool subset is byte-identical against namespaces 1, 8, 9, 10 (the ones exercised by the deterministic tools — `__tests__/`, `.claude/coordination/__tests__/`, `.factory/hooks/__tests__/`, `learning-loop-mastra/__tests__/`).

- [x] **C1 [Plan 1]** Add `@mastra/core` + `@mastra/mcp` to a new `tools/learning-loop-mastra/` package. **Closed 2026-06-16** via `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/`.
- [x] **C2 [Plan 1]** Build a parallel `MCPServer` registering the 29 meta-state deterministic tools (post-Phase-A: 5 gate + 20 meta_state + 3 introspection + 1 runtime_agnostic — see `tools/learning-loop-mastra/tools/manifest.json` derived from `tools/learning-loop-mcp/tools/manifest.json` minus 11 workflow_*; tool list: `gate_check`, `gate_check_recurrence`, `gate_mark_preflight`, `gate_override`, `runtime_state_record`, all 20 `meta_state_*` algorithmic tools, `loop_describe`, `loop_get_instruction`, `runtime_state_read`, `check_runtime_agnostic`). The 36 figure was the pre-Phase-A total `agent-manifest.json` count (5+11+16+3+1, includes 11 workflow tools that move to Phase D). The 4 tools in `tools/manifest.json` but missing from `agent-manifest.json` (`propose_design`, `relationships`, `re_verify`, `supersede`) are a known pre-existing inconsistency between the two manifests; deferred to Plan 3 / C7. **Closed 2026-06-16** via `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/`.
- [x] **C3 [Plan 1]** Run it as a peer MCP server on stdio (different `command` entry in `.mcp.json` + `.factory/mcp.json`). **Closed 2026-06-16** via `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/`.
- [x] **C4 [Plan 2]** Verify byte-identical output for the meta-surface subset. **Closed 2026-06-17** via `plans/260616-2200-phase-c-plan-2-parity/`. All 10 test namespaces pass; 70 mastra-specific tests pass. Byte-identical parity proven via `z.toJSONSchema()` + 4-tool read-only `tools/call` content deepEqual.
- [x] **C5 [Plan 1]** Ship `createLoopTool({ id, description, inputSchema, execute })` factory in `tools/learning-loop-mastra/create-loop-tool.js`. Wrap `inputSchema` shape: `z.preprocess()` for `ZodBoolean` ("true"/"false" → bool), `ZodNumber` (`/^-?\d+(\.\d+)?$/` → number); `unwrapItem` step (gated on `ZodArray`/`ZodObject` type names) for `{item: X}` envelopes. Port these legacy regression tests to call the factory's output as the parity gate: `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js`, `wire-format-top-level-coercion.test.js`, `wire-format-meta-state-optional-fields.test.js`, **and `wire-format-patch-recursion.test.js` (the leaf-recursion case — locks Mastra's nested-object coercion behavior against the legacy `MAX_RECURSION_DEPTH = 2` recursion in `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` lines 124-134).** Legacy helpers (`coerceParamsToSchema` lines 77-134, `installWireFormatCoercion` lines 197-235) stay in the legacy server during coexistence; the factory replaces them on Mastra's side only. **Closed 2026-06-16** via `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/`.
- [x] **C5a [Plan 1a]** Corrective fixes to deterministic meta-surface tools before Plan 3 cut-over. Four stacked commits: (1) `meta_state_list` `include_archived` semantic unification — single flag surfaces all 4 terminal statuses (superseded, resolved, auto-resolved, archived); (2) `meta_state_relationships` `consolidated_into` inbound traversal — added `consolidated_into_inverse` to `buildInverseIndexes` (5 → 6 maps) and exposed `inbound.consolidated_by`; (3) `zod` exact pin (`4.4.3`) in `package.json` to protect parity gate version sensitivity; (4) in-process Promise-chain mutex in `connectMcpServer` to serialize `callTool`/`listTools` across servers sharing a `GATE_ROOT`. **Closed 2026-06-17** via `plans/260617-1138-phase-c-plan-1a-atomic-fix/`.
- [x] **C5b [Plan 1b]** Hygiene batch — cold-session test isolation (CR-3), per-tempRoot mutex scope (Plan 1a review Important), deterministic mutex race test + inverse-map dedup + coverage gap (Plan 1a review Minors 1-5), and doc drift corrections (9→10 namespaces, +4→+5/11 tests, hallucinated map names, R-09 arithmetic, `TERMINAL_STATUSES`→`EXCLUDABLE_STATUSES`). **Closed 2026-06-17** via `plans/260617-1607-phase-c-plan-1b-hygiene/`.
- [x] **C6 [Plan 3]** Cut over: replace the existing `@modelcontextprotocol/sdk` `McpServer` with the Mastra `MCPServer` for the deterministic subset. **Closed 2026-06-17** via `plans/260617-1950-phase-c-plan-3-cut-over/`. Legacy `tools/learning-loop-mcp/server.js` and `tools/learning-loop-mcp/tool-registry.js` deleted; `tools/learning-loop-mastra/server.js` is the canonical MCP server. All 10 test namespaces pass; 1040 tests pass, 0 fail, 1 skip.
- [x] **C7 [Plan 3]** Update `tools/learning-loop-mastra/agent-manifest.json` to the new group names (per §3.4 Phase 4 + §3.10 tool surface table). **Closed 2026-06-17** via `plans/260617-1950-phase-c-plan-3-cut-over/`. 5 groups (`gate`, `workflow`, `meta_state`, `introspection`, `runtime_agnostic`) with 39 `mastra_`-prefixed deterministic tools (gate=5, workflow=11, meta_state=19, introspection=3, runtime_agnostic=1); finding F4 resolved structurally by removing the peer-server bypass surface. Post-Plan-3 hygiene (2026-06-17): `meta_state_refresh_tools` deleted per `plans/260617-2352-GH-1607-plan-3-post-merge-followups/`, dropping meta_state count from 20 to 19 and total from 40 to 39.

---

## Phase D — Mastra Phase 2-3 (workflows + agents + storage)

**Bucket:** promote workflow tools to `createWorkflow`, add 3-4 agents, fold in Storage Layer. **Phase 3 is where Storage Layer folds in per §3.7.**

- [x] **D1** Promote ~8 meta-state workflow tools to `createWorkflow` (per §3.1 mapping table: `workflow_intake_orient`, `workflow_intake_plan`, `workflow_classify_prompt`, `workflow_verify_evidence`, `workflow_convert_evidence` as state machines).
- [x] **D2** Use `stateSchema` to carry orientation context across steps (replaces per-call re-orientation that today requires the agent to remember prior state).
- [x] **D3** Use `suspend`/`resume` for operator checkpoints without spinning up a new agent turn.
- [x] **D4** Add 3 meta-state agents (per §3.4 Phase 3, after 2026-06-19 reframe): `intakeAgent`, `scoutAgent`, `selfImprovementAgent`. `productBuildAgent` is dropped (AGENTS.md:215 voids legacy product-build as substrate-era; surfaces via `meta_state_log_change` per brainstorm line 23). These become MCP tools themselves (`ask_intake_agent`, etc.). **Shipped 2026-06-23 via `plans/260623-1619-phase-d-plan-3-agents/` (Plan 3: createLoopAgent factory + 3 agent wrappers + agents-manifest.json + agent parity harness; tools/list 41→44; D-11 reconciled).**
- [x] **D5** Storage Layer fold-in (per §3.7): pick LibSQL as the Mastra runtime substrate. **Workflow `stateSchema` runs + `suspend`/`resume` snapshots persist in one SQLite file (`./tools/learning-loop-mastra/data/mastra-memory.db`). Meta-state registry stays as JSONL (or future project DB), accessed via tools — NOT a Mastra Storage domain.** Meta-state migration JSONL → SQLite is OUT of scope (per research §3.7: "Likely separate file, same engine" — but the meta-state file is *not* a Mastra file). **Shipped 2026-06-20 via `plans/260619-2246-phase-d-plan-2-storage/` (Plan 2: @mastra/libsql@1.13.0 + @libsql/client wired via storage.js factory; Pattern A2a: build LoopMCPServer first, `new Mastra({ storage, mcpServers })`; 2 storage workflows + 11-test storage-parity harness; tools/list 39→41).**
- [x] **D6** Phase 3 agents' memory (Q5 from §8): **agent `memory` field OMITTED in Plan 3** (observational memory is Phase 5 per research §8 Q5; Plan 2 ships the storage substrate, not the per-agent memory config). **Cross-agent knowledge flows through the meta-state registry via tools** (per AGENTS.md §1 "Meta-surface as the only bound surface" + §6 Internalization Rule). When OM is enabled in Phase 5, each agent gets its own `resourceId`/`threadId`; cross-agent coordination stays on the registry. **Shipped 2026-06-20 via `plans/260619-2246-phase-d-plan-2-storage/` (Plan 2 ships the storage substrate; per-agent `memory` config is deferred to Phase 5 per research §8 Q5).**
- [x] **D7** Document per-agent model config (the model-agnostic claim from §2.6 / §3.3). Per-session model selection via Droid's `/model`; per-agent override via `MASTRA_AGENT_MODEL` env var. **Shipped 2026-06-23 via `plans/260623-1619-phase-d-plan-3-agents/` (Plan 3: 3-layer model lookup in createLoopAgent factory; agents-manifest.json per-agent model field; .claude/coordination/MASTRA_AGENT_MODEL.md operator reference; .envrc + .env.example for direnv workflow).**

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

## Deferred Items Backlog (snapshot 2026-06-17)

**Origin:** consolidated from `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (D-1 to D-19), the Plan 3 red-team review (`plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md`; H-2, R4, C-9), and the separate coerce-layer brainstorm (`plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md`).

**Status legend:** `🟡 READY` = plan authored, awaiting `/ck:cook`. `🔵 OPEN` = no plan yet. `⚪ DEFERRED` = operator-decision deferred; no due date. `🟢 SHIPPED` = resolved in a prior plan.

### Phase C continuation (Plan 3 ready; ships next)

| ID | Task | Severity | Status | Source |
|----|------|----------|--------|--------|
| D-8 | C6 cut-over — replace legacy `McpServer` with Mastra `MCPServer` for the deterministic subset | high | 🟡 READY | `plans/260617-1950-phase-c-plan-3-cut-over/` (single phase, 1 commit, 1-2h) |
| D-9 | C7 manifest update — `tools/learning-loop-mastra/agent-manifest.json` 6-group structure with 44 tools (gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3) | high | ✅ DONE (Plan 4, 2026-06-24) | `plans/260624-1111-phase-d-plan-4-cutover/phase-02-manifest-reconciliation.md` |
| D-10 | F4 gate-bypass resolution — `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` closed structurally (peer removed) | high (security) | 🟡 READY (Plan 3) | `plans/260617-1950-phase-c-plan-3-cut-over/phase-01` Group 15; fingerprint anchor at `tools/learning-loop-mastra/server.js:13` |
| D-11 | Reconcile 4 tools missing from legacy `agent-manifest.json` (`propose_design`, `relationships`, `re_verify`, `supersede`) | medium | ✅ DONE (Plan 3, 2026-06-23) | Plan 3 Phase 4 — extended `meta_state` group 15→19 |
| D-13 | F4 PR security note in PR body | low (process) | 🟡 READY (Plan 3) | Plan 3 Group 19.4 PR body |

### Phase D (workflow + agent + storage migration)

| ID | Task | Severity | Status | Source |
|----|------|----------|--------|--------|
| D-14 | Phase D — promote 8 `workflow_*` tools to `createWorkflow`; add 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`); fold in LibSQL storage as Mastra runtime substrate (workflow stateSchema + suspend/resume; meta-state stays JSONL) | high (separate phase) | 🔵 OPEN | `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (D-14 referenced) + storage design report |
| D-15 | Workflow-tool migration (D1-D3) — 10 `createWorkflow` tools (8 run_workflow_* + 2 storage workflows) | high (separate phase) | ✅ DONE (Plan 1, 2026-06-19 + Plan 2, 2026-06-20) | `plans/260618-1911-phase-d-plan-1-workflows/` (D1+D2+D3) + `plans/260619-2246-phase-d-plan-2-storage/` (storage workflows) |
| D-12 | Mode 1 (peer MCP) vs Mode 2 (single `createMastraCode({...})`) decision | medium | ⚪ DEFERRED | Operator decision 2026-06-17: defer to post-Plan 3; Phase E scope |

### Phase E (cut-over + Mastra Code Mode 1)

| ID | Task | Severity | Status | Source |
|----|------|----------|--------|--------|
| E1 | Replace legacy `learning-loop-mcp` server with Mastra-based one (the "cut over" decision) | high | ✅ DONE (Plan 4, 2026-06-24) | `plans/260624-1111-phase-d-plan-4-cutover/phase-07-legacy-cleanup-c9.md` (legacy/ move) + phase-08 (MCP server key rename) |
| E2 | Mark old server `legacy` | high | 🟡 PARTIAL (Plan 4, 2026-06-24) | `plans/260624-1111-phase-d-plan-4-cutover/phase-07-legacy-cleanup-c9.md` (tools/ moved to tools/legacy/; core/ + scout/ moved to core/legacy/ + scout/legacy/; #mcp/* alias deleted) |
| E3 | Update `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` to point at the new tool surface | high | 🔵 OPEN (Phase E scope) | tracker E3 |
| E4 | Update `agent-manifest.json` to the new group names | high | ✅ DONE (Plan 3 + Plan 4, 2026-06-24) | `plans/260623-1619-phase-d-plan-3-agents/` (6th group added) + `plans/260624-1111-phase-d-plan-4-cutover/phase-02-manifest-reconciliation.md` (44-tool total) |
| E5 | Mode 1: Mastra Code connects via MCP to the loop's `MCPServer` | high | 🔵 OPEN (Phase E scope) | tracker E5 |
| E6 | Hook layer: confirm no Mode 1 changes | high | 🔵 OPEN (Phase E scope) | tracker E6 |
| E7 | Mode 2 (same Mastra instance) decision — revisit if operator's "final Mastra-fy" vision requires single-app coupling | low | ⚪ DEFERRED (= D-12) | tracker E7 |

### Hardening / quality (separate security/quality audit)

| ID | Task | Severity | Status | Source |
|----|------|----------|--------|--------|
| D-16 | CI diff check for ported test files — `tools/ci/test-drift-check.js` fails CI if ported files drift beyond import-swap lines | low | 🔵 OPEN | `brainstorm-260616-1530-...` D-16 (Red team F10) |
| D-17 | Fail-fast on manifest errors in mastra server — `server.js:20` does `console.error` and `continue` on missing exports; should `throw` when `NODE_ENV !== 'production'` or `MANIFEST_STRICT=1` | low | 🔵 OPEN | D-17 (Post-impl review M-C2) |
| D-19 | LIM hardening — LIM-3 (caller identity), LIM-4 (path traversal, security priority), LIM-5 (test harness), LIM-6 (idempotency cache + silent gate-log), LIM-8 (3 workflow tool passthroughs), LIM-9 (`meta_state_batch` passthrough) | high (security) | 🔵 OPEN | D-19; see LIM table at line ~116 |
| H-2 | `quickstart.meta_state_query` injection surface — free-form JSON consumed at session start (`loop_describe`); no JSON schema, no semantic test, no documented consumer chain | medium (security) | 🔵 OPEN | Plan 3 red-team Security Adversary F4 |
| H-1/H-7 | `clearRegistrations` hot-reload seam — `@mastra/mcp` 1.10.0 may expose comparable internals; verify before fully removing | low | 🔵 OPEN | Plan 3 red-team Failure Mode F8; Plan 3 Group 6.2 ports to `core/mcp-server-reload.js` as interim |

### Phase G (skill migration — `ck:*` → MCP tools)

| ID | Task | Severity | Status | Source |
|----|------|----------|--------|--------|
| D-18 | Phase G — `ck:plan` → `loop_plan_create`; `ck:journal` → `loop_journal_record`; `ck:cook` → `loop_cook`. Sequential migration, smallest-first | high (parallel dimension) | 🔵 OPEN | tracker Phase G1-G3 |
| G1 | `ck:plan` → `loop_plan_create` MCP tool | medium | 🔵 OPEN | tracker Phase G1 |
| G2 | `ck:journal` → `loop_journal_record` MCP tool | medium | 🔵 OPEN | tracker Phase G2 |
| G3 | `ck:cook` → `loop_cook` MCP tool (largest surface, highest risk) | high | 🔵 OPEN | tracker Phase G3 |

### Cross-cutting (operator-decision pending; out of Phase C scope)

| ID | Task | Severity | Status | Source |
|----|------|----------|--------|--------|
| R4 | JSON key rename `learning-loop-mastra` → `learning-loop` in `.mcp.json` + `.factory/mcp.json` — cascades to AGENTS.md, Droid state, Claude Code state | low | 🔵 OPEN | Plan 3 red-team Scope & Complexity R4 (researcher B) |
| C-9 | Move `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/tools/legacy/` (or merge into existing `tools/learning-loop-mastra/tools/`); delete `#mcp/*` import alias | low | 🔵 OPEN | Plan 3 red-team Scope & Complexity C-9 |
| COERCE | Coerce layer Zod-native migration — replace `coerceScalar`/`unwrapItem`/`wrapSchema` (mastra) and `coerceParamsToSchema`/`installWireFormatCoercion` (legacy) with declarative `z.coerce.*` + `z.union` for envelope absorption. Path A. 5-7h; 1 PR; not Phase C scope | low (debt) | 🔵 OPEN | `plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md` |

### Resolved (historical — for the record)

| ID | Task | Resolved By |
|----|------|-------------|
| D-1 | C4 byte-identical parity harness | Plan 2 (`plans/260616-2200-phase-c-plan-2-parity/`) — 2026-06-17 |
| D-2 | F7 per-field `_def.typeName` parity | Plan 2 (covered by full `z.toJSONSchema()`) |
| D-3 | F9 parallel cold-session E2E for mastra manifest | Plan 2 (`mcp-protocol-e2e.test.cjs`) |
| D-4 | F11 `z.toJSONSchema()` in parity harness | Plan 2 (`parity-harness.js`) |
| D-5 | M-C5 automated `tools/list` collision test | Plan 2 (`tools-list-collision.test.cjs`; deleted in Plan 3 since no second server) |
| D-6 | M-C1 `schemas.js` Plan 3 cut-over header | Plan 2 (header added) |
| D-7 | `mastra_` prefix re-evaluation | Plan 2 (collision test confirmed) |
| CR-1 | Remove caret from `zod` pin | Plan 1a (`71262df`) — 2026-06-17 |
| CR-2 | Make mutex reliable | Plan 1a (`fca8309`) — 2026-06-17 |
| CR-3 | Cold-session test isolation | Plan 1b (`850ebc2`) — 2026-06-17 |
| CR-4 | Test count math (9 → 10 namespaces; 70 → 75 mastra tests) | Plan 1b — 2026-06-17 |
| CR-5 | Commit squashing (historical; lesson for future plans) | Plan 1b — acknowledged |
| CR-6 | Plan 2 R-09 arithmetic | Plan 1b — 2026-06-17 |
| F4 (CRITICAL) | SessionStart hook key update (`loop-surface-inject.cjs:72`) | Plan 3 Group 4 (ready, not shipped) |
| C-2 | `settings.local.json` dead `mcp__learning-loop-mcp__*` permissions | Plan 3 Group 5 (ready, not shipped) |

**Total deferred items:** 22 (5 Phase C continuation ready, 3 Phase D open, 6 Phase E, 5 hardening, 4 Phase G, 3 cross-cutting). 4 of 5 Phase C continuation items are 🟡 READY (Plan 3 ready to cook); 1 is ⚪ DEFERRED (D-12, Mode decision). **Phase C is one `/ck:cook` away from completion.**

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
- **Inactive loop-design entry:** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (status: **inactive** since 2026-06-14; shipped via plan `plans/260614-1259-phase-b-codegen-adoption/`).
- **Resolved next-up finding:** `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (status: resolved 2026-06-13; schema derivation shipped via B2-1+B2-2+B2-3).
- **Resolved wire-format quirk finding:** `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` (status: resolved 2026-06-13; structural blocker eliminated by derived union schema).
- **Related change-log:** `meta-260610T1025Z-tools-learning-loop-mcp-tool-registry-js-coerceparamstoschem` (the in-production coercion helpers that Phase C must reproduce in Mastra).
- **Phase C plan stack scope decision:** `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (2026-06-16; 3-plan stack: C1+C2+C3+C5 / C4 / C6+C7; mirrors Phase B's 3-plan pattern).

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
