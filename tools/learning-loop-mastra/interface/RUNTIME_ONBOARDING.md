<!-- level: L3 | surface: implementation -->

# Runtime Onboarding — MCP-Transport Onboarding (1 of N transports)

How to add a new agent runtime that integrates with the learning loop on the MCP+hooks transport. The transport-agnostic participation contract lives at `docs/runtime-contract.md`; this guide is the MCP-transport onboarding path — one of N transports. Read end-to-end before starting. Use the checklist at each step. The worked example at the end (Mastra Code) is the canonical reference.

## When to onboard a new runtime

You need this when:
- You're adding a new agent CLI/IDE that should run learning-loop prompts.
- You're migrating from `.claude/` or `.factory/` to your own runtime dir.
- The 2 existing runtimes (Claude Code, Droid CLI) don't fit your environment.

You do NOT need this if:
- You're just running prompts — use one of the existing runtimes.
- You're writing a new MCP tool — that's a Core/Mastra shell change, not runtime integration.

## The 5 requirements (checklist)

A runtime MUST satisfy all 5. Validate with `node tools/learning-loop-mastra/interface/contract.js <your-runtime-id>`.

- [ ] **1. Hook shim set.** Create `<your-runtime>/coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs`. Each shim is a thin wrapper that `execFileSync`s the matching universal script in `tools/learning-loop-mastra/hooks/legacy/`. See `.claude/coordination/hooks/*.cjs` for the canonical 4-file shape.
- [ ] **2. MCP client config.** Register `learning-loop` in your runtime's MCP config: `mcpServers.learning-loop = { command: "node", args: ["tools/learning-loop-mastra/mastra/server.js"] }`. See `.factory/mcp.json` for the canonical shape (Droid stores MCP in `.factory/mcp.json`; Claude stores it at the root `.mcp.json`).
- [ ] **3. Skill spec.** Provide `<your-runtime>/skills/<skill-name>/SKILL.md` for every loop-maintained skill. The SKILL.md MUST declare `maturity:` frontmatter (one of `state-1`, `state-2`, `state-3`) to be enumerated as loop-maintained. `learning-loop` MUST additionally reference `loop_describe` AND `meta_state_list` (it documents the loop's tool surface). Skills must be mirrored across ≥ 2 of the 3 runtime surfaces. Template: `.factory/skills/learning-loop/SKILL.md` (post-Phase-2). Skill files are gated artifacts — direct writes require the `.loop-preflight-skills` preflight marker.
- [ ] **4. Identity marker (PROPOSED).** Set `RUNTIME_ID=<your-runtime-id>` in your runtime's session env. The validator returns `notes: ["identity-marker-not-adopted"]` when unset (advisory; not yet required). Future hardening plan will make this mandatory for R2 write-gate ownership.
- [ ] **5. Settings integration.** Wire your runtime's hook system to invoke the 4 shims at the right lifecycle points (SessionStart, UserPromptSubmit, PreToolUse). See `.factory/settings.json` for the canonical shape (Droid uses `Execute` matcher; Claude Code uses `Bash`).

After creating the 5 things, also:
- [ ] Add your runtime ID to the `RUNTIMES` const in `tools/learning-loop-mastra/interface/contract.js` (one entry).
- [ ] Append your surface to `SURFACES` in `tools/learning-loop-mastra/core/surfaces.js` (one line).

## Validator invocation

```bash
# From project root
node tools/learning-loop-mastra/interface/contract.js <your-runtime-id>

# Output (success):
# {"ok":true,"runtimeId":"...","missing":[],"notes":["identity-marker-not-adopted"],"path_map":{...}}

# Output (failure):
# {"ok":false,"runtimeId":"...","missing":["hook-shim-set","settings-integration"],"notes":[],"path_map":{...}}
```

Exit codes: `0` = all hard requirements pass; `1` = at least one requirement fails.

If the validator is missing or buggy, the contract is the source of truth: read `interface/CONTRACT.md` and self-audit.

## Worked example: Mastra Code

Reference: `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`; `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md`; npm package `mastracode`.

**Target:** `.mastracode/` (new runtime dir at project root). Mastra Code uses **declarative JSON config** — NOT shim files.

1. **Create `.mastracode/mcp.json`** — MCP server registration:
   ```json
   {
     "mcpServers": {
       "learning-loop": {
         "command": "node",
         "args": ["tools/learning-loop-mastra/mastra/server.js"]
       }
     }
   }
   ```
   Satisfies Req #2 (`mcp-client-config`). Resolves contract path `.mastracode/mcp.json` (NOT `.mastracode/config.json`; that was a pre-Plan-4 bug).

2. **Create `.mastracode/hooks.json`** — declarative lifecycle hooks. Must contain `PreToolUse`, `UserPromptSubmit`, and `SessionStart` entries whose `command` fields reference the canonical universal-hook paths under `tools/learning-loop-mastra/hooks/legacy/`:
   - `bash-gate.js` (PreToolUse, matcher `tool_name: "execute_command"`)
   - `write-gate.js` (PreToolUse, matcher `tool_name: "write_file" | "string_replace_lsp" | "delete_file"`)
   - `inbound-gate.js` (UserPromptSubmit, no matcher)
   - `recurrence-check-on-start.js` (SessionStart, no matcher)

   Full shape:
   ```json
   {
     "PreToolUse": [
       { "type": "command", "command": "node tools/learning-loop-mastra/hooks/legacy/bash-gate.js", "matcher": { "tool_name": "execute_command" }, "timeout": 5000 },
       { "type": "command", "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js", "matcher": { "tool_name": "write_file" }, "timeout": 5000 },
       { "type": "command", "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js", "matcher": { "tool_name": "string_replace_lsp" }, "timeout": 5000 },
       { "type": "command", "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js", "matcher": { "tool_name": "delete_file" }, "timeout": 5000 }
     ],
     "UserPromptSubmit": [
       { "type": "command", "command": "node tools/learning-loop-mastra/hooks/legacy/inbound-gate.js", "timeout": 5000 }
     ],
     "SessionStart": [
       { "type": "command", "command": "node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js", "timeout": 10000 }
     ]
   }
   ```

   Satisfies Req #5 (`settings-integration`) AND Req #6 (`hook-declarative-config`). Mastra Code uses declarative JSON hooks, NOT shim files — the biggest departure from Claude Code/Droid CLI (which use per-runtime shim files in `<surface>/coordination/hooks/`). Mastra Code's built-in tool names (discovered live via probe): `execute_command`, `write_file`, `string_replace_lsp`, `delete_file`, `view`, `find_files`.

3. **Create `.mastracode/settings.json`** — minimal settings:
   ```json
   {
     "shellPassthrough": false,
     "omScope": "project"
   }
   ```
   `shellPassthrough: false` is REQUIRED (Req #7 — settings-no-bypass). Setting it to `true` would bypass the bash-gate entirely.

4. **Create `.mastracode/database.json`** — runtime resource identity:
   ```json
   { "resourceId": "mastra-code" }
   ```
   Alternative (or complementary) to `process.env.MASTRA_RESOURCE_ID="mastra-code"`.

5. **Skill spec** — copy `.factory/skills/learning-loop/SKILL.md` to either `.mastracode/skills/learning-loop/SKILL.md` OR `.claude/skills/learning-loop/SKILL.md` (Mastra Code's auto-discovery includes the Claude-compat path; the existing file satisfies Req #3 without duplication).

6. **Wire Mastra Code** — no programmatic wiring required for Plan 4 (MCP-only integration). When `createMastraCode({ cwd: projectRoot })` is called (or `pnpm smoke:mastracode` is invoked), the McpManager discovers `.mastracode/mcp.json` automatically and connects to the loop's MCP server. Discovery priority: `.claude/settings.local.json` > `~/.mastracode/mcp.json` > `<root>/.mastracode/mcp.json` > `<project>/.mastracode/mcp.json`.

7. **Run the validator.** `node tools/learning-loop-mastra/interface/contract.js mastra-code`. Expect `{ok: true, missing: [], notes: [...]}` (notes may include `identity-marker-not-adopted` if `MASTRA_RESOURCE_ID` is unset, and `skill-spec-no-tools-block` if the SKILL.md uses prose rather than a `tools:` block).

8. **Smoke test.** `pnpm smoke:mastracode`. Exit 0; stdout JSON contains `ok: true`, `mcp_servers[0].connected === true` (learning-loop server, stdio transport), `mcp_tool_names.length === 44`, `roundtrip.ok === true` (`learning-loop_mastra_loop_describe` invoked successfully), and `wire_format_probe.exit_code === 0` (universal bash-gate parses the Mastra-Code-shaped payload).

   **Tool namespacing** (MCP tools from the loop's server are auto-namespaced `<serverName>_<toolName>` by Mastra Code's McpManager, verified live at `mastracode@0.26.0`):

   | Pattern | Example | Count |
   |---|---|---|
   | `learning-loop_mastra_<tool>` | `learning-loop_mastra_loop_describe` | 30 |
   | `learning-loop_ask_<agent>` | `learning-loop_ask_intake_agent` | 3 |
   | `learning-loop_run_workflow_<workflow>` | `learning-loop_run_workflow_classify_prompt` | 11 |

   **Total:** 44 tools exposed via MCP.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `hook-shim-set` failing | Shim missing or wrong basename | Each shim must exist with the exact `-gate.cjs` / `-check.cjs` basename in `<surface>/coordination/hooks/` |
| `mcp-client-config` failing | `learning-loop` key missing under `mcpServers`, or wrong `args` path | Some runtimes use `mcp_servers` (snake-case); the validator checks `mcpServers` (camelCase). Ensure `args` ends with `tools/learning-loop-mastra/mastra/server.js` |
| `hook-declarative-config` failing (Mastra Code) | `hooks.json` malformed or missing event entries | Validate JSON; ensure `PreToolUse`, `UserPromptSubmit`, `SessionStart` all present |
| `settings-no-bypass` failing (Mastra Code) | `shellPassthrough: true` in `.mastracode/settings.json` | Set to `false` |
| `skill-spec` failing | `SKILL.md` not found, or does not reference `loop_describe` AND `meta_state_list` | Copy `.factory/skills/learning-loop/SKILL.md` to `<surface>/skills/learning-loop/`; write the contract section, do not leave it blank |
| `settings-integration` failing on bad JSON | Settings file does not parse | Run `node -e "JSON.parse(require('fs').readFileSync('<your-settings-file>'))"` to confirm; fix the JSON |
| Tools not loading (Mastra Code) | MCP server not starting | Run `node tools/learning-loop-mastra/mastra/server.js` directly to check for errors |
| LibSQL lock conflict (Mastra Code) | Both Mastra Code and loop write to same DB | Configure `.mastracode/database.json` with a sibling path |
| `identity-marker-not-adopted` in notes | `MASTRA_RESOURCE_ID` / `RUNTIME_ID` not set | Advisory only; set via `.mastracode/database.json` or env var |

## Cross-references

- `docs/runtime-contract.md` — the transport-agnostic runtime participation contract (the concept; this guide is its MCP-transport realization).
- `interface/CONTRACT.md` — the MCP-transport conformance checklist (authoritative).
- `interface/contract.js` — the validator (single source of truth for "is X met").
- `AGENTS.md` §1.1 — the 3-layer architecture (where the runtime interface lives).
- `docs/architecture.md` gate-flow section — the per-runtime hook wiring pattern (gate-event flow).
- `.claude/coordination/hooks/README.md` — the existing per-runtime docs pattern.
