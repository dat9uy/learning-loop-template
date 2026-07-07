---
phase: 3
title: "re_verify + sweep rework (no status writes)"
status: pending
priority: P2
dependencies: [2]
---

# Phase 3: re_verify + sweep rework (no status writes)

## Overview

Rework `meta_state_re_verify` (no `status:"stale"` hard-requirement; stamp `last_verified_at` on pass; finding stays `open`) and `meta_state_sweep` (read-only reporting view; `apply:true` mode removed; no status writes). Migrate the 6 definite + 3 review tests to the new contract. Remove the sweep-summary `mkdtempSync` isolation (sweep is read-only). Keep `fix-loop-design-refs.test.js` isolation permanently.

## Requirements

- Functional: `re_verify` accepts any `isOpen` finding, re-runs `verification.steps`, on pass stamps `last_verified_at` (no status transition; finding stays `open`), on fail appends to `verification.history` (finding stays `open`). `META_STATE_VERIFY_EXEC` gate stays. `sweep` returns the derived stale set as a report (what *would* be stale via `isStaleView` + expiry); `apply:true` removed; no status writes; `OPERATOR_MODE` apply gate (`sweep-tool:41`) removed.
- Non-functional: no tool in this plan writes `status` except `resolve`/`archive`/`supersede` (unchanged). P0 B1 path (a) gone by construction — `meta-state-sweep-summary.test.js` can no longer mutate the live registry via sweep.

## Architecture

`re_verify` today (`tools/legacy/meta-state-re-verify-tool.js`): hard-requires `status:"stale"` (L33-37), runs `verification.steps` via `core/verification-runner.js` (cmd-allowlist + `shell:false` + 10s timeout — **not** grounding; grounding is `core/check-grounding.js`/`meta_state_check_grounding`), on pass sets `status:"active"` + `last_verified_at` (L64-67), CAS via `_expected_version`. Rework: drop the stale hard-requirement (accept `isOpen`); on pass set ONLY `last_verified_at` (remove the `status:"active"` write); on fail no status change. The trigger predicate (when to call re_verify) is the derived stale view — the caller/operator decides; the tool just re-grounds.

