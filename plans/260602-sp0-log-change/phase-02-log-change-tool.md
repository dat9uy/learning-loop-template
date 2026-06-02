---
phase: 2
title: "meta_state_log_change Tool (TDD)"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: `meta_state_log_change` Tool (TDD)

## Overview

Create the new MCP tool `meta_state_log_change` in `tools/meta-state-log-change-tool.js`. The tool accepts a 3-bucket `change_dimension`, an open `change_target` string, a structured `change_diff`, a `reason` (min 20 chars), optional `applies_to` / `supersedes` / `evidence_*`, and writes a change-log entry to `meta-state.jsonl` with `entry_kind: "change-log"`, `status: "active"`, no TTL. The tool also appends a gate log line. Tests-first: 8 new tests in a new file `__tests__/meta-state-log-change.test.js`. The tool is agent-callable (no operator role check); CAS is not used (log-only).

## Requirements

- Functional:
  - Tool name: `meta_state_log_change` (matches the 5 existing `meta_state_*` siblings)
  - Agent-callable: no `OPERATOR_MODE` check (matches `meta_state_report` / `meta_state_list`)
  - Validates input via `metaStateChangeEntrySchema`
  - Generates entry id via `generateId(slugify(change_target))` (reuses existing helpers)
  - Writes entry to `meta-state.jsonl` via `writeEntry()`
  - Appends a gate log line via `appendGateLog()` (matches all sibling tools)
  - Returns: `{ logged: true, id, entry_kind: "change-log", change_dimension, change_target, created_at }`
  - Backward compat: the 5 existing meta-state tools continue to work unchanged
- Non-functional:
  - 8 new tests pass
  - 16 + 12 + 12 = 40 existing tests still pass (regression-safety floor)
  - No new dependencies

## Architecture

### Tool file (in `tools/meta-state-log-change-tool.js`)

```js
import { z } from "zod";
import { writeEntry, generateId, metaStateChangeEntrySchema } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { slugify } from "#mcp/core/slugify.js";

export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  description: "Log a system change (schema, rule, tool, policy, surface, lifecycle, manifest) as a change-log entry in the meta-state registry. The entry is immutable, status=active, no TTL. Use supersedes to replace a prior change entry.",
  schema: {
    change_dimension: z.enum(["semantic", "mechanical", "surface"])
      .describe("What kind of change: semantic (schemas/taxonomies/contracts) | mechanical (rules/policies/enforcement) | surface (tools/surfaces/lifecycles/manifests)"),
    change_target: z.string().min(1)
      .describe("Specific path or identifier being changed"),
    change_diff: z.object({
      added: z.array(z.string()).default([]).describe("Paths/fields added"),
      removed: z.array(z.string()).default([]).describe("Paths/fields removed"),
      changed: z.array(z.string()).default([]).describe("Paths/fields whose meaning changed (not value)"),
    }).describe("Structured diff"),
    reason: z.string().min(20)
      .describe("Why the change was made (min 20 chars)"),
    applies_to: z.object({
      tools: z.array(z.string()).optional().describe("Tool names affected"),
      surfaces: z.array(z.string()).optional().describe("Surface names affected"),
      rules: z.array(z.string()).optional().describe("Rule IDs affected"),
      statuses: z.array(z.string()).optional().describe("Status values affected"),
      schemas: z.array(z.string()).optional().describe("Schema files affected"),
    }).optional().describe("Wider impact scope"),
    supersedes: z.string().optional()
      .describe("ID of a previous change-log entry this one replaces"),
    evidence_code_ref: z.string().optional()
      .describe("Path to the change in code (e.g., commit hash or file:line)"),
    evidence_journal: z.string().optional()
      .describe("Path to related journal/plans/reports file"),
  },
  handler: async ({
    change_dimension,
    change_target,
    change_diff,
    reason,
    applies_to,
    supersedes,
    evidence_code_ref,
    evidence_journal,
  }) => {
    const root = resolveRoot();
    const id = generateId(slugify(change_target));
    const now = new Date();

    const entry = {
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      change_diff,
      reason,
      ...(applies_to && { applies_to }),
      ...(supersedes && { supersedes }),
      evidence: {
        ...(evidence_code_ref && { code_ref: evidence_code_ref }),
        ...(evidence_journal && { journal: evidence_journal }),
      },
      status: "active",
      created_at: now.toISOString(),
      version: 0,
    };

    await writeEntry(root, entry);

    appendGateLog(root, {
      timestamp: now.toISOString(),
      tool: "meta_state_log_change",
      id,
      change_dimension,
      change_target,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          logged: true,
          id,
          entry_kind: "change-log",
          change_dimension,
          change_target,
          created_at: now.toISOString(),
        }),
      }],
    };
  },
};
```

