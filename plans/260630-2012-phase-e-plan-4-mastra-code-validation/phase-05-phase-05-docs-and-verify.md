---
phase: 5
title: "phase-05-docs-and-verify"
status: pending
effort: ""
---

# Phase 5: Documentation + Final Verification

## Overview

Write the canonical Mastra Code worked example (`docs/agents/mastra-code.md`), file the audit-trail entries (meta-state + journal), update the master tracker, run final verification gates, **and document Plan 5 deferrals** for security items red-team identified as out-of-Plan-4-scope.

**OPERATOR_MODE guard:** All `meta_state_log_change` calls REQUIRE `OPERATOR_MODE=1` in the env. Phase 5 asserts this at start; if absent, fails fast with a clear error. (Red-team Failure H6.)

## Requirements

- **Functional:** `docs/agents/mastra-code.md` exists; describes integration shape, hook mechanism, identity marker, smoke test procedure; references the contract + probe script
- **Non-functional:** all meta-state changes committed via canonical MCP path; journal entry filed; master tracker + scope report updated
- **Testability:** final verification gate passes (`pnpm test` + `pnpm smoke:mastracode` + `node interface/contract.js mastra-code`)

## Architecture

**Audit trail chain** (canonical MCP path; per AGENTS.md §6):

```
docs/agents/mastra-code.md       ← human-readable worked example
        ↓ cites
plans/reports/...                ← research + design (already exists)
        ↓ cites
interface/CONTRACT.md            ← formal 5-req contract (amended in Phase 3)
        ↓ enforces
interface/contract.js            ← validator (amended in Phase 3)
        ↓ invokes
scripts/probe-mastracode.cjs     ← programmatic smoke test (Phase 1 + 4)
        ↓ uses
.mastracode/{mcp,hooks,settings,database}.json  ← runtime config (Phase 2)
```

## Related Code Files

- Create: `docs/agents/mastra-code.md` (~150-200 LoC)
- Create: `docs/journals/260630-phase-e-plan-4-shipped.md` (~50-80 LoC journal entry)
- Modify: `plans/reports/productization-260612-1530-master-tracker.md` (Phase E → closed; Plan 4 flipped)
- Modify: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (Plan 4 status flipped; 1-line appendix citing this plan + journal)
- Modify: `meta-state.jsonl` (1 `meta_state_log_change` for tracker flip + 1 for scope report flip + any findings)

## Implementation Steps

1. **OPERATOR_MODE guard (red-team fix F7).** At start of Phase 5: assert `process.env.OPERATOR_MODE === '1'`. If absent, fail fast with error: "Phase 5 requires `OPERATOR_MODE=1` for `meta_state_log_change` MCP calls. Set `OPERATOR_MODE=1` and re-run." Do NOT proceed without the guard.

2. **Write `docs/agents/mastra-code.md`.** Sections:
   - **Overview** — Mastra Code = third validated runtime alongside Claude Code + Droid; npm `mastracode`; `createMastraCode({ cwd, resourceId, ... })` factory.
   - **Integration model** — MCP-only (programmatic deferred to follow-up plan per red-team F2).
   - **Configuration walkthrough** — `.mastracode/{mcp,hooks,settings,database}.json` with example content + paths.
   - **Hook integration** — declarative `.mastracode/hooks.json` vs Claude Code's shim files; table mapping each gate → which event entry invokes which universal script.
   - **Identity marker** — `MASTRA_RESOURCE_ID` (or `HarnessConfig.resourceId` / `.mastracode/database.json` `resourceId`); why not `RUNTIME_ID`.
   - **Tool namespacing** — actual format from Phase 4 smoke test (single underscore vs double vs `mcp__` prefix).
   - **Smoke test procedure** — `pnpm smoke:mastracode` + what to look for in stdout JSON.
   - **Contract validation** — `node interface/contract.js mastra-code`; expected `{ok: true, missing: [], notes: []}`.
   - **Troubleshooting** — common failures (JSON invalid; hook matcher wrong tool name; LibSQL lock conflict).
   - **Cross-references** — `interface/CONTRACT.md`, `interface/RUNTIME_ONBOARDING.md`, `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`, `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md`.

2. **Run final verification gates:**
   - `pnpm test` — all 13 namespaces + new `mastracode-smoke.test.js` namespace GREEN
   - `pnpm smoke:mastracode` — exit 0; `{ok: true, smoke_test: {...}}`
   - `node tools/learning-loop-mastra/interface/contract.js claude-code` — `{ok: true, missing: [], notes: [...]}`
   - `node tools/learning-loop-mastra/interface/contract.js droid` — `{ok: true, missing: [], notes: [...]}`
   - `node tools/learning-loop-mastra/interface/contract.js mastra-code` — `{ok: true, missing: [], notes: []}`

