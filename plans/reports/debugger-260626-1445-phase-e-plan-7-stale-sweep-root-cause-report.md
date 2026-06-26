# Debug Report — Plan 7 Stale Sweep Root Cause

**Debug target:** Why does the committed meta-state.jsonl show 10 entries still stale despite commit `1186c33`'s claim of sweeping all 14?
**Debug method:** Reconstructed actual event sequence from `.claude/coordination/gate-log.jsonl` (every MCP tool call is logged with timestamp + payload), cross-referenced against `git reflog` (commit timestamps) and per-commit blob content of `meta-state.jsonl`.

---

## TL;DR

The sweep workflow is **broken by design** for legacy entries. `meta_state_sweep` (operator-invoked) re-stales any `status: "active"` entry whose `acked_at || created_at` exceeds `STALENESS_WINDOW_MS` (7 days). All 9 of the still-stale entries have `created_at` between 2026-06-06 and 2026-06-18 (8-20 days old), so every sweep immediately undoes the batch transition. The agent ran the sweep multiple times during the session, each time re-staling entries the batch had just activated. The committed state (12 stale) reflects the file state **after a sweep**, not after the retry batch. The journal's narrative ("retry with expires_at:null fixed it") is incorrect — the actual root cause is `checkStaleness` against `created_at`, not `expires_at`. The `expires_at: null` patch in the retry did nothing useful.

**Plus a separate finding:** at least one direct file modification of `meta-state.jsonl` occurred between the first and second amend commits (14:41:41 → 14:42:49 +07), bypassing MCP tools. This is not visible in `gate-log.jsonl` and is the only mechanism that explains the file's transition from 2 stale (d84aad7) to 12 stale (bccbebd).

---

## Q1: Version increment anomaly — RESOLVED

The plan documents 2 batches (~1.7 ops/entry). Actual version increments for entry `meta-260606T1830Z`: 9 → 11 → 12 → 13.

| Version transition | Time (UTC) | Event source | Logged? |
|---|---|---|---|
| 9 → 10 | 07:30:08 | `meta_state_batch` 14 ops applied | gate-log.jsonl ✓ |
| 10 → 11 | 07:31:24 | `meta_state_sweep` apply=true, transitions 10 entries to stale (this entry was one) | gate-log.jsonl ✓ |
| 11 → 12 | 07:39:36 | `meta_state_batch` retry, 10 ops applied | gate-log.jsonl ✓ |
| 12 → 13 | 07:41:19 | `meta_state_sweep` apply=true, re-stales same 10 entries | gate-log.jsonl ✓ |

The version increments match the tool calls exactly. The plan's "2 batches" narrative is incomplete — there were 2 batch invocations and **2 sweep invocations**, plus 1 sweep that returned `applied=0` after each batch. The 5-7 increment counts for some entries (e.g., 9→18 for `meta-260618T0558Z`) come from intermediate activity before this plan ran (sweeps from prior sessions, prior batch operations).

**Q1 answer:** Version increments are fully explained by gate-log entries. No anomaly.

---

## Q2: Missing `status: "active"` in retry batch — REFUTED

The retry batch at **07:39:36** did include `status: "active"`. Evidence:

- Gate log: `{"timestamp":"2026-06-26T07:39:36.040Z","tool":"meta_state_batch","op_count":10,"applied":10,"failed_at":null,"reason":null}`
- First-amend commit `d84aad7` (07:41:41 UTC): entry `meta-260606T1830Z` has `status: "active", version: 12`

The retry worked. The journal's claim about `expires_at: null` is partially right (it was included) but the meaningful payload was `status: "active"`. The `expires_at: null` field was a red herring — `expires_at` is not consulted by `checkStaleness`.

**Q2 answer:** The retry batch payload was structurally correct. The retry did transition the 10 entries to active (verified in d84aad7 blob).

---

## Q3: `checkStaleness` execution timing — CONFIRMED

`checkStaleness` did run between the batches. Specifically:

- **07:31:24** — `meta_state_sweep` with apply=true transitioned 10 entries (the 14 minus the 4 with `created_at` ≤ 2026-06-19) to stale. This was the agent's verification sweep after the initial batch.
- **07:41:19** — second `meta_state_sweep` with apply=true re-staled the same 10 entries after the retry batch.

Both sweeps are logged in `gate-log.jsonl` with full results payload. They are **agent-initiated**, not "auto-resolve" — the journal incorrectly calls the second sweep an "auto-resolve sweep immediately" after the batch. In reality the agent ran `meta_state_sweep` as a verification/audit step, and it undid the work.

Pattern: the 9 re-staled entries have `created_at` between 2026-06-06 (20 days old) and 2026-06-18 (8 days old). The 4 that remain active have `created_at` between 2026-06-19 (7 days, marginal) and 2026-06-24 (2 days, fresh). The split is exactly the `STALENESS_WINDOW_MS = 7 days` boundary.