### `core/slugify.js` (new shared util)

Extract the `slugify()` function from `meta-state-report-tool.js` and `meta-state-log-change-tool.js` into a shared module. The function is identical in both files:

```js
export function slugify(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}
```

This is a Phase 4 deliverable (manifest + slugify refactor). For Phase 2, import the slugify function locally (or duplicate it inline) and defer the extraction to Phase 4. **Recommended:** implement Phase 2 with the local copy; refactor in Phase 4. This keeps Phase 2 focused on the new tool.

## Tests (write FIRST, then implement)

Create `__tests__/meta-state-log-change.test.js` with 8 tests:

1. **Tool writes a valid change-log entry** — call handler with valid input → read registry → assert entry exists with `entry_kind: "change-log"`
2. **Tool returns the generated id and entry_kind** — call handler, parse response text, assert `logged === true`, `id` matches `meta-` prefix, `entry_kind === "change-log"`
3. **Tool writes one line to gate log** — call handler, check gate log contains the tool call
4. **Tool rejects invalid `change_dimension`** — call with `"unknown"` → handler throws or returns error
5. **Tool rejects too-short `reason`** — call with `"too short"` (8 chars) → handler throws or returns error
6. **Tool accepts `applies_to` (all optional sub-fields)** — call with full scope set → entry has `applies_to`
7. **Tool accepts `supersedes` (id of prior change entry)** — call with `supersedes: "meta-..."` → entry has `supersedes` field
8. **Round-trip: write via tool, read via `meta_state_list({ entry_kind: "change-log" })`** — note: `meta_state_list` filter is added in Phase 3, so this test asserts the entry is readable via the union; Phase 3's filter test covers the typed query

For tests 4 and 5: the zod schema throws on `safeParse` failure. The handler should propagate the error (or wrap it). Pattern: tests assert the error is thrown, not that the tool gracefully returns an error response (matches the existing `meta_state_report` tool pattern, which lets zod errors propagate).

## TDD Workflow

1. **Write all 8 new tests first.** Run `pnpm test -- __tests__/meta-state-log-change.test.js`. Observe RED (8 failing tests, file not found initially).
2. **Create the tool file** with the implementation above. Use a local `slugify()` copy (refactor in Phase 4).
3. **Run tests.** Observe GREEN (8 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite). All existing tests still pass.

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` (the tool)
  - `tools/learning-loop-mcp/__tests__/meta-state-log-change.test.js` (the tests)
- Modify: none (Phase 2 is self-contained)
- Delete: none

## Implementation Steps

1. Create the test file `__tests__/meta-state-log-change.test.js` with 8 stubbed tests.
2. Run `pnpm test -- __tests__/meta-state-log-change.test.js` — confirm file not found / 8 tests error (RED).
3. Create the tool file `tools/meta-state-log-change-tool.js` with the implementation.
4. Run `pnpm test -- __tests__/meta-state-log-change.test.js` — confirm 8 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 40 + 8 = 48 tests pass in the relevant surface.

## Success Criteria

- [x] 8 new tests written and failing (RED)
- [x] 8 new tests pass after implementation (GREEN)
- [x] 16 + 12 + 12 = 40 existing tests still pass
- [x] Tool is agent-callable (no `OPERATOR_MODE` check)
- [x] Tool returns structured response with `logged`, `id`, `entry_kind`, `change_dimension`, `change_target`, `created_at`
- [x] Tool writes to `meta-state.jsonl` with `entry_kind: "change-log"`, `status: "active"`, no `expires_at`
- [x] Tool appends a gate log line
- [x] `pnpm test` passes (full suite)

## Risk Assessment

- **Risk: the local `slugify()` copy drifts from `meta-state-report-tool.js`.** Mitigation: Phase 4 extracts the shared util and refactors both files.
- **Risk: the tool's schema (which is exposed as `tool.schema`) doesn't match the union branch.** Mitigation: tests assert the union branch accepts the tool's input shape.
- **Risk: `writeEntry` race conditions corrupt the JSONL.** Mitigation: `writeEntry` already has a per-root write queue (`enqueue()`); the new tool uses it. The existing concurrency test in `core/meta-state.test.js` covers this for the new entry shape.
