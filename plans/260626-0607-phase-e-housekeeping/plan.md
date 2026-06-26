---
title: "Phase E Plan 3: Housekeeping (R2 ownership + parity-pins + schema rot + Plan 6 follow-ups)"
description: "Ships E.2 (AGENTS.md §11 Runtime interface ownership), E.3 (parity-pin label + docs/legacy-pins.md), E.4 (delete orphaned core/schema-descriptions.yaml), Rev 6 I-1 (core/README.md docs drift + regression guard extension), and Rev 6 I-2 (meta_state_patch for entry #9 to transition stale → active). 5 doc/process changes + 1 file deletion + 1 registry lifecycle action."
status: done
priority: P2
branch: "phase-e/plan-3-housekeeping"
tags: [phase-e, housekeeping, r2-ownership, parity-pins, schema-cleanup, registry-lifecycle, e2, e3, e4]
blockedBy: [260624-2335-phase-e-foundation]
blocks: []
created: "2026-06-26T06:07:00.000Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 3: Housekeeping

> **Source:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 6 + Rev 8 § "Plan 3 (phase-e-housekeeping)" (lines 152, 192, 696–715).
> **Predecessor plans:** Plan 1 (`plans/260624-2335-phase-e-foundation/plan.md`, DONE 2026-06-25, PR #15+#16).
> **Sibling plans:** Plan 2 (DONE 2026-06-25, PR #17) + Plan 6 (DONE 2026-06-26, PR #18 squash-merged at `de01dcc`).
> **Successor plans:** None (Plan 4 `phase-e-mastra-code-validation` is parallel, not blocked; Plan 5 `hardening-r2-lim3-lim4` is parallel).

## Overview

Plan 3 closes the doc/process carryovers from Phase E. It ships 5 small items: (E.2) adds `AGENTS.md §11` codifying R2 ownership ("runtime interface code is owned by the runtime agent"), (E.3) labels the parity-pin workflow + creates `docs/legacy-pins.md` to lock the convention, (E.4) deletes `core/schema-descriptions.yaml` (orphaned dead code with stale header), (Rev 6 I-1) fixes `core/README.md` lines 26/27/46 docs drift surfaced in Plan 6 code review + extends the regression guard's SEARCH_PATHS, (Rev 6 I-2) runs `meta_state_patch` for entry `meta-260618T0558Z` to transition `stale → active`.

**Effort:** ~2.5h (was ~2h pre-Rev-6; +0.5h for the 2 Plan 6 follow-ups). **Risk:** Low — doc/process changes + 1 file deletion + 1 registry lifecycle action. No behavioral changes to runtime hooks, MCP servers, or core logic.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [E2R2Ownership](./phase-01-e2-r2-ownership.md) | Pending | AGENTS.md §11 inserted; existing §11 renumbered to §12; `git diff AGENTS.md` shows the 2-section reorder |
| 2 | [E3ParityPinAndLegacyPins](./phase-02-e3-parity-pin-and-legacy-pins.md) | Pending | Parity-pin label added to `mastra/workflows/workflow-intentional-skip.js`; `docs/legacy-pins.md` lists all parity-pinned files; `pnpm test` GREEN |
| 3 | [E4SchemaRotCleanup](./phase-03-e4-schema-rot-cleanup.md) | Pending | `core/schema-descriptions.yaml` deleted; grep for `schema-descriptions` returns 0 references in live tree; `pnpm test` GREEN |
| 4 | [I1DocsDriftAndGuardExtension](./phase-04-i1-docs-drift-and-guard-extension.md) | Pending | `core/README.md` lines 26/27/46 fixed; `external-refs-updated.test.js` SEARCH_PATHS extended to include `tools/learning-loop-mastra/core/` + 1 new FORBIDDEN_PATH_PATTERNS entry; Phase 1's regression guard still GREEN (now scans more files) |
| 5 | [I2ReVerifyEntry9](./phase-05-i2-re-verify-entry-9.md) | Pending | `meta_state_patch` (per D7) sets `status: active` + `last_verified_at` for entry `meta-260618T0558Z`; `meta_state_list` confirms `status: active`; cold-tier regression test GREEN |

**TDD structure applied:** each phase writes any required regression tests BEFORE the production change. Phase 2 and Phase 3 are guarded by `pnpm test` (no new tests; existing suite must remain GREEN). Phase 4 adds 1 new pattern to `external-refs-updated.test.js`. Phase 5 is gated on the existing cold-tier regression test.

## Acceptance Criteria

- [x] `AGENTS.md §11` ("Runtime interface ownership") inserted at lines 355+; existing §11 ("What changed in this rewrite") renumbered to §12; sections §1–§10 unchanged
- [x] `AGENTS.md` total section count: 12 (§1–§12); §11 line range starts after §10's last paragraph; §12 starts where §11 was (line 355)
- [x] `tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js` has a 1-line parity-pin comment above `export const workflowIntentionalSkip` (line 47)
- [x] `tools/learning-loop-mastra/docs/legacy-pins.md` exists with: title, intro paragraph explaining "parity-pin" convention, numbered list of parity-pinned files (workflow-intentional-skip.js + the 4 actual parity surfaces: schema-parity.js, create-loop-{tool,workflow,agent}.js, build-meta-state-tools.js), and a "do not move to legacy/" rule per file
- [x] `tools/learning-loop-mastra/core/schema-descriptions.yaml` deleted; `grep -rn "schema-descriptions" tools/learning-loop-mastra/` returns 0 matches outside `docs/journals/` + the deleted file's prior location
- [x] `core/README.md` line 26 says `tools/learning-loop-mastra/mastra/create-loop-*.js (shell factories)` (was `tools/learning-loop-mastra/create-loop-*.js`)
- [x] `core/README.md` line 27 says `tools/learning-loop-mastra/mastra/{workflows,agents}/ (shell-defined entities); tools/learning-loop-mastra/tools/legacy/ (separate substrate; NOT under mastra/)` (was `tools/learning-loop-mastra/{workflows,agents,tools}/`)
- [x] `core/README.md` line 46 says `**Mastra shell** (\`tools/learning-loop-mastra/mastra/\`) — the imperative shell` (was `**Mastra shell** (\`tools/learning-loop-mastra/\` top level)`)
- [x] `core/README.md` line 47 unchanged (`interface/` path is correct post-Plan-2)
- [x] `__tests__/phase-e-shell-restructure/external-refs-updated.test.js` SEARCH_PATHS includes `tools/learning-loop-mastra/core/`
- [x] `__tests__/phase-e-shell-restructure/external-refs-updated.test.js` FORBIDDEN_PATH_PATTERNS includes `tools/learning-loop-mastra/core/schema-descriptions\\.yaml` (per E.4 deletion — guards future re-creation at the original location; corrected per red-team finding M6)
- [x] `pnpm test` GREEN across all 13 namespaces (12 existing + 1 new from Plan 6 `phase-e-shell-restructure`)
- [x] Entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` `status: stale → active` via `meta_state_patch` (per D7; CAS via `_expected_version: 10`)
- [x] Cold-tier regression test (`cold-tier-regression.test.cjs`) GREEN after Phase 5
- [x] `meta_state_log_change` filed with `change_target: plans/260626-0607-phase-e-housekeeping/plan.md`
- [x] Journal entry: `docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md`

## Dependencies

**Blocks:**
- Nothing (Plan 3 closes doc/process debt; Plan 4 + Plan 5 are parallel)

**Does not block:**
- `260626-0930-phase-e-mastra-code-validation` (Plan 4) — Plan 3's `docs/legacy-pins.md` and AGENTS.md §11 are useful but not required
- `260701-0930-hardening-r2-lim3-lim4` (Plan 5) — Plan 3 ships the PROCESS NORM for R2 ownership; Plan 5 ships the WRITE GATE

## Resolved Design Decisions (applied to this plan)

| # | Decision | Source | Rationale |
|---|----------|--------|-----------|
| D1 | New §11 BEFORE existing §11 (renumber existing to §12) | scout verification (Edge case #3) | Architectural contract comes before historical log; matches §1 (meta-surface) → §2 (hook matrix) → ... convention |
| D2 | E.4 = DELETE `core/schema-descriptions.yaml` (not rewrite) | scout verification (E.4) | Zero live importers (header comment is stale; tools/learning-loop-mcp/ removed in plan 260613); delete is cleaner than rewrite |
| D3 | E.3 parity-pin label on `workflow-intentional-skip.js` (per scope report) | scope report Rev 6 + scope report says "parity-test pin" | Scope report explicit; planner verifies and flags if pin semantics are misleading |
| D4 | `docs/legacy-pins.md` ALSO lists the 4 actual parity surfaces | scout verification (E.3 edge case #2) | Documents the broader parity contract; legacy-pins.md is the canonical registry |
| D5 | FORBIDDEN_PATH_PATTERNS extended with `schema-descriptions\\.yaml` | scout verification (I-1 edge case #1) | Guards against future re-creation of the deleted file |
| D6 | SEARCH_PATHS extended with `tools/learning-loop-mastra/core/` | scout verification (I-1) | Closes the regression guard gap that missed `core/README.md` lines 26/27/46 |
| D7 | Phase 5 uses `meta_state_patch` (NOT `meta_state_re_verify`) | red-team finding C1 | Entry #9 has no `verification.steps`; re-verify returns `no_verification_steps`. Patch is more direct. |
| D10 | `status` + `last_verified_at` are NOT on `IMMUTABLE_PATCH_FIELDS` deny-list | grep verification at `core/meta-state.js:259-270` | Verified at plan-authoring time; Step 1 of Phase 5 re-verifies at execution time |
| D8 | Single atomic commit (NOT split per phase) | Plan 1 + Plan 6 precedent | All 5 items are doc/process + 1 deletion + 1 lifecycle action; splitting creates review overhead with no behavioral isolation benefit |
| D9 | `meta_state_log_change` at plan completion (not per-phase) | Plan 1 + Plan 6 convention | One entry per plan; per-phase entries would create noise |

## Open Items (NOT resolved in this plan)

- **Scope report E.3 wording:** the scope report says "Add a one-line comment to `workflow-intentional-skip.js` flagging it as a parity-test pin (not legacy)" but the scout verified `workflow-intentional-skip.js` has no parity semantics. **Resolution:** D3 follows the scope report; the pin label uses "parity-test pin" wording (the file is pinned because parity tests depend on its location, not because it has parity semantics). The 4 actual parity-semantic files are ALSO listed in `legacy-pins.md` per D4 to document the broader convention. If the user disagrees during validation, Phase 2 can be re-scoped.
- **Line 47 of core/README.md:** scout flagged line 47 as also stale. **Resolution:** Acceptance criterion explicitly states line 47 is unchanged (`interface/` is correct); the "line 47 stale" claim from the scout referred to surrounding sentence structure, not the `interface/` reference itself. Verify before editing.
- **16+ other stale `mechanism_check=true` entries:** Plan 3 only addresses entry `meta-260618T0558Z` (the one Plan 6's code review flagged). The registry has 16+ other stale entries with `mechanism_check=true` that may also be re-verify candidates (verified by red-team Unresolved Q5). **Resolution:** Out of scope for Plan 3. These entries likely have `verification.steps` already (they were created after the verification schema stabilized); a future plan can sweep them. Flagging here so the next housekeeping pass doesn't miss them.

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | §11 renumbering breaks external links or section references | Low | `grep -rn "§11" .` before commit; verify no docs/scripts link to "§11 What changed in this rewrite" |
| R2 | `schema-descriptions.yaml` deletion breaks a hidden consumer | Very Low | Scout verified zero live importers; grep audit before deletion |
| R3 | `meta_state_patch` blocked by version mismatch (concurrent writer) | Low | D10: CAS via `_expected_version: 10`; on mismatch, retry once with fresh version |
| R4 | `external-refs-updated.test.js` extension breaks the test (e.g., FORBIDDEN_PATH_PATTERNS now matches valid code) | Medium | Scout verified no current code references `tools/learning-loop-mastra/schema-descriptions.yaml`; test runs as part of `pnpm test` GREEN gate |
| R5 | `core/README.md` line 47 actually needs editing (scout claim) | Low | Acceptance criterion explicitly states line 47 unchanged; verify before commit |
| R6 | Single-commit split trades review granularity for atomicity | Low | Plan 3 ships < 100 LoC of doc/process changes; review burden is low; atomicity simplifies the operator's mental model |
| R7 | Outdated (Phase 5 redesign): `META_STATE_VERIFY_EXEC` env var concern | N/A | Resolved by D7: `meta_state_patch` does not require the env var |
| R8 | `workflow-intentional-skip.js` parity-pin label is semantically misleading (scout finding) | Low | D3 + D4: scope report wording used; actual parity surfaces ALSO documented in legacy-pins.md |

## Verification (how to test the change is right)

1. `ls tools/learning-loop-mastra/core/schema-descriptions.yaml 2>&1` returns "No such file or directory"
2. `grep -rn "schema-descriptions" tools/learning-loop-mastra/` returns 0 matches outside `docs/journals/`
3. `cat AGENTS.md | sed -n '350,365p'` shows the new §11 + renumbered §12
4. `grep -c "^## " AGENTS.md` returns 12
5. `head -50 tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js | grep -A1 "parity-pin"` shows the comment
6. `cat tools/learning-loop-mastra/docs/legacy-pins.md` lists ≥5 files (workflow-intentional-skip.js + 4 parity surfaces)
7. `cat tools/learning-loop-mastra/core/README.md | sed -n '24,28p;44,48p'` shows the corrected `mastra/` references
8. `cat tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js | grep -A20 SEARCH_PATHS` shows `tools/learning-loop-mastra/core/` in the list
9. `node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` passes
10. `pnpm test` GREEN across all 13 namespaces
11. `mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` returns `status: active`
12. `mcp__learning-loop__mastra_meta_state_check_grounding --id meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` returns `status: grounded, hash match`
13. Cold-tier regression test (`cold-tier-regression.test.cjs`) GREEN
14. `git log --follow tools/learning-loop-mastra/docs/legacy-pins.md` shows creation
15. `ls docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md` exists

## Cross-references (Plan 3)

- Plan 1: `plans/260624-2335-phase-e-foundation/plan.md` (DONE) — Plan 3 depends on the FCIS invariant and `core/` rename
- Plan 2: `plans/260625-1618-phase-e-interface-spec/plan.md` (DONE) — Plan 3's `legacy-pins.md` and AGENTS.md §11 reference the runtime interface contract
- Plan 6: `plans/260626-0302-phase-e-shell-restructure/plan.md` (DONE) — Plan 3's I-1 + I-2 are the code review follow-ups from Plan 6
- Code review report: `plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md` (source of I-1 + I-2)
- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 6 § lines 696–715 (source of all 5 items)
- Scout verification report: `plans/reports/scout-260626-0607-phase-e-housekeeping-file-inventory-report.md` (file inventory + edge case verification; produced during planning)
- Red-team review report: `plans/reports/general-purpose-260626-0616-phase-e-plan-3-housekeeping-red-team-review-report.md` (1 critical blocker C1 + wrong-path bugs C2/M6 fixed; all 9 design decisions accepted with caveats)

---

**Status:** Pending — red-team review complete (1 critical blocker + 2 wrong-path bugs fixed; all 9 design decisions accepted). Recommended next move: `/ck:cook plans/260626-0607-phase-e-housekeeping/plan.md` after validation gates pass.