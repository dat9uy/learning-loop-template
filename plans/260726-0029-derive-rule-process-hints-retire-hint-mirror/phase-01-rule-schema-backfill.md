---
phase: 1
title: "Rule schema + promote tool fields + backfill"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Rule schema + promote tool fields + backfill

<!-- Updated: Validation Session 1 - hint_suggestion required on patch-create too; truncateSingleLine fallback removed -->

## Overview

Add `hint_order`, `hint_suggestion`, and `hint_slug` as optional fields on
rule entries, thread them through `meta_state_promote_rule` AND the patch
tool (with `hint_suggestion` required for agent-checklist promotions AND
patch-created agent-checklist rules, plus a slug-collision guard), and
backfill the 9 existing agent-checklist rules so Phase 2 can generate the
byte-identical view. TDD: failing schema/promote tests first.

## Requirements

- Functional: rule entries persist the three fields; promote AND patch
  tools accept them, require `hint_suggestion` when
  `pattern_type === "agent-checklist"`, and reject operations whose derived
  slug collides with a standalone registry slug or an active rule's slug.
- Non-functional: purely additive — no behavior change to existing reads;
  current suite stays green except the new tests.

## Architecture

- Rule zod schema: core/meta-state.js:522-526 (next to `hint_text`):
  - `hint_order: z.number().int().optional()`
  - `hint_suggestion: z.string().min(20).max(200).regex(/^[^\n\r]+$/).optional()`
    — single-line + capped; it is interpolated raw into `${slug} —
    ${suggestion}` pointer lines (loop-introspect.js:134-139), so a newline
    would manufacture fake pointer rows in every session's warm surface.
  - `hint_slug: z.string().regex(/^[a-z0-9-]+$/).optional()`
- Promote tool (tools/handlers/meta-state-promote-rule-tool.js): add the
  three fields; when `pattern_type === "agent-checklist"` require
  `hint_suggestion` (mirroring the existing `hint_text` requirement);
  collision check — derived slug (`hint_slug ?? rule_id.replace(/^rule-/,"")`)
  must not equal a standalone HINT_REGISTRY slug (`pnpm-test-discipline`,
  `file-edit-drift-and-fingerprints`, or any discoverability slug) or an
  active agent-checklist rule's derived slug.
- Patch tool (tools/handlers/meta-state-patch-tool.js): apply the same
  `hint_suggestion` requirement when `pattern_type === "agent-checklist"`
  on patch-create. Patch tool already validates — adding a conditional
  required field is small. Effect: eliminates the
  `truncateSingleLine(hint_text)` fallback + provenance warning that
  Phase 2 would otherwise need. Single curation rule across promote +
  patch-create.
- CLI sketch: check `__tests__/cli-write-hint-sketch-drift.test.js` — if the
  SessionStart surface text enumerates promote args, update it in the same
  commit.
- Backfill (one atomic `meta_state_batch`, 9 `meta_state_patch` ops;
  atomicity verified at core/meta-state.js:1508-1542):
  - `hint_suggestion`: copied verbatim from the mirror rows
    (core/hint-registry.js:206-284).
  - `hint_slug`: ONLY the 2 divergent rules —
    `rule-runtime-agnostic-features` → `runtime-agnostic-audit`;
    `rule-fallow-brief-on-gate-failure` → `fallow-gate-triage`.
  - `hint_order` per this table (standalone `order` fields land in Phase 2):

  | order | entry |
  |---|---|
  | 10 | pnpm-test-discipline (standalone, Phase 2) |
  | 20 | rule-pr-body-registry-deltas |
  | 30 | rule-runtime-agnostic-features |
  | 40 | rule-tool-integration-same-commit-dep |
  | 50 | rule-fallow-brief-on-gate-failure |
  | 60 | rule-short-slug-for-risk-records |
  | 70 | rule-import-chain-analysis-after-tool-deletion |
  | 80 | rule-assertinvariant-at-boundary |
  | 90 | file-edit-drift-and-fingerprints (standalone, Phase 2) |
  | 100 | rule-required-status-checks-verify-combined-status |
  | 110 | rule-no-plan-ids-in-stable-code-artifacts |

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (rule schema)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js`
  (extend `hint_suggestion` requirement to patch-create when agent-checklist)
- Modify: `tools/learning-loop-mastra/bin/loop.mjs` write-sketch text if it
  enumerates promote/patch args (guarded by `__tests__/cli-write-hint-sketch-drift.test.js`)
- Modify: `tools/learning-loop-mastra/__tests__/` — promote-rule and patch
  test files (locate via `grep -rl "promote_rule\|meta_state_patch" __tests__/`)
- Data: `meta-state.jsonl` at repo root (via GATE_ROOT; read by
  `loadPromotedRules`, core/gate-logic.js:720). MCP/CLI tools only — direct
  writes blocked. NOTE: the path is NOT `records/meta-state/`.

## Implementation Steps (TDD)

1. Write failing tests: rule schema accepts/round-trips all three fields;
   `hint_suggestion` rejects newlines and >200 chars; promote persists the
   fields; promote of an agent-checklist rule WITHOUT `hint_suggestion` is
   rejected; promote with a colliding derived slug is rejected; patch-create
   of an agent-checklist rule WITHOUT `hint_suggestion` is rejected; fields
   omitted (gate rule) → entry unchanged from today.
2. Run the new tests, confirm red.
3. Add the zod fields in meta-state.js; add the promote tool schema/handler
   (requirement + collision guard); add the same `hint_suggestion`
   requirement to the patch tool for agent-checklist patch-create.
4. Run new tests → green; run the promote, patch, and schema suites → no regressions.
5. Backfill: `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs
   meta_state_batch '{...9 patch ops...}'` (requires live-session mode for
   writes per the session-mode gate).
6. Verify backfill: `meta_state_list '{"entry_kind":"rule"}'` shows
   `hint_order` + `hint_suggestion` on all 9 agent-checklist rules and
   `hint_slug` on exactly the 2 divergent ones.

## Success Criteria

- [ ] New schema/promote/patch tests green (fields, sanitization,
      requirement on promote AND patch-create, collision guard).
- [ ] Existing promote-rule, patch, and meta-state suites green (additive only).
- [ ] All 9 agent-checklist rules carry `hint_order` + `hint_suggestion`
      matching the mirror rows; `hint_slug` present on exactly
      `rule-runtime-agnostic-features` and `rule-fallow-brief-on-gate-failure`.
- [ ] cli-write-hint-sketch-drift test green (sketch text updated if needed).

## Risk Assessment

- Sketch-drift test failure if the CLI surface text enumerates promote args —
  check first, update in the same commit.
- Backfill is a records write; batch is atomic (byte-snapshot rollback).
  Rollback: `meta_state_patch` removing the fields (entries are
  versioned-append; prior version remains).
- Collision guard compares against active rules only — a deactivated rule's
  slug can be reused. Acceptable: deactivated rules don't render.
