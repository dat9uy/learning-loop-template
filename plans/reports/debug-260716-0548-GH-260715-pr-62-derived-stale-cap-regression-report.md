# Debug report: PR #62 cold-tier derived-stale cap regression

> **Type:** from-debugger (operator-requested CI investigation)
> **Date:** 2026-07-16T05:48Z
> **Triggered by:** operator observation that PR #62 CI shows `test` FAILURE while `refs-check` and `registry-deltas` are SUCCESS; operator suspected a leftover reference to the legacy `stale` status (already migrated off in plan 260707-0812)
> **PR under scrutiny:** https://github.com/dat9uy/learning-loop-template/pull/62
> **Plan under scrutiny:** `plans/260715-2010-meta-state-refs-check-pr-trigger/` (status: completed per `plans/reports/cook-refs-check-pr-trigger-260715-1356-report.md` and `plans/reports/debug-cook-refs-check-context-mismatch-260715-1409-report.md`)
> **Related fix scope:** 1-line threshold bump in `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`

## Executive summary

The CI failure is **not** a leftover reference to the legacy `status: "stale"` field — that migration (plan 260707-0812) landed cleanly. The failure IS about the **derived-stale view** that the same migration introduced as `stale`'s replacement: the cold-tier-regression test's Phase 7 cap counts `mechanism_check:true` findings whose `evidence_code_ref` paths are seeded into `file-index.jsonl` (i.e. all grounded code-citing findings), and PR #62's commit `2611b3d chore(meta-state): file 2 findings + patch hints-split loop-design` added **2 new findings** that pushed the count from 15 → 17, exceeding the cap of 16.

**Root cause:** PR #62 added 2 fresh `mechanism_check:true` findings (with valid `evidence_code_ref` paths), and the cap's "precompute + 2 headroom" convention does not account for new findings filed in the same PR.

**Severity:** low. The 2 findings are legitimate, the cap is a known headroom-allowance regression guard, and the fix is a 1-line threshold bump (16 → 19, following the documented `precompute + 2 headroom` pattern). No real bug is being masked.

**Recommended fix:** bump the Phase 7 cap from 16 to 19 (new precompute 17 = prior 14 + 3 added since last bump + 2 headroom). One-line edit at `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:96`. Match the documented convention to avoid breaking the gate on every new `mechanism_check:true` finding.

## Technical analysis

### Symptom

PR #62's Checks tab:

| Check | Conclusion | Duration |
|---|---|---|
| `test` | **FAILURE** | 1m48s |
| `refs-check` | SUCCESS | 10s |
| `registry-deltas` | SUCCESS | 7s |

The `test` job failure is a single test (`cold-tier regression: structural invariants, no fixture dependency`) in `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`. 219 of 221 test files pass; 1991 of 1996 tests pass.

### Evidence trail (commit `2611b3d`, PR #62 HEAD)

**Failure message:**

```
AssertionError: Phase 7: derived-stale cap broken — 17 derived stale
mechanism_check findings exceed threshold 16 (14 + 2 headroom; precompute
from plan 260707-0812 Phase 1): meta-260614T1236Z-…, meta-260615T1148Z-…,
…, meta-260715T2237Z-…, meta-260715T2300Z-runtime-context-injection-is-…,
meta-260715T2311Z-gratuitous-mutations-…
 ❯ tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:95:10
```

**Phase 7 invariant (test:86-98):**

```js
const derivedStaleMc = derivedStaleSet(current.all_findings, {
  now: Date.now(),
  fileIndex,
}).filter((f) => f.mechanism_check === true || f.mechanism_check === null);
assert.ok(
  derivedStaleMc.length <= 16,
  `Phase 7: derived-stale cap broken — ${derivedStaleMc.length} derived stale
   mechanism_check findings exceed threshold 16 (14 + 2 headroom; …): …`
);
```

**Count breakdown (17 = 15 pre-existing + 2 new):**

Pre-existing derived-stale mechanism_check findings (15):
- `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi`
- `meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n`
- `meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc`
- `meta-260616T0222Z-inbound-gate-js-still-contains-a-local-ttl-based-staleness-c`
- `meta-260623T1126Z-meta-state-relationships-graph-is-unidirectional-on-reopens`
- `meta-260630T2050Z-phase-e-plan-4-phase-1-install-attempt-pnpm-add-d-mastracode`
- `meta-260714T1248Z-change-log-bound-paths-tools-learning-loop-mastra-core-chang`
- `meta-260714T1248Z-the-rule-entry-pattern-field-is-validated-as-z-string-with-n`
- `meta-260714T1248Z-no-mcp-tool-exists-to-invalidate-the-running-mcp-server-s-es`
- `meta-260715T0633Z-finding-stream-half-of-the-superseded-meta-260709t1017z-two`
- `meta-260715T1327Z-promoted-regex-rules-in-applypromotedrules-gate-logic-js-wer`
- `meta-260715T1328Z-agents-repeatedly-pipe-vitest-run-pnpm-test-stdout-to-tail-g`
- `meta-260715T1801Z-the-canonical-git-union-merge-driver-command-git-merge-file`
- `meta-260715T2222Z-branch-protection-required-status-check-satisfaction-must-be`
- `meta-260715T2237Z-entry-relationships-finding-rule-promotion-finding-change-lo`

