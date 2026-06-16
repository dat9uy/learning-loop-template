---
phase: 7
title: "Acceptance Gate (all 9 namespaces for both servers)"
status: pending
priority: P1
effort: "30min"
dependencies: ["2", "3", "4", "5", "6"]
---

# Phase 7: Acceptance Gate (all 9 namespaces for both servers)

## Overview

Verify the durable anchor: **all 9 legacy test namespaces pass against the legacy server AND all 9 pass against the mastra server**. Plan 1's gate was 9/9 legacy + 55/55 namespace-10. Plan 2's gate is the 9/9 legacy running against BOTH servers (proven via the dual-server parity tests from Phases 4-6) + 55/55 + new tests (parity-zod-to-json-schema.test.js with 63 tests, mcp-protocol-e2e.test.cjs with 5 tests, tools-list-collision.test.cjs with 3 tests).

The 9 legacy namespaces are exercised in plan 1 by `pnpm test` (which runs `package.json#scripts.test` against 10 glob patterns). The mastra server is exercised by the 3 new tests + the 55 existing namespace-10 tests.

## Why "all 9 namespaces for both servers" is the right gate

The 9 namespace anchor is the **durable invariant** (per master tracker 2026-06-16). Counts drift; namespaces don't. Plan 2's gate is:
- "All 9 legacy test namespaces pass against the legacy server" (durable anchor; Plan 1's gate).
- "All parity tests pass against both servers" (new in Plan 2; the parity suite).
- "The mastra server's 29 deterministic tools produce byte-identical output to the legacy server's deterministic subset" (the structural claim).

The acceptance gate DOES NOT require "all 9 namespaces pass against the mastra server" because:
1. The mastra server does NOT register the 11 `workflow_*` tools (Phase D separation).
2. The 4 mastra-omitted legacy tools (per M-C4) are not in the parity subset.
3. The `.claude/coordination/__tests__/` and `.factory/hooks/__tests__/` namespaces are tests of the gate layer, not of the MCP server; they don't depend on which server is running.

The gate IS: legacy server passes 9/9 (unchanged), mastra server passes 5/5 cold-session + 3/3 collision + 37/37 parity-zod-to-json-schema (29 schema + 5 read-only + 3 probes) + 23/23 existing wire-format (5+6+5+4+6 - 29 deleted shape = ... actually 20 wire-format + 6 mcp-config-peer remain) = 71 tests pass. **Per R-02 + R-07:** per-test counts are informational; the 9-namespace anchor is the durable gate.

## Requirements

- **Functional:** `pnpm test` reports 9/9 legacy namespaces pass + 71/71 mastra-specific tests pass (per R-02 + R-07 corrected math) + 0 failures + 0 new skips.
- **Non-functional:** the gate is reproducible; running `pnpm test` 3 times consecutively produces the same count.

## Architecture

```
package.json#scripts.test
  → 9 legacy globs + 1 new glob (mastra __tests__/)
  → runs in CI on every PR
  → the acceptance gate is "all 10 globs report 0 fail"
```

## Related Code Files

- Modify: `package.json#scripts.test` — verify the 10th glob is present (Plan 1 added it; verify no drift)
- Verify: `tools/learning-loop-mastra/__tests__/*.test.js` includes the new tests from Phases 4-6

## Implementation Steps

1. **Verify the 10th glob.** `grep "tools/learning-loop-mastra/__tests__" package.json`. Plan 1 added it; should be present.
2. **Run `pnpm test`.** Capture full output. Expect per-file counts in namespace 10:
   - `wire-format-coercion-fix.test.js`: 5
   - `wire-format-top-level-coercion.test.js`: 6
   - `wire-format-meta-state-optional-fields.test.js`: 5
   - `wire-format-patch-recursion.test.js`: 4
   - `mcp-config-peer.test.js`: 6
   - `parity-zod-to-json-schema.test.js` (NEW from Phase 4): 37 (29 schema + 5 read-only + 3 probes)
   - `mcp-protocol-e2e.test.cjs` (NEW from Phase 5): 5
   - `tools-list-collision.test.cjs` (NEW from Phase 6, lives in legacy __tests__): 3
   - **Total mastra-specific: 5+6+5+4+6+37+5 = 68 in namespace 10 + 3 in legacy __tests__ = 71 tests**
3. **Run 3 times consecutively.** Verify no flake.
4. **If any test fails:** the gate is not met. Read the failure, decide (per the workflow): is it a real parity gap (Plan 2 blocked; Plan 1 still shippable) or a test bug (fix the test, retry)?
5. **If all pass:** proceed to Phase 8.

## Success Criteria

- [ ] 9/9 legacy namespaces pass
- [ ] 71/71 mastra tests pass (per-file count verified in `pnpm test` output; 9-namespace anchor is durable, per-test counts drift)
- [ ] 0 failures
- [ ] 0 new skips (the 1 pre-existing skip in legacy is unchanged)
- [ ] 3 consecutive `pnpm test` runs produce the same count

## Risk Assessment

- **Risk:** the parity tests' JSON Schema comparison may surface a real shape divergence between legacy and mastra. **Mitigation:** the test normalizes (strips `$schema`, `title`, `description`); if there's still a divergence, the diff is logged with both JSONs side-by-side. The operator decides: is it a real parity gap (block) or a spec drift (fix the normalization and retry)?
- **Risk:** the dual-server spawn (Phase 3) may be flaky on slow CI. **Mitigation:** the helper has a 5-second startup timeout; on timeout, fail fast with a clear error. The cold-session test (Phase 5) does NOT use the dual-spawn helper; it uses the single-server pattern (extracted in Phase 3 Step 1). Only the collision test (Phase 6) and parity-zod-to-json-schema test (Phase 4) use the dual-spawn helper.
- **Risk:** the new test count may not be exactly 71 (per-file: 5+6+5+4+6+37+5 = 68 in namespace 10 + 3 in legacy __tests__ = 71). The actual count depends on the test implementation; verify with `pnpm test` output. **Mitigation:** the durable anchor is "0 fail + all 9 namespaces pass" — counts are informational. The 9-namespace anchor is the operator's verification surface, not per-test counts.

## Security Considerations

None. The acceptance gate runs existing tests; no new operations.

## Next Steps

Phase 8 closes the plan: master tracker flip, `meta_state_log_change`, journal entry, PR body.
