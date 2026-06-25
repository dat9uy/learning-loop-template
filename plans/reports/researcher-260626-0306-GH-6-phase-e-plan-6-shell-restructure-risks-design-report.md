# Phase E Plan 6 Research: Risks, Design Alternatives, Integration Points

**Type:** phase-e-plan-6-research (advisory; design + risk evaluation)
**Slug:** phase-e-plan-6-shell-restructure
**Date:** 2026-06-25 20:08 UTC
**Status:** research-only (no files modified)
**Aligned to:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 5 § "Plan 6 (NEW Rev 5: phase-e-shell-restructure)"
**Predecessor plans:** `plans/260624-2335-phase-e-foundation/plan.md` (DONE 2026-06-25), `plans/260625-1618-phase-e-interface-spec/plan.md` (DONE 2026-06-25)

---

## Scope reminder

Goal of Plan 6: move shell files from `tools/learning-loop-mastra/` top-level into `tools/learning-loop-mastra/mastra/`. Makes Layer 2 (Mastra shell) physically first-class.

**Files to MOVE (top-level → `mastra/`):**
1. `server.js`
2. `create-loop-tool.js`
3. `create-loop-workflow.js`
4. `create-loop-agent.js`
5. `legacy-handler-adapter.js`
6. `schema-parity.js`
7. `schemas.js`
8. `workflows/` (10 files; 9 workflows + `workflow-intentional-skip.js` parity-pin)
9. `agents/` (5 files + `instructions/` + `load-agents-manifest.js`)

**External references that must update (per scope report § Rev 5 Change B):** ~25 files (runtime configs, interface contract, tests, hooks, docs, skill MDs).

**Internal imports do NOT need updating** — relative paths from within `mastra/` stay valid (`./create-loop-tool.js`, `./core/...`, `./agents/load-agents-manifest.js`).

---

## Q1. Plan 6 vs Plan 4 sequencing alternatives

### (a) Cost of Plan 6 AFTER Plan 4

Plan 4 (Mastra Code validation) creates `.mastracode/coordination/hooks/*.cjs` and registers `mcpServers.learning-loop` in `.mastracode/config.json` pointing at `tools/learning-loop-mastra/server.js` (per scope report line 124 E.5 bullet). Plan 4's acceptance gate is `node tools/learning-loop-mastra/interface/contract.js mastra-code` → `{ok: true}`.

If Plan 6 ships AFTER Plan 4:

| # | Cost | Magnitude | Evidence |
|---|------|-----------|----------|
| 1 | Contract `args` check must be updated twice | 1 line in `interface/contract.js:94` (current `endsWith("tools/learning-loop-mastra/server.js")`) | `tools/learning-loop-mastra/interface/contract.js:94` |
| 2 | Plan 4's `.mastracode/config.json` registration must be re-validated against new path | 1 PR cycle; ~30 min regression rerun | `.mcp.json:5`, `.factory/mcp.json:5` are template for `.mastracode/config.json` |
| 3 | Plan 4's `__tests__/interface/runtimes-pass-contract.test.js` (created in Plan 2) must be re-checked | 5 min; the test reads `.mcp.json` directly (`tools/learning-loop-mastra/__tests__/mcp-config.test.js:24-29`) — auto-fails when path changes | `tools/learning-loop-mastra/__tests__/mcp-config.test.js:24-29` |
| 4 | Re-validate meta-state `evidence_code_ref` fingerprints for `.mastracode` config creation | 2nd `meta_state_refresh_fingerprint` batch for Mastra Code paths | `meta-state.jsonl` line 50 pattern (29 known shell-path `evidence_code_ref` entries; +1 per Mastra Code config) |
| 5 | AGENTS.md §1.1 re-edited to reflect new state, then re-edited again if Plan 6 ships later | 2 doc edits | `AGENTS.md:20-22` (current "Lives at `tools/learning-loop-mastra/` (top level)") |
| 6 | Documentation drift window: between Plan 4 ship and Plan 6 ship, AGENTS.md + the post-Phase-E diagram are inconsistent | ~1 week of "Mastra shell lives at top-level" in docs while code lives at `mastra/` | n/a |

### (b) Cost of Plan 6 BEFORE Plan 4

Plan 6 stabilizes the path. Plan 4 exercises the post-move layout. Single source-of-truth for the path in `interface/contract.js`.

| # | Cost | Magnitude | Evidence |
|---|------|-----------|----------|
| 1 | Plan 6 updates `interface/contract.js:94` once | 1 line | `contract.js:94` |
| 2 | Plan 4 registers `.mastracode/config.json` with the new path directly | 1 PR | scope report line 124 |
| 3 | `mcp-config.test.js` updated once (Plan 6) and validated | 1 PR | `__tests__/mcp-config.test.js:24-29` |
| 4 | `meta_state_log_change` filed once per Plan 6 ship | 1 entry | per Plan 1 / Plan 2 convention |
| 5 | Cold-cache invalidated once | 1 `rm records/meta/.cache/loop-describe-cold.json` | mirrors Plan 1 Phase 2 Step 7 |

### (c) Alternative orderings

| Alternative | Description | Verdict |
|-------------|-------------|---------|
| Plan 6 + Plan 4 in same PR | Bundle the move + Mastra Code registration | **Reject** — different review focus (mechanical move + config); Plan 4 needs the contract to exist as stable ground truth (Plan 2 ship prerequisite); Plan 4's red-team review will re-litigate the path |
| Plan 4 first with documented expectation of cleanup | Accept the 1-PR re-validation cost | **Reject** — duplicates the contract edit, pollutes 2 PRs with the same path knowledge, breaks the "ship then close" pattern used in Plans 1+2 |
| Plan 6 first (current scope report recommendation) | One source-of-truth for the path; Plan 4 uses post-move layout | **Accept** |
| Plan 6 + Plan 4 in different PRs but co-authored | Same as Plan 6 first | **Accept (no change)** |

### (d) Recommendation

