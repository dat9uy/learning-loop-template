# Proposal — Compact `loop_describe` Warm Tier to an Index

## Problem

`loop_describe({tier:"warm"})` returns **117,678 chars (~115 KB)** — 5× its
own documented budget ("warm=active surface, 10-25KB"). This is the
exhaustive-context anti-pattern: the agent pays a large context tax at
session start for prose it mostly doesn't act on immediately.

### Per-field breakdown (measured)

| field | chars | items | offender |
|-------|------:|------:|----------|
| active_findings | 45,230 | 21 | **full `description` per finding** |
| anti_patterns | 35,859 | 14 | **full `description` per anti-pattern** |
| tools | 17,870 | 32 | full `description` per tool (15,615 chars) |
| process_hints | 6,920 | 9 | kept (inline-injected; on-demand) |
| rules | 6,767 | 9 | full `pattern` string per rule (5,518) |
| discoverability_hints | 5,084 | 16 | kept (inline-injected; on-demand) |
| registry_summary | 2,462 | 5 | already a summary — keep |
| other (gate/substrates/counts/timing) | ~700 | — | keep |

~81 KB of the 117 KB is full prose of `active_findings` + `anti_patterns`.

## Root cause

The warm handler (`tools/handlers/loop-describe-tool.js:54-92`) maps every
finding/anti-pattern/tool to its **full** description and every rule to its
**full** pattern. There is no progressive disclosure: the warm tier dumps
detail that belongs in a per-id lookup.

Per-id lookups already exist:
- findings / anti-patterns / rules → `meta_state_list({ id:[...] })` (narrow
  query; the warm tier already cites this pattern in its own hints).
- hints → `loop_get_instruction({ key })`.
- tools → `tool-selection-guide.md` + `tools/manifest.json` (no MCP per-id
  tool lookup; the hot tier already returns tool names only).

## Proposed compact shape (warm)

Drop full text from the index fields; keep id + classifying fields only.

| field | today | proposed |
|-------|-------|----------|
| `active_findings` | id, category, status, **description** | id, category, status |
| `anti_patterns` | id, subtype, status, **description** | id, subtype, status |
| `rules` | rule_id, pattern_type, **pattern** | rule_id, pattern_type |
| `tools` | name, **description** | name (+ optional 1-line; see decision) |
| `discoverability_hints`, `process_hints` | kept | kept (contract; warm is on-demand mid-session too) |
| `registry_summary`, `gate_patterns`, `substrates`, counts, `timing` | kept | kept |

Add a one-line `lookup_hint` to the warm response pointing the agent at the
per-id tools: "For a finding/anti-pattern/rule's full text, call
`meta_state_list({id:['<id>']})`; for a hint, `loop_get_instruction({key})`."

**Projected size:** ~19 KB (tools name-only) or ~21 KB (tools +1-line) — within
the documented 10–25 KB budget.

## Blast radius

- **Tests:** safe. No test asserts warm `description`/`pattern` fields — the
  only `tools[0].description` assertion is the *hot* tier (expects
  `undefined`). Warm-tier tests assert hints + counts + tool *names* + finding
  *category* — all preserved.
- **Public contract:** the warm response shape changes (fields dropped). Any
  agent/consumer reading `active_findings[].description` etc. must switch to
  `meta_state_list({id})`. This is the intended behavior change.
- **Docs:** `CLAUDE.md`, `docs/loop-engine.md`, and the tool's own schema
  description ("warm=10-25KB") should be updated to describe the index shape.
- **CI:** no workflow is known to parse warm descriptions (the PR-body
  advisory reads `meta-state.jsonl`, not warm). To confirm at implementation.

## Decision needed

1. `tools` in warm: **name-only** (force agent to `tool-selection-guide.md`) vs
   **name + 1-line truncated description** (at-a-glance without the full prose).
2. Proceed to implement now, or leave as proposal?

## Not in scope

- Cold tier (already has `description_mode=summary` + caching) — unchanged.
- Hot tier (already name-only) — unchanged.
- The new SessionStart stdout injection (shipped separately, this session) —
  makes hints deterministic regardless of warm shape.