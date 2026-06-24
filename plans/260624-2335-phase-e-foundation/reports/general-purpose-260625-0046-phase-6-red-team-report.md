# Phase 6 Red-Team Findings — FingerprintRepointAndVerify

## Phase 6 Red-Team Findings

### Critical (must fix before plan ships)

1. **The rename has NOT happened, but Phase 6 assumes it has** — Severity: **critical (plan is a no-op if executed against current state)**
   - `ls tools/learning-loop-mastra/core/gate-logic.js` → file not found. The 30+ files at `core/` are at `core/legacy/`, not the new top-level path. `diff` of `core/legacy/gate-logic.js` vs `core/gate-logic.js` returns "No such file or directory" because the new path doesn't exist.
   - The plan's Phase 6 § "Implementation Steps" step 1 says "verify the baseline (post-rename state)" — but the rename (Phase 2) is `in_progress` per Task #2. The `repoint-fingerprints.cjs` script will fail at `computeFileHash(newPath)` with ENOENT because the new paths (`core/gate-logic.js`, `core/loop-introspect.js`, `core/check-grounding.js`) do not exist.
   - Counter-claim in the plan that the rename is "purely a directory move (no content changes)" is fine for git, but the script needs the file to exist at the new path to compute the hash. The failure mode is uncaught exception inside the script, leaving the registry half-mutated (since the batch rollback fires only on `err.message`, not on script crash).
   - **Fix:** Phase 6 must be sequenced AFTER Phase 2 is complete, with an explicit "Phase 2 merge gate" assertion. Currently Phase 6 can be started in parallel with Phase 2 — the plan does not forbid it.

2. **`meta_state_batch` bypasses the IMMUTABLE_PATCH_FIELDS deny-list for `code_fingerprint`** — Severity: **critical (security/integrity)**
   - `tools/learning-loop-mastra/tools/legacy/meta-state-patch-tool.js:6-23` defines `IMMUTABLE_PATCH_FIELDS = { "id", "version", "created_at", "created_by", "code_fingerprint", ... }` and rejects any patch touching them.
   - `tools/learning-loop-mastra/core/legacy/meta-state.js:486-565` `metaStateBatch()` does `Object.assign(entries[idx], patch)` (line 525) with NO deny-list. The op schema (`meta-state-batch-tool.js:18`) is `.passthrough()` so any extra field is forwarded.
   - The plan's batch (7 `update` ops, each setting `evidence_code_ref` + `code_fingerprint`) would SUCCEED. This contradicts the documented invariant: "Identity and audit-trail fields (id, version, created_at, code_fingerprint, etc.) are denied at the handler."
   - `code_fingerprint` is the field whose authoritativeness the O(N)-constraint finding (`meta-260624T1920Z`) hinges on. The batch tool is the only writer in the system that can mutate it without `meta_state_refresh_fingerprint` doing the hash computation itself. This is an undocumented backdoor; the plan exploits it.
   - **Consequence:** if `code_fingerprint` is patchable in batch, then any operator with `OPERATOR_MODE=1` (or any agent that can call MCP) can pin a finding's fingerprint to a stale hash indefinitely, suppressing future drift detection. The cold-tier test can be gamed.
   - **Fix:** either (a) add the deny-list to `metaStateBatch`'s `update` branch, (b) keep the batch tool's `update` immutable for `code_fingerprint` and require a separate `meta_state_refresh_fingerprint` call (which is the documented pattern), or (c) explicitly document this backdoor as the new policy and add a regression test for it. The plan silently assumes (a) doesn't exist.