**Plan 6 BEFORE Plan 4.** Rationale:
1. **Single source-of-truth.** The contract `args` check (Plan 2) and the Mastra Code `config.json` (Plan 4) both hardcode the path. Shipping Plan 6 first means the path is updated in one place; Plan 4 inherits the new path.
2. **Pattern match with Plan 1 / Plan 2.** Plan 1 set up the FCIS invariant; Plan 2 wrote the contract against the post-Plan-1 state. Plan 6 sets up the post-move shell; Plan 4 validates against it. The pattern is "foundation before spec; spec before validation."
3. **Smaller red-team surface.** Plan 4's red-team reviewers (per Plan 2's 18-finding pattern: `260625-1618-phase-e-interface-spec/plan.md` lines 153-180) will independently check the contract path. If the path is unstable, the reviewer flags it as Critical; if stable, no noise.
4. **Plan 4's smoke test (`createMastraCode({ configDir })`) depends on a stdio-resolvable path.** Post-Plan-6, `.mastracode/config.json` registers `args: ["tools/learning-loop-mastra/mastra/server.js"]`; the file exists at that location; smoke test passes cleanly.

---

## Q2. Plan 6 vs Plan 1 split

### (a) Could Plan 1 have done the move in one go?

**Yes, mechanically.** Plan 1 (`260624-2335-phase-e-foundation`) already touched the file layout (rename `core/legacy/` → `core/`) and AGENTS.md §1.1 (3-layer framing). The Plan 1 Plan-doc explicitly deferred the move (`phase-02-renameandrefs.md` line 23: "The shell files at `tools/learning-loop-mastra/` ... are unaffected — they are at the top level, not under `core/`").

Pros of bundling in Plan 1:
- 1 PR instead of 2 (less review overhead)
- AGENTS.md §1.1 line 20-22 would have shipped with the physical layer, not the conceptual one
- Fewer cross-cutting concerns over time

Cons of bundling in Plan 1:
- Plan 1's red-team scope (5 critical findings applied, per `260624-2335-phase-e-foundation/plan.md` line 120) was already complex (FCIS invariant + 3-layer framing + fingerprint repoint). Adding ~25 external file refs to the move would have exceeded Plan 1's 0.5d budget.
- The `mastra/` rename would have collided with the `core/legacy/` rename in scope (two parallel file moves = 2× red-team complexity, 2× rollback risk).
- The Plan 1 reviewer focus was "rename + invariant correctness" (per scope report line 148). Adding "shell layer physical layout" would have diluted the focus.

### (b) Was the split correct?

**Yes.** Plan 1 = foundation (invariant + discipline doc + 3-layer framing). Plan 6 = structure (physical layer promotion). The split honors the meta-pattern from scope report line 146: "every phase item is either *foundation*, *structure*, *housekeeping*, *validation*, or *hardening*."

### (c) Should the two plans have been a single plan with the move as a Phase?

**No.** Plan 1 shipped 2026-06-25 (PR #15 + #16 deny-list follow-up). The Plan 1 plan-body (line 22) explicitly says "After this plan ships, the codebase has a single, authoritative `core/` directory" — i.e., Plan 1's scope was bounded to Core. Adding the shell move to Plan 1 would have violated the "single source of truth for review focus" rule.

### (d) Future implication: per-plan split granularity

**Per-plan split is the right granularity when the layer promotion surfaces a NEW first-class concept.** The current 3-layer split (Core / Mastra shell / Runtime interface) is now physically complete:
- Core: `tools/learning-loop-mastra/core/` (Plan 1)
- Mastra shell: `tools/learning-loop-mastra/mastra/` (Plan 6)
- Runtime interface: `tools/learning-loop-mastra/interface/` (Plan 2)

If a 4th first-class structure surfaces (e.g., substrate, observability, identity), the same pattern applies: 1 plan per structure with TDD phases. YAGNI: do not pre-emptively merge plans.

---

## Q3. Plan 3 (Housekeeping) interaction

### (a) Does Plan 3 touch any shell file?

**Partially.** Plan 3's 3 items (per scope report lines 121-123):
- **E.2** (`AGENTS.md §11`): does NOT touch shell files. Process-norm doc only.
- **E.3** (parity-pin label): touches `tools/learning-loop-mastra/workflows/workflow-intentional-skip.js`. **This is a shell file** (it will move to `mastra/workflows/` in Plan 6). The E.3 change is a 1-line comment addition per scope report E.3 bullet.
- **E.4** (schema rot cleanup): touches `tools/learning-loop-mastra/core/legacy/schema-descriptions.yaml`. **This is a Core file**, NOT a shell file. But: per Plan 1, the `core/legacy/` dir is gone (renamed to `core/`). E.4's target is now stale. **This is a pre-existing scope bug** in Plan 3's scope report line 123 — should be `tools/learning-loop-mastra/core/schema-descriptions.yaml` (post-Plan-1) OR `docs/schemas.md` should subsume it.

### (b) Does Plan 3's `workflow-intentional-skip.js` parity-pin label touch a shell file?

**Yes.** Per scope report E.3: "Add a one-line comment to `workflows/workflow-intentional-skip.js` flagging it as a parity-test pin (not legacy)." Post-Plan-6, this file lives at `mastra/workflows/workflow-intentional-skip.js`.

### (c) Cross-contamination risk

| Order | Risk | Severity |
|-------|------|----------|
| Plan 3 ships first | Plan 3 adds the parity-pin comment to `workflows/workflow-intentional-skip.js`. Plan 6 then `git mv`s the file → comment preserved by git. **No conflict.** | None |
| Plan 6 ships first | Plan 6 moves `workflows/` to `mastra/workflows/`. Plan 3 then adds the parity-pin comment to `mastra/workflows/workflow-intentional-skip.js`. **No conflict.** | None |
| Parallel | Both plans touch the same file simultaneously. Merge conflict on the comment line. | Medium (resolvable: rebase + re-apply comment) |

### (d) Recommendation

**Plan 3 and Plan 6 can ship in either order or in parallel.** Both work; the file-level conflict on `workflow-intentional-skip.js` is mechanical and resolvable. **Recommend: Plan 3 first** because:
1. Plan 3 is 1.5h of doc changes (per scope report line 152); ship it as a fast-feedback PR before the heavier Plan 6 (~1-1.5d).
2. Plan 3's `workflow-intentional-skip.js` comment lands on the pre-move path; Plan 6's `git mv` preserves it.
3. If Plan 6 ships first and Plan 3 has to update AGENTS.md §11 + the parity-pin label + the schema cleanup in the same PR, the review surface expands.

---

## Q4. Interface contract re-design

### (a) Hardcoded literal vs configurable path

Current code (`tools/learning-loop-mastra/interface/contract.js:94`):
```javascript
&& entry.args.some((a) => typeof a === "string" && a.endsWith("tools/learning-loop-mastra/server.js"));
```

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Hardcoded literal (current) | KISS; matches `RUNTIMES` const pattern; no env var indirection | Plan 6 needs a code change to update the path | **Keep for now** |
| Configurable via `MASTRA_ENTRY_PATH` env var | Decouples contract from path; allows forks; test-friendly | Adds env var surface (must document; must validate); diverges from `RUNTIMES` pattern; opens "what if env var is unset?" failure mode | **Reject (YAGNI)** |
| Computed from `RUNTIMES[runtimeId].mcp_config` | Single source-of-truth; no duplication | `RUNTIMES` is the runtime-side config layout; the contract's `args` is the OUTCOME of that layout (the runtime's `args` string); would create a circular reference | **Reject (over-engineering)** |

