---
phase: 4
title: "migrate origin + supersedes to citations; retire promoted_to_rule"
status: completed
priority: P1
effort: ""
dependencies: [2]
---

# Phase 4: migrate `origin` + `supersedes` to citations; retire `promoted_to_rule`

## Overview

Migrate the last two bespoke relationship fields off records onto the citation
log. `meta_state_promote_rule` emits a citation (`{source: rule, target: finding,
rationale:"origin"}`) instead of stamping `rule.origin`;
`meta_state_log_change` emits a citation instead of stamping `supersedes`. Re-derive
all read sites from the citation log. Retire `promoted_to_rule` — the legacy
ghost-ref in `rule.js`, the field on the finding schema, and the
relationships-tool fallback all go (the canonical edge is now the citation). Two
independently-testable sub-flips, each landing green before the next.

## Requirements

- Functional: `meta_state_promote_rule` no longer writes `origin` on the new rule;
  it emits a citation `{source: rule_id, target: finding id, rationale:"origin"}`.
  `meta_state_log_change` no longer stamps `supersedes` on the change-log; it
  emits a citation `{source: new change-log, target: prior change-log/rule,
  rationale:"supersedes"}` — this covers change-log→change-log and change-log→rule
  supersession. **Rule→rule supersession** (previously `meta_state_patch`-only,
  no lifecycle writer) is preserved by adding citation emission to
  `meta_state_patch` when a rule's supersession is expressed (a `supersedes` arg
  on the rule patch emits `{source: rule, target: prior rule, rationale:"supersedes"}`
  instead of setting the field). `origin`/`supersedes`/`promoted_to_rule` become
  **inert historical fields** — kept `.optional()` (old version lines parse),
  de-routed from `CROSS_REFS`. The `rule.js` synthetic `promoted_to_rule` ghost-ref
  and the relationships-tool fallback are removed. Existing on-disk values are
  backfilled as citations (migration).
- Non-functional: `buildInverseIndexes`/`inverseRefs`/`list-tool ref_by`/
  `relationships-tool` inbound maps/`loop-introspect` compact + cold-active-filter
  source `origin`/`supersedes`/`promoted_to_rule` edges from the generic
  `citations_inverse`. `rule.supersedes()` predicate re-derives from
  `citations_inverse`. The named maps `origin_inverse`/`supersedes_inverse`/
  `promoted_to_rule_inverse` collapse into `citations_inverse` (the 6-map shape
  becomes `reopens_inverse`/`addresses_inverse`/`proposed_design_for_inverse` +
  `citations_inverse`).

## Architecture

