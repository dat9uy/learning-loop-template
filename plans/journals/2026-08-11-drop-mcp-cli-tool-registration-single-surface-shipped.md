---
title: Drop MCP CLI tool registration — single surface shipped
date: 2026-08-11
summary: MCP registers only the 8-tool residue; CLI is the single record surface; records-via-cli flags retired; wire budget re-anchored to residue
---

# Drop MCP CLI tool registration — single surface shipped

## What happened

Shipped plan 260811-1151 (PR #142): paid down the MCP/CLI dual-registration debt. The MCP server previously retained a flag-gated loop registering all 42 CLI_TOOLS when LOOP_RECORDS_VIA_CLI was unset; production always set the flag, so the MCP wire-budget guard measured a test-only 44-tool / ~55KB surface that caused two consecutive budget bumps.

The change:
- **MCP server** (`mastra/server.js`): one unconditional `CLI_TOOLS.has(...)` skip; `listTools` returns exactly the 8-tool residue in every config.
- **Session-start hook**: transport banner fires unconditionally (no flag reads), still carrying write-tool sketches, `--args-file`, pinned `LOOP_SURFACE`.
- **Flags retired**: `LOOP_RECORDS_VIA_CLI` / `LOOP_READS_VIA_CLI` removed from server, hook, 3 runtime configs, tests, and evergreen docs.
- **Wire-budget guard**: re-anchored to `<= 6,000` all-tools bytes (measured 4,563), reproducible via `__tests__/helpers/measure-residue.mjs`.
- **Parity re-based**: cli-read/write-parity moved from MCP-flag=0 oracle to direct-handler imports.
- **~12 tests migrated** from MCP callTool on CLI tools to `bin/loop.mjs` subprocess or direct handlers.
- **Counts corrected**: 42 CLI / 44 handler manifest / 5 classified residue / 8 live MCP / 50 agent declaration.

## Decision

Kept separate, non-conflated surface contracts (CLI allowlist, handler manifest, classified residue, live MCP, agent declaration). Preserved bounded MCP schema/transport coverage (mcp-tools-list-parity, residue protocol tests). Accepted risk: retiring LOOP_READS_VIA_CLI removes the documented intermediate transport — no runtime used it; reversible only via the documented rollback order (restore config flags first).

## Verification

- Full suite green: 326 files / 3417 passed / 4 skipped.
- Live residue measured 8 tools / 4,563 bytes vs 6,000 ceiling.
- CI: fallow + refs-check + test all pass; `mergeStateStatus == CLEAN`.
- Finding `meta-260811T1106Z-mcp-and-cli-surfaces-run-duplicated-tool-registrations-every` resolved with PR pointer.
- Code review: DONE_WITH_CONCERNS → all 4 findings (2 medium doc, 2 low comment) fixed; fallow unused-file finding resolved by consuming measure-residue.mjs in the wire-budget test + baselining the committed test helpers (probe-helpers.cjs precedent).

## Next steps

- None blocking. Future residue growth pays down schema debt rather than raising the 6,000-byte ceiling silently.
- A future runtime wanting MCP-side record transport must re-add registration (reversible via the documented rollback order).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
