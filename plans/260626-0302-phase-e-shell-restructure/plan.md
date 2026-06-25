---
title: "Phase E Plan 6: Mastra shell restructure (move shell files to mastra/ subdir)"
description: "Ships E.6 (NEW Rev 5): move shell files (server.js, create-loop-*.js, legacy-handler-adapter.js, schema-parity.js, schemas.js, workflows/, agents/, +2 manifests) from top-level of tools/learning-loop-mastra/ into a new mastra/ subdirectory. Updates ~31 external path references, the interface contract's mcp-client-config check, AGENTS.md §1.1, 4 test files' relative imports, and meta-state fingerprints. Makes Layer 2 (Mastra shell) physically first-class, matching the conceptual layering codified by Plan 1."
status: pending
priority: P2
branch: "phase-e/plan-6-shell-restructure"
tags: [phase-e, shell-restructure, mastra-shell, structure-promotion, e6]
blockedBy: [260625-1618-phase-e-interface-spec]
blocks: [260626-0930-phase-e-mastra-code-validation]
created: "2026-06-26T03:02:00.000Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 6: Mastra shell restructure

> **Source:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 5 § "Plan 6 (NEW Rev 5: phase-e-shell-restructure)" (lines 153, 561–581).
> **Predecessor plans:** Plan 1 (`plans/260624-2335-phase-e-foundation/plan.md`, DONE 2026-06-25, PR #15+#16) + Plan 2 (`plans/260625-1618-phase-e-interface-spec/plan.md`, DONE 2026-06-25, PR #17).
> **Successor plan:** Plan 4 (`plans/260626-0930-phase-e-mastra-code-validation/`) depends on Plan 6 — the contract `args` path must be the post-move path before Plan 4 validates against it.
> **Research reports:**
> - `plans/reports/researcher-260626-0306-GH-6-plan-6-research-mechanical-move-report.md` (mechanical move strategy + path inventory)
> - `plans/reports/researcher-260626-0306-GH-6-phase-e-plan-6-shell-restructure-risks-design-report.md` (risk + design alternatives)

## Overview

Plan 1 shipped the conceptual 3-layer architecture in AGENTS.md §1.1 (Core / Mastra shell / Runtime interface), and Plan 2 created the `interface/` directory (Layer 3). Plan 6 completes the picture by physically moving Layer 2's shell code (`server.js`, `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`, `schema-parity.js`, `schemas.js`, `workflows/`, `agents/`) into a dedicated `tools/learning-loop-mastra/mastra/` subdirectory. This makes the shell layer physically first-class — matching the diagram in the scope report and the §1.1 codification in AGENTS.md.

**Effort:** 1.0 day core + 0.5 day buffer = 1.5 days total (per scope report upper bound; verified lower bound by research). **Risk:** Medium — mechanical move + ~31 external ref updates + 4 test-file relative-import updates + 9 meta-state repoints; all changes land in one atomic commit per Plan 1 precedent.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [BaselineAndTests](./phase-01-baselineandtests.md) | Pending | Capture pre-move grep counts + write 5 regression guards (RED) |
| 2 | [InternalMove](./phase-02-internalmove.md) | Pending | `git mv` 9 file-groups (no internal import updates needed; relative paths preserved) |
| 3 | [ExternalRefUpdate](./phase-03-externalrefupdate.md) | Pending | Update ~31 external refs (configs, tests, hooks, docs, skill MDs); sibling guards flip GREEN |
| 4 | [ContractUpdate](./phase-04-contractupdate.md) | Pending | `interface/contract.js:94` literal updated; `node contract.js claude-code/droid/mastra-code` smoke tests |
| 5 | [VerifyAndChangeLog](./phase-05-verifyandchangelog.md) | Pending | `pnpm test` green + `meta_state_batch` (9 entries) + cold-cache delete + `meta_state_log_change` |

**TDD structure applied:** each phase writes the regression tests BEFORE the production change (RED), applies the minimal change (GREEN), runs the full namespace to confirm no regression. The 5 regression guards lock the post-Plan-6 invariants against silent regression.

## Acceptance Criteria

- [ ] `tools/learning-loop-mastra/mastra/` exists with `server.js`, `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`, `schema-parity.js`, `schemas.js`, `workflows/`, `agents/`, `workflows-manifest.json`, `agents-manifest.json` (the 11 moved items; 7 shell files + 2 subdirs + 2 manifests)
- [ ] `tools/learning-loop-mastra/` top-level has NO shell `*.js`/`*.cjs`/`*.mjs` files (excluding `storage.js` and `agent-manifest.json` which stay per D5)
- [ ] 4 test files with `../workflows/` and `../agents/` relative imports (`workflow-direct-parity.test.js`, `agent-direct-parity.test.js`, `agent-prompt-content.test.cjs`, `storage-parity.test.cjs`) are updated to `../mastra/workflows/` and `../mastra/agents/`
- [ ] `.mcp.json` + `.factory/mcp.json` + `package.json:gate:server` all reference `tools/learning-loop-mastra/mastra/server.js`
- [ ] `interface/contract.js:94` checks `endsWith("tools/learning-loop-mastra/mastra/server.js")` (single-path assertion; no transition window)
- [ ] `interface/CONTRACT.md`, `interface/README.md`, `interface/RUNTIME_ONBOARDING.md`, `docs/mcp-tool-schema-architecture.md`, `docs/project-changelog.md` all reference the new path (no pre-move path strings in these docs)
- [ ] `AGENTS.md §1.1` lines 20–22 say "Lives at `tools/learning-loop-mastra/mastra/`" (no "(top level)" prose)
- [ ] `AGENTS.md §1.1` has the path-invariant sentence locking against future regression
- [ ] `node tools/learning-loop-mastra/interface/contract.js claude-code` returns `{ok: true}` (exit 0)
- [ ] `node tools/learning-loop-mastra/interface/contract.js droid` returns `{ok: true}` (exit 0)
- [ ] `node tools/learning-loop-mastra/interface/contract.js mastra-code` returns `{ok: false, missing: [4 — hook-shim-set, mcp-client-config, skill-spec, settings-integration]}` (exit 1)
- [ ] All existing tests still pass (no regression; baseline captured at Phase 1 Step 1)
- [ ] `pnpm test` GREEN across all 13 test namespaces (12 existing + 1 new `phase-e-shell-restructure`)
- [ ] `meta_state_batch` repoint of 9 entries succeeds; entry #6's `applies_to.schemas` array preserves the 2 valid `learning-loop-mcp/` schema refs; `meta_state_check_grounding` returns `status: grounded` for all 9
- [ ] Entry #9 (`meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop`, status=stale) transitions to `status: active` via `meta_state_re_verify` after repoint (requires `META_STATE_VERIFY_EXEC=1`)
- [ ] Cold-cache (`records/meta/.cache/loop-describe-cold.json`) deleted; next cold-tier read regenerates with new paths
- [ ] `meta_state_log_change` filed with `change_target: plans/260626-0302-phase-e-shell-restructure/plan.md` (includes `workflows-manifest.json` + `agents-manifest.json` in `change_diff.added`/`change_diff.removed`)
- [ ] `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md` journal entry

## Dependencies

**Blocks:**
- `260626-0930-phase-e-mastra-code-validation` (Plan 4) — needs the contract `args` path to be the post-move path before Mastra Code's `config.json` registration is validated

**Does not block:**
- `260626-0930-phase-e-housekeeping` (Plan 3, parallel-able) — Plan 3 ships doc/process changes to AGENTS.md §11 + `workflow-intentional-skip.js` parity-pin label + schema cleanup. Both plans touch `workflow-intentional-skip.js` mechanically but the conflict is resolvable via rebase.
- `260701-0930-hardening-r2-lim3-lim4` (Plan 5, parallel) — Plan 6's `mastra/` directory helps the R2 write-gate (clean allowlist target); no direct coupling

## Resolved Design Decisions (applied to this plan)

| # | Decision | Source | Rationale |
|---|----------|--------|-----------|
| D1 | Single atomic commit (NOT split) | Plan 1 Phase 6 precedent; risks-design Q1 | `__tests__/with-mcp-server.js:128` is the default spawn entry for ~50+ tests; mid-PR split breaks the suite |
| D2 | `git mv` (NOT `mv + git add`) | risks-design Q1 | Preserves rename detection in git history |
| D3 | Hardcoded literal in `contract.js:94` (NO constant) | mechanical-move Q2 | Path appears in 5+ non-JS contexts (JSON/Markdown); constant would de-dup 2 occurrences while adding a file |
| D4 | Single-path `endsWith` (NO transition window) | risks-design Q4 | Atomic cutover; matches Plan 1's `no-core-legacy-refs.test.js` pattern |
| D5 | `storage.js` STAYS at top-level (NOT shell) | mechanical-move Q1(d) | It's the Mastra substrate (LibSQL); moving would conflate substrate with shell |
| D6 | `tools/legacy/` STAYS at top-level (NOT shell) | mechanical-move Q1(d) + risks-design Q10 | Layer 1 substrate for legacy tools; the scope report's diagram line 359 incorrectly shows `mastra/tools/legacy/` — clarify in PR body |
| D7 | 5-phase TDD breakdown | risks-design Q5 | Mirrors Plan 1 / Plan 2 conventions |
| D8 | New `phase-e-shell-restructure` GLOB | risks-design Q6 | Per-plan isolation; mirrors `phase-e-foundation` (Plan 1) and `interface-regression-guards` (Plan 2) |
| D9 | AGENTS.md path-invariant sentence | mechanical-move Q6(c) | Locks the post-Plan-6 invariant against future regression (parallel to Plan 1's FCIS invariant) |
| D10 | `meta_state_batch` (1 atomic call) for 9 entries | mechanical-move Q4(b); Plan 1 precedent | Mirrors Plan 1's 7-fingerprint repoint (`49d6f7b` commit) |
| D11 | Cold-cache DELETE after move | Plan 1 Phase 2 Step 7 | 29 stale matches; next cold-tier read regenerates |
| D12 | `meta_state_re_verify` for entry #9 (stale) | mechanical-move Q4(d) | Stale→active transition requires explicit re-verify |

## Open Items (from scope report, NOT resolved in this plan)

- **Q7 (Rev 5):** Plan 6 sequencing — **resolved: Plan 6 BEFORE Plan 4** (per scope report recommendation; risks-design Q1)
- **Q8 (Rev 5):** Plan 6 scope — `schemas.js` inclusion — **resolved: INCLUDE** (the shell dir should contain everything the shell needs to start, including its schema surface)
- **Q1–Q6 (Plan 6 scope):** all resolved by research reports
- **Scope report diagram error (line 359):** shows `mastra/tools/legacy/` which is wrong — `tools/legacy/` is NOT shell and stays at top level. Document in PR body; do NOT fix the diagram (it's a report, not source).

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Substring sed misses an external ref | High | Phase 1 baseline counts ALL external refs; Phase 3's `external-refs-updated.test.js` scans the 31 files; `pnpm test` is the safety net |
| R2 | `meta-state.jsonl` fingerprint hashes stale post-move | Medium | `meta_state_batch` (Plan 1 Phase 6 pattern) + cold-tier regression test catches misses |
| R3 | Cold-cache stale (`records/meta/.cache/loop-describe-cold.json` 29 matches) | Medium | DELETE the cache file post-move (Plan 1 Phase 2 Step 7 pattern) |
| R4 | `interface/contract.js:94` not updated in same PR | High (silent regression) | Phase 4 updates the contract; Phase 3's `mcp-config.test.js` fails if contract path is wrong |
| R5 | `package.json:19` `gate:server` script broken | Low | Phase 3 update |
| R6 | `legacy-cleanup.test.cjs:58-62` test data references old paths | Medium | Phase 3 update; the test asserts NEW paths |
| R7 | `__tests__/with-mcp-server.js:128` is single point of failure | High | The test suite is the verification; any typo causes spawn failure in EVERY test using `withMcpServer` → CI catches immediately |
| R8 | 1 stale meta-state entry (`meta-260618T0558Z`) needs `meta_state_re_verify` post-repoint | Medium | Phase 5 explicitly includes `meta_state_re_verify` call |
| R9 | `docs/journals/*` historical refs | Low | DO NOT update journals (per Plan 1's "Historical files" rule); `external-refs-updated.test.js` excludes `docs/journals/` |
| R10 | AGENTS.md §1.1 path-invariant sentence drift | Low | Regression guard test (Phase 1) enforces the invariant; doc + test = locked |
| R11 | 4 test files (`workflow-direct-parity.test.js`, `agent-direct-parity.test.js`, `agent-prompt-content.test.cjs`, `storage-parity.test.cjs`) use `../workflows/` and `../agents/` relative imports that break post-Phase 2 | High (broken suite) | Phase 2 Step 1.5 (NEW) bulk-seds these 4 files to `../mastra/workflows/` and `../mastra/agents/` |
| R12 | `docs/mcp-tool-schema-architecture.md` + `docs/project-changelog.md` contain pre-move path strings; not in Phase 3 FILES | High (Phase 1 test fails) | Phase 1 SEARCH_PATHS + Phase 3 FILES both include these 2 files; bulk sed updates them |
| R13 | `workflows-manifest.json` and `agents-manifest.json` are at TOP level, not inside their subdirs; `git mv workflows/` does NOT move them | High (manifests at wrong location) | Phase 2 Step 1.5 (NEW) explicitly `git mv`s the 2 manifests; Phase 1 `shell-files-in-mastra-dir.test.js` extended to assert their new location |
| R14 | AGENTS.md §1.1 prose says "(top level)" but sed only updates the path string; "(top level)" remains | High (Phase 1 test fails) | Phase 3 Step 0 (NEW) manually edits `AGENTS.md:21-22` to remove "(top level)" prose BEFORE running sed |
| R15 | `no-top-level-shell-files.test.js` matches `storage.js` which stays at top level per D5 | High (Phase 1 test fails post-move) | Test uses an explicit allowlist (`storage.js` + `agent-manifest.json` + the 2 manifests post-move) for exclusions |
| R16 | Phase 5 `meta_state_batch` op for entry #6 overwrites `applies_to.schemas` array, losing 2 valid `learning-loop-mcp/` schema refs | Medium (data loss) | Op includes all 3 schema refs in the array (1 mastra/ + 2 learning-loop-mcp/) |
| R17 | Top-level `*.cjs` and `*.mjs` files (none today) not covered by Phase 1 guard #1 | Low (future regression) | Widen the find pattern: `\( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \)` |

## Verification (how to test the change is right)

1. `ls tools/learning-loop-mastra/mastra/` shows `server.js` + `create-loop-*.js` + `legacy-handler-adapter.js` + `schema-parity.js` + `schemas.js` + `workflows/` + `agents/`.
2. `find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js" -type f` returns 0 matches.
3. `grep -c "tools/learning-loop-mastra/server.js" tools/learning-loop-mastra/interface/contract.js` returns 0 (the literal is updated).
4. `grep -rln "tools/learning-loop-mastra/server.js\|tools/learning-loop-mastra/create-loop\|tools/learning-loop-mastra/legacy-handler\|tools/learning-loop-mastra/schema-parity\|tools/learning-loop-mastra/schemas\.js" tools/learning-loop-mastra/` (excluding `docs/journals/` + the regression test files) returns 0 matches.
5. `node tools/learning-loop-mastra/interface/contract.js claude-code` returns `{ok: true, missing: []}` (exit 0).
6. `node tools/learning-loop-mastra/interface/contract.js droid` returns the same shape (exit 0).
7. `node tools/learning-loop-mastra/interface/contract.js mastra-code` returns `{ok: false, missing: [4]}` (exit 1).
8. `node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js` passes all 5 regression guards.
9. `pnpm test` GREEN across all 13 namespaces (12 existing + 1 new `phase-e-shell-restructure`).
10. `meta_state_check_grounding` on all 9 repointed entries → `status: grounded, hash match`.
11. `meta_state_query_drift --filter "evidence_code_ref~tools/learning-loop-mastra/(server.js|create-loop-|legacy-handler|schema-parity|schemas\.js)"` returns 0 results.
12. `ls records/meta/.cache/loop-describe-cold.json` returns ENOENT (cache deleted post-move).
13. `git log --follow tools/learning-loop-mastra/mastra/server.js` shows the rename history (git preserves `R` records via `git mv`).

## Red Team Review

### Session — 2026-06-26

**Findings:** 6 Critical, 8 High, 6 Medium.
**Reviewer:** Failure Mode Analyst.
**Disposition:** 6 Critical + 8 High applied with concrete fixes; 6 Medium applied with notes; 0 rejected (all findings had codebase evidence).

### Findings Table

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| F1 | Phase 1 SEARCH_PATHS includes `docs/mcp-tool-schema-architecture.md`; Phase 3 FILES does NOT — test fails post-Phase 3 | Critical | Accept | Phase 3 FILES + Phase 1 SEARCH_PATHS |
| F2 | Plan claim "internal relative imports stay valid" is FALSE; 4 test files (`workflow-direct-parity.test.js`, `agent-direct-parity.test.js`, `agent-prompt-content.test.cjs`, `storage-parity.test.cjs`) use `../workflows/` and `../agents/` and break post-Phase 2 | Critical | Accept | Phase 2 Step 5 (NEW) bulk-sed + Phase 1 test #6 (`test-relative-imports.test.js`) |
| F3 | Plan 6 architecture diagram does NOT move `workflows-manifest.json` and `agents-manifest.json` (they're at top level, not inside subdirs) — `git mv workflows/` doesn't move them | Critical | Accept | Phase 2 Step 2 (NEW) explicit `git mv` for both manifests; Phase 1 test extended |
| F4 | `agents-md-layer-locations.test.js` fails: sed updates path but "(top level)" prose stays in `AGENTS.md:21` | Critical | Accept | Phase 3 Step 0 (NEW) manual edit of `AGENTS.md:21-22` BEFORE sed |
| F5 | Phase 5 `meta_state_batch` op for entry #6 OVERWRITES `applies_to.schemas` array (3 → 1), losing 2 valid `learning-loop-mcp/` schema refs | Critical | Accept | Phase 5 Step 4 op for entry #6 includes all 3 schema refs |
| F6 | Phase 1 `no-top-level-shell-files.test.js` matches `storage.js` (which stays at top level per D5) | Critical | Accept | Test uses explicit allowlist (`storage.js`, `agent-manifest.json`) |
| H1 | Phase 3 FILES omits `docs/project-changelog.md` | High | Accept | Added to FILES + SEARCH_PATHS |
| H2 | Phase 1 regression guard #1 doesn't cover `*.cjs`/`*.mjs` files | High | Accept | Find pattern widened: `\( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \)` |
| H3 | Plan 6 architecture diagram does NOT move JSON manifests (same as F3 for `agents-manifest.json`) | High | Accept (covered by F3) | Same as F3 |
| H4 | Phase 3 FILES does NOT include `__tests__/phase-e-shell-restructure/` self-reference | High | Accept (note only) | Filter `!line.includes("phase-e-shell-restructure/")` is defensive only |
| H5 | `tools/learning-loop-mastra/agents-manifest.json` referenced in `MASTRA_AGENT_MODEL.md` is NOT updated | High | Accept | Added `MASTRA_AGENT_MODEL.md` to FILES + 8th sed pattern for `agents-manifest.json` |
| H6 | Phase 5 `meta_state_re_verify` for entry #9 requires `META_STATE_VERIFY_EXEC=1` | High | Accept | Phase 5 Step 5 precondition added |
| H7 | `core/runtime-agnostic-checklist.js` references `agent-manifest.json` (NOT moved) | High | Accept (note only) | Out-of-scope; future move must update this file |
| H8 | Plan 6 comment says "Active globs (9)" — already out of date; runner has 12 active GLOBs | High | Accept | Phase 1 Step 2 updates header to "Active globs (12). Plan 6 adds phase-e-shell-restructure (total 13)" |
| M1 | `__tests__/phase-e-shell-restructure/` test files not yet created | Medium | Accept (note only) | Operator should verify 6 tests FAIL before Phase 2 |
| M2 | Plan 6 test counts "~1189" baseline unverified | Medium | Accept | Acceptance criterion updated: "baseline captured at Phase 1 Step 1" |
| M3 | Cold-cache delete target verified | Medium | None | Delete is safe (gitignored) |
| M4 | `__tests__/legacy-cleanup.test.cjs` may have other path refs (line 89) | Medium | Accept | Phase 2 Step 6 verifies line 89 |
| M5 | Phase 5 `meta_state_log_change` operator-role gate not pre-verified | Medium | Accept | Per Plan 2 finding A8: tool invocable without operator-mode for ship-time use |
| M6 | `pnpm test` namespace coverage for `__tests__/interface/runtimes-pass-contract.test.js` | Medium | Accept (note only) | Phase 4 verifies manually via `node --test` |
| M7 | Plan 6's "~25 external refs" claim approximate | Medium | Accept | Count captured in `reports/pre-move-baseline.json` (now ~31 after H1 fix) |
| M8 | `meta-state.jsonl` IS git-tracked (concern mitigated) | Medium | None | `git revert` works fully |

### Criticals Applied — Concrete Changes

**F1 fix (Phase 3):** Added `docs/mcp-tool-schema-architecture.md` + `docs/project-changelog.md` to Phase 3 FILES (Step 2). Both files now updated by the bulk sed.

**F2 fix (Phase 2):** New Step 5 bulk-seds `"\.\./workflows/` → `"../mastra/workflows/` and `"\.\./agents/` → `"../mastra/agents/` in 4 test files (16+ imports in `workflow-direct-parity.test.js`, 3 in `agent-direct-parity.test.js`, 3 in `agent-prompt-content.test.cjs`, 2 in `storage-parity.test.cjs`). New Phase 1 test #6 `test-relative-imports.test.js` locks the invariant.

**F3 fix (Phase 2):** New Step 2 explicitly `git mv`s `workflows-manifest.json` + `agents-manifest.json` (they are top-level siblings, not children of `workflows/`/`agents/`). Phase 1 test extended with new assertion for the 2 manifests.

**F4 fix (Phase 3):** New Step 0 manually edits `AGENTS.md:21-22` to remove "(top level)" prose BEFORE running sed. Also removes `tools/` from the file list (not shell) and adds `legacy-handler-adapter.js` + `schema-parity.js` + `schemas.js`.

**F5 fix (Phase 5):** Entry #6's `meta_state_batch` op explicitly preserves all 3 schema refs in `applies_to.schemas` array (2 unchanged `learning-loop-mcp/` + 1 repointed `mastra/schema-parity.js`).

**F6 fix (Phase 1):** `no-top-level-shell-files.test.js` uses explicit allowlist (`storage.js` + `agent-manifest.json`) to exclude non-shell files. Also widened find pattern to cover `*.cjs`/`*.mjs` per H2.

### Whole-Plan Consistency Sweep

After applying accepted findings, re-read `plan.md` and every `phase-*.md`. Reconciled:
- ~25 external refs → ~31 (H1: 2 docs added; H5: MASTRA_AGENT_MODEL.md added; F3: 2 manifests added to sed patterns)
- 5 regression guards → 6 (F2: added `test-relative-imports.test.js`)
- 9 moved items → 11 (F3: 2 manifests added to move list)
- Header comment "Active globs (9)" → "Active globs (12). Plan 6 adds phase-e-shell-restructure (total 13)" (H8)
- Internal imports unchanged → 4 test files updated (F2)
- "9 meta-state repoints" → "9 entries / 13 field updates" preserved (verified by research)

No unresolved contradictions. Plan is ready for validation.

---

## References

- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (lines 153, 339–407, 458, 487, 561–581)
- Research reports:
  - `plans/reports/researcher-260626-0306-GH-6-plan-6-research-mechanical-move-report.md` (mechanical move strategy)
  - `plans/reports/researcher-260626-0306-GH-6-phase-e-plan-6-shell-restructure-risks-design-report.md` (risks + design alternatives)
- Red-team report:
  - `plans/reports/red-team-260626-0302-GH-6-plan-6-failure-modes-report.md` (6 Critical + 8 High + 6 Medium; all applied)
- Predecessor plans:
  - `plans/260624-2335-phase-e-foundation/plan.md` (shipped; FCIS invariant + 3-layer framing)
  - `plans/260625-1618-phase-e-interface-spec/plan.md` (shipped; contract + validator + 5 requirements)
- Codebase references:
  - `AGENTS.md §1.1` lines 13–42 (3-layer framing; lines 20–22 are the shell location to update)
  - `tools/learning-loop-mastra/interface/contract.js:94` (path source-of-truth)
  - `tools/learning-loop-mastra/__tests__/with-mcp-server.js:128` (default spawn entry for ~50+ tests)
  - `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs:58-62` (asserts top-level paths; MUST update)
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (16+ relative imports of `../workflows/`; MUST update)
  - `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` (3 relative imports of `../agents/`; MUST update)
  - `tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs` (3 relative imports of `../agents/`; MUST update)
  - `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (2 relative imports of `../workflows/`; MUST update)
  - `tools/scripts/run-pnpm-test-namespaced.mjs:18,29-42` (12 existing GLOBs + header "Active globs (9)" out of date; add 13th)
  - `meta-state.jsonl` (9 entries / 13 field updates)
  - `.mcp.json:5`, `.factory/mcp.json:5`, `package.json:19` (runtime configs)
  - `__tests__/mcp-config.test.js:24-29` (asserts `.mcp.json` shape; MUST update)
  - `docs/mcp-tool-schema-architecture.md:8,10,77,261,379-383` (5+ shell-path refs; F1 fix)
  - `docs/project-changelog.md:75,116,132,134,227` (5+ shell-path refs; H1 fix)
  - `.claude/coordination/MASTRA_AGENT_MODEL.md:70` (`agents-manifest.json` ref; H5 fix)
  - `tools/learning-loop-mastra/workflows-manifest.json` + `agents-manifest.json` (at top level pre-Plan-6; F3 fix)

---