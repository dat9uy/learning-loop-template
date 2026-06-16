# Brainstorm — Phase C Plan Stack Scope (C1-C7 decomposition)

**Type:** brainstorm (scope decision)
**Date:** 2026-06-16
**Slug:** phase-c-plan-scope
**Status:** consensus — Plan 2 closed 2026-06-17; Plan 3 is next unblocked
**Aligned to:** `plans/reports/productization-260612-1530-master-tracker.md` Phase C
**Predecessor:** Phase C5 coercion probe (2026-06-16) + Phase B 3-plan stack pattern (closed 2026-06-14)
**Successor:** `/ck:plan` for Plan 3 of the stack (C6+C7 operational flip)

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
| Plan 2 | Byte-identical parity on migrated subset | **CLOSED 2026-06-17.** 9 legacy namespaces pass; 75 mastra tests pass (36 parity + 5 cold-session + 3 collision + 26 existing factory/wire-format + 5 harness/smoke); 0 failures. 4-tool read-only content parity (`meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`). PR #3 code review: APPROVE-WITH-GAPS. See closeout report + CR-1 to CR-6. |
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

### Code Review Gaps from PR #3 (2026-06-17)

PR #3 (Plan 2 closeout) passed code review with **APPROVE-WITH-GAPS** — 2 critical red-team findings (R-12, R-16) marked "addressed" in closeout docs but **not actually fixed**, plus 1 partial resolution (R-03) and 4 minor doc/process items. Full review: `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md`.

