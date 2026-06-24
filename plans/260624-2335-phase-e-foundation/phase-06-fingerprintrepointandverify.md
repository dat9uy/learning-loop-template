---
phase: 6
title: "FingerprintRepointAndVerify"
status: pending
priority: P2
dependencies: [1, 2]
effort: "0.5h"
---

# Phase 6: Fingerprint Repoint + Cold-Tier Verify

## Overview

This is the critical phase that addresses the user's hard constraint: `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` (status=reported, mechanism_check=true). The Phase 2 rename (`core/legacy/` → `core/`) invalidates 7 findings' `evidence_code_ref` paths in one move. Under the current O(N)-per-cited-file mechanism, each invalid fingerprint would require its own `meta_state_refresh_fingerprint` + `meta_state_patch` call (14 ops total). This phase uses the `meta_state_batch` MCP tool to perform the repoint + refresh in a single atomic batch operation (verified available via `loop_describe` warm tier; cap = 500 ops/batch).

## Why this is a separate phase (not bundled into Phase 2)

The rename itself is mechanical (one `git mv`). The fingerprint repoint is META-STATE mutation — it changes the audit trail. Phase 2 commits the code change; Phase 6 commits the audit-trail reconciliation. Separating them means each commit has a single reviewable concern: code (Phase 2) vs. audit-trail (Phase 6).

## Requirements

- Functional: all 7 findings with `evidence_code_ref` pointing to `tools/learning-loop-mastra/core/legacy/*` are repointed to `tools/learning-loop-mastra/core/*` AND have their `code_fingerprint` refreshed to the new file's SHA-256.
- Non-functional: the repoint + refresh is performed in a single atomic batch (one lock, one cache invalidation) — NOT 7 sequential `meta_state_refresh_fingerprint` + 7 sequential `meta_state_patch` calls.

## Architecture

**The 7 affected findings (verified 2026-06-24, pre-plan):**

| # | Finding id | Old path | New path |
|---|------------|----------|----------|
| 1 | `meta-260606T1830Z-context-pollution-...` | `tools/learning-loop-mastra/core/legacy/gate-logic.js#splitSegments` | `tools/learning-loop-mastra/core/gate-logic.js#splitSegments` |
| 2 | `meta-260613T1615Z-import-chain-analysis-...` | `tools/learning-loop-mastra/core/legacy/gate-logic.js#applyPromotedRules` | `tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules` |
| 3 | `meta-260615T1148Z-the-runtime-agnostic-pattern-...` | `tools/learning-loop-mastra/core/legacy/gate-logic.js#GLOB_SCOPE_WHITELIST` | `tools/learning-loop-mastra/core/gate-logic.js#GLOB_SCOPE_WHITELIST` |
| 4 | `meta-260615T1920Z-the-new-stripnodeevalbody-...` | `tools/learning-loop-mastra/core/legacy/gate-logic.js#stripNodeEvalBody` | `tools/learning-loop-mastra/core/gate-logic.js#stripNodeEvalBody` |
| 5 | `meta-260616T1453Z-two-more-dead-write-path-...` | `tools/learning-loop-mastra/core/legacy/gate-logic.js#WRITE_PATH_PATTERNS` | `tools/learning-loop-mastra/core/gate-logic.js#WRITE_PATH_PATTERNS` |
| 6 | `meta-260623T1126Z-meta-state-relationships-...` | `tools/learning-loop-mastra/core/legacy/loop-introspect.js:285` | `tools/learning-loop-mastra/core/loop-introspect.js:285` |
| 7 | `meta-260624T1920Z-code-fingerprint-mechanism-...` (THE CONSTRAINT) | `tools/learning-loop-mastra/core/legacy/check-grounding.js#computeFileHash` | `tools/learning-loop-mastra/core/check-grounding.js#computeFileHash` |

All 7 paths follow the pattern `core/legacy/X.js[:line|#anchor]` → `core/X.js[:line|#anchor]`. The transformation is mechanical: replace `core/legacy/` with `core/`.

**The batch operation:**

The `meta_state_batch` MCP tool (verified available via `loop_describe({tier: warm})`) accepts an array of operations (`write | update | delete | archive`), applies them atomically under one lock, and invalidates the cache once. Each repoint is a `update` op with the new `evidence_code_ref` + `code_fingerprint`.

