---
phase: 1
title: "Production code — registration + hook + comments"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Production code — registration + hook + comments

## Overview

Remove the flag-gated `CLI_TOOLS` registration loop from `mastra/server.js` (single
unconditional skip), retire the `LOOP_RECORDS_VIA_CLI` / `LOOP_READS_VIA_CLI` env handling
in the server, redesign the session-start transport hook to fire its banner unconditionally
(no flag read), and clean up stale flag comments in `core/cli-tools.js`, `bin/loop.mjs`, and
`core/placement.yaml` (including the dangerous "Rollback: `LOOP_RECORDS_VIA_CLI=0` restores
ALL tools to MCP" comment). The CLI (`bin/loop.mjs`) behavior is unchanged; only its header
comment is updated.

## Requirements

- Functional: MCP `listTools` returns exactly the 8-tool residue in every config, regardless
  of any `LOOP_*_VIA_CLI` env value. The Claude session-start discoverability hook emits the
  transport banner (records-via-CLI text, write-tool sketches, `--args-file` form, pinned
  `LOOP_SURFACE` value) without reading either flag. Missing or malformed config retains a
  tested degraded path and must not advertise an unbootable CLI identity. Factory and
  MastraCode remain separate hook surfaces unless explicitly wired and tested in this plan.
- Non-functional: shared core (`adaptLegacyHandler`, `withR2Gate`, `pinRuntimeIdAtBoot`,
  `CLI_TOOLS` / `CLI_READ_TOOLS` definitions) stays behaviorally unchanged — Phase 1 touches
  only comments in `core/cli-tools.js` and `bin/loop.mjs`, not logic. No DRY split.

## Architecture

**server.js** — the manifest loop (lines 53-86) imports every manifest entry, then skips a
tool when `READS_VIA_CLI && CLI_READ_TOOLS.has(name)` (line 64) or
`RECORDS_VIA_CLI && CLI_TOOLS.has(name)` (line 71). Replace both flag-gated blocks with one
unconditional `if (CLI_TOOLS.has(legacy.name)) continue;` above the `prefixed` line (74).
Delete the `READS_VIA_CLI` (44) and `RECORDS_VIA_CLI` (50) consts + their comment blocks;
remove `CLI_READ_TOOLS` from the line-21 import (keep `CLI_TOOLS`).

**Session-start hook** (`hooks/universal/session-start-inject-discoverability.cjs:161-175`)
— `buildConfiguredTransportBanner` currently reads flags from `.mcp.json` and gates the
Claude banner on `readsViaCli`. Collapse only the flag decision: for a valid Claude config,
the banner always emits the records-via-CLI text. Remove flag reads and branching, but
preserve a fail-closed/degraded result when config is missing or malformed so the hook does
not advertise a CLI that cannot satisfy `pinRuntimeIdAtBoot`. The write-tool arg sketches,
`--args-file` form, and pinned `LOOP_SURFACE` value MUST still render. The current universal
hook is wired only through `.claude/settings.json`; do not claim Factory/MastraCode coverage
without adding their runtime-specific hook wiring and tests. [Red-team corrections 7, 9]

Rollback safety: if this phase is reverted, restore the three config flags before restoring
flag-dependent server registration; never revert `server.js` alone after Phase 4 removes flags.

**Stale comments** — `core/cli-tools.js:11-14,33-36,48-49` describes the flags as active
opt-out knobs and documents a "Rollback: `LOOP_RECORDS_VIA_CLI=0` restores ALL tools to
MCP" that will no longer work. `bin/loop.mjs:9` and `core/placement.yaml:101` carry similar
stale text. Rewrite to the single-surface invariant (MCP registers only the residue;
`CLI_TOOLS` always rides the CLI; no flag). [Finding 8]

## Related Code Files

- Modify: `tools/learning-loop-mastra/mastra/server.js`
- Modify: `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs`
- Modify (comments only): `tools/learning-loop-mastra/core/cli-tools.js`,
  `tools/learning-loop-mastra/bin/loop.mjs`, `tools/learning-loop-mastra/core/placement.yaml`
- Read-only: `tools/learning-loop-mastra/mastra/with-r2-gate.js`, `handler-adapter.js`,
  `core/identity-pin.js` (confirm no flag reads)

## Implementation Steps

1. `server.js`: replace the two flag-gated skip blocks (64-66, 71-73) with one
   `if (CLI_TOOLS.has(legacy.name)) continue;`. Delete `READS_VIA_CLI` (44) + `RECORDS_VIA_CLI`
   (50) consts and their comment blocks (44-50, 67-72). Remove `CLI_READ_TOOLS` from the
   line-21 import; keep `CLI_TOOLS`. Update the header comment near 43-50 to the new invariant.
2. `session-start-inject-discoverability.cjs`: collapse `buildConfiguredTransportBanner` to
   emit the records-via-CLI banner unconditionally. Remove the `LOOP_RECORDS_VIA_CLI` /
   `LOOP_READS_VIA_CLI` reads (167-168). Update `buildTransportBanner`'s call to drop the
   `readsViaCli`/`recordsViaCli` args (or pass the single-surface defaults). Verify the
   write-tool sketches, `--args-file` form, and pinned `LOOP_SURFACE` value still render.
3. `core/cli-tools.js`: rewrite the header comments at 11-14, 33-36, 48-49 to the
   single-surface invariant. Delete the "Rollback: `LOOP_RECORDS_VIA_CLI=0` restores ALL
   tools to MCP" sentence — that rollback no longer works.
4. `bin/loop.mjs`: rewrite the header comment at line 9 (the `When a runtime sets
   LOOP_RECORDS_VIA_CLI=1 ...` sentence) to state the CLI is the single record surface.
5. `core/placement.yaml`: rewrite the `opted-in MCP exclusion (LOOP_READS_VIA_CLI /
   LOOP_RECORDS_VIA_CLI)` note at line 101 to the unconditional-skip invariant.
6. Boot-check: run `node __tests__/helpers/measure-residue.mjs` (committed in Phase 2) with
   NO env flags — confirm `listTools` returns the 8-tool residue (~4,563 all-tools bytes),
   identical to the prior `LOOP_RECORDS_VIA_CLI=1` run.
7. Grep `tools/learning-loop-mastra/` (excl. `__tests__/`) for `LOOP_RECORDS_VIA_CLI` /
   `LOOP_READS_VIA_CLI` / `READS_VIA_CLI` / `RECORDS_VIA_CLI` — confirm no production code
   path still branches on them. Expected hits after this phase: zero.

## Success Criteria

- [ ] `server.js` has no `READS_VIA_CLI`/`RECORDS_VIA_CLI` reference and no `CLI_READ_TOOLS` import; one unconditional `CLI_TOOLS.has` skip.
- [ ] Claude session-start hook emits the banner with no flag read; valid-config sketches + `--args-file` + `LOOP_SURFACE` render; missing/malformed config follows the degraded path.
- [ ] `cli-tools.js`, `bin/loop.mjs`, `placement.yaml` carry no stale flag-as-active-opt-out prose; the "Rollback: flag=0" sentence is gone.
- [ ] `listTools` (no env flags) returns exactly the 8 residue names, ~4,563 all-tools bytes.
- [ ] `grep -rn "LOOP_RECORDS_VIA_CLI\|LOOP_READS_VIA_CLI" tools/learning-loop-mastra/ --exclude-dir=__tests__` returns zero.

## Risk Assessment

- **Residue accidentally skipped:** unconditional `CLI_TOOLS.has` could skip a residue tool
  if mistakenly in `CLI_TOOLS`. Verified NOT the case: `check_runtime_agnostic` +
  `workflow_generate_prompt` are not in `CLI_TOOLS` (red-team confirmed). Signal: boot
  measurement shows <8 tools. Response: fix the set membership, do not re-introduce the flag.
- **Banner text regression:** collapsing the hook could drop the `--args-file` form.
  Signal: Phase 2 `cli-sessionstart-banner.test.js` fails on the sketch assertions.
  Pre-decided response: restore the sketch rendering unconditionally; the banner's job is
  discoverability of the CLI transport, which is now the only transport.
- **Comment-only edit violates "core unchanged":** Phase 1 Requirements permit comment-only
  edits in `core/cli-tools.js` / `bin/loop.mjs`. Logic stays identical; a diff check
  confirms only comment lines move. Signal: non-comment lines in the diff. Response: revert
  the stray logic edit.