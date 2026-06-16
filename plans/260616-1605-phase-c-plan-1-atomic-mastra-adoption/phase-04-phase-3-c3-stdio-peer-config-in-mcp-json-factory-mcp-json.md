---
phase: 4
title: "Phase 3 — C3 stdio peer config in .mcp.json + .factory/mcp.json"
status: pending
priority: P1
effort: "~30min"
dependencies: ["phase-2-c2-register-29-deterministic-tools-via-createlooptool"]
---

# Phase 4: Phase 3 — C3 stdio peer config in .mcp.json + .factory/mcp.json

## Overview

Add the `learning-loop-mastra` peer entry to both `.mcp.json` (Claude Code) and `.factory/mcp.json` (Droid CLI). Verify both servers boot in parallel without collision. The legacy `learning-loop-mcp` entry stays unchanged; the new peer is additive.

This is the **operational half of C3** (the other half — Mastra's stdio transport wiring — was already done in Phase 0's `server.js` via `await server.startStdio()`). Plan 1's C3 is symmetric: both surfaces get the peer entry.

**Tool-name collision (the key risk per research §4):** if both servers enumerate tools globally, `gate_check` (legacy) and `mastra_gate_check` (mastra) appear as distinct names — no collision. The `mastra_` prefix from Phase 2 was the safe path; Phase 3 verifies the assumption by spawning both servers and inspecting `tools/list`.

## Context Links

- **Current state:** `.mcp.json` and `.factory/mcp.json` each have 1 `mcpServers` entry (`learning-loop-mcp`).
- **Target state:** each file has 2 entries (`learning-loop-mcp` + `learning-loop-mastra`).
- **Mastra API research:** `plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md` §4 (collision risk + ranked solutions).
- **Plan parent:** `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md`

## Requirements

- **Functional:**
  - `.mcp.json` has 2 `mcpServers` entries: the existing `learning-loop-mcp` (untouched) + the new `learning-loop-mastra` (peer).
  - `.factory/mcp.json` mirrors `.mcp.json` exactly (the cross-surface pattern, per `rule-runtime-agnostic-features`).
  - Both servers boot in parallel when their respective runtimes load the config (verified by a manual smoke test or a programmatic `tools/list` check).
  - `tools/list` enumeration across both servers returns 40 + 29 = 69 tool names with no collisions (29 `mastra_*` + 40 `*` from legacy).
- **Non-functional:**
  - The existing `learning-loop-mcp` entry is unchanged (no field modified, no value touched).
  - The new entry uses identical structure: `{ "command": "node", "args": ["tools/learning-loop-mastra/server.js"] }` (matches legacy invocation pattern).
  - The runtime hooks (`.claude/coordination/hooks/` + `.factory/coordination/hooks/`) are unchanged — they only fire on the legacy server's tools (per `research-260611-2216` §3.9, Mode 1).
  - Both `package.json` entries are consistent with the existing pattern.

## Architecture

**Before (verified):**
```jsonc
// both .mcp.json and .factory/mcp.json
{
  "mcpServers": {
    "learning-loop-mcp": {
      "command": "node",
      "args": ["tools/learning-loop-mcp/server.js"]
    }
  }
}
```

**After (Plan 1):**
```jsonc
// both .mcp.json and .factory/mcp.json — additive only
{
  "mcpServers": {
    "learning-loop-mcp": {
      "command": "node",
      "args": ["tools/learning-loop-mcp/server.js"]
    },
    "learning-loop-mastra": {
      "command": "node",
      "args": ["tools/learning-loop-mastra/server.js"]
    }
  }
}
```

**Runtime behavior (verified assumption, confidence 90%):**

- The Claude Code / Droid CLI runtime spawns each `mcpServers` entry as a separate stdio child process.
- Each child's `tools/list` is aggregated into the runtime's global tool list.
- With the `mastra_` prefix, the mastra server's 29 tools and the legacy server's 40 tools (29 of which are the same logic) appear as 69 distinct names.
- No collision, no shadowing. The 29 `mastra_*` tools are alternative implementations; clients can call either.

**C3 verification test (TDD, ~15 min):**

A small integration test in `tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js` parses both `.mcp.json` files and asserts:

1. Both files have exactly 2 `mcpServers` entries.
2. Both files have a `learning-loop-mastra` entry with `command: node` + `args: ["tools/learning-loop-mastra/server.js"]`.
3. Both files have an unchanged `learning-loop-mcp` entry.

This is a static-config test (not a runtime test) — fast, deterministic, no spawn.

## Related Code Files

- **Create (1):**
  - `tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js` (~30 lines, static-config check)
- **Modify (2):**
  - `.mcp.json` — add `learning-loop-mastra` peer entry
  - `.factory/mcp.json` — add `learning-loop-mastra` peer entry (mirror)

## Implementation Steps

**Step 1 — Write the static-config test (TDD, ~15 min)**

