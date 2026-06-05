---
title: "G8 subcommand-class false positive fix (P1)"
date: "2026-06-06"
session: ck:fix
status: completed
mode: autonomous
plan: plans/260606-g8-subcommand-class-fix
tests: "16 new (8 G8-fix + 3 status-semantics + 5 safety); 707 total, 0 failing"
---

# G8 subcommand-class false positive — fix journal

## ⚠️ Amendment (2026-06-06, after attempted commit)

This journal originally claimed the G8 fix was complete. **It was incomplete.** The actual commit of this P1 fix was blocked by the bash gate because the multi-paragraph commit message body contained trigger phrases (e.g., "propose/design/create a new schema, new schema, create schema") inside quoted `-m "..."` values. Investigation revealed a deeper bug: `splitSegments` in `core/gate-logic.js` was naively splitting on `;`, `&`, `|` without respecting quote state, so a `;` inside a quoted message body fragmented the body BEFORE `stripMessageFlags` could handle it. Each fragment was then checked by the refined regex, and fragments after the `;` matched the rule.

The P1 fix (refined pattern + status filter + safety check) was correct for the **subcommand-name class** (the 7 documented G8 recurrences). It did not address the **message-body-fragmentation class** (a latent bug exposed by the stricter pattern). The full fix requires the additional `splitSegments` quote-aware rewrite — see `docs/journals/260606-splitsegments-quote-aware-fix.md`.

**Lesson:** don't claim a P1 fix is complete without empirically exercising the fix in the same context that triggered the original bug. The P1 fix's 16 new tests used hand-crafted command strings without `;` in quoted bodies; the real commit message (which contains `;` because the message describes the bug class) was not tested. A test that attempted the actual commit would have surfaced the gap.

The finding `meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive` was added to meta-state.jsonl before the fix (per operator instruction: "add the bug to the meta-state, fix it then update").

## Summary

Fixed the G8 subcommand-class false positive (7 documented recurrences 2026-06-02..2026-06-06) by combining two complementary changes:

1. **Pattern refinement** (Path A) — the active `rule-no-new-artifact-types` regex was tightened to require a context qualifier (optional article + trigger noun) after `create/propose/design`. Bare `create` no longer matches CLI subcommand names like `ck plan create` and `record_create_*`.

2. **Filter fix** — `loadPromotedRules` + `applyPromotedRules` were updated to accept `status: "resolved"` entries with a `promoted_to_rule` field. Previously the filter required `status: "active"`, which silently excluded the 3 historical promoted rule entries (whose `status: "resolved"` was set when the finding was resolved by rule promotion). This meant the gate's promoted-rules check was a no-op for the entire project lifetime.

Plus a **safety check fix** — `isSafeRegexPattern` was treating multiple top-level quantifiers as nested (false positive on the refined pattern). The check was relaxed to only flag actual nested quantifiers within groups. ReDoS protection preserved (`(a+)+` still rejected).

## Root cause analysis (revisited)

The G8 subcommand-class false positive was previously diagnosed in 5 separate change-log entries (recurrences 1, 3, 4, 5, 6, 7) and the "fix paths" were documented but not implemented. When I started the fix, I discovered a deeper issue: the rule wasn't even being loaded. The 3 historical promoted rule entries all had `status: "resolved"` (the canonical state when a finding is resolved by rule promotion), but `loadPromotedRules` filtered to `status: "active"`. So the gate's promoted-rules check was a silent no-op.

Empirical evidence:

```js
// Before fix:
loadPromotedRules(root)  // → []
applyPromotedRules("ck plan create ...", null, rules)  // → { decision: "ok" } (rule never loaded)
```

```js
// After fix:
loadPromotedRules(root)  // → [rule-no-new-artifact-types, rule-project-skill-boundary]
applyPromotedRules("ck plan create ...", null, rules)  // → { decision: "ok" } (rule loaded, refined pattern doesn't match subcommand)
applyPromotedRules("propose a new schema", null, rules)  // → { decision: "escalate", rule_id: "rule-no-new-artifact-types" } (legit trigger still caught)
```

## Pattern refinement (Path A)

Old: `propose|design|create|new\s+(schema|artifact|directory|convention)`
New: `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`

The new pattern:
- Requires a context qualifier (whitespace + optional article + trigger noun) after `create/propose/design` (the bare verb is no longer a trigger)
- Keeps the `new\s+(...)` alternative for "I want a new schema" / "propose new convention" prose
- Eliminates the false positive on subcommand names like `ck plan create`, `record_create_decision`, `meta_state_log_change`

Trade-off: "create schema" (without an article) is now matched by `(create)\s+(schema)`, but "create a schema" (with article) is matched by `(create)\s+(a)\s*(schema)`. Both legitimate triggers are caught. The original pattern matched BOTH "create schema" and "create anything" — the latter was the false positive.

## Safety check fix (companion change)

The refined pattern has 3 quantifiers (`+`, `?`, `*`) at top level. The existing `isSafeRegexPattern` check treated multiple top-level quantifiers as nested, rejecting the pattern. The check was:

- Too strict: multiple `\s+` in different alternatives (no nesting) were rejected
- Correct for actual ReDoS: `(a+)+` (a group with an inner quantifier, then quantified) was correctly rejected

Fix: only check quantifier chain INSIDE groups (depth > 0). Top-level quantifiers (depth 0) are not "nested" — they're in different alternatives or separated by non-group tokens.

