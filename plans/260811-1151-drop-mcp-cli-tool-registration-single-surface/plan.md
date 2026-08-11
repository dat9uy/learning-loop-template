---
title: "Drop MCP CLI tool registration — single surface"
description: "Pay down the MCP/CLI dual-registration debt (finding meta-260811T1106Z-...): drop MCP registration of CLI_TOOLS entirely, retire the LOOP_RECORDS_VIA_CLI + LOOP_READS_VIA_CLI flags, make the stateless CLI the single CLI tool surface, re-target the MCP wire-budget guard to the production residue, make the Claude session-start transport banner unconditional, and re-base parity/discoverability tests without conflating CLI, manifest, agent, or live-MCP surfaces."
status: pending
priority: P1
effort: "2-3d"
tags: [meta-state-tools, mcp, cli, wire-budget, contract-change, session-start-hook]
created: 2026-08-11
finding: "meta-260811T1106Z-mcp-and-cli-surfaces-run-duplicated-tool-registrations-every"
supersedes_stopgap: "plans/260811-0914-mcp-wire-budget-restore-and-glossary-extend (completed)"
red_team: "2026-08-11 — 22 consolidated findings (4 Critical, 10 High, 8 Medium), all accepted+applied"
---

# Drop MCP CLI tool registration — single surface

## Overview

The MCP server (`mastra/server.js`) retains a flag-gated registration loop that
registers all 42 `CLI_TOOLS` when `LOOP_RECORDS_VIA_CLI` is unset. **No production
runtime clears that path** — all three wired runtimes set `LOOP_RECORDS_VIA_CLI=1`, so
production MCP loads only an 8-tool residue (~4,563 bytes). The flag-unset path is
exercised by tests, and the wire-budget test deliberately boots it to measure a 44-tool /
~54,883-byte surface against a 55,000-byte ceiling. That guard has caused two consecutive
budget bumps; PR #141 restored the ceiling via glossary trim but left the structural debt.

This plan pays the debt: **remove MCP registration of `CLI_TOOLS` entirely** so the
stateless CLI (`bin/loop.mjs`) is the single tool surface for records, MCP carries only
the irreducible residue, the flags are retired, the wire-budget guard measures the residue,
the Claude session-start transport banner is unconditional, and the test suite's CLI parity
and cross-surface discoverability contracts are re-anchored without deleting bounded MCP
schema/transport coverage.

**Red-team expanded the scope materially.** The original 4-file estimate grew to touch a
production session-start hook, active runtime scripts/configs, manifest/count consumers,
MCP schema/transport checks, ~12 tests that use MCP as a parity/list oracle, 3 runtime
configs, and several more doc/comment surfaces. Effort re-estimated to 2-3 days.

Accepted direction: **Option 1** (brainstorm 2026-08-11, reaffirmed after both red-team
passes). The red-team proved the flag-gated loop is load-bearing for the test suite, but
also found that the prior plan conflated distinct surfaces. Option 1 therefore removes
CLI registration while preserving explicit MCP residue/schema coverage and separate
crosswalks for the CLI, handler manifest, agent manifest, and live MCP surface.
User-accepted risk: a future runtime wanting MCP-side record transport must re-add
registration (reversible only through the documented rollback order in Phase 5). [Red-team correction]

## Evidence (measured 2026-08-11 via __tests__/with-mcp-server.js)

| Surface | Tools | All-tools bytes | When loaded |
|---|---:|---:|---|
| CLI allowlist (`CLI_TOOLS`) | 42 | n/a | stateless CLI |
| Handler manifest (`tools/manifest.json`) | 44 | n/a | manifest/introspection |
| Classified manifest residue (`MCP_MANIFEST_RESIDUE`) | 5 | n/a | manifest/workflow partition |
| Live MCP residue (`MCP_LIVE_RESIDUE`) | 8 | 4,563 | production MCP server |
| Agent declaration (`agent-manifest.json`) | 50 | n/a | full agent/MCP declaration |
| Default flag-unset server (pre-change) | ~50 | 57,921 | test-only legacy path |

The live residue is exactly 8: `ask_intake_agent`, `ask_scout_agent`,
`ask_self_improvement_agent`, `mastra_check_runtime_agnostic`,
`mastra_update_r2_allowlist`, `mastra_workflow_generate_prompt`,
`run_workflow_storage_read`, and `run_workflow_storage_round_trip`. The five-entry
classification remains bare-name data; live assertions must use the server's exact
`mastra_`/`run_`/`ask_` names. Re-anchored wire-budget ceiling: **6,000 all-tools
bytes** (1,437 B headroom over 4,563). The measurement script is committed under
`__tests__/helpers/` so the ceiling is re-checkable. [Red-team corrections 1, 5, 10]