**Why batch over sequential calls:**
- **Lock granularity:** one lock for the whole batch vs. 7 locks (race risk if another writer mutates between calls).
- **Cache invalidation:** one invalidation vs. 7 (the cache is per-finding; a sequential batch would invalidate 7 times).
- **Audit trail:** one batch operation is one log entry vs. 14.

**Why NOT the proposed file-index design (per the constraint's resolution direction):**
- The file-index design (a shared index that owns hashes, O(1) per file change) is a separate loop-design + migration plan. The constraint's decision rule requires "a loop-design entry exists that specifies the file-index design, AND a migration plan moves at least 10 active findings off per-record fingerprints" — neither exists today.
- This plan works around the current O(N) mechanism with `meta_state_batch` (the 1-call mitigation). The file-index design ships later.

## Related Code Files

- Modify: `meta-state.jsonl` (the registry) — 7 entries updated with new paths + new fingerprints
- Create: `plans/260624-2335-phase-e-foundation/reports/fingerprint-repoint-manifest.json` (audit trail of the batch op)
- Create: `plans/260624-2335-phase-e-foundation/scripts/repoint-fingerprints.cjs` (NEW — the batch script; ~80 LoC; corrected location per red-team H8)
- Create: `plans/260624-2335-phase-e-foundation/__tests__/fingerprint-repoint-existence.test.js` (NEW — explicit existence assertion per red-team H6)
- No other code changes.

## Implementation Steps

1. **Pre-condition: Phase 2 must be complete.**
   - Verify: `test -d tools/learning-loop-mastra/core && test ! -d tools/learning-loop-mastra/core/legacy` → both must succeed.
   - If `core/legacy/` still exists, abort with "Run Phase 2 (RenameAndRefs) first."
   - This prevents the ENOENT-at-computeFileHash failure mode (red-team C7).

2. **Verify the baseline (post-rename state).**
   - `meta_state_list({ id: ['<full-id-1>', '<full-id-2>', ..., '<full-id-7>'] })` (use FULL slugs — truncation is not honored; red-team C10).
   - Each returned entry's `evidence_code_ref` should already be repointed by the substring sed in Phase 2 (since meta-state.jsonl is git-tracked and the sed touched it... wait, it didn't; Phase 2's sed was scoped to `tools/` + `AGENTS.md` + `.claude/` + `.factory/`, NOT `meta-state.jsonl`).
   - **CORRECTION (red-team Q6):** Phase 2 does NOT update `meta-state.jsonl` (it's outside the find scope). Phase 6 must update the 7 `evidence_code_ref` fields in meta-state.jsonl via the batch.
   - If the 7 entries are missing from the result, the ids are wrong; verify against the actual registry.

3. **Hash verification before repoint.**
   - For each of the 7 findings, read the OLD fingerprint from the entry.
   - Compute the SHA-256 of the file at `tools/learning-loop-mastra/core/legacy/<file>` (the OLD location — but wait, after Phase 2, this path doesn't exist).
   - **CORRECTED (red-team H7):** the OLD file no longer exists at `core/legacy/`. The verification is: read the OLD fingerprint from the entry, compute the SHA-256 of `tools/learning-loop-mastra/core/<file>` (the NEW location), assert the hashes MATCH. If they don't match, the rename introduced content drift; abort.
   - This proves `git mv` preserved byte-for-byte content (which is required for the repoint to be safe).

4. **Write the batch script (`repoint-fingerprints.cjs`).**
   - **Location (corrected per red-team H8):** `plans/260624-2335-phase-e-foundation/scripts/repoint-fingerprints.cjs` (plan-specific, not mastra runtime).
   - The script reads the 7 finding ids, computes the new `evidence_code_ref` (replace `core/legacy/` with `core/`), computes the new SHA-256 fingerprint of the new file (using the same algorithm as `core/check-grounding.js#computeFileHash`), and submits a single `meta_state_batch` call with 7 `update` ops.
   - **CORRECTED batch op shape (red-team C6):** the `meta_state_batch` op schema is `passthrough()` and does raw `Object.assign(entries[idx], patch)`. The `patch` wrapper is a passthrough field; the correct shape is FLAT fields at the op's top level:
     ```js
     // CORRECTED — flat fields, no patch wrapper
     const ops = findings.map(id => ({
       op: 'update',
       id,
       evidence_code_ref: newPath,        // flat, not patch.evidence_code_ref
       code_fingerprint: newFingerprint,   // flat, not patch.code_fingerprint
     }));
     const result = await metaStateBatch({ operations: ops });
     ```
   - **Pseudocode (corrected):**
     ```js
     // 1. Load the 7 finding ids (hard-coded from the table above)
     const findings = [/* 7 FULL ids */];
     // 2. For each, compute the new evidence_code_ref + new fingerprint
     const ops = findings.map(id => {
       const old = readEntry(id);
       const newPath = old.evidence_code_ref.replace('core/legacy/', 'core/');
       const newFingerprint = computeFileHash(newPath); // same algorithm as check-grounding.js
       return {
         op: 'update',
         id,
         evidence_code_ref: newPath,
         code_fingerprint: newFingerprint,
       };
     });
     // 3. Submit as one batch
     const result = await metaStateBatch({ operations: ops });
     // 4. Write the manifest for audit
     writeFileSync('reports/fingerprint-repoint-manifest.json', JSON.stringify({
       batch_id: result.batch_id,
       operations_applied: result.applied,
       operations_failed: result.failed,
       timestamp: new Date().toISOString(),
       finding_ids: findings,
       op_shape: 'flat-fields-no-patch-wrapper',
     }, null, 2));
     ```
   - The script is idempotent: running twice produces the same final state (the second run sees the new paths, computes the same fingerprints, and applies a no-op update).

5. **File the change-log audit entry FIRST (red-team C9).**
   - Per the silent-persistence-fail bug in `meta_state_log_change` (active finding `meta-260619T2233Z-...`), the audit entry must be filed BEFORE the batch so that if the batch fails, the audit trail records the intent.
   - `change_dimension: mechanical`
   - `change_target: plans/260624-2335-phase-e-foundation/plan.md` (per red-team M10: change_target should be a file path, not a directory)
   - `change_diff: { added: [], removed: [], changed: ['meta-state.jsonl: 7 entries (evidence_code_ref + code_fingerprint repointed)'] }`
   - `reason: ≥ 20 chars` — "Phase E Plan 1 (Foundation) fingerprint repoint. The 7 findings anchored to core/legacy/* paths are repointed to core/* paths via meta_state_batch. Per meta-260624T1920Z-... constraint, this is the O(N)-mechanism mitigation."
   - `evidence_journal: plans/260624-2335-phase-e-foundation/plan.md`
   - **CORRECTION (red-team C9):** file this BEFORE the batch, not after. If the batch fails, the audit records the intent.

6. **Run the script.**
   - `node plans/260624-2335-phase-e-foundation/scripts/repoint-fingerprints.cjs`
   - Expected: `operations_applied: 7, operations_failed: 0`.
   - If any op fails, the batch tool reports the failed op + reason; the manifest records the failure; abort and diagnose.

7. **Verify the 7 paths are now grounded.**
   - For each of the 7 finding ids (full slugs): `meta_state_check_grounding({ id })` → expect `{ status: 'grounded', drift_kind: null }`.
   - If any returns `drift_kind: 'hash_mismatch'` or `status: 'drifted'`, the fingerprint didn't match the file. Diagnose.

8. **Trigger `meta_state_re_verify` for the 6 stale findings (red-team C8 + H6 + H8).**
   - The 6 stale findings (ids #1-6) need `meta_state_re_verify` to transition stale→active and stamp `last_verified_at`.
   - Gated on `META_STATE_VERIFY_EXEC=1` (per the tool's contract; default off).
   - `meta_state_re_verify({ id: '<full-id-1>' })` × 6 (or a batch).
   - The 7th (the constraint, status=reported) does NOT need re-verify; leave it as `reported` until the file-index design ships.

9. **Add an explicit assertion in the cold-tier regression test (red-team H6).**
   - The existing test EXEMPTS hash_mismatch on anchor-based refs. Add a sibling assertion that checks the 7 new paths EXIST.
   - Test: for each of the 7 finding ids, `existsSync(newPath)` must return true. If false, the repoint is wrong.
   - This is a SEPARATE test file: `plans/260624-2335-phase-e-foundation/__tests__/fingerprint-repoint-existence.test.js` (one-off, plan-specific).

10. **Run the cold-tier regression test.**
    - `pnpm test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`
    - Asserts all `mechanism_check=true` findings are grounded.
    - Expected: passes (7 findings + ~24 others = 31 total; all grounded post-repoint).

11. **Run the full test suite.**
    - `pnpm test`
    - Expected: all tests pass.

12. **Acknowledge the constraint finding (do NOT resolve) + file new finding on batch bypass.**
    - The constraint finding (`meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each`) is `status=reported` with `mechanism_check=true`. The repoint does NOT resolve the finding (the O(N) mechanism is still in place); it only mitigates the immediate cost.
    - Leave the finding `status=reported` until the file-index design ships (per the constraint's decision rule).
    - **File a NEW finding (per validate Q4 — promoted from optional to required):** the red-team discovered that `meta_state_batch` bypasses the `IMMUTABLE_PATCH_FIELDS` deny-list for `code_fingerprint` (the op schema is `passthrough()` and the handler does raw `Object.assign`). The constraint finding's authority hinges on `code_fingerprint` being authoritative; the bypass is an undocumented backdoor.
      - Call `meta_state_report({ ... })` with:
        - `category: "mcp-tool-missing"`
        - `severity: "warning"`
        - `affected_system: "meta-state-tools"`
        - `description: "The meta_state_batch MCP tool bypasses the IMMUTABLE_PATCH_FIELDS deny-list for code_fingerprint. The op schema is passthrough() and the handler at core/legacy/meta-state.js:486-565 does raw Object.assign(entries[idx], patch). Any caller can set code_fingerprint to a stale hash to suppress drift detection on a finding. Discovered 2026-06-25 during Phase E Plan 1 fingerprint repoint (plan 260624-2335-phase-e-foundation). The O(N)-constraint finding (meta-260624T1920Z-...) relies on code_fingerprint authoritativeness; this bypass is a structural weakness in the mechanism."`
        - `evidence_code_ref: "tools/learning-loop-mastra/core/legacy/meta-state.js:486"`
      - After filing, the new finding is `status=reported` with a 24h TTL. Operator acks via `meta_state_ack` to promote to `active`.

13. **Commit.**
    - One commit: `chore(phase-e): repoint 7 fingerprints from core/legacy/* to core/* (1 atomic batch op)`
    - Body: `Phase E Plan 1 (Foundation) §6. Per meta-260624T1920Z-... constraint, the rename invalidated 7 evidence_code_ref paths. The repoint was applied as a single meta_state_batch call (flat fields, no patch wrapper). Hash verification pre-repoint confirmed git mv preserved byte-for-byte content. Cold-tier regression + sibling existence test pass. 6 stale findings re-verified to stale→active. Manifest at plans/260624-2335-phase-e-foundation/reports/fingerprint-repoint-manifest.json.`
    - **Registry delta (PR body — required per `rule-pr-body-registry-deltas`):**
      - 7 finding entries updated (evidence_code_ref + code_fingerprint)
      - 1 new change-log entry filed
      - 6 stale findings re-verified (status stale→active, last_verified_at stamped)
      - 1 new finding filed (the `meta_state_batch` bypass of `code_fingerprint` immutability, per validate Q4)
      - 0 entries resolved, 0 archived

## Success Criteria

- [ ] All 7 findings have updated `evidence_code_ref` (no longer match `core/legacy/*`)
- [ ] All 7 findings have refreshed `code_fingerprint` matching the new file's SHA-256
- [ ] The repoint was applied as 1 atomic batch op (verified via the manifest)
- [ ] Cold-tier regression test passes (all `mechanism_check=true` findings grounded)
- [ ] All 1189+ existing tests still pass
- [ ] Manifest at `plans/260624-2335-phase-e-foundation/reports/fingerprint-repoint-manifest.json` is committed
- [ ] `meta_state_log_change` audit entry filed
- [ ] The constraint finding (`meta-260624T1920Z-...`) remains `status=reported` (NOT resolved; the O(N) mechanism is still in place)

## Risk Assessment

- **R1 (batch tool is unavailable or caps lower than expected):** the tool is verified available via `loop_describe`; cap is 500 ops/batch (7 fits). If the tool fails, fall back to 7 sequential `meta_state_refresh_fingerprint` + 7 `meta_state_patch` calls (the documented fallback per the constraint description).
- **R2 (the new file's SHA-256 differs from the old file's SHA-256 because the rename introduced content drift):** the rename is a pure directory move (no content changes). The SHA-256 of `core/legacy/meta-state.js` and `core/meta-state.js` MUST be identical (git mv preserves content byte-for-byte). If they differ, something else changed the file content — diagnose before continuing.
- **R3 (the cold-tier test was passing pre-rename because of `status=stale` exemptions):** the 7 findings include 6 `status=stale` (which may be exempt from the cold-tier test) and 1 `status=reported` (the constraint). Post-repoint, the constraint becomes `status=reported` + new fingerprint; the test should pass. If it doesn't, the test's exemption logic may be off; diagnose.
- **R4 (the constraint finding's fingerprint is itself in the rename set, creating a circular dependency):** the constraint is anchored to `core/legacy/check-grounding.js#computeFileHash`. After repoint, it anchors to `core/check-grounding.js#computeFileHash`. The constraint's RECOMMENDATION (a file-index design) is unaffected. The repoint only updates the ANCHOR, not the SUBSTANCE.
- **R5 (other findings not in the 7-entry list also have stale paths):** the baseline manifest from Phase 1 enumerated all references. If Phase 2's rename touched any path NOT in the 7-entry list, those findings would also be stale. Mitigation: after Phase 6, run `meta_state_query_drift({ filter: { status: 'reported' } })` to surface ALL drift; if any new findings appear, add them to a follow-up batch.

## Batch Operation Sketch (target — corrected per red-team C6)

```js
// Input: 7 finding ids (FULL slugs)
// Output: 7 update ops, submitted as 1 batch
// NOTE: op fields are FLAT at top level, NOT wrapped in `patch`.
//       The batch tool's op schema is passthrough() and does raw Object.assign;
//       a `patch` wrapper creates a stray entry.patch field rather than merging.
const ops = [
  { op: 'update', id: 'meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois', evidence_code_ref: 'tools/learning-loop-mastra/core/gate-logic.js#splitSegments', code_fingerprint: 'sha256:<new>' },
  { op: 'update', id: 'meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m', evidence_code_ref: 'tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules', code_fingerprint: 'sha256:<new>' },
  // ... 5 more (full slugs)
];
const result = await metaStateBatch({ operations: ops });
// result: { applied: 7, failed: 0, batch_id: 'batch-<timestamp>' }
```

## Test Output Reference (expected green state, post-Phase 6)

```text
$ pnpm test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
# Subtest: all mechanism_check=true findings are grounded
# Total findings: 31 (7 repointed + 24 others)
# Grounded: 31
# Drifted: 0
ok 1 - all mechanism_check=true findings are grounded

$ meta_state_query_drift({ filter: { status: 'reported' } })
# Drift count: 0
# (The constraint finding is reported but not drifted post-repoint.)
```

## Manifest Schema Reference

```json
{
  "batch_id": "batch-<timestamp>",
  "operations_applied": 7,
  "operations_failed": 0,
  "timestamp": "2026-06-24T<time>Z",
  "finding_ids": [
    "meta-260606T1830Z-context-pollution-...",
    "meta-260613T1615Z-import-chain-analysis-...",
    "meta-260615T1148Z-the-runtime-agnostic-pattern-...",
    "meta-260615T1920Z-the-new-stripnodeevalbody-...",
    "meta-260616T1453Z-two-more-dead-write-path-...",
    "meta-260623T1126Z-meta-state-relationships-...",
    "meta-260624T1920Z-code-fingerprint-mechanism-..."
  ],
  "old_paths": ["tools/learning-loop-mastra/core/legacy/gate-logic.js#...", "..."],
  "new_paths": ["tools/learning-loop-mastra/core/gate-logic.js#...", "..."],
  "rationale": "Phase E Plan 1 §6 — rename core/legacy/ → core/. Per meta-260624T1920Z-... constraint, repointed in 1 atomic batch to avoid 14 sequential refresh+patch calls."
}
```
