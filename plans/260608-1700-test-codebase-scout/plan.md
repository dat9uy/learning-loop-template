---
title: "Test code base scout: read-only audit + meta_state_report filing"
description: "Ships a Node.js scout (tools/learning-loop-mcp/scout/) that audits the project's test code base across 5 dimensions (test inventory, MCP-first bucket classification, dangling/obsolete pattern detection, coverage gap analysis, prompt budget audit) and produces a structured JSON fixture + markdown report. Pure-function modules file their findings via the meta_state_report MCP tool — no direct file I/O. The scout is read-only: zero test file modifications, idempotent (re-runs produce the same output), and validated by 24+ new tests. Closes the audit gap that masked the cold-session test 1 hang (meta-260608T1522Z, corrected at meta-260608T1618Z) by surfacing other tests with the same anti-MCP-phrase + prompt-budget-overrun failure mode before they ship."
status: pending
priority: P2
branch: "main"
tags: [mcp-tools, test-suite, tdd, audit, meta-state]
blockedBy: []
blocks: []
created: "2026-06-08T10:07:24.633Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-20260608-test-codebase-scout.md (design source — Layer 1 criteria, Layer 2 deliverables, Layer 3 payload cookbook)
  - meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env (the symptom the scout is designed to detect earlier)
  - meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio (root cause: anti-MCP phrases in test prompts)
  - meta-260607T0008Z-dual-field-schema-unification (D1 dangling-schema-drift reference)
  - meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list (resolved; the cold-session test now guards this; the scout's bucket-D analysis depends on cold-session test passing)
  - tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js (TDD template — pure function tests with mkdtempSync isolation)
  - tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs (bucket-D test reference — L2 probe pattern, anti-MCP-phrase positive reference)
  - tools/learning-loop-mcp/tools/manifest.json (52 MCP tools to cross-reference for coverage gap analysis)
  - tools/learning-loop-mcp/agent-manifest.json (9 tool groups, source of truth for tool grouping)
  - tools/learning-loop-mcp/core/gate-logic.js (gate patterns to cross-reference for coverage gap analysis)
  - plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md (3-phase TDD precedent — 12 tests, 1 new tool, 1 generic helper, 1 named closeout script, 1 loop-design update)
---

# Test code base scout: read-only audit + meta_state_report filing

## Overview

The test code base at `/home/datguy/codingProjects/learning-loop-template` has grown to **77 test files** (counted in `tools/learning-loop-mcp/__tests__/`, plus `.claude/coordination/__tests__/`, `.factory/hooks/__tests__/`, and plan-specific test files). There is no systematic audit of: (1) which tests bypass MCP with direct file I/O, (2) which tests assert on removed schema fields or removed tools, (3) which MCP tools / schemas / gate patterns / entry kinds lack test coverage, (4) which bucket-D (droid exec) test prompts are at risk of timing out due to anti-MCP phrases.

The cold-session test 1 hang (`meta-260608T1522Z`, corrected `meta-260608T1618Z`) was the most recent symptom of an audit gap: the test prompt forced 6 file reads before any MCP call, defeating the abstraction MCP provides. We do not know how many other tests have the same failure mode.

This plan ships a **single Node.js scout module** (`tools/learning-loop-mcp/scout/`) that walks the test code base, classifies each test by MCP-first bucket, detects dangling patterns, surfaces coverage gaps, and audits prompt budgets. The scout is **read-only**, **idempotent**, and **files all findings via the `meta_state_report` MCP tool** (not direct I/O). The 5 deliverables and 5-criteria glossary are locked in the brainstorm report at `plans/reports/brainstorm-20260608-test-codebase-scout.md`; this plan implements them.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD schemas and tests first)](./phase-01-red-tdd-schemas-and-tests-first.md) | Pending | ~2h | — |
| 2 | [Green (scout implementation)](./phase-02-green-scout-implementation.md) | Pending | ~2.5h | Phase 1 |
| 3 | [Refactor and closeout (run scout and file findings)](./phase-03-refactor-and-closeout-run-scout-and-file-findings.md) | Pending | ~1.5h | Phase 2 |

