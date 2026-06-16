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

## Next Steps

1. Author Plan 1 via `/ck:plan` (TDD mode recommended: factory + 4 regression tests should be test-first)
2. Update master tracker: flip C1-C5 to `[~]` when Plan 1 starts; commit + `meta_state_log_change` per update protocol
3. File this brainstorm report's consensus entry in `meta-state.jsonl` (change-log, change_target: this report)
4. Plan 2 + Plan 3 stay un-scoped in the tracker until Plan 1 ships; revisit at Plan 1 closeout

## References

- `plans/reports/productization-260612-1530-master-tracker.md` Phase C (C1-C7 source)
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.7-§3.10 (Mastra migration contract)
- `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` (lines 77-134) — legacy coercion that C5 factory must reproduce
- `tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion` (lines 197-235) — legacy wire-format coercion
- `tools/learning-loop-mcp/__tests__/wire-format-{coercion-fix,top-level-coercion,meta-state-optional-fields,patch-recursion}.test.js` — 4 regression tests C5 must port
- `plans/260614-1259-phase-b-codegen-adoption/` — Phase B's 3-plan stack pattern
- `meta-260616T???-phase-c5-coercion-probe-resolved` (to be filed) — the 1/6 PASS probe result
