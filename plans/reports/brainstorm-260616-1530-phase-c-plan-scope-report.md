# Brainstorm — Phase C Plan Stack Scope (C1-C7 decomposition)

**Type:** brainstorm (scope decision)
**Date:** 2026-06-16
**Slug:** phase-c-plan-scope
**Status:** consensus — operator picked Option A 2026-06-16
**Aligned to:** `plans/reports/productization-260612-1530-master-tracker.md` Phase C
**Predecessor:** Phase C5 coercion probe (2026-06-16) + Phase B 3-plan stack pattern (closed 2026-06-14)
**Successor:** `/ck:plan` for Plan 1 of the stack

---

## Problem

Phase C of the productization master tracker has 7 sub-phases (C1-C7) covering the Mastra migration. The question: **how do we slice C1-C7 into a stack of execution plans?** Specifically, how many sub-phases does the FIRST plan of the stack absorb?

Constraint: **C4 (byte-identical parity gate against legacy) cannot pass without C5's factory** — the 2026-06-16 coercion probe proved 1/6 wire-format cases pass against raw `createTool`; the factory's `z.preprocess()` + `unwrapItem` is mandatory. This is a hard dependency, not a preference.

## Evaluated Options

### Option A — 3-plan stack, Plan 1 = C1+C2+C3+C5 ✅ CHOSEN

- **Plan 1 (atomic adoption):** C1 (package add) + C2 (parallel MCPServer) + C3 (stdio peer) + C5 (factory + 4 ported wire-format regression tests)
- **Plan 2 (verification gate):** C4 (byte-identical parity harness, 9-namespace parity vs legacy)
- **Plan 3 (operational flip):** C6 (cut over legacy) + C7 (agent-manifest.json group names)

**Pros:**
- Mirrors Phase B's proven 3-plan pattern (atomic unit B3+B4 → single fix B5 → one-line flip B6; shipped 2026-06-14)
- Plan 2's parity gate is its own reviewable moment — separates adoption from verification
- Plan 3's cut-over is operational; bundling it with adoption conflates risk classes
- C5's factory has standalone test surface (4 ported regression tests); can ship in Plan 1 without C4's gate

**Cons:**
- 3 plans = 3 PR cycles vs. 1 (more overhead)
- Plan 1 is the heaviest (4 sub-phases); risks scope creep if C5's regression tests reveal new coercion edge cases

### Option B — 2-plan stack, Plan 1 = C1-C4+C5

- **Plan 1:** peer server + factory + parity gate (5 sub-phases)
- **Plan 2:** C6+C7 cut-over

**Pros:** Faster to cut-over; one less PR cycle.

**Cons:** Plan 1's gate and adoption are bundled; harder to bisect failures; if parity fails, adoption plan is in a hard-to-rollback state.

### Option C — 3-plan stack, Plan 1 = C1+C2+C3 only

- **Plan 1:** peer server with raw `createTool`
- **Plan 2:** C5 + C4 (factory + parity)
- **Plan 3:** C6+C7

**Pros:** Smallest first plan; peer server visible early.

**Cons:** C4 cannot pass without C5 (probe-confirmed). Plan 2 is forced to be C5+C4 in a single shot, removing the verification-gate reviewable moment. Net: no real advantage over Option A.

### Option D — 1 plan, all 7 sub-phases

**Pros:** One PR, one review.

**Cons:** Cut-over is operational and should be reviewable separately. Parity gate deserves its own moment. Too much surface for a single session.

## Final Recommendation

**Option A** (3-plan stack). Lock the stack in the master tracker when Plan 1 is authored. Plan 1's name in the master tracker: `[~] C1-C5 (atomic adoption)`.

## Rationale

1. **Dependency locks the factory into Plan 1.** C4 cannot pass without C5; C1-C3 cannot stand alone as a usable peer server (5/6 wire-format cases fail). The smallest *useful* unit is C1+C2+C3+C5.
2. **Phase B's pattern is the most recent successful analog.** Three sub-plans (atomic unit, single fix, one-line flip) shipped in one week with no test regressions. Reuse the rhythm.
3. **Parity gate as its own plan creates a clean rollback point.** If Plan 2's gate fails, Plan 1 (peer server with factory) is still shippable as a coexistence artifact — the legacy server keeps running. This is the whole point of "coexistence first, cut over second."
4. **Cut-over (Plan 3) is operational, not technical.** It requires downstream coordination (`.mcp.json` consumers, `agent-manifest.json` consumers, cold-session test fixtures). Bundling it with technical adoption conflates review audiences.

## Implementation Considerations

