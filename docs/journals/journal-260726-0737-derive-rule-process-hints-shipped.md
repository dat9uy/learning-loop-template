# Plan 260726-0029: derive rule process hints, retire hint mirror — shipped

## Outcome

Resolves `meta-260722T0001Z` (the 4-location cascade that caused PR #73's CI
failure). Promoting an agent-checklist rule is now a single `meta_state_promote_rule`
CLI call carrying `hint_text` + `hint_suggestion`; the view in `hint-registry.js`
generates the process-hint row at read time. The 9 hand-mirrored `HINT_REGISTRY`
rows are deleted; the registry holds 16 discoverability + 2 standalone process
rows (the rest is derived).

## What shipped

- **Rule schema** (`core/meta-state.js`): 3 new optional fields —
  `hint_order` (int), `hint_suggestion` (single-line, 20-200 chars), `hint_slug`
  (kebab-case override). All optional on the schema; required by the tool
  layer for agent-checklist rules.
- **Promote tool** (`tools/handlers/meta-state-promote-rule-tool.js`):
  - New `hint_suggestion` requirement for agent-checklist promotion
    (mirror of `hint_text` requirement).
  - Slug-collision guard: rejects promote whose derived slug collides with
    a standalone registry slug or another active agent-checklist rule.
  - Persists all 3 new fields on the rule entry.
- **Patch tool** (`tools/handlers/meta-state-patch-tool.js`):
  - `hint_suggestion` requirement on patch-create for agent-checklist rules.
  - Eliminates the `truncateSingleLine` fallback path (per validation Q2).
- **Hint registry** (`core/hint-registry.js`):
  - New pure `buildProcessView({ rulesById })` generator.
  - 9 hand-mirrored rows deleted; 2 standalones gain `order` field (10, 90).
  - Sort: order ascending, undefined → +Infinity, tie-break by slug.
  - Collision: skip + warn (defense-in-depth; promote guard is the load-bearing
    check).
- **Consumers** migrated to `buildProcessView`:
  - `core/loop-introspect.js` (buildProcessHints, buildProcessPointers).
  - `core/hint-renderer.js` (claude-session-start, sidecar, mcp-warm,
    factory-session-start).
  - `tools/handlers/loop-get-instruction-tool.js` (rebuilds view per call;
    string keys look up in the view; numeric keys documented session-ephemeral
    in the tool description).
- **CLI sketch** (`hooks/universal/session-start-inject-discoverability.cjs`):
  promote sketch updated to advertise the 4 new optional fields.
- **Backfill**: 9 active agent-checklist rules updated atomically with
  `hint_order` (10-110, sparse), `hint_suggestion` (verbatim from the mirror
  rows), and `hint_slug` for the 2 divergent rules
  (`runtime-agnostic-audit` and `fallow-gate-triage`).
- **Coverage test** inverts: every active agent-checklist rule appears in
  `buildProcessView` (forward), every view row's `derived_from_rule` resolves
  to an active rule with both `hint_text` AND `hint_suggestion` populated
  (inverse), all view slugs are unique, and `hint_text` + `hint_suggestion`
  presence is asserted (closes the silent-drop gap).
- **Test count literals** derived: `hint-registry.test.cjs`,
  `hint-renderer.test.cjs`, `rule-derived-process-hints.test.cjs` no longer
  hardcode 11, 27, or 16 — they call `buildProcessView` / `listHints` and
  compare against the derived value. Slug lists, merged-order assertions,
  and partition-budget assertions stay hardcoded (the legitimate drift signal).

## Byte-identity

Snapshot before mirror deletion matches snapshot after (process_hints,
process_pointers, factory partition, sidecar partition all byte-identical
or semantically equal). The 2-byte drop in the sidecar JSON is whitespace
only (semantic comparison via `JSON.parse` returns true).

## E2E repro

Smoke rule (`rule-e2e-hint-derivation-smoke`) promoted with a single CLI
call carrying `hint_text` + `hint_suggestion`; `loop_get_instruction` returned
the new hint at the correct view position; smoke rule archived via
`meta_state_batch` (delete op) to avoid polluting the live registry. Full
suite green after archive.

## Finding resolution

`meta-260722T0001Z` resolved after `meta_state_refresh_file_index` on
`tools/learning-loop-mastra/core/hint-registry.js` (the rewritten evidence
path) plus 3 related evidence paths re-grounded (`core/meta-state.js`,
`tools/handlers/meta-state-patch-tool.js`, `core/loop-introspect.js`).
`meta_state_relationships` flagged the related findings as fingerprint-
mismatched; refresh + retry unblocked the resolve gate.

## Trade-offs

- **Numeric keys are session-ephemeral.** The C2 regression test was
  rewritten to probe the semantic guarantee (no wrong content on shift)
  without pinning a specific position. The slug stability contract
  is the load-bearing invariant.
- **Patch-create parity** required `hint_suggestion` on patch for
  agent-checklist rules. Validation Q2 confirmed the path; the
  `truncateSingleLine` fallback was removed.
- **Slug-list assertion** stays hardcoded (per validation Q3) as the
  legitimate drift signal — promoting a rule requires one append hand-edit.

## Effort

Phase 1 (schema + backfill): 2h. Phase 2 (view + migration + delete): 4h.
Phase 3 (test derivation + E2E + resolution): 3h. Total: 9h vs 1d estimate.

## Tests

78 tests added/updated across 6 test files. All pass. No regressions in the
broader hint-introspect-renderer surface.