Trace for `(a+)+` (still rejected):
- `(` → depth=1
- `a+` → quantifier at depth=1, set `groupHadQuantifier[1]=true`
- `)` → propagate to parent (depth 0, skipped with new check)
- `+` → quantifier at depth=0, preceded by `)`, `groupHadQuantifier[depth+1]=groupHadQuantifier[1]=true` → REJECT

Trace for the refined G8 pattern (now accepted):
- `(propose|design|create)` → group, no quantifier
- `\s+` → quantifier at depth=0, preceded by `)`, `groupHadQuantifier[1]=false` → OK
- `(a|an|...)?` → group with `?` quantifier
- `\s*` → quantifier at depth=0, preceded by `*` (not `)`) → OK
- `...|new\s+(...)` → second alternative with `\s+`, same OK

## Files changed

| File | Change |
|------|--------|
| `tools/learning-loop-mcp/core/gate-logic.js` | (1) `loadPromotedRules` filter accepts `status='resolved'`; (2) `applyPromotedRules` status check mirrors; (3) `isSafeRegexPattern` check relaxed (top-level quantifiers no longer flagged as nested) |
| `meta-state.jsonl` | (1) `rule-no-new-artifact-types.promoted_to_rule.pattern` refined + audit metadata (`refined_at`, `refined_by`, `refinement_reason`); (2) rule entry description updated to reference new pattern; (3) new change-log entry `meta-260606T0225Z-g8-subcommand-class-false-positive-fixed` |
| `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` | 16 new tests: 8 G8-fix regression guards + 3 status-semantics tests + 5 safety check tests |
| `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` | Filter excludes the rule entry (now has "subcommand-class false positive" in its refinement annotation) from the G8 finding entry lookup |

## Test outcomes

| Test | Before | After |
|------|--------|-------|
| `ck plan create --title ... --phases ... --dir ...` | `escalate` (false positive) | `ok` |
| `record_create_decision --input foo` | `escalate` (false positive) | `ok` |
| `meta_state_log_change --target foo` | `escalate` (false positive) | `ok` |
| `propose a new schema` | `escalate` | `escalate` (regression guard passes) |
| `design a new artifact` | `escalate` | `escalate` |
| `create a new directory` | `escalate` | `escalate` |
| `new schema` | `escalate` | `escalate` |
| `create schema` | `escalate` | `escalate` |
| `git commit -m "create new convention"` | `ok` (stripMessageFlags) | `ok` |
| `echo "create new convention"` | `escalate` (heredoc limitation) | `escalate` (still expected) |
| `loadPromotedRules()` for project root | 0 rules (silent no-op) | 2 rules (rule-no-new-artifact-types, rule-project-skill-boundary) |

Total: 707/707 tests pass (was 690, +17 new tests: 16 in gate-promoted-rules.test.js + 1 was a pre-existing test that now passes).

## Side effects / scope

- **No blast radius regressions**: the 3 historical promoted rules are now correctly loaded. The other 2 rules (`rule-short-slug-for-risk-records` with `enforcement: agent`, `rule-project-skill-boundary` with `enforcement: gate`) were also affected. The first is loaded by `loop_describe`'s introspection (not by `loadPromotedRules` which filters to `enforcement: gate`). The second is now correctly loaded by `loadPromotedRules`. No new false positives observed in test suite or in real bash commands.
- **No public API changes**: `applyPromotedRules`, `loadPromotedRules`, `isSafeRegexPattern` signatures unchanged. Response shapes unchanged.
- **Pattern field on existing entry mutated in place** (via `core/meta-state.js#updateEntry`, atomic + CAS-safe). Description updated to reference the new pattern + refinement metadata. The original `promoted_at` and `promoted_by` are preserved; new `refined_at` and `refined_by` fields added.
- **Schema change**: the `promoted_to_rule` field on change-log / finding entries is not schema-constrained beyond what the rule loader reads. The new `refined_at`, `refined_by`, `refinement_reason` fields are optional and additive. No schema validation breakage observed.

## Out of scope (intentionally)

- **The actual G8 false positive on `meta_state_promote_rule` (which itself calls `updateEntry`)** — not tested explicitly, but the refined pattern is general enough to also not match it. Verified empirically: `meta_state_log_change --target foo` returns `ok`.
- **The heredoc limitation** (`echo "create new convention"` still escalates) — same as the pre-fix behavior. The plan's scope is the subcommand-name class, not the heredoc class. Captured as a separate follow-up if needed.
- **Auto-mutation of rule patterns** when a fix is applied — out of scope; the fix was applied via direct `updateEntry` call (atomic + CAS) and is documented in a change-log entry.

## References

- `meta-state.jsonl` entries:
  - `meta-260606T0225Z-g8-subcommand-class-false-positive-fixed` (new change-log, this fix)
  - `meta-260606T0028Z-g8-subcommand-class-false-positive-supersede` (Phase 2 of plan 260605, superseded 4 G8 finding entries)
  - `meta-260606T0023Z-tools-learning-loop-mcp-core-gate-logic-js-applypromotedrule-7th-recurrence` (7th G8 recurrence, plan 260605 phase 0)
  - `meta-260605T1210Z-tools-learning-loop-mcp-core-gate-logic-js-applypromotedrule` (6th G8 recurrence, plan 260603-sp3-drift phase 0)
- `plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md` — the previous attempt that documented the fix paths
- `docs/journals/260602-meta-state-lifecycle-tidy.md` — the original G8 fix attempt (T1, commit-message class only)
- `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` — the function with the filter fix
- `tools/learning-loop-mcp/core/gate-logic.js#isSafeRegexPattern` — the function with the safety check fix
