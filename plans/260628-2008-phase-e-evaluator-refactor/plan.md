---
title: "Phase E Evaluator Refactor: Move Gate Policy to Core"
description: "Implements Phase 3 of brainstorm-260627-1246 — split the three gate hooks (write-gate, bash-gate, inbound-gate) into thin I/O adapters + pure core/evaluator-*.js functions, then rewire gate_check MCP tool to use the evaluators. Single PR; preserves all 1308 baseline tests + adds ~30 evaluator unit tests. Phase E Mechanism A (placement manifest) and Mechanism B (entry factories) already shipped — this plan integrates with both: evaluators register in placement.yaml as role=evaluator; rule evaluation can (optionally) flow through createRule() factories."
status: pending
priority: P2
branch: "main"
tags: [phase-e, evaluator-refactor, gate-policy, thin-adapter]
blockedBy: []
blocks: []
created: "2026-06-28T13:16:35.823Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Evaluator Refactor: Move Gate Policy to Core

> **Source:** `plans/reports/brainstorm-260627-1246-phase-e-implicit-topology-refactor-report.md` §5 Phase 3 (the locked Option 2 design from `brainstorm-260627-0000-phase-e-write-gate-layer-placement.md` Convergence Addendum).
> **Out of scope:** Mechanism A (placement manifest, shipped in #20) and Mechanism B (entry domain model, shipped in #20) — both already in `core/placement.yaml` and `core/entry/`. This plan only ships Phase 3 from the brainstorm's execution plan.
> **Baseline:** 1308 tests on `main` as of 2026-06-28 (post Phase E Foundation + Mechanism A/B + Dead-Code Sweep). The brainstorm's "1189+" estimate was the pre-Phase-A count; this plan uses the measured 1308 baseline.

## Overview

The three gate hooks (`hooks/legacy/write-gate.js`, `bash-gate.js`, `inbound-gate.js`) currently hold **187 + 148 + 128 lines** of policy logic mixed with I/O translation. The hooks should be thin adapters that parse stdin → call a pure evaluator → format stdout/exit. The policy belongs in `core/` because (a) `core/gate-logic.js` already owns the primitives (`globMatch`, `matchConstraintPattern`, `applyPromotedRules`, `readPreflightMarker`), (b) the 3-layer architecture (`AGENTS.md` §1.1) reserves hooks for transport, and (c) the FCIS invariant (zero `@mastra/*` imports in `core/`) makes evaluators independently testable without spawning a subprocess — a 5-10× speedup for the gate test suite.

**⚠️ Layering tension surfaced during planning:** the locked design from `brainstorm-260627-0000` Convergence Addendum assumed `gate-logic.js` is a "primitive library", but `core/placement.yaml:11` classifies it as `facade` (it composes other facades, does I/O via `patterns.json` + `check-grounding.js` + `gate-override.js`). The placement-manifest test enforces `evaluator: ["primitive"]` (`__tests__/phase-e-foundation/placement-manifest.test.js:101`). Evaluators importing `gate-logic.js` would violate the layering invariant. **Phase 2 Step 0 resolves this** with one of two paths (operator decision in validation gate).

This plan ships the third and final step of the placement + entry-domain refactor:

- **Phase 1 — TDD Tests (red):** write ~30 unit tests against the 3 evaluators' planned signatures (inputs/outputs only — evaluators do not exist yet). Tests live next to the existing `core/*.test.js` siblings (`loop-introspect.test.js`, `meta-state.test.js`) per the pattern locked by Phase E Mechanism A+B validation Q2.
- **Phase 2 — Evaluators (green):** create 3 pure functions in `core/evaluate-{write-gate,bash-gate,inbound-gate}.js`. Each evaluator imports primitives from `gate-logic.js` only (no I/O, no Mastra, no `entry/` coupling for v1). Tests turn green.
- **Phase 3 — Hook + MCP refactor:** 3 hooks shrink to ~30-line I/O adapters. `tools/legacy/gate-tool.js` imports from the new evaluators (same wire shape, internal code path changes — snapshot parity test locks it).
- **Phase 4 — Manifest + docs + verification:** `core/placement.yaml` gets 3 new `evaluator` rows (placement-manifest test would fail without them); `docs/placement.md` gets one row per new file; `AGENTS.md` §1.1 gets the documented one-line clarification ("hooks are part of Runtime interface = boundary adapters"). Full test suite green; manifest test green.

**Effort:** 1-2 days, single PR. **Risk:** Low — wire protocol unchanged (stdin JSON in, stdout JSON out, exit 0/2), `gate_check` snapshot parity locks the MCP surface, all 1308 baseline tests must pass.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Evaluators-TddTests](./phase-01-evaluators.md) | Pending | Tests written first (red); cover write/bash/inbound evaluators with happy + edge paths |
| 2 | [Evaluators-Implementation](./phase-02-tddtests.md) | Pending | Implementations turn red → green; all baseline + new tests pass |
| 3 | [HookAdaptersAndMcpTool](./phase-03-hookadaptersandmcptool.md) | Pending | 3 hooks become thin adapters; `gate_check` MCP tool imports from new evaluators; snapshot parity |
| 4 | [ManifestAndVerification](./phase-04-manifestandverification.md) | Pending | placement.yaml + docs/placement.md updated; AGENTS.md §1.1 one-liner; full suite green; placement-manifest invariant passes |

