---
phase: 1
title: "Restore the 55,000 ceiling"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Restore the 55,000 ceiling

## Overview

Trim ~247 bytes of tool-description prose so the manifest wire drops from 55,247 to ≤
55,000, and re-tighten the budget test ceiling from the 55,750 stopgap back to 55,000.
This is Option A from the analysis report — a deliberate, low-risk stopgap that closes the
finding's literal mandate now. It buys zero production context back (production loads the
8-tool residue via `LOOP_RECORDS_VIA_CLI=1`); its value is restoring the tighter boundary
guard and unblocking the finding.

## Requirements

- Functional: the 44-tool manifest wire measures ≤ 55,000 bytes.
- Non-functional: no tool's accepted args or return shape change (description prose only).
- Non-functional: `cli-context-savings` continues to pass (re-snapshot if it pins trimmed prose).

## Architecture

The wire is `Buffer.byteLength(JSON.stringify(manifestTools))` where `manifestTools` is the
44-tool `listTools` result filtered by `isManifestTool` (excludes `run_`/`ask_` prefixes and
`mastra_update_r2_allowlist`). The 247-byte deficit is recoverable from the top tool
`description` strings — the longest single prose blocks. Trimming a tool's top-level
`description` does not touch its `inputSchema` shape, so no behavioral risk.

Trim targets (tool `description` prose, descending by available rephrasable prose):
- `meta_state_patch` (~996 B), `gate_mark_preflight` (~941 B),
  `meta_state_refresh_file_index` (~829 B) — these carry rephrasable verbosity.
- **Deprioritize `meta_state_list`'s tool description** (red-team finding #5): it is
  dense behavioral prose (compact default, excluded-status defaults, id/session_id/ref_by
  narrowing, include_all_versions, excluded_ids notice) with near-zero redundant phrasing.
  Trimming it risks dropping a behavior hint that is the model's only pre-call signal for
  default-exclusion behavior. Use it only if the other three fall short of 247 B.
- Trim ~247 bytes total across the prioritized three — compress redundant phrasing, not
  remove constraints.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js` — re-tighten
  `assert.ok(bytes <= 55_750, ...)` → `<= 55_000`, replace the STOPGAP comment with the
  restored-ceiling rationale.
- Modify: tool `description` strings in the handler files named above
  (`tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js`,
  `gate-mark-preflight-complete-tool.js` (or `gate-tool.js`), `meta-state-refresh-file-index-tool.js`,
  `meta-state-list-tool.js`).
- Read-only verify: `tools/learning-loop-mastra/__tests__/cli-context-savings.test.js` —
  check whether it snapshots the trimmed prose.

## Implementation Steps (TDD)

1. **Red — tighten the test first.** Edit `mcp-wire-budget.test.js` to assert
   `bytes <= 55_000`. Run it: it fails at 55,247 (247 bytes over). This pins the target
   before any prose is touched.
2. **Read both savings tests.** `cli-context-savings-script.test.js` snapshots the full
   CLI payload including `per_tool[].bytes` for every CLI tool — all four trim targets are
   `CLI_TOOLS` members, so this snapshot **will break** on any trim (red-team finding #4).
   `cli-context-savings.test.js` recomputes both sides live and will not break;
   `SAVINGS_PCT_FLOOR=50` stays safe (~94% → ~93.9%).
3. **Trim ~247 bytes** of redundant prose from the target tool `description` strings.
   Preserve every constraint and accepted-arg mention; cut only rephrasable verbosity.
   Re-measure the wire with the reproduction script
   (`withMcpServer` + `Buffer.byteLength(JSON.stringify(filter(listTools())))`).
4. **Green — confirm `bytes <= 55_000`.** Run `mcp-wire-budget` → pass. Run the full
   loop test suite to confirm no behavioral regression.
5. **Re-snapshot `cli-context-savings-script`** (certain to break, not conditional). Review
   every per-tool byte delta before accepting the new snapshot — the snapshot is the
   "review every byte change" guard, so re-snapshotting without reviewing defeats it.
   Confirm `cli-context-savings` (live) and `SAVINGS_PCT_FLOOR` still pass.
6. **Update the budget test comment** — remove the STOPGAP narrative, state the
   55,000 ceiling is restored and that the structural shrink (Phase 2) will re-anchor it.

## Success Criteria

- [ ] `mcp-wire-budget` asserts `<= 55_000` and passes.
- [ ] `cli-context-savings` passes (re-snapshotted if needed).
- [ ] Full loop test suite green.
- [ ] No `inputSchema` shape changed (diff confirms `description`-only edits).
- [ ] Budget test STOPGAP comment replaced with restored-ceiling rationale.

## Risk Assessment

- **Risk: trimming a constraint the model relies on.** Mitigation: cut verbosity, not
  constraints; keep every accepted-arg and enum mention in the description. The schema
  itself is the authority; the description is steering prose.
- **Risk: `cli-context-savings-script` snapshot break (certain).** Mitigation: re-snapshot
  deliberately in step 5 with per-tool byte-delta review; never weaken the test. The live
  `cli-context-savings` test and `SAVINGS_PCT_FLOOR` are unaffected.
- **Assumption that may break: the 247-byte deficit is recoverable from these four
  descriptions.** Signal it broke: after trimming, the wire is still > 55,000. Pre-decided
  response: extend the trim to the next-longest tool descriptions rather than raising the
  ceiling.