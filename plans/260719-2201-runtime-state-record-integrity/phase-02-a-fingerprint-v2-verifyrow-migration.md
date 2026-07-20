---
phase: 2
title: "A: Fingerprint v2 + verifyRow + migration"
status: completed
priority: P1
effort: "4-6h"
dependencies: ["1"]
---

# Phase 2: A — Fingerprint v2 + verifyRow + migration

## Overview

Widen the runtime-state row fingerprint to a true row-integrity hash covering `affected_system|kind|id|source_ref|value|delta|timestamp|metadata` (metadata canonicalized via recursive sorted keys; arrays preserve order), export `computeFingerprint` + add `verifyRow(row) → bool` (v2-only) to `core/runtime-state.js`, wire `verifyRow` into the read tool (per-row `fingerprint_valid`) and the dispatch idempotency scan (fail-closed `corrupt_dispatch_row` refusal), and migrate all existing rows in `runtime-state.jsonl` to v2 fingerprints via a one-time idempotent migration script. Finding A resolves here.

## Requirements

- Functional: two rows differing only in `metadata` produce distinct fingerprints (regression fixture = prod rows 9/10); `verifyRow` returns true for a row round-tripped through `appendLedgerEvent`, false for a tampered row, false for null/non-string fingerprint; `runtime_state_read` returns `fingerprint_valid` per row; `meta_state_dispatch_finding` (prepare + commit) refuses with `reason:"corrupt_dispatch_row"` + a gate-log entry when `verifyRow` fails on the existing dispatch row; every row in `runtime-state.jsonl` carries a v2 fingerprint after the migration and `verifyRow` returns true for all.
- Non-functional: `computeFingerprint` is deterministic across metadata key reorder (canonicalization); `verifyRow` is v2-only (no version field — locked decision 1); the migration script is idempotent (re-running on an already-migrated file is a no-op) and kept for reproducibility; `supersedes_fingerprint` becomes a stale v1 reference (no JS reader — accepted, decision 1).

## Architecture

- **`computeFingerprint` (v2)** in `core/runtime-state.js`, exported (rename from module-private `computeRuntimeStateFingerprint`):
  ```js
  function canonicalize(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(canonicalize);  // arrays preserve order
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  export function computeFingerprint(row) {
    const meta = JSON.stringify(canonicalize(row.metadata ?? {}));
    const data = `${row.affected_system}|${row.kind}|${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}|${meta}`;
    return "sha256:" + createHash("sha256").update(data).digest("hex");
  }
  ```
  Field order matches finding A's diagnosis. Excluded: `fingerprint` (circular), `status` (lifecycle, not identity — the sidecar is append-only), `fingerprint_version` (none — v2-only per decision 1).
- **`verifyRow` (v2-only)**:
  ```js
  export function verifyRow(row) {
    if (typeof row?.fingerprint !== "string") return false;
    return computeFingerprint(row) === row.fingerprint;
  }
  ```
