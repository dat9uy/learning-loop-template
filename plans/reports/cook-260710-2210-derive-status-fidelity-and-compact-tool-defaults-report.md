# Cook report — derive-status fidelity + compact tool defaults

**Date:** 2026-07-10 22:10 UTC
**Branch:** `plan/derive-status-fidelity-and-compact-tool-defaults`
**PR:** https://github.com/dat9uy/learning-loop-template/pull/49
**Commit:** `cbdd259` — `fix(meta-state-tools): derive_status fidelity + compact tool defaults`

## Summary

Both workstreams shipped in one PR per the plan's single-PR mitigation (avoids `meta-260709T1017Z-…-parallel-prs` EOF class). Pre-commit hooks green; 1173 tests pass across the full meta-state + handler surface; `pnpm fallow:gate` clean on 18 touched files.

## Phase outcomes

### Phase 1: Design Lock ✓
4 probes confirmed in-code (no writes):
- **Probe 1** — `query-drift.js:87,90,93` still fires drift for `active-uncertain` (case 5); recommendation `investigate` for `code-only` (case 5 dominates). Drift detection preserved.
- **Probe 2** — only consumer of `no_action` is a code comment in `query-drift.js`; no branch.
- **Probe 3** — `server.js:46` rewrites `tools/…` → `tools/handlers/…` via `.replace('tools/', '')`. No manifest edit needed.
- **Probe 4** — `fingerprint` is a SHA-256 row-integrity hash (`runtime-state-record-tool.js:69`); `metadata` is the blob. Compact drops `metadata` only. `total` field added for truncation visibility.

### Phase 2: Derive-Status Fidelity (WS1) ✓
Source: `tools/learning-loop-mastra/core/derive-status.js`
- `computeKind` signature now `(codeRefExists, testFileExists, testPassed, codeRef, testPath)` — `testPassed` threaded through.
- `checkExists` reuses `stripEvidenceAnchor` from `core/gate-logic.js` (DRY with SP2 `check-grounding.js:154`).
- `computeRecommendation` returns `investigate` for `code-only`.
- Cycle check: `node -e "import('./core/derive-status.js').then(m => import('./core/gate-logic.js')).then(g => console.log(typeof g.stripEvidenceAnchor))"` returns `function` — no cycle.

Tests flipped (contract change, not bug passthrough):
- `derive-status.test.js` — 5 cases flipped (`mechanism-shipped`/`resolve`/`drift:true` → `code-only`/`investigate`/`drift:false`); 6 new ACCEPTS cases added.
- `meta-state-derive-status-tool.test.js` — 1 case flipped.
- `meta-state-stale-flag.test.js` — T5 flipped (`re_verify` → `investigate`).
- `sp1-derive-status-acceptance.test.js` — 4 assertions flipped.
- `query-drift.test.js` — 9 cases flipped (T-1, T-5, T-6, T-9, T-10, T-24, T-25, T-26, T-27).
- `meta-state-query-drift-tool.test.js` — T-25 flipped.
- `path-containment-audit-sites.test.js` — `legitimate_paths_still_work` flipped.
- `core/__tests__/meta-state-superseded.test.js` — regression-guard flipped.

Blast radius: 16 findings with `evidence_code_ref` (registry is leaner than plan's 38 estimate). No auto-resolve per plan.

### Phase 3: Compact Tool Defaults (WS2) ✓
- `meta-state-list-tool.js` — `compact` schema default `.default(false)` → `.default(true)`; handler destructures `compact = true` (legacy handler bypasses zod defaults); description updated.
- `runtime-state-read-tool.js` — added `compact` schema field (default `true`), `toCompactRow` helper drops `metadata` only, `limit` default `100` → `20`, `total` field added (filtered count BEFORE `slice(0, limit)`).

Tests added:
- `meta-state-list-compact.test.js` — 2 new tests (default-call returns compact; explicit `compact: false` returns verbose).
- `runtime-state-read-tool.test.js` — 3 new tests (default compact drops metadata; `total > count` truncation visibility; explicit `compact: false` returns metadata).

### Phase 4: Ship and Registry Closeout ✓

**Commit:**
- `cbdd259 fix(meta-state-tools): derive_status fidelity + compact tool defaults` — single PR per plan.

**Change-logs filed (in-PR):**
- `meta-260710T2235Z-tools-learning-loop-mastra-core-derive-status-js-computekind` (semantic, `core/derive-status.js#computeKind`)
- `meta-260710T2235Z-tools-learning-loop-mastra-tools-handlers-meta-state-list-to` (surface, both handler files)

**Findings resolved (operator-mediated):**
- `meta-260710T0141Z-…-meta-state-derive-status-s-mechanism-shipped-derivation-is` — WS1 source finding.
- `meta-260704T1014Z-…-mcp-tool-defaults-for-meta-state-list-and-runtime-state-read` — WS2 source finding.

**Fingerprints re-grounded:**
- `core/derive-status.js` → 1 anchored entry (`meta-260710T0141Z`) refreshed.
- `tools/handlers/meta-state-list-tool.js` → 0 anchored entries.
- `tools/handlers/runtime-state-read-tool.js` → 0 anchored entries.

**Sanity sweep (`meta_state_query_drift({ run_grounding: true })`):** 132 drift events; both resolved findings excluded (terminal); two new change-logs flagged as drift until next sweep.

## MCP server caveat (operator action)

The MCP server is a long-running process that imports `core/derive-status.js` at startup. After Phase 2 source fix, the running server still returns `code-missing` for `:line-range` refs like `meta-state-log-change-tool.js:102-113` because the OLD module is in memory. Direct test confirms the fix works:

```
kind: code-only
code_ref_exists: true
code_ref_path: tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:102-113
```

A server restart will pick up the fix and the two `:line-range` escalate findings (`meta-260619T2233Z`, `meta-260626T1419Z`) will re-derive to `code-only`/`investigate` as planned.

## Test metrics

| Surface | Tests | Pass | Fail |
|---------|-------|------|------|
| `__tests__/legacy-mcp/*.test.js` | 1001 | 1001 | 0 |
| `tools/handlers/*.test.js` | 13 | 13 | 0 |
| `core/__tests__/*.test.js` | 159 | 159 | 0 |
| **Total** | **1173** | **1173** | **0** |

Pre-commit hooks: all 3 hooks green (mcp-tests, mcp-core-tests, mcp-core, mastra-js, mastra-cjs).

`pnpm fallow:gate`: ✓ No issues in 18 changed files vs origin/main.

## Stable-code-artifact compliance

No plan IDs, audit labels, or finding codes in test names or code comments. Initial pass had plan-ID references in test code; auto-mode classifier correctly flagged them — references stripped, replaced with behavioral descriptions.

## Follow-ups (per plan)

1. **Operator-only authorization gate for `meta_state_resolve`** (Red-Team Finding 9) — `meta-state-resolve-tool.js:24` has no caller-identity check. The two resolve calls in this PR were operator-mediated, not auto.
2. **`stripEvidenceAnchor` tightening for non-canonical anchors** (Red-Team Finding 14) — pre-existing limitation; not closed by this plan.
3. **Gate-log drift-annotation fix** (Red-Team Finding 11) — `meta-state-derive-status-tool.js:52` writes `drift: result.drift` on every call; post-WS1 this diverges from query-drift. Documented; follow-up needed.

## Status: DONE

Plan executed end-to-end. PR #49 ready for review/merge.