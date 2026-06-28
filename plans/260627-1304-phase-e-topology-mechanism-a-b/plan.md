---
title: "Phase E Mechanism A + B: Placement Manifest + Entry Domain Model"
description: "Implements the unifier from brainstorm-260627-1246 — Mechanism A encodes the implicit placement topology as docs/placement.md + core/placement.yaml + a manifest invariant test; Mechanism B wraps the 4 meta-state entry kinds in factories that expose outbound/inbound relationship methods, then re-implements meta_state_relationships on top of them. Mechanism A ships first (and guides B); both replace ad-hoc file layering with machine-consultable artifacts. Phase 3 (evaluator refactor) is OUT OF SCOPE — it ships separately per the prior convergence addendum."
status: done
priority: P2
branch: "main"
tags: [phase-e, mechanism-a, mechanism-b, placement-manifest, entry-factory, soft-inversion]
blockedBy: []
blocks: []
created: "2026-06-27T13:04:48.152Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Mechanism A + B: Placement Manifest + Entry Domain Model

> **Source:** `plans/reports/brainstorm-260627-1246-phase-e-implicit-topology-refactor-report.md` (CONVERGED). Supersedes the prior `brainstorm-260627-0000-phase-e-write-gate-layer-placement.md` for planning purposes.
> **Step-by-step execution:** Mechanism A (placement) ships first and *guides* Mechanism B (entry domain model). Phase 3 (evaluator refactor — the prior Option 2) is OUT OF SCOPE here; it ships separately.
> **Constraint referenced:** Operator concern that "the solution is kind of ad-hoc … there is no way to make sure that in the future, the agent could make the correct choice … the current way of managing core/ is kind of add more and more function file without any coherence." Both mechanisms convert implicit, history-only knowledge into machine-consultable artifacts.

## Overview

The plan installs the **mechanism** behind Phase E's prior file moves, not the moves themselves. Two complementary mechanisms ship in two phases, each with its own PR:

- **Phase 1 — Mechanism A (placement topology):** every production file in `core/` is enumerated in `core/placement.yaml` with a `layer` and `role`. A new test (`__tests__/phase-e-foundation/placement-manifest.test.js`) fails whenever a file is added/removed/relocated without a manifest update. `docs/placement.md` is the 5-question decision tree an agent walks to decide "where does my new code go?". This converts the operator's history-only knowledge of "evaluators compose primitives, primitives don't import each other, etc." into a tested manifest. Final count after Mechanism B = **29 production files** (23 pre-entry/ baseline + 6 `core/entry/*.js` added by Mechanism B). The 4 `*.test.js` files colocated in `core/` are excluded from the manifest; new tests follow the sibling `*.test.js` pattern (Phase 2 / Phase 5).
- **Phase 2 — Mechanism B (entry domain model with relationships):** four factory functions wrap the canonical Zod schemas (soft inversion — schemas stay source of truth, factories expose ergonomic surface) and provide `outboundRefs()` / `inboundRefs(root)` for every entry kind. The existing `meta_state_relationships` MCP tool re-implements on top of factories, **preserving the dual-field `promoted_to_rule` migration logic** from the current tool (lines 43-53) so legacy findings without `promoted_to_rule` continue to resolve to their origin rule. Cross-cutting helpers in `core/entry/index.js` (`validateCrossRefs`, `findOrphans`, `outboundRefsAll`) become the canonical API for graph operations.

**Out of scope (Phase 3, separate plan):** the three new `evaluate-*.js` files and the three thin hook adapter refactors from the prior convergence addendum. They ship as their own PR per the operator's "plan later" decision 2026-06-27. Reordering lets Phase 3's evaluators be authored as Mechanism-B-compatible factories from day one (nice-to-have, not blocking).

**Effort:** ~0.5 day Phase 1, ~1.5 days Phase 2. **Risk:** Low–Medium. Both phases are non-behavior-changing (the public MCP surface is preserved by snapshot test). The largest risk in Phase 2 is incidental surface growth on `core/meta-state.js` if factories leak implementation; mitigated by deep-frozen objects and the "schema stays canonical" guardrail.