3. **The 7-finding list misses evidence_code_ref #2 (`meta-260613T1615Z-import-chain-analysis-...`)** — Severity: **critical (incorrect scope)**
   - The plan's table (phase-06 lines 29-37) lists 7 ids but the id `meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m` has `promoted_to_rule: "rule-import-chain-analysis-after-tool-deletion"` (line 103 of meta-state.jsonl).
   - Patching a finding that has been promoted to a rule may violate the rule/finding lifecycle invariant. `meta_state_patch` does not check `promoted_to_rule` — the patch succeeds — but the rule entry's `origin` field points to the finding, so the rule's lineage is now anchored to the new path. The plan does not address this.
   - Also: id #1 (`meta-260606T1830Z-...`) has `resolved_at: "2026-06-08T01:11:42.524Z", resolved_by: "auto-resolve"` AND `status: "stale"`. The plan's table shows `status=stale` for this entry but does not flag the resolved_at/resolved_by conflict. The meta-state registry has the rule that `status: stale` is past TTL or past staleness window — but `resolved_at` is set, which is the "resolved" branch's audit field. Patching the path on an entry that is BOTH stale AND auto-resolved creates a third state the schema doesn't model. The cold-tier consistency check (Finding 4 in plans/reports/debugger-260614-0207-session-06085a38-meta-state-process-gaps.md) explicitly calls this drift class.
   - **Fix:** add the `promoted_to_rule` and `resolved_at/resolved_by` audit fields to the patch decision. The plan's "1 batch op" framing is too aggressive for an entry that is both promoted-to-rule and auto-resolved.

