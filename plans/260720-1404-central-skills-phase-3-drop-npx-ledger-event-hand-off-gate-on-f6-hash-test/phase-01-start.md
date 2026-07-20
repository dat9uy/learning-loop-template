---
phase: 1
title: "Open C finding"
status: pending
priority: P2
effort: "15m"
dependencies: []
---

# Phase 1: Open C finding

## Overview

Record Finding C in the meta-state registry before editing the plan, so the loop grounds and tracks
it. Mirrors how A/B/D were recorded (report unresolved Q1 recommended "record before fixing"; A/B/D
got recorded-and-resolved, C never did). This finding is opened now and resolved in Phase 3 once
the edits ship.

## Requirements

- Functional: a new `loop-anti-pattern` finding (subtype `escape-hatch-abuse`) exists in the registry,
  open, with `evidence_code_ref` set so the loop hashes + re-checks it.
- Non-functional: the finding's description names the three C failures (no sandbox selector,
  untested report-back loop, same-id append can't supersede at id-keyed `find` sites) and cites the
  concrete evidence.

## Architecture

The finding captures two coupled defects from the problem-solving report:
1. **Schema:** `schemas/runtime-state.schema.json:15-18` — `id` is `^[a-z0-9-]+$` only, no uniqueness,
   no supersession field. Same-id "correction" appends rely on `metadata.supersedes_fingerprint`, but
   every id-keyed reader returns the first match.
2. **Read site:** `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js:45-50`
   — `findDispatchRow` does `rows.find(r => r.id === target && r.kind === "ledger-event")` → first
   match wins; the 11:55:30 "correction" is never returned over the 08:13:00 corrupt row.

The escape-hatch-abuse subtype fits: same-id append-correction masquerades as supersession without
any read site honoring it.

## Related Code Files

- Reference (cite, do not modify here): `schemas/runtime-state.schema.json:15-18`
- Reference (cite, do not modify here): `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js:45-50`
- Reference (cite, do not modify here): `runtime-state.jsonl:23-24` (the two corrupt same-id rows)

## Implementation Steps

1. Run `meta_state_relationship_validate({ description: <finding text> })` to lint for orphan id refs
   (none expected — this finding references code paths, not other finding ids).
2. Call `meta_state_report` with:
   - `category: "loop-anti-pattern"`
   - `subtype: "escape-hatch-abuse"`
   - `severity: "warning"`
   - `affected_system: "runtime-state"`
   - `description:` the three C failures + the inversion (a static plan cannot read runtime-state
     back and mark a criterion met; only a test does) + the resolution direction (drop hand-off,
     gate on F6 hash test).
   - `evidence_code_ref: "tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js:45"`
     (the load-bearing read site; `mechanism_check` auto-defaults true → loop will hash + re-check).
3. Capture the returned finding id (form `meta-260720T…-…`) for use in Phase 3's
   `meta_state_resolve`.

## Success Criteria

- [ ] C finding exists in the registry, `status: open`, `loop-anti-pattern` / `escape-hatch-abuse`,
      `affected_system: runtime-state`, `evidence_code_ref` set.
- [ ] Finding id captured for Phase 3 resolution.

## Risk Assessment

- **Premature resolve** — do not resolve in this phase; the underlying plan text still carries the
  hand-off. Resolve only after Phase 2 edits land (Phase 3). Resolving early would close a finding
  whose evidence (the live hand-off language) still exists.