`sweep` today (`tools/legacy/meta-state-sweep-tool.js`): `apply:true` (OPERATOR_MODE=1) writes `reported→stale` (`checkExpiry`) + `active→stale` (`checkStaleness`); the `resolved_at`/`auto-resolve` branch (L67-70) is unreachable. Rework: delete `apply:true` + the OPERATOR_MODE gate (L41); the tool becomes `dry-run`-only — returns `{ swept:false, dry_run:true, transitions: derivedStaleSet(...), summary_preview }` describing what is stale by the derived view, with no writes. `checkExpiry`/`checkStaleness` either deleted or repurposed to feed the derived report (no writes).

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-re-verify-tool.js` (drop stale req; remove status write; keep `last_verified_at` stamp + `META_STATE_VERIFY_EXEC` gate + CAS)
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` (remove `apply:true` + L41 OPERATOR_MODE gate; read-only report via `derivedStaleSet`; delete/repurpose `checkExpiry`/`checkStaleness` write paths; **remove `"stale"` from the `:12` `TERMINAL_STATUSES` Set — red-team H4 — so the derived-stale report doesn't skip stale-view entries**)
- Modify (tests — 6 definite): `__tests__/legacy-mcp/meta-state-sweep.test.js`; `meta-state-sweep-stale-transition.test.js`; `meta-state-sweep-no-stale-ref-followup.test.js`; `meta-state-sweep-summary.test.js` (Path a — remove `mkdtempSync` L7/23/44; assert read-only contract instead of `swept:true` L30); `meta-state-stale-flag.test.js` (T9 re_verify: assert `last_verified_at` stamped + status unchanged, not `stale→active` L159); `meta-state-dispatch-ttl-and-close-flow.test.js` (TTL/close: TTL no longer writes stale)
- Modify (tests — 3 review): `meta-state-integration.test.js`; `meta-state-reopen-e2e-cold-session.test.js`; `meta-state-patch-tool.test.js` — review per-test; migrate only the re_verify/sweep/TTL assertions
- Keep (no change): `fix-loop-design-refs.test.js` `mkdtempSync` (Path b — sweep-independent, writes change-logs via `writeEntry`; stays permanently)
- Scope boundary: tests that set `OPERATOR_MODE="1"` for supersede/dispatch/promote (e.g. `meta-state-stale-flag.test.js` T10, `meta-state-dispatch-ttl-and-close-flow.test.js` dispatch-commit) **keep** `OPERATOR_MODE="1"` — Plan 2 renames it to `LOOP_SESSION_MODE=live`. Only the `OPERATOR_MODE="1"` lines that existed solely to exercise sweep `apply:true` are removed.

## Implementation Steps (TDD — tests first)

1. **Write the new-contract tests first.** `re_verify`: a test asserting an `open` finding with a derived-stale view, on verification pass, gets `last_verified_at` stamped and `status` unchanged (still `open`). `sweep`: a test asserting `apply` is rejected/absent and the tool returns the derived stale report with no registry mutation (entry count + `updated_at` unchanged across a call).
2. **Rework `re_verify`**: drop the `status:"stale"` guard (L33-37) → accept `isOpen`; on pass write only `last_verified_at` (remove `status:"active"` at L64-67); keep `META_STATE_VERIFY_EXEC` + CAS.
3. **Rework `sweep`**: remove `apply:true` path + the L41 OPERATOR_MODE gate; repurpose to return `derivedStaleSet` + expiry info as a dry-run report. Delete `checkExpiry`'s/`checkStaleness`'s write paths (or repurpose to pure predicates feeding the report). **Remove `"stale"` from the `:12` `TERMINAL_STATUSES` Set (H4)** so the derived-stale report doesn't skip the stale-view entries it's meant to surface.
4. **Migrate the 6 definite tests** to the new contract. Remove `meta-state-sweep-summary.test.js` `mkdtempSync` (Path a — sweep read-only, isolation unneeded); assert the read-only report. Migrate `meta-state-stale-flag.test.js` T9 (re_verify) — T10's `OPERATOR_MODE` stays. Migrate `meta-state-dispatch-ttl-and-close-flow.test.js` TTL assertions — dispatch-commit `OPERATOR_MODE` stays.
5. **Review the 3 likely tests** per-test; migrate only re_verify/sweep/TTL assertions; leave `OPERATOR_MODE`/supersede/dispatch assertions for Plan 2.
6. Run `pnpm test`; all green. Confirm `fix-loop-design-refs.test.js` still uses `mkdtempSync` (unchanged).

## Success Criteria

- [ ] `re_verify` has no `status:"stale"` guard; on pass stamps `last_verified_at` only; finding stays `open`; `META_STATE_VERIFY_EXEC` gate preserved.
- [ ] `sweep` has no `apply:true` mode; no status writes; returns the derived stale report; `sweep-tool:41` OPERATOR_MODE gate removed.
- [ ] 6 definite tests migrated; 3 review tests reviewed + migrated where needed; `meta-state-sweep-summary.test.js` `mkdtempSync` removed.
- [ ] `fix-loop-design-refs.test.js` `mkdtempSync` unchanged (Path b permanent).
- [ ] No `OPERATOR_MODE`→`LOOP_SESSION_MODE` rename in this plan (scope boundary); only sweep's apply-gate `OPERATOR_MODE` removed.
- [ ] All `pnpm test` suites green.

## Risk Assessment

Medium. The tool-contract change is the riskiest behavioral shift. Mitigations: tests-first lock the new contract; `isOpen` + the derived view already exist (phase 1); the `OPERATOR_MODE` scope boundary prevents creep into Plan 2. The `re_verify` "stale→active" → "stamp only" change is the most likely to surface a caller expecting the old transition — mitigated by the test migration + the fact that `re_verify` is `META_STATE_VERIFY_EXEC`-gated (default off, rarely called in CI).