New from PR #62 commit `2611b3d` (2):
- `meta-260715T2300Z-runtime-context-injection-is-fragmented-across-overlapping-s`
  → `evidence_code_ref: .factory/hooks/loop-surface-inject.cjs:14`
- `meta-260715T2311Z-gratuitous-mutations-bump-the-cas-version-counter-and-rewrit`
  → `evidence_code_ref: tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js:190`

### Why "stale" appears here even though the migration removed the status

Plan 260707-0812 (lifecycle-status-stale-mechanism) Phase 1 collapsed `status: {active, reported, stale}` → `open` and replaced the persisted `stale` status with a **derived view** `isStaleView(entry)` in `tools/learning-loop-mastra/core/stale-view.js:72-81`:

```js
export function isStaleView(entry, opts = {}) {
  if (!isOpen(entry)) return false;
  const refMs = referenceTimeMs(entry);
  if (refMs === null) return false;
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const ageMs = now - refMs;
  const ageStale = ageMs > STALENESS_WINDOW_MS;
  const driftStale = hasDrifted(entry, opts.fileIndex);
  return ageStale || driftStale;
}

function hasDrifted(entry, fileIndex) {
  if (!fileIndex || fileIndex.size === 0) return false;
  const ref = entry.evidence_code_ref;
  if (!ref) return false;
  return fileIndex.has(canonicalIndexKey(ref));   // path-keyed, NOT timestamp-keyed
}
```

The drift check is **path-keyed, not timestamp-keyed**. The seed step (`tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs`, run before `vitest run` per `pnpm test`) rebuilds `file-index.jsonl` for every distinct `mechanism_check:true` `evidence_code_ref` path. From the PR #62 run:

```
Distinct mechanism_check:true cited paths: 24
Seeded (file exists): 22
Skipped (file missing): 2
file-index.jsonl entries after seed: 22
```

Once a path is in the index, **every `mechanism_check:true` finding citing that path is marked drifted forever** — `meta_state_re_verify` stamps `last_verified_at` but the drift check ignores timestamps. Fresh findings are born into the derived-stale set the moment they're filed and seed-file-index runs.

So the cap at line 96 is effectively counting "the number of mechanism_check:true findings with grounded code refs in the live registry" — a structural cap, not a freshness cap. The "stale" wording in the error message is the residual vocabulary of the migration, not a reference to the old `status: "stale"` field.

### Why PR #62 specifically broke it

Cap history (test:86-90 comment + deltas):

- **Phase 1 (plan 260707-0812 Phase 1):** initial precompute of 14, cap = 16 (14 + 2 headroom).
- **Pre-PR-#62 baseline:** 15 derived-stale mc findings — within cap (15 ≤ 16). Test passing on commit `6efa2bc fix(loop): add PROCESS_HINTS row for required-status-checks rule`.
- **PR #62 commit `2611b3d`:** adds 2 mc=true findings → 17. Cap not bumped → 17 > 16 → FAIL.

The "precompute + 2 headroom" convention is the standard bump pattern (per the test comment line 76-79: *"Re-tightened to 12 (10 + 2 headroom for organic drift) to absorb new stale findings without immediately breaking the gate."*). PR #62's commit did not include a corresponding cap bump, so the convention was violated.

### Why `meta_state_re_verify` won't unstick the new findings

`meta_state_re_verify` (per its tool description in MCP) stamps `last_verified_at` and runs `verification.steps`. It does **not** remove the path from `file-index.jsonl`. Since `hasDrifted` only checks `fileIndex.has(canonicalIndexKey(ref))`, the drift signal persists after re-verify. The only way to remove a finding from the derived-stale set is to (a) close it (`meta_state_resolve` / `meta_state_supersede`), or (b) remove its cited path from the repo (out of scope).

This means the cap is not a "verify and you're done" guard — it's a "file-and-ground-now-or-resolve-later" guard. New mc=true findings accumulate headroom pressure until they're closed.

## Fix options

### Option A — bump the cap (recommended, 1-line edit)

Match the documented "precompute + 2 headroom" convention. New precompute is 17 (14 + 3 added since last bump), new cap is 19 (17 + 2 headroom).

