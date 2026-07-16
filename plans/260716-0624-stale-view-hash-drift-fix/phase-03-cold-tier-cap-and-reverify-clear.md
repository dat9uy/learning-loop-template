---
phase: 3
title: "Re-enable drift branch in cold-tier cap + make meta_state_re_verify refresh index on pass (opt-in)"
status: pending
priority: P2
dependencies: [1, 2]
---

# Phase 03: Cold-tier cap + opt-in re_verify index refresh

<!-- RT: M1 — reorder re_verify to call applyUpdateAndCheck FIRST; only call upsertFileIndexEntry after the entry patch is confirmed -->
<!-- RT: M3 — gate re_verify index upsert behind explicit operator opt-in via refresh:true; default behavior unchanged (only stamps last_verified_at) -->
<!-- RT: M4 — keep age-only cap as age forcing function (post-fix cap = age precompute + 2); add separate drift-stale assertion (tight, e.g., <=0) so the regression class this plan fixes cannot silently return -->
<!-- RT: M6 — TOCTOU race: doc the concurrent-sweep constraint; alternatively acquire meta-state write enqueue at sweep start -->
<!-- RT: M8 — add meta-state-re-verify-tool.test.js as explicit deliverable (file does NOT exist) -->
<!-- RT: M13 — pnpm test:iter does NOT run seed; document this constraint and add a pre-Phase-7 gate -->
<!-- RT: M14 — emit gate-log entry on every re_verify refresh success (audit trail) -->
<!-- RT: M18 — add explicit rollback path to this phase -->

## Overview

Two coupled changes:
1. Re-enable the drift branch in `cold-tier-regression.test.js` Phase 7 (with hash-aware semantics) **while preserving the age-only forcing function** so future regressions in the predicate cannot silently return. Add a separate tight drift-stale assertion. (RT: M4)
2. Make `meta_state_re_verify` (when called with `refresh: true`) call `upsertFileIndexEntry` after the entry patch has been confirmed via CAS — so re-verify clears the drift signal only when the operator opts in and when the entry update is durable. (RT: M1, M3, M14)

## Requirements

### Functional — cold-tier cap (RT: M4)
- The Phase 7 cap assertion in `cold-tier-regression.test.js:99-106` is restructured into TWO assertions:
  1. **Age-stale cap** (existing forcing function): age-stale `mc=true` findings ≤ precompute + 2 headroom (computed post-fix). Same shape as today; preserves the regression-detection for `meta_state_sweep` re-staling via old `created_at`.
  2. **Drift-stale cap** (NEW, tight): drift-stale `mc=true` findings ≤ 0 in CI. The seed step normalizes the index baseline to current bytes, so in CI drift-stale count is 0 by construction. A future regression that re-introduces path-presence-style detection would push this count > 0 and fail loudly.
