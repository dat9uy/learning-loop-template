# Phase 4 Report — Recurrence candidate filtering

- Phase: phase-04-recurrence-candidate-filtering
- Plan: `plans/260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification/plan.md`
- Status: DONE
- Date: 2026-08-09

## Summary

Changed recurrence tracking from "every repeated rule event files a finding" to explicit candidate filtering. Only parser-proven, evaluator-produced `unexpected-match` events enter the promoted-rule grouping/dedup/write path; ordinary rule fires and unclassified/legacy rows remain telemetry. Toolchain-failure rows keep their own branch unchanged. Cross-surface same-identity provenance disagreement fails closed before dedup order selects a surface winner. All 11 Phase-1 RED tests are now GREEN; both positive pins and every existing recurrence/dedup/cross-session/heredoc/privacy/toolchain test stay green. Full project suite: 3322 passed, 4 skipped, 0 failed.

## (a) `isUnexpectedMatchCandidate` contract + where it is applied

Pure eligibility helper in `tools/learning-loop-mastra/core/recurrence-tracker.js`:

```js
export function isUnexpectedMatchCandidate(entry) {
  return (
    entry?.event_source === "bash-gate-evaluator"
    && entry?.candidate_kind === "unexpected-match"
    && entry?.match_origin === "inert-data"
  );
}
```

- Returns `true` ONLY for the exact discriminated trio; every other state (missing fields, `unclassified`, `ordinary-rule-fire`, wrong producer, contradictory pair, toolchain source) is `false`.
- Partitioning wrapper `isRecurrenceGroupableEntry(entry)`: `rule_id === "toolchain-failure"` returns `true` (existing toolchain branch unchanged, never touched by promoted-rule logic); every other rule_id requires `isUnexpectedMatchCandidate`.

Applied in three places:
1. `findRecurrentGroups` per-session grouping loop — only eligible entries enter a group.
2. `findCrossSessionGroups` — the eligible filter is applied to the cross-session (slow-burn) pass so ordinary/legacy rows can never accumulate across sessions.
3. `readDecisionLogEntries` — cross-surface conflict downgrade (see (b)).

`entries_scanned` is preserved: it reports the full decision-log line count (the read uses the raw union with `dedupe:false`), filtering happens at grouping time, not scan scope.

## (b) Cross-surface disagreement fails closed

`findRecurrentGroups` no longer uses `readDecisionLog` (which dedupes first-wins). New `readDecisionLogEntries(root)` in the tracker:

1. Reads the full raw union via `readJsonlFromAllSurfaces(root, DECISION_LOG_FILE, { dedupe: false, since: 0, sort: "none" })` — no dedup, all surfaces' lines. This keeps the change local to recurrence-tracker.js and satisfies the core/ "no inline for-of-SURFACES loops" invariant (surfaces.js untouched).
2. First pass: per-identity signatures across ALL surfaces. Identity key is exactly the reader's dedup key `ts::command_prefix::rule_id::decision::session_id`; the provenance signature is `event_source|match_origin|candidate_kind`.
3. Second pass: dedupe first-occurrence-wins; if an identity has >1 distinct provenance signature, the surviving row is downgraded to `candidate_kind: "unclassified"` / `match_origin: "unknown"` (fail closed) BEFORE dedup order can select a surface winner.

A `.claude` unexpected-match row + `.factory` ordinary row for one identity is one conflicted event that can never auto-file. Identical fan-out rows (same identity, same provenance) still dedupe to one row with their original provenance — the previous reader behavior is preserved.

The RED contract test was also tightened with per-identity timestamp disambiguation (`t + i`) so the three pairs are distinct identities — an ms collision would otherwise collapse all three into one row whose surface winner won before the disagreement check ran.

## (c) Privacy change for `sample_commands`

Both the per-session group and cross-session group now emit `sample_commands` via a shared `privacySafeSample(entries)`:

```js
{ match_origin, candidate_kind, prefix_hash: sha256(command_prefix)[:8] }
```

Raw `command_prefix` strings no longer flow through `gate_check_recurrence`'s `recurrent[].sample_commands`. The persisted finding's `recurrence_key` stays hashed and its description stays prefix-free, so the existing secret-shaped-prefix test (which asserts no raw token in the finding JSON) is unaffected and now the recurrence RESULT surface is privacy-safe too.

## (d) RED count before vs after