1. Create `tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js`:
   ```js
   import { test } from "node:test";
   import assert from "node:assert/strict";
   import { readFileSync } from "node:fs";
   import { join, resolve } from "node:path";
   import { fileURLToPath } from "node:url";

   const __dirname = fileURLToPath(new URL(".", import.meta.url));
   const projectRoot = resolve(__dirname, "..", "..", "..");

   for (const file of [".mcp.json", ".factory/mcp.json"]) {
     test(`${file} has 2 mcpServers entries (legacy + mastra peer)`, () => {
       const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
       assert.equal(Object.keys(config.mcpServers).length, 2);
       assert(config.mcpServers["learning-loop-mcp"], `${file}: legacy entry missing`);
       assert(config.mcpServers["learning-loop-mastra"], `${file}: mastra peer entry missing`);
     });

     test(`${file} legacy entry is unchanged`, () => {
       const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
       assert.deepEqual(config.mcpServers["learning-loop-mcp"], {
         command: "node",
         args: ["tools/learning-loop-mcp/server.js"],
       });
     });

     test(`${file} mastra peer entry points at tools/learning-loop-mastra/server.js`, () => {
       const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
       assert.deepEqual(config.mcpServers["learning-loop-mastra"], {
         command: "node",
         args: ["tools/learning-loop-mastra/server.js"],
       });
     });
   }
   ```
2. Run `node --test tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js` — expect 6/6 RED initially (config files not yet updated).

**Step 2 — Update `.mcp.json` + `.factory/mcp.json` (~5 min)**

1. Edit `.mcp.json` to add the `learning-loop-mastra` entry.
2. Edit `.factory/mcp.json` to mirror (identical content).
3. Re-run the test — expect 6/6 GREEN.
4. Run `pnpm test` — expect 49 + 6 = 55 pass in namespace 10; 9 legacy still pass.

**Step 3 — Manual smoke test (optional but recommended, ~10 min)**

Verify both servers boot in parallel by spawning them in two terminals and sending `tools/list` to each:

1. Terminal 1: `node tools/learning-loop-mcp/server.js`
2. Terminal 2: `node tools/learning-loop-mastra/server.js`
3. Send `initialize` + `tools/list` to each (can use a small node script or `mcp-cli` if available).
4. Verify:
   - Terminal 1 returns 40 tool names (legacy `*`).
   - Terminal 2 returns 29 tool names (all `mastra_*`).
   - No duplicate names between the two responses.

If MCP client-side namespacing turns out to be `<server>__<tool>` (per research §4 option 3, confidence 30%), the manual smoke test surfaces it and Plan 1 adjusts the `mastra_` prefix policy.

**Step 4 — Commit (~5 min)**
1. `git add .mcp.json .factory/mcp.json tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js`
2. Commit message: `feat(mcp): add learning-loop-mastra peer entry to .mcp.json + .factory/mcp.json (Phase C Plan 1 Phase 3 / C3)`.
3. Push branch.

## Success Criteria

- [ ] `.mcp.json` and `.factory/mcp.json` each have 2 `mcpServers` entries (legacy + mastra).
- [ ] Legacy entry is byte-identical to the pre-Phase-3 content.
- [ ] Mastra peer entry uses `{ command: "node", args: ["tools/learning-loop-mastra/server.js"] }`.
- [ ] 6 static-config tests pass in namespace 10.
- [ ] 9 legacy namespaces still pass.
- [ ] Total namespace 10 = 49 (Phase 2) + 6 (C3) = 55 pass.
- [ ] (Optional) Manual smoke test confirms both servers boot in parallel with no tool-name collisions.
- [ ] Commit on branch; no PR opened yet.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP client-side namespacing is `<server>__<tool>`, making the `mastra_` prefix redundant | low | Manual smoke test surfaces this; if confirmed, Plan 3 (cut-over) drops the prefix. |
| Both servers boot but conflict on stdio file descriptors or env vars | low | Each server has its own stdio child process; no shared state. |
| The runtime hooks fire on the legacy server only (per `research-260611-2216` §3.9); agents calling `mastra_*` tools bypass the constraint gate | medium | **Documented as known operational gap (per F4 in `reports/from-code-reviewer-to-planner-phase-c-plan-1-red-team-report.md`; operator decision 2026-06-16: "Ship peer + document gap").** The mastra server is reachable via stdio for all 29 `mastra_*` tools; write-side tools (`mastra_runtime_state_record`, `mastra_meta_state_log_change`, `mastra_meta_state_patch`, etc.) do NOT consult the legacy gate layer. The PR commit message + journal entry MUST document this gap. The agent SHOULD call legacy `*` tools for write operations; `mastra_*` tools are for parity testing only in Plan 1. Plan 3 (C6 cut-over) decides whether the mastra server becomes primary and the hook layer gets re-implemented. |
| `.factory/mcp.json` drift from `.mcp.json` | low | The static-config test asserts both files have the same content. If drift happens, the test fails. |

## Next Steps

- **After Phase 3:** Phase 4 (Plan 1 acceptance gate) starts. The full `pnpm test` runs, the master tracker is updated, a meta-state `change-log` is filed, and the single stacked PR is opened.
- **Operator checkpoint:** at Phase 3 commit, the peer config is live. The agent can now call `mastra_*` tools as an alternative path. **The legacy `*` tools remain primary.** **The PR commit message for Phase 3 MUST include a "Security note" line documenting the gate-bypass gap** (per F4 operator decision 2026-06-16: "Ship peer + document gap"). Example:
  > `Security note: the learning-loop-mastra peer is reachable via stdio for all 29 mastra_* tools. Write-side tools (mastra_runtime_state_record, mastra_meta_state_log_change, etc.) do NOT consult the legacy gate layer. Agents should call legacy * tools for write operations. Plan 3 (C6) decides cut-over.`

- **F4 follow-up (journal):** file a `meta_state_report` finding noting the gate-bypass gap as a known operational risk tracked under Plan 3. The finding should reference `rule-runtime-agnostic-features` (active consult-rule) and the `mcp-protocol-e2e-test` pattern.
