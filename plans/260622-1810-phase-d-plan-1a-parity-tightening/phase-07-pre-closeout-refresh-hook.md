---
phase: 7
title: "Pre-Closeout Refresh Hook"
status: pending
effort: "~30min"
---

# Phase 7: Pre-Closeout Refresh Hook

## Overview

Add `tools/scripts/refresh-fingerprints-pre-closeout.mjs` + optional hook integration. The script calls `meta_state_query_drift`, refreshes each `hash_mismatch` finding's fingerprint via `meta_state_refresh_fingerprint`, then exits 0. Resolves `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` (status: active).

## Context Links

- `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` (active; Plan 1a Phase 7 resolves)
- `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` (drift surfaced during Plan 2 closeout; ad-hoc refresh was the workaround)
- `tools/learning-loop-mcp/core/meta-state-tools.js` (`meta_state_query_drift` + `meta_state_refresh_fingerprint` — already implemented; Phase 7 wires them into a script)
- `tools/learning-loop-mcp/hooks/bash-gate.js` (pre-commit hook pattern; Phase 7 mirrors for pre-closeout)

## Requirements

- **Functional:**
  - Create `tools/scripts/refresh-fingerprints-pre-closeout.mjs` that:
    1. Calls `meta_state_query_drift` (read-only; no `run_grounding` flag).
    2. For each entry with `drift_kind === "hash_mismatch"`, calls `meta_state_refresh_fingerprint({id})`.
    3. Logs refreshed entries to stderr (one line per id).
    4. Exits 0 (refresh success) or 1 (MCP server unreachable).
  - Add smoke test: spawn server, run script against test registry, assert refresh succeeded.
- **Non-functional:**
  - Script runs in <2s (query_drift is local file read + JSON parse).
  - No new dep (uses `mastra_meta_state_query_drift` + `mastra_meta_state_refresh_fingerprint` MCP tools via stdio).
  - **Optional hook integration** (out of scope for this phase): a `PreToolUse` hook entry in `.claude/settings.json` that auto-runs the script before `git commit`. Phase 7 ships the script + smoke test; the hook wiring is a Plan 3 follow-up (or operator discretion).

## Architecture

Standalone Node.js script that invokes 2 MCP tools via stdio. Mirrors the `with-mcp-server.js` spawn pattern.

## Related Code Files

- **Modify:** none (Phase 7 ships script + test; hook wiring is optional)
- **Create:** `tools/scripts/refresh-fingerprints-pre-closeout.mjs` (script)
- **Create:** `tools/learning-loop-mastra/__tests__/refresh-fingerprints-pre-closeout.test.cjs` (smoke test)
- **Delete:** none

## Implementation Steps

1. Read `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (spawn helper; reuse).
2. Create `refresh-fingerprints-pre-closeout.mjs`:
   ```js
   import { spawn } from "node:child_process";
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

   const server = spawn("node", ["tools/learning-loop-mastra/server.js"], { stdio: ["pipe", "pipe", "pipe"] });
   const transport = new StdioClientTransport({ reader: server.stdout, writer: server.stdin });
   const client = new Client({ name: "refresh-fingerprints", version: "1.0.0" }, { capabilities: {} });
   await client.connect(transport);

   const drift = await client.callTool("mastra_meta_state_query_drift", {});
   const entries = JSON.parse(drift.content[0].text).entries || [];
   const drifted = entries.filter((e) => e.drift_kind === "hash_mismatch");

   for (const entry of drifted) {
     await client.callTool("mastra_meta_state_refresh_fingerprint", { id: entry.id });
     console.error(`[refresh] ${entry.id}`);
   }

   await client.close();
   server.kill();
   process.exit(0);
   ```
3. Create smoke test `refresh-fingerprints-pre-closeout.test.cjs`:
   - Spawn a temp test registry with one drifted finding (set `code_fingerprint` to a wrong sha256).
   - Run script; assert `meta_state_check_grounding` returns `status: "refreshed"`.
   - Cleanup temp registry.
4. Run; expect smoke test passes.
5. Run full `pnpm test`; expect 1095 pass (1094 baseline + 1 new).

## Success Criteria

- [ ] `tools/scripts/refresh-fingerprints-pre-closeout.mjs` exists.
- [ ] Script reads drift via `meta_state_query_drift`, refreshes each `hash_mismatch` via `meta_state_refresh_fingerprint`, exits 0.
- [ ] Smoke test in `refresh-fingerprints-pre-closeout.test.cjs` proves refresh works against a temp registry.
- [ ] `pnpm test` exits 0 with 1095 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Script overwrites legitimate drift.** Risk: very low. `meta_state_refresh_fingerprint` only operates on `hash_mismatch` entries; `code_missing` (file gone) and other drift kinds are NOT refreshed (the MCP tool refuses). Operator reviews the latter via `meta_state_list({status: "active"})` post-script.
- **MCP server unreachable.** Risk: low. The script exits 1 (not 0) on connection failure; CI hook fails loudly. Mitigation: `OPERATOR_MODE=1` env var gates the script; CI does not run it without explicit opt-in.

## Security Considerations

- **MCP server stdio spawn.** Risk: low. The script spawns the canonical `tools/learning-loop-mastra/server.js` (no external network). All file operations are local.

## Next Steps

Phase 8: SessionStart Hint Injection (resolves Plan-B Layer-2 finding for Claude Code parity with Droid).