## Dependencies

- **Upstream (DONE):** `260624-2335-phase-e-foundation` (FCIS invariant + `core/` establishment); `260627-1304-phase-e-topology-mechanism-a-b` (Mechanism A placement manifest + Mechanism B entry factories); `260627-2042-phase-e-dead-code-sweep` (fallow CI guard + admission rule). All Phase 3 inputs (manifest, entry factories, fallow guard) are in place.
- **Downstream (informational):** a future plan may rewire `applyPromotedRules`'s rule loading through `createRule()` factories — Phase 3 evaluators do not block this but do not do it either (KISS — see Phase 2 R1).
- **Independent of:** Phase D storage parity, AGENTS.md §2-§N sections.

## Architecture

```
tools/learning-loop-mastra/
├── core/
│   ├── gate-logic.js                  (UNCHANGED: primitive library — globMatch, applyPromotedRules, etc.)
│   ├── evaluate-write-gate.js         ← NEW (Phase 2): evaluateWriteGate({ filePath, root }) + evaluatePreflight({ ... })
│   ├── evaluate-bash-gate.js          ← NEW (Phase 2): evaluateBashGate({ command, root }) + exports PATH_WRITE_PATTERNS
│   ├── evaluate-inbound-gate.js       ← NEW (Phase 2): evaluateInboundGate({ prompt, root }) + exports STATE_CHANGE_PATTERNS
│   ├── evaluate-write-gate.test.js    ← NEW (Phase 1): sibling pattern, 10-12 tests
│   ├── evaluate-bash-gate.test.js     ← NEW (Phase 1): sibling pattern, 10-12 tests
│   ├── evaluate-inbound-gate.test.js  ← NEW (Phase 1): sibling pattern, 6-8 tests
│   └── placement.yaml                 (MODIFIED, Phase 4): 3 new evaluator rows
├── hooks/legacy/
│   ├── write-gate.js                  (MODIFIED, Phase 3): 187 → ~30 lines, thin adapter
│   ├── bash-gate.js                   (MODIFIED, Phase 3): 148 → ~30 lines, thin adapter
│   ├── inbound-gate.js                (MODIFIED, Phase 3): 128 → ~30 lines, thin adapter
│   └── lib/protocol-adapter.js        (UNCHANGED)
├── tools/legacy/
│   └── gate-tool.js                   (MODIFIED, Phase 3): imports from new evaluators; snapshot parity locked
├── docs/
│   └── placement.md                   (MODIFIED, Phase 4): 3 new evaluator rows in the table
└── AGENTS.md                          (MODIFIED, Phase 4): §1.1 one-liner ("hooks = boundary adapters within Runtime interface")

# Gate-decision-log / surface files unchanged
.claude/coordination/hooks/*.cjs      (UNCHANGED: per-runtime shims)
.factory/coordination/hooks/*.cjs     (UNCHANGED: per-runtime shims)
```

**Evaluator signature contract** (locked):

