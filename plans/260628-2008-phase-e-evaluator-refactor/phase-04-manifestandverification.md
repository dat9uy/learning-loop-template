---
phase: 4
title: "ManifestAndVerification"
status: pending
effort: "0.25 day"
---

# Phase 4: Manifest + Docs + Full Verification

## Overview

Update `core/placement.yaml` (3 new evaluator rows), `docs/placement.md` (3 new table rows), and `AGENTS.md` §1.1 (one-line boundary-adapter clarification). Run the full test suite + placement-manifest invariant + fallow CI guard to confirm clean ship.

## Requirements

- **Functional:** placement manifest enumerates all 33 production `core/` files (was 30, +3 evaluators); docs match; AGENTS.md clarifies the layer; full suite green.
- **Non-functional:** fallow `audit --gate new-only` reports no NEW dead-code findings on the 3 evaluator files; placement-manifest test passes; FCIS invariant passes.

## Architecture

**placement.yaml change pattern** (one row per new file, inside a new `=== evaluator ===` section). The role taxonomy already includes `evaluator` in `docs/placement.md` (locked by Phase E Mechanism A); the manifest just didn't have any rows because no evaluators existed when Mechanism A shipped. The placement-manifest test's `CLOSED_ROLES` already includes `evaluator` (`placement-manifest.test.js:19`). **No test edit needed for the role name itself.**

**Layering invariant:** the `evaluator: ["primitive"]` rule (line 101 of placement-manifest.test.js) is the focus of Phase 2 Step 0's resolution. Phase 4 verifies the resolution is in place:

- **If Phase 2 took Path A (split gate-logic.js):** `docs/placement.md` and the test are unchanged; the 3 evaluators import from `core/gate-logic-primitives.js` (role: primitive). Verify no evaluator imports `gate-logic.js` directly.
- **If Phase 2 took Path B (loosen invariant):** `placement-manifest.test.js:101` shows `evaluator: ["primitive", "facade"]`; `docs/placement.md` role-taxonomy table carries the ADR-style rationale line. Verify both edits are in place.

## Related Code Files

### Modify

- `tools/learning-loop-mastra/core/placement.yaml` (add `=== evaluator ===` section with 3 rows)
- `tools/learning-loop-mastra/docs/placement.md` (verify `evaluator` row + ADR comment from Phase 2 Step 0 are present)
- `AGENTS.md` §1.1 (one-line clarification)
- `tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js` (verify layering invariant resolution from Phase 2 Step 0 is in place — no edit if Path A, line 101 update if Path B)

## Related Code Files

### Modify

- `tools/learning-loop-mastra/core/placement.yaml` (add `=== evaluator ===` section with 3 rows)
- `tools/learning-loop-mastra/docs/placement.md` (confirm `evaluator` row is present; add 3 file rows if needed)
- `AGENTS.md` §1.1 (one-line clarification)
- `tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js` (verify `evaluator` is in the allowed-roles set)

### Create

- `plans/260628-2008-phase-e-evaluator-refactor/reports/phase4-verification.md` (final verification log)

## Implementation Steps

1. **Step 1 — Update `core/placement.yaml`.** Add a new `=== evaluator ===` section with 3 rows:
   - `evaluate-write-gate.js` (role: evaluator, summary: "Write-gate evaluator — 7-rule cascade + preflight delegation.")
   - `evaluate-bash-gate.js` (role: evaluator, summary: "Bash-gate evaluator — constraint pattern + path-write + promoted-rules combination.")
   - `evaluate-inbound-gate.js` (role: evaluator, summary: "Inbound-gate evaluator — state-change signal + staleness check.")
2. **Step 2 — Verify layering resolution from Phase 2 Step 0.** Check whether the plan took Path A or Path B:
   - If Path A: verify `core/gate-logic-primitives.js` exists + evaluators import from it (not from `gate-logic.js` for facade-only symbols).
   - If Path B: verify `placement-manifest.test.js:101` is `evaluator: ["primitive", "facade"]` AND `docs/placement.md` role-taxonomy table carries the ADR-style rationale line for the loosening.
