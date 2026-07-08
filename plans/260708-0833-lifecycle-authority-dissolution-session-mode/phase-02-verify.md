---
phase: 2
title: "Verify"
status: complete
effort: "medium"
---

# Phase 2: Verify

<!-- Updated: Validation Session 1 - session-mode unit test moved __tests__/legacy-mcp/ -> __tests__/lib/ (matches gate-logging.test.js, the tools/lib test home) -->

## Overview

Prove the fail-closed behavior holds and the rename is grep-clean. Run focused tests for the 3 gated tools, broaden to the full `legacy-mcp` suite, add a `session-mode` unit test for the unset/autonomous/live/garbage cases, and confirm no `OPERATOR_MODE` or `operator_role_required` residue in the live surface.

## Requirements

- Functional: behavioral proof that `autonomous`/unset refuses and `live` allows, for all 3 gated tools; open tools unaffected in both modes.
- Non-functional: no test weakened; no env leakage between tests; gate-log historical entries tolerable.

## Architecture

No new architecture — verification only. One new unit test file for `isLiveSession` boundary cases.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/lib/session-mode.test.js` (unit test for `isLiveSession`: unset → false, `"autonomous"` → false, `"live"` → true, `""` → false, `"Live"`/`"LIVE"` → false (case-sensitive strict equality), garbage → false; restore env in teardown). Path matches `__tests__/lib/gate-logging.test.js` — the established test home for `tools/lib/` modules.
- Modify: none (test-only; if phase 1 left any in-test assertion stale, fix here)

## Implementation Steps

1. Add `session-mode.test.js` covering the 4+ boundary cases of `isLiveSession` with env teardown.
2. Run focused tests for each gated tool:
   - `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-promote-rule-rule-entry.test.js`
   - `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/integration-promoted-rule.test.js`
   - `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-dispatch-finding-tool.test.js`
   - `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-dispatch-ttl-and-close-flow.test.js`
   - `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-stale-flag.test.js` (supersede coverage)
3. Broaden to the full `legacy-mcp` suite (the repo's established test runner — check `package.json` / existing CI invocation; match it). Expect green.
4. Grep audit (must be clean):
   - `grep -rn "OPERATOR_MODE" tools/learning-loop-mastra --include=*.js --include=*.cjs --include=*.mjs | grep -v __tests__` → empty (non-test surface).
   - `grep -rn "operator_role_required" tools/learning-loop-mastra/__tests__` → empty (all assertions renamed to `live_session_required`).
   - `grep -rn "OPERATOR_MODE" tools/learning-loop-mastra/__tests__` → empty (all migrated).
   - `docs/journals/**` OPERATOR_MODE hits are historical and expected — do NOT edit journals.
5. Confirm open tools have no `isLiveSession` gate: `grep -rn "isLiveSession" tools/learning-loop-mastra --include=*.js | grep -v __tests__` → exactly 4 hits (the helper definition + the 3 call sites), nothing in resolve/re_verify/archive/report/log_change/propose_design/patch handlers.
6. Confirm no grant-checking code path was introduced: no new `*_by` ledger writes beyond what the tools already do; no `delegated_to` grant logic.

## Success Criteria

- [ ] `session-mode.test.js` passes all boundary cases.
- [ ] 5 focused gated-tool tests green.
- [ ] Full `legacy-mcp` suite green; no test weakened (no `.skip`/`.only`/deleted assertions added to pass).
- [ ] Grep audit step 4 clean for the live surface; journals untouched.
- [ ] `isLiveSession` appears in exactly 4 non-test locations (def + 3 gates); no open tool gated.
- [ ] Acceptance criteria 1-6 from `plan.md` all satisfied.

## Risk Assessment

- **Env leakage between tests.** If a migrated test leaves `LOOP_SESSION_MODE=live` set, a later refusal test silently passes-when-it-shouldn't, or vice versa. Mitigation: step 1 teardown; if the full suite flakes, isolate by running with `--test-isolation` (or the repo's equivalent) and audit teardowns.
- **Case-sensitivity surprise.** A consumer setting `LOOP_SESSION_MODE=Live` gets fail-closed. Mitigation: this is intended (strict equality, fail-closed on unknown); document it in the `session-mode.js` comment and cover `"Live"` in the unit test so the behavior is pinned.
- **CI invocation mismatch.** Running tests with a different runner than CI can hide a CI-only failure. Mitigation: step 3 uses the repo's actual CI test command from `.github/workflows/` — read it before running, don't assume `node --test`.