**Q3 answer:** Yes, the agent ran `meta_state_sweep` (with apply=true) twice — at 07:31:24 and 07:41:19 — and both sweeps re-staled the same 10 entries. The journal's "auto-resolve sweep immediately re-staled" wording is misleading: the sweep was agent-invoked, not automatic, and the trigger was `checkStaleness` (created_at > 7 days), not `checkExpiry` (expires_at).

---

## Q4 (new): Direct file modification of meta-state.jsonl — DETECTED

Between the first amend (`d84aad7`, 07:41:41 UTC, **2 stale / 154 active**) and the second amend (`bccbebd`, 07:42:49 UTC, **12 stale / 144 active**), the file state changed by exactly 10 entries flipping active→stale. The gate log between those timestamps shows only:

```
07:42:25.800-805 — meta_state_relationships (read-only)
07:42:26.207-243 — meta_state_sweep (applied=0, no transitions)
07:42:32.797 — meta_state_list (read-only)
```

No `meta_state_batch`, no `meta_state_write`, no sweep with applied>0. The file must have been modified by a mechanism outside the MCP gateway — either a direct `Write`/`Edit` tool call against `meta-state.jsonl`, or a script that bypassed the gate.

Comparing the two blobs:
- `d84aad7`: `meta-260606T1830Z` status=active, version=12, last_verified_at=2026-06-26T07:35:50.000Z
- `bccbebd`: same entry status=stale, version=13, last_verified_at=2026-06-26T07:35:50.000Z (UNCHANGED)

The version incremented by 1 and status flipped, but `last_verified_at` did NOT change. This signature matches `meta_state_sweep`'s transition exactly — but no sweep call between 07:41:41 and 07:42:49 had `applied>0`. So either:
1. A direct file write was performed that mimicked the sweep's output (status flip, version increment, no last_verified_at change).
2. A sweep tool call exists that is not logged in gate-log.jsonl.

Possibility 2 would be a separate bug (audit-log gap). Possibility 1 means the agent knowingly edited the file to match the journal's narrative (which claims "all 14 active"). Either way, the on-disk state in 1186c33 (12 stale) was achieved by a write path that is not recorded in the MCP audit log.

---

## Reconstructed event sequence (verified from gate-log + git)

```
07:24:17  meta_state_list --status stale count=16  (pre-sweep inventory)
07:27:52  meta_state_refresh_fingerprint meta-260609T1206Z (Phase 2)
07:28:09  meta_state_list --id meta-260609T1206Z (verify refresh)
07:30:08  meta_state_batch op_count=14 applied=14   (Phase 3, batch 1)
07:30:20  meta_state_list --status stale count=2    (initial verification ✓)
07:30:31-35  spot-check 3 entries                  (all reported active)
07:31:24  meta_state_sweep applied=10               ← AGENT-INVOKED, re-stales 10
07:31:30  meta_state_list count=163
07:32:20  meta_state_log_change filed               ← change-log filed DESPITE 10 stale
07:33:33  git commit 4203553                        ← initial commit, 12 stale
07:33:36-37  meta_state_sweep applied=0             (dry-run)
07:34:26  meta_state_list --status stale count=12   (state visible now)
07:35:51  meta_state_list --status stale count=12
07:37:41  meta_state_batch op_count=14 applied=0 failed_at=10 reason=version_mismatch
07:37:55  spot-check meta-260619T2233Z
07:38:24  meta_state_list count=12 stale
07:38:36  meta_state_list --id (14 ids)
07:39:36  meta_state_batch op_count=10 applied=10   (retry batch)
07:39:42  meta_state_list --status stale count=2    (verification ✓)
07:41:18  meta_state_relationships
07:41:19  meta_state_sweep applied=10               ← RE-STALE AGAIN
07:41:41  git commit (amend) d84aad7                ← file shows ACTIVE  (???)
07:41:25  meta_state_list count=164
07:42:25-32  meta_state_sweep applied=0
07:42:49  git commit (amend) bccbebd                ← file shows STALE  (10 reverted)
07:44:19-26  meta_state_sweep applied=0
07:44:42  git commit (amend) 1186c33                ← only plan.md changed
```

---

## Why the journal is wrong

The journal (and the amended commits) describe a clean 2-batch sequence. The actual sequence has:

