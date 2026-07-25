---
title: "Derive rule process hints, retire hint mirror"
description: "Resolve meta-260722T0001Z: generate rule-derived process hints from active agent-checklist rules at read time, delete the hand-mirrored HINT_REGISTRY rows, and derive count assertions in tests. TDD."
status: pending
priority: P1
effort: "1d"
tags: [meta-state, hint-registry, cli-surface, tdd]
created: 2026-07-26
---

# Derive rule process hints, retire hint mirror

## Overview

Promoting an agent-checklist rule is a manual 4-location cascade (finding
`meta-260722T0001Z-promoting-an-agent-checklist-rule-is-a-manual-4-location-cas`,
which caused the PR-#73 CI failure):

1. `meta-state.jsonl` rule entry (repo root, read by `loadPromotedRules`,
   core/gate-logic.js:720) — written by `meta_state_promote_rule` (only
   automated step).
2. `core/hint-registry.js` — a hand-mirrored `HINT_REGISTRY` row
   (`derived_from_rule`, slug, suggestion, array position). The promote tool
   cannot write this.
3. `__tests__/hint-registry.test.cjs` — hardcoded counts (16/11/2/27).
4. `__tests__/hint-renderer.test.cjs` + `__tests__/rule-derived-process-hints.test.cjs` — hardcoded totals/warning counts/sidecar lengths.

Accepted direction (brainstorm 2026-07-26, option A): **derive, don't mirror.**
The mirror's only irreducible content is (a) ordering, (b) a curated
one-line `suggestion`, and (c) two slugs that do NOT derive from rule ids —
the hint text already resolves from `rule.hint_text` at render time
(`resolveHintText`, core/hint-registry.js:320). Move these onto the rule as
`hint_order`, `hint_suggestion`, and `hint_slug` (optional; only 2 of 9
existing rules need it), generate rule-derived process hints from active
agent-checklist rules at read time, and delete the 9 mirrored rows.
With the loop's writes riding the stateless CLI (`bin/loop.mjs`), promotion
becomes a single CLI call.

Verified evidence:
- Mirror rows: core/hint-registry.js:186-282 — 9 rule-derived rows interleaved
  with 2 standalone rows (pnpm-test-discipline at position 1,
  file-edit-drift-and-fingerprints at position 9 of 11).
- **Slug divergence (red-team Critical):** 2 mirror slugs ≠ rule id minus
  `rule-` prefix: `runtime-agnostic-audit` ← `rule-runtime-agnostic-features`
  (hint-registry.js:209) and `fallow-gate-triage` ←
  `rule-fallow-brief-on-gate-failure` (:225). Both are published
  `loop_get_instruction` keys (loop-get-instruction.test.js:128).
- Current `suggestion` text is curated, NOT the first sentence of `hint_text`
  → backfilled, and REQUIRED on future agent-checklist promotions.
- Full consumer surface of process hints (8 production sites):
  `buildProcessHints`/`buildProcessPointers` (core/loop-introspect.js:169,197);
  hint-renderer channels (core/hint-renderer.js:119,155);
  `loop_get_instruction` (tools/handlers/loop-get-instruction-tool.js:29,40,50);
  `loop_describe` (tools/handlers/loop-describe-tool.js:33);
  `.factory/hooks/loop-surface-inject.cjs:143`;
  `tools/scripts/delivery-classify.mjs:113`;
  `tools/scripts/hint-render.mjs:75-83`;
  universal SessionStart hooks (session-start-inject-process-hints.cjs:34,
  session-start-inject-discoverability.cjs:160 — cwd fallback).
- `loadPromotedRules` filters `status === "active"` ONLY (gate-logic.js:757);
  no scope filtering exists. "Active rules" is the correct invariant wording.
- No live rule carries `created_at` (verified across the root meta-state.jsonl
  projection) — sort tie-break must not depend on it.
- `meta_state_batch` is atomic (byte-snapshot rollback, core/meta-state.js:1508-1542).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Promoting an agent-checklist rule = 1 CLI call, full suite green, no hand-edits | P1 |
| 2 | Delete the 9 hand-mirrored registry rows; hints derive from active rules | P1 |
| 3 | Test files derive pure-numeric counts; keep slug/order/budget assertions hardcoded | P1 |
| 4 | Deterministic merged ordering (explicit `hint_order`, append-by-id fallback); preserve published slugs | P1 |

## Non-goals

- Reworking injection channels (renderer/introspect architecture unchanged).
- `loop_get_instruction` numeric-index stability across registry changes.
  Numeric keys become **session-ephemeral**: indices follow the current
  merged view and may renumber when rules are promoted, deactivated, or
  re-ordered. Slug keys are the stable lookup contract. The C2 invariant
  that IS preserved: numeric indices never index the shrunk
  `buildProcessHints()` output — they resolve against the full view.
- Scope-predicate filtering of hints (does not exist today; unchanged).
- Tombstone entries for inactive rules (rejected as over-engineering —
  numeric renumbering is documented and accepted instead).
- A source-code-writing promote tool (rejected brainstorm option B).

## Design

**Rule entry gains three fields** (zod schema core/meta-state.js:522 +
promote tool schema tools/handlers/meta-state-promote-rule-tool.js):
- `hint_order: z.number().int().optional()` — merge key for process-hint order.
- `hint_suggestion: z.string().min(20).max(200).regex(/^[^\n\r]+$/).optional()`
  — curated one-liner. Single-line + capped: it is interpolated raw into
  `${slug} — ${suggestion}` pointer lines (loop-introspect.js:134-139), so a
  newline would manufacture fake pointer rows in every session's warm surface.
  **Required by the promote tool when `pattern_type === "agent-checklist"`**
  (same as `hint_text`); optional on the schema for patch-created rules.
- `hint_slug: z.string().regex(/^[a-z0-9-]+$/).optional()` — explicit slug
  override; only needed when the desired slug ≠ rule id minus `rule-`.

**Merged view (pure):** new `buildProcessView({ rulesById })` in
core/hint-registry.js returns the ordered union of:
- standalone process entries from `HINT_REGISTRY` (gain an `order` field), and
- generated entries for every rule in `rulesById` with `pattern_type ===
  "agent-checklist"`: `{ slug: rule.hint_slug ?? rule.id.replace(/^rule-/,""),
  kind: "process", text: "", suggestion: rule.hint_suggestion ??
  truncateSingleLine(rule.hint_text ?? "", 200), derived_from_rule: rule.id,
  order: rule.hint_order }`.
  The suggestion fallback (patch-created rules lacking the field) caps at one
  line/200 chars and emits a provenance warning — the curation floor is
  enforced at promotion, not by the fallback.
- **Collision guard:** a generated slug equal to a standalone slug or another
  generated slug is skipped with a provenance warning (never last-wins
  overwrite); the promote tool rejects a rule id/`hint_slug` whose derived
  slug collides with a standalone slug or an active rule's slug.

Sort: `order` ascending (undefined → +Infinity), tie-break by slug (id-
derived, deterministic — NOT `created_at`, which no live rule carries).
Rules without `hint_order` append at the end sorted by slug. This also
defines the degraded worktree case (stale meta-state.jsonl without
backfilled `hint_order`): all derived entries append after the standalones
in slug order — different from repo-root order, but deterministic.

Skip semantics unchanged: a generated entry whose rule lacks `hint_text`
resolves to null and is dropped by `resolveHintText` consumers. Inactive
rules never reach the view because `loadPromotedRules` filters to
`status === "active"`.

**Consumer migration (all 8 sites):**
- core/loop-introspect.js `buildProcessHints` / `buildProcessPointers`:
  iterate `buildProcessView({ rulesById: ruleMap })`.
- core/hint-renderer.js: process partition iterates the view.
- tools/handlers/loop-describe-tool.js: same via buildProcessHints (no direct
  change if it calls the builder — verify).
- tools/handlers/loop-get-instruction-tool.js: **rebuild the merged view per
  call** (cheap; the MCP server is long-lived and a first-call cache would
  never invalidate). String keys resolve against the view (replacing the
  direct `findHintBySlug` static-registry lookup at line 50 for process
  slugs); numeric keys = current view position, documented session-ephemeral.
- `.factory/hooks/loop-surface-inject.cjs`, `tools/scripts/delivery-classify.mjs`,
  `tools/scripts/hint-render.mjs`, universal SessionStart hooks: no call-site
  changes (they call the builders), but the byte-identity gate must cover
  the factory-hook output and the cwd-fallback path.

**Byte-identity gate:** before mirror deletion, snapshot current
`buildProcessHints()`/`buildProcessPointers()` output AND the factory-hook
injection block; assert identical output after migration (9 backfilled
rules), plus a degraded-order test with a `hint_order`-less rules map.

**Coverage test inversion:**
`__tests__/legacy-mcp/consult-checklist-process-hints-coverage.test.js`
changes from "every active agent-checklist rule has a mirror row" to "every
active agent-checklist rule appears in `buildProcessView`" + "every view row
with `derived_from_rule` references an active rule" + "no duplicate slugs".

**Gap B:** the 3 test files replace hardcoded counts with derived values.
Slug lists, merged-order assertions, and partition-budget assertions stay
hardcoded — the legitimate drift signal.

**Backfill:** the 9 existing agent-checklist rules get `hint_order` (chosen
to reproduce the current interleaved order), `hint_suggestion` (copied
verbatim from the mirror rows), and — for the 2 divergent rules only —
`hint_slug`. One atomic `meta_state_batch` call.

Result after the plan: promoting a rule = `loop.mjs meta_state_promote_rule
'{..., "hint_text": "...", "hint_suggestion": "..."}'` + appending the slug
to the hardcoded slug-list assertion (the legitimate drift signal). No
registry source edit, no count edits.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Rule schema + promote tool fields + backfill](./phase-01-rule-schema-backfill.md) | Pending |
| 2 | [buildProcessView + consumer migration + mirror deletion](./phase-02-view-consumer-migration.md) | Pending |
| 3 | [Test-count derivation + E2E repro + finding resolution](./phase-03-test-derivation-e2e.md) | Pending |

