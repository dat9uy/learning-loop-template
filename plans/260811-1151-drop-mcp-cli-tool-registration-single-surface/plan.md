---
title: "Drop MCP CLI tool registration — single surface"
description: "Pay down the MCP/CLI dual-registration debt (finding meta-260811T1106Z-...): drop MCP registration of CLI_TOOLS entirely, retire the LOOP_RECORDS_VIA_CLI + LOOP_READS_VIA_CLI flags, make the stateless CLI the single tool surface, re-target the MCP wire-budget guard to the production residue, redesign the session-start transport banner to fire unconditionally, and re-base the test suite (parity oracle + cold-session contract) to the single surface."
status: pending
priority: P1
effort: "2-3d"
tags: [meta-state-tools, mcp, cli, wire-budget, contract-change, session-start-hook]
created: 2026-08-11
finding: "meta-260811T1106Z-mcp-and-cli-surfaces-run-duplicated-tool-registrations-every"
supersedes_stopgap: "plans/260811-0914-mcp-wire-budget-restore-and-glossary-extend (completed)"
red_team: "2026-08-11 — 12 findings (4 Critical, 2 High, 6 Medium), all accepted+applied"
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
the session-start transport banner fires unconditionally, and the test suite's parity +
cold-session contracts re-anchor to the CLI.

**Red-team expanded the scope materially.** The original 4-file estimate grew to touch a
production session-start hook (~12 tests use MCP as a parity/list oracle), 3 runtime
configs, and several more doc/comment surfaces. Effort re-estimated to 2-3 days.

Accepted direction: **Option 1** (brainstorm 2026-08-11, reaffirmed after red-team). The
red-team proved the flag-gated "dead" loop is load-bearing for the test suite (it boots the
full MCP surface as the parity oracle); Option 1 removes it and re-bases that suite.
User-accepted risk: a future runtime wanting MCP-side record transport must re-add
registration (reversible).

## Evidence (measured 2026-08-11 via __tests__/with-mcp-server.js)

| Surface | Tools | All-tools bytes | When loaded |
|---|---|---|---|
| Production (`LOOP_RECORDS_VIA_CLI=1`) | 8 | 4,563 | every production runtime |
| Default (flag unset, current test) | 50 | 57,921 | test only — never in prod |

Residue (8): `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`,
`mastra_check_runtime_agnostic`, `mastra_update_r2_allowlist`,
`mastra_workflow_generate_prompt`, `run_workflow_storage_read`,
`run_workflow_storage_round_trip`. Re-anchored wire-budget ceiling: **6,000 all-tools
bytes** (1,437 B headroom over 4,563; covers `ask_`/`run_` residue, not just the 2 manifest
tools). The measurement script is committed under `__tests__/helpers/` (not a throwaway
`/tmp` script) so the ceiling is re-checkable. [Finding 10]

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | MCP server never registers `CLI_TOOLS` in any config | P1 |
| 2 | Session-start transport banner fires unconditionally (no flag read) | P1 |
| 3 | Wire-budget guard measures the production residue (ceiling 6,000 all-tools) | P1 |
| 4 | Test suite re-anchors: parity oracle = CLI vs direct-handler; cold-session contract = CLI | P1 |
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
- [ ] `cli-read-parity` + `cli-write-parity` compare CLI stdout against direct-handler imports (no MCP oracle).
- [ ] `cold-session-enumerate-mastra.test.cjs` asserts `loop.mjs list` / `loop_describe`, not MCP `listTools`; `agent-manifest.json` describes the CLI surface.
- [ ] No test references either flag as an opt-out knob; `cli-mcp-subset-registration.test.js` deleted; `vitest.config.mjs` `E2E_FILES` updated.
- [ ] `grep -rn "LOOP_RECORDS_VIA_CLI\|LOOP_READS_VIA_CLI" .mcp.json .factory/ .mastracode/` returns zero; `mcp-config.test.js` drops the flag assertion.
- [ ] `grep -rn "LOOP_RECORDS_VIA_CLI\|LOOP_READS_VIA_CLI"` across evergreen docs/configs/code-comments returns zero (historical journals excepted).
- [ ] Stale tool counts corrected (CLAUDE.md, architecture.md): 42 CLI / 44 manifest, or linked to `core/cli-tools.js`.
- [ ] `pnpm test` green; PR opened; finding resolved after CI green.

## Risk Assessment

- **Contract reversal (accepted):** retiring `LOOP_READS_VIA_CLI` removes the documented
  intermediate transport. No runtime uses it; reversible by re-adding registration.
- **Parity-coverage gap during migration:** removing the MCP parity oracle before the
  direct-handler oracle is wired leaves a window with no cross-check. Mitigation: Phase 3
  wires direct-handler oracles first, then deletes the MCP leg in the same commit.
- **Cold-session contract drift:** `agent-manifest.json` (50 tools) and
  `manifest-constants.cjs` (`AGENT_MANIFEST_TOTAL_TOOLS=50`) must both re-anchor to the CLI
  in lockstep; leaving one describing MCP and one describing CLI contradicts. Mitigation:
  Phase 3 updates both + all consuming tests in one phase.
- **Session-start banner regression:** collapsing `buildTransportBanner` to unconditional
  must still carry the `--args-file` form and pinned `LOOP_SURFACE` value, or agents lose the
  gate-sensitive-payload escape hatch. Mitigation: Phase 1 co-designs the hook with
  `cli-sessionstart-banner.test.js` (Phase 2) and asserts the sketches still render.

## Open Questions

None — direction (Option 1), parity oracle (CLI vs direct-handler), cold-session anchor
(to CLI), and hook behavior (unconditional) all settled 2026-08-11.

## Red Team Review

### Session — 2026-08-11
**Findings:** 12 (12 accepted, 0 rejected) — 0 evidence-free rejections
**Severity breakdown:** 4 Critical, 2 High, 6 Medium
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier)

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
| 12 | Cold-session contract (`agent-manifest.json` 50 / `cold-session-enumerate-mastra` asserts 50) — re-anchor to CLI | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-..., phase-03-migrate-test-suite-to-single-surface.md, phase-04-retire-flag-documentation.md, phase-05-verify-and-ship-pr.md
- Decision deltas checked: 12 (flag retirement scope, hook unconditional, parity oracle=direct-handler, cold-session anchor=CLI, ceiling 6,000 all-tools, 5-phase structure, effort 2-3d)
- Reconciled stale references: ceiling 55,000→6,000; "3 test files"→expanded; "no env change needed"→removed; phase count 4→5; effort 1d→2-3d
- Unresolved contradictions: 0