---
title: "Phase C Plan 2 — Parity Gate (C4) Closeout Report"
date: "2026-06-17"
branch: "260616-2200-phase-c-plan-2-parity"
status: closed
---

# Phase C Plan 2 — Parity Gate (C4) Closeout Report

## Acceptance Gate

| Gate | Result |
|------|--------|
| 9 legacy test namespaces pass | ✓ |
| 70 mastra-specific tests pass | ✓ |
| `pnpm test` failures | 0 |
| New skips introduced | 0 (1 pre-existing skip unchanged) |
| Reproducibility | 3 consecutive `pnpm test` runs with identical counts |

Final `pnpm test` counts: **tests 1059 / pass 1058 / fail 0 / skipped 1**.

## What Shipped

- `tools/learning-loop-mastra/schemas.js` — Plan 3 cut-over note header (M-C1).
- `tools/learning-loop-mastra/__tests__/parity-harness.js` — `schemaJsonParity`, `toolsListParity`, `toolsCallParity` helpers.
- `tools/learning-loop-mastra/__tests__/parity-harness.test.js` — 6 invariant tests for the harness.
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — reusable single-server MCP spawn helper.
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` + `.test.js` — dual-server spawn with shared `GATE_ROOT` and smoke tests.
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` — 36 tests: 29 schema parity + 4 read-only content parity + 3 probes.
- `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` — 5-test parallel cold-session E2E for the mastra server.
- `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs` — 3-test dual-server `tools/list` collision test.
- Deleted: `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` (superseded by full structural parity).

## File Deltas

```
 .../phase-04-output-comparison.md                  |  15 +-
 .../phase-07-acceptance-gate.md                    |  14 +-
 .../phase-08-closeout.md                           |  15 +-
 plans/260616-2200-phase-c-plan-2-parity/plan.md    |   4 +-
 .../productization-260612-1530-master-tracker.md   |   4 +-
 .../__tests__/mcp-protocol-e2e.test.cjs            | 136 +++++++++++++++
 .../__tests__/parity-harness.js                    | 190 +++++++++++++++++++++
 .../__tests__/parity-harness.test.js               |  98 +++++++++++
 .../__tests__/parity-schema-shape.test.js          |  71 --------
 .../__tests__/parity-zod-to-json-schema.test.js    | 182 ++++++++++++++++++++
 .../__tests__/with-both-mcp-servers.js             |  77 +++++++++
 .../__tests__/with-both-mcp-servers.test.js        |  41 +++++
 .../__tests__/with-mcp-server.js                   | 124 ++++++++++++++
 .../__tests__/tools-list-collision.test.cjs        |  93 ++++++++++
 14 files changed, 968 insertions(+), 96 deletions(-)
```

## Resolved Deferred Items

- **M-C1:** `tools/learning-loop-mastra/schemas.js` header (Plan 3 cut-over note).
- **F7:** per-field `_def.typeName` parity — covered implicitly by full `z.toJSONSchema()` structural comparison.
- **F9:** parallel cold-session E2E test for the mastra manifest.
- **F11:** `z.toJSONSchema()` structural parity harness (`target: "draft-7"`).
- **M-C5:** automated dual-server `tools/list` collision test.

## Trade-offs / What Was NOT Tested

- **25/29 tools are schema-only parity**; only 4 tools have full `tools/call` content parity (`meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`).
- **`gate_check` is excluded from content parity** because it records a ledger event in `runtime-state.jsonl` and is not read-only.
- **Write-side meta-state tools** are excluded from content parity to avoid registry mutation races; structural schema parity is the gate.
- **11 `workflow_*` tools** are excluded per Phase D separation.
- **F4 gate-bypass gap** (D-10) is deferred to Plan 3; this closeout does not resolve it.
- **Zod v4 is pinned to `4.4.3` exact**; the gate is version-specific.

## Deferred to Plan 3

- **C6:** cut over deterministic tools to the Mastra server.
- **C7:** update `tools/learning-loop-mcp/agent-manifest.json` group names.
- **D-10 / F4:** resolve mastra write-side gate-bypass finding.
- **M-C4:** reconcile 4 missing tools in `agent-manifest.json` (`meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede`).

## Open Questions

None.