Same pattern as Phase 3: the lifecycle tool emits a citation instead of stamping
a field; the read sites re-derive from `citations_inverse`. `promoted_to_rule` was
already a read-only ghost-ref derived from `rule.origin` (scout-verified: no live
writers, `legacy:true` in CROSS_REFS) — once `origin` is a citation, the ghost-ref
is redundant and is removed. The `supersedes` field on rules had NO lifecycle
writer (only `meta_state_patch` could set it); rule→rule supersession is preserved
by routing that patch case to citation emission. `origin`/`supersedes`/
`promoted_to_rule` stay `.optional()` (inert-historical) so old version lines
parse — the `reopens` pattern, not schema deletion.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js` (drop `origin: id` L350; emit citation instead; post-state read-back check)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js` (drop `supersedes` stamp L85; emit citation instead — covers change-log→change-log and change-log→rule)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` (rule `supersedes` patch case → emit a citation instead of setting the field; preserves rule→rule supersession)
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (keep `origin`/`supersedes`/`promoted_to_rule` `.optional()` inert-historical; de-route from per-kind patch schemas `buildPatchSchemaFor` L776-779 so they cannot be written)
- Modify: `tools/learning-loop-mastra/core/entry/relationship-graph.js` (remove `origin`/`supersedes`/`promoted_to_rule` from `CROSS_REFS` L58-75; `indexRef` L222-239 drops their on-record routes; `forwardRefs` L132-144 + `inverseRefs` L162-173 drop the `promoted_to_rule` skip)
- Modify: `tools/learning-loop-mastra/core/entry/rule.js` (remove `inboundRefs` synthetic `promoted_to_rule` ghost-ref L66-72; `supersedes()` predicate L48-49 → `citations_inverse`-sourced)
- Modify: `tools/learning-loop-mastra/core/entry/change-log.js` (inbound ref comment L21-22 → `citations_inverse`-sourced)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (compact projection L560,611,653,684,698,700,752-753 drops `origin`/`supersedes`/`promoted_to_rule`; cold-active-filter L684 → `citations_inverse`-sourced)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (remove `promoted_to_rule` fallback L190-211; inbound `origin→origin_of`/`supersedes→superseded_by`/`promoted_to_rule→promoted_from` L43-45 → generic `cited_by` from `citations_inverse`; update `INBOUND_KEY_MAP`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` (`ref_field:"origin"`/`"supersedes"`/`"promoted_to_rule"` L115-118 → `ref_field:"citation"` via `citations_inverse`; `INVERSE_BACKED_REF_FIELDS`)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` (`promoted_to_rule_inverse`/`origin_inverse`/`supersedes_inverse` L233,238 → `citations_inverse`)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-promote-rule-rule-entry.test.js` (L54 `ruleEntry.origin` → assert citation emitted; finding-status-`open` assertions L65,254 stay)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationships-snapshot.test.js` (rule + change-log + legacy-finding wire shapes: `origin_of`/`superseded_by`/`promoted_from` → `cited_by`)
- Rewrite: `tools/learning-loop-mastra/__tests__/legacy-mcp/build-inverse-indexes.test.js` (`origin_inverse`/`supersedes_inverse`/`promoted_to_rule_inverse` removed; `citations_inverse` carries them)
- Create: `tools/learning-loop-mastra/tools/handlers/scripts/migrate-origin-supersedes-to-citations.mjs` (one-time backfill)

## Implementation Steps (TDD — tests first)

**Sub-flip A — `origin` + `promoted_to_rule` retirement:**

1. Rewrite `meta-state-promote-rule-rule-entry.test.js` (red): assert
   `meta_state_promote_rule` emits a citation `{source: rule_id, target: finding
   id, rationale:"origin"}` (read back from `citations.jsonl`); assert the rule
   entry has NO `origin` field; assert the finding stays `open`. Assert the
   `promoted_to_rule` inbound edge is sourced from the citation (not a ghost-ref).
2. Run — confirm red.
3. Rewrite `meta_state_promote_rule`: drop `origin: id`; emit the citation
   (target-existence RI on the finding, warn-only); post-state read-back check.
4. De-route `origin`/`promoted_to_rule` (keep `.optional()` inert-historical; remove
   from CROSS_REFS + per-kind patch schemas so they cannot be written); remove the
   `rule.js` ghost-ref; remove the relationships-tool `promoted_to_rule` fallback.
5. Re-source `inverseRefs`/`buildInverseIndexes`/`list-tool`/`relationships-tool`/
   `loop-introspect` for the origin edge from `citations_inverse` (collapse
   `origin_inverse`/`promoted_to_rule_inverse` → `citations_inverse`).
6. Re-run — confirm green.

**Sub-flip B — `supersedes`:**

7. Write/extend a test (red): `meta_state_log_change` with `supersedes` emits a
   citation `{source: new change-log, target: prior, rationale:"supersedes"}`;
   the change-log entry has NO `supersedes` field; `rule.supersedes()` and the
   `supersedes_inverse` map derive from `citations_inverse`. Also: `meta_state_patch`
   on a rule with a `supersedes` intent emits a rule→rule citation.
8. Run — confirm red.
9. Rewrite `meta_state_log_change`: drop the `supersedes` stamp; emit the
   citation (covers change-log→change-log and change-log→rule); post-state read-back
   check. Add rule→rule supersession to `meta_state_patch` (a `supersedes` arg on a
   rule patch emits `{source: rule, target: prior rule, rationale:"supersedes"}`
   instead of setting the field) — preserves the rule-lineage capability the
   patch-only field previously held.
10. De-route `supersedes` (keep `.optional()` inert-historical on rule + change-log
    schemas; remove from CROSS_REFS + patch schemas); `rule.supersedes()` →
    `citations_inverse`-sourced; collapse `supersedes_inverse` → `citations_inverse`;
    re-source `list-tool`/`relationships-tool`/`loop-introspect` `supersedes` reads.
11. Re-run — confirm green.

**Migration + closure:**

12. `migrate-origin-supersedes-to-citations.mjs`: scan for rules with `origin`,
    change-logs/rules with `supersedes`, and findings with `promoted_to_rule`;
    backfill a citation for each on-disk edge (do not modify the records — the
    fields stay on disk as inert-historical data; `citations_inverse` sources the
    going-forward edge). Dry-run; review; apply.
13. Run `relationship-graph.test.js`, `relationship-characterization.test.js`,
    `build-inverse-indexes.test.js`, `meta-state-relationships-snapshot.test.js`,
    `meta-state-relationships-dangling-refs.test.js` — update for the
    `citations_inverse`-sourced edges + collapsed wire shape; confirm green.

## Success Criteria

- [ ] `meta_state_promote_rule` emits an `origin` citation; no `origin` written on
      the rule; `promoted_to_rule` ghost-ref + fallback removed (field inert-historical).
- [ ] `meta_state_log_change` emits a `supersedes` citation (change-log→change-log/rule);
      `meta_state_patch` emits a rule→rule `supersedes` citation; no `supersedes`
      written on records; `rule.supersedes()` `citations_inverse`-sourced.
- [ ] `origin`/`supersedes`/`promoted_to_rule` de-routed from CROSS_REFS (kept
      `.optional()` inert-historical); `origin_inverse`/`supersedes_inverse`/
      `promoted_to_rule_inverse` collapsed into `citations_inverse`.
- [ ] All read sites (list-tool, relationships-tool, loop-introspect,
      loop-describe) source these edges from `citations_inverse` (`cited_by`).
- [ ] Existing on-disk edges backfilled as citations; relationship/index/snapshot/
      build-inverse-indexes tests green.

## Risk Assessment

- **`promoted_to_rule_inverse` / `origin_inverse` / `supersedes_inverse` 6-map
  shape** is locked by `build-inverse-indexes.test.js`. Collapsing them into
  `citations_inverse` changes the map shape; update that test to the 3-named +
  `citations_inverse` shape (the `origin`/`supersedes` citations cover the same edges).
- **`meta-state-relationships-snapshot.test.js`** locks the dual-field
  `promoted_to_rule` migration fallback (L63, L111) and the named wire keys. Rewrite
  to the `cited_by` generic shape.
- **`rule.supersedes()` predicate** is a `rule.js` predicate (L48-49); verify no
  gate consumer before changing. If a gate consumer exists, the
  `citations_inverse` derivation must be available at gate-read time (it is — gates
  read the registry union, which includes citations after Phase 2).
- **`origin` canonicality.** The citation's `source`/`target` direction must
  preserve canonicality: `source: rule, target: finding` so the inverse "who
  originated from this finding" works. Verify direction in the test.
- **Rule→rule supersession (red-team HIGH).** `meta_state_log_change` produces
  change-log→change-log/rule citations, NOT rule→rule. Rule→rule supersession was
  `meta_state_patch`-only (no lifecycle writer). Preserved by routing that patch
  case to citation emission (step 9). Verify the `meta_state_patch` citation path
  does not open a free-form citation forge vector (the patch tool emits only for
  the declared `supersedes` arg, not arbitrary citations).
- **Do NOT delete migrated fields from schemas.** Keep `origin`/`supersedes`/
  `promoted_to_rule` `.optional()` (inert-historical) so old version lines parse.