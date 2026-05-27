---
phase: 4
title: "Create CLI Shim and Delete Old CLI"
status: pending
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: Create CLI Shim and Delete Old CLI

## Overview

Create `tools/validate-records-cli.js` — a thin stdio client that spawns the MCP server and calls `index_validate`. Update `package.json` script `validate:records` to point to it. Delete `tools/validate-records/` directory. Verify `pnpm check` still passes.

## Related Code Files

- Create: `tools/validate-records-cli.js`
- Modify: `package.json` (update `validate:records` script)
- Delete: `tools/validate-records/` (entire directory)

## Implementation Steps

1. Create `tools/validate-records-cli.js`:
   ```js
   #!/usr/bin/env node
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
   import { fileURLToPath } from "node:url";
   import { dirname, join } from "node:path";

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const SERVER = join(__dirname, "learning-loop-mcp", "server.js");

   const allowDisallowed = process.argv.includes("--allow-disallowed-fixtures");

   async function main() {
     const transport = new StdioClientTransport({
       command: "node",
       args: [SERVER],
     });
     const client = new Client({ name: "validate-cli", version: "0.1.0" });
     await client.connect(transport);

     const result = await client.callTool("index_validate", {
       allow_disallowed_fixtures: allowDisallowed,
       include_negative_fixtures: true,
     });

     const text = result.content[0].text;
     const parsed = JSON.parse(text);

     console.log(text);
     process.exit(parsed.valid ? 0 : 1);
   }

   main().catch((err) => {
     console.error("MCP client error:", err.message);
     process.exit(1);
   });
   ```
2. Update `package.json`:
   ```json
   "validate:records": "node tools/validate-records-cli.js"
   ```
   Remove `--allow-disallowed-fixtures` from the script — the flag is passed through argv naturally.
3. Make shim executable: `chmod +x tools/validate-records-cli.js`.
4. Delete `tools/validate-records/` directory:
   ```bash
   rm -rf tools/validate-records/
   ```
5. Audit for remaining references to `tools/validate-records/`:
   ```bash
   rg "tools/validate-records" --type js --type json --type md .
   ```
   Update any docs, plans, or scripts.
6. Run `pnpm validate:records` — should spawn MCP, validate, and exit 0.
7. Run `pnpm validate:records --allow-disallowed-fixtures` — same, with flag forwarded.
8. Run `pnpm check` — full pipeline must pass.
9. Commit.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `@modelcontextprotocol/sdk` import fails | High | Already a dependency in `package.json` |
| MCP server spawn hangs in CI | Medium | Set `timeout: 15000` in shim; CI can handle it |
| `package.json` scripts still reference old path | High | Audit scripts before commit |

## Success Criteria

- [ ] `tools/validate-records-cli.js` exists and is executable.
- [ ] `pnpm validate:records` exits 0.
- [ ] `pnpm validate:records --allow-disallowed-fixtures` exits 0.
- [ ] `tools/validate-records/` does not exist.
- [ ] `rg "tools/validate-records"` returns zero matches in active code.
