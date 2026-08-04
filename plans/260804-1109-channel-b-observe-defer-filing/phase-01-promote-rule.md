---
phase: 1
title: "Promote the agent-checklist rule (TDD)"
status: completed
priority: P1
effort: "1-2h"
dependencies: []
---

# Phase 1: Promote the agent-checklist rule (TDD)

## Overview

Promote finding `meta-260802T0000Z` into the `rule-defer-needs-filing` agent-checklist rule
via `meta_state_promote_rule`. Test-first: update the locked slug-set and mock fixture (red),
promote via CLI (green), verify the live-registry invariants. The rule auto-surfaces at the
next SessionStart — no `HINT_REGISTRY` hand-edit, no new production files.

## Requirements

- Functional: an active `agent-checklist` rule `rule-defer-needs-filing` exists in
  `meta-state.jsonl` with `enforcement: agent`, `affected_system: "meta"` (the promote-tool
  default — it has no `affected_system` field; `withDefaults` sets `"meta"`), `hint_text`
  (≥20 chars), `hint_suggestion` (20–200 chars, single-line), and a `pattern` JSON blob
  `{version:1, items:[{id, description}]}` encoding the file-before-defer obligation.
- Functional: the source finding `meta-260802T0000Z` remains `open` after promotion (the
  promote handler resets to `open`); resolution is deferred to Phase 2.
- Non-functional: no new production code, no new substrate. Two test-fixture edits + one
  registry write (via CLI, not hand-edit).
- Non-functional: red→green is real — the locked-slug-set test runs against the live
  `meta-state.jsonl`, so the test fails before promotion and passes after.

## Architecture

`meta_state_promote_rule` (handler `tools/handlers/meta-state-promote-rule-tool.js`) reads the
finding by `id` (dedupes to max version → v2), guards `category === "loop-anti-pattern"` (✓),
validates `hint_text` + `hint_suggestion` for `agent-checklist`, then `writeEntry` a new
`entry_kind: "rule"` row + a citation row `{source: rule, target: finding, rationale:
"origin"}`. The rule is `status: active` on write; the finding is reset to `open`.

At SessionStart, `session-start-inject-process-hints.cjs` → `buildProcessPointers()` →
`loadPromotedRules` (filter `entry_kind:rule, status:active`) → `buildProcessView` generates a
process-hint row from the new rule (slug `defer-needs-filing`, order 120, text from
`rule.hint_text`). No registry hand-edit. The numbered "N. slug — suggestion" list grows by
one entry.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` — the "process entries
  cover the N expected slugs" test (currently 11). Update the count and append
  `"defer-needs-filing"` to the `expected` array in the last position (order 120 > 110).
- Modify: `tools/learning-loop-mastra/__tests__/helpers/agent-checklist-rules.cjs` —
  `MOCK_AGENT_CHECKLIST_RULES` array; append
  `{ id: "rule-defer-needs-filing", hint_order: 120 }` (no `hint_slug` override — the derived
  slug `defer-needs-filing` is what we want).
- Write (via CLI): one `rule` entry in `meta-state.jsonl` via `meta_state_promote_rule`.
- Delete: the scaffolded `phase-01-start.md` stub (replaced by this file).

## Implementation Steps (TDD: red → promote → green)

### Step 1 — Red: update the locked slug-set test

Edit `__tests__/hint-registry.test.cjs`, test "process entries cover the 11 expected slugs
(9 rule-derived + 2 standalone) via buildProcessView":
- Rename to "12 expected slugs (10 rule-derived + 2 standalone)".
- Append `"defer-needs-filing"` as the last element of the `expected` array (it sorts after
  `no-plan-ids-in-stable-code-artifacts` because `hint_order: 120 > 110`).

Run the focused test:
```bash
pnpm exec vitest run tools/learning-loop-mastra/__tests__/hint-registry.test.cjs
```
Expected: **RED** — `buildProcessView` against the live registry returns 11 slugs, expected
12. This is the deliberate drift signal doing its job.

### Step 2 — Red: update the mock fixture

Edit `__tests__/helpers/agent-checklist-rules.cjs`, append to `MOCK_AGENT_CHECKLIST_RULES`:
```js
{ id: "rule-defer-needs-filing", hint_order: 120 },
```
This keeps the hermetic mock in sync with the live rule set so mock-based tests cover the new
slug. (Mock-based tests pass regardless of the live registry; they are coverage, not the
drift signal.)

### Step 3 — Green: promote the rule via CLI

Write the promotion args to a file (the payload is too large for argv), then invoke:
```bash
cat > /tmp/promote-defer-needs-filing.json <<'JSON'
{
  "id": "meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr",
  "rule_id": "rule-defer-needs-filing",
  "enforcement": "agent",
  "pattern_type": "agent-checklist",
  "pattern": "{\"version\":1,\"items\":[{\"id\":\"defer-needs-filing\",\"description\":\"When you observe a gate or toolchain failure (fallow:gate, pnpm test, build, coverage-parse, or any non-zero toolchain exit) and choose to defer it as out-of-scope, you MUST file it via meta_state_report (category: loop-anti-pattern, severity: warning, affected_system, session_id, description of the failure and why you are deferring) BEFORE continuing past it. A failure that lives only in a plan report is invisible to the loop's self-model. Validating a 'leave-X-open' decision then requires checking the registry for that filed deferral (meta_state_list by session_id), not only re-running verification steps. Scope: failures you DEFER as out-of-scope, not every non-zero exit (lint warnings, flaky tests do not warrant filing).\"}]}",
  "scope_predicate": "none",
  "hint_order": 120,
  "hint_text": "When you observe a gate or toolchain failure (fallow:gate, pnpm test, build, coverage-parse, or any non-zero toolchain exit) and choose to DEFER it as out-of-scope, you MUST file it via meta_state_report (category: loop-anti-pattern, severity: warning, affected_system, session_id, description of the failure and why you are deferring) BEFORE continuing past it. A failure that lives only in a plan report is invisible to self-improvement. Validating a 'leave-X-open' decision then requires checking the registry for that filed deferral (meta_state_list by session_id), not only re-running verification steps. Scope: failures you DEFER, not every non-zero exit. The -50 coverage/u32 episode (2026-08-03) proved this gap: fixed by external review, not by the loop, because no finding was filed.",
  "hint_suggestion": "Observe-and-defer a gate/toolchain failure: meta_state_report it (loop-anti-pattern, session_id) before deferring; leave-X-open validation checks the registry for the filed deferral."
}
JSON
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_promote_rule --args-file /tmp/promote-defer-needs-filing.json
```
Expected output: `{"promoted": true, "rule_entry_id": "rule-defer-needs-filing", ...}`.

If the tool returns `category_must_be_loop-anti_pattern` or `hint_text_required_for_agent_checklist`,
stop and re-check the payload against the schema (`meta_state_promote_rule --schema`).

### Step 4 — Green: verify the live-registry invariants

```bash
pnpm exec vitest run tools/learning-loop-mastra/__tests__/hint-registry.test.cjs \
  tools/learning-loop-mastra/__tests__/rule-derived-process-hints.test.cjs
