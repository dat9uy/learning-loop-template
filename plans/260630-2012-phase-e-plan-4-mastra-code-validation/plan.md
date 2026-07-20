---
title: "Phase E Plan 4: Mastra Code Runtime Validation"
description: "Ship the .mastracode/ configuration + contract amendments + programmatic smoke test that proves the learning loop works under Mastra Code's declarative hook model. Closes Phase E and unblocks Phase F (Bridge 7)."
status: completed
priority: P2
branch: "main"
tags: [phase-e, mastra-code, contract, runtime-agnostic]
blockedBy: []
blocks: []
created: "2026-06-30T13:19:57.489Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 4: Mastra Code Runtime Validation

## Overview

Closes Phase E by shipping Mastra Code as the third validated runtime alongside Claude Code and Droid. **MCP-only integration** (matches scope report E.5 + predict report Rev 1 endorsement). Programmatic integration deferred to a follow-up plan.

Surfaces a known gap in the current contract (`interface/contract.js` declares `.mastracode/config.json` — research shows the correct paths are `.mastracode/mcp.json` + `.mastracode/hooks.json` + `.mastracode/settings.json`). Ships:

- `.mastracode/` config set (mcp + hooks + settings + database)
- 1 additive contract requirement (`hook-declarative-config`, Req #6) + 4 contract amendments (Req #2 path correction; Req #5 alternative; Req #4 alternative; shellPassthrough rejection)
- `scripts/probe-mastracode.cjs` (read-only) + `scripts/smoke-mastracode.cjs` (interactive)
- `docs/agents/mastra-code.md` — worked example for future runtime authors
- AGENTS.md §11 doc correction note (stale `.mastracode/coordination/hooks/` language; correction belongs in Phase 5 doc)

**Integration model:** MCP-only. Mastra Code connects to our `MCPServer` via `.mastracode/mcp.json` (peer MCP, the same model Claude Code + Droid use). Tool names will be auto-namespaced as `<serverName>_<toolName>` (verified at smoke test; format documented in Phase 4 docs).

**Acceptance:** `node interface/contract.js mastra-code` returns `{ok: true, missing: [], notes: []}`. Probe script exits 0 with one tool round-tripped via MCP. `pnpm test` GREEN (all 13 namespaces + new `mastracode-smoke` namespace).

## Red-team findings incorporated

3 hostile reviewers (scope-architect, security-adversary, failure-mode-analyst) returned APPROVE-WITH-FIXES. Applied fixes:

- **F1 (phase ordering):** Phase 2 explicitly gated on Phase 1 probe completion. `hooks.json` is created AFTER probe documents actual write/edit tool name.
- **F2 (hybrid model out of scope):** Removed programmatic primary path. Plan 4 ships MCP-only.
- **F3 (contract polymorphism):** Replaced OR clauses on Req #1 + #5 with additive Req #6 (`hook-declarative-config`); cleaner contract, no risk of future authors misusing alternatives.
- **F4 (probe/smoke split):** `scripts/probe-mastracode.cjs` (read-only, Phase 1) + `scripts/smoke-mastracode.cjs` (interactive tool round-trip, Phase 4).
- **F5 (validator failsafe bugs):** Phase 3 TDD includes 4 negative tests (Rejects-malformed-hooks-json, Rejects-empty-event-entries, Rejects-shellPassthrough-true, Rejects-missing-command-paths).
- **F6 (hook I/O wire format):** Phase 4 smoke test asserts universal scripts parse Mastra Code's hook payload correctly.
- **F7 (OPERATOR_MODE check):** Phase 5 explicit guard.
- **F8 (harness.shutdown()):** Phase 1 probe records `typeof harness.shutdown` + all available methods; Phase 4 smoke only calls methods present.
- **Deferrals to Plan 5 (Hardening — LIM-3/LIM-4/R2):** `MASTRA_RESOURCE_ID` spoofability, `extraTools` injection, LibSQL storage race, transitive CVE window. Documented in Phase 5 journal entry.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [phase-01-preflight-prereqs](./phase-01-phase-01-preflight-prereqs.md) | Pending |
| 2 | [phase-02-config-files](./phase-02-phase-02-config-files.md) | Pending |
| 3 | [phase-03-contract-amendments](./phase-03-phase-03-contract-amendments.md) | Pending |
| 4 | [phase-04-smoke-test](./phase-04-phase-04-smoke-test.md) | Pending |
| 5 | [phase-05-docs-and-verify](./phase-05-phase-05-docs-and-verify.md) | Pending |

## Dependencies

**Satisfied (all DONE):**
- Plan 1 Foundation (rename + FCIS + schema doc + AGENTS.md §1.1) — PR #15
- Plan 2 Interface spec (5-req contract + validator + onboarding guide) — PR #17
- Plan 6 Shell restructure (`mastra/` subdir layout; contract Req #2 `args` path updated) — PR #18
- Plan 3 Housekeeping (R2 ownership in AGENTS.md §11 + parity-pins + schema rot) — PR #19
- Plan 7 + 7-fix (stale-sweep + corrective batch) — PR #19
- Plan 8 (registry drift fix + write-gate extension) — PR #19

**Pre-existing research (read in full):**
- `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` (295 LoC)
- `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md` (406 LoC)
- `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 11

**Parallel (does not gate this plan):**
- Plan 5 Hardening (LIM-3 caller identity + R2 write-gate + LIM-4 path traversal)

## Open questions resolved by research + red-team

| # | Question | Resolution | Source |
|---|----------|------------|--------|
| Q1 | CLI vs programmatic invocation? | **MCP-only** in Plan 4. Programmatic (`createMastraCode({ tools })`) deferred to follow-up plan. (Red-team F2: hybrid model was out of scope per predict report.) | mastracode-prep §"CLI vs programmatic invocation" (Q1 resolved 2026-06-27) + red-team scope F2 |
| Q2 | `createMastraCode` `configDir` param? | **Does not exist.** API uses `cwd`. | mastracode-prep §1 |
| Q3 | Hook mechanism? | **Declarative JSON** (`.mastracode/hooks.json`), NOT shim files. Codified as additive Req #6 (`hook-declarative-config`) in Phase 3 — NOT polymorphic OR-clauses on Req #1 (red-team F3: avoids future-author misuse). | mastracode-prep §4 + red-team scope F3 |
| Q4 | `RUNTIME_ID` env var? | **Additive:** accept `MASTRA_RESOURCE_ID` OR `RUNTIME_ID`. `MASTRA_RESOURCE_ID` is spoofable until LIM-3 caller-identity ships (Plan 5 deferral D5). | mastracode-prep §5 + harness-class §5 + red-team security F1 |
| Q5 | Skill spec needed? | **NO.** `.claude/skills/learning-loop/SKILL.md` is auto-discovered. Verify in Phase 4; only create `.mastracode/skills/...` if discovery fails. | mastracode-prep §3 |
| Q6 | MCP tool namespacing? | **TBD at smoke test** — depends on `mcpManager` impl. Will document actual format in Phase 4. | harness-class §7 |

## Plan 5 (Hardening) deferrals — explicit

Per red-team security review, these items are out-of-scope for Plan 4 and ship in Plan 5 (bundled hardening — LIM-3 caller identity + LIM-4 path traversal + R2 write-gate):

| # | Item | Why deferred | Plan 5 mechanism |
|---|------|--------------|------------------|
| D5 | `MASTRA_RESOURCE_ID` spoofability | Plan 4 only validates env var; no caller authentication | LIM-3 caller identity primitive (RUNTIME_ID + signed caller attestation) |
| D6 | `extraTools` injection via `createMastraCode({ tools })` | Programmatic integration model is out of Plan 4 scope; defer entirely | N/A (programmatic deferred to a follow-up plan) |
| D7 | LibSQL storage race between Mastra Code + loop DBs | Probe confirms no conflict in test env; production hardening needs lock-contention strategy | Bundled hardening |
| D8 | Transitive CVE window from `npm install mastracode` | One-time install; ongoing monitoring is a hardening concern | Bundled hardening + dep pin policy |

**Plan 4 journal entry MUST cite these deferral IDs** for future Plan 5 work.

## Risk assessment

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | `mastracode` npm package not installable in this sandbox | High (blocker) | Pre-flight `mastra_gate_check` (vendor API install). Fallback: vendor check via `pnpm view mastracode` (read-only) if install blocked. |
| R2 | Tool namespacing convention differs from docs (Phase 4 smoke test reveals) | Medium | Document actual format in `docs/agents/mastra-code.md`. Update write-gate hook matcher accordingly. |
| R3 | Mastra Code uses LibSQL by default for its storage; our loop also uses LibSQL | Medium | Probe in Phase 1 — confirm default DB location; either configure `.mastracode/database.json` to a sibling path OR confirm no conflict. |
| R4 | Contract amendment breaks Claude Code / Droid validation | High (regression) | TDD: add 2 regression tests for shim-file path BEFORE amendment. Run `pnpm test` after amendment to confirm existing 2 runtimes still pass. |
| R5 | `RUNTIME_ID` advisory notes migration to mandatory breaks existing setups | Medium | Defer mandatory adoption to Plan 5 (Hardening). Plan 4 only adds `MASTRA_RESOURCE_ID` as ALTERNATIVE for Mastra Code; `RUNTIME_ID` stays advisory. |
| R6 | AGENTS.md §11 R2 ownership language mentions `.mastracode/coordination/hooks/` (stale) | Low (doc only) | Phase 3 amends §11 to reflect declarative hooks for Mastra Code. |

## Acceptance criteria

- [ ] `node tools/learning-loop-mastra/interface/contract.js mastra-code` returns `{ok: true, missing: [], notes: []}` (exit 0)
- [ ] `node tools/learning-loop-mastra/interface/contract.js claude-code` still returns `{ok: true}` (regression guard)
- [ ] `node tools/learning-loop-mastra/interface/contract.js droid` still returns `{ok: true}` (regression guard)
- [ ] `scripts/probe-mastracode.cjs` exits 0; tool round-trips via `createMastraCode({ cwd, resourceId })`
- [ ] `pnpm test` GREEN across all 13 namespaces
- [ ] `docs/agents/mastra-code.md` exists; references the contract, the probe script, and the worked example
- [ ] AGENTS.md §11 R2 ownership language no longer mentions stale `.mastracode/coordination/hooks/` path
- [ ] `meta_state_log_change` filed with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'`, `reason: 'Phase E Plan 4 shipped; Phase E closed'`
- [ ] Journal entry at `docs/journals/260630-phase-e-plan-4-shipped.md`

## What this plan does NOT ship (deferred)

- **Plan 5 Hardening** — LIM-3 caller identity gate + R2 write-gate + LIM-4 path traversal. Parallel dimension. The contract amendment here only ADDS `MASTRA_RESOURCE_ID` as alternative; the gate that enforces it ships in Plan 5.
- **`RUNTIME_ID` mandatory adoption by Claude Code / Droid** — stays advisory. Plan 5 makes it mandatory.
- **Mastra Code OM (Observational Memory) configuration** — Harness-class §6 notes Plan 4 doesn't need it; revisit if long-running sessions become a use case.
- **Mastra Code built-in tool disable** — `disableBuiltinTools` for `ask_user`, `submit_plan`, etc. Not needed for Plan 4's validation scope.
- **Phase F (Bridge 7)** — gated on Phase E closure.

## Effort estimate

~1-2 days (matches scope report E.5 estimate).

- Phase 1 (preflight + prereqs): ~0.5h
- Phase 2 (config files): ~1h
- Phase 3 (contract amendments + AGENTS.md cleanup): ~2h
- Phase 4 (probe script): ~2h (depends on Phase 1 smoke results)
- Phase 5 (docs + verify + journal): ~1h

Total: ~6.5h hands-on, ~1-2 calendar days wall-clock (allows for Phase 1 install + smoke iteration).