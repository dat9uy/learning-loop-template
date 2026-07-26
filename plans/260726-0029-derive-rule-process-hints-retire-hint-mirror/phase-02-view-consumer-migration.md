---
phase: 2
title: "buildProcessView + consumer migration + mirror deletion"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
completed: 2026-07-26
---

# Phase 2: buildProcessView + consumer migration + mirror deletion

<!-- Updated: Validation Session 1 - coverage test asserts hint_text+hint_suggestion presence; numeric-key grep audit added -->

## Overview

Introduce the pure `buildProcessView({ rulesById })` generator in
core/hint-registry.js, migrate all process-hint consumers (8 production
sites), prove byte-identical SessionStart output on both the claude and
factory hook paths, then delete the 9 hand-mirrored `HINT_REGISTRY` rows.
TDD: view tests + byte-identity tests + numeric-key audit first.

## Requirements

- Functional: `buildProcessView` returns the deterministic ordered union of
  standalone registry process entries and generated entries for active
  agent-checklist rules; all consumers use it; mirror rows deleted.
- Non-functional: hint-registry.js stays pure (rules passed in, no I/O);
  skip semantics (missing `hint_text` → dropped by resolveHintText)
  unchanged; no caching of the view in the long-lived MCP server.

## Architecture

**Generator (core/hint-registry.js):**
```js
export function buildProcessView({ rulesById } = {}) {
  const standalone = HINT_REGISTRY.filter(e => e.kind === "process")
    .map(e => ({ ...e }));                       // carries new `order` field
  const derived = [];
  const seenSlugs = new Set(standalone.map(e => e.slug));
  for (const rule of rulesById?.values() ?? []) {
    if (rule.pattern_type !== "agent-checklist") continue;
    const slug = rule.hint_slug ?? rule.id.replace(/^rule-/, "");
    if (seenSlugs.has(slug)) continue;           // collision: skip + warn
    seenSlugs.add(slug);
    derived.push({
      slug,
      kind: "process",
      text: "",                                   // resolveHintText path unchanged
      suggestion: rule.hint_suggestion,           // required by Phase 1 tools
      derived_from_rule: rule.id,
      order: rule.hint_order,
    });
  }
  return [...standalone, ...derived].sort(byOrderThenSlug);
}
```
- Standalone rows gain `order: 10` / `order: 90` (per Phase 1 table).
- Sort: `order` ascending (undefined → +Infinity), tie-break by slug.
  NOT `created_at` — verified absent on all 9 live rules. Rules without
  `hint_order` append at the end in slug order; this also defines the
  degraded worktree case (stale meta-state.jsonl without the Phase 1
  backfill): deterministic append-by-slug, self-heals on worktree refresh.
- No fallback path: `hint_suggestion` is required by both the promote AND
  patch tools when `pattern_type === "agent-checklist"` (Phase 1). The
  prior `truncateSingleLine(hint_text)` + provenance warning fallback is
  removed; a missing field is now a tool-time rejection, not a runtime
  degradation.
- Collision policy: view-level skip + warning (never last-wins overwrite);
  the promote-time rejection lives in Phase 1. The coverage test asserts
  global slug uniqueness so a collision also fails CI.

**Consumer migration (8 production sites):**
- core/loop-introspect.js `buildProcessHints` (:169) / `buildProcessPointers`
  (:197): iterate `buildProcessView({ rulesById: ruleMap })`.
- core/hint-renderer.js (:119, :155): process partition iterates the view;
  renderer already receives `rulesById`.
- tools/handlers/loop-get-instruction-tool.js: **rebuild the merged view on
  every call** (cheap; the MCP server is long-lived and a first-call cache
  would never invalidate). String keys: replace the direct
  `findHintBySlug(key)` static-registry lookup (:50) with view lookup for
  process slugs (discoverability slugs still resolve against the static
  registry). Numeric keys = position in the current merged view —
  **session-ephemeral** (promotions, deactivations, and re-orders renumber);
  document this in the tool description. The preserved C2 invariant:
  numeric indices resolve against the full view, never the shrunk
  `buildProcessHints()` output. Rewrite the C2 regression test to the
  ephemeral-index semantic (wrong-content-on-shift is now guarded by the
  full-view anchor + slug stability, not by fixed positions).
- Indirect sites (no call-site changes — they call the builders; verify
  output): tools/handlers/loop-describe-tool.js:33,
  `.factory/hooks/loop-surface-inject.cjs:143`,
  `tools/scripts/delivery-classify.mjs:113`,
  `tools/scripts/hint-render.mjs:75-83`,
  `hooks/universal/session-start-inject-process-hints.cjs:34`,
  `hooks/universal/session-start-inject-discoverability.cjs:160`.

**Byte-identity gate:** before deleting mirror rows:
1. Snapshot current `buildProcessHints()` + `buildProcessPointers()` output
   at repo root (9 backfilled rules) and assert identical output via the
   new view.
2. Extend to the factory-hook path: `factory-hook-single-source.test.cjs`
   (:108-112) compares factory output against `buildProcessHints()` — keep
   it green and add a snapshot of the rendered factory injection block.
