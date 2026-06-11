---
phase: 3
title: "Lint Tool: meta_state_relationship_validate"
status: pending
priority: P2
effort: "1.5h"
dependencies: ["phase-02-migrate-tool"]
---

# Phase 3: Lint Tool — meta_state_relationship_validate

## Overview

Add a read-only lint that warns when a `description` references finding-ids that are `expired` or `stale` AND the caller has not declared a structural field referencing them. Makes the cross-reference gap mechanically catchable: the agent can run the lint before reporting to discover orphan ids and follow the suggestion.

## Requirements

### Functional
- `meta_state_relationship_validate({ description: '...', entry_id?: 'meta-...' })`:
  - Scans `description` for finding-id patterns (regex: `/meta-\d{6}T\d{4}Z-[a-z0-9-]+/g`).
  - For each found id, looks it up in the live registry.
  - Returns `{ warned: true, orphans: [...], unknown_refs: [...] }` if:
    - Any referenced id is `expired` or `stale` AND the structural field (`reopens`) does not include it.
  - Returns `{ warned: false, referenced: [...] }` if all referenced ids are present and current.
  - Returns `{ warned: true, unknown_refs: [...] }` if any id is not in the registry.
  - `entry_id` (optional): if provided, the structural field check uses the entry's `reopens` field. If omitted, the check is "no structural field set" (caller is about to report).
- Pure read; safe to call repeatedly. No registry writes.
- Idempotent.

### Non-functional
- Reuses `metaStateFindingEntrySchema` for the input shape (zod-validated).
- Regex is the only finding-id pattern. No markdown paths, no `local:meta-state:` prefixes (the lint is for free-text descriptions, not structured `source_refs`).
- ~80 lines of handler + tests.

## Architecture

**Data flow:**
1. Caller invokes `meta_state_relationship_validate({ description, entry_id? })`.
2. Handler extracts ids via regex.
3. Reads registry, builds a Set of valid ids (fast O(1) lookup).
4. For each id, classifies:
   - `unknown_refs` — not in registry.
   - `orphans` — in registry, status is `expired` or `stale`, AND (no `entry_id` provided OR entry's `reopens` doesn't include this id).
   - `ok` — in registry, status is `reported` / `active` / `resolved` / `superseded` / `auto-resolved`.
5. Returns the result. If `orphans.length > 0` or `unknown_refs.length > 0`, includes a `suggestion` field:
   - For orphans: `"Pass reopens: ['<orphan_id>'] on your meta_state_report call."`
   - For unknown_refs: `"<id> is not in the registry. Did you typo? If intentional, ignore."`

**Why this design over alternatives:**

- **vs. consult-gate block on `meta_state_report`**: warn-only is the user-confirmed policy. A block would cause agent retries on perfectly valid reports (e.g., intentionally referencing historical ids that have been archived).
- **vs. extending `meta_state_report` to return warnings on write**: not re-runnable. The agent needs a separate call to self-check after a report.
- **vs. extending `meta_state_relationships` to accept `description`**: the relationships tool is for navigating existing relationships. The lint is for catching missing ones. Different jobs; one tool, two args would conflate them.

**Why the structural field is `reopens` only:** the brainstorm locks this. Other relationship fields (`addresses`, `source_refs`, `consolidated_into`, `supersedes`, `origin`, `proposed_design_for`) have their own tools and entry kinds. The `reopens` field on findings is the only one that fits "orphan expired/stale id this new finding re-surfaces."

## Related Code Files

### Create
- `tools/learning-loop-mcp/tools/meta-state-relationship-validate-tool.js` — the tool (~80 lines).
- `tools/learning-loop-mcp/__tests__/meta-state-relationship-validate-tool.test.js` — 4 scenarios (~70 lines).