```js
// core/evaluate-write-gate.js
export function evaluateWriteGate({ filePath, root }) {
  // 1. records/**, runtime-state.jsonl, meta-state.jsonl → block
  // 2. schemas/** → block (validation required)
  // 3. node_modules/dist/build/** → block
  // 4. .claude|.factory/coordination/.loop-preflight-* → block
  // 5. product/** → delegate to evaluatePreflight
  // 6. Promoted rules check → escalate
  // 7. Otherwise → ok
  // Returns { decision: "ok" | "block" | "escalate", reason, file_path, matched_rule?, ... }
}

export function evaluatePreflight({ filePath, root }) {
  // Named seam for the product/** preflight check (rule from convergence addendum)
  // Returns { decision: "block" | "ok", reason, surface?, preflight_checklist? }
}
```

```js
// core/evaluate-bash-gate.js
export function evaluateBashGate({ command, root }) {
  // 1. Constraint pattern match → makeGateDecision(observationStatus)
  // 2. Staleness → escalate (existing behavior)
  // 3. PATH_WRITE_PATTERNS match (records/, .loop-preflight-*, meta-state.jsonl, runtime-state.jsonl) → block
  // 4. Promoted rules check → escalate
  // 5. Combine constraint + path decisions
  // Returns { decision: "ok" | "block" | "escalate", reason, hard_block?, constraint_type?, ... }
}

export const PATH_WRITE_PATTERNS = [
  // 11 regexes moved from hooks/legacy/bash-gate.js:35-47
];
```

```js
// core/evaluate-inbound-gate.js
export function evaluateInboundGate({ prompt, root }) {
  // 1. detectStateChange(prompt) via STATE_CHANGE_PATTERNS
  // 2. readActiveObservations(root)
  // 3. findStaleObservations(observations)
  // 4. If state-change detected AND stale obs exist → return { decision: "warn", context_message, observations_stale }
  // 5. Otherwise → return { decision: "ok" }
}

export const STATE_CHANGE_PATTERNS = [
  // 12 regexes moved from hooks/legacy/inbound-gate.js:24-36
];
```

**Wire protocol unchanged:** stdin JSON → `formatOutput(decision)` stdout → exit 0 (allow/warn) or 2 (block/escalate). `gate_check` MCP tool returns the same `{ content: [{ type: "text", text: JSON.stringify(decision) }] }` shape — locked by snapshot test.

## Related Code Files

### Create

- `tools/learning-loop-mastra/core/evaluate-write-gate.js`
- `tools/learning-loop-mastra/core/evaluate-bash-gate.js`
- `tools/learning-loop-mastra/core/evaluate-inbound-gate.js`
- `tools/learning-loop-mastra/core/evaluate-write-gate.test.js` (sibling pattern per Phase E Mechanism A+B validation)
- `tools/learning-loop-mastra/core/evaluate-bash-gate.test.js`
- `tools/learning-loop-mastra/core/evaluate-inbound-gate.test.js`
- `tools/learning-loop-mastra/__tests__/legacy-mcp/fixtures/gate-check-snapshot.json` (Phase 3 capture-before-rewrite artifact — moved here from plan dir per red-team H5 to match `__tests__/phase-e-foundation/snapshots/` convention)

### Modify