### Plan 1 (C1+C2+C3+C5) — atomic adoption

- **C1:** new package `tools/learning-loop-mastra/` with `package.json` declaring `@mastra/core` + `@mastra/mcp` deps. No symlink to the legacy `tools/learning-loop-mcp/` — independent package. Workspace member via `pnpm-workspace.yaml`.
- **C2:** register the ~36 deterministic tools (`gate_check`, `gate_mark_preflight`, `runtime_state_read`, `runtime_state_record`, `loop_describe`, `loop_get_instruction`, all `meta_state_*` algorithmic). Use `createLoopTool({...})` factory for each. Workflow tools (`workflow_*`) excluded per Phase D.
- **C3:** new stdio entry in `.mcp.json` + `.factory/mcp.json`. Both legacy and Mastra servers run during coexistence; agent selects by tool-name prefix in test harness only.
- **C5:** ship `tools/learning-loop-mastra/create-loop-tool.js` with the locked factory shape. Port these regression tests to call factory output:
  - `wire-format-coercion-fix.test.js`
  - `wire-format-top-level-coercion.test.js`
  - `wire-format-meta-state-optional-fields.test.js`
  - `wire-format-patch-recursion.test.js` (the leaf-recursion case — locks nested-object coercion against legacy `MAX_RECURSION_DEPTH = 2`)

### Plan 2 (C4) — verification gate

- New dual-server parity harness. Calls both `learning-loop-mcp` and `learning-loop-mastra` with identical inputs for the migrated subset; compares outputs.
- All 9 test namespaces (the durable anchor — see tracker 'Test namespace anchor' near Phase C) must pass against both servers. Counts are informational only.
- Failure mode: any divergence between legacy and Mastra output for a migrated tool → Plan 2 blocked; Plan 1 still shippable.

### Plan 3 (C6+C7) — operational flip

- C6: replace legacy `@modelcontextprotocol/sdk` `McpServer` with Mastra `MCPServer` for the deterministic subset. Two servers during transition; one server post-cut-over.
- C7: update `tools/learning-loop-mcp/agent-manifest.json` to new group names per §3.4 Phase 4 + §3.10 tool surface table. (Note: the new server lives at `tools/learning-loop-mastra/` — manifest may need a new file there, not just a rename.)

## Success Criteria

| Plan | Gate | Pass Condition |
|------|------|----------------|
| Plan 1 | All 9 test namespaces pass against legacy server | Namespace table is the durable anchor (count is informational only) |
| Plan 1 | Factory's 4 ported regression tests (in `tools/learning-loop-mcp/__tests__/wire-format-*`) | All 4 pass against `createLoopTool` output |
| Plan 2 | Byte-identical parity on migrated subset | All 9 test namespaces pass against both servers; output diffs = empty |
| Plan 3 | Cut-over subset is functional | All 9 test namespaces pass against Mastra server; `tools/list` enumerates correctly per `agent-manifest.json` |

## Risks

