# Debug Report: `meta-260801T2348Z-meta-state-resolve-response-omits-cascade-effects-in-session`

Date: 2026-08-11 · Investigator: Claude (debug session) · Command: `/ak-debug`

## Executive Summary

The finding `meta-260801T2348Z-meta-state-resolve-response-omits-cascade-effects-in-session`
prescribes adding a `cascade_resolved: [ids]` field to the `meta_state_resolve` response
so an agent can see which sibling findings a resolve cascade touched.

**Root cause of the finding's premise being moot: the cascade mechanism no longer exists.**
The `reopens` + `cascade_from` writers were removed in commit `58d8fd5c`
(lifecycle migration, 2026-08-02, #109), which landed **one day after** the finding was
filed (2026-08-01). The current `meta_state_resolve` handler performs exactly one
mutation — the entry you named. It has no sibling side-effects to report. The prescribed
`cascade_resolved` field would always be empty and would ship a dead contract.

Recommended disposition: **resolve the finding** (not implement its fix). The finding is
superseded by the lifecycle migration that already eliminated the cascade pattern the
finding's episode depended on. Its `mechanism_check` currently grounds cleanly
(`hash_match: true`), so the resolution passes the `rule-no-orphaned-evidence` gate.
This is a report + recommendation; no registry writes were performed.

## Technical Analysis

### Timeline (the decisive fact)

| Date | Event |
|------|-------|
| 2026-07-17 | `meta-260717T1004Z` filed: documents intent to drop `reopens` + `cascade_from` + cascade (closure policy glued to a relationship edge) |
| 2026-08-01 16:48 | This finding filed — episode observed `meta_state_resolve` silently cascade-resolving a sibling, response said only `{resolved: true}` |
| 2026-08-02 15:57 | `58d8fd5c` (#109) landed — **cascade branch removed** from the resolve handler |

The finding was filed 22 hours before the mechanism it complains about was deleted.

### Evidence the cascade is gone

1. **Handler code** — `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js`:
   - Lines 117–122: "The cascade branch was removed. The cascade was the one mutation
     that un-closed a record as a side-effect of opening another. New cascades cannot be
     initiated; closing a stale parent is now an explicit `meta_state_resolve` on the parent."
   - The handler's only write is `applyUpdateAndCheck(root, id, patch, ...)` on the named
     entry (line 135). No sibling reads/writes.
   - Schema (lines 18–22): `id` + optional `resolution` + optional `resolved_by`. No
     `cascade_from`, no cascade-related output.
   - Description (line 17): "The `cascade_from` writer was removed — new cascades cannot
     be initiated."
2. **Report tool** — `meta-state-report-tool.js` lines 12–16, 34: "`reopens` was removed
   from the report-tool surface… no new `reopens` edges can be initiated."
3. **Discoverability hints** — `core/hint-registry.js` lines 96, 110, 112, 150, 152 all
   state the writer was dropped; `loop_get_instruction({key:"reopens"})` confirms.
4. **Git history** — `git log -S "cascade_from"` → `58d8fd5c` (2026-08-02) is the removal;
   the `-S` pickaxe shows `cascade_from` present before, absent after.
5. **Relationship graph** — `meta_state_relationships` on the finding: outbound/inbound all
   null. No referenced or referencing entries.
6. **17 historical `reopens` edges** retained read-only via `meta_state_relationship_validate`
   (`core/entry/relationship-graph.js`), but the writer path is gone.

### Why the prescribed fix would be wrong to ship

Adding `cascade_resolved` to the response would:
- Always return `[]` (or be omitted) — the cascade can no longer fire.
- Ship a field that implies a side-effect surface that was deliberately removed.
- Mislead future agents into believing `meta_state_resolve` can still touch siblings.

The real gap the episode surfaced — "agent spent ~15 tool calls reconstructing what the
cascade did" — is already closed: the cascade doesn't happen, so there is nothing to
reconstruct. The `reopens` writer + cascade were the *source* of the silent side-effect;
deleting the source is the fix that subsumes the response-shape patch.

### Grounding / gate status

- `meta_state_check_grounding` → `status: grounded`, `hash_match: true`
  (code ref `tools/learning-loop-mastra/core/meta-state.js` hash
  `sha256:4597b4fd…74a5` matches stored fingerprint).
- `meta_state_derive_status` → `derived_status: active-uncertain`, `drift: false`,
  recommendation `investigate`.
- Resolution gate: `rule-no-orphaned-evidence` applies to all resolutions
  (`applies_to_resolution: "*"`). Since this finding grounds cleanly and no *other* open
  mechanism-checked finding is orphaned (check passed in the resolve handler's branch-1),
  a resolve is not blocked.
- Tests: `meta-state-accepted-status.test.js` (14 tests) passes — `TERMINAL_STATUSES`,
  `already_terminal` branch, resolve-tool source checks all green.

## Recommendation

**Resolve the finding** with a resolution citing the lifecycle migration, rather than
implementing `cascade_resolved`. Suggested shape:

```
meta_state_resolve({
  id: "meta-260801T2348Z-meta-state-resolve-response-omits-cascade-effects-in-session",
  resolution: "Superseded by 58d8fd5c (#109) lifecycle migration: the reopens+cascade_from writers were removed (2026-08-02, one day after this finding). meta_state_resolve now performs exactly one mutation on the named entry; the cascade side-effect the response omitted no longer exists, so adding cascade_resolved would ship an always-empty dead field. Verif: handler schema/code (meta-state-resolve-tool.js:117-135), report-tool (meta-state-report-tool.js:12-16), hint-registry, git log -S cascade_from.",
  resolved_by: "operator"
})
```

Note: the sibling intent-to-remove finding `meta-260717T1004Z-the-inter-finding-relationship-data-model-conflates-three-di`
is **still open** and also documents the cascade-removal intent (goals (a) boundary docs,
(b) migrate without losing lineage). It may warrant its own closure or a partial-credit
resolve in the same migration, but it is out of scope for this debug report.

## Unresolved Questions

1. Should `meta-260717T1004Z` (the intent/design finding that spawned the migration) also
   be resolved/cited, or kept open as the migration's design record? Operator decision.
2. The finding's `evidence_code_ref` points at `core/meta-state.js` broadly; if a future
   review wants the resolve-handler surfaced in relationship queries, re-pointing the ref
   at `tools/handlers/meta-state-resolve-tool.js` may be worth a follow-up patch. Not
   required for closure.

Status: DONE_WITH_CONCERNS
Summary: Finding is superseded by lifecycle migration 58d8fd5c (cascade removed 2026-08-02, one day after filing); resolve, don't implement cascade_resolved.
Concerns: No registry writes performed (this is a recommendation); sibling design finding meta-260717T1004Z still open.
