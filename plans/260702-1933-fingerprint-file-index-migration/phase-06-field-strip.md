---
phase: 6
title: "Field Strip"
status: completed
priority: P2
dependencies: [5]
---

# Phase 6: Field Strip

## Overview

Strip `code_fingerprint` **values** from all findings (incl. resolved/superseded), keeping the schema field (`@deprecated`, optional). The index is now the sole authoritative baseline; the per-record field is dead data. This is the cleanup pass the user chose (validation Q1 + scope) — it reverses the brainstorm's "no rewrite of audit-immutable findings" principle by explicit decision, recorded in the closeout `meta_state_log_change`.

## Requirements

- Functional: every finding's `code_fingerprint` value is removed (set to absent) in `meta-state.jsonl`. The schema field stays (`@deprecated`, optional, regex unchanged) so the function's fallback code + the 30 in-memory unit tests stay valid.
- Functional: after the strip, `checkGrounding` with the loaded index returns `grounded` for every `mechanism_check:true` finding whose cited file exists (the index owns the baseline). Findings with no index entry fall to `hash_match:null`→`grounded` (file exists) — no drift detection for the un-indexed, but the seed (Phase 5, all incl. terminal) covered every cited path.
- Non-functional: the strip is a one-shot migration script (idempotent — re-running is a no-op since values are already absent). The strip mutates terminal (resolved/superseded) records — an intentional, logged exception to audit-immutability.
- **Rollback narrows:** once stripped, per-record baselines are gone; rollback of Phase 3/4/5 *code* still works, but per-record baselines can't be restored (the index is authoritative). Accepted by the user (plan.md Validation Log).

## Architecture

- Strip script (one-off, run locally): iterate `readRegistry`; for each finding with a `code_fingerprint` value, remove it (rewrite the line without the field); write atomically (tmp+rename under `enqueue`). Idempotent: a second run finds no values to strip.
- The `checkGrounding` fallback branch (`indexBaseline ?? entry.code_fingerprint ?? null`) stays in the code — after the strip, `entry.code_fingerprint` is `undefined` for all findings, so the fallback resolves to `null` (no baseline) when the index lacks the key. The 30 unit tests pass in-memory fixtures with `code_fingerprint` set, so they still exercise the fallback branch and stay green.
- The F14 dual-path fallback (write `entry.code_fingerprint` on auto-populate failure) is **removed** post-strip — the field is no longer a useful bootstrap. Auto-populate failure = retry the index write + prominent log (no per-record fallback).

## Related Code Files

- Modify: `meta-state.jsonl` (strip `code_fingerprint` values from all findings — one-shot script).
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js` (remove the F14 dual-path fallback now that the field is stripped; auto-populate failure = retry + log).
- Reference: `tools/learning-loop-mastra/core/check-grounding.js` (the fallback branch stays — reads `entry.code_fingerprint` which is now `undefined`).
- Reference: `tools/learning-loop-mastra/core/meta-state.js` (schema field stays `@deprecated`; no change this phase).

## Implementation Steps

1. **TDD — lock the post-strip invariant first:** add a test asserting `checkGrounding` with a loaded index returns `grounded` for a finding with NO `code_fingerprint` (index owns the baseline); and `grounded` (file-exists, `hash_match:null`) for a finding with no `code_fingerprint` AND no index entry.
2. Write the idempotent strip script; dry-run (count values to strip) before applying.
3. Apply the strip; commit `meta-state.jsonl`.
4. Remove the F14 dual-path fallback in the check-grounding tool (auto-populate failure = retry + prominent log).
5. Run full suite: `cold-tier-regression` (index loaded — every cited path is seeded, so all `grounded`), `check-grounding` (30 — in-memory fixtures, green), all new tests.
6. Update the closeout `meta_state_log_change` (Phase 5 filed it; this phase appends the strip as a recorded exception) — note the audit-immutability exception + the narrowed rollback.

## Success Criteria (TDD)

- [ ] Test: no-`code_fingerprint` finding `grounded` via the loaded index; no-field-no-index finding `grounded` (file exists, `hash_match:null`).
- [ ] `code_fingerprint` values stripped from all findings; `grep -c '"code_fingerprint"' meta-state.jsonl` over finding lines returns 0 (the field is absent, schema still allows it).
- [ ] Strip script is idempotent (second run = no-op).
- [ ] F14 dual-path fallback removed; auto-populate failure = retry + prominent log.
- [ ] `cold-tier-regression.test.js` (index loaded) green — every cited path is seeded (Phase 5), so all findings `grounded` via the index.
- [ ] `check-grounding.test.js` (30) green — in-memory fixtures still set `code_fingerprint`, exercising the fallback branch.
- [ ] Closeout change-log records the strip + the audit-immutability exception + the narrowed rollback.

## Risk Assessment

- **Risk (highest):** stripping a finding whose cited path was NOT seeded → no index entry, no per-record fallback → `hash_match:null`→`grounded` (file exists) → drift undetected for that finding. **Mitigation:** Phase 5 seeds ALL `mechanism_check:true` paths (incl. terminal) + verifies `readFileIndex(root).size === distinctCount` BEFORE this phase runs. The strip script must not run until the seed completeness check passes. Test: a finding whose path is seeded stays `grounded` via the index post-strip.
- **Risk (audit-immutability):** stripping mutates resolved/superseded records. **Mitigation:** intentional, user-approved exception; recorded in the closeout `meta_state_log_change`. The historical *change-log* entries that reference `code_fingerprint` (immutable audit records) are NOT findings and are untouched.
- **Risk (rollback):** per-record baselines are gone post-strip. **Mitigation:** accepted (plan.md Validation Log). The index is authoritative; rollback of code still works, findings ground via the index or `hash_match:null`.
- **Risk:** the 30 unit tests set `code_fingerprint` in-memory and assert fallback behavior — could a future refactor delete the fallback branch and break them. **Mitigation:** the fallback branch stays (it's harmless — reads an absent field); the tests pin it. Do NOT remove the fallback in this phase.
- **Rollback:** restore `code_fingerprint` values by re-seeding from current file hashes via a one-shot script (the values are deterministic from the files + `computeFileHash`). Not a one-commit revert (the values are gone from `meta-state.jsonl`), but recoverable since the cited files still exist. Document this recovery in the closeout.