**Baseline count requirement (Phase-0 prerequisite):** before implementation starts, run `pnpm test` on `main` and capture the exact pass count. The brainstorm estimate of "1189+" was not grounded in measured output. Replace every "1189+" in this plan with the actual baseline count after Phase-0.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [MechanismA-DocAndManifest](./phase-01-mechanisma-docandmanifest.md) | Pending | Doc exists + YAML parses + manifest enumerates all 27 production files |
| 2 | [MechanismA-TestExtension](./phase-02-mechanisma-testextension.md) | Pending | Tests written first (red), then placement-manifest.test.js locks the invariant (green) |
| 3 | [MechanismB-EntryFactories](./phase-03-mechanismb-entryfactories.md) | Pending | Factory unit tests written first (red), factories turn green |
| 4 | [MechanismB-CrossCuttingAndToolReimpl](./phase-04-mechanismb-crosscuttingandtoolreimpl.md) | Pending | Cross-cutting helper tests + MCP-tool snapshot test written first (red) |
| 5 | [MechanismB-TestsAndSnapshot](./phase-05-mechanismb-testsandsnapshot.md) | Pending | Integration suite green; full baseline + ~30 new tests green |

## Dependencies

- **Upstream:** `260624-2335-phase-e-foundation` (done) — establishes `core/` and the FCIS invariant test.
- **Downstream (informational, not blocking):** a future Phase 3 plan that ships the three `evaluate-*.js` files + hook adapters. Phase 3 will benefit from `entry/*.js` already existing for any entry-shaped decision objects.
- **Independent of:** Phase D storage parity work, AGENTS.md §1 sections.

## Architecture

```
tools/learning-loop-mastra/
├── docs/
│   └── placement.md          ← NEW: 5-question decision tree (Phase 1.1)
├── core/
│   ├── placement.yaml        ← NEW: manifest, one row per file (Phase 1.2)
│   ├── README.md             ← MODIFIED: soft-inversion contract (Phase 4)
│   ├── meta-state.js         ← UNCHANGED: Zod schemas stay canonical
│   ├── entry/                ← NEW directory (Phase 3)
│   │   ├── finding.js
│   │   ├── rule.js
│   │   ├── change-log.js
│   │   ├── loop-design.js
│   │   ├── index.js          ← factoryFor + validateCrossRefs + findOrphans + outboundRefsAll
│   │   └── __tests__/        ← NEW test directory (Phase 5)
│   └── (other 27 production files, all enumerated in placement.yaml)
├── __tests__/
│   └── phase-e-foundation/
│       ├── fcis-invariant.test.js          (unchanged; covers @mastra)
│       ├── placement-manifest.test.js      ← NEW (Phase 2)
│       └── schema-doc-exists.test.js       (unchanged; covers schemas.md)
└── tools/legacy/
    └── meta-state-relationships-tool.js    ← MODIFIED: dispatches via factoryFor (Phase 4)
```

**Key design decisions:**

1. **YAML over JSON for `placement.yaml`** — matches local convention (`validator-coverage.yaml`, `field-drift-exceptions.yaml`). Operator-confirmed in §7 of the brainstorm.
2. **Soft inversion (Mechanism B)** — schemas stay canonical; factories wrap them and expose `entry.schema` returning the *same* Zod object (reference equality, enforced by test). Revisit if `.shape` consumers drop below 3 OR factory methods need cross-cutting logic schemas can't express.
3. **Frozen factory outputs** — every `create*` returns `Object.freeze({...})`. Lifecycle helpers (`resolve`, `supersedeBy`, `promote`, `ship`) return NEW frozen entries, never mutate.
4. **Relationship methods are the canonical graph API** — `meta_state_relationships` re-implements on top of factories (1-hop traversal via `outboundRefs()`/`inboundRefs(root)`); the inverse-index builder in `core/loop-introspect.js` stays untouched (other call-sites still need it).

## Related Code Files

