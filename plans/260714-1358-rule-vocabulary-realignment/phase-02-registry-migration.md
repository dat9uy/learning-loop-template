# Phase 02 — registry migration (meta-state.jsonl)

Atomic with phases 1 and 3. The 6 rule records + the enforcement relabel must land in the same
commit as the schema enum rename, else `loadPromotedRules.safeParse` warn-and-skips them.

## Records to migrate (verified via `grep -o '"pattern_type":"[^"]*"' meta-state.jsonl`)

| rule id | current pattern_type | new pattern_type |
|---|---|---|
| `rule-runtime-agnostic-features` | `consult-checklist` | `agent-checklist` |
| `rule-pr-body-registry-deltas` | `consult-checklist` | `agent-checklist` |
| `rule-tool-integration-same-commit-dep` | `consult-checklist` | `agent-checklist` |
| `rule-fallow-brief-on-gate-failure` | `consult-checklist` | `agent-checklist` |
| `rule-cold-session-test-must-pass-before-resolution` | `resolution-evidence-required` | `determinism-checklist` |
| `rule-no-orphaned-evidence` | `resolution-evidence-required` | `determinism-checklist` |

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
   substring (unique per line). 6 edits + 1 enforcement edit. The Write-gate permits editing
   `meta-state.jsonl` (it's not in the records/preflight/product hard-block set).
2. A small node script run via `node -e` that loads, rewrites the 7 fields, and writes back — only
   if the Edit approach proves fiddly. Risk: rewriting the whole file must preserve line order and
   trailing newline. Prefer (1).

Do **not** rewrite historical log lines: `.claude/coordination/gate-log.jsonl`,
`.factory/coordination/gate-decision.log`, `runtime-state.jsonl` may contain old `pattern_type`/
`matched_pattern` values from past gate decisions. Those are append-only audit logs — leave them
(they record what happened at the time).

## Constraints

- Do not change any other field on these records (no `status`, no `pattern` body, no `origin`).
  The `pattern` field of `agent-checklist` rules stays the JSON checklist body; the `pattern` field
  of `determinism-checklist` rules stays the session_id / `*`.
- Do not touch the `applies_to_resolution` field name (only the `pattern_type` value changes).

## Verify before phase-05

`grep -o '"pattern_type":"[^"]*"' meta-state.jsonl | sort | uniq -c` must show 4
`agent-checklist`, 2 `determinism-checklist`, 3 `regex`, 2 `glob` (11 total) and **zero**
`consult-checklist` / `resolution-evidence-required`. And `rule-no-orphaned-evidence`'s line shows
`"enforcement":"gate"`.