**Recommendation:** keep hardcoded literal. Plan 6 changes it to `endsWith("tools/learning-loop-mastra/mastra/server.js")`. The contract is a validator, not a configurator; its job is to assert the canonical post-Plan-6 state.

### (b) Substring match vs exact match

Current: `endsWith(...)` is a substring match on the suffix.

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `endsWith(...)` (current) | Forgiving; supports relative paths from various cwds; matches the runtime's `args: ["tools/learning-loop-mastra/mastra/server.js"]` (the runtime uses a project-root-relative path, so the literal IS the suffix) | Could match `evil-tools/learning-loop-mastra/mastra/server.js` (suffix collision) — but this is gated by the runtime config file location check, so the suffix match is safe | **Keep** |
| Exact match (`===`) | Strict; no collision | Breaks if a future runtime uses an absolute path or a different cwd; current runtimes use project-root-relative | **Reject (breaks real runtimes)** |
| Regex match | Flexible | Overkill for a suffix check | **Reject (YAGNI)** |

**Recommendation:** keep `endsWith`. The suffix is the canonical post-Plan-6 entry path; the contract is gated by the `mcpServers.learning-loop` entry presence check (line 91) before the `args` suffix is checked.

### (c) Test scenarios accepting BOTH old and new paths during transition

**YAGNI: do not accept both.** Reasons:
1. **Atomic cutover.** Plan 6 is one PR. There is no transition window where both paths coexist (unlike Plan 1's `core/legacy/` rename, where the substring `core/legacy/` could appear in historical journals — but that's an exclusion, not an acceptance).
2. **Drift risk.** Accepting both paths in the contract test creates a 2-state machine that requires a future "remove old path" PR.
3. **Pattern from Plan 1.** Plan 1's `no-core-legacy-refs.test.js` (in `tools/learning-loop-mastra/__tests__/phase-e-foundation/`) asserts the NEW state (0 `core/legacy` references); it does NOT accept both old and new. Same pattern for Plan 6.

**Recommendation:** Plan 6 updates the contract path to the new location in one PR. The test fails until the path is updated; it passes once updated. No transition window.

### (d) Closeout criterion for "stable" contract

The contract is "stable" when:
1. The `args` path string is fixed in `interface/contract.js:94` (no env var, no config).
2. The `interface/__tests__/contract.test.js` golden tests (5 per scope report line 50) assert the new path.
3. The `__tests__/interface/runtimes-pass-contract.test.js` (real-runtime smoke test) asserts `node contract.js claude-code` returns `{ok: true, missing: []}` against the post-Plan-6 `.mcp.json` and `.factory/mcp.json`.
4. Plan 4's `.mastracode/config.json` registration uses the new path; `node contract.js mastra-code` returns `{ok: true}`.

---

## Q5. Phase ordering for Plan 6

Recommended 5-phase breakdown following Plan 1 / Plan 2 patterns:

### Phase 1: BaselineAndTests
- **Scope:** capture pre-move shell-path baseline (count of files referencing `tools/learning-loop-mastra/server.js` etc.). Write regression guards as RED tests.
- **Files modified:** none (only test files created).
- **Tests added:**
  - `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js` — asserts `find tools/learning-loop-mastra/ -maxdepth 1 -name '*.js' -type f` returns empty (or only non-shell files like `storage.js`, `agent-manifest.json`, `agents-manifest.json`, `workflows-manifest.json`, `data/`, `scripts/`, `scout/`).
  - `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js` — asserts each moved file exists at `mastra/<file>`.
  - `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` — scans the 25 external files (per scope report § Rev 5 Change B) and asserts each shell-path reference is updated.
  - `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/agents-md-layer-locations.test.js` — asserts `AGENTS.md §1.1` line 20-22 says "Lives at `tools/learning-loop-mastra/mastra/`" (not "top level").
- **Gate:** RED — tests fail because shell files are still at top level.

### Phase 2: InternalMove
- **Scope:** `git mv` the 9 file-groups from top-level → `mastra/`. Update internal imports inside the moved files (none needed — relative paths stay valid).
- **Files modified:** the 9 file-groups via `git mv`.
- **Tests modified:** Phase 1's `shell-files-in-mastra-dir.test.js` flips to GREEN; `no-top-level-shell-files.test.js` flips to GREEN.
- **Gate:** GREEN on the move-related tests; pre-commit hook may STILL fail (external refs not updated yet).

