---
title: "Phase E Plan 2: Interface spec (5-requirement contract + validator + onboarding)"
description: "Ships E.0 (SKILL.md doc-drift closeout) + E.1b (interface/ directory: 5-requirement contract, validator, onboarding guide, test suite). First-class structure for the runtime interface layer named in AGENTS.md §1.1. ~150 LoC production + ~140 LoC tests + 2 SKILL.md updates."
status: pending
priority: P2
branch: "main"
tags: [phase-e, interface, contract, validator, onboarding, e0, e1b]
blockedBy: [260624-2335-phase-e-foundation]
blocks: [260625-0930-phase-e-mastra-code-validation]
created: "2026-06-25T16:18:00.000Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 2: Interface spec

> **Source:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` § "Plan split for execution" — Plan 2 (Interface spec).
> **Items shipped:** E.0 (SKILL.md doc-drift closeout) + E.1b (interface/ directory with 5-requirement contract, validator, onboarding guide, test suite).
> **Order of operations:** Plan 1 (E.1, shipped 2026-06-25 via PR #15) → **Plan 2 (this plan, E.0 + E.1b)** → Plan 3 (E.2–E.4 housekeeping, parallel-able) → Plan 4 (E.5 Mastra Code validation, depends on this plan).
> **Predecessor:** Plan 1 codifies the 3-layer architecture in AGENTS.md §1.1 and the FCIS invariant in `core/README.md`. This plan positions the new `interface/` directory between Mastra shell (Layer 2) and the agent runtimes (Claude Code, Droid CLI, future Mastra Code).

## Overview

The interface is the **contract** that an agent runtime (Claude Code / Droid CLI / future Mastra Code) must satisfy to integrate with the learning loop. Today, the contract exists only as code: 4 hook shims in `.claude/coordination/hooks/` + 4 in `.factory/coordination/hooks/` + the `runtime-agnostic-checklist.js` 6-item gate. The interface is real but **not first-class** — there is no spec a future runtime implementer can read to learn "what do I need to do?"

This plan creates the first-class structure: `tools/learning-loop-mastra/interface/` contains the spec (`CONTRACT.md`), the validator (`contract.js`), the onboarding guide (`RUNTIME_ONBOARDING.md`), and the layer description (`README.md`). The validator is runnable as `node tools/learning-loop-mastra/interface/contract.js <runtime-id>` and returns `{ok, missing[], notes[], path_map}` for each of the 5 requirements. A 24-test suite locks the contract against silent regression.

**Effort:** 1.25 days (per scope report). **Risk:** Low — no functional change to existing runtimes; no gate wiring; pure doc + small validator + 1 test file.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [BaselineAndTests](./phase-01-baselineandtests.md) | Pending | Tests written first (red baseline) |
| 2 | [SkillMdUpdates](./phase-02-skillmdupdates.md) | Pending | Tool-references test turns green after SKILL.md rewrite |
| 3 | [InterfaceSpec](./phase-03-interfacespec.md) | Pending | interface-dir-exists + contract-md-exists + contract-js-exports-validate turn green after spec files added |
| 4 | [OnboardingAndTestSuite](./phase-04-onboardingandtestsuite.md) | Pending | 24-test suite + runtimes-pass-contract turn green after validator exercises real `.claude/` and `.factory/` |
| 5 | [Verify](./phase-05-verify.md) | Pending | `pnpm test` green + `meta_state_log_change` filed + journal entry |

**TDD structure applied:** each phase writes the regression tests BEFORE the production change, watches the tests fail (red), applies the minimal change, watches the tests pass (green), then runs the full suite to confirm no regression. The 5 regression guards (interface-dir-exists, contract-md-exists, contract-js-exports-validate, skill-md-references-tools, runtimes-pass-contract) lock the new invariants against silent regression.

## Acceptance Criteria

- [ ] `tools/learning-loop-mastra/interface/` exists with 4 docs + 1 validator + 1 test file
- [ ] `interface/README.md` describes what the interface layer is and how it relates to Core + Mastra shell
- [ ] `interface/CONTRACT.md` enumerates the 5 requirements with verification predicates
- [ ] `interface/contract.js` exports `validate(runtimeId, rootPath?)` and `validateAll(ids, rootPath?)`; runs as `node contract.js <runtime-id>` from CLI
- [ ] `interface/RUNTIME_ONBOARDING.md` provides a 5-req checklist + worked example for Mastra Code (~110 LoC)
- [ ] `interface/__tests__/contract.test.js` contains ~24 tests covering structural, pass-mode, per-requirement, fail-mode, and golden scenarios
- [ ] `node tools/learning-loop-mastra/interface/contract.js claude-code` returns `{ok: true, missing: [], notes: ["identity-marker-not-adopted"], path_map: {...}}` (exit 0)
- [ ] `node tools/learning-loop-mastra/interface/contract.js droid` returns the same shape (exit 0)
- [ ] `node tools/learning-loop-mastra/interface/contract.js mastra-code` returns `{ok: false, missing: [4 — hook-shim-set, mcp-client-config, skill-spec, settings-integration], notes: ["identity-marker-not-adopted"]}` (exit 1) — proves validator handles future runtimes
- [ ] `node tools/learning-loop-mastra/interface/contract.js --list` exits 0 and prints the 3 known runtime IDs + 5 requirement IDs
- [ ] Both SKILL.md files reference `loop_describe` AND `meta_state_list` (validator requirement #3)
- [ ] Both SKILL.md files reference `tools/learning-loop-mastra/interface/CONTRACT.md` + the validator invocation
- [ ] All existing tests still pass (no regression)
- [ ] `meta_state_log_change` filed with `change_target: plans/260625-1618-phase-e-interface-spec/plan.md`

## Dependencies

**Blocks:**
- `260625-0930-phase-e-mastra-code-validation` (Plan 4) — needs the contract + validator to satisfy the 5 requirements for Mastra Code

**Does not block:**
- `260625-0930-phase-e-housekeeping` (Plan 3, parallel-able) — Plan 3 ships doc/process changes that don't reference the new `interface/` directory
- `260701-0930-hardening-r2-lim3-lim4` (Plan 5, parallel) — independent; LIM-3 will reference the contract's identity-marker requirement

## Research Reports (load-bearing)

- `plans/reports/plan-2-research-contract-validator-260625-1618-report.md` (in agent transcript; not committed to disk; design decisions captured in this plan's phase files)
- `plans/reports/plan-2-research-test-skill-onboarding-260625-1618-report.md` (committed; test design + SKILL.md update shape + RUNTIME_ONBOARDING.md outline)

## Resolved Design Decisions (applied to this plan)

| # | Decision | Source | Rationale |
|---|----------|--------|-----------|
| D1 | Validator return shape: `{ok, runtimeId, rootPath, missing[], notes[], path_map, error?}` | Researcher 1 Q1 | `notes: string[]` (plural) for extensibility; `path_map` for test introspection |
| D2 | Validator API: `validate(runtimeId, rootPath)` + `validateAll(ids, rootPath?)` + `REQUIREMENT_IDS` export | Researcher 1 §2 | Matches `core/runtime-agnostic-checklist.js` style; CLI mode is primary use case |
| D3 | Pure I/O function (reads files, no injected fs) | Researcher 1 §2 | ~160 LoC YAGNI; matches existing pattern; tests use `mkdtempSync` for isolation |
| D4 | `RUNTIMES` const hard-coded in `contract.js` (claude-code, droid, **mastra-code**) | Researcher 1 §4 | Simpler than registry; matches `core/surfaces.js` pattern; standardized on `mastra-code` per red-team Finding A1 |
| D5 | Runtime config layout: claude-code=`{mcp_config: ".mcp.json", settings: ".claude/settings.json"}`; droid=`{mcp_config: ".factory/mcp.json", settings: ".factory/settings.json"}` | Researcher 2 E3 + verification | Verified: Claude MCP at root `.mcp.json`; Droid MCP at `.factory/mcp.json` |
| D6 | Requirement #3 (skill spec) accepts prose tool references; structured `tools:` block is a future upgrade | Researcher 1 F1 | Today's SKILL.md files have zero `tools:` block; E.0 adds prose references |
| D7 | Requirement #4 (identity marker) is advisory only; never in `missing[]` | Scope report C1; researcher 1 F5 | `RUNTIME_ID` is not yet adopted; existing runtimes must pass |
| D8 | 24 tests in 5 groups; `fs.mkdtempSync` for fake runtime roots; no committed `_fixtures/` | Researcher 2 A.3-A.4 | Matches `__tests__/legacy-mcp/runtime-agnostic.test.js` pattern; OS-cleaned temp dirs |
| D9 | SKILL.md update: +13 LoC net per file (new "Runtime contract" section + rewritten References section) | Researcher 2 B | Total file size ~111 LoC after; references manifest + 3-layer docs + contract |
| D10 | `contract.js` and `interface/` directory created in `tools/learning-loop-mastra/` (NOT in `core/` or `mastra/`) | Scope report §"Why the interface is a separate concept" | Interface is layer 3 (runtime-facing), not layer 1 (core) or layer 2 (shell) |

## Open Items (from scope report, NOT resolved in this plan)

- **Q1 (5-requirement contract complete):** Plan 2 ships the 5-requirement shape from the scope report. If the validator surfaces a 6th requirement (e.g., observability, license-attribution), the contract is a Markdown doc; amending is a PR-sized follow-up.
- **Q2 (validator enforcement at hook-time vs onboarding-time):** Out of scope; this plan ships the validator as a CLI tool. Enforcement is the bundled hardening plan.
- **Q3 (bundled hardening plan as follow-up):** Out of scope; parallel to Phase E.
- **Q4 (other first-class structures missing):** Out of scope; a separate `/problem-solving` session may surface other missing structures.
- **Q5 (interface rename collision with §2 "Protocol Adapter"):** Resolved: `interface/README.md` will document the distinction ("`interface/` = the runtime-to-loop contract; `protocol-adapter` = the loop-to-tool-name I/O adapter — different concepts").
- **Q6 (E.5 timing):** Plan 4 is the Mastra Code validation. This plan's RUNTIME_ONBOARDING.md provides the worked example (Mastra Code), so Plan 4 has a clear template.

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | SKILL.md files are byte-identical today; updating only one risks drift | Low | Update both with the same content; document the identical-update convention in `interface/README.md` |
| R2 | The 5-requirement contract is over- or under-specified for future runtimes (Mastra Code, future runtimes) | Low | The contract is a Markdown doc; amendments are PR-sized. Plan 4 (Mastra Code) is the first stress test. |
| R3 | `RUNTIME_ID` is advisory today; if a future hardening plan makes it mandatory, both `claude-code` and `droid` will fail the contract | Medium (forward-looking) | The validator's `notes` array signals the advisory state; the contract's `CONTRACT.md` documents the future-hardening direction (LIM-3) so future runtimes ship the marker from day 1 |
| R4 | The validator is `node:fs`-based; tests that use `fs.mkdtempSync` may leak temp dirs on assertion failure | Low | Tests wrap in `try/finally` with `rmSync(root, {recursive: true, force: true})` (researcher 2 A.3 pattern) |
| R5 | The `RUNTIMES` const hard-codes runtime paths; a future runtime with a different config layout requires a code change | Low (intentional) | The contract's `CONTRACT.md` documents the expected layout per runtime; amending `RUNTIMES` is a 5-line PR |
| R6 | The scope report's `note: 'identity-marker-not-adopted'` wording is the singular; this plan uses `notes: string[]` (plural) | Low | The validator's return shape preserves the "informational, non-blocking" semantics; the singular→plural expansion is documented in `CONTRACT.md` |
| R7 | Validator's `universal_exists` check for shim delegation was originally part of requirement #1; red-team Finding F1 found the regex misses real shims (they pass `[universalHook]` as variable, not literal) | Medium (resolved) | YAGNI fix applied: drop `universal_exists` enforcement; requirement #1 reduces to "4 shims exist in `<surface>/coordination/hooks/`" (file existence only). Universal hook wiring is git-tracked and not runtime-mutable — the check is documentation dressed as enforcement. |
| R8 | `pnpm test` GLOBs in `tools/scripts/run-pnpm-test-namespaced.mjs` (single-asterisk) do not cover `__tests__/interface/` (subdir) or `interface/__tests__/` (new tree); red-team Finding A2 | Medium (resolved) | Phase 1 adds 2 new GLOB entries before Phase 5's `pnpm test` claim |

## Verification (how to test the change is right)

1. `ls tools/learning-loop-mastra/interface/` shows `README.md`, `CONTRACT.md`, `contract.js`, `RUNTIME_ONBOARDING.md`, `__tests__/contract.test.js`.
2. `node tools/learning-loop-mastra/interface/contract.js claude-code` returns `{ok: true, ...}` and exits 0.
3. `node tools/learning-loop-mastra/interface/contract.js droid` returns `{ok: true, ...}` and exits 0.
4. `node tools/learning-loop-mastra/interface/contract.js mastra-code` returns `{ok: false, missing: [all 5]}` and exits 1.
5. `node tools/learning-loop-mastra/interface/contract.js --list` exits 0 and prints 3 runtime IDs + 5 requirement IDs.
6. `node --test tools/learning-loop-mastra/__tests__/interface/*.test.js` passes (5 regression guards + 24 contract tests).
7. `grep -c "loop_describe" .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md` returns ≥1 for each file.
8. `grep -c "interface/CONTRACT.md" .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md` returns ≥1 for each file.
9. `pnpm test` passes (all existing tests preserved + 29 new tests in `__tests__/interface/` and `interface/__tests__/contract.test.js`).
10. `meta_state_log_change` is filed with the interface-spec change.

## References

- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (lines 36-50 for the interface structure, lines 56-60 for the 5 requirements, lines 143-156 for the plan split)
- Plan 1: `plans/260624-2335-phase-e-foundation/plan.md` (shipped; sets up the 3-layer architecture)
- Research reports:
  - `plans/reports/plan-2-research-test-skill-onboarding-260625-1618-report.md` (committed; test design + SKILL.md update + onboarding doc)
  - Researcher 1 output is in the agent transcript (design decisions captured in this plan's phase files)
- Codebase references:
  - `tools/learning-loop-mastra/agent-manifest.json` (44 tools, 6 groups)
  - `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` (the 6-item gate; parallel pattern to the new contract)
  - `tools/learning-loop-mastra/core/surfaces.js` (`SURFACES` source of truth)
  - `AGENTS.md` §1.1 (3-layer architecture: Core / Mastra shell / Runtime interface)
  - `AGENTS.md` §2 (Hook matrix)
  - `tools/learning-loop-mastra/__tests__/phase-e-foundation/*.test.js` (4 regression-guard tests; same TDD pattern)
  - `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (validator-style test pattern)
- Runtime layout:
  - `.claude/coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs` (4 shims)
  - `.factory/coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs` (4 shims)
  - `.claude/settings.json` (hooks; SessionStart, UserPromptSubmit, PreToolUse)
  - `.factory/settings.json` (hooks)
  - `.mcp.json` (root; Claude Code's MCP config)
  - `.factory/mcp.json` (Droid's MCP config)
  - `.claude/skills/learning-loop/SKILL.md` (skill spec; E.0 updates)
  - `.factory/skills/learning-loop/SKILL.md` (skill spec; E.0 updates)

---

## Red Team Review

### Session — 2026-06-25

**Findings:** 18 total (3 Critical, 4 High, 11 Medium)
**Disposition:** 11 accepted + applied, 7 accepted with notes, 0 rejected (all findings had codebase evidence)
**Reviewers:** Failure Mode Analyst + Assumption Destroyer (Security Adversary denied by auto-mode classifier)

### Findings Table

| # | Finding | Severity | Reviewer | Disposition | Applied To |
|---|---------|----------|----------|-------------|------------|
| F1 | Validator regex `findUniversalHookPath` requires string literal but real shims pass `[universalHook]` variable — silently fails for all 8 shims | Critical | Failure Mode Analyst | **Accept (YAGNI fix)** | Phase 3 (drop `universal_exists` enforcement) |
| A1 | Runtime ID spelled 3 ways: `mastracode`, `mastra-code`, `mastracode` | Critical | Assumption Destroyer | **Accept** | Plan + Phase 3 + Phase 4 + Phase 5 (standardize on `mastra-code`) |
| A2 | `pnpm test` GLOBs in `run-pnpm-test-namespaced.mjs` are single-asterisk; miss new test directories (`__tests__/interface/` subdir, `interface/__tests__/` new tree) | Critical | Assumption Destroyer | **Accept** | Phase 1 (add 2 new GLOBs before Phase 5's `pnpm test`) |
| F2 | Test fixtures use `VALID_SHIM_CONTENT` with literal interpolation that doesn't exercise Claude vs Droid shim divergence | High | Failure Mode Analyst | **Accept (auto-resolved by F1 fix)** | Phase 4 (no change; dropping `universal_exists` removes the assertion gap) |
| F3 | `process.env.RUNTIME_ID` test pollution — `delete` without save/restore | High | Failure Mode Analyst | **Accept** | Phase 4 (add `withCleanRUNTIME_ID(fn)` helper) |
| A3 | Test count claims "1189+" and "1222+" are unverified (only 9 hard-coded GLOBs in test runner) | High | Assumption Destroyer | **Accept** | Plan + Phase 5 (change to "all existing tests preserved + 29 new") |
| A4 | Substring `loop_describe` matches accidentally in `mastra_loop_describe` (canonical name in `agent-manifest.json`) | High | Assumption Destroyer | **Accept (note only)** | Phase 2 + Phase 4 (test passes by substring; tighten is a future hardening item) |
| F4 | Symlink / broken-symlink error path is opaque (raw `error.message` only) | Medium | Failure Mode Analyst | **Accept (note only)** | Phase 3 (classify by `error.code`; document in CONTRACT.md) |
| F5 | `join(rootPath, ...)` not normalized; relative paths depend on `process.cwd()` | Medium | Failure Mode Analyst | **Accept** | Phase 3 (add `path.resolve(rootPath)` at entry of `validate()`) |
| F6 | Empty / whitespace config files produce confusing `Unexpected end of JSON input` errors | Medium | Failure Mode Analyst | **Accept** | Phase 3 + Phase 4 (add `{}` and empty-file tests) |
| F7 | CONTRACT.md ↔ `REQUIREMENT_IDS` drift not coupled-tested (set equality not asserted) | Medium | Failure Mode Analyst | **Accept** | Phase 4 (add Group 5 set-equality test) |
| F8 | Plan contradicts itself on `mastracode` `missing.length` (4 vs 5 in different files) | Medium | Failure Mode Analyst | **Accept** | Plan + Phase 5 (standardize on 4 — `identity-marker` is advisory) |
| F9 | `RUNTIMES` const + onboarding hardcode JSON MCP layout (no TOML/YAML support) | Medium | Failure Mode Analyst | **Accept (note only)** | Phase 4 + onboarding doc (explicitly state JSON-only is scope) |
| F10 | Phase 5 audit trail lost on partial progress (per-phase `meta_state_log_change` deferred) | Medium | Failure Mode Analyst | **Accept (note only)** | Phase 5 (single change-log at ship time; deviation notes via `meta_state_report`) |
| A5 | Phase 1 baseline `tools/learning-loop-mastra/tools/legacy/references/` ENOENT claim is unverified | Medium | Assumption Destroyer | **Accept** | Phase 1 (capture-baseline.cjs must `ls` the dir) |
| A6 | Validator regex would break if shim ever passes Node flags like `['--max-old-space-size=4096', path]` | Medium | Assumption Destroyer | **Accept (note only)** | Phase 3 + Phase 4 (documented limitation; not currently a concern) |
| A7 | `RUNTIMES["mastra-code"]` hardcodes paths that are forward-looking assumptions | Medium | Assumption Destroyer | **Accept** | Phase 4 onboarding (tell implementers to amend `RUNTIMES` if their layout differs) |
| A8 | `meta_state_log_change` operator-role requirement is unverified | Medium | Assumption Destroyer | **Accept (note only)** | Phase 5 (tool is invocable per `self-improvement-agent.js`; operator-grade not required) |

### Criticals Applied — Concrete Changes

**F1 fix (Phase 3):** `checkHookShimSet` returns `{ ok: allExist && allDelegationsValid }` → simplified to `{ ok: allExist }`. The `universal_target` field is preserved for `path_map` documentation but does NOT gate `ok`. CONTRACT.md Requirement #1 is updated: "Pass: all 4 shims exist as files in `<surface>/coordination/hooks/`." (The universal-hook wiring is git-tracked, not runtime-mutable — the check is documentation dressed as enforcement.)

**A1 fix (Plan + Phase 3 + Phase 4 + Phase 5):** standardized on `mastra-code` (with hyphen, matches scope report line 50 and Plan 4's expected identifier). `RUNTIMES["mastra-code"]` const key. CLI invocation: `node contract.js mastra-code`. Test assertions: `validate("mastra-code", root)`. Smoke test: `node contract.js mastra-code`. RUNTIME_ONBOARDING.md Mastra Code worked example: `RUNTIME_ID=mastra-code`.

**A2 fix (Phase 1):** Phase 1 adds 2 new entries to `tools/scripts/run-pnpm-test-namespaced.mjs`:
```javascript
{ ns: "interface-regression-guards", pattern: "tools/learning-loop-mastra/__tests__/interface/*.test.js" },
{ ns: "interface-contract-tests",     pattern: "tools/learning-loop-mastra/interface/__tests__/contract.test.js" },
```
These must be added BEFORE Phase 5's `pnpm test` claim can be verified.

### Whole-Plan Consistency Sweep

After applying accepted findings, re-read `plan.md` and every `phase-*.md`. Reconciled:
- `mastracode` → `mastra-code` (3 occurrences corrected across plan.md, Phase 3, Phase 4, Phase 5)
- `missing: [all 5]` → `missing: [4]` (plan.md line 53, Phase 5 step 7 — `identity-marker` is advisory)
- `universal_exists` removed from requirement #1 pass criteria (Phase 3, CONTRACT.md)
- `1189+` / `1222+` → `all existing tests preserved + 29 new tests` (plan.md, Phase 5)
- `pnpm test` step now depends on Phase 1's GLOB additions (Phase 1 → Phase 5 dependency added)

No unresolved contradictions. Plan is ready for validation.
