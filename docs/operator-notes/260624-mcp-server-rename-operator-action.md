# MCP Server Rename — Operator Action Required

**Date:** 2026-06-24
**Plan:** `plans/260624-1111-phase-d-plan-4-cutover/phase-08-json-key-rename-r4.md`
**R4 deferred item:** closeout

The MCP server key was renamed from `learning-loop-mastra` to `learning-loop` in
Plan 4 phase-08. The repo's `.mcp.json`, `.factory/mcp.json`, and
`.claude/settings.local.json` were updated.

## What the operator must do

After Plan 4 merges to main, the operator must update the per-machine state
files (these are NOT in the repo):

### Droid state

- Droid CLI maintains an internal state file that references the MCP server
  key. The operator must update this state to use the new key `learning-loop`.
- Reference: `~/.factory/...` (per-machine; consult Droid docs for the exact
  path)
- Action: restart Droid; the new key will be picked up from `.factory/mcp.json`
  on the next cold session.

### Claude Code state

- Claude Code maintains a per-machine state file (e.g., `~/.claude.json` or
  similar). The operator must update this state to use the new key
  `learning-loop`.
- Action: restart Claude Code; the new key will be picked up from `.mcp.json`
  on the next cold session.

## What is NOT in the operator's scope

- The MCP server entry path (`tools/learning-loop-mastra/server.js`) is
  unchanged. The directory is still `tools/learning-loop-mastra/`.
- The MCP tool names (e.g., `mastra_meta_state_log_change`, `ask_intake_agent`)
  are unchanged. The `mastra_` prefix and `ask_` prefix are tool-name
  conventions, not server-name conventions.
- The `meta-state.jsonl` audit log is unchanged (historical references to
  `learning-loop-mastra` are immutable per the loop's append-only audit log).

## Verification

After the operator updates their per-machine state, run:

```bash
# From the repo root
pnpm test:cold-session
# Expected: 11/11 GREEN
```

If the cold-session test fails, check that the operator's state files reference
`learning-loop` (not `learning-loop-mastra`).

## Related Plan 4 follow-up

The test runner (`tools/scripts/run-pnpm-test-namespaced.mjs`) currently has 5
dead mcp-* globs that report 0 tests (the directories were moved to
`tools/learning-loop-mastra/{__tests__,core,tools}/legacy/` but the runner was
not repointed). The legacy `__tests__/legacy-mcp/` test files (110 files) have
stale relative imports that break at runtime. A follow-up plan is needed to
migrate those imports. See `docs/journals/260624-phase-d-plan-4-cutover-shipped.md`
for the deferred work tracker.