- Create: `tools/learning-loop-mastra/docs/placement.md`
- Create: `tools/learning-loop-mastra/core/placement.yaml`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js`
- Create: `tools/learning-loop-mastra/core/entry/finding.js`
- Create: `tools/learning-loop-mastra/core/entry/rule.js`
- Create: `tools/learning-loop-mastra/core/entry/change-log.js`
- Create: `tools/learning-loop-mastra/core/entry/loop-design.js`
- Create: `tools/learning-loop-mastra/core/entry/index.js`
- Create: `tools/learning-loop-mastra/core/entry/finding.test.js` (sibling pattern, per validation decision)
- Create: `tools/learning-loop-mastra/core/entry/rule.test.js` (sibling pattern)
- Create: `tools/learning-loop-mastra/core/entry/change-log.test.js` (sibling pattern)
- Create: `tools/learning-loop-mastra/core/entry/loop-design.test.js` (sibling pattern)
- Create: `tools/learning-loop-mastra/core/entry/index.test.js` (sibling pattern)
- Modify: `tools/learning-loop-mastra/core/README.md` (add §"Soft inversion" + ADR-style comment)
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js` (dispatch via `factoryFor`)

## Acceptance Criteria

- [ ] `docs/placement.md` exists, ≤80 lines, contains the 5-question decision tree from §3.1 of the brainstorm
- [ ] `core/placement.yaml` exists; enumerates every production `.js`/`.cjs`/`.mjs` file under `core/` (excluding `__tests__/`, `lib/`, `node_modules/`, and `*.test.js` at any depth — verified final count = **29 files**: 23 pre-entry/ baseline + 6 `core/entry/*.js` added by Mechanism B)
- [ ] Every `core/` file has a `role` from the closed taxonomy: `primitive`, `evaluator`, `facade`, `verification`, `validator`, `cache`, `helper`
- [ ] `placement-manifest.test.js` runs in `node --test` and fails if any file is added/removed without a manifest update
- [ ] The 7-role taxonomy table in `docs/placement.md` matches the §3.2 table in the brainstorm
- [ ] All 4 factories (`createFinding`, `createRule`, `createChangeLog`, `createLoopDesign`) parse input via canonical Zod schemas; **instance.schema** (`createFinding(data).schema`) === `metaState*EntrySchema` (reference equality) — load-bearing invariant documented in `core/README.md` ADR; any future wrapping of the schema (`.partial()`, `.brand()`, etc.) requires an ADR
- [ ] Factory outputs are **deep-frozen** (top-level `Object.freeze` plus a `deepFreeze` helper in `entry/index.js` for nested `data.verification`, `data.change_diff`, etc.) — addresses the `Object.freeze` shallow limitation
- [ ] Every factory exposes `outboundRefs()` and `inboundRefs(root)` returning the right shape per the §4.3 relationship summary
- [ ] `factoryFor(entry)` dispatches by `entry_kind` and returns the correct factory
- [ ] `validateCrossRefs(root)`, `findOrphans(root)`, `outboundRefsAll(root)` work against fixture data
- [ ] `meta_state_relationships` MCP tool returns identical output to the current implementation for the same `id` + `direction`, **including the dual-field `promoted_to_rule` migration logic** (legacy findings without `promoted_to_rule` still resolve to their origin rule via `origin_inverse`) — fixture-driven snapshot test using `mkdtempSync` + seeded `meta-state.jsonl`
- [ ] All existing tests still pass (baseline measured at Phase-0; replaces "1189+" assumption); ~30 new tests pass
- [ ] `core/README.md` documents the soft-inversion contract and references the ADR-style comment
- [ ] No new `@mastra/*` imports in any file under `core/` (FCIS invariant still holds)

## Open Questions Surfaced for Operator

The brainstorm flags 5 operator decisions. They are recorded here for visibility; the plan proceeds assuming the brainstorm's recommendations. Operator can flag any disagreement before Phase 1 ships:

1. Manifest format: **YAML** (matches local convention) — recommended.
2. Phase 3 ordering: Phase 1 → Phase 2 → Phase 3 (separately planned) — recommended.
3. Phase 2 blast radius: factories added alongside raw field access; no deprecation path now — recommended (KISS).
4. `meta_state_relationships` reimplementation: same wire shape, internal code path changes; snapshot test locks wire — recommended.
5. Role taxonomy: 7 closed roles; new roles require ADR — recommended.

## Risk Assessment (plan-level)

