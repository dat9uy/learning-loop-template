---
phase: 1
title: Red (TDD tests first)
status: in-progress
priority: P1
effort: 2.5h
dependencies: []
---

# Phase 1: Red (TDD tests first)

## Overview

Write all ~16 new test cases across 4 new test files + 1 added assertion in an existing test file. **All tests must FAIL initially (red)**. This is the design surface — the test list encodes the contract for the `stale` status, the new `meta_state_re_verify` and `meta_state_supersede` MCP tools, the extracted `core/verification-runner.js`, the list-tool path fix, and the cmd-allowlist. No implementation in this phase.

## Requirements

- **Functional:** ~16 new test cases covering schema, sweep transitions, derive-status recommendation, verification-runner allowlist, re_verify round-trip, supersede, list-tool path fix, cold-session regression, index-validate smoke.
- **Non-functional:** every new test file follows the project's test conventions (descend from `node:test` + `node:assert/strict`; use `mkdtempSync` + `process.env.GATE_ROOT` for isolation; reset `process.env.OPERATOR_MODE` and `process.env.META_STATE_VERIFY_EXEC` in `finally`).

## Architecture

Tests are the design surface. The test list below IS the contract; the implementation in Phase 2 must satisfy it exactly. Tests are written in this order (most atomic first, integration last):

1. `meta-state-stale-flag.test.js` — schema + summarize + derive-status + terminal-set discipline (10 tests)
2. `meta-state-sweep-stale-transition.test.js` — sweep tool's 2 stale paths + idempotency (3 tests)
3. `meta-state-re-verify-tool.test.js` (or merged into stale-flag) — re_verify round-trip (in this plan: 1 test in stale-flag, full round-trip in a follow-up test)
4. `meta-state-supersede-tool.test.js` (or merged into stale-flag) — supersede end-to-end (1 test in stale-flag)
5. `cold-session-discoverability.test.cjs` — 1 added regression assertion
6. `index-validate-smoke.test.js` — 1 smoke test

For the re_verify and supersede tool tests, the workspace convention (per `meta-state-batch-tool.test.js` and `meta-state-ack-tool.test.js`) is one test file per tool. To keep Phase 1 small and self-contained, this plan merges the re_verify and supersede tests into `meta-state-stale-flag.test.js` (1 round-trip + 1 supersede) and adds a follow-up test file in a future plan if needed.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-stale-flag.test.js` (10 tests)
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-sweep-stale-transition.test.js` (3 tests)
- **Create:** `tools/learning-loop-mcp/__tests__/index-validate-smoke.test.js` (1 test)
- **Modify:** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (1 added assertion)
- **Read for pattern reference:** `__tests__/meta-state-sweep.test.js`, `__tests__/meta-state-patch-tool.test.js`, `__tests__/derive-status.test.js`, `__tests__/meta-state-schema.test.js`

## Implementation Steps

### Step 1.1 — Create `__tests__/meta-state-stale-flag.test.js` (10 tests)

Setup pattern (mirrors `__tests__/derive-status.test.js`):

```js
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateFindingEntrySchema,
  TERMINAL_STATUSES,            // internal export from core/meta-state.js (Phase 2 adds `export const` if not present)
  readRegistry,
  checkExpiry,
} from "../core/meta-state.js";
import { summarize } from "../core/loop-introspect.js";
import { deriveStatus, META_STATE_RECOMMENDATIONS } from "../core/derive-status.js";
import { runVerification } from "../core/verification-runner.js";  // NEW in Phase 2
import { metaStateReVerifyTool } from "../tools/meta-state-re-verify-tool.js";  // NEW in Phase 2
import { metaStateSupersedeTool } from "../tools/meta-state-supersede-tool.js";  // NEW in Phase 2
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateAckTool } from "../tools/meta-state-ack-tool.js";
import { readPatterns } from "../lib/patterns.js";  // NEW in Phase 2
```

Test list (T1-T10):

- **T1. schema accepts `status: "stale"` and rejects unknown values.**
  - `metaStateFindingEntrySchema.safeParse({ ..., status: "stale" })` → `success: true`
  - `metaStateFindingEntrySchema.safeParse({ ..., status: "stale-of-the-century" })` → `success: false`

- **T2. schema accepts the 4 new optional fields (presence only; inner shape is JSDoc-typed, not zod-enforced).**
  - Build a finding with `last_verified_at`, `verification: { steps: [] }`, `superseded_at`, `superseded_by` — must pass.
  - Build a finding without those fields — must still pass (additive).

- **T3. `summarize` includes `last_verified_at` when present.**
  - `summarize({ id, entry_kind, status, last_verified_at: "2026-06-09T00:00:00Z" })` → result includes `last_verified_at`.

- **T4. `META_STATE_RECOMMENDATIONS` enum includes `re_verify`.**
  - `META_STATE_RECOMMENDATIONS.includes("re_verify")` → `true`.