- Both assertions run on real `fileIndex` and `codeHashes` (no `new Map()` workaround).
- Pre-state both expected values to avoid a false-alarm "investigate" branch (per plan 260710-0104's lesson).

### Functional — re_verify opt-in clear-on-pass (RT: M1, M3)
- Add `refresh: z.boolean().optional().default(false)` to the `meta_state_re_verify` schema.
- Default behavior (without `refresh: true`): unchanged. Tool stamps `last_verified_at` only; no index mutation.
- Opt-in behavior (with `refresh: true`):
  - Tool runs the verification step sequence.
  - On pass, tool calls `applyUpdateAndCheck` FIRST. Only if the entry update succeeds (CAS passes), tool calls `upsertFileIndexEntry(root, canonical, currentHash)`. (RT: M1 — reorder; prevents orphan baseline on CAS conflict)
  - On fail, tool does NOT touch the index. The entry remains in whatever state the operator expected.
  - The result includes `index_refreshed: boolean`.
  - The tool emits a gate-log entry on success (audit trail; matches `meta_state_refresh_file_index` observability). (RT: M14)
- Best-effort on file errors: missing/unreadable file → log via gate-log; return `index_refreshed: false`; do NOT fail re_verify.

## Architecture

### Cold-tier cap test diff (lines 86-106)

```diff
-  // Phase 7: derived-stale view cap, scoped AGE-ONLY. ...
+  // Phase 7: derived-stale view cap, TWO assertions (RT: M4).
+  // The age-stale cap preserves the regression-detection forcing function
+  // for sweep re-staling via old created_at. The drift-stale cap (tight) is
+  // a separate forcing function for the regression class this plan fixes:
+  // post-seed normalizes index baseline to current bytes, so drift-stale
+  // count is 0 by construction. Any drift > 0 indicates the predicate has
+  // regressed to path-presence or another wrong semantics.
+  //
+  // Both assertions run on real { fileIndex, codeHashes } — no new Map() workaround.
+  const derivedStaleAge = derivedStaleSet(current.all_findings, {
+    now: Date.now(),
+    fileIndex,
+    codeHashes: computeCurrentHashes(current.all_findings, root).ok,
+  }).filter((f) => f.mechanism_check === true || f.mechanism_check === null);
   assert.ok(
-    derivedStaleMc.length <= 16,
-    `Phase 7: age-stale cap broken — ...`
+    derivedStaleAge.length <= <N_age + 2>,
+    `Phase 7a: age-stale cap broken — ...`
   );
+
+  // Drift-only assertion: the seed step normalizes the index baseline to
+  // current bytes, so drift-stale count is 0 by construction. A regression
+  // that re-introduces path-presence-style detection (or hash comparison
+  // against the wrong baseline) would push this count > 0. Tight cap.
+  const derivedStaleDrift = current.all_findings
+    .filter((f) => (f.mechanism_check === true || f.mechanism_check === null) && !isAgeStale(f))
+    .filter((f) => hasDrifted(f, fileIndex, computeCurrentHashes(current.all_findings, root).ok));
+  assert.strictEqual(
+    derivedStaleDrift.length,
+    0,
+    `Phase 7b: drift-stale count ${derivedStaleDrift.length} > 0 (post-seed expected). Path-presence-style regression suspected: ${derivedStaleDrift.map((f) => f.id).join(", ")}`
+  );
```

`<N_age>` is the post-fix age precompute. Procedure: run `meta_state_sweep` once after Phase 1+2 land; record `stale_view_count` and subtract 0 (drift count); use the remainder as age precompute. With real drift count = 0 (post-seed), age precompute ≈ the count observed in the run.

### re_verify refresh (RT: M1, M3, M14)

```js
// tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js
// New imports:
import { computeFileHash, TERMINAL_HASH_REGEX } from "../../core/check-grounding.js";
import { upsertFileIndexEntry, canonicalIndexKey } from "../../core/meta-state.js";
import { resolveSafePath, PathContainmentError } from "../../core/path-containment.js";
import { stripEvidenceAnchor } from "../../core/gate-logic.js";

// Schema: add refresh opt-in (default false)
schema: {
  id: z.string().describe("Entry id to re-verify"),
  refresh: z.boolean().optional().default(false)
    .describe("Opt-in: refresh file-index baseline for evidence_code_ref on success. Default false (consult-gate preserved)."),  // RT: M3
  _expected_version: z.coerce.number().optional(),
}

// Inside handler, after the verification loop, BEFORE applyUpdateAndCheck, set:
const refreshRequested = refresh === true && allPassed;
const patch = {
  verification: { ...entry.verification, history },
  _expected_version: expectedVersion,
};
if (allPassed) {
  patch.last_verified_at = now;
}
const updateOutcome = await applyUpdateAndCheck(root, id, patch, "meta_state_re_verify");
if (!updateOutcome.ok) {
  return replyWithLog(root, "meta_state_re_verify", { re_verified: false, reason: updateOutcome.reason, id, current_version: updateOutcome.current_version });
}
// RT: M1 — index refresh AFTER entry update confirmed (CAS passed)
let indexRefreshed = false;
if (refreshRequested && typeof entry.evidence_code_ref === "string") {
  const canonical = canonicalIndexKey(entry.evidence_code_ref);
  try {
    // RT: M2 — route through resolveSafePath
    const absPath = resolveSafePath(root, canonical);
    const currentHash = computeFileHash(absPath);
    const ok = await upsertFileIndexEntry(root, canonical, currentHash);
    if (!ok) {
      // RT: failure — log via gate-log
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", action: "index_refresh_skipped", id, reason: "upsert_returned_false" });
    } else {
      indexRefreshed = true;
      // RT: M14 — audit-trail gate-log entry on success
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", action: "index_refreshed", id, canonical, current_hash: currentHash });
    }
  } catch (err) {
    // Best-effort skip; re_verify already returned re_verified:true above
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_re_verify",
      action: "index_refresh_skipped",
      id,
      reason: err instanceof PathContainmentError ? `containment_violation:${err.reason}` : (err?.code ?? err?.message ?? "unknown"),
    });
  }
}
const result = {
  re_verified: allPassed,
  id,
  status: entry.status ?? "open",
  history_appended: stepResults.length,
  step_results: stepResults,
  last_verified_at: allPassed ? now : (entry.last_verified_at || null),
  index_refreshed: indexRefreshed,  // observability
};
return replyWithLog(root, "meta_state_re_verify", result);
```

### Concurrent-sweep constraint (RT: M6)

Document in `meta-state-sweep-tool.js` and `meta-state-re-verify-tool.js`: "this tool mutates `file-index.jsonl` only on `refresh: true` opt-in; concurrent sweep + re_verify may report drift on freshly re-verified entries (TOCTOU). For deterministic drift-exercising runs, hold the meta-state write enqueue at sweep start (the same enqueue used by `upsertFileIndexEntry` at `core/meta-state.js:796`)."

A bullet-proof implementation would acquire the enqueue at sweep start and hold it for `derivedStaleSet`; defer to a follow-up plan if the constraint is undesirable for performance.

## Related Code Files
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (RT: M4 — restructure cap into age-stale + drift-stale)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js` (RT: M1, M3, M14 — opt-in refresh; CAS ordering; gate-log)
- Add: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-re-verify-tool.test.js` (RT: M8 — file does NOT exist; add as deliverable)

## Implementation Steps

### Step 3.1 — Compute the post-fix precompute (RT: M4)
Run `pnpm test` after Phases 1+2 land. From the output, capture:
- `meta_state_sweep` `stale_view_count` (total)
- `meta_state_query_drift` `drift_count`
- age precompute = `stale_view_count - drift_count`
Use age precompute + 2 headroom as the age cap threshold. Drift cap = 0 in CI (post-seed normalization).

### Step 3.2 — Update cold-tier-regression.test.js (RT: M4, M13)
Apply the diff above. Import `computeCurrentHashes` from `core/stale-view.js` and use `computeCurrentHashes(entries, root).ok`.
**RT: M13: Pre-Phase-7 gate**: this test only runs cleanly under `pnpm test` (which prepends the seed step). Document in the test file: "MUST run under `pnpm test`, not `pnpm test:iter`. `test:iter` skips `seed-file-index.mjs` (see package.json:18), which means `file-index.jsonl` retains its prior state and `computeCurrentHashes` reads fresh bytes vs stale baseline → cap blows on non-drift. To exercise drift-detection logic on a clean tree, run `pnpm test`; for fast iteration on other tests, use `pnpm test:iter` ONLY after the cold-tier test is excluded (vitest pattern: `--exclude` flag)."

### Step 3.3 — Implement re_verify opt-in refresh (RT: M1, M3, M14)
Modify `meta-state-re-verify-tool.js` per the Architecture block. Add the schema arg, the imports, the CAS-ordering reorder, the gate-log entries, and the `index_refreshed` field. Document the opt-in default-false behavior in the file header comment.

### Step 3.4 — Add the missing test file (RT: M8)
Create `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-re-verify-tool.test.js` with three named cases:
1. **Pass case (refresh:true):** verification passes, `index_refreshed: true`, follow-up `meta_state_check_grounding({id})` reports `status: "grounded"`.
2. **Pass case (refresh:false default):** verification passes, `index_refreshed: false`, file-index unchanged.
3. **Best-effort skip:** file is missing post-filing; even with `refresh:true`, returns `re_verified: true`, `index_refreshed: false`, gate-log entry written with `action: "index_refresh_skipped"`.
4. **Verify-exec-not-set:** `META_STATE_VERIFY_EXEC !== "1"` — early dry-return, `index_refreshed` field absent or false.

### Step 3.5 — Document rollback (RT: M18)
If Phase 3 ships and Phase 7 cap is wildly mis-calibrated, rollback procedure:
1. Revert `cold-tier-regression.test.js` to `fileIndex: new Map()` for Phase 7 only (preserves age-only forcing function, hides drift).
2. Revert `meta-state-re-verify-tool.js` to remove the `refresh` arg + index upsert.
3. The hash-aware predicate (Phase 1) and consumer wiring (Phase 2) stay in place — the regression is contained to Phase 7 + re_verify opt-in.

## Success Criteria

- [ ] Cold-tier cap is TWO assertions (age-stale ≤ N_age + 2; drift-stale = 0). (RT: M4)
- [ ] `meta_state_re_verify` schema has `refresh: z.boolean().optional().default(false)`. Default behavior unchanged. (RT: M3)
- [ ] On `refresh: true` + verification pass + CAS success, `upsertFileIndexEntry` is called with the current hash. (RT: M1)
- [ ] On `refresh: true` + verification pass + CAS conflict, `upsertFileIndexEntry` is NOT called (entry update didn't land). (RT: M1)
- [ ] Gate-log entries written on every re_verify refresh attempt (success: `action: "index_refreshed"`; skip: `action: "index_refresh_skipped"`). (RT: M14)
- [ ] Best-effort on file errors: missing/EACCES returns `re_verified: true` + `index_refreshed: false` + gate-log breadcrumb.
- [ ] Test file `meta-state-re-verify-tool.test.js` exists and covers all 4 cases. (RT: M8)
- [ ] `pnpm test` green; explicit doc that `pnpm test:iter` is incompatible with drift-exercising cold-tier test. (RT: M13)
- [ ] Rollback section recorded in the plan file. (RT: M18)

## Risk Assessment

- **Cap precompute drift:** if the post-fix count is mis-measured, the cap may immediately fail. **Mitigation:** measure on a clean tree with `pnpm test` first; the seed step normalizes the index. If the cap is still flaky, expand the headroom to 3 instead of 2.
- **`upsertFileIndexEntry` race with seed-file-index (RT: M6):** the seed step runs before `pnpm test`, so re-verify during a test run happens against the seeded index. The refresh upserts to current bytes → drift cleared. On the next test run, seed re-hashes → no change. Safe.
- **Concurrent sweep + re_verify (RT: M6):** TOCTOU possible. Mitigations: (a) document the constraint, (b) acquire write enqueue at sweep start (deferred).
- **Permission errors on `computeFileHash`:** if the file is removed or perms changed between filing and re-verify, `FileNotFoundError` (or EACCES) is caught and logged. Re-verify is not blocked.
- **`upsertFileIndexEntry` write to gitignored `file-index.jsonl`:** already gitignored. No commit risk.
- **`META_STATE_VERIFY_EXEC=1` is opt-in:** the tool's early-return at line 19-22 happens before the refresh code. Confirmed: refresh only happens in the verify-exec branch.
- **CAS-conflict silent skip (RT: M1):** when `_expected_version` mismatches, `applyUpdateAndCheck` returns `{ok: false}`. The current code returns immediately with `re_verified: false`. The new code does the same — the `if (!updateOutcome.ok) return ...` guard happens BEFORE the index refresh. Safe.

## Rollback Path (RT: M18)

If post-deploy metrics show the cap is mis-calibrated OR re_verify index-refresh regresses:
1. **Step A (Phase 7 only):** revert `cold-tier-regression.test.js` Phase 7 to the age-only shape (`fileIndex: new Map()`) — preserves age forcing function, hides drift assertion. Drift cap removed.
2. **Step B (re_verify only):** revert `meta-state-re-verify-tool.js` to remove the `refresh` arg and the index upsert — re_verify reverts to pre-Phase-3 behavior.
3. **Phases 1+2 stay:** the hash-aware predicate and consumer wiring remain in place. The regression is contained.
4. **Re-investigate:** file a new meta-state finding describing the rollback reason; do not auto-resolve `meta-260716T0603Z`.

Document this rollback in the PR description under "Rollback plan."