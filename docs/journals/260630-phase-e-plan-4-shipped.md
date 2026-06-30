# Journal: Phase E Plan 4 — Mastra Code Runtime Validation

**Date:** 2026-06-30
**Plan:** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/`
**Status:** Shipped — Phase E closed

## What Shipped

Mastra Code validated as the third runtime alongside Claude Code and Droid CLI. MCP-only integration (programmatic `createMastraCode({ tools })` deferred to follow-up plan per red-team F2).

### Artifacts

| Phase | File(s) | Status |
|---|---|---|
| 1 | `scripts/probe-mastracode.cjs` (read-only probe + smoke; ~200 LoC) | ✅ |
| 2 | `.mastracode/{mcp,hooks,settings,database}.json` + `.gitignore` update | ✅ |
| 3 | `interface/contract.js` (7 reqs, +2 additive), `CONTRACT.md`, `RUNTIME_ONBOARDING.md`, `AGENTS.md` §11, `interface/__tests__/contract.test.js` (37 tests, +12) | ✅ |
| 4 | `tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.cjs` (6 tests), `pnpm smoke:mastracode` | ✅ |
| 5 | `docs/agents/mastra-code.md`, this journal | ✅ |

### Verification Results

- `pnpm test` — 1407 tests across 14 namespaces, all GREEN
- `node interface/contract.js mastra-code` — `{ok: true, missing: [], notes: [...]}`
- `node interface/contract.js claude-code` — `{ok: true, missing: []}` (no regression)
- `node interface/contract.js droid` — `{ok: true, missing: []}` (no regression)
- `pnpm smoke:mastracode` — exit 0; 44 MCP tools connected; round-trip via `learning-loop_mastra_loop_describe` succeeds

## Design Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | MCP-only integration | Red-team F2: hybrid model out-of-scope per predict report |
| D2 | Additive Req #6 (hook-declarative-config) | Red-team F3: avoid polymorphism on Req #1; cleaner contract |
| D3 | Additive Req #7 (settings-no-bypass) | Red-team Security: `shellPassthrough: true` bypasses bash-gate |
| D4 | `MASTRA_RESOURCE_ID` as alternative identity | Prep-report §5; first-match-wins with `RUNTIME_ID` |
| D5–D8 | Deferrals to Plan 5 | Security items (spoofability, extraTools, LibSQL race, CVE window) |
| D9 | Probe/smoke split | Red-team F4: read-only probe (Phase 1) + interactive smoke (Phase 4) |

## Registry Deltas

| ID | Kind | Status | Summary |
|---|---|---|---|
| `meta-260630T2050Z-...` | finding | resolved | Install attempt (pnpm cache poisoning — fixed after cache clear) |
| `meta-260630T2110Z-...` | finding | active | `affected_system` mismatch (schema vs implementation) |
| `meta-260630T2120Z-...` | change-log | active | Contract amendments (7 reqs, +2 additive) |
| `meta-260630T2221Z-...` | change-log | active | Cold-tier test: orphan-detection gap fixed (regex + re-order) |
| `meta-260630T2223Z-...` | change-log | active | Orphan finding superseded into this entry |
| `meta-260630T2105Z-...` | change-log | active | Phase 1 prereqs complete (probe live against mastracode@0.26.0) |

## Live Probe Findings vs Prep Report

Three prep-report claims required correction when tested against installed `mastracode@0.26.0`:

| Claim | Actual |
|---|---|
| Tool namespacing: `learning-loop_<tool>` (single underscore) | `learning-loop_mastra_<tool>` + `learning-loop_ask_<agent>` + `learning-loop_run_workflow_<workflow>` |
| API surface: `createMastraCode()` returns `{harness, mcpManager, hookManager}` | Returns `{session, controller, mcpManager, hookManager, ...}` (Harness removed in 0.26 refactor) |
| McpManager methods: `listServers()`, `listTools()` | `init()`, `getTools()`, `getServerStatuses()`, `getConfigPaths()` |

## Side-Track: Orphan-Detection Gap

During this session, a debugging side-track surfaced and fixed a gap in the cold-session test's orphan-detection logic:

- **Root cause:** `isDescriptive` regex `/:\s*\w+/` matched single-token symbol refs like `:build_audit_sarif`, silently skipping real orphans. The orphan check was also positioned AFTER the hash-mismatch grounding check, so any pre-existing drift shadowed the orphan loop.
- **Fix:** Tightened regex to `/:\s*\w+\s+\w+/` (requires whitespace between words); re-ordered orphan check to BEFORE grounding invariant.
- **Remediation:** Superseded the orphan finding `meta-260630T1238Z-...` into change-log `meta-260630T2223Z-...` (cross-repo evidence preserved in research journal).

## Plan 5 Deferrals

| # | Item | Mechanism |
|---|---|---|
| D5 | `MASTRA_RESOURCE_ID` spoofability | LIM-3 caller identity primitive |
| D6 | `extraTools` injection via `createMastraCode({ tools })` | Deferred to follow-up plan |
| D7 | LibSQL storage race (Mastra Code + loop DBs) | Bundled hardening |
| D8 | Transitive CVE window from `npm install mastracode` | Bundled hardening + dep pin policy |

## Cross-References

- Plan: `plans/260630-2012-phase-e-plan-4-mastra-code-validation/`
- Prep report: `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`
- Harness report: `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md`
- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (Rev 12)
- Master tracker: `plans/reports/productization-260612-1530-master-tracker.md`