- **T5. `deriveStatus` on stale + mechanism-shipped → `recommendation: "re_verify"`.**
  - Build an entry with `status: "stale"`, `evidence_code_ref: "src.js"`, write `src.js` to temp dir.
  - `deriveStatus(entry, codeContext)` → `recommendation === "re_verify"`.

- **T6. `TERMINAL_STATUSES` in `core/meta-state.js#7` does NOT include `stale`.**
  - `TERMINAL_STATUSES.has("stale")` → `false` (terminal-set discipline).

- **T7. `checkExpiry` returns `null` for stale entries (they don't re-expire).**
  - Build an entry with `status: "stale"` and `expires_at` in the past.
  - `checkExpiry(entry)` → `null` (the new behavior; previously would have returned `"expired"`).

- **T8. `runVerification` rejects `cmd` not in the allowlist.**
  - Call `runVerification(tempDir, { cmd: "rm", args: ["-rf", "/"] })` → returns `{ status: "failed", signal: "cmd_not_allowlisted" }` without spawning.
  - Call `runVerification(tempDir, { cmd: "node", args: ["-e", "process.exit(0)"] })` → returns `{ status: "passed", signal: "0" }`.

- **T9. `meta_state_re_verify` round-trip: stale + passing step → active; stale + failing step → stays stale + history appended.**
  - Subtest A: create a finding with `status: "stale"`, `verification: { steps: [{ cmd: "node", args: ["-e", "process.exit(0)"] }] }`. Set `META_STATE_VERIFY_EXEC=1`. Call `metaStateReVerifyTool.handler({ id })`. Assert: `re_verified: true`, `status: "active"`, `last_verified_at` is set, `verification.history.length === 1`, history entry has `status: "passed"`.
  - Subtest B: same but step is `cmd: "node", args: ["-e", "process.exit(1)"]`. Assert: `re_verified: false`, `status: "stale"` (unchanged), `last_verified_at` NOT updated, `verification.history.length === 1`, history entry has `status: "failed"`.
  - Subtest C (gate): same setup with `META_STATE_VERIFY_EXEC` unset. Assert: returns `{ re_verified: false, reason: "verify_exec_required" }` and registry unchanged.

- **T10. `meta_state_supersede` end-to-end: finding → superseded + consolidated_into + change-log target validated.**
  - Subtest A: create a finding with `status: "expired"`; create a change-log entry; call `metaStateSupersedeTool.handler({ id: finding_id, consolidated_into: change_log_id, _expected_version: 0 })`. Assert: `superseded: true`, `status: "superseded"`, `superseded_at` set, `superseded_by: "operator"`, `consolidated_into === change_log_id`.
  - Subtest B (consolidated_into must be a change-log): call with `consolidated_into: "not-a-change-log-id"`. Assert: `{ superseded: false, reason: "consolidated_into_not_a_change_log" }`.
  - Subtest C (gate): set `OPERATOR_MODE=0` and call. Assert: `{ superseded: false, reason: "operator_role_required" }`.
  - Subtest D (CAS mismatch): call with `_expected_version: 99`. Assert: `{ superseded: false, reason: "version_mismatch" }`.

### Step 1.2 — Create `__tests__/meta-state-sweep-stale-transition.test.js` (3 tests)

Setup pattern mirrors `__tests__/meta-state-sweep.test.js` (`process.env.OPERATOR_MODE` reset in `finally`).

- **S1. reported past `expires_at` → `stale` (no `resolved_at`/`resolved_by` stamp).**
  - Create a finding with `status: "reported"`, `expires_at` in the past.
  - `metaStateSweepTool.handler({ apply: true })` with `OPERATOR_MODE=1`.
  - Assert: result has `applied: true` to `"stale"`; entry's `status === "stale"`, `resolved_at` is `undefined`, `resolved_by` is `undefined`.

- **S2. active past `STALENESS_WINDOW_MS` → `stale`.**
  - Set `META_STATE_STALENESS_WINDOW_MS=10` (10ms for the test).
  - Create a finding with `status: "active"`, `acked_at` 1 day ago.
  - `metaStateSweepTool.handler({ apply: true })`.
  - Assert: result has `applied: true` to `"stale"`.

- **S3. re-run is idempotent (stale entries are not re-processed).**
  - Create a finding that has been swept to `stale`.
  - `metaStateSweepTool.handler({ apply: true })` — assert: 0 transitions.

### Step 1.3 — Add 1 assertion to `__tests__/cold-session-discoverability.test.cjs`

The test file has 4 references to `status: "expired"` in its churn-loop test fixtures (lines 574, 688, 698, 778 per the grep). Under the new model, the sweep tool no longer creates `expired` entries — it creates `stale` entries. The churn loop asserts that the idempotency key (`session_id`) prevents re-creation. The new assertion:

```js
test("stale entries do not trigger session-id churn (regression for TTL recursion)", () => {
  // The 4 L2 auto-cold-session-test churn entries in the live registry
  // (status='expired' in the old model; status='stale' in the new model)
  // should not re-create under the new model.
  // Create a synthetic stale entry with session_id="test-cold-session-stale"
  // and assert: 1 subsequent list call with that session_id filter returns
  // the same entry, not 2 (no re-creation).
  // ...
});
```

**The 4 existing `status: "expired"` references in the churn fixtures MUST be updated to `status: "stale"`** as part of Phase 2's `cold-session-discoverability.test.cjs` edits (parallel to the `meta-state-sweep.test.js` edit in sub-step 1.1). Document this in Phase 2 as an additional sub-step.

The assertion lives alongside the existing churn assertions; it does not change the file's overall structure.

### Step 1.4 — Create `__tests__/index-validate-smoke.test.js` (1 test)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "../lib/resolve-root.js";
import { indexValidateTool } from "../tools/validate-records-tool.js";

test("registry validates against new schema after Phase 2 schema widening", async () => {
  if (!existsSync(join(resolveRoot(), "meta-state.jsonl"))) {
    // No registry in test env — skip
    return;
  }
  const result = await indexValidateTool.handler({ schema: "meta-state" });
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(parsed.valid, true, "registry must validate");
  assert.strictEqual(parsed.errors.length, 0);
});
```

### Step 1.5 — Verify all tests fail (red)

Run `pnpm test 2>&1 | tail -100` (or `node --test tools/learning-loop-mcp/__tests__/meta-state-stale-flag.test.js` for the new file in isolation). Expect:

- New `meta-state-stale-flag.test.js`: 10 errors (modules `verification-runner.js`, `meta-state-re-verify-tool.js`, `meta-state-supersede-tool.js` not found; `TERMINAL_STATUSES` not exported; `re_verify` not in `META_STATE_RECOMMENDATIONS`).
- New `meta-state-sweep-stale-transition.test.js`: 3 errors (sweep still emits `resolved_at`/`resolved_by`; no `STALENESS_WINDOW_MS`).
- New `index-validate-smoke.test.js`: 0-1 errors (the smoke test should pass against the current registry because the schema is currently narrow — but the test asserts it validates after the widening; if the registry validates now, it will still validate after widening).
- Modified `cold-session-discoverability.test.cjs`: +1 added assertion (which will pass trivially until Phase 2's behavior lands; the assertion encodes the contract).

Total expected: 13 new failures + 1 new pass = 14 new test cases. The full suite should show `~840 pass / ~13 fail`.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/meta-state-stale-flag.test.js` exists with 10 tests, all currently failing.
- [ ] `tools/learning-loop-mcp/__tests__/meta-state-sweep-stale-transition.test.js` exists with 3 tests, all currently failing.
- [ ] `tools/learning-loop-mcp/__tests__/index-validate-smoke.test.js` exists with 1 test, currently passing or failing per design.
- [ ] `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` has 1 added assertion (currently passing trivially).
- [ ] `pnpm test` shows ~13 new failures (TDD red), no regressions in the existing ~840 tests.
- [ ] No new modules exported from `core/` or `tools/` — only test files created (the test files import modules that don't exist yet, which is the red).

## Risk Assessment

- **Risk**: the test for `TERMINAL_STATUSES.has("stale") === false` will fail in Phase 1 because the constant is not exported. **Mitigation**: the test should import `TERMINAL_STATUSES` from `core/meta-state.js`. Phase 2 adds the export (or the test can read the constant via a different path — e.g., the test reads `core/meta-state.js` source text and asserts the string is absent from line 7; that's a brittle pattern, so prefer the export). **Decision**: Phase 2 exports `TERMINAL_STATUSES` from `core/meta-state.js` for testability.

- **Risk**: the 1 added cold-session assertion might cause a flaky test if the session_id filter is not deterministic. **Mitigation**: use a fresh `session_id` string (`test-cold-session-stale-{Date.now()}`) so the test never collides with prior runs.

- **Risk**: the `runVerification` test for `node -e process.exit(0)` may fail on environments where `node` is not on PATH. **Mitigation**: the test uses a `try/catch` to set the test status to `passed` (since the cmd-allowlist check passes); the actual spawn may fail in the test env, but the cmd-allowlist test specifically asserts the `cmd_not_allowlisted` branch first (using `rm`), and the positive case asserts the structure of the return value (status field, signal field) not the actual exit code. Alternative: use `echo` (in the allowlist) which is universally available.

- **Risk**: the `META_STATE_STALENESS_WINDOW_MS=10` test (S2) is time-sensitive. **Mitigation**: the test sleeps 50ms after the ack before sweeping; deterministic.
