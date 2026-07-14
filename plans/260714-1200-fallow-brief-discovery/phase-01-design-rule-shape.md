---
phase: 1
title: "design-rule-shape"
status: pending
effort: ""
---

# Phase 1: Design rule shape

## Overview

Freeze the rule id, fields, and 1-item checklist body for `rule-fallow-brief-on-gate-failure` in `plan.md` Appendix A; verify the originating finding `meta-260712T0730Z-...` has no inbound cross-references that would block a `superseded` transition; lock the PROCESS_HINTS row text in Appendix B.

## Requirements

- Functional: rule body JSON-encodes exactly 1 checklist item with id `fallow-gate-failure-routes-to-brief` and the descriptive text from Appendix A.
- Non-functional: the rule id `rule-fallow-brief-on-gate-failure` must appear as a literal substring in the PROCESS_HINTS row text (per H6 ordering gate at `loop-describe-tool.js:94-106`).

## Related Code Files

- Create: (none)
- Modify: `plans/260714-1200-fallow-brief-discovery/plan.md` (verify Appendix A/B are frozen)
- Delete: (none)

## Implementation Steps

1. **Verify `LOOP_SESSION_MODE === "live"`** before any design work. Both `meta_state_promote_rule` (`meta-state-promote-rule-tool.js:57-67`) and `meta_state_supersede` (`meta-state-supersede-tool.js:19-21`) are live-gated. If not live, STOP and surface the prerequisite to the operator — the plan cannot land otherwise.
2. Read `plans/260714-1200-fallow-brief-discovery/plan.md` Appendices A and B; confirm the rule id is `rule-fallow-brief-on-gate-failure`, enforcement is `agent`, pattern_type is `consult-checklist`, and the checklist has exactly 1 item.
3. Call `meta_state_relationships({ id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json', direction: 'both' })` via MCP. If `dangling_refs` is non-empty OR `inbound` includes any entry referencing this finding, switch Phase 4 from `superseded` to `resolved` (per `meta-state-resolve-tool.js:26` schema — `resolved` does not require `consolidated_into`; omitting `consolidated_into` avoids the inverse index asymmetry).
4. Read `tools/learning-loop-mastra/core/loop-introspect.js` lines **122-127** to confirm the current PROCESS_HINTS array literal has 4 rows (`pnpm test discipline`, `PR-body registry deltas`, `Runtime-agnostic audit`, `Tool integration checklist`). The new row will be row #5.
5. Read `.factory/hooks/loop-surface-inject.cjs` lines **35-40** to confirm LOCAL_PROCESS_HINTS currently has 4 rows mirroring PROCESS_HINTS. The new row will be row #5.
6. Read `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` lines **359-379** to confirm the parity assertion shape (strictEqual between canonical PROCESS_HINTS and mirror LOCAL_PROCESS_HINTS).
7. **Re-measure byte sizes on at least 3 finding-set sizes** (clean tree, 1-finding, ≥5-finding) for all three formats (human default, `--format json`, `--brief --format compact`). Use the exact flags from `package.json:21` (`fallow:gate`) and the new `fallow:brief` script. Record stdout + stderr sizes in `plans/260714-1200-fallow-brief-discovery/reports/byte-size-measurements.md`. This grounds the plan rationale in measured data — the task-1 numbers were measured on a synthesized-failure scenario and are not universal claims.
8. Append a "Phase 1 — Design freeze" section to `plans/260714-1200-fallow-brief-discovery/reports/design-freeze.md` capturing: rule id, enforcement, pattern_type, 1-item checklist, PROCESS_HINTS row text verbatim, the inbound/outbound relationship query result, the byte-size measurements table, and the `LOOP_SESSION_MODE` verification.

## Success Criteria

- [ ] `LOOP_SESSION_MODE === "live"` verified at step 1.
- [ ] `plan.md` Appendix A rule body is byte-identical to the YAML block in this phase's reference table.
- [ ] `meta_state_relationships` query result recorded in `reports/design-freeze.md` with no surprise inbound refs (or Phase 4 lifecycle flipped to `resolved` if there are).
- [ ] PROCESS_HINTS row count is 4 today; row #5 text from Appendix B is verified to include the literal `rule-fallow-brief-on-gate-failure` substring.
- [ ] Byte-size measurements recorded in `reports/byte-size-measurements.md` with at least 3 finding-set sizes × 3 formats = 9 cells.

## Risk Assessment

- **Risk:** The rule id conflicts with an existing rule. **Mitigation:** run `meta_state_list({ entry_kind: 'rule', compact: false })` first; the id `rule-fallow-brief-on-gate-failure` should not match any active rule. If it does, choose a new id and update Appendices A and B + plan.md.
- **Risk:** PROCESS_HINTS row text drifts from Appendix B during implementation. **Mitigation:** copy-paste from plan.md Appendix B into both `core/loop-introspect.js` and `.factory/hooks/loop-surface-inject.cjs`; verify byte-for-byte in Phase 3.