### Phase 3: ExternalRefUpdate
- **Scope:** update the 25 external files that reference the moved paths.
- **Files modified (per grep inventory):**

| File | Lines | What changes |
|------|-------|--------------|
| `.mcp.json` | line 5 | `args: ["tools/learning-loop-mastra/server.js"]` → `args: ["tools/learning-loop-mastra/mastra/server.js"]` |
| `.factory/mcp.json` | line 5 | same |
| `package.json` | line 19 (`gate:server` script) | `node tools/learning-loop-mastra/server.js` → `node tools/learning-loop-mastra/mastra/server.js` |
| `AGENTS.md` | line 20-22, 57, 86 | 3 references updated |
| `README.md` | line 48 | 1 reference updated |
| `CLAUDE.md` | line 6 | 1 reference updated |
| `tools/learning-loop-mastra/agents-manifest.json` | line 3 (description string) | 1 reference updated (cosmetic) |
| `tools/learning-loop-mastra/__tests__/with-mcp-server.js` | line 128 | `join(projectRoot, "tools/learning-loop-mastra/server.js")` |
| `tools/learning-loop-mastra/__tests__/mutex-scope.test.js` | line 17 | same |
| `tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs` | line 17 | same |
| `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs` | lines 58-62, 73-74 | file-path string literals in test data |
| `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` | line 12 | `join(...)` |
| `tools/learning-loop-mastra/__tests__/mcp-config.test.js` | lines 24, 28 | assertion + fixture |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-churn-regression.test.js` | lines 29, 53, 89, 107 | 4 `evidence_code_ref` strings |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs` | lines 22, 27 | `join(...)` |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` | lines 35, 209, 289 | `join(...)` + 2 `evidence_code_ref` |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/scout-budget-estimator.test.js` | line 48 | prompt string |
| `tools/learning-loop-mastra/interface/CONTRACT.md` | line 21 | path string in spec |
| `tools/learning-loop-mastra/interface/README.md` | line 42 | path string in spec |
| `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` | lines 21, 55 | 2 worked-example strings |
| `tools/learning-loop-mastra/interface/contract.js` | line 94 | `endsWith("tools/learning-loop-mastra/server.js")` → `endsWith("tools/learning-loop-mastra/mastra/server.js")` |
| `tools/learning-loop-mastra/interface/__tests__/contract.test.js` | line 42 | test fixture |
| `docs/mcp-tool-schema-architecture.md` | lines 8-10, 77, 261, 379-383 | 8 doc references |
| `docs/mcp-server-restart-protocol.md` | lines 3, 21, 55 | 3 doc references |
| `.claude/skills/coordination-gate/SKILL.md` | line 14 | 1 reference |
| `.factory/skills/coordination-gate/SKILL.md` | line 14 | same |
| `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` | line 177 | `evidence_code_ref` string |
| `.factory/hooks/loop-surface-inject.cjs` | line 166 | `evidence_code_ref` string |
| `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` | lines 19, 21 | `join(...)` + fixture |
| `meta-state.jsonl` | lines 50, 138, 149, 150, 159, 164, 167, 179 (8 entries; 10 shell-path matches total per grep) | `evidence_code_ref` + `change_target` strings |
| `records/meta/.cache/loop-describe-cold.json` | multiple lines (29 matches per grep) | `evidence_code_ref` + `change_target` — DELETE and regenerate, per Plan 1 pattern |

- **Tests modified:** `external-refs-updated.test.js` flips to GREEN.
- **Gate:** `pnpm test` GREEN (the pre-commit hook re-runs all namespaces).

### Phase 4: ContractUpdate
- **Scope:** update `interface/contract.js:94` to use the new path. Re-run `interface/__tests__/contract.test.js` against the updated `.mcp.json` and `.factory/mcp.json`.
- **Files modified:** `tools/learning-loop-mastra/interface/contract.js:94`.
- **Tests modified:** the 5 regression guards in `__tests__/interface/` (per Plan 2).
- **Gate:** `node interface/contract.js claude-code` → `{ok: true, missing: []}`; same for `droid` and `mastra-code` (the latter still missing 4 requirements, but path is updated).

### Phase 5: Verify + ChangeLog
- **Scope:** full `pnpm test`; `meta_state_log_change` filed; cold-cache invalidated; AGENTS.md §1.1 line 20-22 finalized.
- **Files modified:** none.
- **Tests modified:** none.
- **Gate:** all 13 GLOB entries pass (12 current + 1 new `phase-e-shell-restructure`); `pnpm test` GREEN; meta-state delta filed.

### (c) TDD structure per phase

Per Plan 1 / Plan 2 pattern (per `260625-1618-phase-e-interface-spec/plan.md` line 39):
- Each phase writes the test BEFORE the implementation (RED).
- Applies the minimal change (GREEN).
- Runs the full namespace to confirm no regression.

### (d) Critical-path / blockers

| Blocker | Impact | Mitigation |
|---------|--------|------------|
| `mcp-config.test.js:24-29` fails on path change | Pre-commit hook fails; cannot merge | Update the test fixture IN THE SAME PHASE as the `.mcp.json` change (Phase 3) |
| `meta-state.jsonl` fingerprint hashes stale post-move | Cold-tier regression test fails (`__tests__/legacy-mcp/cold-tier-regression.test.js`) | Use `meta_state_batch` (per Plan 1 Phase 6 pattern) to repoint + refresh in one batch op |
| Cold-cache stale (`records/meta/.cache/loop-describe-cold.json` 29 matches) | Cold-tier reads return stale paths | DELETE the cache file (per Plan 1 Phase 2 Step 7 pattern); next cold-tier read regenerates |
| 4 evidence_code_ref matches in `cold-session-churn-regression.test.js` + 3 in `cold-session-discoverability.test.cjs` | Test files reference the old path in test fixtures | Update test fixtures in Phase 3; the test data is a STRUCTURAL ASSERTION, not a fingerprint, so no `meta_state_refresh_fingerprint` needed |
| `legacy-cleanup.test.cjs:58-62, 73-74` references old paths in test data | Test assertions fail | Update the test data (the test asserts "imports resolve to the new paths"; post-Plan-6 the new paths are `mastra/...`) |

