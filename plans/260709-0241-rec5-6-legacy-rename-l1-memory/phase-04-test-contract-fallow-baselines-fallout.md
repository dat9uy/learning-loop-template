---
phase: 4
title: "Test contract + fallow baselines + file-index refresh + fallout"
status: pending
priority: P2
dependencies: [3]
---

# Phase 4: Test contract + fallow baselines + file-index refresh + fallout

## Overview

Regenerate the fallow baselines to reflect the new paths, **refresh the 14 stale
`file-index.jsonl` path keys**, run the namespaced suite to surface any residual path
string the Phase-1 grep missed, fix fallout, then commit. The `legacy-cleanup.test.cjs`
assertions were repointed in Phase 2; this phase confirms they pass against the moved
dirs and that the `mcp-tools` namespace is **non-zero** (red-team: vacuous-green guard).

## Requirements

- Functional: fallow baselines match the post-rename tree; `file-index.jsonl` re-keyed to
  the new paths; the suite is green at ≥ the Phase-1 baseline; the `mcp-tools` namespace
  reports a non-zero test count.
- Non-functional: no test weakened to pass; a failing test = a missed consumer, fixed at
  its source.

## Architecture

`baselines/fallow/*.json` are fallow snapshots (the Phase-1 grep confirmed they reference
`tools/legacy/`, `hooks/legacy/`, `mastra/legacy-handler-adapter.js`). `file-index.jsonl`
grounds `meta_state_check_grounding`/`meta_state_query_drift` — it has 14 path-keyed
entries under the old paths that would emit 14 false drift findings if not refreshed
(red-team Finding). The namespaced runner (`tools/scripts/run-pnpm-test-namespaced.mjs`)
is the safety net; the per-namespace count (Phase-1 baseline) catches the `mcp-tools`
vacuous-green regression.

## Related Code Files

- Regenerate: `baselines/fallow/{dupes,health}-baseline.json`
- Refresh: `file-index.jsonl` (14 stale keys) via `meta_state_refresh_file_index` (or the
  bulk re-seed script — confirm which exists)
- Verify: `__tests__/legacy-cleanup.test.cjs`, `__tests__/legacy-mcp/manifest-arithmetic*.test.*`,
  `__tests__/legacy-mcp/runtime-agnostic.test.js`, the 7 `__tests__/legacy-mcp/*.test.js`,
  `run-pnpm-test-namespaced.mjs` namespace counts.

## Implementation Steps

1. **Pin + run the fallow baseline regeneration mechanism.** `package.json` has only
   `fallow:gate` (an audit, NOT a generator) — red-team Finding. Determine the actual
   mechanism at execution: check the pinned `fallow` CLI (`pnpm exec fallow --help` for a
   `baseline`/`update` subcommand) and the CI Action. If a CLI regen subcommand exists,
   run it and commit the regenerated `baselines/fallow/{dupes,health}-baseline.json`. If
   none exists, the baselines are hand-maintained JSON — in that case perform the precise
   edit (repoint the path strings; preserve ordering/hash fields) and **state in the
   commit message that no regenerator exists** (do not leave the "do not hand-edit" rule
   contradicted). Record the chosen mechanism in the Rec 12 change-log.
2. **Refresh `file-index.jsonl` (14 stale keys).** For each moved file with a fingerprint
   entry under an old path, call `meta_state_refresh_file_index({ path: <new path> })`
   (the MCP tool re-grounds ALL findings anchored to that path in one call). If a bulk
   re-seed script exists (`tools/legacy/scripts/seed-file-index.mjs` → now
   `tools/handlers/scripts/seed-file-index.mjs`, referenced by `gate-self-verify.mjs`),
   prefer it for the batch. Confirm `meta_state_query_drift` reports zero false drifts
   after refresh.
3. **Run the namespaced suite** (`pnpm test` / `run-pnpm-test-namespaced.mjs`). Record
   pass/fail + the **per-namespace `tests N` count**.
4. **Assert `mcp-tools` namespace is non-zero.** Compare its `tests N` to the Phase-1
   baseline (non-zero). If zero, `run-pnpm-test-namespaced.mjs:36` was not repointed
   (Phase 2 miss) → fix and re-run. This is the vacuous-green guard.
5. **Triage failures.** A failure is either:
   - **A missed path-string consumer** (the Phase-1 grep missed it — e.g. a runtime-
     constructed `path.join(...,"legacy")` literal, a fixture, a snapshot). Fix at source,
     re-run. Do not weaken the test.
   - **A contract test pinning the old canonical location** (e.g. `contract.test.js`,
     `shell-files-in-mastra-dir.test.js`) — repoint to the new canonical, preserving the
     test's intent (these were Phase-2 edits; if a stray assertion remains, repoint it).
   - **A real regression** — diagnose before fixing; do not paper over.
6. **Confirm `shims-in-sync` + `manifest-arithmetic`.** The 12 wrappers stay byte-
   identical across runtimes; the manifest's tool surface loads via `../tools/handlers/`.
7. **Commit.** Stage the moves + all rewrites + regenerated baselines + refreshed
   `file-index.jsonl` + fallout fixes as one focused commit
   (`refactor(loop): rename legacy/ dirs to canonical (tools/handlers, hooks/universal, scout/pipeline)` —
   no plan id/phase labels per the stable-artifacts rule). The `pre-commit` hook
   (`pnpm test && pnpm fallow:gate`) now runs against consistent baselines → green.

## Success Criteria

- [ ] `baselines/fallow/*.json` reflect new paths; the regen mechanism is named (CLI subcommand or documented hand-edit).
- [ ] `file-index.jsonl` 14 old-path keys refreshed; `meta_state_query_drift` reports zero false drifts.
- [ ] Full namespaced suite green at ≥ Phase-1 baseline.
- [ ] `mcp-tools` namespace `tests N` non-zero (vacuous-green guard).
- [ ] `legacy-cleanup.test.cjs` + `shims-in-sync` + `manifest-arithmetic` green.
- [ ] Fallout fixed at source, not in tests.
- [ ] One focused commit lands (pre-commit hook green).

## Risk Assessment

- **Risk:** no fallow baseline regenerator exists → operator hand-edits and silently
  drops/ adds entries. **Mitigation:** step 1 pins the mechanism first; if hand-edit is
  required, do it precisely and document it — do not leave the rule contradicted.
- **Risk:** a runtime-constructed path (not grep-able) breaks a test. **Mitigation:** the
  failing test names the symptom; trace to the `path.join` literal and repoint. Phase 4 is
  where the tail risk surfaces; the Phase-1 grep + Phase-6 widened grep are the backstops.