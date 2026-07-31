---
phase: 3
title: "meta_state_unarchive tool — manifest + classification + handler"
status: pending
priority: P0
effort: "3h"
dependencies: [2]
---

# Phase 3: meta_state_unarchive tool — manifest + classification + handler

## Overview

Expose `restoreEntry` as a first-class tool `meta_state_unarchive`, mirroring `meta-state-archive-tool.js`. Register + classify it in the three sites tests enforce, so it rides the CLI under `LOOP_RECORDS_VIA_CLI=1` and stays MCP-wired otherwise. TDD: tool roundtrip + invariant-rejection tests first.

## Requirements

- **Functional:** `meta_state_unarchive({ id, reason? })` calls `restoreEntry(root, id, reason)`, appends a gate-log line, returns `{ content:[{type:"text",text:JSON.stringify(result)}] }`. `name` field exactly `"meta_state_unarchive"`. No `allow_delete_restore` parameter (red-team M1 — YAGNI; delete-tombstones are rejected unconditionally by `restoreEntry`).
- **Non-functional:** Single-source-of-truth handler (shim-not-fork) — lives once at `tools/learning-loop-mastra/tools/handlers/meta-state-unarchive-tool.js`, exported `metaStateUnarchiveTool`; the CLI and MCP execute the same code path. No hard-coded surface paths (stays off the `cross-surface-iteration`/`parameterized-for-new-surfaces` runtime-agnostic regexes).
- **Non-functional:** Classified in **three** sites (no silent default): `tools/manifest.json` (entry `{ file:"tools/meta-state-unarchive-tool.js", export:"metaStateUnarchiveTool", pathFields:[] }`), `agent-manifest.json` `groups.meta_state.tools` (`mastra_meta_state_unarchive`), `core/cli-tools.js` `CLI_WRITE_TOOLS` (next to `meta_state_archive`, L67).

## Architecture

Handler mirrors `meta-state-archive-tool.js:64-77`:

```js
export const metaStateUnarchiveTool = {
  name: "meta_state_unarchive",
  description: "Restore an archived entry by true-appending a new line that supersedes the archive tombstone. Restores the pre-archive status + content. Rejects already-active entries (not_archived), change-logs (not_archived), and delete-tombstones (delete_not_restorable).",
  schema: {
    id: z.preprocess(stripEnvelope, z.string()).describe("Entry id to restore."),
    reason: z.string().optional().describe("Restore reason."),
  },
  handler: async ({ id, reason }) => {
    const root = resolveRoot();
    const result = await restoreEntry(root, id, reason ?? "operator restore");
    appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_unarchive", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

Imports mirror `meta-state-archive-tool.js:1-7`: `z`, `stripEnvelope` (`../../core/envelope-stripper.js`), `resolveRoot` (`#lib/resolve-root.js`), `restoreEntry` (`../../core/meta-state.js`), `appendGateLog` (`#lib/gate-logging.js`). `strictBooleanGuard` is no longer needed (no boolean flag — red-team M1).

CLI-vs-MCP split (researcher #2): `server.js:64-73` drops `CLI_WRITE_TOOLS` members from MCP under `LOOP_RECORDS_VIA_CLI=1`; the CLI hardcodes `pathFields:[]` (`bin/loop.mjs:123`) → R2 passthrough. `validateToolManifest` runs at both server + CLI boot; `pathFields:[]` passes both.

## Related Code Files

- Create: `tools/learning-loop-mastra/tools/handlers/meta-state-unarchive-tool.js`
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (add entry near L59)
- Modify: `tools/learning-loop-mastra/agent-manifest.json` (`groups.meta_state.tools`, L19)
- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (`CLI_WRITE_TOOLS`, L67)
- Test: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-unarchive-tool.test.js` (new — mirror `meta-state-archive-tool.test.js` seeding)

## Implementation Steps

1. **RED — tool roundtrip:** New `meta-state-unarchive-tool.test.js` mirroring `meta-state-archive-tool.test.js` seeding (temp root, `GATE_ROOT`, inline `writeFileSync`). Test: seed open finding → `metaStateArchiveTool.handler` archive → `metaStateRelationshipsTool.handler({id})` (no throw, Phase 1 fix) → `metaStateUnarchiveTool.handler({id, reason})` → assert `{restored:true}`, `readRegistry` shows `status:"open"`, `archived_*` absent. RED (tool doesn't exist).
2. **RED — invariant rejection:** Seed already-active / change-log / delete-tombstone / archive-tombstone; assert the archive-tombstone restores and the others reject with the right reasons: already-active → `not_archived`; change-log → `not_archived` (red-team H1 — no `change_log_immutable` branch); delete-tombstone → `delete_not_restorable` (no flag — red-team M1). Bucket shape `{restored:false, reason, id}`. RED.
3. **GREEN:** Create `meta-state-unarchive-tool.js` per the architecture stub. Add manifest + agent-manifest + `CLI_WRITE_TOOLS` entries. Tests GREEN.
4. **Verify classification:** `pnpm test:one __tests__/cli-write-tool-set-drift.test.js` green (no unclassified tool). `pnpm test:one __tests__/legacy-mcp/runtime-agnostic.test.js` green.
5. **Verify CLI surface:** `LOOP_SURFACE=.mastracode node tools/learning-loop-mastra/bin/loop.mjs list` shows `meta_state_unarchive`; `--schema` prints its input schema; a roundtrip via the CLI succeeds (exit 0, result JSON on stdout).
6. **Runtime-agnostic audit:** run `check_runtime_agnostic` (MCP) or the audit against the new feature; confirm the 6-item checklist passes (item 1 universal location + item 4 manifest-registered apply; 2/3/5/6 don't apply to a record-surface tool).

## Success Criteria

- [ ] `meta_state_unarchive` roundtrip green (archive → relationships → unarchive → restored status → relationships again).
- [ ] Invariant rejection test green (already-active → `not_archived`; change-log → `not_archived`; delete-tombstone → `delete_not_restorable`; no flag).
- [ ] Classified in all 3 sites; `cli-write-tool-set-drift` + `runtime-agnostic.test.js` green; `check_runtime_agnostic` passes.
- [ ] CLI `list` shows the tool; `--schema` works; CLI roundtrip exit 0.
- [ ] `pnpm test:one` green on the new test, `meta-state-archive-tool.test.js`, `cli-write-tool-set-drift.test.js`, `runtime-agnostic.test.js`.

## Risk Assessment

- **Risk:** Forgetting one of the 3 classification sites → a drift/manifest test fails with no silent default. **Mitigation:** step 3 lists all three; step 4 verifies each test.
- **Risk:** A `name` mismatch (e.g. `meta_state_restore`) → `readToolNameFromSource` returns a name not in `CLI_WRITE_TOOLS` → drift test fails. **Mitigation:** `name` is exactly `"meta_state_unarchive"`; the test reads the export's `name` field.
- **Risk:** The handler hard-codes a surface path and trips the `cross-surface-iteration`/`parameterized-for-new-surfaces` regex. **Mitigation:** handler uses `resolveRoot()` + core helpers only (mirrors archive tool, which passes the audit); no `join(root,".claude")` or surface iteration.
