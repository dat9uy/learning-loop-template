---
phase: 2
title: "Tool Registration"
status: pending
effort: "2h"
dependencies: [1]
---

# Phase 2: Tool Registration

## Overview

Create the 4 MCP tool files that expose meta-state operations to agents. Register them in `tools/manifest.json` and add the `meta_state` group to `agent-manifest.json`. Follow the existing tool pattern (zod schema + handler + error boundary via `registerTool`).

## Requirements

- **Functional:** 4 tools (`meta_state_report`, `meta_state_list`, `meta_state_ack`, `meta_state_resolve`) with zod schemas, proper descriptions, and structured JSON responses.
- **Non-functional:** Consistent with existing tool patterns, no new dependencies, log all tool calls via `appendGateLog`.

## Architecture

Each tool follows the established pattern:
```js
export const metaStateReportTool = {
  name: "meta_state_report",
  description: "...",
  schema: { /* zod */ },
  handler: async (args) => { /* use meta-state.js core */ },
};
```

### Tool: `meta_state_report`

**Authorship:** Agent
**Purpose:** Create a new meta-state entry. Status = `reported`. TTL = 24h.

**Schema fields:**
- `category` (z.enum): `gate-logic-bug`, `record-repair-gap`, `schema-drift`, `stale-ref`, `mcp-tool-missing`
- `severity` (z.enum): `warning`, `escalate`
- `affected_system` (z.enum): `gate-logic`, `record-validation`, `index-extractor`, `mcp-tools`, `workflow-registry`
- `description` (z.string, min 20 chars)
- `evidence_journal` (z.string, optional): path to journal file
- `evidence_code_ref` (z.string, optional): `path/to/file.js:line`
- `evidence_test` (z.string, optional): test file reference
- `auto_resolve_file` (z.string, optional): file path to watch for auto-resolve
- `auto_resolve_line_range` (z.array(z.number), optional): [start, end]

**Handler logic:**
1. Generate id: `meta-{YYMMDD}T{HHmm}Z-{slug(description)}`
2. Build entry object with `status: "reported"`, `expires_at: +24h`
3. Call `writeEntry(root, entry)`
4. Return `{ reported: true, id, status: "reported", expires_at }`

### Tool: `meta_state_list`

**Authorship:** Agent or operator
**Purpose:** Query active entries (non-terminal status). Filter by category, status, affected_system.

**Schema fields:**
- `category` (z.string, optional)
- `status` (z.string, optional): defaults to listing all except `auto-resolved`/`expired`/`resolved`
- `affected_system` (z.string, optional)
- `include_expired` (z.boolean, optional): default false

**Handler logic:**
1. Call `readRegistry(root)`
2. Run `checkExpiry` and `checkAutoResolve` on each entry in memory (update statuses)
3. If status changed, call `updateEntry` for that entry
4. Apply filters via `filterEntries`
5. Return `{ entries: [...], count, filters_applied }`

### Tool: `meta_state_ack`

**Authorship:** Operator
**Purpose:** Promote `reported` → `active`. Removes TTL.

**Schema fields:**
- `id` (z.string): exact entry id
- `reason` (z.string, optional): operator note

**Handler logic:**
1. Call `readRegistry(root)`
2. Find entry by id
3. If not found → return `{ acked: false, reason: "not_found" }`
4. If status !== `reported` → return `{ acked: false, reason: "already_active_or_terminal", current_status }`
5. Update: `status: "active"`, `acked_at: now`, `expires_at: null`
6. Call `updateEntry(root, id, patch)`
7. Return `{ acked: true, id, status: "active" }`

### Tool: `meta_state_resolve`

**Authorship:** Operator or auto-resolve
**Purpose:** Mark entry as resolved (terminal). Entry will be compacted on next update.

**Schema fields:**
- `id` (z.string): exact entry id
- `resolution` (z.string, optional): how it was resolved
- `resolved_by` (z.enum("operator", "auto-resolve"), default "operator")

**Handler logic:**
1. Call `readRegistry(root)`
2. Find entry by id
3. If not found → return `{ resolved: false, reason: "not_found" }`
4. If already terminal → return `{ resolved: false, reason: "already_terminal", current_status }`
5. Update: `status: "resolved"`, `resolved_at: now`, `resolved_by`
6. Call `updateEntry(root, id, patch)`
7. Return `{ resolved: true, id, status: "resolved" }`

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/tools/meta-state-report-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-ack-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js`
- **Modify:**
  - `tools/learning-loop-mcp/tools/manifest.json` — add 4 new entries
  - `tools/learning-loop-mcp/agent-manifest.json` — add `meta_state` group

## Implementation Steps

1. Create `meta-state-report-tool.js` following `record-observation-tool.js` pattern (zod schema, `resolveRoot`, `appendGateLog`, structured JSON response).
2. Create `meta-state-list-tool.js` with filter support.
3. Create `meta-state-ack-tool.js` with validation (only `reported` can be acked).
4. Create `meta-state-resolve-tool.js` with validation (no double-resolve).
5. Add 4 entries to `tools/manifest.json`:
   ```json
   { "file": "./tools/meta-state-report-tool.js", "export": "metaStateReportTool" },
   { "file": "./tools/meta-state-list-tool.js", "export": "metaStateListTool" },
   { "file": "./tools/meta-state-ack-tool.js", "export": "metaStateAckTool" },
   { "file": "./tools/meta-state-resolve-tool.js", "export": "metaStateResolveTool" }
   ```
6. Add `meta_state` group to `agent-manifest.json`:
   ```json
   "meta_state": {
     "description": "Meta-state registry for loop self-awareness findings",
     "tools": ["meta_state_report", "meta_state_list", "meta_state_ack", "meta_state_resolve"],
     "ordering": "any"
   }
   ```

## Success Criteria

- [ ] All 4 tools load successfully (server startup shows "registered 40 of 40 tools")
- [ ] `meta_state_report` creates a valid entry with `status: "reported"`
- [ ] `meta_state_list` returns only active entries by default (excludes terminal)
- [ ] `meta_state_list` with `include_expired: true` returns terminal entries
- [ ] `meta_state_ack` promotes `reported` → `active` and removes `expires_at`
- [ ] `meta_state_resolve` marks entry as `resolved` with `resolved_at` timestamp
- [ ] `agent-manifest.json` has new `meta_state` group with all 4 tools

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tool name collision | `registerTool` already throws on collision — will catch at startup |
| Schema mismatch between tool and core | Core module is source of truth; tool validates inputs with zod before passing to core |
| Missing `appendGateLog` call | Copy pattern from `record-observation-tool.js` which logs all calls |
