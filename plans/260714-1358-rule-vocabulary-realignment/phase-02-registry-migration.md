---
phase: 2
title: "registry-migration"
status: pending
effort: ""
dependencies: [1, 3]
---

# Phase 02 — registry migration (meta-state.jsonl)

Atomic with phases 1 and 3. The 6 rule records + the enforcement relabel must land in the same
commit as the schema enum rename, else `loadPromotedRules.safeParse` warn-and-skips them.

## Records to migrate (verified via `grep -o '"pattern_type":"[^"]*"' meta-state.jsonl`)

| rule id | current pattern_type | new pattern_type | pattern body rewrite |
|---|---|---|---|
| `rule-runtime-agnostic-features` | `consult-checklist` | `agent-checklist` | (no body change — already JSON checklist) |
| `rule-pr-body-registry-deltas` | `consult-checklist` | `agent-checklist` | (no body change — already JSON checklist) |
| `rule-tool-integration-same-commit-dep` | `consult-checklist` | `agent-checklist` | (no body change — already JSON checklist) |
| `rule-fallow-brief-on-gate-failure` | `consult-checklist` | `agent-checklist` | (no body change — already JSON checklist) |
| `rule-cold-session-test-must-pass-before-resolution` | `resolution-evidence-required` | `determinism-checklist` | (no body change — pattern is `mcp-protocol-e2e-test` session_id) |
| `rule-no-orphaned-evidence` | `resolution-evidence-required` | `determinism-checklist` | (no body change — pattern is `*`) |
| `rule-short-slug-for-risk-records` | `glob` | `agent-checklist` | **rewrite pattern**: `records/**/risks/*.yaml` (glob) → JSON checklist body describing the short-slug rule |
| `rule-import-chain-analysis-after-tool-deletion` | `regex` | `agent-checklist` | **rewrite pattern**: `rm\s+[^\s]*-tool\.js\|...` (regex body) → JSON checklist body describing the import-chain process |
| `rule-assertinvariant-at-boundary` | `regex` | `agent-checklist` | **rewrite pattern**: `^export\s+(async\s+)?function\s+\w+\s*\(` (regex body) → JSON checklist body describing the assertinvariant boundary |

Final distribution: **7 `agent-checklist`** (4 original + 3 reclassified advisory per validation Q3) +
**2 `determinism-checklist`** + **2 `regex`** (gate-enforced only: `rule-no-new-artifact-types`,
`rule-project-skill-boundary`) + **0 `glob`** = 11 total.

## Enforcement relabel

| rule id | current enforcement | new enforcement |
|---|---|---|
| `rule-no-orphaned-evidence` | `agent` | `gate` |

(All other rules' `enforcement` unchanged. `rule-no-orphaned-evidence` already hard-blocks
`meta_state_resolve`; the label is the only wrong thing. This restores `enforcement=gate ↔ state-3`.)

## How to edit

`meta-state.jsonl` is one JSON object per line. Two approaches, in order of preference:

1. **Targeted Edit per line** (preferred — auditable, no sed): Read the file, use `Edit` with the
   exact `"id":"rule-<x>"`-bearing line's `"pattern_type":"<old>"` → `"pattern_type":"<new>"`
   substring (unique per line). 6 edits + 1 enforcement edit + **6 description-field rewrites**
   (see below). The Write-gate permits editing `meta-state.jsonl` (it's not in the records/preflight/
   product hard-block set).
2. A small node script run via `node -e` that loads, rewrites the 7 fields, and writes back — only
   if the Edit approach proves fiddly. Risk: rewriting the whole file must preserve line order and
   trailing newline. Prefer (1).

### Description field rewrite (CRITICAL — red-team Finding 1)

`meta_state_promote_rule` (`tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js:172`)
hard-codes the persisted `description` field as
`` `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.` ``.
After `meta_state_promote_rule` ran for the 9 records (6 original + 3 reclassified per validation Q3),
the literal strings `Pattern type=consult-checklist` (4), `Pattern type=resolution-evidence-required`
(2), `Pattern type=glob` (1), `Pattern type=regex` (2 — `rule-import-chain-analysis-after-tool-deletion`
and `rule-assertinvariant-at-boundary`) are baked into the registry. Targeted Edit on the
`pattern_type` field alone leaves the description text stale.

**Required additional edits per record:**

| rule id | description rewrite |
|---|---|
| `rule-runtime-agnostic-features` | `Pattern type=consult-checklist` → `Pattern type=agent-checklist` |
| `rule-pr-body-registry-deltas` | `Pattern type=consult-checklist` → `Pattern type=agent-checklist` |
| `rule-tool-integration-same-commit-dep` | `Pattern type=consult-checklist` → `Pattern type=agent-checklist` |
| `rule-fallow-brief-on-gate-failure` | `Pattern type=consult-checklist` → `Pattern type=agent-checklist` |
| `rule-cold-session-test-must-pass-before-resolution` | `Pattern type=resolution-evidence-required` → `Pattern type=determinism-checklist` |
| `rule-no-orphaned-evidence` | `Pattern type=resolution-evidence-required` → `Pattern type=determinism-checklist` |
| `rule-short-slug-for-risk-records` | `Pattern type=glob` → `Pattern type=agent-checklist` |
| `rule-import-chain-analysis-after-tool-deletion` | `Pattern type=regex` → `Pattern type=agent-checklist` |
| `rule-assertinvariant-at-boundary` | `Pattern type=regex` → `Pattern type=agent-checklist` |

Each is a substring Edit on the same line as the `pattern_type` edit. Combined: 18 edits per record
(9 pattern_type + 9 description), plus 1 enforcement relabel = **19 edits total**.

Do **not** rewrite historical log lines: `.claude/coordination/gate-log.jsonl`,
`.factory/coordination/.gate-decision.log`, `runtime-state.jsonl` may contain old `pattern_type`/
`matched_pattern` values from past gate decisions. Those are append-only audit logs — leave them
(they record what happened at the time).

## Constraints

- Do not change any other field on these records (no `status`, no `pattern` body, no `origin`).
  The `pattern` field of `agent-checklist` rules stays the JSON checklist body; the `pattern` field
  of `determinism-checklist` rules stays the session_id / `*`.
- Do not touch the `applies_to_resolution` field name (only the `pattern_type` value changes).
- The `description` rewrite is the only field change besides `pattern_type` and the single
  `enforcement` relabel. Do NOT rewrite historical log files' descriptions (those are append-only).

## Verify before phase-05

`grep -o '"pattern_type":"[^"]*"' meta-state.jsonl | sort | uniq -c` must show **7**
`agent-checklist`, 2 `determinism-checklist`, 2 `regex`, 0 `glob` (11 total) and **zero**
`consult-checklist` / `resolution-evidence-required` / `glob` (only the 2 gate-enforced `regex`
survive). And `rule-no-orphaned-evidence`'s line shows `"enforcement":"gate"`.

**Additional verify (description field):**

`grep -E "Pattern type=(consult-checklist|resolution-evidence-required|glob)" meta-state.jsonl` must
return **zero matches**. If any matches remain, a description-rewrite was missed.

**Pattern body verify (validation Q3):**

`grep -E '"pattern":"\^\|' meta-state.jsonl` (regex-body patterns) must return **zero matches** for
the 3 reclassified rules. The `rule-import-chain-analysis-after-tool-deletion` and
`rule-assertinvariant-at-boundary` records must have new JSON checklist-body `pattern` strings
(validate by `JSON.parse` round-trip in a small node -e check).