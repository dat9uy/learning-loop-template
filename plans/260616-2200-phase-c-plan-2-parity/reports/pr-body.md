## Phase C Plan 2 — Parity Gate (C4)

### What

- Byte-identical parity harness between `learning-loop-mcp` and `learning-loop-mastra`.
- 9 legacy test namespaces pass against the legacy server + 70 mastra-specific tests pass.
- 40 legacy + 29 mastra = 69 distinct tool names, zero collisions.

### Resolved deferred items

- **M-C1:** `tools/learning-loop-mastra/schemas.js` header (Plan 3 cut-over note).
- **F7:** per-field `_def.typeName` parity — covered implicitly by full `z.toJSONSchema()` structural comparison.
- **F9:** parallel cold-session E2E test for the mastra manifest.
- **F11:** `z.toJSONSchema({ target: "draft-7" })` structural parity harness.
- **M-C5:** automated dual-server `tools/list` collision test.

### Unblocks

- Plan 3 (C6+C7 cut-over).

### Test matrix

| Suite | Tests | Status |
|-------|-------|--------|
| legacy 9 namespaces | 9 | ✓ |
| namespace 10 (existing) | 55 → 62 (after Phase 4 swap) | ✓ |
| parity-zod-to-json-schema | 36 (29 schema + 4 read-only + 3 probes) | ✓ |
| mcp-protocol-e2e (mastra) | 5 | ✓ |
| tools-list-collision | 3 | ✓ |
| **Total mastra** | **70** | **✓** |

Full `pnpm test` result: **1059 tests / 1058 pass / 0 fail / 1 pre-existing skip**.

### Trade-offs / what we did NOT test

- **25/29 tools are schema-only parity** (only 4 are full content parity: `meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`). The 25 write-side tools are excluded from content parity to avoid registry mutation races; structural schema parity is the gate.
- **`gate_check` is excluded from content parity** because it records the checked command as a ledger event in `runtime-state.jsonl`; it is not read-only.
- **F4 gate-bypass gap** (D-10) is **deferred to Plan 3**; this PR does NOT resolve the `mastra_*` write-side tools bypassing the legacy gate layer. The finding is `ack`-ed but remains `active`.
- **Zod v4 is pinned to `4.4.3` exact** (no caret) — the gate is version-specific. A minor version bump of zod will require a re-verify; CI drift check is D-16 follow-up.
- **11 `workflow_*` tools are excluded** from parity per Phase D separation.
- **Tool count source of truth is `tools/manifest.json`** (40 legacy + 29 mastra = 69 distinct), NOT `agent-manifest.json` (5 grouped lists; 4 missing per M-C4, deferred to C7).
- **MCP client-side namespacing (D-7)** is unevaluated in this plan; the `mastra_` prefix stays. Plan 3 may re-evaluate.

### Files changed

- `tools/learning-loop-mastra/schemas.js` — Plan 3 cut-over note.
- `tools/learning-loop-mastra/__tests__/parity-harness.js` + `.test.js` — parity helpers + invariant tests.
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — single-server spawn helper.
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` + `.test.js` — dual-server spawn + smoke tests.
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` — 36-test structural + content parity suite.
- `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` — 5-test mastra cold-session E2E.
- `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs` — 3-test dual-server collision test.
- Deleted `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js`.
- Updated plan files, master tracker, project changelog, and meta-state change-log entries.

### Closeout report

See `plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md`.
