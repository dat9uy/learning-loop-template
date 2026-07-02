# Runtime Interface Contract

The 10 requirements that an agent runtime MUST satisfy to integrate with the learning loop. The validator (`contract.js`) enforces this contract.

## Requirements

### 1. `hook-shim-set`

The runtime MUST provide 4 hook shims in `<surface>/coordination/hooks/`:
- `bash-coordination-gate.cjs`
- `write-coordination-gate.cjs`
- `inbound-state-gate.cjs`
- `recurrence-check-on-start.cjs`

Each shim MUST delegate to a universal hook in `tools/learning-loop-mastra/hooks/legacy/` via `child_process.execFileSync('node', [<universal-hook-path>], ...)`. **Pass:** all 4 shims exist as files in `<surface>/coordination/hooks/`. **Note:** the contract does NOT require byte-identical shims across runtimes (verified: Claude Code and Droid CLI shims differ in content but both delegate to the same universal hooks). The validator additionally reports each shim's `universal_target` (the path it delegates to) in `path_map` for documentation, but does NOT fail when the target is absent — universal hook wiring is git-tracked and not runtime-mutable (red-team Finding F1: real shims pass `[universalHook]` as a `path.join` result, not as a string literal; a regex-based check would silently fail for both runtimes). **Applicability:** N/A for declarative-hook runtimes (use Req #6 instead); validator reports `applicable:false` for those runtimes.

### 2. `mcp-client-config`

The runtime MUST register the loop's MCP server in its MCP config:
- `mcpServers.learning-loop.command === "node"`
- `mcpServers.learning-loop.args` contains a string ending in `tools/learning-loop-mastra/mastra/server.js`.

**Pass:** entry present AND target matches. **Fail:** entry missing, wrong command, or wrong args. **Note:** Claude Code stores MCP config at the root `.mcp.json`; Droid CLI stores it at `.factory/mcp.json`; Mastra Code stores it at `.mastracode/mcp.json` (NOT `.mastracode/config.json`). The validator resolves the path per runtime.

### 3. `skill-spec`

The runtime MUST provide a SKILL.md describing how to use the loop's MCP tools. The file MUST reference `loop_describe` AND `meta_state_list` (in any section). **Pass:** file present AND both tool names referenced. **Note:** a structured `tools:` block is an upgrade target; prose references pass today.

**Discovery paths by runtime:**
- Claude Code: `.claude/skills/learning-loop/SKILL.md`
- Droid CLI: `.factory/skills/learning-loop/SKILL.md`
- Mastra Code: `.mastracode/skills/learning-loop/SKILL.md` OR (via Claude-compatible auto-discovery) `.claude/skills/learning-loop/SKILL.md`

### 4. `identity-marker` (PROPOSED, non-blocking)

The runtime SHOULD set its session env to one of `RUNTIME_ID=<runtimeId>` or `MASTRA_RESOURCE_ID=<runtimeId>`. **NEVER fails.** When unset: `notes: ["identity-marker-not-adopted"]`. When mismatched: `notes: ["identity-marker-mismatch"]`. The marker is the target convention from the bundled hardening plan (LIM-3 caller identity); existing runtimes do not yet set it. **Note (Phase E Plan 4):** `MASTRA_RESOURCE_ID` is an additive alternative for Mastra Code (accepted but spoofable until LIM-3 caller-identity ships in Plan 5). First match wins; both unset ⇒ advisory note only.

### 5. `settings-integration`

The runtime MUST reference all 4 universal-hook paths via `command` strings. **Pass:** all 4 referenced. **Fail:** any missing.

For shim-file runtimes (Claude Code, Droid CLI): the validator reads the runtime's `settings.json` `hooks` blocks and checks each `entry.hooks[].command` for the 4 shim basenames.

**Note (Phase E Plan 4):** For declarative-hook runtimes (Mastra Code), this requirement applies to the declarative config's `command` field, not to shim files. See Req #6 for the dedicated declarative-shape check.

### 6. `hook-declarative-config` (Phase E Plan 4 — additive for declarative-hook runtimes)