1. **C5 leaf-recursion port is highest-risk.** `wire-format-patch-recursion.test.js` locks behavior against legacy `coerceParamsToSchema`'s `MAX_RECURSION_DEPTH = 2` recursion in `tools/learning-loop-mcp/tool-registry.js` lines 124-134. The factory's `z.preprocess()` + `unwrapItem` may not reproduce this exactly for nested objects; pre-existing 4 tests in `tools/learning-loop-mcp/__tests__/` are the contract.
2. **C2 tool registration is ~36 tools.** Each must be ported with the correct inputSchema (the legacy server's `inputSchema` is the source of truth). Drift between legacy and Mastra schemas is the most likely parity failure in Plan 2.
3. **C3 stdio peer config.** `.mcp.json` and `.factory/mcp.json` are read by Droid/Claude Code runtime; if both entries are loaded simultaneously, `tools/list` may have ambiguous tool names. Need a tool-name prefix (e.g., `mastra_*`) or runtime isolation.
4. **C7 manifest rename.** New tool group names in `agent-manifest.json` are referenced by `core/loop-introspect.js#DISCOVERABILITY_HINTS` and possibly by `meta_state_*` filter logic. Renames must be done atomically; partial state is a discovery-time regression risk.

## Open Questions

1. **Plan 1 internal structure:** single plan dir with 4 internal sub-phases (C1/C2/C3/C5) like `plans/260614-1259-phase-b-codegen-adoption/phase-XX-...md`? Or 4 sub-plan dirs in a stack?
2. **`mechanism_check` flag for new tools:** the legacy `meta_state_patch` was extended with `mechanism_check` + `code_fingerprint` in B5. Should Plan 1 re-apply this to the Mastra-registered `meta_state_*` tools, or skip (legacy already has it)?
3. **Test runner during Plan 1:** run `pnpm test` continuously or only at sub-phase boundaries? Continuous catches regressions early; boundary-runs are faster. Phase B used boundary-runs.
4. **Cold-session test for Plan 1:** the `rule-cold-session-test-must-pass-before-resolution` gate rule (active, pattern: `mcp-protocol-e2e-test`) requires the E2E test to pass before any `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` resolution. Does Plan 1 need to update the E2E test to enumerate the new Mastra server, or is the legacy enumeration sufficient during coexistence?

## Deferred Tasks (Plan 1 Closeout Audit, 2026-06-16)

Plan 1 (`plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/`) shipped 2026-06-16 (commits `f28a05e` → `a92e9df`; 9 legacy namespaces pass, 55/55 tests in namespace 10 pass, 29 `mastra_*` tools registered, peer config in `.mcp.json` + `.factory/mcp.json`). The post-implementation review (see `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/reports/from-code-reviewer-to-planner-phase-c-plan-1-post-implementation-review.md`) cataloged all work NOT done in Plan 1 that the operator should know about before Plan 2 / Plan 3 author.

### Deferred to Plan 2 (C4 — Verification Gate)

| # | Source | Task | Severity | Origin |
|---|--------|------|----------|--------|
| D-1 | Master tracker `productization-260612-1530-master-tracker.md:185` | **C4: byte-identical parity harness** — dual-server harness that calls both `learning-loop-mcp` and `learning-loop-mastra` with identical inputs for the migrated subset and compares outputs. 9-namespace gate; namespaces 1, 8, 9 are the exercised ones for deterministic tools. | high | Plan scope split (Option A) |
| D-2 | Red team F7 (plan.md:97) | **Extend parity test to per-field `_def.typeName` equality.** Current `parity-schema-shape.test.js` only checks `Object.keys()` sort-order match. Plan 2 uses `z.toJSONSchema()` for full structural comparison. | medium | Red team finding |
| D-3 | Red team F9 (plan.md:99) | **Parallel cold-session test for mastra manifest.** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68` enumerates legacy manifest only. Plan 2 adds a parallel test that spawns the mastra server and enumerates its 29 `mastra_*` tools. | medium | Red team finding |
| D-4 | Red team F11 (plan.md:101) | **Use `z.toJSONSchema()` in parity harness** for schema comparison (covers F7 + catches Zod internal refactor drift). | medium | Red team finding |
| D-5 | Post-impl review M-C5 | **Automated `tools/list` collision test.** `mcp-config-peer.test.js` only checks file structure, not runtime. Plan 2's parity harness naturally exercises this when it spawns both servers — verify 40 + 29 = 69 distinct tool names in CI, not just by manual smoke test. | medium | Post-impl review |
| D-6 | Post-impl review M-C1 | **Add "Plan 3 cut-over note" to `schemas.js` header** (1-line patch). Red team F8 was ACCEPTED in adjudication with this disposition, but the action item was NOT applied — `schemas.js` is still 3 bare re-exports. Recommend Plan 2's first commit adds the header. | low (missed action) | Red team finding F8 |
| D-7 | `phase-04-phase-3-c3-...md:180` | **MCP client-side namespacing re-evaluation.** Research confidence 70% on `mastra_` prefix necessity. If Claude Code 1.x + Droid CLI namespace by server name, the prefix is redundant. Plan 3 (cut-over) re-evaluates; Plan 2 may surface data. | low | Plan 1 risk table |

### Deferred to Plan 3 (C6+C7 — Operational Flip)

| # | Source | Task | Severity | Origin |
|---|--------|------|----------|--------|
| D-8 | Master tracker `productization-260612-1530-master-tracker.md:187` | **C6: cut over** — replace the existing `@modelcontextprotocol/sdk` `McpServer` with the Mastra `MCPServer` for the deterministic subset. Two servers during transition; one server post-cut-over. | high | Plan scope split (Option A) |
| D-9 | Master tracker `productization-260612-1530-master-tracker.md:188` | **C7: update `tools/learning-loop-mcp/agent-manifest.json` to new group names** per §3.4 Phase 4 + §3.10 tool surface table. The new server at `tools/learning-loop-mastra/agent-manifest.json` may need a new manifest file, not just a rename. | high | Plan scope split (Option A) |
| D-10 | Red team F4 + `meta-260616T2123Z-...-peer-mcp-server-registers-29-determ` finding (24h TTL) | **Resolve F4 gate-bypass gap.** Operator decision 2026-06-16: "ship peer + document gap." The mastra peer registers 29 `mastra_*` write-side tools that bypass the legacy runtime gate layer (`.claude/coordination/hooks/` + `.factory/coordination/hooks/`). Plan 3 (C6) decides whether (a) mastra server becomes primary and hook layer is re-implemented, or (b) the peer is removed. Finding expires 2026-06-17 14:23:34Z; ack or close before then. | high (security) | Red team finding F4 + operator decision |
| D-11 | Post-impl review M-C4 | **Reconcile 4 tools missing from `agent-manifest.json`.** `tools/manifest.json` has 29 entries; `agent-manifest.json` has 25 (missing: `meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede`). Pre-existing inconsistency between the two manifests. Either add to `agent-manifest.json` or document the omission. Master tracker acknowledges on line 183. | medium | Red team finding F1 + post-impl review |
| D-12 | `plan.md:49` (Out of scope) | **Runtime gate re-implementation in Mastra.** Per `research-260611-2216` §3.9, Mode 1 (peer MCP) does NOT need gate re-implementation. Mode 2 (single Mastra instance via `createMastraCode({...})`) does. Plan 3 makes the Mode 1 → Mode 2 decision. | medium | Plan scope split |
| D-13 | `phase-04-phase-3-c3-...md:189` (PR security note) | **F4 PR security note** must be in the merged PR body. The commit message already contains it (`15a894c`); verify the PR body is the same. | low (process) | Red team finding F4 |

### Deferred to Phase D (workflow + agent + storage migration)

| # | Source | Task | Severity | Origin |
|---|--------|------|----------|--------|
| D-14 | `plan.md:78` (Out of scope) | **Phase D: workflow + agent + storage migration** — promote 11 `workflow_*` tools to `createWorkflow`, add 3-4 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`, `productBuildAgent`), fold in LibSQL storage. Separate phase, parallel dimension. | high (separate phase) | Plan scope split |
| D-15 | `plan.md:49` (Out of scope) | **Workflow-tool migration (D1-D3).** 8 `workflow_*` tools to `createWorkflow`; `stateSchema` for cross-step orientation context; `suspend`/`resume` for operator checkpoints. Phase D, not Phase C. | high (separate phase) | Plan scope split |