3. **Step 3 — Verify `docs/placement.md`.** Confirm the role taxonomy table lists `evaluator` (it should already from Phase E Mechanism A). Confirm the manifest matches.
4. **Step 4 — Update `AGENTS.md` §1.1.** Find the existing "Runtime interface" bullet. Add one sentence: "**Hooks** (universal scripts in `hooks/legacy/` + per-runtime shim files in `.claude/coordination/hooks/`, `.factory/coordination/hooks/`) are boundary adapters within Runtime interface — they translate runtime-specific protocol to/from Core. Policy lives in Core, not in hooks."
5. **Step 5 — Run FCIS invariant.** `pnpm test --filter=fcis-invariant` — must pass (no new `@mastra/*` imports).
6. **Step 6 — Run placement-manifest invariant.** `pnpm test --filter=placement-manifest` — must pass (3 new files enumerated; layering invariant holds after Step 2's resolution).
7. **Step 7 — Run fallow audit.** `pnpm exec fallow audit --gate new-only` (per Phase E Dead-Code Sweep Phase 4 CI guard). The 3 evaluator files are imported by hook adapters + MCP tool + tests — must report no new dead-code findings.
8. **Step 8 — Run full test suite.** `pnpm test` — all 1308 baseline + 30 new tests pass.
9. **Step 9 — Snapshot + manifest totals.** Update `plans/260628-2008-phase-e-evaluator-refactor/reports/phase4-verification.md` with: (a) baseline test count before refactor (measured in this step, not assumed), (b) post-refactor test count, (c) placement.yaml file count delta (30 → 33), (d) fallow audit report, (e) which layering-tension path (A or B) was taken.
10. **Step 10 — Git status review.** Confirm git diff shows: 6 new files (3 evaluators + 3 test files), 5 modified files (3 hooks + gate-tool.js + AGENTS.md + placement.yaml), 0 deleted files, +0 secrets/credentials/dotenv. If Path A: also `core/gate-logic-primitives.js` created. If Path B: also `placement-manifest.test.js` + `docs/placement.md` ADR line.

## Success Criteria

- [ ] `core/placement.yaml` enumerates the 3 new evaluator files with `role: evaluator`.
- [ ] `docs/placement.md` role-taxonomy table includes `evaluator` row + 3 file rows.
- [ ] `placement-manifest.test.js:101` shows `evaluator: ["primitive", "facade"]` (Path B edit).
- [ ] Inline ADR-style comment exists above `placement-manifest.test.js:101` citing the brainstorm + convergence addendum (per red-team B1).
- [ ] `docs/placement.md` `evaluator` row mentions BOTH `gate-logic.js` AND `inbound-state.js` (per red-team H1).
- [ ] `AGENTS.md` §1.1 carries the boundary-adapter one-liner.
- [ ] FCIS invariant passes.
- [ ] `fallow audit --gate new-only` reports no new dead-code findings on the 3 evaluator files.
- [ ] Full test suite green (1308 baseline + ~30 new = 1338 expected).
- [ ] **`__tests__/legacy-mcp/bash-gate-decision-visibility.test.js` passes** (per red-team C1 — 2 baseline tests at risk if `formatHookDecision` envelope is dropped).
- [ ] **`__tests__/legacy-mcp/gate-check-snapshot.test.js` passes** against `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json`.
- [ ] `plans/260628-2008-phase-e-evaluator-refactor/reports/phase4-verification.md` captures the verification log.
- [ ] `git status` shows no secrets, dotenv, or credential files.

## Risk Assessment

- **R4.1 — `placement-manifest.test.js` already has a closed-roles set; adding `evaluator` may need an ADR comment.** Per Phase E Mechanism A+B plan, the manifest test asserts role is in a closed set. If `evaluator` is NOT in the set, the test fails. Mitigation: read the test first; if `evaluator` is missing, add it with a comment citing brainstorm §3.2 + this Phase 4 step.
- **R4.2 — `AGENTS.md` §1.1 wording might conflict with §1.2 or §2.** Read the surrounding sections before editing. If §1.1 is being rewritten, prefer "appending a sentence" over "rewriting the bullet" — KISS.
- **R4.3 — Fallow audit flags the 3 evaluators as dead** if their consumers (hooks, gate-tool.js) aren't in fallow's entry-point list. Mitigation: Phase E Dead-Code Sweep Phase 1 added `hooks/legacy/**/*.js` + `tools/legacy/**/*.js` as `dynamicallyLoaded` entry points. Verify the config still covers them; if not, add explicit entries.
- **R4.4 — Test count regression.** If `pnpm test` reports fewer than 1308 baseline + 30 new = 1338, investigate immediately. Most likely cause: a test that depended on a hook file's specific log output (e.g., a `console.log` capture) now sees different output. Mitigation: search the test suite for `console.log` mocks on hook files.

## Decisions Locked in This Phase

| Question | Choice | Why |
|---|---|---|
| Manifest role for evaluators | `evaluator` (per brainstorm §3.2 taxonomy) | Role already defined in docs/placement.md; manifest was missing rows because no evaluators existed yet |
| AGENTS.md edit style | Append one sentence, do not rewrite bullet | R4.2 — KISS, smallest blast radius |
| Verification log location | `plans/<plan-dir>/reports/phase4-verification.md` | Matches Phase E Dead-Code Sweep convention (`reports/fallow/`) |
| Fallow entry-point coverage | Verify `hooks/legacy/**` + `tools/legacy/**` are in `.fallowrc.json`; add explicit entries if missing | R4.3 |
