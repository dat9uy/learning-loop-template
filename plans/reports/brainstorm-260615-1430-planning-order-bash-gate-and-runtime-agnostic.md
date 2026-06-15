---
title: "Planning Order: Bash Gate Debate (Report 1) + Runtime-Agnostic Rule (Report 2)"
description: "Single-source-of-truth markdown for the cross-report planning-order decision. Report 2 ships first as foundation (Phase 0-1: surfaces.js helper + 2 existing-call-site refactors); Report 1 ships on top (Plan 1: visibility + override + recurrence; Plan 2: node -e strip is independent). Report 2 Phases 2-5 close the loop last. Three problem-solving techniques justify the order: Inversion Exercise (Report 1 first creates retrofit debt), Simplification Cascade (the helper is the one insight that eliminates 5+ special cases), Meta-Pattern Recognition (debatable + self-improving → loop's self-model first). 4 /ck/plan invocations listed with dependencies."
date: "2026-06-15T14:30:00Z"
tags: [meta, planning, sequencing, dependency-analysis, bash-gate, runtime-agnostic, simplification-cascade, inversion-exercise, meta-pattern, problem-solving]
status: complete
session: 260615-planning-order
supersedes: null
superseded_by: null
related:
  - plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md (Report 1 — bash gate debate infrastructure + node -e strip; 2 plans)
  - plans/reports/brainstorm-260615-1400-runtime-agnostic-features-rule.md (Report 2 — runtime-agnostic features rule; 1 design with 6 phases)
  - meta-state.jsonl entry meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n (the finding filed for Report 2; resolution criteria reference this report's execution plan)
  - tools/learning-loop-mcp/core/surfaces.js (the helper, target of Report 2 Phase 0; the simplification that justifies the order)
  - tools/learning-loop-mcp/core/gate-logic.js#GLOB_SCOPE_WHITELIST (refactor target; Report 2 Phase 1)
  - tools/learning-loop-mcp/core/inbound-state.js#readLastOperatorMessage (refactor target; Report 2 Phase 1)
  - tools/learning-loop-mcp/hooks/bash-gate.js (Report 1 Plan 1 target; uses the helper from step 1)
related_findings:
  - meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n (filed during the Report 2 work; resolution criteria #7 and #8 reference the refactors shipped in step 1 of this report)
related_reports:
  - brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md (Report 1)
  - brainstorm-260615-1400-runtime-agnostic-features-rule.md (Report 2)
---

# Planning Order: Bash Gate Debate (Report 1) + Runtime-Agnostic Rule (Report 2)

## TL;DR

The two prior brainstorm reports are sequenced in **4 /ck/plan invocations** (one per independent shippable unit), in this order:

| Step | Source | Phases | Why this position |
|---|---|---|---|
| **1** | Report 2 | Phase 0-1 (helper + 2 refactors) | ✅ shipped 2026-06-15 — Foundation; unblocks Report 1's cross-surface code |
| **2** | Report 1 | Plan 1 (stderr + override + log + recurrence) | ✅ shipped 2026-06-15 — `meta-260615T1459Z-bash-gate-debate-step-2-shipping` — Builds on the helper; ships the user-pain fix |
| **3** | Report 1 | Plan 2 (node -e strip) | ✅ shipped 2026-06-15 — `meta-260615T1921Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody` — Narrow first-pass fix; ships alongside Step 2's catch-net (`gate_check_recurrence`) |
| **4** | Report 2 | Phase 2-5 (test + pattern type + tool + rule entry) | ✅ shipped 2026-06-15 — `meta-260615T2236Z-tools-learning-loop-mcp-agent-manifest-json-agents-md-meta-s` — Closes the rule; new MCP tools from step 2 are rule-compliant by design |

The decision is justified by **three problem-solving techniques** from `ck:problem-solving`:

1. **Inversion Exercise** — flipping "Report 1 first" surfaces retrofit debt (Report 1's marker-writing code would inline-handle surface paths, then get refactored when the helper ships).
2. **Simplification Cascade** — the `core/surfaces.js` helper is the one insight that eliminates 5+ special cases (override marker, decision log, recurrence tracker, GLOB_SCOPE_WHITELIST, readLastOperatorMessage, plus all future features).
3. **Meta-Pattern Recognition** — both reports are two facets of one design ("debatable + self-improving" → loop's self-model first, loop's behavior second). This is the meta-surface-first philosophy from AGENTS.md §1.

**This report is the single source of truth** for the planning-order decision. The two prior reports are scoped to their own designs; this report captures the cross-report dependency analysis + the execution sequence.

## The Decision (concrete)

The execution order is **1 → 2 → 3 → 4** as defined in the TL;DR table. The step numbers are execution order, not priority. Each step is independently shippable; the dependency chain is **1 → 2**, **1 → 4**, and **3 is unconstrained**.

**`/ck/plan` invocation order** (planning is cheap; this is the same as execution order):

```
# Step 1: Foundation (Report 2 Phase 0-1)
/ck:plan --phases "surfaces.js,refactor-GLOB_SCOPE_WHITELIST,refactor-readLastOperatorMessage" \
  --evidence "plans/reports/brainstorm-260615-1400-runtime-agnostic-features-rule.md#phase-0-1"

# Step 2: User-pain fix (Report 1 Plan 1)
/ck:plan --phases "stderr-visibility,override-marker,decision-log,recurrence-tracker" \
  --evidence "plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md#plan-1"

# Step 3: Independent narrow fix (Report 1 Plan 2)
/ck:plan --phases "stripNodeEvalBody,regression-tests" \
  --evidence "plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md#plan-2"

# Step 4: Close the rule (Report 2 Phase 2-5)
/ck:plan --phases "regression-test,pattern-type-consult-checklist,check-runtime-agnostic-tool,rule-entry-AGENTS.md-hint" \
  --evidence "plans/reports/brainstorm-260615-1400-runtime-agnostic-features-rule.md#phase-2-5"
```

(The exact `/ck/plan` flags depend on the plan-mode contract; this is a sketch, not a literal invocation.)

## Why this order (problem-solving techniques applied)

### Technique 1: Inversion Exercise — "what if Report 1 first?"

The most useful question for sequencing is "what if we did it the other way?" Here, the inversion reveals hidden constraints.

**Inverted order: Report 1 first (Plan 1 only — the gate debate infrastructure).**

The bash gate's `Plan 1` introduces:
- A `.gate-override` marker file in both `.claude/coordination/` and `.factory/coordination/`.
- A `.gate-decision.log` in both surface directories.
- New `gate_override` + `gate_check_recurrence` MCP tools that read from both surfaces.

If `core/surfaces.js` doesn't exist yet, this code has to inline-handle the surface iteration. The existing pattern (from `core/inbound-state.js#readLastOperatorMessage`) is hard-coded paths:

```js
// Current pattern (pre-surfaces.js)
const claudeMarker = join(root, ".claude", "coordination", ".last-operator-message");
const factoryMarker = join(root, ".factory", "coordination", ".last-operator-message");
```

Report 1's new code would replicate this pattern in 3-4 new places (override marker write, decision log write, override marker read, decision log read). When Report 2 ships the helper, Report 1's code either:

- **Option A**: Gets refactored to use the helper → throwaway code; wasted work.
- **Option B**: Keeps the inline paths → inconsistent with the new rule; the rule says "use the helper"; Report 1 violates its own rule.
- **Option C**: Ships without the helper at all → the helper never ships because Report 1 already established the inline pattern.

**The inversion reveals**: Report 1 has a hidden dependency on `core/surfaces.js`. Shipping Report 1 first is the "inversion that's wrong"; the right order is helper-first.

**The valid inversion** (what's actually true in both orders): the helper is a foundational abstraction that simplifies 5+ call sites. Foundations ship first.

### Technique 2: Simplification Cascade — the one insight

The skill says: "Find one insight eliminating multiple components. 'If this is true, we don't need X, Y, Z.'"

The one insight: **`SURFACES` is the single point of truth for what runtimes the loop supports.**

Once that constant exists in `core/surfaces.js`, the following patterns collapse:

| Pattern | Pre-helper | Post-helper |
|---|---|---|
| Override marker write (Report 1) | Two explicit `writeFileSync` calls to `.claude/` and `.factory/` | `writeToAllSurfaces(root, ".gate-override", content)` |
| Decision log write (Report 1) | Two explicit `appendFileSync` calls | `writeToAllSurfaces(root, ".gate-decision.log", line)` |
| Recurrence tracker read (Report 1) | Two explicit `readFileSync` calls + merge logic | `readFromAllSurfaces(root, ".gate-decision.log")` |
| `GLOB_SCOPE_WHITELIST` (Report 2 refactor) | Hard-coded `[..., ".factory/", ...]` (missing `.claude/`) | `[..., ...SURFACES.map(s => s + "/")]` |
| `readLastOperatorMessage` (Report 2 refactor) | Two explicit `readFileSync` calls + fall-through logic | `readFromAllSurfaces(root, ".last-operator-message", { first: true })` |
| Future features (the rule) | Each feature hand-rolls the cross-surface iteration | All features use the helper |

The cascade eliminates: 5+ inline cross-surface code paths, the `.claude/` asymmetry in `GLOB_SCOPE_WHITELIST`, and the duplication in `readLastOperatorMessage`. **The helper is the simplification that justifies shipping it first.**

### Technique 3: Meta-Pattern Recognition — debatable + self-improving

The skill says: "Spot patterns appearing in 3+ domains to find universal principles."

The two reports look different on the surface (one is about a gate, one is about a rule). The meta-pattern is identical:

- **Report 1** = "let the agent debate the gate" — the gate's decisions become visible (stderr), overridable (`gate_override`), and the gate's mistakes get captured by the loop's self-model (recurrence tracker → meta-state findings).
- **Report 2** = "let the loop enforce its own invariant" — the runtime-agnostic principle becomes a rule (meta-state entry), discoverable (`loop_describe`), auditable (`check_runtime_agnostic`), and testable (`__tests__/runtime-agnostic.test.js`).

**The meta-pattern**: both reports are "let the loop see + learn from its own behavior." This is the self-referential loop pattern. The shared principle is **meta-surface first**: the loop's self-model (Report 2's rule + helper) defines what the loop's behavior (Report 1's gate debate) should comply with.

This maps to AGENTS.md §1's "The meta-surface is the only bound surface" — the rule (Report 2) is the loop's codification of "runtime-agnostic is a rule"; the gate (Report 1) is the runtime application of the principle. Foundation before behavior.

## Cross-Report Dependency Matrix

| Artifact | Depends on | Needed by | Notes |
|---|---|---|---|
| `core/surfaces.js` (R2 P0) | — | R2 P1, R2 P2, R2 P4; R1 P1 (override marker, decision log); all future features | Foundation. Ship first. |
| `GLOB_SCOPE_WHITELIST` refactor (R2 P1) | R2 P0 | — | Closes the `.claude/` asymmetry. |
| `readLastOperatorMessage` refactor (R2 P1) | R2 P0 | — | DRY the cross-surface iteration. |
| `__tests__/runtime-agnostic.test.js` (R2 P2) | R2 P0 | — | Regression guard. |
| `consult-checklist` pattern type (R2 P3) | — | R2 P4, R2 P5 | New gate pattern type; no-op for command-time. |
| `check_runtime_agnostic` MCP tool (R2 P4) | R2 P0, R2 P3 | R2 P5 | Audit surface. |
| `rule-runtime-agnostic-features` entry (R2 P5) | R3, R4 | — | Codified invariant. |
| AGENTS.md §2 amendment (R2 P5) | R2 P5 | — | Design spec. |
| `loop_describe` hint (R2 P5) | R2 P5 | — | Discoverability surface. |
| stderr visibility (R1 P1 component 1.1) | — | — | Smallest piece; ships first in R1 P1. |
| `.gate-override` marker (R1 P1 component 1.2) | R2 P0 (for clean impl) | R1 P1 component 1.4 | Uses `writeToAllSurfaces`. |
| `gate_override` MCP tool (R1 P1) | R2 P0, R2 P5 (for manifest compliance) | — | New tool; rule-compliant by design. |
| `.gate-decision.log` (R1 P1 component 1.3) | R2 P0 (for clean impl) | R1 P1 component 1.4 | Uses `writeToAllSurfaces`. |
| `gate_check_recurrence` MCP tool (R1 P1) | R2 P0, R2 P5 (for manifest compliance) | — | New tool; rule-compliant by design. |
| `stripNodeEvalBody` (R1 P2) | — | — | Fully independent. |

**Summary**: 4 cross-report dependencies. All 4 are unblocked by step 1 (the helper). Step 2 (R1 P1) can ship cleanly after step 1. Step 3 (R1 P2) has no dependencies. Step 4 (R2 P2-5) needs step 1 (helper) + step 2's new MCP tools (so they're designed rule-compliant).

## What does NOT depend

- **Report 1 Plan 2** (the `node -e` strip) is fully independent. It touches `core/gate-logic.js#applyPromotedRules` + adds 4 regression tests in `__tests__/gate-logic-quoted-strings.test.js`. No cross-surface iteration. No new MCP tools. It can ship in parallel with any other step.
- **Report 1 Plan 1's stderr visibility component** (1.1) doesn't depend on the helper. It's a `console.log` → `process.stderr.write` change in `bash-gate.js`. Could ship as a standalone micro-PR.
- **Report 2 Phase 3** (the new `consult-checklist` pattern type) doesn't depend on the helper. It's a 5-line addition to `core/gate-logic.js#applyPromotedRules`. Could ship independently.

These independence opportunities mean: if the operator wants to ship user value fast, steps 2-3 can ship alongside step 1 (with the helper ship in step 1's PR). The execution order is "step 1 must precede 2 and 4" — beyond that, the order is flexible.

**Retrospective note:** Step 3 (Report 1 Plan 2) shipped 2026-06-15 as a fully independent shippable; it is the only step in the sequence with no upstream dependency on Step 1's helper.

## Tracking the process

This markdown is the **single source of truth** for the planning-order decision. Updates to the order should land here, with a brief rationale for any change.

**How to use this report**:
- When the operator asks "which /ck/plan do I run first?", point at the TL;DR table.
- When a step is completed, the operator can annotate this report with a checkmark + the change-log id (no separate tracking artifact).
- When the order needs to change, the operator updates this report; the change is visible to all future readers.

**What is NOT tracked here**:
- The detailed designs of Report 1 and Report 2 — they live in their own reports.
- The meta-state entries (the finding for Report 2; future rule entry for `rule-runtime-agnostic-features`) — they live in `meta-state.jsonl`.
- The actual code changes — they live in the commits + change-logs.

**What IS tracked here**:
- The 4-step execution order.
- The cross-report dependency matrix.
- The problem-solving techniques that justify the order (so a future reader can re-derive the decision, not just trust it).
- The "what does NOT depend" callouts (so a future reader can re-balance the order if priorities change).
- The cleanup backlog (minor findings from each shipped step, processed in one session after all 4 steps ship).

## Shipped status

| Step | Source | Status | Change-log | Shipped at |
|------|--------|--------|------------|------------|
| 1 | Report 2 P0-1 | ✅ shipped | — (routine refactor; no change-log filed) | 2026-06-15 |
| 2 | Report 1 P1 | ✅ shipped | `meta-260615T1459Z-bash-gate-debate-step-2-shipping` | 2026-06-15 |
| 3 | Report 1 P2 | ✅ shipped | `meta-260615T1921Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody` | 2026-06-15 |
| 4 | Report 2 P2-5 | ✅ shipped | `meta-260615T2236Z-tools-learning-loop-mcp-agent-manifest-json-agents-md-meta-s` | 2026-06-15 |

Updated: 2026-06-15 — Step 1 ships the `core/surfaces.js` helper + `GLOB_SCOPE_WHITELIST` refactor + `readLastOperatorMessage` refactor per `plans/260615-1500-surfaces-helper-and-refactors/`. Step 2 ships the decision visibility + override + decision log + recurrence tracker per `plans/260615-1530-bash-gate-debate-stderr-override-recurrence/`. Step 3 ships the conservative `node -e` body strip + 6 new tests per `plans/260615-1600-step3-bash-gate-node-e-strip/`. Step 4 ships the helper extensions (`appendToAllSurfaces`, `readJsonlFromAllSurfaces`, `readModifyWriteOnAllSurfaces`), the 3 Step 2 refactors, the runtime-agnostic regression test + `consult-checklist` pattern type + `check_runtime_agnostic` MCP tool + the `rule-runtime-agnostic-features` rule entry + AGENTS.md amendment + `loop_describe` hint per `plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/`. **Planning-order sequence is closed** (all 4 steps shipped).

## Cleanup backlog

✅ **All 15 items cleared 2026-06-16** by `plans/260616-0038-batch-cleanup-after-planning-order/`. See the table below for the per-item disposition. The cleanup batch is closed.

<details>
<summary>Per-item disposition</summary>

### Step 1 (shipped 2026-06-15) cleanup items

| # | Item | File / line | Disposition |
|---|------|-------------|-------------|
| 1.1 | Stale `// fallow-ignore-next-line complexity` comment on `readLastOperatorMessage` | `tools/learning-loop-mcp/core/inbound-state.js:41` | ✅ cleared 2026-06-16 (CLEANUP Phase 3) — comment removed |
| 1.2 | No file-level JSDoc for `core/surfaces.js` | `tools/learning-loop-mcp/core/surfaces.js:1` | ✅ cleared 2026-06-16 (CLEANUP Phase 1) — 5-7 line header added |
| 1.3 | Plan's "Unresolved questions" not annotated as resolved | `plans/260615-1500-surfaces-helper-and-refactors/phase-01-surfaces-helper.md` | ✅ cleared 2026-06-16 (CLEANUP Phase 2) — `## Resolution Log` added |
| 1.4 | "Mutation test" doesn't exercise parameterization | `tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js:36-47` | ✅ cleared 2026-06-16 (CLEANUP Phase 5) — source assertion that `GLOB_SCOPE_WHITELIST` derives from `SURFACES.map` |
| 1.5 | `writeToAllSurfaces` "best-effort" test doesn't exercise failure | `tools/learning-loop-mcp/__tests__/surfaces.test.js:78-88` | ✅ cleared 2026-06-16 (CLEANUP Phase 5) — Unix-only `chmodSync(0o000)` + try/finally |

### Step 2 (shipped 2026-06-15) cleanup items

| # | Item | File / line | Disposition |
|---|------|-------------|-------------|
| 2.1 | `gate-override.js` hand-rolls cross-surface loops | `tools/learning-loop-mcp/core/gate-override.js:47-138` | ✅ resolved by Step 4 Phases 1-3 (2026-06-15) |
| 2.2 | `gate-decision-log.js` append semantics | `tools/learning-loop-mcp/core/gate-decision-log.js:37-46` | ✅ resolved by Step 4 Phase 1 (2026-06-15) |
| 2.3 | `recurrence-tracker.js#generateFindingId` uses `Math.random()` | `tools/learning-loop-mcp/core/recurrence-tracker.js:70-73` | ✅ cleared 2026-06-16 (CLEANUP Phase 4) — `crypto.randomBytes(4).toString("hex")` |
| 2.4 | `recurrence-check-on-start.js` stdin read has no comment | `tools/learning-loop-mcp/hooks/recurrence-check-on-start.js:15` | ✅ cleared 2026-06-16 (CLEANUP Phase 3) — "Intentionally ignored" comment added |
| 2.5 | `gate-check-recurrence-tool.js` explicit `undefined` keys | `tools/learning-loop-mcp/tools/gate-check-recurrence-tool.js:14-17` | ✅ cleared 2026-06-16 (CLEANUP Phase 3) — options built conditionally |

### Step 4 (shipped 2026-06-15) cleanup items

| # | Item | File / line | Disposition |
|---|------|-------------|-------------|
| 4.1 | CHECKLIST descriptions don't name canonical helpers | `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:10-40` | ✅ cleared 2026-06-16 (CLEANUP Phase 2) — descriptions name helpers |
| 4.2 | Shim-mirror predicate only checks existence | `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js:55-75` | ✅ cleared 2026-06-16 (CLEANUP Phase 5) — SHA-256 hash comparison |
| 4.3 | `readModifyWriteOnAllSurfaces` cross-surface atomicity not prominent | `tools/learning-loop-mcp/core/surfaces.js:180-220` | ✅ cleared 2026-06-16 (CLEANUP Phase 1) — `WARNING` JSDoc block added |
| 4.4 | Stale line-number ranges in Step 4 phase files | `plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/phase-*.md` | ✅ cleared 2026-06-16 (CLEANUP Phase 2) — symbol references |
| 4.5 | Checklist regex has 9 bypasses + false positives | `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:220-221, 246-250` | ✅ cleared 2026-06-16 (CLEANUP Phase 6) — `stripCommentsAndStrings` preprocessor + JSDoc |

### Code-review / Q1 follow-up items

| # | Item | Source | Disposition |
|---|------|--------|-------------|
| F-5 | `err.message` from `appendFileSync`/`writeFileSync`/`unlinkSync` may leak full path on ENOENT | Step 4 code review | ✅ cleared 2026-06-16 (CLEANUP Phase 4) — `sanitizeErrorMessage` helper in `core/surfaces.js` |
| Q1 | `skipped_via_override` field remains aspirational | Planning-order Q1 follow-up | ✅ resolved 2026-06-16 (CLEANUP Phase 2) — removed from plan decision shape; `bash-gate.js` does not include it |

</details>

## What stays human forever

- The execution order itself. A future operator may re-prioritize based on user-facing urgency vs foundation work; the techniques in this report are inputs to that decision, not constraints.
- The dependency matrix. New artifacts may be added to either report; the matrix must be re-derived.
- The meta-pattern ("debatable + self-improving"). This is a hypothesis, not a law. If a future design violates it, the violation is itself a learning signal.

## Open questions for Step 4

Decisions deferred from Step 2's post-ship review (`plans/reports/code-reviewer-260615-1630-bash-gate-step-2-spec-deviations.md`):

1. **Helper API gaps vs the Simplification Cascade thesis (RESOLVED 2026-06-15 21:26 — Step 4 Phases 1-3)**. Step 4 extended `core/surfaces.js` with `appendToAllSurfaces`, `readJsonlFromAllSurfaces`, and `readModifyWriteOnAllSurfaces`, then refactored `gate-decision-log.js` and `gate-override.js` to use them. The Simplification Cascade thesis is now complete.

2. **`skipped_via_override` field status (RESOLVED 2026-06-16 — CLEANUP Phase 2)**.
   The field was removed from the plan's decision shape in `plans/260615-1530-.../plan.md`
   by the CLEANUP batch. The field was aspirational; the actual requirement (operator
   can override a block) is satisfied by the `.gate-override` marker + `gate_override`
   MCP tool + audit entry in `runtime-state.jsonl`. The `bash-gate.js` decision
   object does NOT include the field (verified by reading the source).

3. **Recurrence-tracker writes through MCP or direct file (RESOLVED 2026-06-15)**. Direct writes are accepted for now; a post-4-step brainstorm will reconsider MCP-mediation for `recurrence-tracker.js#checkAndEmit`.

---

**Status:** draft. This report locks the planning order as of 2026-06-15T14:30. If the operator ships step 1 first, they can append the resulting change-log id to this report for traceability. No meta-state entry is filed for this report (it's a planning artifact, not a loop-self-diagnostic finding); the report itself is the tracking surface.
