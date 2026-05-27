# Brainstorm Report: Validation MCP Centralization

## Problem Statement

The `fixtures/` directory at repo root contains ~30 negative test fixtures consumed only by `tools/validate-records/validate-records.js` (CLI). The MCP `index_validate` tool validates real records but does not run negative fixtures. The user wants the MCP server to own all validation — CRUD and validation are both MCP concerns — and asks whether the standalone CLI should be deleted.

## Requirements

| # | Requirement |
|---|-------------|
| 1 | MCP `index_validate` must run negative fixture validation, not just real records |
| 2 | `pnpm validate:records` (CLI) must continue working, ideally delegating to MCP |
| 3 | `pnpm check` must stay green after migration |
| 4 | Delete `tools/validate-records/` entirely — logic moves into MCP core |
| 5 | Move `fixtures/` into `tools/learning-loop-mcp/fixtures/` for self-containment |

## Approaches Evaluated

### A — MCP Owns Validation, CLI Delegates to MCP (Recommended)

Move all validation logic (record loader, schema loader, negative fixture runner, claim verification rules, filename convention checks) into `tools/learning-loop-mcp/core/`. `validate-records.js` becomes a thin stdio client that spawns the MCP server, calls `index_validate` with `include_negative_fixtures: true`, and exits with the server's result.

**Pros:**
- Single source of truth. CLI and MCP can never diverge.
- Aligns with MCP-first philosophy: validation is a downstream CRUD concern.
- `pnpm check` still works — just re-routes through MCP.
- `fixtures/` lives inside MCP directory, establishing clear ownership.
- Deleted `tools/validate-records/` reduces surface area by ~10 files.

**Cons:**
- CLI validation gains ~200ms cold-start per invocation (MCP server spawn).
- Requires wiring a stdio client in the old CLI entry point.
- Risk: negative fixture paths change, so `runNegativeFixtures` must resolve relative to the new location.

### B — Shared Core Module, Both CLI and MCP Call It

Extract a `tools/learning-loop-mcp/core/validation-suite.js` that both `validate-records.js` and `index_validate` import. Keep `fixtures/` at root or move into MCP.

**Pros:**
- Works even if MCP server is not running.
- Shared code prevents drift.
- Lower-risk incremental change.

**Cons:**
- Two entry points remain. Validation "lives" outside MCP and is "used by" MCP.
- Does not answer the user's core question: should the standalone CLI exist at all?
- `fixtures/` at root still feels orphaned.

### C — Minimal: Add Negative Fixtures to MCP, Leave CLI Alone

Add `include_negative_fixtures` param to `index_validate` MCP tool. Leave `validate-records.js` and `fixtures/` untouched.

**Pros:**
- Zero risk, backward compatible.
- Quick win.

**Cons:**
- Technical debt preserved forever.
- Two validation paths with no convergence plan.
- `fixtures/` remains at root without clear ownership.

## Final Recommended Solution: Approach A

MCP owns validation. All validation modules move from `tools/validate-records/` into `tools/learning-loop-mcp/core/`. `fixtures/` moves to `tools/learning-loop-mcp/fixtures/`.

### Architecture After Migration

```
tools/learning-loop-mcp/
  core/
    record-loader.js          (was tools/validate-records/)
    schema-loader.js
    record-validation-rules.js
    derived-claim-assurance.js
    filename-convention-validation.js
    yaml-parse-wrapper.js
    negative-fixture-runner.js   (extracted from validate-records.js)
  fixtures/
    negative/                    (was fixtures/negative/)
    capability-source-allowlist-valid/  (was fixtures/capability-source-allowlist-valid/)
  tools/
    validate-records-tool.js     (index_validate — now calls core modules)
```

`tools/validate-records/` is deleted. A new thin CLI shim at `tools/validate-records-cli.js` (or `scripts/validate-records.js`) spawns the MCP server, calls `index_validate`, and exits with matching code.

### CLI Shim Behavior

```js
// tools/validate-records-cli.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["tools/learning-loop-mcp/server.js"],
});

const client = new Client({ name: "validate-cli", version: "0.1.0" });
await client.connect(transport);

const result = await client.callTool("index_validate", {
  allow_disallowed_fixtures: process.argv.includes("--allow-disallowed-fixtures"),
  include_negative_fixtures: true,
});

console.log(result.content[0].text);
process.exit(result.isError ? 1 : 0);
```

`package.json` script `validate:records` points to `node tools/validate-records-cli.js`.

### Negative Fixture Runner Integration

`index_validate` handler loads real records from `records/` (existing behavior) then, when `include_negative_fixtures: true`, calls `runNegativeFixtures(root, allow_disallowed_fixtures)` from `core/negative-fixture-runner.js`. The fixture root resolves to `join(root, "tools/learning-loop-mcp/fixtures/negative")`.

## Rationale

- **Philosophy:** The MCP server is the system's "brain." CRUD and validation are both reasoning steps the brain performs. The CLI is a peripheral — it should ask the brain, not think independently.
- **Maintenance:** One module to change when schemas evolve. No risk of CLI and MCP disagreeing on whether a record is valid.
- **Ownership:** `fixtures/` inside `tools/learning-loop-mcp/` makes it obvious who maintains them.
- **Deletion vs Deprecation:** Deleting `tools/validate-records/` is safe because all its logic is pure-functions with no state. Recovery from git is trivial if needed.

## Implementation Considerations

| Step | Action |
|------|--------|
| 1 | Move all `tools/validate-records/*.js` into `tools/learning-loop-mcp/core/` |
| 2 | Update imports in moved files: `../lib/resolve-root.js` becomes `#lib/resolve-root.js`, etc. |
| 3 | Move `fixtures/` to `tools/learning-loop-mcp/fixtures/` |
| 4 | Extract `runNegativeFixtures` into `core/negative-fixture-runner.js` |
| 5 | Update `index_validate` handler to call `runNegativeFixtures` when `include_negative_fixtures: true` |
| 6 | Create `tools/validate-records-cli.js` thin shim |
| 7 | Update `package.json` script `validate:records` to point to shim |
| 8 | Update `pnpm check` pipeline to use new path |
| 9 | Run `pnpm check` — all green |
| 10 | Delete `tools/validate-records/` directory |
| 11 | Update any hardcoded fixture paths in docs, plans, or tests |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fixture path resolution breaks | High | `runNegativeFixtures` resolves fixtures relative to `__dirname` (core dir), not cwd. Test on both CI and local. |
| MCP server spawn overhead in CI | Low | ~200ms cold start; negligible compared to validation itself. If objectionable, keep server warm. |
| `pnpm check` references old path | Medium | Audit `package.json` scripts and any plan docs. Update all in one commit. |
| Plans/docs mention deleted `tools/validate-records/` | Low | Historical plans stay as-is; active docs (README, operator-guide) update. |
| AJV schema loading from new path | Medium | `schema-loader.js` uses `join(root, "schemas")`. Root is still repo root. No change needed. |

## Success Metrics

- `pnpm validate:records` exits 0 with record count printed.
- `pnpm validate:records --allow-disallowed-fixtures` exits 0.
- `pnpm check` exits 0 (includes capabilities dry-run, records validation, plan-loop validation, tests).
- MCP `index_validate` with `include_negative_fixtures: true` returns same errors as old CLI.
- `tools/validate-records/` directory does not exist.
- `fixtures/` at repo root does not exist.

## Next Steps

1. Create implementation plan via `/ck:plan`.
2. Move files in a single commit.
3. Validate with `pnpm check`.
4. Journal the change.