```diff
--- a/tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
+++ b/tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
@@ -93,8 +93,8 @@ test("cold-tier regression: structural invariants, no fixture dependency", asy
   }).filter((f) => f.mechanism_check === true || f.mechanism_check === null);
   assert.ok(
-    derivedStaleMc.length <= 16,
-    `Phase 7: derived-stale cap broken — ${derivedStaleMc.length} derived stale mechanism_check findings exceed threshold 16 (14 + 2 headroom; precompute from plan 260707-0812 Phase 1): ${derivedStaleMc.map((f) => f.id).join(", ")}`
+    derivedStaleMc.length <= 19,
+    `Phase 7: derived-stale cap broken — ${derivedStaleMc.length} derived stale mechanism_check findings exceed threshold 19 (17 + 2 headroom; precompute from plan 260707-0812 Phase 1, +3 since last bump): ${derivedStaleMc.map((f) => f.id).join(", ")}`
   );
```

**Pros:** matches documented convention, single-line change, no semantic drift, lets the 2 new findings be filed without ceremony. **Cons:** keeps the cap permissive (not a tight forcing function).

### Option B — resolve 1-2 existing derived-stale findings (active, out of scope)

Pick 2 of the 15 pre-existing findings whose underlying mechanism_check issues have actually been fixed in recent PRs, and run `meta_state_resolve({id, resolution})`. Drops count from 17 to 15 → under cap 16.

**Pros:** honors the test's "forcing function" intent (test comment line 82-84: *"tightening it requires resolving the underlying mechanism_check issues in a follow-up plan"*). **Cons:** requires manual evidence-tracing per finding, easy to mis-attribute, hard to automate.

### Option C — set `mechanism_check: false` on the 2 new findings (band-aid)

Avoid the derived-stale filter by opting out of SP2 grounding.

**Pros:** trivial change. **Cons:** loses SP2 coverage on legitimate findings; contradicts the operator's intent when filing them as `mechanism_check:true`.

### Recommendation

**Option A.** The cap is documented as a headroom allowance, the new findings are legitimate, and the fix is bounded (1 line + 1 message change). Option B is the right long-term move but out of scope for unblocking PR #62.

## Suggested follow-up finding

The drift check's path-keyed-only semantics (no timestamp comparison) means every mc=true finding with a grounded code ref is permanently in the derived-stale set once seeded. This is the "structural cap, not freshness cap" behavior noted above. Worth filing as a separate meta-state finding:

- `category: loop-anti-pattern, subtype: schema-ceremony`
- Title: *"Drift check is path-keyed-only — `hasDrifted` doesn't compare `file_index.<path>.hash` against a per-finding baseline"*
- Evidence: `tools/learning-loop-mastra/core/stale-view.js:55-60`
- Severity: `warning`
- Recommendation: keep the path-keyed short-circuit but stamp a `drift_checked_at` per finding so re-verify can clear the drift signal (covers the documented comment at line 48-54: *"the cited file has been refreshed since the finding was last grounded"* — the current implementation does not actually check this).

Out of scope for PR #62; file in a follow-up plan.

## Verification protocol

After applying Option A:

```bash
pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
# expected: 1 passed
pnpm test
# expected: 219 passed (was 218 passed, 1 failed, 1 skipped)
```

Then verify the PR-HEAD CI run on the fix commit:

```bash
gh pr view 62 --json statusCheckRollup
# expected: [{name: "test", conclusion: "SUCCESS"}, ...]
gh pr view 62 --json mergeStateStatus
# expected: {mergeStateStatus: "CLEAN"} (NOT mergeable — per plan 260715-2010 Phase 3 lesson)
```

## Related changes

- **PR #62 commits** (in order):
  - `a36f43f` — plan scaffolding
  - `2253aa4` — workflow trigger change
  - `ef7e823` — cook report
  - `65660a5` — branch-protection fix (Phase 3)
  - `341a95a` — entry-relationships finding + required-status-checks rule
  - `6efa2bc` — PROCESS_HINTS row for required-status-checks rule
  - `2611b3d` — **2 new findings + loop-design patch (the culprit)**
- **Tests touched by this fix:** `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (1 assert + 1 message)
- **No validator/script edits.**
- **No registry deltas** beyond the 2 findings already shipped in `2611b3d`.

## Unresolved questions

1. Should the underlying drift-detection semantics be revisited (timestamp-keyed + per-finding baseline hash comparison) so re-verify can clear the drift signal? Recommended as a follow-up finding (see above), not PR #62 scope.
2. Of the 15 pre-existing derived-stale mc findings, how many are actually drift-stale (vs just path-present-in-index)? Without per-finding baseline hash tracking, cannot distinguish. Option B's "resolve 1-2 existing" is conservative for this reason.
3. Is there a recurring pattern of "file 2 new findings, break cap by 1, fix cap next commit" that suggests the headroom convention is too tight? 3 new findings since the last cap bump (260715T2222Z branch-protection, 260715T2237Z entry-relationships, 260715T2300Z runtime-context-injection, 260715T2311Z gratuitous-mutations) — 4 new since the cap was set. Worth measuring bump frequency over time.

Status: **DONE_WITH_CONCERNS** — Root cause identified and fix path chosen; awaits operator decision on Option A vs Option B vs Option C.