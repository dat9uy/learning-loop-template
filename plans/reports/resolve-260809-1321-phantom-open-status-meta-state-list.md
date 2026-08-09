# Resolve: meta-260809T1931Z — meta_state_list leaks phantom open status for resolved ids

**Finding:** `meta-260809T1931Z-meta-state-list-leaks-a-phantom-open-status-for-resolved-ids`
**Category:** record-repair-gap · **Severity:** warning · **Affected system:** meta-state-tools
**Status:** fix implemented + verified; finding pending `meta_state_resolve`

## Outcome

Under `include_all_versions:true` without `include_archived`, `meta_state_list` excluded
terminal statuses **per history line**. An id with history `v0:open → v1:resolved` lost its
`v1:resolved` line (terminal) but kept its `v0:open` line, so a resolved finding surfaced as
if still open. An agent auditing history could double-resolve or mis-derive drift. 93
multi-version ids in the live registry phantom-opened under the all-versions view.

## Root cause

"Is this id open?" is a property of the id's **projected (max-by-version)** status, not of
any individual line. The collapsed (default) view got this right — it only sees the
projected line. The all-versions view applied the terminal-status exclusion per line
(`meta-state-list-tool.js` lines 174–181), so the v0 open line survived a v1 resolved line.

The still-open precedent `meta-260801T2348Z-…` mis-attributed this to a stale cache; cache
invalidation is verified correct (every write calls `invalidateCache`; the read path re-stats
all three files). The root cause is per-line filter ordering, not staleness — that
precedent's hypothesis is superseded.

## Fix (single file)

`tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` — when
`include_all_versions` is active and the caller has NOT opted into terminal entries
(`!includeTerminal`), project the max-by-version status per id from the loaded all-versions
entries (same tie-break as the projection: later `created_at` wins on equal `version`), and
drop **all** lines for any id whose projected status is terminal (`resolved`/`superseded`/
`accepted`) or `archived`. This is id-level collapse of the exclusion, matching the collapsed
view. The per-line filter stays as the cheap fallback for the projected (default) path,
where every id is one line so per-line ≡ id-level.

Affordances compose as documented:
- `include_all_versions:true` alone → resolved id excluded entirely (count=0), no phantom.
- `include_all_versions:true + include_archived:true` → full audit trail unchanged.
- explicit `status:"resolved"` → unchanged (opted into terminal).

## Tests

`tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-list-include-all-versions.test.js`:
the test that pinned the buggy behavior ("Only the v0 (open) line survives") is replaced with
two tests asserting the corrected id-level contract:
1. `hist-term-y` (v0 open → … → v3 archived) yields count=0 under default all-versions view.
2. A two-version resolved id (v0 open → v1 resolved, no tombstone) yields count=0 under
   default all-versions, count=2 under `include_archived:true` (full trail).

## Verification

- Live registry, before fix: default count=0 · all_versions count=1 (v0:open phantom) ·
  all+archived count=2.
- Live registry, after fix: default count=0 · all_versions **count=0** (phantom gone) ·
  all+archived count=2 (audit trail intact).
- Open multi-version ids still surface all history lines (8 multi-version ids, 30 open lines);
  no terminal status leaks into the default all-versions view — no over-exclusion.
- `meta-state-list-include-all-versions.test.js` (11) + `meta-state-list-compact.test.js` (9)
  + accepted-status / superseded / g8-supersede / restore-entry: all pass (39/39).
- File-index re-grounded for the edited handler (`meta_state_refresh_file_index`,
  3 findings regrounded).

## Note: cold-tier-regression

`cold-tier-regression.test.js` Phase 7b fails on the live registry with one drift-stale
finding: `meta-260807T1704Z-…` (anchors to `gate-logic.js`, a file NOT touched by this fix).
Verified pre-existing: the test fails identically on a clean baseline (change stashed).
My fix reduced the drift-stale count 2 → 1 by grounding the finding I resolved. The
remaining `meta-260807T1704Z-…` staleness is a separate, already-open finding, out of scope here.

## Unresolved questions

- The precedent finding `meta-260801T2348Z-…` attributes the same symptom to a stale cache.
  Its hypothesis is now superseded by this root cause. It should be resolved (or superseded
  by this finding) so the registry does not carry a contradictory open hypothesis. Not done
  in this change — flagging for follow-up.
