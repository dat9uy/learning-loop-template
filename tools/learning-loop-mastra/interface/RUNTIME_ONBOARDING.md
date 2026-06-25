# Runtime Onboarding

How to add a new agent runtime that integrates with the learning loop. Read end-to-end before starting. Use the checklist at each step. The worked example at the end (Mastra Code) is the canonical reference.

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
- [ ] **3. Skill spec.** Provide `<your-runtime>/skills/learning-loop/SKILL.md` describing how to use the loop's MCP tools. The file MUST reference `loop_describe` AND `meta_state_list`. Template: `.factory/skills/learning-loop/SKILL.md` (post-E.0).
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

Reference: scope report lines 49, 124, 155; npm package `mastracode`.

**Target:** `.mastracode/` (new runtime dir at project root).

1. **Create the shim set.** Mirror the 4 files in `.claude/coordination/hooks/` to `.mastracode/coordination/hooks/`. Each shim must `execFileSync('node', [<universal-hook-path>], ...)` the matching universal script. No business logic in the shim.

2. **Register MCP client.** Add to `createMastraCode({ configDir: ".mastracode" })`: `mcpServers.learning-loop = { command: "node", args: ["tools/learning-loop-mastra/mastra/server.js"] }`. Verify by running `mcp_client_list` and checking `learning-loop` is registered.

3. **Copy the skill spec.** Copy `.factory/skills/learning-loop/SKILL.md` to `.mastracode/skills/learning-loop/SKILL.md`. No edits needed — the post-E.0 file is runtime-agnostic.

4. **Set the identity marker.** In your Mastra Code session config: `env: { RUNTIME_ID: "mastra-code" }`. Note: the runtime-id is `mastra-code` (with hyphen); the surface dir is `.mastracode` (without). If your config layout differs from what `RUNTIMES["mastra-code"]` declares in `interface/contract.js`, amend the const.

5. **Configure settings.** Wire Mastra Code's hook system to invoke the 4 shims at SessionStart / UserPromptSubmit / PreToolUse. Mastra Code's API differs from Claude Code's; consult `docs/agents/mastra-code.md` (to be written in E.5 / Plan 4).

6. **Run the validator.** `node tools/learning-loop-mastra/interface/contract.js mastra-code`. Expect `{ok: true, missing: [], notes: []}` (or `notes: ["identity-marker-not-adopted"]` if you skipped step 4).

7. **Smoke test.** From a Mastra Code session, run `mastra_loop_describe({tier: "warm"})`. Expect the 6-group manifest back. Then run `mastra_meta_state_list({entry_kind: "rule"})`. Expect ≥ 1 rule.

## Troubleshooting

- **`hook-shim-set` failing.** Each shim must exist with the exact basename pattern. Check the trailing `-gate.cjs` / `-check.cjs` extension.
- **`mcp-client-config` failing.** Your runtime's MCP config must have a `learning-loop` key under `mcpServers`. Some runtimes use `mcp_servers` (snake-case); the validator checks for `mcpServers` (camelCase).
- **`skill-spec` failing.** The file must exist AND reference `loop_describe` AND `meta_state_list`. A blank SKILL.md fails — write the contract section from the template at `.factory/skills/learning-loop/SKILL.md`.
- **`settings-integration` failing on bad JSON.** Run `node -e "JSON.parse(require('fs').readFileSync('<your-settings-file>'))"` to confirm. If it throws, fix the JSON.

## Cross-references

- `interface/CONTRACT.md` — the formal 5-requirement spec (authoritative).
- `interface/contract.js` — the validator (single source of truth for "is X met").
- `AGENTS.md` §1.1 — the 3-layer architecture (where the runtime interface lives).
- `AGENTS.md` §2 — hook matrix (the per-runtime implementation pattern).
- `.claude/coordination/hooks/README.md` — the existing per-runtime docs pattern.
