---
phase: 5
title: "Phase 4 — Plan 1 acceptance gate"
status: completed
priority: P1
effort: "~30min"
dependencies: ["phase-3-c3-stdio-peer-config-in-mcp-json-factory-mcp-json"]
---

# Phase 5: Phase 4 — Plan 1 acceptance gate

## Overview

Run the Plan 1 acceptance gate end-to-end. The gate is: **"all 9 legacy test namespaces pass against the legacy server, AND all 55 tests in namespace 10 pass against the Mastra factory"** (per the master tracker's 2026-06-16 namespace-anchor decision). Confirm no regression, update the master tracker, file a meta-state `change-log`, and open the single stacked PR.

This is the **last phase of Plan 1**. Once it ships, the atomic adoption is complete and Plan 2 (C4 parity) can start.

## Context Links

- **Master tracker update protocol:** `plans/reports/productization-260612-1530-master-tracker.md` § Update Protocol (4-step: edit tracker first → commit → log_change → file change-log)
- **Acceptance gate language:** the master tracker § Phase C plan stack (2026-06-16)
- **Plan parent:** `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md`

## Requirements

- **Functional:**
  - `pnpm test` passes 9/9 legacy namespaces + 55/55 tests in namespace 10. Total: 64 (count is informational; the 9-namespace + namespace-10 anchors are durable).
  - No regression in the 9 legacy namespaces.
  - All 20 ported wire-format tests pass.
  - All 29 per-tool parity contract tests pass.
  - All 6 static-config C3 tests pass.
  - The 55 namespace-10 tests demonstrate that the Mastra factory reproduces the legacy coercion contract and registers all 29 deterministic tools with no schema drift.
  - The master tracker Phase C subsection is updated: `[ ] C1` → `[x] C1`, `[ ] C2` → `[x] C2`, etc. (or batch into `[~]` if any sub-phase needs follow-up).
  - A `meta_state_log_change` entry is filed with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md#Phase C'`, summarizing the closeout.
  - The single stacked PR is opened (1 PR total, not 4 sub-PRs).
- **Non-functional:**
  - The PR title and body reference Plan 1 by name + plan path.
  - The PR body lists the 4 sub-phase commits + the test count delta.
  - The branch is pushed to origin.

## Architecture

**Acceptance gate (single sentence, the durable anchor):**

> *"All 9 legacy test namespaces pass against the legacy server, AND all 55 tests in namespace 10 (`tools/learning-loop-mastra/__tests__/`) pass against the Mastra factory."*

The 9-namespace anchor is **preserved** from the 2026-06-16 master tracker decision (replaces count-based baseline). Namespace 10 is additive — it doesn't disturb the 9.

**The 55 tests in namespace 10:**

| Test file | Tests | Phase | What it locks |
|-----------|-------|-------|---------------|
| `wire-format-coercion-fix.test.js` | 5 | Phase 1 (C5) | Top-level array/boolean/number coercion; identity-preservation |
| `wire-format-top-level-coercion.test.js` | 5 stdio + 1 factory-unit | Phase 1 (C5) | stdio envelope unwrap; `installWireFormatCoercion` analog |
| `wire-format-meta-state-optional-fields.test.js` | 5 | Phase 1 (C5) | `affected_system` / `code_ref` / `ledger_ref` schema shape |
| `wire-format-patch-recursion.test.js` | 1 stdio + 3 unit | Phase 1 (C5) | **Leaf-recursion case — `MAX_RECURSION_DEPTH = 2` lock** |
| `parity-schema-shape.test.js` | 29 | Phase 2 (C2) | Per-tool inputSchema parity contract |
| `mcp-config-peer.test.js` | 6 | Phase 3 (C3) | Static-config check for both `.mcp.json` files |
| **Total** | **55** | | |

**Tracker update (per master tracker Update Protocol):**

Edit `plans/reports/productization-260612-1530-master-tracker.md` § Phase C:

- C1: `[ ]` → `[x] C1 — closed 2026-06-16 via plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption`
- C2: `[ ]` → `[x] C2 — closed 2026-06-16`
- C3: `[ ]` → `[x] C3 — closed 2026-06-16`
- C5: `[ ]` → `[x] C5 — closed 2026-06-16 (factory + 20 ported tests)`
- C4: stays `[ ]` (Plan 2)
- C6, C7: stay `[ ]` (Plan 3)

Commit the tracker diff standalone (1-line checkbox flip + body text per sub-phase).

**Meta-state `change-log` entry (per Update Protocol step 4):**

```jsonc
{
  "change_dimension": "semantic",
  "change_target": "plans/reports/productization-260612-1530-master-tracker.md#Phase C",
  "change_diff": {
    "added": ["Plan 1 closeout body text for C1+C2+C3+C5"],
    "removed": [],
    "changed": ["C1/C2/C3/C5 checkbox from [ ] to [x]"]
  },
  "reason": "Plan 1 (atomic Mastra adoption, C1+C2+C3+C5) shipped 2026-06-16 via plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption. 9 legacy namespaces pass, 55 tests in namespace 10 pass, 29 tools registered via createLoopTool factory, peer config added to .mcp.json + .factory/mcp.json. Plan 2 (C4 parity gate) and Plan 3 (C6+C7 cut-over) remain open.",
  "evidence_code_ref": "tools/learning-loop-mastra/create-loop-tool.js"
}
```

**Stacked PR (1 PR, 5 commits):**

| # | Commit | Subject |
|---|--------|---------|
| 1 | `chore(mastra): add tools/learning-loop-mastra/ skeleton + 10th test namespace (Phase C Plan 1 Phase 0)` | Phase 0 install + skeleton |
| 2 | `feat(mastra): ship createLoopTool factory + 4 ported wire-format tests (Phase C Plan 1 Phase 1 / C5)` | Phase 1 factory + 20 tests |
| 3 | `feat(mastra): register 29 deterministic meta-surface tools via createLoopTool (Phase C Plan 1 Phase 2 / C2)` | Phase 2 register loop + 29 parity tests |
| 4 | `feat(mcp): add learning-loop-mastra peer entry to .mcp.json + .factory/mcp.json (Phase C Plan 1 Phase 3 / C3)` | Phase 3 peer config + 6 static-config tests |
| 5 | `docs(plans): flip Phase C sub-phases C1+C2+C3+C5 to [x] in master tracker (Plan 1 closeout)` | Tracker update + meta-state log |

Single PR per the atomic-unit pattern (mirrors Phase B's stacked PR strategy). The PR body summarizes the 5 commits, the test count delta, and links to the 2 research reports + 1 brainstorm.

## Related Code Files

- **Create (1):**
  - `plans/reports/productization-260612-1530-master-tracker.md` diff (1-line checkbox flip per C1/C2/C3/C5 + 4 body lines)
- **No code changes:** Plan 1's code is locked after Phase 3. The acceptance gate is verification + bookkeeping only.

## Implementation Steps

**Step 1 — Run the full test suite + record results (~10 min)**

1. Run `pnpm test 2>&1 | tee /tmp/plan-1-test-output.log`.
2. Verify all 9 legacy namespace globs ran (no errors, no missing globs).
3. Verify namespace 10 ran 55 tests.
4. Count pass/fail/skip: expect all pass (or pre-existing skip); 0 unexpected failures.
5. If any failure: investigate, fix, re-run. **Do not proceed to Step 2 with failures.**

**Step 2 — Update the master tracker (~10 min)**

1. Edit `plans/reports/productization-260612-1530-master-tracker.md` § Phase C.
2. Flip C1, C2, C3, C5 checkboxes from `[ ]` to `[x]`.
3. Add body text per sub-phase (1 line each, links to plan dir).
4. Commit: `docs(plans): flip Phase C sub-phases C1+C2+C3+C5 to [x] in master tracker (Plan 1 closeout)`.

**Step 3 — File the meta-state `change-log` entry (~5 min)**

1. Use `meta_state_log_change` MCP tool (preferred) OR direct `meta-state.jsonl` append (if MCP tool is unavailable).
2. Parameters per the JSON spec above.
3. Verify the entry is appended and the JSONL parses.

**Step 4 — Open the stacked PR (~5 min)**

1. Push the branch: `git push -u origin 260616-1605-phase-c-plan-1-atomic-mastra-adoption`.
2. Use `gh pr create` with:
   - Title: `Phase C Plan 1 — Atomic Mastra Adoption (C1+C2+C3+C5)`
   - Body: link to plan + 2 research reports + 1 brainstorm + test count summary.
3. Verify the PR is open and all 5 commits are in the diff.

**Step 5 — Plan 1 closeout report (~5 min)**

1. Create `plans/reports/phase-c-plan-1-260616-1605-closeout-report.md` (or similar) with:
   - Test results (9/9 legacy namespaces + 55/55 namespace 10)
   - Tool count delta (0 → 29 mastra tools registered)
   - Files created/modified
   - Open questions deferred to Plan 2 / Plan 3
2. The report is the handoff to Plan 2's author.

## Success Criteria

- [ ] `pnpm test` passes 9/9 legacy namespaces + 55/55 namespace 10 tests. Total: 64 (count informational).
- [ ] Master tracker Phase C subsection updated: C1, C2, C3, C5 all `[x]`. C4, C6, C7 remain `[ ]`.
- [ ] Tracker commit is standalone (1 line checkbox flip + body text per sub-phase).
- [ ] `meta_state_log_change` entry filed with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md#Phase C'`.
- [ ] Branch pushed to origin; single stacked PR opened.
- [ ] PR body links to plan dir + 2 research reports + 1 brainstorm report.
- [ ] Plan 1 closeout report written to `plans/reports/`.
- [ ] Plan 2 (C4 parity gate) and Plan 3 (C6+C7 cut-over) remain in `[]` for the next session to author.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| A test in namespace 10 fails on the full suite (was passing in isolation) | low | Investigate; the 55 tests are independent (no shared state); the issue is likely a path resolution or import order bug. |
| Master tracker merge conflict (another session edited it concurrently) | low | Fetch + rebase before editing; the tracker is the canonical source. |
| `meta_state_log_change` fails (MCP tool unavailable, gate blocks) | low | Fallback: append directly to `meta-state.jsonl` (allowed via gate if preflight marker active; otherwise surface to operator). |
| The PR review reveals a design issue (e.g., `mastra_` prefix is wrong) | low | Address in a follow-up commit on the same PR; do not close + reopen. |
| Operator wants to split the 1 PR into 4 sub-PRs (Phase B's stacked-PR pattern) | medium | **Surface as a checkpoint question at PR open.** The atomic-unit pattern favors 1 PR; the stacked-PR pattern favors 4. Recommend 1 PR (the unit is atomic; the 5 commits tell the story). |

## Next Steps

- **After Phase 4:** Plan 2 (C4 parity gate) can start. The parity harness is a new test file that spawns both servers and compares outputs. Plan 2 author reads the 2 research reports + this plan + the master tracker.
- **Operator checkpoint:** at PR open, the operator reviews the 5-commit diff + the master tracker update. If accepted, Plan 1 closes. If changes requested, address on the same PR.
- **Plan 2 / Plan 3 follow-up:** the 2 follow-up plans are NOT authored in this session. They are blocked by Plan 1's PR merge. Plan 2 author will be a future session.
