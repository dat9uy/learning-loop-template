---
title: "Phase E Plan 1: Foundation (rename core/legacy → core + FCIS + schema doc + 3-layer AGENTS.md)"
description: "Pure rename + discipline doc that codifies the 3-layer architecture. No new code. Locks the FCIS invariant. Includes fingerprint repointing to satisfy the O(N)-per-cited-file-change constraint (meta-260624T1920Z)."
status: done
priority: P2
branch: "main"
tags: [phase-e, foundation, fcis, schema-doc, runtime-interface]
blockedBy: []
blocks: [260625-0930-phase-e-interface-spec, 260625-0930-phase-e-housekeeping]
created: "2026-06-24T16:37:55.981Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 1: Foundation

> **Source:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` § "Plan split for execution" — Plan 1 (Foundation).
> **Order of operations:** E.0 (1h, doc-drift closeout) → **E.1 (0.5d, this plan)** → E.1b (1d, interface spec) → E.2–E.4 (~1.5h housekeeping) → E.5 (1–2d, Mastra Code validation).
> **Constraint addressed:** `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` (status=reported, mechanism_check=true) — 7 findings are anchored to `tools/learning-loop-mastra/core/legacy/*` paths; the rename invalidates all 7 fingerprints in one move. This plan handles the repointing as a Phase 6 sub-task using `meta_state_batch` (one atomic call) to keep the write cost at 1 batch op rather than 7 sequential refresh+patch calls.

## Overview

Mechanical rename + discipline doc that codifies the 3-layer architecture (Core / Mastra shell / Runtime interface). After this plan ships, the codebase has a single, authoritative `core/` directory (no `legacy/` subdir), a `core/README.md` that codifies the FCIS invariant, a `docs/schemas.md` that answers the user's #2 concern (no schema doc), and an `AGENTS.md §1` that names the 3 layers explicitly so Plan 2 (interface spec) has the structural context to position `interface/` correctly.

**Effort:** 0.5 day (per the scope report). **Risk:** Low — no functional change to any runtime; all ~1189 existing tests continue to pass; the only test changes are 4 new regression guards added in this plan.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [BaselineAndTests](./phase-01-baselineandtests.md) | Pending | Tests written first (red baseline) |
| 2 | [RenameAndRefs](./phase-02-renameandrefs.md) | Pending | Tests turn green after rename |
| 3 | [FCISInvariant](./phase-03-fcisinvariant.md) | Pending | Static-analysis test (fails on `@mastra/*` import) |
| 4 | [SchemaDoc](./phase-04-schemadoc.md) | Pending | Doc-existence + cross-reference test |
| 5 | [AGENTSmdSection1](./phase-05-agentsmdsection1.md) | Pending | Section-content assertion test |
| 6 | [FingerprintRepointAndVerify](./phase-06-fingerprintrepointandverify.md) | Pending | Cold-tier regression test passes post-repoint |

**TDD structure applied:** each phase writes the test BEFORE the implementation, watches the test fail (red), applies the minimal change, watches the test pass (green), then runs the full suite to confirm no regression. The 4 regression guards (FCIS, schema-doc-ref, agents-section-1-content, cold-tier-grounding) lock the new invariants against silent regression.

## Acceptance Criteria

- [ ] `tools/learning-loop-mastra/core/` exists as a top-level functional-core directory (no `legacy/` subdir)
- [ ] `core/README.md` codifies the FCIS invariant: "Core has zero `@mastra/*` imports; the shell may import core"
- [ ] `tools/learning-loop-mastra/docs/schemas.md` exists; enumerates 4 meta-state kinds + runtime-state shape + wire envelope + parity contract
- [ ] `AGENTS.md §1` names the 3 layers (Core / Mastra shell / Runtime interface) explicitly
- [ ] All 230+ raw `core/legacy` substring references across ~123 files are updated to `core/` (covers `from`, `require`, `await import`, `pathToFileURL(join(...))`, and string-literal path constructions)
- [ ] All 7 findings anchored to `core/legacy/*` are repointed to `core/*` with refreshed fingerprints
- [ ] `meta_state_batch` used for the repoint (1 atomic call, not 7 sequential ops)
- [ ] `loop-introspect` cold-tier regression test passes (no orphan references)
- [ ] All 1189+ existing tests still pass
- [ ] `meta_state_log_change` filed with `change_target: plans/260624-2335-phase-e-foundation/plan.md` and the rename/repoint deltas enumerated

## Dependencies

**Blocks:**
- `260625-0930-phase-e-interface-spec` (Plan 2) — needs the FCIS invariant doc + 3-layer framing in AGENTS.md §1 to position `interface/` correctly
- `260625-0930-phase-e-housekeeping` (Plan 3) — uses the renamed `core/` paths in its doc updates

**Does not block:**
- `260625-0930-phase-e-mastra-code-validation` (Plan 4) — Plan 4 depends on Plan 2, not Plan 1
- `260701-0930-hardening-r2-lim3-lim4` (Plan 5, deferred hardening) — independent, parallel

## Scope Challenge (resolved)

The scope report (Rev 3) raised 6 open questions. This plan addresses Q1, Q3, Q5 implicitly:

- **Q1 (5-requirement contract complete):** N/A — this plan ships the rename, not the contract. The contract ships in Plan 2 (E.0 + E.1b).
- **Q3 (bundled hardening plan as follow-up):** Out of scope. Hardening plan (LIM-3 + R2 gate + LIM-4) is parallel and does not block Phase E.
- **Q5 (interface rename collision):** This plan renames `core/legacy/` → `core/`, not the AGENTS.md "interface" word. The collision is in Plan 2's scope.

## Constraint Notes

The user flagged `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` (status=reported, mechanism_check=true) as a hard constraint. The constraint description observes that renaming files in `core/legacy/` would orphan 7 finding `evidence_code_ref` paths, each requiring its own `meta_state_refresh_fingerprint` + `meta_state_patch` call under the current mechanism.

**This plan's mitigation (Phase 6):**
1. **Before rename** — record the baseline set of 7 fingerprints (pre-image) in a manifest at `plans/260624-2335-phase-e-foundation/reports/pre-rename-fingerprints.json`. If the rename corrupts the post-state, the manifest lets us reconstruct.
2. **After rename** — use `meta_state_batch` to repoint all 7 `evidence_code_ref` paths from `core/legacy/*` → `core/*` AND refresh all 7 fingerprints in a single atomic batch. The MCP `meta_state_batch` tool (verified available via `loop_describe` warm tier) caps at 500 ops/batch and applies them under one lock with one cache invalidation, which keeps the repair cost at 1 batch op rather than 14 sequential ops (7 refresh + 7 patch).
3. **Verify** — re-run the cold-tier regression test (`tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`) which asserts all `mechanism_check=true` findings are grounded. If any are still stale, the batch missed one; surface the orphan in the plan's PR body.

**Future direction (NOT in this plan):** the constraint's resolution direction proposes a shared file-index that owns hashes O(1) per file change. That's a separate loop-design + migration plan (per the constraint's decision rule). This plan does not implement the file-index; it works around the current O(N) mechanism with the batch tool.

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Rename fan-out larger than initially scoped: **123 files** contain `core/legacy` substring; **106** have import statements; **16** use dynamic `await import()`; **7+** use `pathToFileURL(join(...))`; the substring sed catches all of these in one pass | Medium | Phase 1 baseline counts ALL forms (substring, not just `from/require`); Phase 2's substring sed is path-style-agnostic |
| R2 | sed regex bug missed `./core/legacy/` paths (only matched `../core/legacy/`) — would leave `create-loop-workflow.js:5` broken | High (caught by red-team) | **CORRECTED:** regex → `s\|core/legacy/\|core/\|g` (substring, no prefix requirement) |
| R3 | Phase 6 batch op shape was wrong (used `{patch: {...}}` wrapper instead of flat fields) | High (caught by red-team) | **CORRECTED:** flat fields at op's top level; the `patch` wrapper is passthrough and would create a stray `entry.patch` field |
| R4 | Phase 4 doc pointers were wrong (`core/schemas.js` is a re-export; `schema-parity.js` is top-level; `schema-descriptions.yaml` is product-surface) | Medium (caught by red-team) | **CORRECTED:** source-of-truth for the 4 kinds is `core/meta-state.js`; parity source is top-level `schema-parity.js`; `schema-descriptions.yaml` is NOT a meta-state artifact |
| R5 | The 7 fingerprint repoints might miss one finding, leaving the cold-tier test failing | Medium (caught by red-team) | **CORRECTED:** added sibling existence test (cold-tier EXEMPTS anchor-based hash_mismatch); added hash verification pre-repoint; added `meta_state_re_verify` for 6 stale findings |
| R6 | The rename breaks the `tools/learning-loop-mastra/core/` directory's git history (was the `legacy/` subdir before) | Low | `git mv` preserves history; the directory never moves location, only its parent loses the `legacy/` segment |

## Verification (how to test the change is right)

1. `ls tools/learning-loop-mastra/core/` shows the 30+ core files (no `legacy/` subdir).
2. `grep -r "core/legacy" tools/ AGENTS.md docs/ --exclude-dir=__tests__/legacy-mcp 2>/dev/null | wc -l` returns 0.
3. `cat tools/learning-loop-mastra/core/README.md` contains "FCIS" and "@mastra" and "zero".
4. `cat tools/learning-loop-mastra/docs/schemas.md` contains "finding", "change-log", "rule", "loop-design" (4 kinds).
5. `grep -c "Core\|Mastra shell\|Runtime interface" AGENTS.md` returns ≥3 (all 3 layer names present).
6. `node tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` passes (all `mechanism_check=true` findings grounded post-repoint).
7. `pnpm test` passes (all namespaces green, 1189+ tests).

## References

- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` § "Plan split for execution" (rows 1, Plan 1 = phase-e-foundation)
- Constraint: `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` (status=reported)
- Source code (current): `tools/learning-loop-mastra/core/legacy/` (rename target → `core/`)
- FCIS verification (2026-06-24, pre-plan): `grep -rE "from\s+['\"]@mastra" tools/learning-loop-mastra/core/legacy/` returns 0 matches
- Import fan-out (2026-06-24, pre-plan; corrected 2026-06-25 post-red-team):
  - 123 files contain `core/legacy` substring
  - 106 of those have `from`/`require` import statements
  - 16 use dynamic `await import("...core/legacy/...")`
  - 7+ use `pathToFileURL(join(..., "core/legacy/..."))`
  - Total substring matches: 230+ (across all import styles)
  - The substring sed (`s|core/legacy/|core/|g`) catches all of these in one pass
- Fingerprint scope (2026-06-24, pre-plan; corrected 2026-06-25 post-red-team):
  - 7 findings anchored to `core/legacy/*` paths
  - 6 are `status=stale` (need `meta_state_re_verify` post-repoint to transition stale→active)
  - 1 is `status=reported` (the constraint itself; remains reported)
- Red-team report: `plans/260624-2335-phase-e-foundation/reports/red-team-260625-0046-phase-2-4-5-6-review-report.md` (3 hostile reviewers; 5 critical findings applied)