## Success Criteria

- [ ] Repro of the finding scenario: `meta_state_promote_rule` for a new
      agent-checklist rule, then render-path verification + full `pnpm test`
      green with zero hand-edits (E2E sequencing per Phase 3).
- [ ] SessionStart injection output (claude + factory hook paths)
      byte-identical before/after for the current 9 rules — including the 2
      divergent slugs.
- [ ] `hint-registry.test.cjs`, `hint-renderer.test.cjs`,
      `rule-derived-process-hints.test.cjs` contain no pure-numeric count
      literals for derivable counts.
- [ ] Coverage test asserts rule → view presence directly (no mirror lookup)
      plus slug uniqueness.
- [ ] `loop_get_instruction` slug lookups return identical content for all 9
      current slugs; numeric-key ephemerality documented in the tool
      description.
- [ ] Finding meta-260722T0001Z resolved after re-grounding
      (`meta_state_refresh_file_index` on core/hint-registry.js).

## Risks

- **Ordering drift** — merged order must reproduce the current 11-row order
  exactly. Mitigation: byte-identity gate (claude + factory paths) before
  mirror deletion; `hint_slug` backfill for the 2 divergent slugs.
- **Worktree divergence** — sessions spawned in worktrees whose
  meta-state.jsonl predates the backfill see the degraded (append-by-slug)
  order. Deterministic and self-healing on worktree refresh; noted, accepted.
