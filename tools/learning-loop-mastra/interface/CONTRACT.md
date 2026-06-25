# Runtime Interface Contract

The 5 requirements that an agent runtime MUST satisfy to integrate with the learning loop. The validator (`contract.js`) enforces this contract.

## Requirements

### 1. `hook-shim-set`

The runtime MUST provide 4 hook shims in `<surface>/coordination/hooks/`:
- `bash-coordination-gate.cjs`
- `write-coordination-gate.cjs`
- `inbound-state-gate.cjs`
- `recurrence-check-on-start.cjs`

Each shim MUST delegate to a universal hook in `tools/learning-loop-mastra/hooks/legacy/` via `child_process.execFileSync('node', [<universal-hook-path>], ...)`. **Pass:** all 4 shims exist as files in `<surface>/coordination/hooks/`. **Note:** the contract does NOT require byte-identical shims across runtimes (verified: Claude Code and Droid CLI shims differ in content but both delegate to the same universal hooks). The validator additionally reports each shim's `universal_target` (the path it delegates to) in `path_map` for documentation, but does NOT fail when the target is absent — universal hook wiring is git-tracked and not runtime-mutable (red-team Finding F1: real shims pass `[universalHook]` as a `path.join` result, not as a string literal; a regex-based check would silently fail for both runtimes).

### 2. `mcp-client-config`

The runtime MUST register the loop's MCP server in its MCP config:
- `mcpServers.learning-loop.command === "node"`
- `mcpServers.learning-loop.args` contains a string ending in `tools/learning-loop-mastra/mastra/server.js`.

**Pass:** entry present AND target matches. **Fail:** entry missing, wrong command, or wrong args. **Note:** Claude Code stores MCP config at the root `.mcp.json`; Droid CLI stores it at `.factory/mcp.json`; the validator resolves the path per runtime.

### 3. `skill-spec`

The runtime MUST provide `<surface>/skills/learning-loop/SKILL.md`. The file MUST reference `loop_describe` AND `meta_state_list` (in any section). **Pass:** file present AND both tool names referenced. **Note:** a structured `tools:` block is an upgrade target; prose references pass today.

### 4. `identity-marker` (PROPOSED, non-blocking)

The runtime SHOULD set `RUNTIME_ID=<runtimeId>` in its session env. **NEVER fails.** When unset: `notes: ["identity-marker-not-adopted"]`. When mismatched: `notes: ["identity-marker-mismatch"]`. The marker is the target convention from the bundled hardening plan (LIM-3 caller identity); existing runtimes do not yet set it.

### 5. `settings-integration`

The runtime MUST reference all 4 shim basenames via `command` strings in its settings file's hooks arrays. **Pass:** all 4 basenames referenced. **Fail:** any basenames missing.

## How to verify

```bash
node tools/learning-loop-mastra/interface/contract.js claude-code
node tools/learning-loop-mastra/interface/contract.js droid
node tools/learning-loop-mastra/interface/contract.js mastra-code
node tools/learning-loop-mastra/interface/contract.js --list
```

Exit codes: `0` = all hard requirements pass; `1` = at least one requirement fails; `2` = usage error (no runtime ID).

For `mastra-code` (no `.mastracode/` directory yet, Plan 4 ships the actual runtime), the validator returns `{ok: false, missing: ["hook-shim-set", "mcp-client-config", "skill-spec", "settings-integration"], notes: ["identity-marker-not-adopted"], path_map: {...}}` — exit 1. (4 hard fails; `identity-marker` is advisory and not in `missing[]` per Requirement #4.)

## Notes

- `RUNTIME_ID` is advisory today; the bundled hardening plan will make it mandatory for R2 write-gate ownership.
- The validator reads the runtime's filesystem layout; it does NOT execute hooks or call MCP. It is a pure read-only validator.
- Adding a new runtime requires amending the `RUNTIMES` const in `contract.js` (one entry) and appending the surface to `core/surfaces.js` (one line). See `RUNTIME_ONBOARDING.md`.
