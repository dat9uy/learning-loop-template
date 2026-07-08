---
title: "Lifecycle authority dissolution (OPERATOR_MODE -> LOOP_SESSION_MODE)"
description: "Plan 2 of the 4-plan lifecycle + Rec 12 split (tracker: plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md). Ships the merged P3 of the 0958 redesign: dissolve the OPERATOR_MODE env-var authority gate into a once-per-session declaration LOOP_SESSION_MODE=live|autonomous, default autonomous (fail-closed). 3 gated tools (promote_rule / supersede / dispatch_finding commit stage) refuse in autonomous and run in live; open tools (resolve / re_verify / archive / report / log_change / propose_design / patch) run in both. No grant machinery; tools' existing *_by/*_at fields remain the authorship record. Rec 12 L1 trigger + symmetry is Plan 3; Rec 12 closed loop (b)+(c) is Plan 4. NOTE: scope verified post-PR-#38 — sweep no longer has an OPERATOR_MODE gate (Plan 1 reworked it to read-only), so this plan touches 3 gate sites, not 4; and 8 test files, not 11."
status: in_progress
priority: P2
branch: "lifecycle-authority-dissolution-session-mode"
tags: [lifecycle, authority-dissolution, session-mode, operator-mode, fail-closed, gate]
blockedBy: [260707-0812-lifecycle-status-stale-mechanism]
blocks: [rec12-l1-trigger-statement-and-symmetry]
created: "2026-07-08T01:54:00.842Z"
createdBy: "ck:plan"
source: skill
---

# Plan 2: Lifecycle authority dissolution (OPERATOR_MODE -> LOOP_SESSION_MODE)

**Date:** 2026-07-08
**Branch (to create):** `lifecycle-authority-dissolution-session-mode` (off current `main` @ `46a8884`, post-PR-#38)
**Design source:** `plans/reports/brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md` (surgery P3 + Q11). This plan ships P3 of that redesign.
**Tracker:** `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` (4-plan split; this is Plan 2).
**Depends on:** Plan 1 (`260707-0812-lifecycle-status-stale-mechanism`) — shipped via PR #38 (squash commit `46a8884`). Plan 2 uses the new `open` status model but does not overlap Plan 1's files.

## Overview

Replace the per-invocation `OPERATOR_MODE` env-var authority gate with a once-per-session declaration `LOOP_SESSION_MODE=live|autonomous`. The MCP server reads `process.env.LOOP_SESSION_MODE` once; default = `autonomous` (fail-closed: class-approval tools refuse until `live` is declared). This dissolves the "operator role" concept into a session declaration — no grant machinery, no new ledger event; the tools' existing `*_by` / `*_at` fields remain the authorship record.

## Scope (verified against `main` @ `46a8884`, post-PR-#38)

**3 gate sites** (tracker said 4; `meta-state-sweep-tool.js` lost its gate in Plan 1 — now read-only, "No operator gate"):
- `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:17,20,55` — `checkOperatorRole()` helper + call site
- `tools/learning-loop-mastra/tools/legacy/meta-state-supersede-tool.js:18` — inline `process.env.OPERATOR_MODE !== "1" && !== "true"` → `operator_role_required`
- `tools/learning-loop-mastra/tools/legacy/meta-state-dispatch-finding-tool.js:169` — inline same check in `handleCommitStage` → `operator_role_required`

**Comment / description / prompt strings** (rename only, no behavior):
- `tools/learning-loop-mastra/tools/legacy/meta-state-supersede-tool.js:9` (tool description)
- `tools/learning-loop-mastra/tools/legacy/meta-state-dispatch-finding-tool.js:21,293` (description + output schema doc)
- `tools/learning-loop-mastra/tools/legacy/runtime-state-record-tool.js:9` (comment)
- `tools/learning-loop-mastra/core/runtime-state.js:13` (comment)
- `tools/learning-loop-mastra/core/loop-introspect.js:258` (Rec 10 dispatch prompt string)

**8 test files** (tracker said 11; Plan 1 trimmed the stale-flag surface) — migrate `OPERATOR_MODE="1"` / `"true"` env settings to `LOOP_SESSION_MODE=live` where they exercise a gated tool; update assertion strings that mention `OPERATOR_MODE`:
- `__tests__/legacy-mcp/meta-state-promote-rule-rule-entry.test.js`
- `__tests__/legacy-mcp/integration-promoted-rule.test.js`
- `__tests__/legacy-mcp/meta-state-supersede-tool.test.js` (if present — verify in cook)
- `__tests__/legacy-mcp/meta-state-dispatch-finding-tool.test.js`
- `__tests__/legacy-mcp/meta-state-dispatch-ttl-and-close-flow.test.js`
- `__tests__/legacy-mcp/meta-state-sweep.test.js` (1 ref — likely comment/incidental; verify it exercises no gate)
- `__tests__/legacy-mcp/meta-state-stale-flag.test.js`
- `__tests__/legacy-mcp/gate-scope-predicate.test.js`
- `__tests__/legacy-mcp/build-stale-dispatch-hints.test.js` (2 refs — likely introspect-output assertions; update strings only)

**Out of scope:** no `.mastracode` / `.factory` references exist (verified) — Mastra-surface only. No grant system, no new ledger event, no `delegated_to` promotion (UQ4 deferred). `meta-state-sweep-tool.js` is not touched (gate already gone).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implement](./phase-01-implement.md) | Complete |
| 2 | [Verify](./phase-02-verify.md) | Complete |