- **Slug collision spoofing** — mitigated by the buildProcessView skip+warn
  guard and the promote-time collision rejection.
- **Suggestion injection** — multi-line/oversized suggestions would
  manufacture fake pointer lines; mitigated by single-line + max-200 schema.
- **E2E pollution window** — the smoke rule is live while render-path
  verification runs; sequencing + trap-guaranteed cleanup in Phase 3.

## Red Team Review

### Session — 2026-07-26
**Findings:** 12 deduplicated (12 accepted, 4 with modifications, 0 rejected)
**Severity breakdown:** 1 Critical, 5 High, 6 Medium
Reviewers: Security Adversary (Fact Checker), Assumption Destroyer
(Contract Verifier), Failure Mode Analyst (Fact Checker). One non-issue
verified and dismissed: cold-tier cache invalidation from backfill is a
one-time rebuild, correctness-safe (loop-introspect-cache.js:27-33,103-105).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Slug formula can't reproduce 2 of 9 slugs | Critical | Accept | plan.md Design/Overview, phase-01 (hint_slug field + backfill), phase-02 |
| 2 | Merged view is the shrinkable array — numeric-index stability regresses | High | Accept (modified): numeric keys documented session-ephemeral; no tombstones | plan.md Non-goals/Goals, phase-02 |
| 3 | Consumer list omitted 4 sites (factory hook, delivery-classify, hint-render, loop_describe) | High | Accept | plan.md Overview/Design, phase-02 |
| 4 | `findHintBySlug` string-key call site unmigrated | High | Accept | plan.md Design, phase-02 |
| 5 | Lazy slug maps never invalidate in long-lived MCP server | High | Accept (modified): rebuild view per call, no cache | plan.md Design, phase-02 |
| 6 | No slug-collision guard (last-wins overwrite spoofing) | High | Accept | plan.md Design/Risks, phase-01 (promote guard), phase-02 (view guard) |
| 7 | `created_at` absent on all live rules — vacuous tie-break | Medium | Accept (modified): tie-break by slug; no timestamp stamping | plan.md Design, phase-02 |
| 8 | `hint_suggestion` unsanitized multi-line input | Medium | Accept | plan.md Design, phase-01 (schema constraints) |
| 9 | `firstSentence` fallback unspecified, no length floor | Medium | Accept (modified): hint_suggestion required on promotion; fallback = capped single-line truncation + warning | plan.md Design, phase-01, phase-02 |
| 10 | E2E smoke rule pollutes live registry during full-suite window | Medium | Accept | phase-03 (resequenced E2E) |
| 11 | Wrong data path; false "in-scope" invariant; worktree cwd-fallback ordering undefined | Medium | Accept | plan.md Overview/Design/Risks, phase-01 (path fix), phase-02 (degraded-order test) |
| 12 | Re-grounding gap before finding resolution | Medium | Accept | phase-03 (refresh/touch step), plan.md Success Criteria |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-rule-schema-backfill.md,
  phase-02-view-consumer-migration.md, phase-03-test-derivation-e2e.md
- Decision deltas checked: 8 (hint_slug field; ephemeral numeric keys;
  8-site consumer list; per-call view rebuild; collision guard; slug
  tie-break; suggestion required-on-promote + sanitized; E2E resequencing)
- Reconciled stale references: `firstSentence` heuristic (plan.md + phase-02
  sketch → truncateSingleLine + warning); "positional stability" goal →
  deterministic-ordering goal; "active in-scope rules" → "active rules";
  `records/meta-state/meta-state.jsonl` → repo-root `meta-state.jsonl`;
  backfill table extended with hint_slug column; consumer-migration lists
  in plan.md and phase-02 aligned (8 sites); byte-identity criterion
  extended to factory path in both plan.md criteria and phase-02.
- Unresolved contradictions: 0

<!-- slug: derive-rule-process-hints-retire-hint-mirror -->