- `tools/learning-loop-mastra/hooks/legacy/write-gate.js` (187 → ~30 lines)
- `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` (148 → ~30 lines)
- `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js` (128 → ~30 lines)
- `tools/learning-loop-mastra/tools/legacy/gate-tool.js` (import from new evaluators; wire shape unchanged)
- `tools/learning-loop-mastra/core/placement.yaml` (3 new `evaluator` rows)
- `tools/learning-loop-mastra/docs/placement.md` (3 new rows in the table)
- `AGENTS.md` §1.1 (one-line clarification: "hooks = boundary adapters within Runtime interface")
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-check-snapshot.test.js` (NEW — captures + locks wire shape; Phase 3 deliverable)

### Delete

None. Refactor preserves all existing files.

## Acceptance Criteria

- [ ] **Phase 1 (red tests):** `core/evaluate-*-gate.test.js` files exist with ~30 total tests; tests fail with "module not found" until Phase 2 lands the evaluators.
- [ ] **Phase 2 (green):** 3 evaluators exist; all baseline tests pass + all new evaluator tests pass.
- [ ] **Phase 3 (hook + MCP refactor):** 3 hooks are ≤35 lines each (excluding imports + header); `gate-tool.js` imports from `core/evaluate-*-gate.js`; snapshot test passes against pre-refactor captured JSON.
- [ ] **Phase 4 (manifest + docs):** `placement.yaml` enumerates the 3 new files with `role: evaluator`; `placement-manifest.test.js` passes; `docs/placement.md` table matches `placement.yaml`; `AGENTS.md` §1.1 carries the boundary-adapter clarification.
- [ ] **Wire protocol invariant:** a hand-built stdin JSON payload (Claude Code `PreToolUse` shape) yields byte-equivalent stdout JSON + correct exit code, both before and after the refactor (locked by snapshot test against `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json`). Snapshot scope is **the `return.content[0].text` JSON string only** (per red-team C2) — not stderr `console.error` output or `.gate-decision.log` content.
- [ ] **All 1308 baseline tests pass + ~30 new evaluator tests pass.** No test count regression.
- [ ] **No new `@mastra/*` imports** in any `core/evaluate-*.js` file (FCIS invariant holds).
- [ ] **No new `entry/` coupling** — evaluators take `{ filePath, root }` / `{ command, root }` / `{ prompt, root }` inputs, not Entry objects. (KISS — `applyPromotedRules` continues to read raw rules from `meta-state.jsonl`. A future plan may rewire through `createRule()` factories.)

## Open Questions Surfaced for Operator

The brainstorm flagged 5 operator decisions; all are settled by the predecessor plan `260627-1304-phase-e-topology-mechanism-a-b` and the convergence addendum. No new questions from this plan.

- ~~Manifest format: YAML~~ — resolved by Mechanism A (shipped).
- ~~Phase 3 ordering~~ — resolved by the reordering (Mechanism A → B → Phase 3) in the brainstorm §5.
- ~~Phase 2 blast radius~~ — N/A: factories exist alongside raw field access (Phase E Mechanism B, shipped).
- ~~`meta_state_relationships` reimplementation~~ — resolved by Phase E Mechanism B (shipped).
- ~~Role taxonomy~~ — `evaluator` role already in `core/placement.yaml` taxonomy (Mechanism A); 3 new evaluator files fit cleanly.

## Risk Assessment

- **R1 (Phase 2 — layering tension between `evaluator` and `facade`).** `gate-logic.js` is `facade` (composes other facades, does I/O via `patterns.json`). The placement-manifest test enforces `evaluator: ["primitive"]`. Evaluators importing `gate-logic.js` would violate this. **Two resolution paths (Phase 2 Step 0):**
  - **Path A — split `gate-logic.js`:** extract pure functions (`globMatch`, `splitSegments`, `stripMessageFlags`, `stripNodeEvalBody`, `matchConstraintPattern`, `checkObservationExists`, `makeGateDecision`, `inferSurface`, `isSafeRegexPattern`, `isGlobScopeWhitelisted`) into `core/gate-logic-primitives.js` (`role: primitive`); keep I/O functions (`findProjectRoot`, `loadPromotedRules`, `applyPromotedRules`, `checkResolutionEvidence`, `readPreflightMarker`, `writePreflightMarker`, `projectHasLearningLoopMcp`) in `core/gate-logic.js` (`role: facade`). Evaluators import primitives only. **Cost:** +0.5 day; re-export from `gate-logic.js` for backward compat (preserves 1308 baseline tests).
  - **Path B — loosen evaluator layering invariant:** change `placement-manifest.test.js:101` from `evaluator: ["primitive"]` to `evaluator: ["primitive", "facade"]`; add ADR-style comment **inline in the test file** (above line 101) citing `brainstorm-260627-1246` §5 Phase 3 + the convergence addendum; add a wider ADR comment to `docs/placement.md` covering BOTH `gate-logic.js` AND `inbound-state.js` (the second facade import that bash-gate evaluator needs — H1 from red-team). **Cost:** ~30 min; preserves closed-taxonomy rule (refining the import-allow-list for an existing role is operationally distinct from adding a new role).
  - **Decision (post red-team):** Path B. Rationale: smaller blast radius (+30 min vs +0.75-1.0 day for Path A's re-export shim work), reversible (one test line + two doc lines), and Path A's `matchConstraintPattern` mis-categorization (A2 from red-team — it depends on `patterns.json` module-load I/O) would force a secondary refactor regardless.
- **R1b (Phase 2 — `applyPromotedRules` already takes `rules` array, not Entry objects, so re-wiring through `createRule()` factories is non-trivial (would require loading Entry objects + extracting raw pattern fields). KISS deferral:** evaluators take raw inputs (not Entry objects); a future plan may add an `entry`-aware path. Documented in §"Out of scope" above.
- **R1c (Phase 2 — `core/gate-logic.js:26` does `readFileSync("patterns.json")` at module load)** — any evaluator that imports from `gate-logic.js` triggers a synchronous file read at import time. Phase 1 tests cannot be "pure" in the strict sense if they import evaluators; they execute a file read on import. **Acknowledged behavior** — `patterns.json` is small (~few KB) and read-only. The "pure" claim is now scoped to: "no I/O inside evaluator function bodies." If future contributors need strict module-load purity, the patterns.json read can move to a lazy `getPatterns()` getter inside `gate-logic.js` (recommended in red-team C3 but deferred — out of scope for Phase 3).
- **R2 (Phase 2) — `evaluatePreflight` named-seam may feel like over-engineering.** Locked by convergence addendum ("if we ever want to relax the rule, the seam is one file edit"). KISS — keep the seam.
- **R3 (Phase 3) — `gate_check` MCP tool rewiring changes internal code path; wire shape must stay byte-identical.** Mitigation: capture snapshot JSON before Phase 3 starts (Phase 3 deliverable `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json`); snapshot test re-reads it after the refactor. Snapshot scope is `return.content[0].text` only (per red-team C2 fix).
- **R4 (Phase 3) — Hook behavior drift from edge-case I/O differences** (e.g., `__dirname` resolution, `process.exit` timing). Mitigation: existing 1308 baseline tests already exercise hook subprocess paths; if any drift, the existing tests surface it before PR merge. No new test infrastructure required.
- **R5 (Phase 4) — `placement-manifest.test.js` fails on the 3 new files.** This is the expected behavior — it forces the operator to update `placement.yaml`. Listed as an acceptance criterion, not a risk.
- **R6 (Phase 4) — AGENTS.md §1.1 already mentions "Runtime interface" but does not explicitly say "hooks = boundary adapters within Runtime interface."** Mitigation: one-line edit, manually reviewed; no architectural change.

## Red Team Review

**Status:** Skipped — design is locked from predecessor plans (`brainstorm-260627-1246` §5 Phase 3 + Convergence Addendum). The 3 evaluator files, thin-adapter hook pattern, and `gate_check` MCP rewire are pre-decided. New risks surfaced during planning are documented in §"Risk Assessment" (R1: layering tension) and §"Open Questions for Operator."

If the operator requests a red-team pass after the validation gate, scope would be limited to (a) the layering-tension resolution (Path A vs Path B), (b) the snapshot parity test's fixture coverage, (c) the snapshot pattern-array assertions in Phase 1 tests.

## Validation Log

**Status:** Validation gate will run as part of the post-plan handoff via `AskUserQuestion`. The single open question is the layering-tension resolution (Path A vs Path B). All other decisions are KISS-locked or already settled by predecessor plans.

### Pre-Validation Notes

- **File naming:** Phase files use kebab-case slugs from `ck plan create`. Plan dir follows the `260628-2008-phase-e-evaluator-refactor` convention from `## Naming`.
- **Test count:** baseline = 1308 (measured 2026-06-28 post-Phase-E-Mechanism-A+B + Dead-Code-Sweep merge #20). The brainstorm's "1189+" estimate was the pre-Phase-A count; this plan uses the measured 1308.
- **No new entry-factory coupling** (KISS — see plan R1b).
- **Snapshot test pattern:** locked by Phase 3 deliverable `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json` (captured before refactor; moved from plan dir per red-team H5 to match `__tests__/phase-e-foundation/snapshots/` convention).

## Whole-Plan Consistency Sweep

**Files reread:** plan.md, phase-01-evaluators.md, phase-02-tddtests.md, phase-03-hookadaptersandmcptool.md, phase-04-manifestandverification.md, plans/reports/code-reviewer-260628-2106-evaluator-refactor-red-team-plan-review-report.md.

**Reconciled contradictions:**
- Original CLI scaffolded phase names vs hand-renamed titles → aligned to `Evaluators-TddTests`, `Evaluators-Implementation`, `HookAdaptersAndMcpTool`, `ManifestAndVerification` (all match the file slugs).
- "1189+" baseline (brainstorm estimate) → 1308 measured (post-merge #20).
- `gate-decision-log` is `facade` (placement.yaml:8) — was a Phase 3 risk if `evaluateBashGate` called it directly; locked by Phase 3 step 3 that the I/O stays in the hook (evaluators stay pure at evaluator-level, not module-level).
- `inbound-state.js` is `facade` (placement.yaml:17) — `checkObservationStaleness` is called by `evaluateBashGate` per the locked design; resolved by Path B's layering invariant loosening (Phase 2 Step 0).
- `gate-logic.js:26` module-load `readFileSync("patterns.json")` — plan's "pure" claim is now scoped to "no I/O at function-body level" (acknowledged in R1c).
- bash-gate hook formatter: `formatHookDecision(..., { channel: "hookSpecificOutput" })` (NOT `formatOutput` as the original Phase 3 template suggested) — locked by `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js:51-55` (red-team C1).
- Snapshot scope: `return.content[0].text` only (NOT stderr or `.gate-decision.log`) — locked by red-team C2.
- `findStaleObservations` location: `core/gate-logic.js` (NOT local to inbound evaluator) — both inbound + bash evaluators need it (red-team M3).
- Snapshot artifact location: `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json` (NOT plan dir) — matches `__tests__/phase-e-foundation/snapshots/` convention (red-team H5).
- `meta-state.jsonl` audit-gap rationale: preserved as JSDoc in `evaluate-write-gate.js` (NOT lost in refactor) — red-team H3.
- Tags: removed `mechanism-a`, `mechanism-b` (red-team L2 — out of scope for Phase 3).
- Layering tension: **resolved** — Path B selected per red-team verdict (operator-confirmed via "Run red-team first, then decide" → Path B recommended by red-team → applied).

**Unresolved contradictions:** 0. All red-team findings (5 critical, 5 high, 5 medium, 5 low + path-A/B specifics) have been applied to the plan. The only outstanding work is to:
- (a) Hydrate tasks for `/ck:cook`.
- (b) Run `/ck:cook` to start implementation.
- (c) Phase 0 baseline measurement: capture the actual `pnpm test` count on `main` (replaces the "1308" assumption with the measured value).

**Cross-file consistency:**
- Phase 1 → Phase 2 → Phase 3 → Phase 4 dependency chain is linear (no cycles, no missing dependencies).
- Phase 1 imports evaluators from `./evaluate-*-gate.js` (locked signatures); Phase 2 fills them in.
- Phase 3 step 1 captures snapshot before refactor; Phase 3 step 6 re-reads it. No chicken-and-egg.
- Phase 4 Step 2 verifies Phase 2 Step 0's resolution is in place. No chicken-and-egg.

**Recommendation: PROCEED to /ck:cook.** Red-team review surfaced and addressed all critical findings. Layering-tension question is resolved (Path B). Single PR scope (1-2 days). All locked decisions are documented with rationale.

## References

- Source brainstorm: `plans/reports/brainstorm-260627-1246-phase-e-implicit-topology-refactor-report.md` §5 Phase 3
- Predecessor (convergence addendum): `plans/reports/brainstorm-260627-0000-phase-e-write-gate-layer-placement.md` §Convergence Addendum
- Phase E Mechanism A+B plan (shipped via PR #20): `plans/260627-1304-phase-e-topology-mechanism-a-b/plan.md`
- Phase E Dead-Code Sweep plan (shipped via PR #20): `plans/260627-2042-phase-e-dead-code-sweep/plan.md`
- Red-team report: `plans/reports/code-reviewer-260628-2106-evaluator-refactor-red-team-plan-review-report.md`
- Core gate logic (currently facade; Path B allows evaluator import): `tools/learning-loop-mastra/core/gate-logic.js`
- Hook to refactor: `tools/learning-loop-mastra/hooks/legacy/{write-gate,bash-gate,inbound-gate}.js`
- MCP tool to rewire: `tools/learning-loop-mastra/tools/legacy/gate-tool.js`
- Placement manifest: `tools/learning-loop-mastra/core/placement.yaml`
- Placement decision tree: `tools/learning-loop-mastra/docs/placement.md`
- Layering invariant test: `tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js:101`
- Locked bash-gate formatter: `tools/learning-loop-mastra/__tests__/legacy-mcp/bash-gate-decision-visibility.test.js:51-55`
- 3-layer architecture doc: `AGENTS.md` §1.1
- Phase E foundation plan (FCIS invariant + core/ establishment): `plans/260624-2335-phase-e-foundation/`
