# Stale-view hash-drift fix — shipped

**Plan:** 260716-0624
**Branch:** plan/260716-0624-stale-view-hash-drift-fix
**Ship event:** 2026-07-16

## What shipped (4 phases, ~10 files modified)

| Phase | Surface | Files touched |
|---|---|---|
| 1 | Hash-aware `hasDrifted` + `computeCurrentHashes` helper | `core/stale-view.js`, `core/derive-status.js`, `tools/handlers/meta-state-derive-status-tool.js`, `__tests__/legacy-mcp/stale-view.test.js`, `__tests__/legacy-mcp/derive-status.test.js` |
| 2 | 4 consumers wired with `{ fileIndex, codeHashes }` | `tools/handlers/meta-state-sweep-tool.js`, `tools/handlers/meta-state-relationship-validate-tool.js`, `tools/handlers/meta-state-relationships-tool.js`, `core/loop-introspect.js`, `__tests__/legacy-mcp/build-stale-dispatch-hints.test.js`, `__tests__/legacy-mcp/meta-state-relationship-validate-tool.test.js`, NEW `__tests__/legacy-mcp/compute-current-hashes-integration.test.js` |
| 3 | Cold-tier cap (age + drift) + opt-in re_verify refresh | `tools/handlers/meta-state-re-verify-tool.js`, `__tests__/legacy-mcp/cold-tier-regression.test.js`, NEW `__tests__/legacy-mcp/meta-state-re-verify-tool.test.js` |
| 4 | Docs + change-log + meta-state closeout | `docs/meta-state-lifecycle.md`, registry (1 change-log entry, 1 resolve) |

## What was found vs expected

- **0c8f670 workaround removed**: pre-fix `cold-tier-regression.test.js:99-106` used `fileIndex: new Map()` to suppress drift because the predicate was path-presence-only. Post-fix: real `{ fileIndex, codeHashes }` injected; drift-stale = 0 in CI (post-seed normalization). Workaround scar is gone.
- **Age cap restructured**: original Phase 7 had a single `<=16` assertion (10 + 2 headroom). Restructured into two: age-stale `<=11` (9 + 2 headroom) + drift-stale `==0`. Pre-fix precompute (14) becomes 9 because drift is now separated from age.
- **Re_verify opt-in added**: `refresh: true` flag (default off) calls `upsertFileIndexEntry` after `applyUpdateAndCheck` succeeds. CAS-conflict path → no index mutation (no orphan baseline). Best-effort on missing/EACCES → gate-log breadcrumb.
- **Derive_status drift-aware**: Validation Q4 closed Security F10 gap — `codeContext` accepts `fileIndex` + `codeHashes`; `meta_state_derive_status` tool now builds both. Drift-aware recommendations flow through SP1.

## Red-team findings count and disposition

- 15 findings (3 Critical, 6 High, 6 Medium)
- 15 accepted, 0 rejected
- Per-finding disposition:
  - M1, M3, M14 — `meta_state_re_verify` opt-in refresh (CAS ordering, default-off, gate-log)
  - M2, M20 — `computeCurrentHashes` path-containment + `resolveSafePath` routing; `{ ok, skipped }` return shape
  - M4 — Phase 7 cap restructured into age + drift assertions
  - M5 — `hasDrifted` replicates SP2's `TERMINAL_HASH_REGEX` chain
  - M6 — TOCTOU race documented in plan (deferred mitigation)
  - M7 — `buildStaleDispatchHints` signature extended for `fileIndex + codeHashes`
  - M8 — `meta-state-re-verify-tool.test.js` added as deliverable
  - M10 — relationship-validate test fixture with `evidence_code_ref` added
  - M12 — PR body uses six `## X entries` sections per CI advisory regex
  - M13 — `pnpm test:iter` incompatibility documented (no seed → drift cap blows)
  - M17 — parity grep across `.factory/hooks/loop-surface-inject.cjs`
  - M19 — change-log id auto-generated (no hand-craft)
  - M22 — Phase 02 claim of "5 test files need expectation updates" reduced to 1 real change
  - M23 — `resolveDanglingRefs` signature updated for signals threading

## Open follow-ups

- **Sweep/re_verify TOCTOU mitigation deferred**: `meta_state_sweep` loads `fileIndex` (cached) while concurrent `re_verify` upserts invalidate the cache; sweep then computes `codeHashes` from disk → drift fires on freshly re-verified entries. Full enqueue-based mitigation deferred to a follow-up plan.
- **Performance: `computeCurrentHashes` runs per handler invocation**: ~80 reads per call for the cold-tier sweep. Acceptable for MCP tool (not hot path). Documented in code comments.

## Validation results

- `pnpm exec vitest run --bail=1 ...` for each affected suite: all green
- Full `pnpm test:iter` with seed: **2026 tests / 408 suites passed**
- `meta_state_check_grounding({id})` returned `status: "grounded"` pre-resolve (RT: F1)
- Change-log entry auto-generated: `meta-260716T0812Z-tools-learning-loop-mastra-core-stale-view-js`
- Resolved entry: `meta-260716T0603Z-hasdrifted-in-core-stale-view-js-is-path-keyed-only-it-retur` (resolved_by: operator)