---

## Q6. Test suite GLOB update

### (a) Add to existing `mastra-js` or `mastra-cjs` GLOB?

**No.** Per `tools/scripts/run-pnpm-test-namespaced.mjs:35-36`:
```javascript
{ ns: "mastra-js", pattern: "tools/learning-loop-mastra/__tests__/*.test.js" },
{ ns: "mastra-cjs", pattern: "tools/learning-loop-mastra/__tests__/*.test.cjs" },
```

These catch `__tests__/<file>.test.js` at depth 1. The new regression guard at `__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js` IS covered by the `mastra-js` GLOB (single-asterisk matches the `phase-e-shell-restructure/` subdir). But: the test SHOULD live in a NAMED subdir to match Plan 1 / Plan 2 conventions.

### (b) Create a new `phase-e-shell-restructure` GLOB

**Yes.** Matches Plan 1's `phase-e-foundation` GLOB (`run-pnpm-test-namespaced.mjs:39`) and Plan 2's `interface-regression-guards` + `interface-contract-tests` GLOBs (lines 40-41).

```javascript
{ ns: "phase-e-shell-restructure", pattern: "tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js" },
```

Rationale:
1. **Per-plan isolation.** Plan 1 / Plan 2 / Plan 6 each have their own GLOB; failures point to the plan, not to a generic `__tests__/*.test.js` bucket.
2. **Visible scope.** The `pnpm test` output shows `[phase-e-shell-restructure] ==> start|pass|FAIL`, mirroring Plan 1's `[phase-e-foundation]`.
3. **Per-glob log file.** Mirrors Plan 1: `.test-logs/phase-e-shell-restructure.log`.

### (c) Does the existing `__tests__/interface/` GLOB cover the new test if we put it there?

**It could but shouldn't.** The `interface-regression-guards` GLOB (`run-pnpm-test-namespaced.mjs:40`) covers `__tests__/interface/*.test.js`. A test asserting "shell files are in `mastra/`" could live there. **Don't.** Reasons:
1. **Wrong layer.** The shell restructure is about Layer 2 (Mastra shell), not Layer 3 (Runtime interface). Mixing them in one GLOB conflates the two layers.
2. **AGENTS.md §1.1 alignment.** The 3-layer framing demands per-layer test buckets.

### (d) Recommendation

**Add a new `phase-e-shell-restructure` GLOB** to `tools/scripts/run-pnpm-test-namespaced.mjs`. Update the file header comment (line 18 says "Active globs (9)"; becomes "Active globs (13)" after Plan 2 + Plan 6).

---

## Q7. CI / pre-commit hook impact

### (a) Will pre-commit hook still work?

**Yes, with all tests passing.** Per `package.json:35-37`:
```json
"simple-git-hooks": {
  "pre-commit": "pnpm test"
}
```

`pnpm test` runs `node tools/scripts/run-pnpm-test-namespaced.mjs` (line 16), which iterates the 13 GLOBs sequentially (per `run-pnpm-test-namespaced.mjs:131-134`).

After Plan 6:
- All existing tests still pass (the move is mechanical + all paths updated).
- 1 new GLOB (`phase-e-shell-restructure`) added with 4 regression guards.
- Total GLOBs: 12 → 13.

The hook does NOT block on Plan 6's correctness; it blocks on the test SUITE being green. The Plan 6 phases (Q5) ensure the suite is green before commit.

### (b) Timeout concern if we add 1 more GLOB

**Negligible.** Per `run-pnpm-test-namespaced.mjs:85`:
```javascript
["--test", "--test-timeout=30000", pattern],
```

Each GLOB has a 30s per-test timeout. The new `phase-e-shell-restructure` GLOB has 4 tests, each a fast filesystem scan + assertion. Estimated runtime: < 5s.

Adding 1 GLOB to 12 → 13 increases total runtime by ~5s. Current `pnpm test` baseline (per Plan 1 verification step 7): "all 1189+ tests pass" with no explicit duration claim; per Plan 2 line 279 "all 10 test namespaces pass." Sequential execution means the new GLOB is one more step in the chain.

### (c) Tests that would compound

| Test | Slow? | Why |
|------|-------|-----|
| `cold-session-discoverability.test.cjs` | Yes (multi-second) | Spawns actual stdio MCP server; full protocol handshake |
| `cold-session-enumerate-mastra.test.cjs` | Yes (multi-second) | Same |
| `connect-mcp-server-mutex.test.js` | Yes (multi-second) | Spawns server; tests concurrency |
| `legacy-mcp/cold-tier-regression.test.js` | Yes (multi-second) | Cold-tier rebuild + 9 finding checks |

None of these are added by Plan 6. Plan 6's new tests are pure filesystem scans (`find ... -name '*.js' -type f | wc -l`) — cheap.

**Verdict:** no timeout concern. Plan 6's footprint is < 5s added to a multi-minute suite.

---

## Q8. Cost of NOT doing Plan 6

### (a) Plan 4's Mastra Code registration

Per scope report line 124 (E.5): Plan 4 registers `mcpServers.learning-loop` in `.mastracode/config.json` pointing at `tools/learning-loop-mastra/server.js` (current pre-Plan-6 path).

If Plan 4 ships WITHOUT Plan 6 first:
- `.mastracode/config.json` ships with `args: ["tools/learning-loop-mastra/server.js"]` — the file exists at this location TODAY.
- `node interface/contract.js mastra-code` returns `{ok: true}` — passes.
- BUT: AGENTS.md §1.1 line 20-22 still says "Lives at `tools/learning-loop-mastra/` (top level)" — which is consistent with Plan 4's registration, but inconsistent with the post-Phase-E diagram (per scope report line 287-330).

