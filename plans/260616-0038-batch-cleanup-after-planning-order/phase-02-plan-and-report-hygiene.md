---
phase: 2
title: "Plan and report hygiene"
status: complete
priority: P3
effort: "20m"
dependencies: []
---

# Phase 2: Plan and report hygiene

## Overview

Four documentation-only edits: annotate Step 1's resolved open questions (1.3), add inline helper names to the runtime-agnostic CHECKLIST descriptions (4.1), replace stale line-number ranges in Step 4 phase files with symbol references (4.4), and remove or document the `skipped_via_override` field in the Step 2 plan's decision shape (Q1). No code change.

## Cleanup items addressed

- **1.3** (Step 1, doc-hygiene) — `phase-01-surfaces-helper.md` Unresolved questions not annotated as resolved.
- **4.1** (Step 4, doc-hygiene) — `runtime-agnostic-checklist.js` CHECKLIST descriptions don't name the canonical helper to use.
- **4.4** (Step 4, doc-hygiene) — Step 4 phase files cite stale line-number ranges for refactor targets.
- **Q1** (Planning-order Q1 follow-up) — `skipped_via_override` field remains aspirational in Step 2 plan's decision shape.

## Requirements

Functional: none (documentation only).
Non-functional: keep edits surgical; no prose rewrites; preserve existing structure.

## Architecture

Four independent edits, each a small prose or comment change.

<!-- Updated: Validation Session 1 — 1.3 changed from "annotate inline" to "Add Resolution Log section" (4 places total in 4.4) -->

### 2.1 — `phase-01-surfaces-helper.md` annotation (item 1.3)

The cleanup item 1.3 in the planning-order report cites `phase-01-surfaces-helper.md:59-62` as a "Unresolved questions" section, but those lines are `- Create:` bullets — the plan file has no formal `## Unresolved questions` section. The 3 questions (const vs function, atomicity, first/all match) are scattered as Requirements + Risk Assessment rows. **Per Validation Session 1**, the fix is to **add a new `## Resolution Log` section at the bottom of the file** that consolidates the 3 questions + their answers in one place:

```markdown
## Resolution Log

**Status:** All 3 design decisions from plan-prep resolved by implementation. Resolved dates: 2026-06-15 (per the planning-order report and the Step 4 code review).

- **Q1: `const` vs `getSurfaces()` function?** Resolved: `const SURFACES = Object.freeze([...])`. The `Object.freeze` ensures runtime immutability; future runtimes append one entry. Tests for callers can use `mkdirSync` + real surface dirs in `tmp` rather than monkey-patching.
- **Q2: `writeToAllSurfaces` atomicity (write-temp+rename vs best-effort)?** Resolved: atomic for marker files (write-temp + rename). Matches the inbound-state pattern. Best-effort only applies to per-surface errors (one surface failure does not abort the others).
- **Q3: First-match vs all-matches for read helpers?** Resolved: both — `readFromAllSurfaces(subpath, { first: true })` for first-match (the marker-read pattern); default returns all. Step 4 added `readJsonlFromAllSurfaces` for the JSONL use case (recurrence tracker reads from all surfaces).
```

### 2.2 — `runtime-agnostic-checklist.js` CHECKLIST descriptions (item 4.1)

Each CHECKLIST item's `description` field should name the canonical helper the agent should use to fix a failure. Current descriptions state the invariant; the fix is to add a parenthetical with the helper name:

| id | current description | updated description |
|---|---|---|
| `core-in-universal-location` | "Primary implementation lives in tools/learning-loop-mcp/{core,hooks,tools}/" | "Primary implementation lives in tools/learning-loop-mcp/{core,hooks,tools}/ (use the universal-dir convention, not a per-surface fork)." |
| `shims-in-sync` | "If hooks are added, both .claude and .factory shim directories contain the shim" | "If hooks are added, both .claude and .factory shim directories contain the shim (mirror by hand, no helper; see SHIM_DIRS)." |
| `protocol-adapter-i-o` | "Hook I/O is normalized through hooks/lib/protocol-adapter.js" | "Hook I/O is normalized through hooks/lib/protocol-adapter.js (use `parseInput` / `formatOutput` / `normalizeToolName`)." |
| `manifest-registered` | "New MCP tools are listed in tools/learning-loop-mcp/agent-manifest.json" | "New MCP tools are listed in tools/learning-loop-mcp/agent-manifest.json (add to a group; `runtime_agnostic`, `gate`, `workflow`, `meta_state`, or `introspection`)." |
| `cross-surface-iteration` | "Cross-surface iteration uses surfaces.js helpers, not hard-coded surface paths" | "Cross-surface iteration uses surfaces.js helpers, not hard-coded surface paths (use `writeToAllSurfaces`, `readFromAllSurfaces`, `appendToAllSurfaces`, `readJsonlFromAllSurfaces`, or `readModifyWriteOnAllSurfaces`)." |
| `parameterized-for-new-surfaces` | "SURFACES is the single source of truth for supported runtimes" | "SURFACES is the single source of truth for supported runtimes (import `SURFACES` from `core/surfaces.js`; do not hard-code surface names)." |

<!-- Updated: Validation Session 1 — 4.4 expanded from 3 phase files to 4 places (plan.md frontmatter + 3 phase files) -->

### 2.3 — Step 4 plan + 3 phase files (item 4.4)

Line-number citations exist in **4 places**, not 3 (per Validation Session 1 verification):