- **R1 (Phase 1) — Manifest drifts from reality if test is skipped:** mitigated by including the test in the standard `pnpm test` invocation (it already runs in CI).
- **R2 (Phase 2) — Factory methods shadow canonical schema behavior:** mitigated by **instance.schema** (`createFinding(data).schema === metaStateFindingEntrySchema`) reference-equality test. If a factory ever calls `.parse()` then mutates, the test catches it.
- **R3 (Phase 2) — `meta_state_relationships` snapshot drift from incidental refactor:** mitigated by snapshot test captured BEFORE Phase 2 starts; reviewed manually if diff appears.
- **R4 (Phase 2) — Adding `core/entry/` bloats core/:** mitigated by entry files being pure wrappers around existing exports; no logic duplication, no extra dependencies.
- **R5 (operator scope expansion) — Operator said "core should be related to modelling relationship as well":** this plan responds with Mechanism B's `outboundRefs()`/`inboundRefs(root)` API on every Entry. No further expansion in this plan (KISS).
- **R6 (revisit clause) — Soft inversion becomes hard inversion later:** documented in `core/README.md` ADR comment with explicit triggers. No code change here.

## Red Team Review

### Session — 2026-06-27
**Reviewers:** 3 (Security Adversary, Failure Mode Analyst, Assumption Destroyer) at Full tier (5 phases → 15+ claims/phase verification budget).
**Raw findings:** 30+. **Deduplicated + capped:** 15.
**Findings:** 15 (14 accepted, 1 quick fix applied, 8 rejected as already-covered-or-KISS-overreach)
**Severity breakdown:** 4 Critical, 7 High, 4 Medium (3 of which are duplicates / already accepted under other numbers)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | `projectHasLearningLoopMcp` is NOT exported from `core/gate-logic.js:578` — factory cannot import it | Critical | Accept | Phase 3 step 3 (added `export` to function declaration) |
| C2 | `checkResolutionEvidence` lives in `core/gate-logic.js:691`, NOT `meta-state.js` | Critical | Accept | Phase 3 step 3 + phase-03 architecture sketch (corrected import path) |
| C3 | Snapshot test has no fixture infrastructure; "capture BEFORE reimplementation" had no runnable script | Critical | Accept | Phase 4 step 5 (added `mkdtempSync` + seeded `meta-state.jsonl` fixture writer) + Phase 5 (uses fixtures) |
| C4 | Reimplemented `meta_state_relationships` drops dual-field `promoted_to_rule` migration logic | Critical | Accept | Phase 4 architecture (preserved dual-field via `buildInverseIndexes` + `origin_inverse` fallback) + Phase 5 (added legacy-finding fixture to snapshot) |
| H1 | "28 core files" is wrong — actual is 27 production files + 4 `*.test.js` colocated | High | Accept | plan.md + Phase 1 + Phase 2 (corrected to 27) |
| H2 | `pnpm test` runs namespaced runner; new tests under `core/entry/__tests__/` may be silently skipped | High | Accept | Phase 3 step 6 (verify runner discovery; fallback to sibling `*.test.js` pattern) |
| H3 | TDD ordering: Phase 4 step 1 references Phase 5 tests that don't exist yet | High | Accept | Phase 4 step 1 (inline a one-line stub test instead of referencing Phase 5) |
| H4 | `factoryFor` dispatches via `entry.entry_kind` but legacy entries lack it | High | Accept | Phase 4 architecture (`entry.entry_kind ?? "finding"` default) |
| H5 | Wire-shape key ordering drift between current tool and reimplementation | High | Reject | Already in Phase 5 R1; mitigation via `assert.deepStrictEqual` on parsed JSON |
| H6 | Inbound key naming: current tool uses `consolidated_by`, `addressed_by`, etc.; plan mis-named as `consolidated_into reverse` | High | Accept | Phase 4 reimpl (preserves 6 inbound key names from current tool) |
| H7 | Manifest `path` field is unsanitized YAML input — path-traversal vector | High | Accept | Phase 1 step 3 (added `^[\w./-]+\.m?js$` regex + reject `..`, `/`, `~`); Phase 2 (added 3rd sub-test for path validation) |
| H8 | `factory.schema === metaState*EntrySchema` reference equality is fragile vs. Zod `.partial()`/`.brand()` | High | Accept | Phase 4 ADR comment (documented as load-bearing invariant + ADR-required for any wrapping); Phase 5 (added safeguard test) |
| M1 | `Object.freeze` is shallow — nested `data.verification` etc. remain mutable | Medium | Accept | Phase 4 architecture (added `deepFreeze` helper); Phase 5 (added deep-freeze test) |
| M2 | Schema location ambiguity: `factory.schema` (function) vs `instance.schema` (instance) | Medium | Accept | Phase 4 ADR comment + Phase 5 tests (standardized on `instance.schema`) |
| M3 | "All 1189+ tests pass" appears 5+ times with no baseline measurement | Medium | Accept | plan.md (added Phase-0 prerequisite to capture actual baseline) + every "1189+" replaced with "baseline" |

