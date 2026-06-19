# Code Review — Phase D Plan 1 (Mastra Workflows Migration)

**Date**: 2026-06-19
**Branch**: `260618-1911-phase-d-plan-1-workflows`
**Commits reviewed**: last 8 (25e2b03..5788890)
**Reviewer**: code-reviewer subagent + self-verify
**Verdict**: **DONE_WITH_CONCERNS** — ship-blockers are minor, but real parity drifts exist that the documentation overstates.

## TL;DR

Migration is functionally complete. All declared tests pass (1080/0/1, 10/10 MCP, 8/8 direct). Count math is correct (31 `mastra_*` + 8 `run_workflow_*` = 39). D1/D2/D3 tracker flips, `meta_state_log_change`, journal, and PR body all present.

**But parity is shape-only, not deep-equal.** The 9 MCP tests in `workflow-parity.test.cjs` and 8 unit tests in `workflow-direct-parity.test.js` assert `Array.isArray` and `typeof`, not structural equality with legacy output. A field-level regression in any workflow would not be caught by the harness.

**One real behavioral drift:** `workflow_prepare_runtime_request` now Zod-validates `evidence_missing` (required) at the workflow boundary, whereas the legacy tool handler accepted a missing field and fell back to JS truthy/falsy. Any caller that omitted the field silently before will now hit a validation error.

## Critical (blocks merge)

**None.** All declared parity tests pass. The `tools/list` enumeration test locks 31 + 8 = 39. Empirical probe confirms workflow output extraction works.

## Important (should fix before merge)

### 1. `evidence_missing` behavioral drift in `workflow_prepare_runtime_request`
- **File**: `tools/learning-loop-mastra/workflows/workflow-prepare-runtime-request.js:77`
- **Legacy** (`5788890:tools/learning-loop-mastra/workflows/workflow-prepare-runtime-request.js:13`): `const { ..., evidence_missing, ... } = args;` — no Zod parse. `!evidence_missing` is `!undefined === true` → "Evidence collected." (pass).
- **New**: same `z.boolean()` schema declaration, but `createWorkflow` runs Zod parse on the input. Missing field → validation error.
- **Test coverage**: `workflow-parity.test.cjs:99-105` always provides `evidence_missing: false`. Drift would not be caught.
- **Fix**: Either (a) add `.optional().default(false)` to the schema, or (b) accept the stricter contract and document it in the plan as a "wiring-time parity loss." Option (a) preserves legacy semantics.
- **Same concern** for `temp_root_class` and `output_level` — legacy handlers tolerated missing values via JS coercion; new path will reject.