3. Degraded-order test: a rules map WITHOUT `hint_order` (worktree case)
   produces the defined append-by-slug order, no crash, no duplication.
Then delete the 9 mirror rows (hint-registry.js:186-282 range, keep the two
standalone rows) and the stale "Rows 2-8 + 10 are rule-derived" comment
block, in the same commit as the consumer migration.

**Coverage test inversion**
(`__tests__/legacy-mcp/consult-checklist-process-hints-coverage.test.js`):
replace "every active agent-checklist rule has a `derived_from_rule` mirror
row" with: every active agent-checklist rule appears in `buildProcessView`;
every view row with `derived_from_rule` references an active rule; all view
slugs are unique; AND every active agent-checklist rule has both
`hint_text` AND `hint_suggestion` populated (closes the silent-drop gap
where a rule with neither field would still 'appear' but resolveHintText
drops it).

**Numeric-key grep audit:** before changing the numeric-key contract in
`loop_get_instruction`, run explicit greps across `tools/scripts/`,
`tools/handlers/`, `.factory/hooks/`, and `hooks/universal/`:
```
grep -rnE 'loop_get_instruction.*[^a-z][0-9]{1,2}[^0-9]|\.processHints\[[0-9]+|\.buildProcessHints\(\)\[[0-9]+' tools/ .factory/ hooks/
```
Enumerate every hit with file:line and confirm it either (a) goes through
a builder (numeric position is incidental) or (b) is a docs/comment
reference. If any hit resolves a numeric index against fixed position,
either migrate the caller to slug lookup or document the dependency as
breaking. This step surfaces latent dependencies before the ephemeral-
index contract ships.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/hint-registry.js`
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js`
- Modify: `tools/learning-loop-mastra/core/hint-renderer.js`
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js`
- Modify: `__tests__/hint-registry.test.cjs`, `__tests__/hint-renderer.test.cjs`,
  `__tests__/rule-derived-process-hints.test.cjs` (keep green through
  migration; count literals become view-derived in Phase 3 — update here
  only as needed to reflect row deletion)
- Modify: `__tests__/legacy-mcp/consult-checklist-process-hints-coverage.test.js`
- Modify: `__tests__/legacy-mcp/loop-get-instruction.test.js` (C2 semantic
  rewrite; ephemeral-index documentation)
- Check: `__tests__/factory-hook-single-source.test.cjs`,
  `__tests__/legacy-mcp/session-start-inject-degraded-sources.test.cjs`,
  `__tests__/legacy-mcp/loop-describe-warm-tier.test.js`

## Implementation Steps (TDD)

1. Numeric-key grep audit (see "Numeric-key grep audit" section above).
   Enumerate every direct numeric-index consumer; document or migrate.
2. Write failing tests for `buildProcessView`: merge correctness, exact
   reproduction of the current 11-slug order (including
   `runtime-agnostic-audit` and `fallow-gate-triage` via backfilled
   `hint_slug`), non-agent-checklist rules excluded, no-`hint_order`
   append-by-slug, slug-collision skip + warning.
3. Write the byte-identity tests (claude builders + factory block) against
   pre-change snapshot output.
4. Run → red. Implement `buildProcessView` + standalone `order` fields.
5. Migrate loop-introspect and hint-renderer; migrate
   loop-get-instruction (per-call view, string-key view lookup, ephemeral
   numeric keys + tool-description note, C2 test rewrite).
6. Run view tests + identity tests → green.
7. Delete the 9 mirror rows + stale comment; invert the coverage test
   (presence + back-reference + uniqueness + `hint_text`/`hint_suggestion`
   presence).
8. Full loop test suite green.

## Success Criteria

- [ ] Numeric-key grep audit complete; all direct numeric-index consumers
      documented as builder-mediated or migrated to slug lookup.
- [ ] `buildProcessView` unit tests green (merge/order/exclusion/collision/
      degraded).
- [ ] Byte-identity: claude builder output AND factory injection block
      identical before/after for the current 9 rules — including the 2
      divergent slugs.
- [ ] 9 mirror rows deleted; `HINT_REGISTRY` = 16 discoverability + 2
      standalone process rows.
- [ ] Coverage test asserts rule → view presence + back-reference + slug
      uniqueness + `hint_text`/`hint_suggestion` presence on every active
      agent-checklist rule.
- [ ] `loop_get_instruction` slug lookups return identical content for all
      9 current slugs; numeric-key ephemerality documented; rewritten C2
      test green.
- [ ] Full `pnpm test` green.

## Risk Assessment

- **Ordering drift** → byte-identity gate (both hook paths) before mirror
  deletion; do not delete mirror rows until identity is proven.
- **Per-call view rebuild** cost: 14 rules → trivial; assert no regression
  in the SessionStart hot path via existing perf-sensitive tests if any.
- **Transition-state duplication** (rule mirrored AND generated) — avoided
  by landing migration + deletion in one commit against snapshot output.
- **Worktree staleness** — degraded append-by-slug order is defined and
  tested; noted in plan.md risks.