3. **Write journal entry** `docs/journals/260630-phase-e-plan-4-shipped.md`:
   - What shipped (1 atomic commit per phase; total 5 commits)
   - Design decisions applied (D1-D8) — including red-team fixes (additive Req #6 instead of polymorphism; MCP-only integration; probe/smoke split; etc.)
   - Registry deltas (1 log_change + N findings if any)
   - **Plan 5 deferrals** (red-team security findings deferred to Plan 5 Hardening — LIM-3 / LIM-4 / R2):
     - **D5-defer:** `MASTRA_RESOURCE_ID` is spoofable until LIM-3 caller-identity primitive ships (Plan 5). Document that contract validator currently accepts `MASTRA_RESOURCE_ID` env var without caller authentication.
     - **D6-defer:** `extraTools` injection via `createMastraCode({ tools })` — programmatic integration model deferred to a follow-up plan; not in Plan 4 scope. Document that Plan 4 ships MCP-only.
     - **D7-defer:** LibSQL storage race — Mastra Code uses LibSQL by default for its storage; our loop also uses LibSQL. Phase 1 probe documents actual storage path; Phase 5 verifies no conflict in test env. Production hardening (separate DBs, lock contention strategy) deferred to Plan 5.
     - **D8-defer:** Transitive CVE window — `npm install mastracode` brings in deps. Plan 5 hardening should add automated CVE check + dep pin policy.
   - Verification at merge (test counts, validator results)
   - Cross-references to all 4 plan dirs (Phase 1 prereqs, Phase 2 config, Phase 3 contract, Phase 4 smoke, Phase 5 docs)

4. **Update master tracker** `plans/reports/productization-260612-1530-master-tracker.md`:
   - Flip Phase E status: "Plan 4 OPEN" → "Phase E closed"
   - Add 1-line body text citing this plan dir + journal
   - Follow Update Protocol §1-4 (edit FIRST, commit, then `meta_state_log_change`)

5. **Update scope report** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`:
   - Flip Plan 4 row from 🔵 OPEN to ✅ DONE
   - Add Rev 12 revision note: "Plan 4 shipped via PR #TBD; journal `docs/journals/260630-phase-e-plan-4-shipped.md`; Phase E closed"

6. **File audit-trail entries** (canonical MCP path):
   - `meta_state_log_change` × 1 for tracker flip (reason: 'Phase E Plan 4 shipped; Phase E closed')
   - `meta_state_log_change` × 1 for scope report flip (reason: 'Phase E Plan 4 shipped; Rev 12 applied')

7. **Final commit.** 1 atomic commit for: `docs/agents/mastra-code.md` + journal + tracker/scope-report updates + meta-state entries (the latter via MCP, not direct file edit).

## Success Criteria

- [ ] `docs/agents/mastracode.md` exists; ~150-200 LoC; references contract + probe script + research reports
- [ ] `docs/journals/260630-phase-e-plan-4-shipped.md` exists; covers what shipped + decisions + verification + cross-refs
- [ ] Master tracker reflects Phase E closed; Plan 4 flipped to ✅
- [ ] Scope report Rev 12 applied; Plan 4 row flipped
- [ ] `meta_state_log_change` entries filed via MCP for both tracker + scope report
- [ ] All 5 verification gates pass:
  - [ ] `pnpm test` GREEN (all namespaces)
  - [ ] `pnpm smoke:mastracode` exits 0
  - [ ] `node interface/contract.js claude-code` exits 0
  - [ ] `node interface/contract.js droid` exits 0
  - [ ] `node interface/contract.js mastra-code` exits 0
- [ ] No secrets, env values, tokens, or private data in any committed file
- [ ] Commit messages follow conventional commit format; no AI references (per `development-rules.md`)

## Risk Assessment

- **Doc drift:** `docs/agents/mastra-code.md` could go stale if Mastra Code API changes. Mitigation: doc cites `node_modules/@mastra/core/dist/harness/harness.d.ts` as canonical source (auto-detected, not hard-coded version).
- **Master tracker / scope report get out of sync:** if Rev 12 amendment differs from journal claim, future sessions get confused. Mitigation: scope report cites the journal explicitly + journal cites the scope report revision explicitly.
- **Final commit scope creep:** tempting to bundle fixes. Mitigation: 1 atomic commit per concern (Phase 5 ships the docs/journal/tracker; not the smoke test or contract amendments — those were already committed in Phases 1-4).

## Cross-references

- **Plan:** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/plan.md`
- **Pre-existing research:** `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`, `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md`
- **Scope report:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 11 → Rev 12
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md`
- **Contract:** `tools/learning-loop-mastra/interface/CONTRACT.md`
- **Onboarding:** `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md`
- **Probe script:** `scripts/probe-mastracode.cjs`
- **Phase E siblings:** `plans/260624-2335-phase-e-foundation/`, `plans/260625-1618-phase-e-interface-spec/`, `plans/260626-0302-phase-e-shell-restructure/`, `plans/260626-0607-phase-e-housekeeping/`, `plans/260626-0720-phase-e-stale-sweep/`, `plans/260626-1535-phase-e-stale-sweep-fix/`, `plans/260626-1734-phase-e-registry-drift-fix/`