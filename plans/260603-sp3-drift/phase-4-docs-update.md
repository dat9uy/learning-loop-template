---
phase: 4
title: "Update Docs (Meta-State Self-Learning Loop Section)"
status: completed
priority: P2
effort: "0.5h"
dependencies: ["phase-3"]
---

# Phase 4: Update Docs

## Overview

After SP3 ships (Phases 0-3), the docs that describe the meta-state self-learning loop must be updated to reflect the new state:

- SP3 changes from `[PLANNED]` to `SHIPPED` in all references
- The Mermaid diagram in `docs/system-architecture.md` updates to show `queryDrift` as live (no longer dashed-yellow)
- The cumulative status table in `docs/trajectory.md` flips SP3 from `PLAN READY` to `SHIPPED (+53 tests)`
- The 10 → 11 tool count propagates through the meta-state registry bullet, the Three Layers table, and the SP3 column of the meta-state self-learning loop section
- The total test count moves from 557 → 610 (or whatever the actual cook produces, typically 609-610)

This phase is **docs-only** (no code, no tests, no manifest changes). It runs after Phase 3 because the docs are accurate only after the tool is implemented, tested, registered, and the acceptance tests have confirmed end-to-end behavior.

## Why a Phase 4 (Not Phase 0)

A phase 0 docs update would describe what the plan *will* ship, which is already in `plan.md` and the 4 phase files. Phase 4 describes what *did* ship, which is needed to keep `docs/system-architecture.md`, `docs/trajectory.md`, `docs/charter.md`, and `docs/observation-vs-meta-state.md` aligned with reality.