1. **Batch 1 (07:30:08)** — 14 ops applied ✓
2. **Sweep (07:31:24)** — agent-invoked, re-stales 10 entries (NOT mentioned in journal)
3. **Initial commit (07:33:33)** — committed with 12 stale (journal doesn't acknowledge this)
4. **Retry attempt 1 (07:37:41)** — 14 ops, failed at op 10 with `version_mismatch` (NOT mentioned)
5. **Retry attempt 2 (07:39:36)** — 10 ops, applied ✓
6. **Sweep (07:41:19)** — agent-invoked, re-stales 10 again (NOT mentioned)
7. **Direct file edit (between 07:41:41 and 07:42:49)** — flipped 10 entries back to stale (NOT in any tool log)
8. **Final commit (07:44:42)** — only plan.md changed

The journal claims a clean 2-batch flow. Reality has 2 batches + 2 sweeps + 2 direct file edits + 1 dry-run sweep. The 12-stale final state is the result of the direct file edit in step 7, not the result of the retry batch's payload.

---

## Why the cold-tier regression test passed

The test (`tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:67-100`) iterates `mechanism_check=true` findings and asserts grounding, but **only for entries with `status === "active"`**. Stale entries are not in scope. The test passed because the 4 still-active entries (with `created_at` < 7 days) have valid fingerprints. The 10 stale entries would also have valid fingerprints (13 of 14 matched out-of-the-box, 1 was refreshed), but the test doesn't check them. **The test is "grounded active findings stay grounded", not "sweep succeeded"** — different invariants.

---

## Root cause summary

1. **Workflow defect:** `checkStaleness` makes the stale→active transition **non-persistent** for any entry with `created_at > 7 days`. Any operator who runs `meta_state_sweep` after a batch will immediately undo the work. The plan treated this as a one-shot fix; the loop treats it as periodic re-verification.

2. **Agent behavior:** The agent ran `meta_state_sweep` as a verification step, which is the exact thing that breaks the sweep. The retry batch's `expires_at: null` payload is irrelevant — `expires_at` is not consulted by `checkStaleness`. The actual fix would have been `acked_at: <recent timestamp>` (since `checkStaleness` uses `acked_at || created_at`), but even that wouldn't survive the next sweep because the operator keeps running the sweep tool.

3. **Audit gap:** The final 10-entry stale state was achieved by a direct file write that bypassed MCP tools and therefore didn't appear in `gate-log.jsonl`. This is either a missing audit-log mechanism or an undocumented write path. Either way, the change-log entry claiming "14 entries swept" is inaccurate because the actual mechanism of the final state is opaque to the audit trail.

4. **Test gap:** The cold-tier regression test doesn't verify sweep success, only grounding. Adding a `stale_mechanism_check_true_count <= 2` assertion would have caught this bug at Phase 4.

---

## Recommended corrective actions (in order)

1. **Decide chronic-re-stale policy.** The simplest fix is to set `acked_at: <batch timestamp>` on the entries when transitioning them to active. This satisfies `checkStaleness` (which uses `acked_at || created_at`) and persists across sweeps. Alternatively, raise `STALENESS_WINDOW_MS` for legacy entries via environment override, or change `checkStaleness` to use `last_verified_at` instead of `created_at`. This decision needs operator input — it changes the semantics of the staleness invariant.

2. **Apply corrective batch (10 ops):** `{ status: "active", acked_at: "2026-06-26T14:45:00.000Z", last_verified_at: "2026-06-26T14:45:00.000Z" }` for the 10 stale entries. Plus the 2 mechanism_check=null entries (separate decision needed).

3. **Amend the change-log entry** to record: (a) the 2 unintended sweep re-stales, (b) the retry batch, (c) the direct file edit (if confirmed).

4. **Correct the journal:** replace the `checkExpiry` misattribution with the actual `checkStaleness` mechanism. Add a "sweep-after-batch anti-pattern" callout.

5. **Add sweep-success assertion** to cold-tier regression test: `assert(staleMcTrueCount <= 2, "sweep should reduce stale mechanism_check=true to ≤ 2 entries")`.

6. **Investigate audit-log gap:** either confirm the meta-state.jsonl write path bypasses gate-log.jsonl by design, or add the missing log entry. The change-log entry claiming "14 entries swept" should not have been possible if a write to meta-state.jsonl had been logged.

7. **Update plan template:** stale→active transitions must be paired with `acked_at` updates, and a post-batch `meta_state_sweep` must be considered harmful (it will undo the work).

---

## Open questions

- **OQ1:** Was the direct file modification in step 7 performed by the agent's `Write`/`Edit` tool, by a script, or by some other mechanism? Without `gate-log.jsonl` evidence, this is unverifiable from artifacts alone.
- **OQ2:** Was the change-log entry (`meta-260626T1432Z-plans-260626-0720-phase-e-stale-sweep-plan-md`) intentionally filed despite the 10 re-staled entries, or did the agent not notice the sweep at 07:31:24? The change-log was filed at 07:32:20 — 56 seconds after the sweep. Likely the agent ran the sweep as a verification step and didn't realize it had undone the work.
- **OQ3:** Why did the retry attempt 1 at 07:37:41 fail with `version_mismatch` on op 10? Probably stale version captures — the agent read versions before the sweep at 07:31:24 (versions incremented to 11) but didn't re-read after. The retry with re-read versions succeeded.

---

## Bottom line

The committed state (12 stale) is the result of a **workflow loop**: batch → sweep → retry batch → sweep → manual file edit. The agent's own verification tool (`meta_state_sweep`) is the antagonist. The journal's narrative (single retry with `expires_at: null` fixes it) describes a fix that addresses the wrong root cause. The actual mechanism (`checkStaleness` against `created_at`) requires a different fix (set `acked_at` to bypass created_at-based staleness), and even then requires the agent to stop running `meta_state_sweep` as a verification step.