### Reference
- `tools/learning-loop-mcp/core/meta-state.js:75-77` — `reopens` schema field.
- `tools/learning-loop-mcp/core/loop-introspect.js:209-216` — `reopens_inverse` index (for the inverse lookup, if needed; not used by this tool).
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` — model for read-only tools.

## Implementation Steps

### Step 1: TDD RED — write failing tests

```js
// File: __tests__/meta-state-relationship-validate-tool.test.js
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipValidateTool } from "../tools/meta-state-relationship-validate-tool.js";
import { writeEntry } from "../core/meta-state.js";

const FINDING_ID_REGEX = /meta-\d{6}T\d{4}Z-[a-z0-9-]+/;

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "validate-test-"));
}

async function writeFixture(root, id, status) {
  await writeEntry(root, {
    id,
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: `Fixture for lint test (id=${id}, status=${status}) (min 20 chars)`,
    status,
    created_at: new Date().toISOString(),
    expires_at: status === "expired" ? new Date(Date.now() - 60 * 60 * 1000).toISOString() : null,
    acked_at: null,
    resolved_at: null,
    resolved_by: null,
    version: 0,
  });
}

describe("meta_state_relationship_validate", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  // L1: orphan id + no field → warned
  it("warns when description references an expired id with no reopens field", async () => {
    await writeFixture(root, "meta-260608T1522Z-orphan", "expired");
    const description = "This is related to meta-260608T1522Z-orphan (min 20 chars).";

    const result = await metaStateRelationshipValidateTool.handler({ description });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, true);
    assert.deepEqual(parsed.orphans, ["meta-260608T1522Z-orphan"]);
    assert.ok(parsed.suggestion.includes("reopens"));
  });

  // L2: orphan id + field set → not warned (for the orphan)
  it("does not warn when entry_id has reopens referencing the orphan", async () => {
    await writeFixture(root, "meta-260608T1522Z-claimed", "expired");
    await writeEntry(root, {
      id: "meta-new-finding",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "New finding that reopens meta-260608T1522Z-claimed (min 20 chars).",
      reopens: ["meta-260608T1522Z-claimed"],
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const result = await metaStateRelationshipValidateTool.handler({
      description: "Description text. (min 20 chars)",
      entry_id: "meta-new-finding",
    });
    const parsed = JSON.parse(result.content[0].text);
    // The entry's reopens includes the orphan, so the orphan is claimed.
    // Description doesn't reference any other orphans.
    assert.equal(parsed.warned, false);
  });

  // L3: no ids → not warned
  it("does not warn when description has no finding ids", async () => {
    const result = await metaStateRelationshipValidateTool.handler({
      description: "Just a description with no references (min 20 chars).",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, false);
    assert.deepEqual(parsed.referenced, []);
  });

  // L4: unknown id (not in registry) → warned with unknown_refs
  it("warns with unknown_refs when id is not in registry", async () => {
    const description = "References meta-DOES-NOT-EXIST-123 (min 20 chars).";
    const result = await metaStateRelationshipValidateTool.handler({ description });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, true);
    assert.deepEqual(parsed.unknown_refs, ["meta-DOES-NOT-EXIST-123"]);
  });

  // L5: stale (not just expired) also flagged as orphan
  it("flags stale ids as orphans", async () => {
    await writeFixture(root, "meta-stale-orphan", "stale");
    const description = "References meta-stale-orphan (min 20 chars).";

    const result = await metaStateRelationshipValidateTool.handler({ description });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.warned, true);
    assert.deepEqual(parsed.orphans, ["meta-stale-orphan"]);
  });
});
```

Run: 5 tests should fail (tool doesn't exist).

### Step 2: TDD GREEN — implement the tool

```js
// File: tools/meta-state-relationship-validate-tool.js
import { z } from "zod";
import { readRegistry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const FINDING_ID_REGEX = /meta-\d{6}T\d{4}Z-[a-z0-9-]+/g;
const ORPHAN_STATUSES = new Set(["expired", "stale"]);

export const metaStateRelationshipValidateTool = {
  name: "meta_state_relationship_validate",
  description:
    "Read-only lint: scan a description for finding-id references and warn when any referenced " +
    "id is `expired` or `stale` and the caller has not declared a structural field referencing it. " +
    "Use before meta_state_report to catch orphan cross-references early. " +
    "Returns { warned, orphans, unknown_refs, referenced, suggestion }. " +
    "Pure read; safe to call repeatedly. " +
    "Not for navigating existing relationships (use meta_state_relationships) or creating findings (use meta_state_report).",
  schema: {
    description: z.string().min(1).describe("The description text to lint for finding-id references."),
    entry_id: z.string().optional().describe("Optional id of an existing entry whose `reopens` field should be checked against the referenced ids."),
  },
  handler: async ({ description, entry_id }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);

    const entryById = new Map(entries.map((e) => [e.id, e]));
    const referenced = Array.from(new Set((description.match(FINDING_ID_REGEX) ?? []).filter((s) => FINDING_ID_REGEX.test(s))));

    const claimed = new Set();
    if (entry_id) {
      const entry = entryById.get(entry_id);
      if (entry && Array.isArray(entry.reopens)) {
        for (const id of entry.reopens) claimed.add(id);
      }
    }

    const orphans = [];
    const unknown_refs = [];
    for (const id of referenced) {
      const target = entryById.get(id);
      if (!target) {
        unknown_refs.push(id);
        continue;
      }
      if (ORPHAN_STATUSES.has(target.status) && !claimed.has(id)) {
        orphans.push(id);
      }
    }

    const warned = orphans.length > 0 || unknown_refs.length > 0;
    const result = { warned, referenced };

    if (orphans.length > 0) result.orphans = orphans;
    if (unknown_refs.length > 0) result.unknown_refs = unknown_refs;

    if (orphans.length > 0) {
      result.suggestion = `Pass reopens: ${JSON.stringify(orphans)} on your meta_state_report call. ` +
        `For each expired parent, follow with meta_state_migrate_expired_to_stale({ id: '<parent_id>' }) ` +
        `to bring it into the new lifecycle, then meta_state_resolve({ id: '<parent_id>', cascade_from: ['<new_finding_id>'] }) ` +
        `to close.`;
    } else if (unknown_refs.length > 0) {
      result.suggestion = `${unknown_refs.join(", ")} not in registry. Did you typo? If intentional, ignore.`;
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

Run tests. All 5 should pass.

### Step 3: Register in manifest

Edit `tools/learning-loop-mcp/tools/manifest.json`. Add entry:
```json
{ "file": "./tools/meta-state-relationship-validate-tool.js", "export": "metaStateRelationshipValidateTool" },
```

## Success Criteria

- [ ] L1–L5 pass.
- [ ] Tool is registered in `tools/manifest.json`.
- [ ] Regex correctly extracts finding ids from free-text descriptions.
- [ ] Orphan detection covers `expired` AND `stale` (not just `expired`).
- [ ] `entry_id` with `reopens` claims orphans correctly.
- [ ] Unknown ids (not in registry) are reported separately.
- [ ] Suggestion field provides actionable next step (pass `reopens` + use migrate + cascade resolve).
- [ ] Pure read; no registry writes.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Regex matches non-finding strings (e.g., `meta-state` in markdown) | The regex requires the 6-digit date + 4-digit time + slug pattern. False positives are unlikely but possible. Document the regex pattern in the tool description. |
| Performance: scanning 10K-entry descriptions | The regex is O(description length). The registry lookup is O(1) per id (Set). For 5 ids in a 1KB description, total cost is microseconds. No optimization needed. |
| Tool is called too often (every report) and becomes a tax | The tool is a one-liner in the agent's prompt: "Before reporting, run validate." It's not enforced; the agent chooses. |
| Suggestion text drift (e.g., new tool names added) | Suggestion text is hardcoded in the handler. When the cascade/migrate tools are renamed, update the suggestion. Add a comment near the suggestion pointing at the source-of-truth names. |
| Tool becomes a SPOF for the agent's "X is related to Y" script | The tool is advisory (warn, not block). If it fails, the agent falls back to its existing pattern. No new critical-path dependency. |
