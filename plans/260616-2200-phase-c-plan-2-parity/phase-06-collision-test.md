---
phase: 6
title: "tools/list Collision Test (M-C5)"
status: pending
priority: P1
effort: "1h"
dependencies: ["3"]
---

# Phase 6: tools/list Collision Test (M-C5)

## Overview

Ship `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs` — a dual-server test that spawns BOTH `learning-loop-mcp` AND `learning-loop-mastra` in the same test process, calls `tools/list` on each, and asserts:
1. Legacy server returns 40 tools (from `tools/learning-loop-mcp/tools/manifest.json`).
2. Mastra server returns 29 tools (from `tools/learning-loop-mastra/tools/manifest.json`).
3. The union has 40 + 29 = 69 DISTINCT names (no collisions).
4. The 40 legacy names match `tools/learning-loop-mcp/tools/manifest.json`.
5. The 29 mastra names match `tools/learning-loop-mastra/tools/manifest.json`.

**Resolves M-C5** (post-impl review): "no automated `tools/list` collision test that spawns both servers and enumerates 40 + 29 = 69 distinct tool names." Plan 1's `mcp-config-peer.test.js` only checks file structure; this test exercises the runtime behavior.

## Why this is a separate test (not part of Phase 4)

Phase 4's `parity-zod-to-json-schema.test.js` does structural comparison for the 29 migrated tools. It does NOT verify the legacy's 40 tools (11 workflow_* tools are not in the mastra manifest). The collision test is the runtime verification that BOTH servers' `tools/list` returns what their manifests claim, with no name overlap.

## Requirements

- **Functional:** spawn both servers, fetch both `tools/list` results, assert count + no-collision + manifest-match.
- **Non-functional:** the test uses the `with-both-mcp-servers.js` helper from Phase 3. No new spawn logic.

## Architecture

```
tools-list-collision.test.cjs
├── describe("tools/list collision (40 legacy + 29 mastra = 69 distinct)")
│   ├── withBothMcpServers(async ({ legacy, mastra, listTools }) => {
│   │     ├── const legacyList = await listTools({ server: "legacy" })
│   │     ├── const mastraList = await listTools({ server: "mastra" })
│   │     ├── const legacyNames = legacyList.map(t => t.name).sort()
│   │     ├── const mastraNames = mastraList.map(t => t.name).sort()
│   │     ├── assert equal(legacyNames.length, 40, "legacy must have 40 tools")
│   │     ├── assert equal(mastraNames.length, 29, "mastra must have 29 tools")
│   │     ├── const allNames = new Set([...legacyNames, ...mastraNames])
│   │     ├── assert equal(allNames.size, 69, "no name collisions")
│   │     ├── assert deepEqual(legacyNames, tools/learning-loop-mcp/tools/manifest.json entries)
│   │     ├── assert deepEqual(mastraNames, tools/learning-loop-mastra/tools/manifest.json entries)
│   │     └── assert every mastra name starts with "mastra_"
│   │   })
```

## Related Code Files

- Create: `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs` (~80 lines; uses `with-both-mcp-servers.js` from Phase 3)

## Implementation Steps

1. **Write 1 test (RED).** `tools/list collision: 40 + 29 = 69 distinct names, manifest-matched, no overlap`.
2. **Run, confirm RED (failing on something — likely the manifest-match assertion surfaces a 4-tool gap or the 40/29 count is off by 1).**
3. **Iterate:** if 40 doesn't match `tools/learning-loop-mcp/tools/manifest.json` length, count is the source of truth (verify in `tools/learning-loop-mcp/tools/manifest.json`).
4. **Run, confirm GREEN.**
5. **Add 2 invariant tests:**
   - Test 2: every legacy name does NOT start with `mastra_`.
   - Test 3: every mastra name DOES start with `mastra_`.
6. **Run, confirm 3/3 GREEN.**
7. **Update the Plan 1 closeout report to point at this test** (replaces the manual smoke test claim).

## Success Criteria

- [ ] 3 tests pass
- [ ] Legacy server returns exactly 40 tools; mastra returns exactly 29
- [ ] Union is 69 distinct names (no collisions)
- [ ] Legacy names match `tools/learning-loop-mcp/tools/manifest.json` exactly
- [ ] Mastra names match `tools/learning-loop-mastra/tools/manifest.json` exactly
- [ ] All mastra names start with `mastra_`; all legacy names do not
- [ ] M-C5 marked resolved in `meta-state.jsonl` via `meta_state_log_change`

## Risk Assessment

- **Risk:** the legacy server's 40-tool count is 25 (per `agent-manifest.json`) or 40 (per `tools/manifest.json`)? The 25 is the 29 deterministic + 11 workflow subset; the 40 is the 29 + 11 = 40. Wait, 29 + 11 = 40 ✓. `agent-manifest.json` is missing 4 of the 29 per M-C4. **Mitigation:** the test compares against `tools/manifest.json` (40 entries), not `agent-manifest.json` (25 entries). The 4-tool gap is in `agent-manifest.json`, not `tools/manifest.json`.
- **Risk:** running the test depends on both servers booting in the same `cwd` with the same `GATE_ROOT`. If either fails to start, the test fails — but that's the right behavior (a missing server is a real failure).
- **Risk:** the legacy server's `tools/list` may include tools the mastra server also registers (collision). **Mitigation:** the `mastra_` prefix makes the collision impossible. If a future version drops the prefix, this test surfaces it.

## Security Considerations

None. The test only enumerates `tools/list`; no write operations, no privileged access.

## Next Steps

Phase 7 closes the gate by running all 9 legacy namespaces against both servers. Phase 8 closes out the plan.