### 2. Parity tests are shape-only, not deep-equal
- **Files**:
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js`
  - `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs`
- **Evidence**: A `legacyToResult` helper is defined at `workflow-direct-parity.test.js:27-32` and a `parseWorkflowResult` at `workflow-parity.test.cjs:38-40`, but **neither helper is ever called** in any test body. Both files test only "shape" (`Array.isArray`, `typeof`, scalar equality).
- **Impact**: A workflow that drops a field the legacy handler emitted (e.g., the `risks` array in `workflow_self_improvement`, or the `missing_decisions` array in `workflow_intake_orient`) will pass the parity harness.
- **Fix**: Pick 1 workflow per file and add 1 deep-equal test (input → expected output, by-value). The existing `legacyToResult` helper is the inverse of the MCP envelope strip and is the right primitive. Add `assert.deepStrictEqual(started.result, EXPECTED)`. Minimum: 8 more assertions (1 per workflow). Filed as Plan 1a candidate.

### 3. `parseWorkflowResult` and `legacyToResult` are dead helpers
- **Files**: `workflow-direct-parity.test.js:27-32`, `workflow-parity.test.cjs:38-40`
- **Issue**: Both helpers defined but never called. The MCP helper is a no-op identity function (`return rawResult`) — the `with-mcp-server.js:89` harness already strips the envelope. The direct-test helper would be the right primitive for deep-equal parity, but isn't used.
- **Fix**: Either use them (per #2) or delete them. Dead code is technical debt; dead code in test files is misleading.

### 4. `console.log` in empirical probe test pollutes CI
- **File**: `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:54`
- **Issue**: `console.log("EMPIRICAL PROBE:", JSON.stringify(result, null, 2));` runs on every CI invocation. Comment on line 35 says "Locked 2026-06-19" — the format is locked, the log is no longer needed.
- **Fix**: Remove the log, or guard it with `if (process.env.DEBUG)`.

### 5. Journal claim "caught a schema mismatch in `workflow_intentional_skip` before it hit the PR" — not supported
- **File**: `docs/journals/260619-phase-d-plan-1-shipped.md:41`
- **Evidence**: `git log --oneline --all -- tools/learning-loop-mastra/workflows/workflow-intentional-skip.js` shows only one change (the Phase 3 commit). No follow-up fix exists. The harness would have caught a mismatch — but there was nothing to catch.
- **Impact**: The journal reads as fabricated learning theater. Inflated claims of value.
- **Fix**: Remove the specific example or replace with an honest statement ("harness would have caught a mismatch; not exercised in this PR"). The principle (parity harnesses pay for themselves) is sound; the example is not.

### 6. `proxiedContext?.get("runId")` in server.js
- **File**: `tools/learning-loop-mastra/server.js:96`
- **Issue**: `const run2 = await workflow.createRun({ runId: proxiedContext?.get("runId") });` — `proxiedContext` defaults to empty `new RequestContext()`. `runId` is undefined in the common case. Mastra likely accepts undefined and generates one, but this is implementation-defined and not asserted by any test.
- **Impact**: Low for current callers (Mastra tolerates undefined runId). Medium for any future agent that depends on stable runIds for caching/idempotency.
- **Fix**: Either (a) explicitly generate a runId via `crypto.randomUUID()` when undefined, or (b) add a test that calls a workflow twice and asserts runIds differ. Not blocking.

## Minor (style, nits)

### 7. `description` validation is duplicated
- **Files**: `create-loop-workflow.js:59-61` (factory) and `server.js:68-72` (server).
- **Issue**: Both layers throw on missing/empty description. The factory fires at workflow definition time; the server fires at server startup. Two layers is OK but pick one to be canonical.
- **Fix**: Keep the factory check (fails fast at definition). Remove or downgrade the server check to a warning.

### 8. Workflow `id` not shape-validated
- **File**: `create-loop-workflow.js:58`
- **Issue**: No regex check that `id` matches `[a-z][a-z0-9_]*`. All 8 in-scope ids match. Future additions could silently violate the MCP `run_<id>` naming.
- **Fix**: Add `if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(...)` to the factory.

### 9. Journal line 25 says "11 workflow groups" — should be "11 workflow group entries"
- **File**: `docs/journals/260619-phase-d-plan-1-shipped.md:25`
- **Fix**: Word choice. Pr-body is correct.

### 10. Cold-session test does not enumerate new `run_workflow_*` tools
- **Evidence**: `pnpm test:cold-session` passes 7/7 but the test reads from `.factory/mcp.json` and asserts on the legacy 31-entry surface. The new 8 `run_*` tools are exercised by `workflow-parity.test.cjs`, not by the cold-session test.
- **Impact**: An agent using the cold-session discoverability test will not see `run_workflow_*` in its quickstart suggestions. Plan claims "cold-session 31 legacy manifest tools register correctly" — that's the OLD surface, not the new one.
- **Fix**: Either (a) update `cold-session-discoverability.test.cjs` to enumerate the full 39-tool mastra surface, or (b) document the cold-session coverage gap. Filed as Plan 1a or Plan 4.

## Praise

- **Reuse pattern over reinvention.** `createLoopWorkflow` cleanly mirrors `createLoopTool`'s parity-shim discipline. `attachParityJSONSchema` and `normalizeSchema` are properly shared. No new abstractions invented.
- **Thin stateSchema default.** Shipping all 8 with `stateSchema = input` is the right call. The comment in `workflow-self-improvement.js:31-33` explaining the deferral ("one-line addition at the call site") is concrete and helps future maintainers.
- **Plan discipline.** 6-phase plan with per-phase status, separate commit per phase, explicit Q1 conflict resolution section. Reviewable in chunks.
- **`tools/list` enumeration test** locks count math. Exactly the regression guard that catches manifest drift.
- **Plan correctly resolved count math** post-red-team (39 → 31 + 8, not 47).

## Verification status (all claims verified)

| Claim | Source | Status |
|-------|--------|--------|
| 31 `mastra_*` + 8 `run_workflow_*` = 39 | plan.md:58 | ✅ tools/list enumeration test |
| All 10 test namespaces pass | pr-body.md:12 | ✅ 1080 pass / 0 fail / 1 skipped |
| 8/8 direct parity tests | plan.md:140 | ✅ workflow-direct-parity.test.js:8/8 |
| 9 MCP parity tests | plan.md:140 | ✅ workflow-parity.test.cjs:10/10 |
| D1/D2/D3 flipped to `[x]` | tracker:201-203 | ✅ verified |
| `meta_state_log_change` entry filed | pr-body.md:40 | ✅ entry exists in meta-state.jsonl |
| `mcp-tools-list-parity.test.js` updated | :29-30 | ✅ `mastra_workflow_intake_plan` → `run_workflow_intake_plan` |
| Workflow manifest has 8 entries | workflows-manifest.json | ✅ grep -c |
| Legacy agent-manifest reduced to 3 entries | tools/learning-loop-mcp/agent-manifest.json | ✅ line 14-16 |
| Mastra tools/manifest.json has 31 entries | tools/manifest.json | ✅ grep -c |
| Mastra agent-manifest workflow group has 11 entries | agent-manifest.json | ✅ 8 `run_workflow_*` + 3 `mastra_workflow_*` |
| Mastra agent-manifest has 5 groups | agent-manifest.json | ✅ gate/workflow/meta_state/introspection/runtime_agnostic |

## Recommended actions

### Before merge (cheap, ~30 min)

1. Add `.optional().default(false)` to `evidence_missing` in `workflow-prepare-runtime-request.js:77` (or document why the contract is stricter now).
2. Remove or guard the `console.log` in `workflow-parity.test.cjs:54`.
3. Remove the dead `parseWorkflowResult` helper in `workflow-parity.test.cjs:38-40` (or wire it in).
4. Soften the journal claim about `workflow_intentional_skip` schema mismatch on line 41.
5. Fix journal line 25 wording ("11 workflow groups" → "11 workflow group entries").

### Plan 1a candidates (deferrable, not blocking)

1. Add 1 deep-equal parity test per workflow (8 more assertions, using `legacyToResult`).
2. Add envelope-input tests for `workflow_self_improvement` and `workflow_intake_plan` (proves `stripEnvelope` preprocess handles MCP envelope form).
3. Update `cold-session-discoverability.test.cjs` to enumerate the new 39-tool mastra surface.
4. Add a regex check for `id` shape in `createLoopWorkflow` factory.

## Unresolved questions

1. **Operational model for `gate:server` script** — `tools/learning-loop-mastra/server.js` runs as stdio MCP. No process manager, no health check, no restart policy. Plan should explicitly state the operational model.
2. **RunId stability** — `server.js:96` passes `undefined` for `runId` in the common case. Is downstream idempotency/caching affected? Plan 3 agents may need to address.
3. **Workflow `stateSchema` deferral** — Multi-step restructuring for `self_improvement` and `runtime_probe` is filed for Plan 3. Is that the right call given agent consumers may want cross-step state from day 1?
4. **Phase-report workflow utility** — `workflow_report_phase_status` returns `lifecycle_complete: bool`. With workflow execution now going through `createWorkflow`, the "phase" abstraction may no longer map cleanly. Confirm with Plan 3 author.
5. **Cold-session discoverability coverage** — The new 8 `run_workflow_*` tools are not enumerated by the cold-session test. Does the agent quickstart surface them? Plan 4 likely addresses this; flag it.

## Files reviewed

- `tools/learning-loop-mastra/create-loop-workflow.js` (factory)
- `tools/learning-loop-mastra/server.js` (LoopMCPServer)
- `tools/learning-loop-mastra/workflows/workflow-*.js` (8 wrappers)
- `tools/learning-loop-mastra/workflows-manifest.json` (new)
- `tools/learning-loop-mastra/tools/manifest.json` (31 entries)
- `tools/learning-loop-mastra/agent-manifest.json` (5 groups)
- `tools/learning-loop-mcp/agent-manifest.json` (3 workflow entries)
- `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (5 tests)
- `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (8 tests)
- `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (10 tests)
- `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (updated for `run_workflow_*`)
- `tools/learning-loop-mcp/__tests__/tool-deletion-coverage.test.js` (31-entry assertion)
- `docs/journals/260619-phase-d-plan-1-shipped.md`
- `plans/260618-1911-phase-d-plan-1-workflows/plan.md`
- `plans/260618-1911-phase-d-plan-1-workflows/pr-body.md`
- `plans/reports/productization-260612-1530-master-tracker.md` (D1/D2/D3 flipped)
- `meta-state.jsonl` (log_change entry)