## Dependencies

- **blockedBy:** `260707-0812-lifecycle-status-stale-mechanism` (Plan 1 — shipped PR #38; uses the new `open` status model).
- **blocks:** `rec12-l1-trigger-statement-and-symmetry` (Plan 3 — Q11 symmetry comments on this authority result; `log_change` is trigger-gated, not authority-gated).
- **No file overlap** with Plan 1's shipped changes (Plan 1 touched `core/meta-state.js` + ~10 read sites + sweep/re_verify rework; Plan 2 touches the 3 authority-gate tool files + their tests).

## Acceptance criteria

1. `OPERATOR_MODE` absent from all 3 gate sites + all 8 test files (grep-clean: `grep -rn OPERATOR_MODE tools/learning-loop-mastra --include=*.js --include=*.cjs --include=*.mjs | grep -v __tests__/journals` → empty for the gate/test surface; journal docs are historical and untouched).
2. `LOOP_SESSION_MODE=autonomous` (or unset) → `promote_rule`, `supersede`, `dispatch_finding({stage:'commit'})` each return `{reason:"operator_role_required"}` equivalent (rename reason to `live_session_required` — see phase 1).
3. `LOOP_SESSION_MODE=live` → all 3 gated tools succeed (tests pass).
4. Open tools (`resolve` / `re_verify` / `archive` / `report` / `log_change` / `propose_design` / `patch`) run unchanged in both `live` and `autonomous` — no new gate on them.
5. No grant-checking code path exists; no duplicate ledger event; `*_by` / `*_at` fields unchanged.
6. Full `__tests__/legacy-mcp/` suite green; no test weakened to pass.

## Unresolved questions — RESOLVED (Validation Session 1, 2026-07-08)

All three resolved via the validation interview; see `## Validation Log` below. Summary:
1. **`LOOP_SESSION_MODE` default** = `autonomous` (fail-closed). Confirmed (pre-decided in 0958 UQ3).
2. **Shared helper vs inline** = **extract** `isLiveSession()` into `tools/lib/session-mode.js`, imported as `#lib/session-mode.js` (colocates with `gate-logging`/`resolve-root`; corrects the plan's original `core/` location — see verification failure below).
3. **Refusal reason string** = rename `operator_role_required` → `live_session_required` (concept changed).
4. **Accepted values** = strict `=== "live"` only (unset/autonomous/empty/any-other → false; clean break from `OPERATOR_MODE`'s `"1"`/`"true"`).

## Validation Log

### Verification Results
- Claims checked: 12
- Verified: 11 | Failed: 1 | Unverified: 0
- Tier: Light (2 phases → Fact Checker)
- **Failed claim:** plan said create `tools/learning-loop-mastra/core/session-mode.js` and import via `#lib/`. Root `package.json` `imports` maps `"#lib/*": "./tools/lib/*"` and `"#mastra/*": "./tools/learning-loop-mastra/*"` — so `#lib/` resolves to `tools/lib/`, NOT `core/`. All 3 gate-site files already import 2 modules via `#lib/` (`gate-logging.js`, `resolve-root.js`), both in `tools/lib/`. **Corrected:** helper lives at `tools/lib/session-mode.js`, imported as `#lib/session-mode.js`.
- Secondary fix: `session-mode` unit test location `__tests__/legacy-mcp/` → `__tests__/lib/` (matches `gate-logging.test.js`, the existing `tools/lib/` test home).
- Verified: 3 gate-site line numbers; 6 string sites; 8 test files (Plan 1 trimmed from 11); no `.mastracode`/`.factory` refs; no live doc refs (only historical `docs/journals/`); CI = `pnpm test` (c8-wrapped runner); `node --test <file>` valid for focused runs.

### Validation Session 1 — Decisions (2026-07-08)
1. Helper location → `tools/lib/session-mode.js` via `#lib/session-mode.js` (recommended; colocated with gate-logging/resolve-root).
2. Reason string → rename `operator_role_required` → `live_session_required`.
3. Accepted values → strict `LOOP_SESSION_MODE === "live"` only (fail-closed on anything else).

### Whole-Plan Consistency Sweep
- Re-read `plan.md` + both phase files after propagation.
- `core/session-mode.js` references: removed from phase-01 (Architecture block, Related Code Files, step 2 import, step 7).
- Test path `__tests__/legacy-mcp/session-mode.test.js` → `__tests__/lib/session-mode.test.js` in phase-02.
- No other stale `OPERATOR_MODE`-as-target or `core/session-mode` references remain.
- Unresolved contradictions: 0.