```
Expected: **GREEN**.
- `hint-registry.test.cjs` "12 expected slugs" — the live registry now produces 12 slugs
  including `defer-needs-filing` in the last position.
- `rule-derived-process-hints.test.cjs` "every active agent-checklist rule carries hint_text"
  and "every active agent-checklist rule appears in buildProcessView (no orphans)" — the new
  rule satisfies both (it has `hint_text` + `hint_suggestion`; `buildProcessView` emits it).

### Step 5 — Confirm the finding stayed open

```bash
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_list \
  --args-file <(echo '{"id":["meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr"],"compact":true}')
```
Expected: `status: "open"` (promote resets to open). If `resolved`, the promote handler
contract changed — stop and re-ground the Phase 2 lifecycle.

### Step 6 — Clean up

Remove the temp payload (the scaffolded `phase-01-start.md` stub was already deleted during
planning; use `-f` so the line is safe even if it is already gone):
```bash
rm -f plans/260804-1109-channel-b-observe-defer-filing/phase-01-start.md /tmp/promote-defer-needs-filing.json
```

## Success Criteria

- [ ] `rule-defer-needs-filing` active, `enforcement: agent`, `pattern_type: agent-checklist`, `affected_system: "meta"` (promote default), `hint_text` ≥20 chars, `hint_suggestion` 20–200 single-line.
- [ ] Locked slug-set test updated (11→12) and green; `defer-needs-filing` last in order.
- [ ] Mock fixture lists the new rule; mock-based process-hint tests green.
- [ ] `rule-derived-process-hints.test.cjs` live-registry invariants green (hint_text + no-orphans).
- [ ] Finding `meta-260802T0000Z` remains `open` after promotion.
- [ ] No new production files; only two test-fixture edits + one CLI registry write.

## Risk Assessment

- **Red signal is live-registry-dependent, not hermetic — but same-commit coupling is
  mechanically enforced.** If the focused test is run on a tree whose `meta-state.jsonl`
  lacks the rule, it stays red. `package.json` wires `simple-git-hooks` with
  `pre-commit: "pnpm test:unit"`, and the locked-slug-set test runs `buildProcessView`
  against the live `meta-state.jsonl` — so committing the fixture edit (11→12) without the
  registry change fails pre-commit (view=11, expected=12), and vice versa. **The test-fixture
  edit and the `meta-state.jsonl` write MUST be in the same commit**; the pre-commit hook
  enforces this, it is not advisory.
- **`hint_suggestion` length.** The drafted suggestion is 182 chars (limit 200; 18-char
  margin). If wording changes push it over, the promote tool rejects with
  `hint_suggestion_required_for_agent_checklist`. Mitigation: keep the suggestion
  single-line and under 200; the drafted text has margin but not much — edit carefully.
- **`pattern` JSON must be stringified.** The `pattern` field is a string containing JSON,
  not a nested object. The args-file uses an escaped JSON string. Mitigation: the drafted
  payload pre-escapes it; verify with `--schema` if validation fails.
- **Slug collision.** `defer-needs-filing` does not collide with any standalone or existing
  rule slug (verified against the locked set). `buildProcessView` would skip + warn on
  collision; the no-orphans test would catch it.