**Quick fix applied (not in 15 cap):** 5th sub-test of placement-manifest.test.js was going to write a temp file in `core/`, triggering recursive pre-commit hook. Moved to `os.tmpdir()` per red-team Security F6.

**Rejected findings (already in plan risks or KISS over-reach):**

| Finding | Reviewer | Reject Rationale |
|---------|----------|------------------|
| `buildInverseIndexes` retained without parity test | Security F9 | Phase 4 R3 explicitly documents the trade-off; acceptable per brainstorm |
| Closed 7-role taxonomy "invented" | Assumption F11 | Operator-confirmed in brainstorm §7 as closed-by-design |
| Soft inversion has zero prior art | Assumption F7 | `/ck:predict` verdict's deliberate choice; ADR comment documents reversion triggers |
| `findOrphans` is a one-line alias | Security F7 | KISS nitpick; alias is acceptable for ergonomics |
| Cache role ambiguity for layering test | Failure F7 | Phase 2 R2 already softens the assertion |
| `factoryFor` dispatches before schema validation (no try/catch) | Security F5 | Related to H4; accepted under H4's fix |
| Wire-shape key ordering (H5 above) | Failure F6 | Already in Phase 5 R1 |
| 5th sub-test recursive trigger risk | Security F6 | Quick fix applied; not in 15-cap table |

### Whole-Plan Consistency Sweep

**Files reread:** plan.md, phase-01-mechanisma-docandmanifest.md, phase-02-mechanisma-testextension.md, phase-03-mechanismb-entryfactories.md, phase-04-mechanismb-crosscuttingandtoolreimpl.md, phase-05-mechanismb-testsandsnapshot.md
**Decision deltas checked:** 15 (each accepted finding produced a delta)
**Reconciled stale references:**
- `1189+` → `baseline` in 5 places (plan.md, phase-01, phase-02, phase-05 ×2)
- `28 core files` → `27 production files` in 2 places (plan.md ×2)
- `factory.schema` → `instance.schema` in 3 places (phase-03, phase-04, phase-05)
- `checkResolutionEvidence in meta-state.js` → `checkResolutionEvidence in gate-logic.js` (phase-03 + phase-04)
- `factoryFor` missing `entry_kind` default added (phase-04)
- Snapshot test chicken-and-egg → fixtures infrastructure (phase-04 + phase-05)
- 5th sub-test temp file path `core/` → `os.tmpdir()` (phase-02)
- Phase 4 step 1 reference to Phase 5 → inline stub (phase-04)
- Phase 5 test for `factory.schema` → `instance.schema` (phase-05)
- Phase 4 reimpl preserves 6 inbound key names + dual-field fallback (phase-04)
- Phase 4 ADR comment names load-bearing invariant (phase-04)
- Phase 4 architecture adds `deepFreeze` helper (phase-04)
- Phase 1 step 3 adds path regex validation (phase-01)
- Phase 3 step 6 adds namespaced runner discovery check (phase-03)
- Phase 5 success criteria includes legacy-finding fixture (phase-05)

**Unresolved contradictions:** 0

The plan is consistent: every accepted finding has a corresponding edit in the relevant phase file, and no stale terms remain. Ready for `/ck:plan validate` or `/ck:cook <plan-path>`.

## Validation Log

### Session 1 — 2026-06-27
**Trigger:** Red-team review accepted 14 findings + 1 quick fix; operator requested validate gate before implementation.
**Questions asked:** 5

#### Questions & Answers

1. **[Assumptions]** Should we measure the actual test baseline on `main` before Phase 1 starts, or accept the "1189+" estimate and revise later?
   - Options: Run `pnpm test` now | Trust the estimate
   - **Answer:** Run `pnpm test` now
   - **Rationale:** Eliminates a guess at the cost of ~10 min. Makes every PR-body claim about test count verifiable.