**Total effort:** ~6h

## Phasing Rationale

TDD-first per the brainstorm's "scout execution protocol" (Phase 1 = output schemas + tests for all 5 deliverables, no implementation). Phase 2 implements just enough to make the tests pass (pure-function modules: bucket classifier, dangling detector, gap analyzer, budget estimator). Phase 3 runs the scout against the real test code base, files all candidate findings via the `meta_state_report` MCP tool, verifies zero test file modifications via `git status`, and writes a journal entry. This matches the precedent set by `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md` (3-phase TDD, ~3h total; this plan is larger because the scout has 5 deliverables vs the patch tool's 1).

**Why TDD-first matters for the scout specifically**: the criteria glossary (Layer 1 of the brainstorm) is the source of truth for both the scout's classification and the future fixes' acceptance criteria. Locking the criteria as tests BEFORE the implementation prevents drift between the brainstorm's intent and the code that realizes it.

## Key Design Decisions (locked in brainstorm + research)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | 5 deliverables from the brainstorm (inventory, MCP-first audit, dangling detection, gap analysis, prompt budget) | All 5 are required by the brainstorm's "Acceptance criteria" section; the report must cover all 5 |
| Architecture | Pure-function modules (bucket-classifier, dangling-detector, gap-analyzer, budget-estimator) + thin orchestrator (run-scout) | Pure functions are testable without I/O; orchestrator handles file walk + JSON output; meta_state_report filing is the only side effect, deferred to Phase 3 |
| I/O discipline | All findings filed via `meta_state_report` MCP tool | AGENTS.md "MCP-First Record Access" + meta-260606T2102Z escape-hatch abuse closure; no `node -e` scripts, no `writeEntry` imports |
| Idempotency | Sort all output arrays by file path; deterministic timestamps from input mtime; content-hash-based dedup for findings | Re-running the scout must produce byte-identical JSON output (modulo run timestamp in envelope); per meta-260606T1500Z (closeout script idempotency bug) |
| Read-only | Zero writes to `__tests__/` or any other test path | Hard constraint from brainstorm § "Non-negotiable constraints"; verified by `git status --porcelain` in Phase 3 closeout |
| Output shape | JSON fixture at `tools/learning-loop-mcp/scout/fixtures/scout-output.json` + markdown report at `docs/journals/<DATE>-test-scout-report.md` | JSON for downstream tooling; markdown for human review (per brainstorm's "Open questions" resolution) |
| Plan mode | `--tdd` | Per user request; strong existing test infrastructure (852+ tests at last count); the scout is the 3rd TDD plan in the project's history (after 260602-rule-loop-design-first-class and 260608-1015-meta-state-patch-tool-and-wire-format-fix) |
| Test runner | `node --test` (built-in) | Per package.json `test` script; `.test.js` for ESM modules, `.test.cjs` reserved for tests that spawn `droid exec` (the scout itself does NOT spawn droid; all bucket-D analysis is static) |

## Critical Files

- **Create:**
  - `tools/learning-loop-mcp/scout/bucket-classifier.js` (~150 lines) — pure function: `(testFilePath, sourceCode) → 'A' | 'B' | 'C' | 'D'`
  - `tools/learning-loop-mcp/scout/dangling-detector.js` (~200 lines) — pure function: `(testFilePath, sourceCode, resolvedFindings) → DanglingMatch[]`
  - `tools/learning-loop-mcp/scout/gap-analyzer.js` (~250 lines) — pure function: `(contractSurface, testFiles) → GapReport`
  - `tools/learning-loop-mcp/scout/budget-estimator.js` (~150 lines) — pure function: `(testFilePath, promptText) → BudgetEstimate`
  - `tools/learning-loop-mcp/scout/run-scout.js` (~100 lines) — orchestrator: walks project, calls pure functions, writes JSON + markdown
  - `tools/learning-loop-mcp/scout/scout-output.schema.json` (~80 lines) — JSON Schema for the scout's output fixture
  - `tools/learning-loop-mcp/__tests__/scout-bucket-classifier.test.js` (~200 lines, 8 tests)
  - `tools/learning-loop-mcp/__tests__/scout-dangling-detector.test.js` (~250 lines, 8 tests)
  - `tools/learning-loop-mcp/__tests__/scout-gap-analyzer.test.js` (~250 lines, 6 tests)
  - `tools/learning-loop-mcp/__tests__/scout-budget-estimator.test.js` (~200 lines, 4 tests)
  - `tools/learning-loop-mcp/__tests__/scout-run-scout.test.js` (~150 lines, 3 integration tests + 1 idempotency test)
  - `docs/journals/260608-test-scout-report.md` — final markdown report (Phase 3 output)
- **Modify:**
  - None in `tools/learning-loop-mcp/` core (the scout is additive; no refactor of existing code)
  - `package.json` `test` script (add `tools/learning-loop-mcp/scout/**/*.test.js` to the glob if scout tests are colocated there; default convention is __tests__/ — confirm in Phase 1.1)
- **Delete:** None

## Out of Scope (Deferred)

- Fixing any of the candidate findings the scout surfaces (separate plan; per brainstorm § "Open questions" the future plan session will triage)
- Sub-agent parallel execution shape (per brainstorm § "Scope boundary": single-agent sequential is the locked choice)
- Runtime execution of bucket-D tests to validate prompt budget latencies (the latencies in C5 are estimates from the cold-session test 1 trace; the scout does not run droid exec — that's a separate capability)
- Auto-triage of findings (group by severity, batch by category) — the scout's job is to FILE findings, not to prioritize them
- Schema for the markdown report (the JSON schema covers the fixture; the markdown is a thin projection)
- Web UI / dashboard for scout results (out of scope; the JSON fixture is the data interface)
- Hook integration (the scout is invoked on-demand by a future plan, not gated as a pre-commit hook)

## Success Criteria (Plan-Level)

- [ ] All 852+ existing tests pass (no regressions from the scout's presence)
- [ ] 24+ new tests pass (8 bucket-classifier + 8 dangling-detector + 6 gap-analyzer + 4 budget-estimator + 3 run-scout integration + 1 idempotency + ≥1 schema-validation test)
- [ ] `scout-output.schema.json` validates the scout's output fixture (round-trip)
- [ ] Re-running the scout on the real test code base produces the same JSON output (modulo `run_timestamp` in the envelope) — verified by hashing the diffed output
- [ ] `git status --porcelain` shows zero modifications under `__tests__/` after the scout runs
- [ ] Cold-session test 1 is correctly flagged: `cold-session-discoverability.test.cjs#test 1` appears in the prompt budget audit with `timeout_utilization > 100%` and `bucket-D + anti-MCP-phrase + prompt-budget-overrun` flags
- [ ] Bucket C count is 0 or near-0 in the MCP-first audit (we've been disciplined; this is a regression check)
- [ ] All candidate findings are filed via `meta_state_report` MCP tool — zero `node -e` escape-hatch usage
- [ ] `pnpm check` passes (validate records + extract index + tests)
- [ ] No new tools are added to `tools/manifest.json` (the scout is internal infrastructure, not an MCP tool)

## Dependencies

**No external plan dependencies.** The scout depends only on existing primitives:
- `node:fs` / `node:path` for file walking (built-in)
- `yaml` (already a dependency, used elsewhere in the project for parsing fixture YAML)
- `node:test` for the scout's own tests (built-in)
- `ajv` (already a dependency) for JSON Schema validation of the output fixture
- `meta_state_report` MCP tool (the only side effect, called from Phase 3 closeout script)

**Reference findings** (not blockers; the scout reuses their pattern references):
- `meta-260608T1522Z` + `meta-260608T1618Z` — the symptom + root cause the scout's C4/C5 criteria were designed to detect
- `meta-260607T0008Z` — the D1 schema-drift pattern reference
- `meta-260606T0443Z` (resolved) — the cold-session test guard; the scout's bucket-D analysis assumes the cold-session test passes

## Risks (Top 3)

1. **False positives in bucket classification** — A test that uses `readFileSync` of a YAML fixture may look like bucket C but is actually bucket B. **Mitigation:** the bucket classifier distinguishes I/O in `beforeEach`/`afterEach` blocks (setup) from I/O in `test`/`it` blocks (logic). False positives are visible in the JSON output's `bucket_reason` field, so the future plan session can audit them. (Per brainstorm § "Implementation Considerations and Risks".)
2. **Static detection misses dynamic patterns** — D4 (stale fixture) and D5 (stale TOLERANCES) require running the test to confirm staleness. **Mitigation:** the scout flags D4/D5 as "candidate" with a `requires_runtime_check: true` field; the future plan session can run the flagged tests to confirm. The scout does NOT execute tests (it is read-only).
3. **Prompt budget latencies drift** — The latencies in C5 (file read 12s, MCP call 8s, etc.) are derived from one trace (the cold-session test 1 hang). **Mitigation:** the latencies are a configurable constant in `budget-estimator.js` (default values from the brainstorm, overridable via `process.env.SCOUT_BUDGET_LATENCIES` JSON). The future plan session can re-measure with additional traces and update the defaults via `meta_state_patch`.

## Red Team Review

### Session — 2026-06-08

**Reviewers:** 3 hostile lenses (Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Verification tier:** Standard (3 phases) — Fact Checker + Contract Verifier
**Findings:** 13 total (2 Critical, 4 High, 5 Medium, 2 Low), all evidence-backed with `file:line` citations
**Disposition:** 13 Accept, 0 Reject, 0 Modified
**Report:** Inline below (no separate file; this plan does not spawn a sub-agent for the red team)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Test file count overstated: "78+", actual is 77 | Low | Accept | plan.md Overview, Phase 1.7 test 2 assertion (78 → 77) |
| F2 | Gap-analyzer integration test #6 (Phase 1.5) asserts `gap_table` is non-empty — passes vacuously if analyzer returns empty entries for every surface | Critical | Accept | Phase 1.5 test 6 (assert gap_table has at least 3 entries, not 1) |
| F3 | Bucket-classifier uses regex for block parsing — naive regex miscounts nested `describe` blocks (e.g., the cold-session test file has nested describes) | High | Accept | Phase 1.3 — add test 9 (nested describe: counts outer test only), Phase 2.1 algorithm note (regex is 1-level deep; nested describes counted by their outermost test) |
| F4 | Budget-estimator counts `mcp__learning_loop_mcp__` strings — counts in comments inflate the count | High | Accept | Phase 2.4 — strip `//` and `/* */` comments from prompt text before counting |
| F5 | `run-scout.js` writes JSON fixture to `tools/learning-loop-mcp/scout/fixtures/scout-output.json` — the fixture is committed to git, will become stale on every refactor, and is not validated by the existing pre-commit hook (`pnpm validate:records && pnpm extract:index`) | High | Accept | Phase 2.5 — add `validate:fixtures` script to package.json (or document the fixture is regenerated-only; recommended: regenerate via pre-commit hook) |
| F6 | Closeout script location: `tools/scripts/` is not the existing convention. Existing scripts live in `tools/learning-loop-mcp/scripts/` (8 scripts). The 260608-1015 plan's `tools/scripts/closeout-260608-1015-patch-loop-design.mjs` deviated from convention | Medium | Accept | Phase 3.1 — use `tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs` (matches convention); note the 260608-1015 deviation in the journal entry as a follow-up to consolidate |
| F7 | D5 detector comment heuristic is too permissive: a comment like `// TOLERANCES are stale` would suppress the flag | Medium | Accept | Phase 1.4 test 8 (D5) — require comment to contain one of `{intentional, expected, computed, derived}` to suppress the flag |
| F8 | Orchestrator passes empty string to bucket-classifier if file read fails — classified as bucket A by default. Empty source ≠ valid test | Medium | Accept | Phase 2.1 — bucket-classifier returns `{ bucket: "error", reason: "empty source" }` for empty source; orchestrator skips files with size 0 |
| F9 | Idempotency depends on deterministic content-hashes, but `run_timestamp` and `last_modified` are not in the hash. Need to clarify which fields ARE in the hash | Medium | Accept | Phase 1.7 test 4 — assert hash excludes `run_timestamp` and `inventory[].last_modified`; include all other fields |
| F10 | Markdown report says "5 deliverable tables" but Deliverable 5 (prompt budget audit) is per-test, not per-file. The markdown format should clarify | Low | Accept | Phase 2.5 — markdown projection uses a "per-test budget table" heading for Deliverable 5 |
| F11 | Plan doesn't say what happens if scout finds ZERO findings | Medium | Accept | Phase 3.3 — closeout script logs `OK: 0 findings filed` and exits 0; smoke test asserts `meta_state_list` returns the expected zero-or-more findings (not a hard requirement of N>=1) |
| F12 | Scout's own tests should not be in the scout's audit (recursive self-reference) | Low | Accept | Phase 2.5 — orchestrator's `walkProject` accepts a `excludeGlobs` option; default excludes `tools/learning-loop-mcp/scout/test-fixtures/` (the mini-codebase) and `tools/learning-loop-mcp/scout/__tests__/` (the scout's own tests, future-proofing) |
| F13 | Cold-session test guard (meta-260606T1656Z-cold-session-test-must-pass-before-resolution) blocks `meta_state_resolve` but NOT `meta_state_report`. Plan correctly notes this in Phase 3 risks, but Step 3.3 should also assert the closeout doesn't accidentally call `meta_state_resolve` | High | Accept | Phase 3.3 — add a static check: grep the closeout script for `meta_state_resolve` and fail the closeout if found (defense in depth) |

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-red-tdd-schemas-and-tests-first.md, phase-02-green-scout-implementation.md, phase-03-refactor-and-closeout-run-scout-and-file-findings.md
- **Decision deltas checked:** 13 (one per accepted finding)
- **Reconciled stale references:**
  - Test file count: "78+" → 77 (plan.md Overview, Phase 1.7 test 2 assertion)
  - Closeout script path: `tools/scripts/` → `tools/learning-loop-mcp/scripts/` (Phase 3.1)
  - Gap-analyzer integration test 6: `gap_table.length >= 1` → `gap_table.length >= 3` (Phase 1.5 test 6)
  - Bucket-classifier empty source: returns `{ bucket: "A" }` → returns `{ bucket: "error", reason: "empty source" }` (Phase 2.1)
  - Budget-estimator counts in comments: strip `//` and `/* */` before counting (Phase 2.4)
  - D5 comment heuristic: require keyword `{intentional, expected, computed, derived}` (Phase 1.4 test 8)
  - Idempotency hash excludes: `run_timestamp`, `inventory[].last_modified` (Phase 1.7 test 4)
  - Markdown report Deliverable 5 heading: "Prompt Budget Audit (per-test)" (Phase 2.5)
  - Scout's own tests excluded from audit: add `excludeGlobs` to orchestrator (Phase 2.5)
  - Closeout static check for `meta_state_resolve`: grep + fail (Phase 3.3)
  - Zero-findings graceful handling: log "OK: 0 findings" and exit 0 (Phase 3.3)
- **Unresolved contradictions:** 0