### Deferred to journal / future plans

| # | Source | Task | Severity | Origin |
|---|--------|------|----------|--------|
| D-16 | Red team F10 (plan.md:100) | **CI diff check for ported test files.** Test file duplication (legacy + mastra copies of wire-format-*.test.js) has no source-of-truth mechanism. Operator decision: accept with journal entry. Future plan may add `tools/ci/test-drift-check.js` that fails CI if ported files drift beyond import-swap lines. | low | Red team finding F10 |
| D-17 | Post-impl review M-C2 | **Fail-fast on manifest errors in mastra server.** `server.js:20` does `console.error` and `continue` on missing exports. Recommend `throw` when `NODE_ENV !== 'production'` or `MANIFEST_STRICT=1`. Not blocking; defer to future hardening plan. | low | Post-impl review |

### Out of scope (separate tracks, not Phase C)

| # | Source | Task | Notes |
|---|--------|------|-------|
| D-18 | `plan.md:79` | **Phase G: skill migration** (`ck:*` → MCP tools) | Parallel dimension, independent of A-F. |
| D-19 | `plan.md:80` | **LIM-3 / LIM-4 / LIM-5 / LIM-6 / LIM-8 / LIM-9 hardening** | Hardening LIMs from Phase B. Separate security/quality audit. |

### Closed during Plan 1 (no longer deferred)

| # | Red Team ID | Resolution |
|---|-------------|------------|
| ~~F1~~ | CRITICAL | Master tracker updated `~36` → `29 (post-Phase-A)`. Plan 1 ships 29 tools. |
| ~~F2~~ | HIGH | `coerceScalar` returns original value on no-op (matches legacy `coerceValue`). Verified at `tools/learning-loop-mastra/create-loop-tool.js:39-61`. |
| ~~F3~~ | HIGH | Phase 1 keeps 2-tool stub; all 6 stdio tests GREEN at Phase 1's commit. |
| ~~F4~~ | HIGH (partial) | Ship + document gap (operator decision). F4 is now D-10 (deferred to Plan 3 for actual resolution). |
| ~~F5~~ | HIGH | "Two-way alignment" prose correction in `phase-03`. |
| ~~F6~~ | HIGH | 1 stacked PR (5 commits). Atomic-unit pattern. |

## Next Steps