1. **`plans/260615-2126-.../plan.md` `related` frontmatter** — 4 citations at lines 51, 54, 57, 63.
2. **`plans/260615-2126-.../phase-01-appendtoallsurfaces-helper.md`** — 1 citation at line 128 (Risk Assessment table cites "lines 30-37" for `writeToAllSurfaces`).
3. **`plans/260615-2126-.../phase-05-consult-checklist-pattern-type.md`** — 2 citations at lines 32, 70 (cites "lines 749-755" and "lines 730-792" in `core/gate-logic.js`).
4. **`plans/260615-2126-.../phase-07-rule-entry-and-discoverability.md`** — 1 citation at line 130 (cites "lines 95-106" in `core/loop-introspect.js`).

Replace all with symbol references. The 4-place coverage matches the 15 items cited in the planning-order report's cleanup backlog.

```yaml
related:
  - tools/learning-loop-mcp/core/surfaces.js (the helper being extended in Phases 1-3)
  - tools/learning-loop-mcp/core/gate-decision-log.js#appendDecisionLog + #readDecisionLog (Phase 1 + 2 refactor target)
  - tools/learning-loop-mcp/core/gate-override.js#writeGateOverride + #readGateOverride (Phase 3 refactor target)
  - tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (Phase 5 target)
  - tools/learning-loop-mcp/agent-manifest.json (Phase 6 target; add `runtime_agnostic` group)
  - tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS (Phase 7 target)
  - AGENTS.md (Phase 7 target; new §2 subsection "Runtime-Agnostic Pattern")
```

(The 3 phase files (`phase-01-appendtoallsurfaces-helper.md:128`, `phase-05-consult-checklist-pattern-type.md:32,70`, `phase-07-rule-entry-and-discoverability.md:130`) similarly replace their line-number cites with symbol references — the file-level pattern is identical.)

### 2.4 — `skipped_via_override` field (Q1)

The Step 2 plan's decision shape (in `plans/260615-1530-.../plan.md` lines 106-114) lists `skipped_via_override?: boolean` as "ASPIRATIONAL — see note below." The CLEANUP follow-up is to either remove the field from the decision shape or document it as permanently `false`. Recommended: **document as permanently `false`** (the override is auditable via `runtime-state.jsonl`; the field is correctly never set).

Edit the plan file to:
- Remove the field from the decision shape.
- Add a "Q1 resolution (2026-06-16)" note pointing to `plans/reports/brainstorm-260615-1430-...md § Open questions for Step 4` and `plans/260615-2126-.../plan.md § Unresolved questions` (where Q1 is also resolved).

## Related Code Files

- Modify: `plans/260615-1500-surfaces-helper-and-refactors/phase-01-surfaces-helper.md` (item 1.3)
- Modify: `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:87-262` (item 4.1; 6 description fields)
- Modify: `plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/plan.md:50-57` + the 3 phase files that cite line numbers (item 4.4)
- Modify: `plans/260615-1530-bash-gate-debate-stderr-override-recurrence/plan.md:106-114` (Q1)

## Implementation Steps

1. **Item 1.3** — edit `plans/260615-1500-surfaces-helper-and-refactors/phase-01-surfaces-helper.md` to flip the 3 unresolved questions to "Resolved 2026-06-15" inline.
2. **Item 4.1** — edit `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js` to update the 6 CHECKLIST `description` fields per the table in § 2.2.
3. **Item 4.4** — edit `plans/260615-2126-.../plan.md` and the 3 phase files (`phase-01-...md`, `phase-02-...md`, `phase-03-...md`) to replace line-number ranges with symbol references per the table in § 2.3.
4. **Q1** — edit `plans/260615-1530-.../plan.md` lines 106-114 to remove the `skipped_via_override` field from the decision shape and add the "Q1 resolution" note.
5. **Verify** by `grep -n` for the old line numbers — expect 0 hits.

## Success Criteria

- [ ] `phase-01-surfaces-helper.md`: new `## Resolution Log` section added at the bottom of the file with all 3 design decisions + resolution dates + implementation citations.
- [ ] `runtime-agnostic-checklist.js`: all 6 CHECKLIST `description` fields updated to name the helper or canonical pattern.
- [ ] Step 4 plan + 3 phase files: no `lines \d+-\d+` citations for `core/gate-decision-log.js` or `core/gate-override.js`; symbol references used instead. **Coverage: 4 places** (`plan.md` `related` frontmatter + `phase-01-...md:128` + `phase-05-...md:32,70` + `phase-07-...md:130`).
- [ ] `plans/260615-1530-.../plan.md` decision shape: `skipped_via_override` field removed; resolution note added.
- [ ] No code change; `pnpm test` still shows 986/987 (1 skipped).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Item 4.1 changes the CHECKLIST description text — any test that matches the exact string breaks | The 10 tests in `__tests__/runtime-agnostic.test.js` assert on `id` and `verify()` behavior, not on `description` text. Verify with `grep -E "\.description" __tests__/runtime-agnostic.test.js` (expect 0 hits). |
| Item 1.3's "Resolved" annotations drift from the actual implementation | The annotations cite the specific source-of-truth: code review's "verified clean" section, the actual `Object.freeze` line, etc. Future readers can re-verify with `grep`. |
| Item 4.4's symbol references break grep-based navigation for someone used to line numbers | Symbol references are MORE stable than line numbers (the planning-order report already notes: "Replace line ranges with symbol references or refresh the numbers"). Document the new convention in the Step 4 plan's "Validation Log" section. |
| Q1 removal of `skipped_via_override` is a breaking change for any code that imports the decision shape | The shape lives in the plan's pseudocode, not in exported code. The actual `decision` object in `bash-gate.js` does NOT include the field (verified by reading the source). No code breakage. |