For runtimes using declarative hook configs (Mastra Code, future), the runtime MUST provide `<surface>/hooks.json` (or equivalent) containing:
- `PreToolUse`: at least one entry whose `command` references `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` (bash coordination gate); plus write/edit/delete entries referencing `tools/learning-loop-mastra/hooks/legacy/write-gate.js` for built-in write/edit/delete tool names (e.g., Mastra Code's `write_file`, `string_replace_lsp`, `delete_file`).
- `UserPromptSubmit`: at least one entry whose `command` references `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js`.
- `SessionStart`: at least one entry whose `command` references `tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js`.

**Pass:** JSON parses, all 3 required event entries present, AND every `command` references a known universal-hook path (no silent passes on bogus commands). **Fail:** malformed JSON, missing event entries, OR commands referencing paths that are not in the canonical universal-hook set (red-team Security F4). **Applicability:** declarative-hook runtimes only (e.g., Mastra Code). For shim-file runtimes, this requirement reports `applicable:false` and trivially passes.

### 7. `settings-no-bypass` (Phase E Plan 4 — additive for declarative-settings runtimes)

The runtime's declarative settings file (e.g., `.mastracode/settings.json`) MUST NOT enable any documented bypass for the loop's gates:
- `shellPassthrough: true` — bypasses the bash-gate hook entirely (hooks don't fire when commands are passed-through); rejected.
- `disableHooks: true` — disables all hooks; rejected.
- `disableMcp: true` — disables MCP server connections; rejected (the learning loop IS the MCP server).

**Pass:** no bypass fields enabled, AND settings JSON parses (malformed JSON in the settings file is treated as a bypass attempt — fail closed). **Fail:** any bypass field set to `true`. **Applicability:** declarative-settings runtimes only. For shim-file runtimes (Claude Code, Droid CLI), this requirement reports `applicable:false` and trivially passes.

### 9. `.mastracode-config-presence` (Plan 5-Lite Phase 3 — additive for Mastra Code)

For the `mastra-code` runtime, the `.mastracode/` directory MUST exist and contain all four config files: `mcp.json`, `hooks.json`, `settings.json`, `database.json`. **Pass:** directory exists AND all four files present. **Fail:** directory missing OR any of the four files missing. **Applicability:** `mastra-code` only. For shim-file runtimes (Claude Code, Droid CLI), this requirement reports `applicable:false` and trivially passes.

### 10. `mastracode-session-start-pins-loop-surface` (Plan 5-Lite Phase 3 — LOOP_SURFACE wiring via mcp.json env field)

The runtime's MCP config (`<surface>/mcp.json`) MUST set `env.LOOP_SURFACE` on the `learning-loop` server entry so the harness passes the surface to the spawned `server.js`, where `pinRuntimeIdAtBoot()` reads it at boot. For `mastra-code`: `mcpServers["learning-loop"].env.LOOP_SURFACE === ".mastracode"`. **Pass:** the env field is present and equals the runtime's surface. **Fail:** env field missing OR wrong value. **Applicability:** `mastra-code` only (the env-field wiring is the operator-chosen approach for all three runtimes, but the contract asserts it for Mastra Code to lock the third-runtime regression; the `.mcp.json` and `.factory/mcp.json` env fields are covered by `__tests__/mcp-config.test.js`). For non-mastra-code runtimes, this requirement reports `applicable:false` and trivially passes.

### 11. `tools-manifest-has-path-fields` (Plan 5-Lite Phase 3 — project-wide invariant)

Every entry in `tools/learning-loop-mastra/tools/manifest.json` MUST declare `pathFields: string[]` (may be `[]`). This is the boot-time invariant enforced by `mastra/server.js#validateToolManifest` (Phase 1 R3); surfaced here as a contract requirement so a manifest regression fails loudly in the contract validator, not only at server boot. The manifest is JSONC (full-line `//` comments only); the validator strips comments before parsing. **Pass:** every entry has a `pathFields` array. **Fail:** any entry missing `pathFields` OR `pathFields` is not an array. **Applicability:** ALL runtimes (project-wide invariant).

## How to verify

```bash
node tools/learning-loop-mastra/interface/contract.js claude-code
node tools/learning-loop-mastra/interface/contract.js droid
node tools/learning-loop-mastra/interface/contract.js mastra-code
node tools/learning-loop-mastra/interface/contract.js --list
```

Exit codes: `0` = all hard requirements pass; `1` = at least one requirement fails; `2` = usage error (no runtime ID).

For `mastra-code` on a properly configured repo (Phase E Plan 4 ships the `.mastracode/` config), the validator returns `{ok: true, missing: [], notes: [...], path_map: {...}}` — exit 0. If `MASTRA_RESOURCE_ID` is unset (advisory), `notes` includes `identity-marker-not-adopted`.

## Notes

- `RUNTIME_ID` / `MASTRA_RESOURCE_ID` are advisory today; the bundled hardening plan will make it mandatory for R2 write-gate ownership.
- The validator reads the runtime's filesystem layout; it does NOT execute hooks or call MCP. It is a pure read-only validator.
- Adding a new runtime requires amending the `RUNTIMES` const in `contract.js` (one entry) and appending the surface to `core/surfaces.js` (one line). See `RUNTIME_ONBOARDING.md`.
- Req #1 (`hook-shim-set`) is monomorphic on shim files; Req #6 (`hook-declarative-config`) is the parallel/alternative for declarative-hook runtimes. The validator sets `applicable:false` on the inapplicable check per runtime (not failing the contract for the wrong-shape runtime).