4. **The id-based meta_state_list query returns 0 entries — the plan's verification step 4 (`meta_state_check_grounding({ id })`) will fail with `not_found`** — Severity: **critical (verification step is broken)**
   - Probe: `meta_state_list({ id: ['meta-260606T1830Z-context-pollution-', ...7 ids] })` → `{"entries": [], "count": 0, "filters_applied": {...}}`.
   - The exact id format the plan provides (e.g., `meta-260606T1830Z-context-pollution-...` with the `...` placeholder) doesn't match the actual stored ids (e.g., `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` — full slug, no `...`).
   - `meta_state_list` does prefix-matching on `id` (or exact-match — the response shows no match, so the prefix-or-exact semantics don't include the `...` truncation). The plan's step 4 verification passes a `...` placeholder that does not resolve.
   - **Fix:** replace `...` placeholders in the plan with the full slugs. Or, switch to `meta_state_query_drift({ run_grounding: true })` for verification (the drift query knows the real id format).

5. **Phase 6 step 7 (file `meta_state_log_change` audit entry) creates a window where the registry is mutated but no audit exists** — Severity: **critical (audit trail invariant)**
   - The plan's step 7 files the change-log AFTER the batch. Between step 3 (batch applied) and step 7 (change-log filed), the registry has 7 updated entries but no `change-log` entry says so. If a crash, OOM, or `meta_state_log_change` silent-persistence-fail (which is itself a known active finding `meta-260619T2233Z-...`, severity=escalate) occurs, the audit trail is permanently out of sync.
   - The plan's step 7 `reason` says "Phase E Plan 1 (Foundation) rename" — but the change-log should be filed BEFORE the batch, not after, so the audit trail shows the change-log entry first and the 7 updates second (chronological order matches the order of operations).
   - The `meta_state_log_change` tool has its own known silent-persistence-fail bug (status=stale, severity=escalate, repro ~12:37:56Z 2026-06-19). Step 7 trusts the tool's success indicator.
   - **Fix:** reverse the order: file the change-log first (with the planned delta), then the batch. The change-log becomes a "what we are about to do" record. Or batch the change-log + the 7 updates together (`meta_state_batch` accepts `write` ops for change-log).

### High (should fix)

6. **The constraint finding (id #7) is in the repoint set, creating a circular dependency the plan glosses over** — Severity: **high**
   - `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` is `status=reported` (NOT stale). It has `code_fingerprint: null` per the drift listing ("drift" block in loop_describe warm tier shows `code_fingerprint: null` for this entry).
   - The constraint's `evidence_code_ref` is `tools/learning-loop-mastra/core/legacy/check-grounding.js#computeFileHash` — the very file the `code_fingerprint` mechanism uses. After repoint, the constraint's `evidence_code_ref` becomes `tools/learning-loop-mastra/core/check-grounding.js#computeFileHash` (post-rename) — but `computeFileHash` is the function that computes the fingerprint. The constraint is now anchored to the function that produces the very field it constrains.
   - The plan's R4 ("circular dependency") dismisses this in one sentence: "the constraint is anchored to `core/legacy/check-grounding.js#computeFileHash`. After repoint, it anchors to `core/check-grounding.js#computeFileHash`. The constraint's RECOMMENDATION (a file-index design) is unaffected."
   - This is a real concern: the file-index design is the O(N)→O(1) migration target, and the implementation file is the very `check-grounding.js` that the constraint anchors to. The constraint's resolution direction implies modifying `check-grounding.js#computeFileHash` — but the constraint's fingerprint will need to be re-anchored when the implementation ships. The plan's batch updates the anchor now, but the post-file-index state will require another repoint.
   - **Fix:** rephrase R4 to acknowledge that this repoint is short-lived (it'll need to be re-anchored when the file-index design ships). Or anchor the constraint to a more stable reference (e.g., the docs/journal entry instead of the code file).

7. **The 6 stale findings' fingerprints are all `sha256:dcd915b8...` (identical) — they all point to the same file content** — Severity: **high (correctness of the new fingerprint)**
   - From meta_state_list probe: 5 of the 7 plan findings (ids #1, #3, #4, #5, #6) have `code_fingerprint: sha256:dcd915b8d160337e0b9a652dcf3f9ca81de9e2e80f4df0ec3d3c4059e093c2d4` (all identical). Id #6 has `sha256:f83d71bafeface8a35ff778ef3a287d8cdd99722dfd90621a0a3a587ab4b0c4f`. Id #7 has `code_fingerprint: null`.
   - The identical fingerprints across #1, #3, #4, #5 are because they all point to `core/legacy/gate-logic.js` (the file is the same; the anchor is different). After the repoint, the new path `core/gate-logic.js` — IF it exists post-rename — would have the SAME sha256 as the legacy file (git mv preserves content byte-for-byte). So the new fingerprint will also be `sha256:dcd915b8...` for all 5.
   - **The plan's `repoint-fingerprints.cjs` must compute the new hash of the new file.** If the file content has drifted (e.g., from other concurrent edits in Phase 1-5), the hash will differ. The plan's R2 says "the SHA-256 ... MUST be identical" but does not defend against a scenario where Phase 2's `git mv` was combined with content edits (which is forbidden but not enforced by the plan).
   - **Fix:** have the script compare the OLD fingerprint (read from the entry) against the NEW hash of the legacy file. If the legacy file's hash differs from the entry's stored fingerprint, abort — the rename is not pure.

8. **The cold-tier regression test will NOT fail for the 7 repointed findings, even if the repoint is wrong** — Severity: **high (test gives false confidence)**
   - From `__tests__/legacy-mcp/cold-tier-regression.test.js:83-89`:
     ```js
     if (grounding.drift_kind === "hash_mismatch" && ...evidence_code_ref.includes("#")) continue;
     ```
   - All 7 plan findings have anchor-based refs (`#splitSegments`, `:285`, etc.). The test EXEMPTS anchor-based hash_mismatch. So even if the fingerprint is wrong, the test passes.
   - And line 76-78:
     ```js
     if (grounding.drift_kind === "code_missing") continue;
     ```
   - If the repoint happens BEFORE Phase 2 rename completes, the new paths don't exist, the test sees `code_missing`, and skips. The test passes despite the registry being broken.
   - The test's "orphan invariant" (line 130-141) DOES check `existsSync(path)`, but stale is non-terminal (line 125 excludes only `auto-resolved|resolved|superseded|archived`). So for the 6 stale findings: if the new path exists, the orphan test passes (good). If the new path doesn't exist (rename not done), the orphan test FAILS for the 6 stale findings — but the plan's R3 says "post-repoint, the constraint becomes status=reported + new fingerprint; the test should pass." The plan doesn't address the 6 stale findings' orphan status.
   - **Fix:** the test's anchor-based exemption is correct (it captures a real fragility), but the plan should not rely on it for the 6 stale findings. The test as-written cannot detect the repoint bug. Add an explicit assertion that the 7 new paths exist.

9. **Stale findings are not exempt from `meta_state_derive_status`; the O(N)-constraint sweep will surface them again post-repoint** — Severity: **high**
   - The plan's "Verify" step 4 uses `meta_state_check_grounding({ id })` for each of the 7. But the underlying `checkGrounding` function doesn't filter by status — it computes hash match regardless of `status`. The 6 stale findings will pass (because the new file exists and hashes match), but `meta_state_derive_status` (which the drift query uses) returns `derived_status: "stale"` for stale entries regardless of grounding.
   - The drift query (`meta_state_query_drift({ filter: { status: 'reported' } })`) was just run — 1 drift event, the constraint. So the plan's "Drift count: 0" claim in § Test Output Reference is technically true for the reported filter. But it doesn't capture the 6 stale findings' drift — they remain stale and the cold-tier test treats them as anchored.
   - **Fix:** the plan should run `meta_state_query_drift({ run_grounding: true })` (not filtered) and confirm 0 drift for the 7 ids specifically. Or accept that the 6 stale findings remain stale (which the plan's R3 hints at but doesn't lock).

10. **`meta_state_batch` op schema is `passthrough()` — unknown fields are forwarded silently** — Severity: **high (debuggability)**
    - `meta-state-batch-tool.js:18`: `z.object({ op: z.literal("update"), id, _expected_version }).passthrough().describe("Update op; additional fields are merged into the entry")`.
    - The plan's batch op `{ op: 'update', id, patch: { evidence_code_ref, code_fingerprint } }` is forwarded as-is. But the `patch` wrapper is unusual: the op schema's only declared fields are `op`, `id`, `_expected_version` — there's no `patch` field. The `patch` key is just one of the passthrough fields, merged into the entry via `Object.assign`.
    - But `Object.assign(entries[idx], { op: 'update', id, patch: { ... }, _expected_version: 5 })` would set `entry.op = 'update'` and `entry.id = '<finding-id>'`. The `id` field IS in the deny-list for `meta_state_patch` — but the batch tool doesn't have a deny-list. This means the batch tool can overwrite `entry.id` (identity field!) with the op's `id`. The plan doesn't pass `id` in the op, so this is moot for the plan, but the tool's contract is unsafe.
    - More importantly, the plan's pseudocode shows `patch: { evidence_code_ref, code_fingerprint }` — but `patch` is not a recognized field, so the entry gets a new top-level `patch` field with the inner object, NOT a real patch. Let me re-verify by reading line 524-526 again:
      ```js
      const { _expected_version, ...patch } = op;
      Object.assign(entries[idx], patch);
      ```
    - `patch` is everything in `op` except `_expected_version`. So `Object.assign(entries[idx], { op: 'update', id: 'meta-...', patch: { evidence_code_ref: '...', code_fingerprint: '...' } })` would set `entry.op = 'update'`, `entry.id = 'meta-...'`, `entry.patch = { evidence_code_ref: '...', code_fingerprint: '...' }`.
    - The `entry.id` overwrite is silent (since `id` is not in the entry schema, the Zod `metaStateEntrySchema` doesn't have a top-level `id` field — actually it DOES, the entry's own id is the field, so the entry's `id` IS overwritten to the op's `id`, which is the same value — so this is a no-op for the plan).
    - The `entry.patch = { ... }` is a real new field added to the entry. The entry's schema (`z.record(z.string(), z.unknown())` for change-log, strict schemas for finding) would reject this. Let me verify.
    - **Fix:** the plan's pseudocode should use the actual fields: `{ op: 'update', id: '...', evidence_code_ref: '...', code_fingerprint: '...' }` (NOT wrapped in `patch`). The current pseudocode would either fail validation OR add a stray `patch` field to the entry.

### Medium (worth noting)

11. **Race condition with parallel MCP writers** — Severity: **medium**
    - `enqueue(root, fn)` (line 303-312) is a per-process Promise queue keyed by `root`. Two parallel MCP calls serialize through the queue. But if a different process writes to `meta-state.jsonl` (e.g., a test runner or a different Claude session), the queue doesn't apply.
    - The plan's R5 (in `plan.md`) says "Phase 6's test is the cold-tier regression itself; any orphan surfaces in the PR body" — but this doesn't address concurrent writers.
    - Phase 2 says "TDD Gate" — `pnpm test` runs against the same registry. If `pnpm test` runs the cold-tier test concurrently with the batch (unlikely but possible in CI), the queue serializes them but the test sees the post-batch state and the batch's `invalidateCache` may not have propagated to the test's cache.
    - **Fix:** add an advisory note that Phase 6 should be run in a single-agent context with no concurrent test runs.

12. **`BATCH_OP_TYPES` set vs the schema's discriminated union** — Severity: **medium (typo surface)**
    - `metaStateBatch` line 500: `if (!BATCH_OP_TYPES.has(op.op))` — but `BATCH_OP_TYPES = new Set(["write", "update", "delete", "archive"])`. The op schema's discriminator is `op: z.literal("write" | "update" | "delete" | "archive")`. The two match.
    - But if a future op type is added to the schema without updating `BATCH_OP_TYPES`, the schema accepts it but the batch rejects with "unknown_op_type". The plan doesn't add new op types, so this is not an active concern.

13. **The pre-rename manifest (`plans/.../reports/pre-rename-fingerprints.json`) is not declared in Phase 1** — Severity: **medium (process gap)**
    - `plan.md` § "Constraint Notes" step 1 says: "Before rename — record the baseline set of 7 fingerprints (pre-image) in a manifest at `plans/260624-2335-phase-e-foundation/reports/pre-rename-fingerprints.json`."
    - But Phase 1 (BaselineAndTests) does not mention this manifest. The plan's Phase 1 step must produce the manifest. Currently Phase 1's "what to do" is "capture pre-rename snapshot, write 4 regression tests (red)" — the manifest is implied but not explicit. If Phase 1 is implemented without the manifest, Phase 6 has no pre-image to fall back to.

14. **`meta_state_log_change` is filed with `change_target: tools/learning-loop-mastra/core/` — a directory, not a file** — Severity: **medium (schema)**
    - The plan's step 7 says `change_target: tools/learning-loop-mastra/core/` (the renamed dir). Looking at the schema for `change-log` entries, `change_target` is `z.string().min(1)` (no path validation). Other change-logs in the registry use file paths (`tools/scripts/run-pnpm-test-namespaced.mjs`, `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js`). A directory target is unusual.
    - The "evidence_code_ref" field on change-logs is the path to the actual code file. A directory target means the change-log is about the rename event itself, not a specific file. This is a valid use case but the registry's pattern is per-file.
    - **Fix:** either file 30+ change-logs (one per renamed file) or file 1 with `change_target: plans/260624-2335-phase-e-foundation/plan.md` and let the change_diff enumerate the 30+ files. The plan's `evidence_journal: plans/260624-2335-phase-e-foundation/plan.md` is good; use it as `change_target` for consistency with other change-logs.

15. **The plan claims idempotence: "running twice produces the same final state"** — Severity: **medium (correctness)**
    - The plan's pseudocode step 2 says: "The script is idempotent: running twice produces the same final state (the second run sees the new paths, computes the same fingerprints, and applies a no-op update)."
    - But the `Object.assign` in `metaStateBatch` always bumps the version (line 526: `entries[idx].version = (entries[idx].version ?? 0) + 1`). A re-run increments the version field on each entry twice, and the audit trail shows two batches instead of one. The DATA is the same, but the VERSION DIFFERS. Idempotence is a partial claim.
    - **Fix:** explicitly say "idempotent at the data level (the second run's batch updates the same fields to the same values); the version is incremented twice, but this is acceptable for an audit-trail (each batch op is a logged event)."

16. **Stale-finding id #1's `last_verified_at` is from 2026-06-11; the post-repoint cold-tier regression test should re-verify but doesn't** — Severity: **medium**
    - The plan's verification step 4 uses `meta_state_check_grounding({ id })` but NOT `meta_state_re_verify({ id })`. The grounding check is read-only; re-verify is what stamps `last_verified_at` and transitions stale → active.
    - Without `meta_state_re_verify`, the 6 stale findings remain stale forever; the 1 reported finding's status doesn't transition. The cold-tier test's grounding check passes, but the registry lifecycle doesn't progress.
    - **Fix:** add `meta_state_re_verify` calls (gated on `META_STATE_VERIFY_EXEC=1`) for the 6 stale findings. Or document that the re-verify is deferred to a follow-up plan.

17. **The plan's "Drift count: 0" claim in § Test Output Reference is for `status: reported` filter only** — Severity: **medium (misleading documentation)**
    - The drift query was run with `filter: { status: 'reported' }` and returned 1 drift event (the constraint itself). The plan's reference output says `# Drift count: 0` — this contradicts the actual probe.
    - The plan's intent is "drift count for the 7 repointed findings = 0", not "drift count across all reported findings = 0". The test output reference is misleading.
    - **Fix:** update the test output reference to match: `# Drift count for 7 repointed findings: 0` or similar.

### Verification of plan claims

- **Plan says 7 findings are anchored to `core/legacy/*`**
  - Actual: 6 `core/legacy/*` (4→`core/legacy/gate-logic.js`, 1→`core/legacy/loop-introspect.js`, 1→`core/legacy/check-grounding.js`) PLUS 1 entry (`meta-260606T1830Z-...`) which has BOTH `evidence_code_ref: core/legacy/gate-logic.js#splitSegments` AND `resolved_at: 2026-06-08`. Plan claims 7 unique evidence_code_refs; confirmed 7 unique values. ✓
  - But 2 more `core/legacy` mentions in `meta-state.jsonl` are inside description fields (id #1's description says "F12 evidence_code_ref repointed to core/legacy/..."; the constraint finding id #7's description says "files in tools/learning-loop-mastra/core/legacy/"). These are narrative text, not evidence_code_ref values. ✓
  - **Delta:** plan's list of 7 ids matches the 7 evidence_code_ref values anchored to `core/legacy/*`. No missing findings. ✓ (with the caveat from finding #3 about promoted-to-rule and resolved_at conflicts).

- **Plan says `meta_state_batch` cap is 500**
  - Actual: `BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500` (line 7 of `meta-state-batch-tool.js`). The cap is 500 by default, overridable. Plan's 7 ops is 70x under the cap. ✓

- **Plan says batch tool is in the tool list**
  - Actual: `loop_describe` warm tier returns `metaStateBatchTool` in the tools array. ✓

- **Plan says the batch is atomic with 1 lock + 1 cache invalidation**
  - Actual: `metaStateBatch` uses `enqueue(root, fn)` (line 493) for the single lock and `invalidateCache(root)` (line 562) for the single cache invalidation. ✓ (with the caveat from finding #10 about passthrough safety).

- **Plan says `code_fingerprint` can be refreshed in batch**
  - Actual: `metaStateBatch` `Object.assign(entries[idx], patch)` does not check the `IMMUTABLE_PATCH_FIELDS` deny-list. The op schema is `.passthrough()`. So `code_fingerprint` IS patchable in batch. ✓ (but this is undocumented behavior — see finding #2).

- **Plan says the drift query returns 0 drift for the 7**
  - Actual: `meta_state_query_drift({ filter: { status: 'reported' } })` returns 1 drift event (`meta-260624T1920Z-...`, the constraint, drift_kind=assertion_lags_derivation). The 6 stale findings are not in the reported filter. The 7 repointed findings are not the source of the drift. Plan's claim is misleading. ✗

- **Plan says the cold-tier regression test will pass post-repoint**
  - Actual: `__tests__/legacy-mcp/cold-tier-regression.test.js` exempts hash_mismatch on anchor-based refs (line 83-89) and code_missing (line 76-78). The test's orphan invariant (line 130-141) checks `existsSync` on non-terminal findings (stale is non-terminal). If the rename (Phase 2) is complete and the new paths exist, the test passes. If Phase 2 is NOT complete, the orphan test FAILS for the 6 stale findings (paths don't exist). ✓ (gated on Phase 2).

- **Plan says `meta_state_list({ id: ['meta-260606T1830Z-context-pollution-', ...] })` returns 7 entries**
  - Actual: returns 0 entries. The `...` truncation is not honored; the tool requires full slugs or specific prefix matching. ✗

### Unresolved questions for the plan author

1. **Phase ordering:** Phase 6 is "Pending" but Phase 2 is "in_progress". Can Phase 6's script run successfully against the current filesystem (where `core/gate-logic.js` does not exist)? If yes, how? If no, should the plan add a Phase 2 completion gate?

2. **`code_fingerprint` immutability policy:** Is the plan intentionally exploiting a backdoor in `metaStateBatch`? Or is this a bug in the batch tool that the plan should report (via `meta_state_report`) rather than rely on?

3. **`promoted_to_rule` field:** For id #2 (`meta-260613T1615Z-...`), the entry has `promoted_to_rule: rule-import-chain-analysis-after-tool-deletion`. After the repoint, the rule's `origin` field still points to the finding id (good), but the finding's `evidence_code_ref` has moved. Does the rule entry's lineage need updating? (The rule's `origin` is the finding id, not the evidence_code_ref, so no — but the plan doesn't say so explicitly.)

4. **The constraint finding's `code_fingerprint` is null:** The plan's step 2 (`computeFileHash(newPath)`) computes a fingerprint for the new file. But the entry has `code_fingerprint: null` — the `Object.assign` would set it from null to the new hash. Is the patch allowed when the current value is null? `metaStateBatch` doesn't check this; the plan doesn't either. The `meta_state_refresh_fingerprint` tool (the documented way to update fingerprints) handles null specially (it computes and stores); the batch tool's `Object.assign` would overwrite null with the new hash. Behavior is correct, but undocumented.

5. **`meta_state_log_change` ordering:** The plan files the change-log AFTER the batch. Should it be BEFORE (chronological order matches execution order)? Or batched together?

6. **`change_target` is a directory:** The plan's step 7 says `change_target: tools/learning-loop-mastra/core/` (a directory). Other change-logs use file paths. Is this intentional? If so, add a note.

7. **Stale-finding lifecycle post-repoint:** The 6 stale findings remain stale. The plan doesn't trigger `meta_state_re_verify` to transition them to active. Is this a follow-up?

8. **Test output reference says "Drift count: 0":** But the actual drift query (with `status: reported` filter) returns 1 event. Should the test output be reworded to "Drift count for 7 repointed findings: 0"?

9. **The constraint finding (id #7) is the only `status=reported` in the repoint set:** After repoint, it remains `reported` (with new fingerprint). The `meta_state_query_drift({ filter: { status: 'reported' } })` query still returns 1 drift event. Is this expected? (The drift kind is `assertion_lags_derivation`, which is a meta-state lifecycle drift, not a fingerprint drift.)

10. **`repoint-fingerprints.cjs` location:** The plan says `tools/learning-loop-mastra/scripts/repoint-fingerprints.cjs` — but this directory is the MASTRA runtime scripts, not the plan's scripts. Should the script be in `plans/260624-2335-phase-e-foundation/scripts/` instead?

11. **The legacy files in `core/legacy/` (33 files):** After the rename (Phase 2), do these files exist or are they removed? The plan says "git mv preserves history" — but the SOURCE dir `core/legacy/` is now empty (after `git mv` of all 33 files into `core/`). Does the `core/legacy/` dir get removed? `ls` shows it still exists with content. This is a separate state issue not addressed by the plan.

12. **Test count claim:** Plan says "All 1189+ existing tests still pass" but the previous session note (from `meta-260624T1558Z-...`, status=resolved) says final test count was "978/979 tests passing across 5 mcp-* globs". 1189 vs 978 — is the 1189 the OLD pre-cutover count or the post-cutover count?

13. **The `meta_state_refresh_fingerprint` call is mentioned as a fallback in plan R1 but the script in step 2 doesn't have a fallback path:** If the batch fails, the plan says "abort and diagnose" but doesn't say "fall back to 7 sequential refresh + 7 patch calls." Is the fallback an explicit step or just an escape hatch?

14. **`meta_state_list` id filter doesn't match the `...` truncated form:** The plan's verification step uses truncated ids. Should the plan use full slugs?