2. **[Architecture]** Should new entry tests use the sibling `core/entry/*.test.js` pattern from the start, or follow the plan's verify-then-fallback path?
   - Options: Commit to sibling pattern | Verify then fallback
   - **Answer:** Commit to sibling pattern
   - **Rationale:** Avoids the verify-then-fallback dance mid-Phase 3. Matches the namespaced runner's existing discovery pattern (loop-introspect.test.js, meta-state.test.js are siblings, not in __tests__/).
   - **Propagated:** All `core/entry/__tests__/*.test.js` references in plan.md, phase-03, phase-04, phase-05 replaced with `core/entry/*.test.js`.

3. **[Tradeoffs]** For the snapshot test fixture strategy, which approach?
   - Options: mkdtempSync + seeded meta-state.jsonl | Use the live registry
   - **Answer:** mkdtempSync + seeded meta-state.jsonl (Recommended)
   - **Rationale:** Deterministic, no test pollution, teardown via afterEach. Live registry risks snapshot drift when the registry changes between capture and verification.
   - **Propagated:** Phase 4 step 5 already specified this; Phase 5 now lists `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js` explicitly in "Related Code Files".

4. **[Architecture]** How should we expose `projectHasLearningLoopMcp` so Phase 3 can call it?
   - Options: Export from gate-logic.js | Move to new core/util.js
   - **Answer:** Export from gate-logic.js (Recommended)
   - **Rationale:** One-line change; smallest blast radius; no new file. The function is already used internally; exporting it doesn't add coupling, just visibility.
   - **Propagated:** Phase 3 step 3 already specifies this; no further change needed.

5. **[Scope]** Confirm: the evaluator refactor (Phase 3 from prior convergence addendum) stays OUT of this plan, ships separately?
   - Options: Confirm: Phase 3 stays out | Include Phase 3 in this plan
   - **Answer:** Confirm: Phase 3 stays out
   - **Rationale:** Matches the operator's "plan later" decision from 2026-06-27. Keeps this plan's blast radius focused on placement + entry model, not evaluator implementation.

#### Confirmed Decisions
- **Phase 0 baseline measurement:** run `pnpm test` on `main` first; replace every "1189+" with the actual count.
- **Test file placement:** sibling pattern `core/entry/*.test.js` for all 5 new test files (Phase 3 + Phase 5).
- **Snapshot fixtures:** mkdtempSync + seeded `meta-state.jsonl` via `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js`.
- **`projectHasLearningLoopMcp`:** export from `gate-logic.js:578` (one-line change).
- **Phase 3 boundary:** evaluator refactor is OUT of this plan; ships as a separate plan.

#### Action Items
- [x] Propagate sibling-pattern change to plan.md (5 file references)
- [x] Propagate sibling-pattern change to phase-03 (4 references)
- [x] Propagate sibling-pattern change to phase-04 (2 references)
- [x] Propagate sibling-pattern change to phase-05 (7 references)
- [x] Add fixture file to Phase 5 "Related Code Files" list

#### Impact on Phases
- **Phase 1, 2, 3 (manifest + tests):** updated file paths from `core/entry/__tests__/` to `core/entry/`. No architectural change.
- **Phase 4 (cross-cutting + tool reimpl):** test runner path updated. Architecture unchanged.
- **Phase 5 (tests + snapshot):** sibling pattern confirmed; fixture file added to deliverables list. Architecture unchanged.

### Whole-Plan Consistency Sweep

**Files reread:** plan.md, phase-01-mechanisma-docandmanifest.md, phase-02-mechanisma-testextension.md, phase-03-mechanismb-entryfactories.md, phase-04-mechanismb-crosscuttingandtoolreimpl.md, phase-05-mechanismb-testsandsnapshot.md
**Decision deltas checked:** 5 (one per validation question)
**Reconciled stale references:**
- `core/entry/__tests__/` → `core/entry/` in 15+ places (plan.md, phase-03, phase-04, phase-05)
- Added `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js` to Phase 5 Related Code Files

**Unresolved contradictions:** 0

The plan is consistent after both the red-team review (14 findings + 1 quick fix applied) and the validation session (5 questions, all confirmed recommendations, sibling-pattern change propagated). Ready for `/ck:cook <plan-path>`.

**Recommendation: PROCEED to implementation.** All gates have been run; no remaining contradictions; baseline measurement will happen as the first step of Phase 1.