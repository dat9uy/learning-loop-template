# Phase E Plan 2: Interface spec — shipped 2026-06-25

## Summary

Shipped the runtime interface layer (E.0 + E.1b from the scope report). The `tools/learning-loop-mastra/interface/` directory is now a first-class structure containing the contract spec, validator, onboarding guide, and test suite.

## What shipped

- **E.0**: Both SKILL.md files updated to reference the new contract + tool manifest + 3-layer architecture. Fixed broken legacy references (the "References" section pointed to `tools/learning-loop-mastra/tools/legacy/references/*` which does not exist since Plan 1's rename).
- **E.1b**: Created `tools/learning-loop-mastra/interface/` with:
  - `README.md` — what the interface IS, why it exists as a first-class structure, relationship to Core + Mastra shell, distinction from `protocol-adapter`.
  - `CONTRACT.md` — the 5 requirements (`hook-shim-set`, `mcp-client-config`, `skill-spec`, `identity-marker`, `settings-integration`) with verification predicates.
  - `contract.js` — pure ESM validator (~160 LoC; FCIS-clean; exports `validate`, `validateAll`, `REQUIREMENT_IDS`; CLI mode via `--list`, `<runtime-id>`, `--help`).
  - `RUNTIME_ONBOARDING.md` — step-by-step guide for adding a new runtime, with a worked example for Mastra Code.
  - `__tests__/contract.test.js` — 24-test suite covering structural, pass-mode, per-requirement, fail-mode, and golden scenarios.

## Verification at merge

- All 5 regression-guard tests pass (`tools/learning-loop-mastra/__tests__/interface/`).
- All 24 contract tests pass.
- `node contract.js claude-code` returns `{ok: true, ...}` (exit 0).
- `node contract.js droid` returns `{ok: true, ...}` (exit 0).
- `node contract.js mastra-code` returns `{ok: false, missing: [4], ...}` (exit 1).
- `pnpm test` passes for all new namespaces; 1 pre-existing grounding drift in `mcp-tests` (cold-tier fingerprint for `run-pnpm-test-namespaced.mjs` — expected since this plan added 3 GLOB entries).

## Net source delta

- 1 new directory (`tools/learning-loop-mastra/interface/`)
- 5 new files in `interface/` (README, CONTRACT, contract.js, RUNTIME_ONBOARDING, contract.test.js)
- 5 new regression-guard tests in `__tests__/interface/`
- 2 SKILL.md updates (E.0)
- ~150 LoC production + ~140 LoC tests + ~30 LoC SKILL.md additions

## What this plan did NOT ship (deferred)

- The Mastra Code implementation (Plan 4 / E.5) — depends on this plan's contract + validator.
- The `RUNTIME_ID` enforcement gate (hardening plan / LIM-3) — the marker is advisory today; future hardening will make it mandatory for R2 write-gate ownership.
- The runtime-agnostic integration (the `core/runtime-agnostic-checklist.js` 6-item gate remains separate; the new contract is a runtime-level check, the existing checklist is a feature-level check).

## Cross-references

- Plan: `plans/260625-1618-phase-e-interface-spec/plan.md` (status: done)
- Phase files: `phase-01-baselineandtests.md` through `phase-05-verify.md`
- Test files: `__tests__/interface/*.test.js` (5) + `interface/__tests__/contract.test.js` (1)
- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` § "Plan split for execution" Plan 2 row
- Plan 1 journal (predecessor): `docs/journals/260625-phase-e-plan-1-review-fixes.md`