### (b) Plan 6 ships later → Plan 4 re-validation cost

| Cost | Magnitude |
|------|-----------|
| `.mastracode/config.json` must be re-edited to `tools/learning-loop-mastra/mastra/server.js` | 1 line |
| `interface/contract.js:94` must be re-updated | 1 line |
| Re-run `node interface/contract.js mastra-code` | 1 command |
| Re-run `__tests__/mcp-config.test.js` (which validates `.mastracode/config.json` shape) | 1 command |
| Re-run `pnpm test` to confirm no regression | 1 command |
| Re-file `meta_state_log_change` for the path update | 1 entry |
| Re-invalidate cold cache | 1 file delete |

Total: 1 extra PR (~30 min) + 1 extra meta-state entry + 1 extra review cycle.

### (c) Operational cost

1 PR cycle (Plan 6 retrofits Plan 4's contract path + Mastra Code registration). Acceptable but wasteful.

### (d) Risk: contract path wrong

If Plan 4 ships WITHOUT Plan 6 and Plan 6 ships LATER, the contract `args` check stays at the pre-Plan-6 path (e.g., `tools/learning-loop-mastra/server.js`). When Plan 6 moves `server.js` to `mastra/server.js`, the contract check SILENTLY breaks:

```javascript
// post-Plan-6, contract.js:94 unchanged:
&& entry.args.some((a) => typeof a === "string" && a.endsWith("tools/learning-loop-mastra/server.js"));
// post-Plan-6, .mcp.json:5 updated:
args: ["tools/learning-loop-mastra/mastra/server.js"]
// Result: endsWith returns false; contract fails for ALL 3 runtimes; Plan 4's acceptance gate fails
```

**This is a silent regression.** The `__tests__/interface/runtimes-pass-contract.test.js` (real-runtime smoke test from Plan 2) would catch it, but only if the test runs after Plan 6. Pre-commit hook catches it on the next commit, but only if Plan 6's commit includes the contract test update.

**Verdict:** Plan 6 must update the contract check IN THE SAME PR as the move. Plan 4 (which depends on the contract) cannot ship with an unchanged contract.

---

## Q9. Plan 6 + AGENTS.md §11 (R2 ownership) interaction

### (a) Who owns `tools/learning-loop-mastra/mastra/` after the move?

**Universal Core+Mastra shell = loop's concern, not a single runtime's.** Per Plan 1's `core/README.md` (FCIS invariant): "Core has zero `@mastra/*` imports; the shell may import core." The shell (`mastra/`) is a SHARED layer between all 3 runtimes (claude-code, droid, mastra-code). It is NOT owned by any single runtime.

Per AGENTS.md §1.1 line 20-22 (current pre-Plan-6): "Mastra shell (imperative). Wraps core in Mastra framework primitives." This is the loop's layer; the runtimes CONSUME it via the MCP stdio interface.

### (b) Does the move create a NEW R2 surface?

**No.** The shell was always loop-owned (Plan 1 codified this). The move is a PHYSICAL relocation, not an OWNERSHIP change. AGENTS.md §11 (per Plan 3 / scope report line 121) codifies: "Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`) is owned by the corresponding runtime agent." The shell is NOT in this list (correctly — it's loop-owned).

### (c) Should AGENTS.md §11 mention the new `mastra/` location as universally-owned?

**No — AGENTS.md §1.1 already does this.** Per AGENTS.md line 20-22: "Mastra shell (imperative). Lives at `tools/learning-loop-mastra/` (top level)." Plan 6 updates this to "Lives at `tools/learning-loop-mastra/mastra/`." §11 is for RUNTIME ownership; §1.1 is for LAYER ownership. Don't conflate.

If Plan 3's §11 wants to be EXPLICIT about shell non-ownership, it can add: "Shell code (`tools/learning-loop-mastra/mastra/`) is universally owned by the loop; runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, `.mastracode/coordination/hooks/`) is owned by the corresponding runtime agent." But this is documentation polish, not a contract change.

**Recommendation:** Plan 6 updates AGENTS.md §1.1 (Layer 2 location). Plan 3's §11 may add 1 sentence clarifying shell vs runtime ownership, but it's optional.

---

## Q10. Plan 6 + hardening plan (LIM-3 caller identity) interaction

### (a) Does `mastra/` directory structure help or hinder the R2 write-gate implementation?

**Helps.** The R2 write-gate (per scope report line 122) is "per-runtime write allowlist keyed on `RUNTIME_ID` env var." The allowlist will likely look like:

```
runtime/<X>/**            → allow if RUNTIME_ID == X
core/                     → allow (loop-owned)
mastra/                   → allow (loop-owned)  ← NEW post-Plan-6; cleaner mental model
.claude/coordination/     → allow if RUNTIME_ID == "claude-code"
.factory/coordination/    → allow if RUNTIME_ID == "droid"
.mastracode/coordination/ → allow if RUNTIME_ID == "mastra-code"
```

Post-Plan-6, the `mastra/` dir is a NAMED allowlist target, not a wildcard like `tools/learning-loop-mastra/*.js` (which would be ambiguous — top-level has `storage.js`, `agent-manifest.json`, etc. that are NOT shell code). The move MAKES the allowlist expressible cleanly.

Pre-Plan-6, the allowlist would need a glob like `tools/learning-loop-mastra/{server.js,create-loop-*.js,workflows/**,agents/**}` — fragile, enumeration-based.

### (b) Does `mastra/server.js` become the "default entry"?

**Yes — by convention, not by configuration.** The MCP stdio entry is whatever path is registered in `.mcp.json` / `.factory/mcp.json` / `.mastracode/config.json`. Post-Plan-6, the canonical entry is `tools/learning-loop-mastra/mastra/server.js` for all 3 runtimes.

The hardening plan's `RUNTIME_ID` env var reader (per scope report line 122, Decision 2, item 1: "runtime-marker reader in `core/legacy/`") is INDEPENDENT of the entry path. The reader reads `process.env.RUNTIME_ID` regardless of which `server.js` spawned it.

**Recommendation:** the hardening plan's R2 gate references `RUNTIME_ID` env var, not the entry path. Plan 6's move has no direct coupling.

### (c) Should Plan 6's regression test include a stub for the future `mastra/RUNTIME_ID` env var reader?

**YAGNI: no.** Reasons:
1. The reader does not exist yet (per scope report line 122, Decision 2, item 1: "runtime-marker reader in `core/legacy/`" — wait, this says `core/legacy/` which is now `core/` post-Plan-1; the hardening plan needs to update this to `core/`).
2. Plan 6's job is the MOVE. The hardening plan's job is the READER. Don't cross scopes.
3. The contract's `checkIdentityMarker` (Plan 2, `interface/contract.js:111-116`) already reads `process.env.RUNTIME_ID`. That's the stub for the hardening plan to wire up.
4. Plan 6's regression guards test the MOVE, not the future hardening.

**Recommendation:** Plan 6 does NOT add a stub. The hardening plan owns the reader.

---

## Summary

| Q | Recommendation | Confidence |
|---|----------------|------------|
| Q1 | Plan 6 BEFORE Plan 4 | High (single source-of-truth; pattern match) |
| Q2 | Per-plan split correct (foundation → structure) | High (matches meta-pattern; Plan 1's bounded scope preserved) |
| Q3 | Plan 3 first or parallel (both safe) | High (mechanical, no cross-contamination) |
| Q4 | Hardcoded literal + `endsWith` + single-path | High (KISS; mirrors Plan 1/2 patterns) |
| Q5 | 5-phase TDD: Baseline → InternalMove → ExternalRefUpdate → ContractUpdate → Verify | High (pattern match Plan 1/2) |
| Q6 | New `phase-e-shell-restructure` GLOB | High (matches Plan 1/2 conventions) |
| Q7 | No timeout concern; < 5s added | High (filesystem-scan-only tests) |
| Q8 | Plan 6 must update contract in same PR; Plan 4 cannot ship first | High (silent-regression risk) |
| Q9 | Plan 6 updates §1.1 only; §11 is for runtime ownership | High (layer separation) |
| Q10 | Plan 6 does NOT stub RUNTIME_ID reader | High (YAGNI; hardening plan owns it) |

---

## Risks consolidated

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Substring sed misses an external ref (e.g., a hidden copy in a doc or skill MD) | High | Phase 1 baseline counts ALL external refs; Phase 3's `external-refs-updated.test.js` scans the 25 files; full `pnpm test` is the safety net |
| R2 | `meta-state.jsonl` fingerprint hashes stale post-move (10 matches per grep) | Medium | Use `meta_state_batch` (per Plan 1 Phase 6 pattern) to repoint + refresh in 1 batch op; cold-tier regression test catches misses |
| R3 | Cold-cache (`records/meta/.cache/loop-describe-cold.json`) has 29 stale matches | Medium | DELETE the cache file post-move; next cold-tier read regenerates (per Plan 1 Phase 2 Step 7) |
| R4 | `interface/contract.js:94` not updated in same PR as the move | High (silent regression per Q8) | Phase 4 updates the contract; Phase 3 update of `.mcp.json` triggers test failure if contract not updated |
| R5 | `package.json:19` `gate:server` script broken if not updated | Low | Phase 3 update |
| R6 | `legacy-cleanup.test.cjs:58-62, 73-74` test data references old paths | Medium | Phase 3 update; the test's purpose is to assert NEW paths |
| R7 | Plan 4 ships before Plan 6 → re-validation cycle | Medium (already mitigated by Q1 recommendation) | Plan 6 ships first |
| R8 | Plan 3 ships in parallel with Plan 6 and conflicts on `workflow-intentional-skip.js` | Low | Rebase + re-apply comment; comment is 1 line |
| R9 | AGENTS.md §1.1 line 20-22 not updated; docs and code diverge | Low | Phase 3 update |
| R10 | README.md, CLAUDE.md, and `docs/*.md` references not all caught by grep | Low | `find ... -type f \( -name '*.md' -o -name '*.json' -o -name '*.js' \) | xargs grep -l 'tools/learning-loop-mastra/server.js'`; updated test scans all 25 files |

---

## Unresolved questions

1. **Mastra Code `mcp_config` location** — the scope report line 124 says `.mastracode/config.json` for MCP. Will Mastra Code's npm package actually look there, or will it use a different path? Plan 4's smoke test will reveal this. Not a Plan 6 concern.

2. **`storage.js` location** — `tools/learning-loop-mastra/storage.js` is at top-level. Is it shell code (MCP-server-adjacent) or core-adjacent (libsql substrate)? Plan 6's scope report does not include it. Recommend: defer to Plan 6's "what about storage.js?" review; if it's shell, include in move; if it's core, leave at top-level and document.

3. **`agent-manifest.json`, `agents-manifest.json`, `workflows-manifest.json` location** — these are data files at top-level, not shell code. Per scope report E.6 list (line 562-565), only `.js` files + `workflows/` + `agents/` move. JSON manifests stay at top-level. Confirm with operator.

4. **`scripts/` and `scout/` directories** — `tools/learning-loop-mastra/scripts/` and `tools/learning-loop-mastra/scout/` exist at top-level. Per scope report Rev 5 diagram (line 343-386), they are NOT shell code. Plan 6 should NOT move them. Confirm with operator that these are correctly classified as "loop utility scripts" (not "Mastra shell").

5. **`data/` directory** — `tools/learning-loop-mastra/data/mastra-memory.db` is the LibSQL storage. Clearly NOT shell code; stays at top-level.

6. **`hooks/legacy/` location** — `tools/learning-loop-mastra/hooks/legacy/` is referenced by shim dirs (per AGENTS.md §2 Hook Matrix, lines 67-74). Is it shell code (imperative, imports Mastra) or core-adjacent (pure logic)? Current location: top-level. Plan 6 should NOT move it (out of scope; not in scope report E.6 list). Confirm.

7. **`docs/mcp-tool-schema-architecture.md` line 261** mentions `schema-parity.js` as a fingerprint target: "add `schema-parity.js` to the SP2 fingerprint registry (via `meta_state_log_change` with `evidence_code_ref: "tools/learning-loop-mastra/schema-parity.js"`)." Post-Plan-6, the path becomes `tools/learning-loop-mastra/mastra/schema-parity.js`. Plan 6 should update this doc reference IN THE SAME PR; otherwise a future finding-regrind will reference a stale path.

8. **`docs/journals/260624-phase-d-plan-3-post-review-hardened.md` lines 86-90** list 5 agent file paths (`agents/build-meta-state-tools.js`, etc.) — these are HISTORICAL references to the pre-Plan-6 state. Per Plan 1's "Historical files (DO NOT MODIFY)" rule (`260624-2335-phase-e-foundation/phase-02-renameandrefs.md` lines 46-47), historical journals are NOT modified. Plan 6's external-refs-updated.test.js should EXCLUDE `docs/journals/260624-*.md` (same exclusion as Plan 1's `core/legacy` rename).

---

## Files cited (full inventory)

### Move targets (9 file-groups, top-level → `mastra/`)
- `tools/learning-loop-mastra/server.js`
- `tools/learning-loop-mastra/create-loop-tool.js`
- `tools/learning-loop-mastra/create-loop-workflow.js`
- `tools/learning-loop-mastra/create-loop-agent.js`
- `tools/learning-loop-mastra/legacy-handler-adapter.js`
- `tools/learning-loop-mastra/schema-parity.js`
- `tools/learning-loop-mastra/schemas.js`
- `tools/learning-loop-mastra/workflows/` (10 files)
- `tools/learning-loop-mastra/agents/` (5 files + `instructions/` + `load-agents-manifest.js`)

### External files to update (~25 files)
- Runtime configs: `.mcp.json:5`, `.factory/mcp.json:5`, `package.json:19`
- Interface contract: `tools/learning-loop-mastra/interface/contract.js:94`, `interface/CONTRACT.md:21`, `interface/README.md:42`, `interface/RUNTIME_ONBOARDING.md:21,55`, `interface/__tests__/contract.test.js:42`
- Tests: `__tests__/{with-mcp-server.js:128, mutex-scope.test.js:17, mcp-config.test.js:24,28, cold-session-enumerate-mastra.test.cjs:17, legacy-cleanup.test.cjs:58-62,73-74, connect-mcp-server-mutex.test.js:12, legacy-mcp/cold-session-churn-regression.test.js:29,53,89,107, legacy-mcp/mcp-protocol-e2e.test.cjs:22,27, legacy-mcp/cold-session-discoverability.test.cjs:35,209,289, legacy-mcp/scout-budget-estimator.test.js:48}`
- Runtime hooks/tests: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:177`, `.factory/hooks/loop-surface-inject.cjs:166`, `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs:19,21`
- Skill MDs: `.claude/skills/coordination-gate/SKILL.md:14`, `.factory/skills/coordination-gate/SKILL.md:14`
- Docs: `docs/mcp-tool-schema-architecture.md:8-10,77,261,379-383`, `docs/mcp-server-restart-protocol.md:3,21,55`
- Operator docs: `AGENTS.md:20-22,57,86`, `README.md:48`, `CLAUDE.md:6`
- Meta-state: `meta-state.jsonl:50,138,149,150,159,164,167,179` (10 shell-path matches total)
- Cold cache: `records/meta/.cache/loop-describe-cold.json` (29 matches; DELETE)
- Manifest cosmetic: `tools/learning-loop-mastra/agents-manifest.json:3` (description string only)

### Test runner / config
- `tools/scripts/run-pnpm-test-namespaced.mjs:18` (comment "Active globs (9)" → "Active globs (13)"; line 42 add `{ ns: "phase-e-shell-restructure", pattern: "tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js" }`)
- `package.json:35-37` (simple-git-hooks pre-commit `pnpm test`; no change needed)

### New test files (Phase 1)
- `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`
- `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js`
- `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js`
- `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/agents-md-layer-locations.test.js`

---

## References

- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 5 (line 153-156 for Plan 6 row; line 587-589 for "what was NOT changed")
- Plan 1: `plans/260624-2335-phase-e-foundation/plan.md` (shipped 2026-06-25; PR #15 + #16)
- Plan 2: `plans/260625-1618-phase-e-interface-spec/plan.md` (shipped 2026-06-25; PR #17; interface contract + validator)
- Plan 1 Phase 2 (rename pattern): `plans/260624-2335-phase-e-foundation/phase-02-renameandrefs.md` (substring sed, exclusion rules)
- Plan 1 Phase 6 (fingerprint repoint): `plans/260624-2335-phase-e-foundation/plan.md` lines 73-78 (meta_state_batch pattern)
- AGENTS.md §1.1: `AGENTS.md:13-42` (3-layer framing)
- Contract path check: `tools/learning-loop-mastra/interface/contract.js:84-96` (mcp-client-config requirement #2)
- Test runner: `tools/scripts/run-pnpm-test-namespaced.mjs:29-42` (12 GLOBs; 13th added by Plan 6)
- Pre-commit hook: `package.json:35-37`
- Cold-cache invalidation: `plans/260624-2335-phase-e-foundation/phase-02-renameandrefs.md:115-117`

---

**Status:** research-only pass complete. No files modified. 10 questions answered with file:line citations, trade-off matrix, adoption-risk assessment, and ranked recommendation per question. 8 unresolved questions surfaced (mostly scope clarifications; one is a known cross-plan concern re: hardening plan's `core/legacy/` path reference).