Arithmetic guard required by Phase 2: 44 handler-manifest entries = 42 CLI entries + 2
manifest-only entries; live MCP = 2 manifest-only handlers + 1 allowlist tool + 2 storage
workflow tools + 3 agent tools = 8. The 50 agent declarations are a separate contract,
not a CLI count. [Red-team correction 10]

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | MCP server never registers `CLI_TOOLS` in any config | P1 |
| 2 | Claude session-start transport banner is unconditional for valid config; degraded config path remains safe | P1 |
| 3 | Wire-budget guard measures the production residue (ceiling 6,000 all-tools) | P1 |
| 4 | Test suite re-anchors: CLI state parity + normalized direct oracle; bounded MCP transport/schema coverage; split cold-session contracts | P1 |
| 5 | Flags retired from `server.js`, the hook, 3 runtime configs, all tests, all evergreen docs/comments | P1 |
| 6 | `pnpm test` green; ship as PR; resolve the finding | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Production code — registration + hook + comments](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Guard-test re-target](./phase-02-re-target-guard-tests-to-residue-surface.md) | Pending |
| 3 | [Phase 3: Migrate test suite to single surface](./phase-03-migrate-test-suite-to-single-surface.md) | Pending |
| 4 | [Phase 4: Retire flags in docs + configs](./phase-04-retire-flag-documentation.md) | Pending |
| 5 | [Phase 5: Verify and ship PR](./phase-05-verify-and-ship-pr.md) | Pending |

## Success Criteria

- [ ] MCP `listTools` returns exactly the 8-tool residue in every config (no flag changes it).
- [ ] Session-start hook emits the transport banner unconditionally; no `LOOP_*_VIA_CLI` read in the hook.
- [ ] `mcp-wire-budget.test.js` measures the residue and asserts `<= 6_000` all-tools bytes.
- [ ] `cli-read-parity` + `cli-write-parity` compare CLI stdout against normalized direct-handler imports; a bounded MCP schema/transport smoke remains for registration and wire conversion.
- [ ] Cold-session tests retain separate contracts: `loop.mjs list` asserts the 42-tool CLI allowlist; `loop_describe`/handler manifest asserts 44 manifest entries; `agent-manifest.json` remains the 50-entry full declaration; live MCP `listTools` asserts the exact 8-tool residue.
- [ ] No test references either flag as an opt-out knob; `cli-mcp-subset-registration.test.js` deleted; `vitest.config.mjs` `E2E_FILES` updated.
- [ ] `grep -rn "LOOP_RECORDS_VIA_CLI\|LOOP_READS_VIA_CLI" .mcp.json .factory/ .mastracode/` returns zero; `mcp-config.test.js` drops the flag assertion.
- [ ] `grep -rn "LOOP_RECORDS_VIA_CLI\|LOOP_READS_VIA_CLI"` across evergreen docs/configs/code-comments returns zero (historical journals excepted).
- [ ] Stale tool counts corrected (CLAUDE.md, architecture.md): 42 CLI / 44 manifest, or linked to `core/cli-tools.js`.
- [ ] `pnpm test` green; PR opened; finding resolved after CI green.

## Risk Assessment

- **Contract reversal (accepted):** retiring `LOOP_READS_VIA_CLI` removes the documented
  intermediate transport. No runtime uses it; reversible only via the Phase 5 rollback order.
- **Parity-coverage gap during migration:** removing the MCP parity oracle before the
  direct-handler oracle is wired leaves a window with no cross-check. Mitigation: Phase 3
  wires direct-handler oracles first, then deletes the MCP leg in the same commit.
- **Surface-count drift:** CLI (42), handler manifest (44), classified residue (5), live MCP
  (8), and agent declaration (50) are separate contracts. Mitigation: Phase 2 adds a computed
  partition/crosswalk and Phase 3 updates all consumers, including
  `cold-session-enumerate-mastra.test.cjs`, `integration/cold-session-discoverability.test.cjs`,
  `manifest-arithmetic.test.cjs`, `workflow-parity.test.cjs`, and `manifest-constants.cjs`.
- **MCP coverage loss:** direct-handler parity cannot replace Mastra schema/transport coverage.
  Mitigation: preserve a bounded residue/SDK smoke for schema conversion, envelope, registration,
  and representative malformed-input behavior while moving state parity to direct handlers.
- **Rollback exposure:** reverting server registration after config flag removal re-exposes the
  full MCP surface. Mitigation: restore all three config flags first, verify the old wire budget,
  then revert code/config in order; never revert only `server.js`.
- **Hook runtime scope:** the universal discoverability hook is currently Claude-only. Mitigation:
  either scope the unconditional banner requirement to Claude and document Factory/MastraCode's
  existing hook surfaces, or add explicit runtime wiring and tests before claiming every runtime.
- **Session-start banner regression:** collapsing `buildTransportBanner` to unconditional
  must still carry the `--args-file` form and pinned `LOOP_SURFACE` value, or agents lose the
  gate-sensitive-payload escape hatch. Mitigation: Phase 1 co-designs the hook with
  `cli-sessionstart-banner.test.js` (Phase 2) and asserts the sketches still render.

## Open Questions

None — direction (Option 1), separate surface contracts, normalized direct state oracle plus
bounded MCP transport coverage, Claude banner scope/degraded path, and CI-before-resolution
ordering settled 2026-08-11.