- **Read-tool wiring**: `toCompactRow` + full-row path add `fingerprint_valid: verifyRow(row)` to each returned row. Don't skip, don't throw on a bad fingerprint — the flag fulfills the read tool's L24-26 doc promise ("callers can verify row integrity by default"). A freshly-written row → `true`; a tampered row → `false`. (Phase 1 already swapped the read path; this phase adds the `verifyRow` import + the field.)
- **Dispatch wiring** (`meta-state-dispatch-finding-tool.js`): after `findDispatchRow` returns non-null at L113 (prepare) and L184 (commit), call `verifyRow(existing)`. On `false`: return the stage's existing refusal shape with `{ dispatched:false, reason:"corrupt_dispatch_row", id, stage }` and `appendGateLog` a corruption entry (fail-closed — decision 2). This avoids both ghost-issue binding and duplicate-issue creation.
- **Migration** (`scripts/migrate-runtime-state-fingerprints.mjs`, NEW): read every row via `readRuntimeStateRows`, recompute each `fingerprint` with `computeFingerprint` (v2), write to a temp file then `renameSync` atomically over the original (crash-safe — the file is never half-written). Idempotent guard: if every row already verifies under v2 (`verifyRow(row) === true` for all), exit 0 no-op (so re-runs and CI don't double-write). **MUST run when no agent is mid-write** (no concurrent `runtime_state_record`/`appendLedgerEvent` calls) — a concurrent append during the read-then-rename window would be lost (the rename clobbers the original); the operator gates this one-time run. Preserves all other fields verbatim (including `metadata.supersedes_fingerprint` — now a stale v1 ref, no reader). Keep the script in the repo for reproducibility. **The migration RUN is a one-time operator step (the committed `runtime-state.jsonl` is the result); CI never mutates the real tracked file — the idempotency test (step 1) uses a temp fixture.**
- **`scripts/convert-ledger-to-sidecar.mjs:24`** — add a one-line comment on its `computeFingerprint` noting it is the legacy v1 shape retained for historical reproducibility; do NOT change the formula (rewriting history's fingerprints is out of scope).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/runtime-state.js` — widen + export `computeFingerprint`; add `verifyRow`; `appendLedgerEvent` calls the new `computeFingerprint` (it already calls the module-private one — rename only).
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js` — import `verifyRow`; add `fingerprint_valid` to each returned row (compact + full). (Phase 1 left this file clean; this phase adds only the `verifyRow` wiring.)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js` — import `verifyRow`; call it at L113 (prepare) + L184 (commit) after `findDispatchRow`; fail-closed refusal + gate-log on false.
- Create: `scripts/migrate-runtime-state-fingerprints.mjs` — idempotent v2 re-fingerprint of `runtime-state.jsonl`.
- Modify: `runtime-state.jsonl` — re-fingerprinted by running the migration script (tracked file; one commit).
- Modify: `scripts/convert-ledger-to-sidecar.mjs:23` — one-line comment (legacy v1 formula).
- Create: `tools/learning-loop-mastra/__tests__/runtime-state-fingerprint.test.js` — v2 fingerprint + verifyRow regression tests.
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.test.js` — add `fingerprint_valid:true` (fresh) + `false` (tampered) assertions.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-dispatch-finding-tool.test.js` (confirmed present) — add a `corrupt_dispatch_row` refusal test (write a dispatch row via `appendLedgerEvent`, tamper its `metadata` on disk, call commit → expect `reason:"corrupt_dispatch_row"`).

## Implementation Steps (TDD)

**Tests Before**
1. Create `runtime-state-fingerprint.test.js`:
   - **Prod collision fixture (rows 9/10)**: two rows identical except `metadata.action`/`metadata.experiment` → `computeFingerprint` distinct. Fails under the current 5-field formula (metadata not hashed).
   - **Metadata key-reorder stability**: `{a:1,b:2,c:{z:9,y:8}}` vs `{c:{y:8,z:9},b:2,a:1}` → identical fingerprints (canonicalization).
   - **verifyRow round-trip true + tamper false**: `appendLedgerEvent` a row → `verifyRow(written) === true`; tamper `metadata` → `verifyRow === false`.
   - **verifyRow null/non-string → false**: `verifyRow({fingerprint:null,...})` and `verifyRow({fingerprint:undefined,...})` → false.
   - **Migration idempotency**: write a sidecar with v2-fingerprinted rows → run the migration script → no-op (file unchanged); write a sidecar with v1-style fingerprints (5-field) → run → every row re-fingerprinted to v2 + `verifyRow === true` for all.
   Run — expect the first test to FAIL (current formula), the reorder test to FAIL (current formula non-canonical), the round-trip to pass only after `verifyRow` exists.
2. Add read-tool `fingerprint_valid` assertions: extend the compact-mode test (L57-95) to assert `row.fingerprint_valid === true` for a freshly-written row (write via `appendLedgerEvent` into the temp sidecar so the fingerprint is real); add a tampered-row case asserting `fingerprint_valid === false`.
3. Add a dispatch `corrupt_dispatch_row` test (write a dispatch ledger row, tamper on disk, commit → expect `reason:"corrupt_dispatch_row"`).

**Refactor**
4. In `core/runtime-state.js`: replace `computeRuntimeStateFingerprint` with the exported `computeFingerprint` (v2 + canonicalization); `appendLedgerEvent` calls it (rename only — the call site at L76 stays). Add + export `verifyRow`.
5. In `runtime-state-read-tool.js`: import `verifyRow`; in both the compact and full-row paths, add `fingerprint_valid: verifyRow(row)` to each row object returned. Update the L24-26 doc-comment + the tool `description` (L34) to name `fingerprint_valid` (fulfilling the "callers can verify row integrity by default" promise with the actual field).
6. In `meta-state-dispatch-finding-tool.js`: import `verifyRow`; at L113 + L184, after `findDispatchRow` returns non-null, guard `if (!verifyRow(existing))` → return the stage's refusal with `reason:"corrupt_dispatch_row"` + `appendGateLog`.
7. Write `scripts/migrate-runtime-state-fingerprints.mjs` (idempotent: skip if all rows already verify v2; else re-fingerprint every row in place).
8. Run the new tests — expect PASS.

**Tests After**
9. Run the migration script against the real `runtime-state.jsonl`. Assert `verifyRow === true` for every row (a one-line check via `readRuntimeStateRows` + `verifyRow` in a scratch `node -e`, OR a dedicated migration test that reads the real file — prefer a test that reads the real file post-migration and asserts all rows verify).
10. `pnpm test:iter` green; `pnpm exec vitest --changed` green.
11. Re-run the migration script → idempotent no-op (file unchanged; verify via `git diff` clean after the second run, or a test asserting the second run is a no-op).

**Regression Gate**
12. `pnpm test:iter` green.
13. `check_runtime_agnostic` on `core/runtime-state.js` + the read tool + the dispatch tool — passes (core in the universal/canonical location; tools are thin shims).
14. Runtime-agnostic regression test (`tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`) green.

**Finding resolution**
15. `meta_state_resolve({ id: "meta-260719T2144Z-runtime-state-row-fingerprint-omits-affected-system-kind-and", resolution: "computeFingerprint (core/runtime-state.js) now hashes affected_system|kind|id|source_ref|value|delta|timestamp|metadata with canonicalized metadata (recursive sorted keys; arrays preserve order). verifyRow (v2-only) exported and wired into runtime_state_read (per-row fingerprint_valid) and meta_state_dispatch_finding (fail-closed corrupt_dispatch_row refusal). runtime-state.jsonl migrated to v2 via scripts/migrate-runtime-state-fingerprints.mjs (idempotent; kept for reproducibility). NOTE: legacy metadata.supersedes_fingerprint values are v1-formula and not comparable to v2 — no JS reader, no action." })`.
16. `meta_state_log_change({ change_dimension: "semantic", change_target: "tools/learning-loop-mastra/core/runtime-state.js", change_diff: { changed: ["computeFingerprint widened to 8-field row-integrity hash + canonicalized metadata", "verifyRow added (v2-only)"], added: ["verifyRow export", "fingerprint_valid on runtime_state_read rows", "corrupt_dispatch_row refusal in dispatch", "scripts/migrate-runtime-state-fingerprints.mjs"], changed_files: ["runtime-state.jsonl (v2 migration)"] }, reason: "Make the runtime-state fingerprint a true row-integrity hash (was colliding in prod on rows differing only in metadata) + add read/dispatch-side verification. Finding meta-260719T2144Z." })`.

## Success Criteria

- [ ] Two rows differing only in `metadata` produce distinct v2 fingerprints (prod rows 9/10 regression test).
- [ ] Metadata key reorder does not change the fingerprint (canonicalization test).
- [ ] `verifyRow`: round-trip true; tamper false; null/non-string false.
- [ ] `runtime_state_read` returns `fingerprint_valid` per row (true for fresh, false for tampered).
- [ ] `meta_state_dispatch_finding` fails-closed with `reason:"corrupt_dispatch_row"` + gate-log when `verifyRow` fails on the existing dispatch row.
- [ ] `runtime-state.jsonl` migrated: every row v2-fingerprinted, `verifyRow === true` for all; migration script idempotent (re-run no-op); script kept.
- [ ] `scripts/convert-ledger-to-sidecar.mjs:23` carries a legacy-v1 comment.
- [ ] Finding A (`meta-260719T2144Z-...`) resolved; change logged.

## Risk Assessment

- **Migration invalidates legacy fingerprints (decision 1 — accepted).** All 24 pre-migration rows are v1-hashed; `verifyRow` (v2-only) would return false for them until the migration runs. **MANDATORY: Phase 2 ships as ONE atomic commit** — hash widening + `verifyRow` wiring (read tool + dispatch guard) + migration script + the migrated `runtime-state.jsonl` all land together. No intermediate commit where `verifyRow` is live but the sidecar is still v1 (every read would report `fingerprint_valid:false` and the dispatch guard would refuse on every existing dispatch row). The migration RUN (step 9) is the final step before the regression gate; the idempotency guard prevents double-writes; the dispatch fail-closed check only refuses on a row that fails v2 verification post-migration (i.e. genuinely corrupt, not merely legacy).
- **`supersedes_fingerprint` (row 24 → row 23) becomes a stale v1 reference (decision 1 — accepted).** No JS reader (confirmed by grep). The migration recomputes row 23's `fingerprint` to v2, so `metadata.supersedes_fingerprint` no longer matches any row's stored `fingerprint`. Mitigation: record in the finding-A resolution note (step 15) that `supersedes_fingerprint` is v1-formula and not comparable to v2; if C (out of scope) keeps the same-id correction mechanism, it must re-derive `supersedes_fingerprint` under v2 or drop the field.
- **Determinism across write/read.** `appendLedgerEvent` writes via `JSON.stringify(withFingerprint)` (insertion-order keys); `verifyRow` recomputes via `computeFingerprint` which canonicalizes. For a single write→read cycle the stored `fingerprint` was computed by the SAME `computeFingerprint` (canonicalized), so the read-side recompute matches. Mitigation: the canonicalization test (step 1) pins this; both sides call the one canonical function.
- **Dispatch fail-closed blocks re-dispatch (decision 2 — accepted).** If a genuinely-corrupt dispatch row exists, the tool refuses instead of creating a duplicate issue. Mitigation: the gate-log entry surfaces the corruption for operator repair; the refusal message names the id + stage so the operator can inspect `runtime-state.jsonl` directly.
- **Migration script clobbering.** Writing `runtime-state.jsonl` in place is a tracked-file edit. Mitigation: the script is idempotent (no-op if all rows already verify v2); it preserves all non-fingerprint fields verbatim; run it once, commit, and the second run is a no-op (verified by `git diff` clean).
- **`appendLedgerEvent` write-amplification.** It already calls the (renamed) `computeFingerprint`; no new writes. The dispatch tool and record tool continue to write via `appendLedgerEvent`, so new rows are v2-fingerprinted automatically post-refactor. No additional call sites needed.
