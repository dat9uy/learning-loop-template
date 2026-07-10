---
phase: 1
title: Design Lock
status: in-progress
priority: P2
dependencies: []
---

# Phase 1: Design Lock

## Overview

Read-only verification that confirms the four open-question answers locked in Validation Session 1 (see `plan.md` → Validation Log) before any code changes. No writes to source. Each probe now *confirms in-code* rather than re-debating: OQ1 → **Option B** (test must pass); OQ2 → **`investigate`**; OQ3 → **no manifest edit** (`server.js:46` rewrites `tools/`→`tools/handlers/`); OQ4 → **`limit:20` + compact default**.

## Requirements

- Functional: produce a locked design for `computeKind` (WS1) and the two tool-default changes (WS2) with zero ambiguity carried into Phases 2-3.
- Non-functional: every design decision traced to a file:line in the current tree (no assumption from memory).

## Architecture

Four independent probes. Run them in one batch (parallel reads). Each probe writes its locked answer into the Phase 2/3 "Implementation Steps" as a precondition; the questions themselves are not re-debated in implementation phases.

## Related Code Files

- Read (no edits): `tools/learning-loop-mastra/core/derive-status.js`, `core/query-drift.js`, `core/check-grounding.js`, `core/gate-logic.js` (`stripEvidenceAnchor`), `tools/handlers/meta-state-derive-status-tool.js`, `tools/handlers/meta-state-query-drift-tool.js`, `tools/handlers/meta-state-list-tool.js`, `tools/handlers/runtime-state-read-tool.js`, `tools/manifest.json`.
- Read tests: `__tests__/legacy-mcp/derive-status.test.js`, `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js`, `__tests__/legacy-mcp/meta-state-list-compact.test.js`, `tools/handlers/runtime-state-read-tool.test.js`.

## Implementation Steps

**Probe 1 — WS1 contract change blast radius (OQ1).**
Read `core/query-drift.js` lines ~80-135 (the `derived_status`-driven drift/recommendation branches), `tools/handlers/meta-state-derive-status-tool.test.js` (the acceptance test), AND `__tests__/legacy-mcp/derive-status.test.js` (the unit-test layer). Confirm: (a) under Option B (`test_passed === true` required for `mechanism-shipped`), does `query-drift.js:87,90` (which treats both `resolved-by-mechanism` AND `active-uncertain` as drift) still fire drift detection for a "code exists, no test-pass signal" finding? Expected: yes — it derives `active-uncertain`, still drift, recommendation narrows to `investigate`. (b) Enumerate every test that locks the old contract and must be flipped or updated. **Locked: Option B** (Validation Session 1) — confirm in-code.

**Tests to flip or update (per Red-Team Finding 1):**
- `__tests__/legacy-mcp/derive-status.test.js` lines ~36-48, ~87-97, ~122-141, ~158-169, ~171-180 — lock the old `mechanism-shipped` / `resolve` / `drift:true` semantics under `baseContext()` (no `test_passed` injected). Five test cases.
- `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` lines ~63-113, ~92-95 — assert `mechanism-shipped` / `resolved-by-mechanism` / `drift: true` with both files existing, default `run_tests:false`.
- `__tests__/legacy-mcp/meta-state-stale-flag.test.js:109-126` (T5) — asserts `re_verify`; under Option B + Probe 2 lock flips to `investigate`.
- `sp1-derive-status-acceptance.test.js:42-51` — 4 assertions flip (`mechanism-shipped`→`code-only`, `resolve`→`investigate`, `drift:true`→`drift:false`, `signals.test_passed` stays `null`).

**Reframe (Red-Team Finding 8):** these flips are a deliberate **contract change** (NOT "fixing broken behavior à la PR #47"). PR #47's flipped test (`meta-state-patch-derived-schema.test.js`) was a documented bug-passthrough being undone; `derive-status.test.js` tests lock a positive semantic contract that Option B explicitly changes. The change-log must record: "computeKind semantics changed from `file-exists → mechanism-shipped` to `test_passed:true → mechanism-shipped`." Option A stays as a documented alternative for any future re-debate.

**Probe 2 — WS1 `code-only` recommendation (OQ2).**
Read `computeRecommendation` (`derive-status.js:121-141`): confirm `code-only` currently falls through to `no_action` (line 140). Grep consumers for reliance on `no_action` for `code-only` findings — `query-drift.js` is the only consumer of `derived_status`/`recommendation`; confirm it does not branch on `no_action`. **Lock:** whether `code-only → investigate` (recommended) breaks any downstream branch. Expect: no break.

**Probe 3 — WS2 manifest path resolution (OQ3).**
Confirm `tools/manifest.json` entries `{"file": "tools/runtime-state-read-tool.js" ...}` resolve to `tools/handlers/runtime-state-read-tool.js`. Grep the manifest loader (search `manifest.json` reads in `mastra/server.js` or a loader module) for a `handlers/` path-rewrite or a resolution layer. **Lock:** WS2 edits the `tools/handlers/*.js` files (canonical) AND whether `manifest.json` paths must be updated. Expect: the post-Rec-5 rename left manifest paths stale-but-resolved via a loader map; if the loader rewrites `tools/`→`tools/handlers/`, no manifest edit is needed — confirm and lock.

**Probe 4 — WS2 `runtime_state_read` compact projection (OQ4).**
Read `runtime-state-record-tool.js` schema (lines ~28-37) to confirm the full row field set. Run the literal grep (Red-Team Finding 5):

```bash
rg -n '\.metadata\b|\.fingerprint\b' --type js \
  -g '!**/handlers/runtime-state-{read,record}-tool.{js,test.js}' \
  -g '!**/__tests__/**'
```

**Pass criterion:** zero matches. The compact field whitelist drops **`metadata` only** — `fingerprint` is a SHA-256 row-integrity hash computed by `appendLedgerEvent` (`core/runtime-state.js:58-61`), not a metadata blob. Red-Team Finding 15 keeps `fingerprint` in compact mode for default-mode integrity verification.

**Truncation visibility (Red-Team Finding 2):** verify in `runtime-state-read-tool.js:60-65` that `count: result.length` reads from the **post-`slice(0, limit)`** array — NOT the filtered total. The `count` field does NOT make truncation visible. Callers needing completeness must pass `limit: 1000` explicitly. **Fix:** add a `total` field (count BEFORE slice) so callers detect truncation via `total > count`. Document this in the tool description.

**Locked:** compact drops `metadata` only; `fingerprint` retained; `total` field added to response.

## Success Criteria

- [ ] All four open questions have a locked answer traced to file:line evidence.
- [ ] The list of tests to flip/create for WS1 is enumerated (Probe 1).
- [ ] The WS2 edit surface (handler files + optional manifest) is confirmed.
- [ ] No source file modified in this phase.

## Risk Assessment

- **Probe 3 false-negative risk:** if the manifest loader is non-obvious, a wrong guess sends Phase 3 to the wrong file. Mitigation: trace the loader, don't assume. Worst case: Phase 3 edits both the handler and the manifest path — additive, not destructive.
- **Probe 1 confirmation (Option B locked):** Option B was chosen in validation. This probe confirms in-code that no consumer hard-depends on `resolve` under `run_tests:false` (verification already checked query-drift + the SP1 acceptance test — both tolerate the flip). Option A remains a documented alternative only, not a live fallback.