**Current state (2026-06-16 22:08 Bangkok / 15:08 UTC, post closeout review):**

- **Plan 1 — CLOSED.** 5 commits shipped on branch `260616-1605-phase-c-plan-1-atomic-mastra-adoption` (`f28a05e`..`a92e9df`). Master tracker Phase C: C1/C2/C3/C5 `[x]`, C4/C6/C7 `[ ]`. Test gate: 9/9 legacy namespaces + 55/55 namespace 10 = 1043 pass / 0 fail / 1 skipped. Stacked PR not yet verified as opened (the closeout report + this brainstorm + the post-impl review are the artifacts on disk).
- **F4 finding TTL — ACTIVE.** `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` (status=reported, `subtype: gate-bypass-gap`, 24h TTL). Expires 2026-06-17 14:23:34Z (21:23 Bangkok). ~23h 15min remaining. **Ack or close before TTL expires** — ack → `active` (Plan 3 owner can resolve); close → must cite the resolution.
- **Plan 2 (C4 — Verification Gate) is the next unblocked plan.** 7 deferred items (D-1 to D-7) target it, including the parity harness itself (D-1), F7/F9/F11 extensions (D-2/D-3/D-4), M-C1 missed action (D-6), and the MCP-namespacing re-evaluation (D-7).
- **Plan 3 (C6+C7 — Operational Flip) blocked by Plan 2.** 6 deferred items (D-8 to D-13). D-10 (F4 gate-bypass) needs the finding's resolution; D-11 (4-tool agent-manifest reconciliation) is independent of F4.

**Immediate actions (operator, in order):**

1. **Verify Plan 1 PR state.** `git log origin/main..HEAD` on the branch; if not pushed, push + `gh pr create`. PR body must include the security note from commit `15a894c` (F4 documentation).
2. **Resolve F4 finding TTL.** Either `meta_state_ack` (move to `active` for Plan 3 to resolve) or `meta_state_resolve` with a resolution note (e.g., "ship + document gap" → operator decision 2026-06-16 already documented in PR + journal; resolution is "documented, no further action until Plan 3").
3. **Decide whether to patch M-C1 now or defer to Plan 2's first commit.** 1-line `schemas.js` header. Either way, log the decision in this brainstorm's next-steps or in the Plan 2 first-commit message.
4. **Author Plan 2.** `/ck:plan` for `plans/260616-XXXX-phase-c-plan-2-parity/`. Plan 2 author reads: this brainstorm (now includes D-1 to D-7), `plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md`, `plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md`, `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md`, master tracker Phase C section, the post-impl review (M-C1, M-C3, M-C5), and the F4 finding (D-10 forward-dep).

**Out-of-band (not in this session's scope):**

- D-14 to D-15 (Phase D workflow + agent + storage) — separate phase, parallel dimension.
- D-16 to D-17 (CI drift check, fail-fast on manifest) — future hardening plan, not blocking.
- D-18 to D-19 (Phase G skill migration, LIM hardening) — separate tracks.

**Artifacts on disk at session end:**

- This brainstorm report (`plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`, 196 lines) — updated 2026-06-16 with D-1 to D-19 deferred-tasks audit.
- Plan 1 closeout report (`plans/reports/phase-c-plan-1-260616-1605-closeout-report.md`, 51 lines).
- Plan 1 post-implementation review (`plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/reports/from-code-reviewer-to-planner-phase-c-plan-1-post-implementation-review.md`, 271 lines) — the new code-review artifact this session produced.
- Master tracker (`plans/reports/productization-260612-1530-master-tracker.md`) — C1/C2/C3/C5 flipped to `[x]`, 29-tool count fixed.
- `meta-state.jsonl` — 2 new entries: `meta-260616T2123Z-plans-reports-...-master-tracker-md-p` (change-log) and `meta-260616T2123Z-the-learning-loop-mastra-peer-...` (F4 finding, 24h TTL).

## References

- `plans/reports/productization-260612-1530-master-tracker.md` Phase C (C1-C7 source)
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.7-§3.10 (Mastra migration contract)
- `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` (lines 77-134) — legacy coercion that C5 factory must reproduce
- `tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion` (lines 197-235) — legacy wire-format coercion
- `tools/learning-loop-mcp/__tests__/wire-format-{coercion-fix,top-level-coercion,meta-state-optional-fields,patch-recursion}.test.js` — 4 regression tests C5 must port
- `plans/260614-1259-phase-b-codegen-adoption/` — Phase B's 3-plan stack pattern
- `meta-260616T???-phase-c5-coercion-probe-resolved` (to be filed) — the 1/6 PASS probe result