The 4 docs that change are user-facing (operators read them at session start) and architecture-facing (they describe the loop's self-referential design). A drift between the docs and the actual code would be a self-referential contradiction — the loop describes itself inaccurately. The whole point of SP3 is to surface drift; leaving docs in drift after SP3 ships is a category error.

## Requirements

- **Functional:**
  - `docs/system-architecture.md` Meta-State Self-Learning Loop section reflects SP3 SHIPPED, 11 tools, 610 tests
  - The Mermaid diagram's `T_SP3` and `S7` nodes lose the `[PLANNED]` label and the dashed-yellow `planned` classDef
  - `docs/trajectory.md` "What Has Happened Since" cumulative table reflects SP3 SHIPPED
  - `docs/charter.md` Meta-state registry bullet lists all 11 `meta_state_*` tools
  - `docs/observation-vs-meta-state.md` Three Layers table reflects 11 meta-state tools
- **Non-functional:**
  - No new file creation (only edits to existing files)
  - No code/test/manifest changes
  - All 4 doc files stay under the 800-LOC default limit
  - `validate-docs.cjs` produces zero new warnings (the pre-existing 9 code refs + 20 config keys warnings are unchanged)
  - `pnpm validate:plan-loop` passes (76 plans check, includes the new phase file)
  - `pnpm validate:records` passes (no record changes, but the validator should still run)

## Architecture

This phase is **no new architecture** — it propagates the existing plan's outcomes to the 4 user-facing docs. The 4 docs already have a structure that needs only the SP3-specific deltas.

**Doc-by-doc deltas:**

### 1. `docs/system-architecture.md` (Meta-State Self-Learning Loop section, lines ~350-486)

- Update the **Meta-State Tools (10 total)** table to 11 tools; flip SP3 status from `PLAN READY (610 tests planned)` to `SHIPPED (610 tests)`
- Update the **Self-Learning Loop Architecture** ASCII diagram (if still present) to mark `queryDrift` as live
- Update the **Mermaid `flowchart TD`** diagram:
  - `T_SP3["<b>SP3</b> (Drift) [PLANNED]<br/>query_drift"]` → `T_SP3["<b>SP3</b> (Drift)<br/>query_drift"]` (drop the `[PLANNED]` label)
  - `T_SP0 --- T_SP1 --- T_SP2 -.-> T_SP3` → `T_SP0 --- T_SP1 --- T_SP2 --> T_SP3` (solid arrow, not dashed)
  - Remove the `class T_SP3 planned` line (or change it to a non-planned class)
  - `S7["<b>7. queryDrift</b> (SP3) [PLANNED]<br/>..."]:::planned` → `S7["<b>7. queryDrift</b> (SP3)<br/>..."]:::purefn` (or a new classDef for shipped-but-not-pure)
  - `S5 -.->|planned| S7` → `S5 --> S7` (solid arrow)
  - `S7 --> S8` (this is already solid; no change)
  - Remove the `classDef planned` line and the `class S7 planned` line, OR keep the classDef for documentation but don't apply it to SP3 nodes
  - Update the diagram legend to remove the "Yellow fill, dashed border = Feature not yet shipped (SP3)" row, OR reword to "Yellow fill, dashed border = PLANNED feature" (no examples in the diagram now)
- Update the **Key properties** section to flip the `meta_state_query_drift` bullet from `(SP3, planned)` to `(SP3, shipped)` with the actual test count and drift-event format

### 2. `docs/trajectory.md` (What Has Happened Since section, ~line 105+)

- Update the cumulative status table:
  - SP3 row: `DESIGN LOCKED + PLAN READY` → `SHIPPED`
  - SP3 row tools column: `meta_state_query_drift` (unchanged)
  - SP3 row tests column: `610 planned (+53)` → `610 (+53)` (or the actual cook count)
- Update the "The Fifth Bridge" paragraph if it mentions "Approach 3 is sequenced after SP3" — keep that sentence (it's still true)
- Add a new bullet: "The 4-phase TDD plan shipped in 3 phases + 1 docs-update phase (Phase 4 added 2026-06-05 per operator request)."

### 3. `docs/charter.md` (Constraint Enforcement Layer section, ~line 30+)

- Update the **Meta-state registry** bullet to list 11 tools (add `meta_state_query_drift` at the end of the `meta_state` group list)
- Update the parenthetical that says "(`meta_state_query_drift` (SP3, plan-ready))" to "(`meta_state_query_drift` (SP3, shipped))"
- No other changes to the charter (Operating Rules 1-8 are unchanged; the `meta_state_log_change` rule from Rule 8 is unchanged)

### 4. `docs/observation-vs-meta-state.md` (Three Layers table, ~line 8+)

- Update the **Meta** row of the Three Layers table:
  - Home: `tools/learning-loop-mcp/meta-state.jsonl` (unchanged)
  - What it tracks: unchanged (the `entry_kind: "change-log"` + `entry_kind: "finding"` discriminated union description is still accurate)
  - Who owns it: unchanged
  - Durability: unchanged
  - **Tools listed in the Home cell**: add `meta_state_query_drift` to the tool list
  - **The list of 10 tools becomes 11 tools**

## Related Code Files

### Create
- None

### Modify
- `docs/system-architecture.md` (Meta-State Self-Learning Loop section; Mermaid diagram; Key properties)
- `docs/trajectory.md` (What Has Happened Since cumulative table + new Phase 4 bullet)
- `docs/charter.md` (Meta-state registry bullet; tool list)
- `docs/observation-vs-meta-state.md` (Three Layers table; Meta row tool list)

### Read
- `docs/system-architecture.md` (current state, Meta-State Self-Learning Loop section)
- `docs/trajectory.md` (current state, What Has Happened Since)
- `docs/charter.md` (current state, Constraint Enforcement Layer)
- `docs/observation-vs-meta-state.md` (current state, Three Layers table)
- `plans/reports/brainstorm-260603-sp3-drift.md` (verify the locked design constants: `drift_kind` enum, `recommendation` field, join cases)
- `plans/260603-sp3-drift/plan.md` (verify Phase 0-3 success criteria; test budget 53 new, 610 total)

### Delete
- None

## Implementation Steps

1. **Run the current `wc -l` baseline** to capture the pre-update state:
   ```bash
   wc -l docs/*.md | sort -rn
   ```
   Expected: `system-architecture.md` 486, `trajectory.md` 122, `charter.md` 55, `observation-vs-meta-state.md` 107 (per the prior docs update that added the Mermaid diagram)
2. **Read the 4 docs** to confirm the current text:
   - `docs/system-architecture.md` (focus: Meta-State Self-Learning Loop section, lines ~350-486)
   - `docs/trajectory.md` (focus: What Has Happened Since, lines ~105+)
   - `docs/charter.md` (focus: Constraint Enforcement Layer, lines ~30+)
   - `docs/observation-vs-meta-state.md` (focus: Three Layers table, lines ~8+)
3. **Update `docs/system-architecture.md`**:
   - Flip the 10 → 11 tools table row for SP3
   - Update the Mermaid diagram: drop `[PLANNED]` labels, remove the `planned` classDef application, change dashed arrows to solid for SP3 paths
   - Update the diagram legend
   - Update the Key properties bullet for SP3
4. **Update `docs/trajectory.md`**:
   - Flip the SP3 row in the cumulative table
   - Add the "Phase 4 added 2026-06-05" bullet
5. **Update `docs/charter.md`**:
   - Add `meta_state_query_drift` to the meta_state tool list
   - Flip the SP3 parenthetical from `plan-ready` to `shipped`
6. **Update `docs/observation-vs-meta-state.md`**:
   - Add `meta_state_query_drift` to the Three Layers table's Meta row tool list
7. **Run the docs size check**:
   ```bash
   wc -l docs/*.md | sort -rn
   ```
   Constraint: no file exceeds 800 LOC
8. **Run the docs validation**:
   ```bash
   node $HOME/.claude/scripts/validate-docs.cjs docs/
   ```
   Constraint: zero new warnings (the pre-existing 9 code refs + 20 config keys are unchanged)
9. **Run the plan-loop validation**:
   ```bash
   pnpm validate:plan-loop
   ```
   Constraint: 76 plans check (or 77 with the new phase file), no regressions
10. **Run the records validation**:
    ```bash
    pnpm validate:records
    ```
    Constraint: no regressions (no record changes, but the validator should still pass)
11. **Run the test suite** (sanity check — no new tests, but ensure no regressions from the docs changes):
    ```bash
    pnpm test
    ```
    Constraint: 610 pass, 0 fail (matches the Phase 3 baseline)
12. **Document the cook** at the end of the cook journal `docs/journals/260605-sp3-cook.md`:
    - Add a Phase 4 section: "Phase 4: Update Docs (added 2026-06-05 per operator request). 0.5h. Updated 4 docs to reflect SP3 SHIPPED. Mermaid diagram updated. All validations pass."

## Test Plan

This phase is docs-only; no new tests. The existing 610 tests should still pass (this phase touches no code files).

| Validation | What it covers | Pass criterion |
|---|---|---|
| `wc -l docs/*.md` | No file exceeds 800 LOC | All files < 800 |
| `validate-docs.cjs docs/` | No new code-ref or config-key warnings | 0 new warnings |
| `pnpm validate:plan-loop` | All 76+ plans structurally valid | 0 errors |
| `pnpm validate:records` | No record regressions | 0 errors |
| `pnpm test` | No test regressions from the docs changes | 610 pass, 0 fail |

## Success Criteria

- [ ] `docs/system-architecture.md` Meta-State Self-Learning Loop section reflects SP3 SHIPPED, 11 tools, 610 tests
- [ ] Mermaid diagram in `docs/system-architecture.md` shows `queryDrift` as a live (non-dashed, non-yellow) node
- [ ] `docs/trajectory.md` "What Has Happened Since" cumulative table reflects SP3 SHIPPED
- [ ] `docs/charter.md` Meta-state registry bullet lists all 11 `meta_state_*` tools
- [ ] `docs/observation-vs-meta-state.md` Three Layers table reflects 11 meta-state tools
- [ ] All 4 doc files stay under the 800-LOC default limit
- [ ] `validate-docs.cjs docs/` produces zero new warnings
- [ ] `pnpm validate:plan-loop` passes
- [ ] `pnpm validate:records` passes
- [ ] `pnpm test` shows 610 pass, 0 fail (no regressions)
- [ ] Cook journal `docs/journals/260605-sp3-cook.md` has a Phase 4 section documenting the docs update

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| The Mermaid diagram's `classDef planned` removal may break the rendered output if other planned features are added later | Low | Keep the `classDef planned` defined but only apply it to future planned features. The 4 lines (`classDef planned ... class T_SP3 planned`) become orphaned but don't break syntax. |
| The Mermaid diagram's dashed arrow change (`-.->|planned| S7` → `--> S7`) may shift node positions | Low | Re-render via `mmdc` and visually verify. The diagram is large; minor position shifts are expected and acceptable. |
| The docs size check may flag `system-architecture.md` if the Mermaid diagram grew beyond expectations | Low | The diagram is ~80 lines; current 486 → expected ~520. Still under 800. |
| The plan-loop validator may flag the new phase file if the validator's frontmatter schema is strict | Low | Mirror Phase 3's frontmatter exactly: `phase: 4`, `title: "Update Docs"`, `status: pending`, `priority: P2`, `effort: "0.5h"`, `dependencies: ["phase-3"]`. |
| The cook journal may not exist yet at the time Phase 4 runs (Phase 3 writes it at the end) | Low | Phase 4's Step 12 documents the cook journal section; if the journal doesn't exist, write a stub. |
| The trajectory.md "What Has Happened Since" may need a complete rewrite (not just a table update) if the prior docs update was insufficient | Low | Read the full section first; apply targeted edits, not a full rewrite. |

## Out of Scope

- Generating an SVG/PNG rendering of the Mermaid diagram (the markdown is sufficient for docs; rendering is a follow-up)
- Adding a `docs/diagrams/` directory to hold standalone `.mmd` files (not needed; embedded in markdown is the project convention)
- Updating the README.md or AGENTS.md (those are operator/agent-facing, not architecture-facing)
- Adding a journal entry for the docs-update phase (the cook journal at `docs/journals/260605-sp3-cook.md` is sufficient; a separate journal is overkill)
- Re-running the red-team review (the docs changes are no-architecture; the 8-finding review was for the code plan, not the docs)
- Running the test suite in CI (the local `pnpm test` is sufficient; CI is downstream)