- Before (Phase 3 end): 11 RED — 7 in `command-classification-contract.test.js`, 4 in `gate-recurrence.test.js`.
- After (Phase 4): **11 → 0**. The 2-file focused run: 77 passed / 0 failed (exit 0).
- Full `legacy-mcp/` + `core/`: 2300 passed / 4 skipped / 0 failed.
- Full project `npx vitest run`: **3322 passed / 4 skipped / 0 failed**.

Positive pins and preserved regressions verified green: `three explicit unexpected-match events → one recurrence candidate` / `checkAndEmit: three explicit unexpected-match events → one finding`, `toolchain-failure events remain on their own branch`, all threshold/cross-session/dedup (archived re-admits, resolved/accepted suppress)/dry-run/secret-shaped-prefix/evidence_code_ref/entries_scanned/exact-key/distinct-shapes/heredoc+key-normalization tests.

## (e) Tool-description wording

No change. `tools/handlers/gate-check-recurrence-tool.js` description was NOT stale — it described the grouping mechanics without claiming "every repeated rule event files a finding." A temporary lengthening (adding eligibility + privacy wording) pushed the MCP wire over the 55 KB context budget (`mcp-wire-budget.test.js`) and shifted the `cli-context-savings-script.test.js` snapshot, so it was reverted. The file is byte-identical to the original. Per the task, thresholds, finding schema, and handler logic were not touched.

## Test-fixture compatibility (test-file edits)

`gate-recurrence.test.js`:
- `makeEntry` now defaults to `UNEXPECTED_PROV` (the explicit evaluator trio) so the 40+ pre-existing recurrence tests (which call `makeEntry` with no provenance) exercise real candidates under the filter.
- The legacy RED test was rewritten to inline plain rows (no provenance) — the legacy shape is the absence of all three fields.
- The one inline `distinct session_ids` fixture that writes bare rows to a single surface now spreads `UNEXPECTED_PROV` so it tests session-dedup semantics on genuine candidates.

`command-classification-contract.test.js`:
- The ordinary-fire group-count assertion was updated `1 → 0` (ordinary fires no longer form a recurrence group; they are telemetry) — this matches the plan's "ONLY ... unexpected-match events enter the existing grouping" requirement.
- Cross-surface disagreement test hardened with per-identity timestamps.

## Files modified

| File | Action | Change |
|---|---|---|
| `tools/learning-loop-mastra/core/recurrence-tracker.js` | Modified | `isUnexpectedMatchCandidate` + `isRecurrenceGroupableEntry` eligibility, `readDecisionLogEntries` cross-surface conflict downgrade, per-session + cross-session filtering, `privacySafeSample` for both group emitters |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` | Modified | `makeEntry` default provenance, legacy RED test inlined, session-dedup fixture provenance, stale RED comment reconciled |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/command-classification-contract.test.js` | Modified | ordinary-fire group count 1→0, cross-surface test per-identity timestamps |
| `tools/learning-loop-mastra/tools/handlers/gate-check-recurrence-tool.js` | Unchanged | description not stale; revert kept context-budget tests green |
| `tools/learning-loop-mastra/core/surfaces.js` | Unchanged | raw-read kept local via `readJsonlFromAllSurfaces` |

## Constraints honored

- Provenance NOT added to the recurrence key (key stays `rule_id::normalized_prefix::session_id`).
- No rule-level suppression field read or required.
- Toolchain branch untouched by promoted-rule eligibility.
- No persisted finding-schema change; `buildFinding` unchanged.
- `entries_scanned` preserved (full-log scan).
- No commit; plan files untouched; no registry data edited.

## Verification performed

- `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (documented seed) before full runs.
- Focused: `npx vitest run gate-recurrence.test.js command-classification-contract.test.js` → 77 passed.
- Full legacy-mcp + core → 2300 passed / 4 skipped.
- Full project `npx vitest run` → 3322 passed / 4 skipped / 0 failed.
- No vitest stdout piped to tail/grep/head; all output captured to `/tmp` files and read directly.

## Notes / open items

- No dedicated `gate-check-recurrence-tool.test.js` exists; the handler is exercised by `gate_check_recurrence tool returns result JSON` in `gate-recurrence.test.js` (still green).
- The two context-budget failures seen mid-implementation (`mcp-wire-budget`, `cli-context-savings`) were caused by the temporary tool-description lengthening and resolved by reverting it; they are not phase regressions.