| # | Source | Task | Severity | Target Plan |
|---|--------|------|----------|-------------|
| CR-1 | `package.json:34` + closeout report + PR body | **GAP-1 (HIGH): Remove caret from `zod` pin.** `package.json` has `"zod": "^4.4.3"` but closeout docs claim "Zod v4 is pinned to `4.4.3` exact (no caret)". The `z.toJSONSchema({ target: "draft-7", io: "input" })` parity gate is version-sensitive; minor version bump could break it silently. **R-12 / R-16 from red team not actually resolved.** Fix: change to `"zod": "4.4.3"`. | high (claim contradicts code) | **Plan 3 phase 1** |
| CR-2 | `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js:9, 79-80, 141-144, 166-169` | **GAP-2 (MED): Mutex bypassed in parity test.** R-03 added a `withMutex` serializer to `with-both-mcp-servers.js:49-59`, but the parity test uses `connectMcpServer` directly + `Promise.all` and bypasses the mutex. Safe today (4 read-only tools used in content parity don't race), but **Plan 3 will add write-side content parity** for the 25 currently-skip tools — parallel calls will race on `meta-state.jsonl`. Fix: route test through `withBothMcpServers`, or push mutex into `connectMcpServer`. | medium (Plan 3 prerequisite) | **Plan 3 phase 1** |
| CR-3 | `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:341` | **GAP-3 (LOW): Pre-existing cold-session test fails in isolation.** `hook mirror count (13) must match canonical (15)` fails when test is run alone, passes in `pnpm test` suite (other tests register the missing hooks first). Test-ordering dependency. Not a Plan 2 regression but a latent flake risk for Plan 3's new cold-session tests. Fix: make test self-contained (register hooks in `before()`). | low (pre-existing) | Plan 3 or quick cleanup PR |
| CR-4 | closeout report, PR body, master tracker, project changelog | **GAP-4 (LOW): Test count math fuzzy across docs.** All docs cite "70 mastra tests"; actual run is 75. Different docs counted different subsets (mastra dir only vs mastra dir + collision + cold-session E2E). Fix: use the 9-namespace anchor as the durable claim; per-file counts drift. | low (reporting) | Quick doc fix |
| CR-5 | PR commit history | **GAP-5 (LOW): Plan 2 implementation squashed into 1 commit.** Plan called for 8 separate commits, one per phase; actual is 9 commits but the code is in a single `feat(mastra)` commit (`084def1`). Historical; no fix needed for Plan 2. Lesson for Plan 3: commit per phase if implementation is large. | low (process) | Plan 3 (lesson learned) |
| CR-6 | `plans/260616-2200-phase-c-plan-2-parity/plan.md:105` | **GAP-6 (LOW): R-09 arithmetic still in plan.md.** Red team R-09 flagged incoherent "25/40" arithmetic; PR body fixed it (correctly distinguishes `tools/manifest.json` flat vs `agent-manifest.json` grouped) but plan.md unchanged. Fix: update plan.md or accept as historical. | low (doc drift) | Quick doc fix |

**Red-team findings (R-12, R-16) NOT actually resolved by Plan 2** — see CR-1. The closeout report's claim of "Zod v4 is pinned to `4.4.3` exact (no caret)" is false; package.json still has caret. This is the single most important gap to land before Plan 3.

### Closed during Plan 1 (no longer deferred)

| # | Red Team ID | Resolution |
|---|-------------|------------|
| ~~F1~~ | CRITICAL | Master tracker updated `~36` → `29 (post-Phase-A)`. Plan 1 ships 29 tools. |
| ~~F2~~ | HIGH | `coerceScalar` returns original value on no-op (matches legacy `coerceValue`). Verified at `tools/learning-loop-mastra/create-loop-tool.js:39-61`. |
| ~~F3~~ | HIGH | Phase 1 keeps 2-tool stub; all 6 stdio tests GREEN at Phase 1's commit. |
| ~~F4~~ | HIGH (partial) | Ship + document gap (operator decision). F4 is now D-10 (deferred to Plan 3 for actual resolution). |
| ~~F5~~ | HIGH | "Two-way alignment" prose correction in `phase-03`. |
| ~~F6~~ | HIGH | 1 stacked PR (5 commits). Atomic-unit pattern. |

## Plan 2 Closeout Update (2026-06-17)

Plan 2 (`plans/260616-2200-phase-c-plan-2-parity/`) shipped on branch `260616-2200-phase-c-plan-2-parity`. Closeout report: `plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md`.

### Resolved in Plan 2 (D-1 to D-7)

| # | Source | Resolution |
|---|--------|------------|
| D-1 | Master tracker C4 | Dual-server parity harness shipped; C4 checkbox flipped to `[x]`. |
| D-2 | F7 | Full per-field structural parity via `z.toJSONSchema()` in `parity-harness.js`. |
| D-3 | F9 | Parallel cold-session E2E test for mastra manifest (`mcp-protocol-e2e.test.cjs`). |
| D-4 | F11 | `z.toJSONSchema({ target: "draft-7" })` used in parity harness. |
| D-5 | M-C5 | Automated `tools/list` collision test (`tools-list-collision.test.cjs`) — 40 + 29 = 69 distinct names. |
| D-6 | M-C1 | `tools/learning-loop-mastra/schemas.js` Plan 3 cut-over header added. |
| D-7 | namespacing | `mastra_` prefix confirmed by collision test; re-evaluation deferred to Plan 3. |

### Key correction during Plan 2

`gate_check` was removed from the read-only content-parity set. Although it returns a gate decision, it also records a ledger event in `runtime-state.jsonl`, so it is not read-only and can race with concurrent registry readers/writers. Final read-only content parity is 4 tools.

### Verification

- `pnpm test`: **1059 tests / 1058 pass / 0 fail / 1 pre-existing skip**.
- 9 legacy namespaces pass.
- 70 mastra-specific tests pass (claim); **75 actual** (per-file counts drift; see CR-4 in Code Review Gaps section below).
- 40 legacy + 29 mastra = 69 distinct tool names, zero collisions.
- PR #3 code review: **APPROVE-WITH-GAPS** — see `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` and CR-1 to CR-6 in Code Review Gaps section.

### State after Plan 2

- Master tracker Phase C: C1/C2/C3/C4/C5 `[x]`; C6/C7 `[ ]`.
- F4 finding (`meta-260616T2123Z-...-peer-mcp-server-registers-29-determ`) was `ack`-ed to extend active lifetime; resolution remains Plan 3 (D-10).
- Plan 3 (C6+C7 operational flip) is now unblocked.
- **6 code review gaps (CR-1 to CR-6) cataloged.** CR-1 (zod pin) and CR-2 (mutex bypass) are Plan 3 prerequisites.

## Next Steps

**Current state (2026-06-17 01:22 Bangkok / 18:22 UTC, post Plan 2 closeout):**

- **Plan 1 — CLOSED.** 5 commits shipped on branch `260616-1605-phase-c-plan-1-atomic-mastra-adoption` (`f28a05e`..`a92e9df`).
- **Plan 2 — CLOSED.** 5 commits shipped on branch `260616-2200-phase-c-plan-2-parity` (`084def1`..`9d80ef4`). Master tracker Phase C: C1/C2/C3/C4/C5 `[x]`, C6/C7 `[ ]`. Test gate: 9/9 legacy namespaces + 70 mastra tests = 1058 pass / 0 fail / 1 pre-existing skip.
- **F4 finding — ACTIVE (acknowledged).** `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` is now `active`; resolution path is Plan 3 (D-10). It no longer has a pending TTL.
- **Plan 3 (C6+C7 — Operational Flip) is the next unblocked plan.** 6 deferred items (D-8 to D-13) target it. D-10 (F4 gate-bypass) and D-11 (4-tool agent-manifest reconciliation) are the highest priority.

**Immediate actions (operator, in order):**

1. **Verify Plan 2 PR state.** `git log origin/main..HEAD` on branch `260616-2200-phase-c-plan-2-parity`; if not pushed, push + open PR. PR body is in `plans/260616-2200-phase-c-plan-2-parity/reports/pr-body.md`.
2. **Author Plan 3.** `/ck:plan` for `plans/260617-XXXX-phase-c-plan-3-cut-over/`. Plan 3 author reads: this brainstorm (D-8 to D-13 + CR-1 to CR-6 remain), `plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md`, PR #3 code review report, master tracker Phase C section, and the F4 finding (D-10).
3. **Land CR-1 + CR-2 in Plan 3 phase 1.** Before any write-side content parity work: (a) remove caret from `zod` pin in `package.json` (CR-1, 1-char change); (b) make mutex reliable — either route `parity-zod-to-json-schema.test.js` through `withBothMcpServers` or push mutex into `connectMcpServer` (CR-2).
4. **Resolve F4 in Plan 3.** Decide whether mastra server becomes primary with hook-layer re-implementation, or peer remains. Document decision in Plan 3 PR body.
5. **Reconcile agent-manifest.json gap (D-11 / M-C4).** Add or document the 4 missing tools (`meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede`).

**Out-of-band (not in this session's scope):**

- D-14 to D-15 (Phase D workflow + agent + storage) — separate phase, parallel dimension.
- D-16 to D-17 (CI drift check, fail-fast on manifest) — future hardening plan, not blocking.
- D-18 to D-19 (Phase G skill migration, LIM hardening) — separate tracks.
- CR-3 (cold-session test isolation) — Plan 3 or quick cleanup PR; not blocking.
- CR-4 to CR-6 (test count math, commit squashing, plan.md doc drift) — low-priority doc/process cleanup; not blocking.

**Artifacts on disk at session end (2026-06-17):**

- This brainstorm report (`plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`) — updated 2026-06-17 with Plan 2 closeout state + 6 code review gaps (CR-1 to CR-6); D-1 to D-7 resolved, D-8 to D-19 + CR-1 to CR-6 remain.
- Plan 2 plan folder (`plans/260616-2200-phase-c-plan-2-parity/`) — 8 phase files + `plan.md` + `reports/closeout-report.md` + `reports/pr-body.md`.
- Plan 2 closeout report (`plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md`) — acceptance gate, file deltas, resolved items, trade-offs.
- **PR #3 code review report** (`plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md`) — APPROVE-WITH-GAPS verdict; 6 gaps (CR-1 to CR-6) cataloged for Plan 3.
- Plan 1 closeout report (`plans/reports/phase-c-plan-1-260616-1605-closeout-report.md`, 51 lines).
- Plan 1 post-implementation review (`plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/reports/from-code-reviewer-to-planner-phase-c-plan-1-post-implementation-review.md`, 271 lines).
- Master tracker (`plans/reports/productization-260612-1530-master-tracker.md`) — C1/C2/C3/C4/C5 flipped to `[x]`; C6/C7 `[ ]`.
- `meta-state.jsonl` — change-log entry for C4 master-tracker flip (`meta-260617T0104Z-productization-260612-1530-master-tracker-md-phase-c-c4-p`), change-log entry for F9/F11 resolution (`meta-260617T0111Z-learning-loop-mastra-parity-zod-to-json-schema-test`), and F4 finding (`meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ`, status=`active` after ack).

## References

- `plans/reports/productization-260612-1530-master-tracker.md` Phase C (C1-C7 source)
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.7-§3.10 (Mastra migration contract)
- `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` (lines 77-134) — legacy coercion that C5 factory must reproduce
- `tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion` (lines 197-235) — legacy wire-format coercion
- `tools/learning-loop-mcp/__tests__/wire-format-{coercion-fix,top-level-coercion,meta-state-optional-fields,patch-recursion}.test.js` — 4 regression tests C5 must port
- `plans/260614-1259-phase-b-codegen-adoption/` — Phase B's 3-plan stack pattern
- `meta-260616T???-phase-c5-coercion-probe-resolved` (to be filed) — the 1/6 PASS probe result