## Red Team Review

### Session — 2026-08-11
**Findings:** 22 consolidated (22 accepted, 0 rejected) — 0 evidence-free rejections
**Severity breakdown:** 4 Critical, 10 High, 8 Medium
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier); second red-team pass after scope expansion

The second pass found that the original review's “CLI cold-session = 50” and “no MCP oracle”
decisions were not implementable as written. The applied corrections preserve the requested
single CLI registration surface while retaining explicit cross-surface and MCP transport contracts.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | ~12 tests boot full MCP surface via `withMcpServer` (no flag) and call/assert CLI_TOOLS members — break after Phase 1 | Critical | Accept | Phase 3 |
| 2 | `cli-read-parity`/`cli-write-parity` use flag=0 MCP as parity oracle — replace with direct-handler (user decision) | Critical | Accept | Phase 3 |
| 3 | Production `session-start-inject-discoverability.cjs:167-168` reads flags for banner — make unconditional | Critical | Accept | Phase 1 |
| 4 | 3 runtime `mcp.json` keep `LOOP_RECORDS_VIA_CLI=1`; `mcp-config.test.js` enforces it | Critical | Accept | Phase 2 + 4 |
| 5 | `vitest.config.mjs:43` lists deleted test in `E2E_FILES`; salvaged tests need tier placement | High | Accept | Phase 2 |
| 6 | `cli-sessionstart-banner.test.js` breaks — co-design with hook | High | Accept | Phase 2 |
| 7 | Phase 3 doc surface under-enumerated (philosophy, mcp-tool-schema-architecture, architecture, RUNTIME_ONBOARDING) | Medium | Accept | Phase 4 |
| 8 | Stale flag comments in `core/cli-tools.js` (dangerous "Rollback: flag=0"), `bin/loop.mjs:9`, `placement.yaml:101` | Medium | Accept | Phase 1 |
| 9 | Proposed residue test duplicates `cli-write-tool-set-drift.test.js` `MCP_RESIDUE` guard — strengthen existing instead | Medium | Accept | Phase 2 |
| 10 | 2,500-byte ceiling thin headroom → 6,000 all-tools form; commit measurement artifact | Medium | Accept | Phase 2 |
| 11 | Stale tool counts (CLAUDE.md "41", architecture.md "43/41" — actual 42/44) | Medium | Accept | Phase 4 |
| 12 | Cold-session contract (`agent-manifest.json` 50 / `cold-session-enumerate-mastra` asserts 50) — split into explicit CLI/manifest/agent/live-MCP contracts | Medium | Accept | Phase 3 |
| 13 | CLI cannot emit the 50-entry agent manifest; preserve 42/44/50 counts and add crosswalk | Critical | Accept | Phases 2-3 |
| 14 | Direct-handler parity alone drops MCP schema/transport coverage | High | Accept | Phase 3 |
| 15 | Direct read oracle lacks normalization and gate-equivalent helper contract | High | Accept | Phase 3 |
| 16 | Residue guard must distinguish 5 classified names from 8 live prefixed names | High | Accept | Phase 2 |
| 17 | Rollback order must restore config flags before reverting server registration | High | Accept | Phase 5 |
| 18 | Universal banner is Claude-only under current hook wiring | Medium | Accept | Phases 1-2 |
| 19 | Active scripts/tests/comments omitted from flag-retirement inventory | Medium | Accept | Phase 4 |
| 20 | Unconditional banner needs malformed/missing-config behavior | Medium | Accept | Phases 1-2 |
| 21 | Add computed arithmetic guard for 42/44/5/8/50 surfaces | Medium | Accept | Phase 2 |
| 22 | Integration cold-session and manifest-arithmetic consumers omitted | High | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-..., phase-03-migrate-test-suite-to-single-surface.md, phase-04-retire-flag-documentation.md, phase-05-verify-and-ship-pr.md
- Decision deltas checked: 22 (surface-count split, MCP schema coverage retention, normalized direct oracle, exact residue namespaces, Claude-only banner scope/degraded path, active flag-consumer inventory, rollback order, CI-before-resolution)
- Reconciled stale references: 50-as-CLI→50-as-agent declaration; CLI cold-session→42; handler manifest→44; classified residue→5; live MCP→8; direct-only parity→direct state oracle plus bounded MCP transport/schema tests; banner every-runtime→Claude scope; resolution-before-CI→resolution after job-id-bound CLEAN
- Unresolved contradictions: 0

### Applied Red-Team Corrections — 2026-08-11
- All accepted findings from the scope-change red-team pass were applied across the plan and phases.
- The plan now treats 42 CLI, 44 handler-manifest, 5 classified-residue, 8 live-MCP, and 50 agent-declaration counts as separate contracts.
- Active MCP schema/transport coverage remains required; only the MCP state-parity oracle is removed.
- CLI subprocess migrations require isolated `LOOP_SURFACE`, `GATE_ROOT`, and storage environment.
- Finding resolution is ordered after CI is green and `mergeStateStatus == CLEAN`, with a PR pointer.
