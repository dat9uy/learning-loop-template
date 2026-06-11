---
phase: 1
title: "Schema + Tool: reopens field on meta_state_report"
status: pending
priority: P2
effort: "1h"
dependencies: ["260610-1535-meta-state-reopen-path"]
---

# Phase 1: Schema + Tool — reopens field on meta_state_report

## Overview

Close the agent-affordance gap (Gap 1 in the gap report). The schema already accepts `reopens: z.array(z.string()).optional()` (`core/meta-state.js:75-77`), but the `meta_state_report` handler at `tools/learning-loop-mcp/tools/meta-state-report-tool.js` destructures only 8 fields and silently drops the input. Phase 1 adds destructure + persist + description update, plus T11–T13 in a new test file.

## Requirements

### Functional
- `meta_state_report({ reopens: ['meta-...'] })` persists `reopens` on the new entry.
- `meta_state_report({ reopens: undefined })` (or omitted) does NOT add the field to the entry (backward compat).
- `meta_state_report({ reopens: 'meta-...' })` (wrong type — string, not array) is rejected by zod with a clear error.
- `meta_state_report({ reopens: ['meta-...', 'meta-...'] })` persists both ids in the order passed.
- After write, `meta_state_relationships({id: any_reopens_target, direction: "inbound"})` returns `inbound.reopened_by: [<new_id>]` for each target.

### Non-functional
- ~8 lines added to `meta-state-report-tool.js`. No new dependencies.
- Test file follows the pattern of `__tests__/meta-state-report-tool-extension.test.js` (if it exists) or creates a new file.
- Tests are deterministic; use `mkdtempSync` + `GATE_ROOT` override for isolation.

## Architecture

**Data flow:**
1. Caller invokes `meta_state_report({ ..., reopens: ['meta-A-...', 'meta-B-...'] })`.
2. Handler destructures `reopens` (new parameter).
3. Build the entry with `...(reopens && { reopens })` — preserves the conditional spread pattern already used for `subtype`, `evidence_code_ref`, etc.
4. `writeEntry(root, entry)` persists to `meta-state.jsonl`.
5. The `reopens_inverse` index is rebuilt on next read (`core/loop-introspect.js:209-216` already handles this for any entry with `reopens` set).

**Wire-format safety:** The MCP SDK may wrap a top-level array as `{item: [...]}` (per `meta-260606T2202Z`). `coerceParamsToSchema` in `tool-registry.js:108` already unwraps it via `unwrapItemWrap`. No additional handling needed for the array shape; a regression test confirms the round-trip.

## Related Code Files

### Modify
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (line 22-31 destructure; line 78-100 entry build; line 13-15 description)
  - Add `reopens` to destructured parameters.
  - Add `...(reopens && { reopens })` to the entry spread.
  - Update description: 1-2 sentences explaining the field + pointing at `meta_state_relationship_validate` as the lint.

### Create
- `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` — T11–T13 (round-trip, omitted, invalid type rejection).

## Implementation Steps

### Step 1: TDD RED — write failing tests

```js
// File: __tests__/meta-state-report-tool-extension.test.js
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { readRegistry } from "../core/meta-state.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "report-extension-test-"));
}

describe("meta_state_report reopens field", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  // T11: round-trip with valid array
  it("persists reopens when passed as array", async () => {
    const result = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test reopens round-trip with two expired parents (min 20 chars).",
      reopens: ["meta-260608T1522Z-test-parent-1", "meta-260608T1618Z-test-parent-2"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.reported, true);
    const entries = readRegistry(root);
    const written = entries.find((e) => e.id === parsed.id);
    assert.ok(written);
    assert.deepEqual(written.reopens, [
      "meta-260608T1522Z-test-parent-1",
      "meta-260608T1618Z-test-parent-2",
    ]);
  });

  // T12: omitted = no field
  it("omits reopens field when not passed", async () => {
    const result = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test reopens omission - no reopens field (min 20 chars).",
    });
    const parsed = JSON.parse(result.content[0].text);
    const entries = readRegistry(root);
    const written = entries.find((e) => e.id === parsed.id);
    assert.ok(written);
    assert.equal(written.reopens, undefined);
  });

  // T13: invalid type rejection
  it("rejects reopens as non-array", async () => {
    await assert.rejects(
      metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test reopens type rejection (min 20 chars).",
        reopens: "meta-260608T1522Z-not-an-array",
      }),
      (err) => /expected array/.test(err.message),
    );
  });
});
```

Run: `pnpm test:unit -- meta-state-report-tool-extension.test.js` (or whatever the project's unit test command is). All 3 tests should fail.

### Step 2: TDD GREEN — minimal code change

In `tools/learning-loop-mcp/tools/meta-state-report-tool.js`:

1. Add to destructure (line 22-31):
```js
reopens,
```

2. Add to entry spread (line 78-100, after the `mechanism_check` block):
```js
...(reopens && { reopens }),
```

3. Update the description (line 13-15). Current:
> "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator..."

Append: 
> " To re-surface an expired finding from the same finding (the cross-reference affordance), pass `reopens: ['<old_expired_id>']`. Run `meta_state_relationship_validate({ description, entry_id? })` first to lint orphan ids."

Run tests. All 3 should pass.

### Step 3: Regression — verify wire-format safety

Add an integration test that invokes the tool via the MCP server (mimicking the wire layer):
- Use the test pattern from `__tests__/meta-state-archive-tool.test.js` (line 1-50).
- Send `tools/call` with `reopens` as a top-level array.
- Assert the persisted entry's `reopens` is an array (not stringified, not wrapped in `{item: [...]}`).

If the test fails, the wire-format issue documented in `meta-260606T2202Z` is still live. Open a follow-up finding; do NOT bypass with a workaround in this phase.

### Step 4: Update agent-manifest (defer to Phase 4)

The agent-manifest update for the 2 new tools (Phase 2 and 3) goes in Phase 4. Phase 1 doesn't change the manifest.

## Success Criteria

- [ ] T11–T13 pass (`meta-state-report-tool-extension.test.js`).
- [ ] `meta_state_report({reopens: ['meta-...']})` round-trips the array.
- [ ] `meta_state_report()` (omitted) does NOT add the field.
- [ ] `meta_state_report({reopens: 'string'})` is rejected by zod.
- [ ] Wire-format regression test passes (array round-trips through MCP).
- [ ] No regressions in existing `meta-state-report-tool.test.js` (if it exists).
- [ ] Description field documents `reopens` + points at the lint.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Wire-format coercion of top-level array (per `meta-260606T2202Z`) | Regression test in Step 3. If it fails, file follow-up finding; do not workaround. |
| Backward-compat break for existing callers | The field is `.optional()` on the schema. The handler uses a conditional spread, so omitted = omitted. No change for callers that don't pass `reopens`. |
| `reopens` accepts arbitrary strings (not validated against live registry) | Phase 1 only persists. Validation happens via `meta_state_relationship_validate` (Phase 3), which can be called separately. Phase 1's handler can also call validate after write and include warnings in response (per the brainstorm's Risks table mitigation). |
| Test isolation fails due to GATE_ROOT inheritance | Use the `mkdtempSync` + `process.env.GATE_ROOT` pattern from `meta-state-archive-tool.test.js` (lines 9-26). |
