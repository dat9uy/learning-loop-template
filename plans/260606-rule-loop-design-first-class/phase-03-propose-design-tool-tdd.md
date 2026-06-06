---
phase: 3
title: "New tool: meta_state_propose_design + meta_state_list filter accepts new entry_kinds (TDD)"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: New tool + extended filter (TDD)

## Overview

Ship a new MCP tool `meta_state_propose_design` (the canonical way to emit `entry_kind: "loop-design"` entries) and extend `meta_state_list`'s `entry_kind` filter to accept the 2 new entry_kinds. The tool mirrors `meta_state_log_change`'s shape (id auto-generated, source_refs not required, append-only) with the addition of `addresses: string[]` (the findings the design responds to) and `proposed_design_for: string[]` (the rules/schemas/tools the design will create/modify). Idempotency guard: if a loop-design with the same `addresses` set + same `proposed_design_for` set is already active, return its id (no duplicate). 4-6 new tests cover the tool and the extended filter. The sibling plan 260606-cold-session-test-rule-promotion's `checkResolutionEvidence` consult pattern is a useful reference but is NOT extended to gate `meta_state_propose_design` in this plan (out of scope per Locked #8).

## Requirements

### Functional

**New MCP tool `meta_state_propose_design` in `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js`:**

1. **Schema** (uses `metaStateLoopDesignSchema.shape` from Phase 1, plus the canonical `id`, `entry_kind`, `created_at`, `created_by` fields auto-populated):
   ```js
   {
     title: z.string().min(10).describe("Short human-readable title"),
     description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
     proposed_design_for: z.array(z.string()).min(1)
       .describe("Forward: ids of rules/schemas/tools this design will create or modify"),
     addresses: z.array(z.string()).default([])
       .describe("Backward: ids of findings this design responds to"),
     affected_system: z.enum([
       "gate-logic", "record-validation", "index-extractor",
       "mcp-tools", "workflow-registry", "vnstock_vendor",
     ]).describe("Which system this design affects"),
     severity_hint: z.enum(["low", "medium", "high"]).optional()
       .describe("Operator's read on the urgency of shipping this design"),
     loop_design_id: z.string().optional()
       .describe("Optional explicit id (loop-design-<slug>). If omitted, the id is auto-generated from the title."),
   }
   ```

2. **Handler logic:**
   - Resolve root via `resolveRoot()`
   - Read registry via `readRegistry(root)`
   - **Idempotency check:** if `loop_design_id` is provided, check for an existing `entry_kind: "loop-design"` entry with the same `id`; if found, return `{ proposed: false, reason: "already_exists", id, existing_entry }` (no write)
   - **Idempotency check (alternate):** if `addresses` set + `proposed_design_for` set matches an existing active loop-design's `addresses` set + `proposed_design_for` set, return the existing entry's id (no write). This is the canonical idempotency key per Locked #9: same `addresses + proposed_design_for` set equality returns the existing entry id, no duplicate.
   - **Id generation:** if `loop_design_id` is not provided, generate via `slugify(title)` prepended with `loop-design-` (e.g., `loop-design-cross-reference-fields`). If the auto-generated id collides with an existing entry, return `{ proposed: false, reason: "id_collision", generated_id }` (operator must provide explicit `loop_design_id` or change the title).
   - **Validation:** parse the constructed entry against `metaStateLoopDesignSchema` (Phase 1's schema). If validation fails, return `{ proposed: false, reason: "validation_failed", errors }`.
   - **Write:** call `writeEntry(root, entry)` (per-root write queue)
   - **Audit log:** `appendGateLog(root, { timestamp, tool: "meta_state_propose_design", id, title, addresses_count, proposed_design_for_count })`
   - **Return:** `{ proposed: true, id, status: "active", entry }` on success

3. **Entry shape** (matches `metaStateLoopDesignSchema`):
   ```js
   {
     id: loop_design_id || `loop-design-${slugify(title)}`,
     entry_kind: "loop-design",
     title,
     status: "active",
     proposed_design_for,
     addresses,
     description,
     affected_system,
     ...(severity_hint && { severity_hint }),
     created_at: new Date().toISOString(),
     created_by: "operator",
   }
   ```

**`meta_state_list` filter extension in `tools/learning-loop-mcp/tools/meta-state-list-tool.js`:**

4. **Schema update** (line 23):
   - Before: `entry_kind: z.enum(["finding", "change-log"]).optional()`
   - After: `entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()`
   - The filter `filterEntries(updated, activeFilters)` (line 56 in `core/meta-state.js`) accepts the new values; the function is unchanged

5. **No new filter logic:** the existing `filterEntries` is generic over `entry_kind`; the extension is just adding the 2 new values to the zod enum. The output shape (`{ entries, count, filters_applied, include_expired, entry_kind_filter }`) is unchanged.

6. **Cross-kind filter support:** operators can pass `entry_kind: ["rule", "loop-design"]` (array) to get both. The current zod enum is a single value; the extension to an array requires either a `z.union([z.enum([...]), z.array(z.enum([...]))])` or a separate `entry_kinds: z.array(z.string()).optional()` field. Decision: add a separate `entry_kinds` field for array filtering; keep `entry_kind` as a single-value filter for backward compat.

   ```js
   entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()
     .describe("Filter by a single entry kind; default = both (legacy)"),
   entry_kinds: z.array(z.enum(["finding", "change-log", "rule", "loop-design"])).optional()
     .describe("Filter by multiple entry kinds (takes precedence over entry_kind if both set)"),
   ```

7. **Handler update** (line 24-58): the `activeFilters` construction adds `entry_kinds` if provided; the `filterEntries` call passes the array (the function already accepts a single value; the new path uses a custom array filter):
   ```js
   let result;
   if (activeFilters.entry_kinds) {
     result = updated.filter((e) => activeFilters.entry_kinds.includes(e.entry_kind));
   } else {
     result = filterEntries(updated, activeFilters);
   }
   ```

### Non-functional

- The new tool is registered in `tools/learning-loop-mcp/tools/manifest.json` (the manifest is read by `server.js#loadManifest` at server startup). One new line:
  ```json
  { "file": "./tools/meta-state-propose-design-tool.js", "export": "metaStateProposeDesignTool" }
  ```

- The new tool follows the same shape as `meta_state_log_change` (per Locked #9: idempotency; canonical MCP-tool-emitted entries). Direct file I/O via `writeEntry` is still supported (Phase 0 + Phase 2 used it), but the new tool is the recommended way for future emissions.

- The new tool does NOT consult `checkResolutionEvidence` (Locked #8: out of scope). The sibling plan 260606-cold-session-test-rule-promotion's `checkResolutionEvidence` consults `meta_state_resolve`; the inverse (a `checkDesignEvidence` consult for `meta_state_propose_design`) is a future plan.

## Architecture

```
            ┌────────────────────────────────────────────────────┐
            │ Phase 3 deliverable                               │
            └──────────────────────┬─────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
  │ New tool           │  │ Extended filter    │  │ Manifest           │
  │ meta_state_propose │  │ meta_state_list    │  │ (1 new line)       │
  │ _design            │  │ entry_kind: rule   │  │                    │
  │                    │  │ entry_kind: loop   │  │                    │
  │ + idempotency      │  │ -design            │  │                    │
  │ + validation       │  │ + entry_kinds[]    │  │                    │
  │ + audit log        │  │                    │  │                    │
  └────────────────────┘  └────────────────────┘  └────────────────────┘
```

## Related Code Files

- **Create:** `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` — the new tool
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-propose-design-tool.test.js` — 4-5 new tests
- **Modify:** `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — extend `entry_kind` enum + add `entry_kinds` array filter
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind-extended.test.js` — 2-3 new tests
- **Modify:** `tools/learning-loop-mcp/tools/manifest.json` — add 1 new line
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js#writeEntry`, `#readRegistry`, `#metaStateLoopDesignSchema` (Phase 1)
- **Read-only:** `tools/learning-loop-mcp/core/slugify.js` — slug helper
- **Read-only:** `tools/learning-loop-mcp/lib/gate-logging.js#appendGateLog` — audit log helper

## Implementation Steps

### Step 1: Write the 4-5 new tool tests (TDD red)

Create `tools/learning-loop-mcp/__tests__/meta-state-propose-design-tool.test.js`:

```js
// meta-state-propose-design-tool.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js";
import { readRegistry } from "#mcp/core/meta-state.js";

function setupFixture() {
  return mkdtempSync(join(tmpdir(), "meta-propose-"));
}

async function call(args) {
  return JSON.parse((await metaStateProposeDesignTool.handler(args)).content[0].text);
}

test("meta_state_propose_design writes a new loop-design entry with auto-generated id", async () => {
  const root = setupFixture();
  process.chdir(root);
  // (resolveRoot uses process.cwd() in tests; in real use, it finds the project root)

  const result = await call({
    title: "Cross-reference fields on rule and loop-design schemas",
    description: "Adds typed cross-reference fields (proposed_design_for, addresses, origin) to the new rule and loop-design schemas. This eliminates the need for a generic related_to field on findings.",
    proposed_design_for: ["metaStateRuleEntrySchema", "metaStateLoopDesignSchema"],
    addresses: ["meta-260606T1543Z-meta-state-cross-reference-field-design"],
    affected_system: "mcp-tools",
  });

  assert.equal(result.proposed, true);
  assert.equal(result.id, "loop-design-cross-reference-fields-on-rule-and-loop-design-schema");
  assert.equal(result.status, "active");

  const entries = readRegistry(root);
  const written = entries.find((e) => e.id === result.id);
  assert(written, "written entry not found in registry");
  assert.equal(written.entry_kind, "loop-design");
  assert.equal(written.title, "Cross-reference fields on rule and loop-design schemas");
  assert.deepEqual(written.addresses, ["meta-260606T1543Z-meta-state-cross-reference-field-design"]);
});

test("meta_state_propose_design idempotency: same addresses + proposed_design_for returns existing id", async () => {
  const root = setupFixture();
  process.chdir(root);

  const args = {
    title: "Test design 1",
    description: "First call to the tool with these addresses and proposed_design_for.",
    proposed_design_for: ["rule-x", "rule-y"],
    addresses: ["meta-260601T0000Z-finding-1"],
    affected_system: "mcp-tools",
  };

  const first = await call(args);
  assert.equal(first.proposed, true);

  // Second call with same addresses + proposed_design_for (different title) returns the existing id
  const second = await call({ ...args, title: "Different title for the same design" });
  assert.equal(second.proposed, false);
  assert.equal(second.reason, "already_exists_by_addresses_and_proposed_design_for");
  assert.equal(second.existing_id, first.id);

  const entries = readRegistry(root);
  const designCount = entries.filter((e) => e.entry_kind === "loop-design").length;
  assert.equal(designCount, 1, "duplicate loop-design entry was written");
});

test("meta_state_propose_design idempotency: explicit loop_design_id collision returns reason=already_exists", async () => {
  const root = setupFixture();
  process.chdir(root);

  const first = await call({
    title: "First design",
    description: "First call with explicit loop_design_id.",
    proposed_design_for: ["rule-z"],
    addresses: [],
    affected_system: "gate-logic",
    loop_design_id: "loop-design-explicit",
  });
  assert.equal(first.proposed, true);

  const second = await call({
    title: "Second design with same explicit id",
    description: "Second call with the same loop_design_id.",
    proposed_design_for: ["rule-z"],
    addresses: [],
    affected_system: "gate-logic",
    loop_design_id: "loop-design-explicit",
  });
  assert.equal(second.proposed, false);
  assert.equal(second.reason, "already_exists");
  assert.equal(second.id, "loop-design-explicit");
});

test("meta_state_propose_design validates against metaStateLoopDesignSchema (rejects empty proposed_design_for)", async () => {
  const root = setupFixture();
  process.chdir(root);

  const result = await call({
    title: "Invalid design with empty proposed_design_for",
    description: "This should be rejected because proposed_design_for is empty.",
    proposed_design_for: [],  // INVALID: must be non-empty
    addresses: [],
    affected_system: "mcp-tools",
  });

  assert.equal(result.proposed, false);
  assert.equal(result.reason, "validation_failed");
});

test("meta_state_propose_design auto-generated id collision returns reason=id_collision", async () => {
  const root = setupFixture();
  process.chdir(root);

  // First design with a title that slugifies to "loop-design-foo"
  const first = await call({
    title: "Foo",
    description: "First design with title 'Foo' — slugifies to 'foo'.",
    proposed_design_for: ["rule-a"],
    addresses: [],
    affected_system: "mcp-tools",
  });
  assert.equal(first.proposed, true);

  // Second design with a title that also slugifies to "foo" but different proposed_design_for
  // (so the addresses+proposed_design_for idempotency check doesn't catch it)
  const second = await call({
    title: "Foo",  // same title → same auto-generated id
    description: "Second design with the same title 'Foo' but different proposed_design_for.",
    proposed_design_for: ["rule-b"],  // different → no idempotency match
    addresses: [],
    affected_system: "mcp-tools",
  });
  assert.equal(second.proposed, false);
  assert.equal(second.reason, "id_collision");
  assert(second.generated_id.startsWith("loop-design-foo"));
});
```

Run the tests to confirm RED: the tool doesn't exist yet; the import fails.

### Step 2: Write the new tool (TDD green)

Create `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js`:

```js
import { z } from "zod";
import {
  readRegistry,
  writeEntry,
  metaStateLoopDesignSchema,
} from "#mcp/core/meta-state.js";
import { slugify } from "#mcp/core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Set equality for arrays of strings (order-independent).
 * Returns true if both arrays contain the same elements, regardless of order.
 */
function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const aSet = new Set(a);
  for (const x of b) if (!aSet.has(x)) return false;
  return true;
}

export const metaStateProposeDesignTool = {
  name: "meta_state_propose_design",
  description: "Propose a new loop-design entry. Loop-designs are deferred designs with their own lifecycle (active → inactive when shipped). Use this for designs that will create or modify rules, schemas, or tools. Mirrors meta_state_log_change's append-only semantics with the addition of proposed_design_for (forward: what the design ships) and addresses (backward: what findings the design responds to). Idempotent: same addresses + proposed_design_for set returns the existing entry id.",
  schema: {
    title: z.string().min(10).describe("Short human-readable title"),
    description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
    proposed_design_for: z.array(z.string()).min(1)
      .describe("Forward: ids of rules/schemas/tools this design will create or modify (non-empty)"),
    addresses: z.array(z.string()).default([])
      .describe("Backward: ids of findings this design responds to"),
    affected_system: z.enum([
      "gate-logic", "record-validation", "index-extractor",
      "mcp-tools", "workflow-registry", "vnstock_vendor",
    ]).describe("Which system this design affects"),
    severity_hint: z.enum(["low", "medium", "high"]).optional()
      .describe("Operator's read on the urgency of shipping this design"),
    loop_design_id: z.string().optional()
      .describe("Optional explicit id (loop-design-<slug>). If omitted, the id is auto-generated from the title."),
  },
  handler: async ({
    title,
    description,
    proposed_design_for,
    addresses,
    affected_system,
    severity_hint,
    loop_design_id,
  }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);

    // Idempotency check 1: explicit loop_design_id collision
    if (loop_design_id) {
      const existing = entries.find(
        (e) => e.id === loop_design_id && e.entry_kind === "loop-design"
      );
      if (existing) {
        const result = {
          proposed: false,
          reason: "already_exists",
          id: loop_design_id,
          existing_entry: existing,
        };
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_propose_design",
          ...result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    }

    // Idempotency check 2: same addresses + proposed_design_for set (the canonical key per Locked #9)
    const existingByKey = entries.find(
      (e) =>
        e.entry_kind === "loop-design" &&
        e.status === "active" &&
        setsEqual(e.addresses, addresses) &&
        setsEqual(e.proposed_design_for, proposed_design_for)
    );
    if (existingByKey) {
      const result = {
        proposed: false,
        reason: "already_exists_by_addresses_and_proposed_design_for",
        existing_id: existingByKey.id,
        existing_entry: existingByKey,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_propose_design",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Id generation
    const generated_id = loop_design_id || `loop-design-${slugify(title)}`;

    // Idempotency check 3: auto-generated id collision (only if no explicit id was provided)
    if (!loop_design_id) {
      const idCollision = entries.find(
        (e) => e.id === generated_id && e.entry_kind === "loop-design"
      );
      if (idCollision) {
        const result = {
          proposed: false,
          reason: "id_collision",
          generated_id,
          note: "Provide an explicit loop_design_id or change the title.",
        };
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_propose_design",
          ...result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    }

    // Construct the entry
    const now = new Date().toISOString();
    const entry = {
      id: generated_id,
      entry_kind: "loop-design",
      title,
      status: "active",
      proposed_design_for,
      addresses,
      description,
      affected_system,
      ...(severity_hint && { severity_hint }),
      created_at: now,
      created_by: "operator",
    };

    // Validate against the schema (Phase 1)
    const validation = metaStateLoopDesignSchema.safeParse(entry);
    if (!validation.success) {
      const result = {
        proposed: false,
        reason: "validation_failed",
        errors: validation.error.format(),
      };
      appendGateLog(root, {
        timestamp: now,
        tool: "meta_state_propose_design",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Write
    await writeEntry(root, entry);

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_propose_design",
      id: generated_id,
      title,
      addresses_count: addresses.length,
      proposed_design_for_count: proposed_design_for.length,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          proposed: true,
          id: generated_id,
          status: "active",
          entry,
        }),
      }],
    };
  },
};
```

### Step 3: Register the new tool in the manifest

Edit `tools/learning-loop-mcp/tools/manifest.json`. Add 1 line after the `meta-state-promote-rule-tool` line:

```json
{ "file": "./tools/meta-state-propose-design-tool.js", "export": "metaStateProposeDesignTool" },
```

### Step 4: Extend `meta_state_list` filter (TDD red then green)

Create `tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind-extended.test.js`:

```js
// meta-state-list-entry-kind-extended.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "#mcp/tools/meta-state-list-tool.js";
import { writeEntry, generateId } from "#mcp/core/meta-state.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "meta-list-"));
  // Write a mixed registry: 1 finding + 1 change-log + 1 rule + 1 loop-design
  writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");
  return root;
}

async function call(args) {
  return JSON.parse((await metaStateListTool.handler(args)).content[0].text);
}

test("meta_state_list with entry_kind='rule' returns only rule entries", async () => {
  const root = setupFixture();
  process.chdir(root);
  await writeEntry(root, {
    id: "rule-test-1",
    entry_kind: "rule",
    origin: "meta-test-origin",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "test-pattern",
    description: "Test rule description that is at least 20 characters long.",
    status: "active",
    promoted_at: "2026-06-06T20:00:00.000Z",
    promoted_by: "operator",
  });
  await writeEntry(root, {
    id: generateId("test-finding"),
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Test finding description that is at least 20 characters long.",
    status: "active",
    created_at: "2026-06-06T20:00:00.000Z",
  });

  const result = await call({ entry_kind: "rule" });
  assert.equal(result.count, 1);
  assert.equal(result.entries[0].id, "rule-test-1");
  assert.equal(result.entries[0].entry_kind, "rule");
});

test("meta_state_list with entry_kind='loop-design' returns only loop-design entries", async () => {
  // ...similar to the rule test
});

test("meta_state_list with entry_kinds=['rule', 'loop-design'] returns both", async () => {
  // ...writes 1 rule + 1 loop-design + 1 finding; calls with entry_kinds=['rule', 'loop-design']; asserts count=2
});
```

Edit `tools/learning-loop-mcp/tools/meta-state-list-tool.js` lines 23-58:

```js
schema: {
  // ... existing fields
  entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()
    .describe("Filter by a single entry kind; default = both (legacy)"),
  entry_kinds: z.array(z.enum(["finding", "change-log", "rule", "loop-design"])).optional()
    .describe("Filter by multiple entry kinds (takes precedence over entry_kind if both set)"),
},

handler: async ({ category, status, affected_system, include_expired, entry_kind, entry_kinds }) => {
  // ... existing logic

  let result;
  if (entry_kinds) {
    result = updated.filter((e) => entry_kinds.includes(e.entry_kind));
  } else {
    result = filterEntries(updated, activeFilters);
  }

  // ... existing logic
}
```

### Step 5: Run the full test suite

```bash
cd tools/learning-loop-mcp && node --test __tests__/meta-state-propose-design-tool.test.js __tests__/meta-state-list-entry-kind-extended.test.js __tests__/meta-state-rule-schema.test.js __tests__/meta-state-loop-design-schema.test.js __tests__/meta-state-promote-rule-rule-entry.test.js __tests__/migrate-rule-entry-kind.test.js __tests__/meta-state-schema.test.js __tests__/gate-promoted-rules.test.js __tests__/gate-scope-predicate.test.js __tests__/gate-resolution-evidence.test.js __tests__/integration-promoted-rule.test.js __tests__/meta-state-list-entry-kind.test.js
```

All 12 test files pass: 4-5 new tool tests + 2-3 new filter tests + the prior 10-14 Phase 1 tests + 4 Phase 2 migration tests + 1 existing `meta-state-list-entry-kind` test (regression for the legacy filter) + 4 existing rule test files (regression for the gate logic).

## Success Criteria

- [ ] `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` exists and is registered in `manifest.json`
- [ ] Calling the tool with `title`, `description`, `proposed_design_for`, `addresses`, `affected_system` writes a new `entry_kind: "loop-design"` entry to `meta-state.jsonl`
- [ ] Idempotency check 1 works: explicit `loop_design_id` collision returns `{ proposed: false, reason: "already_exists" }`
- [ ] Idempotency check 2 works: same `addresses` + `proposed_design_for` set (regardless of title) returns the existing entry's id
- [ ] Idempotency check 3 works: auto-generated `id` collision returns `{ proposed: false, reason: "id_collision" }`
- [ ] Validation works: empty `proposed_design_for` returns `{ proposed: false, reason: "validation_failed" }`
- [ ] `meta_state_list({ entry_kind: "rule" })` returns 4 entries (the 4 migrated rules from Phase 2)
- [ ] `meta_state_list({ entry_kind: "loop-design" })` returns 3 entries (the 3 migrated loop-designs from Phase 2)
- [ ] `meta_state_list({ entry_kinds: ["rule", "loop-design"] })` returns 6 entries (4 rules + 2 loop-designs)
- [ ] `meta_state_list({ entry_kind: "finding" })` returns the same entries as before Phase 1 (the source findings stay; their `promoted_to_rule` is now a string)
- [ ] `meta_state_list({ entry_kind: "change-log" })` returns the Phase 0 change-log + all prior change-logs
- [ ] `__tests__/meta-state-propose-design-tool.test.js` has 4-5 tests, all pass
- [ ] `__tests__/meta-state-list-entry-kind-extended.test.js` has 2-3 tests, all pass
- [ ] `tools/manifest.json` has 1 new line for the new tool
- [ ] All ~580+ existing tests still pass (the 4 Phase 2 migration tests + 10-14 Phase 1 tests + 573 baseline = ~580)
- [ ] `git status --porcelain` shows: 2 new files (the tool + the test), 1 modified test file, 1 modified manifest

## Risk Assessment

- **Risk 1:** The `loop_design_id` auto-generation (`loop-design-${slugify(title)}`) might collide with future operator-created entries. Mitigation: idempotency check 3 catches the collision and returns `id_collision`; the operator provides an explicit `loop_design_id` or changes the title.
- **Risk 2:** The idempotency key (`addresses + proposed_design_for` set equality) might be too aggressive: two semantically distinct designs with the same key would be merged. Mitigation: the operator can pass explicit `loop_design_id` to force a separate entry; the merged design's `description` and `title` would diverge from the original, but the `proposed_design_for` + `addresses` sets are the canonical "what is this design" definition. If a future plan adds `description`-based disambiguation, the idempotency key can be extended.
- **Risk 3:** The new tool's `description: "Loop-designs are deferred designs..."` is verbose. Agents might be confused by the long description. Mitigation: the tool's `description` field is a top-level hint; the `entry.description` field is the human-readable summary. The two are different.
- **Risk 4:** The `meta_state_list` filter extension breaks the existing `__tests__/meta-state-list-entry-kind.test.js` test if it expects the old enum. Mitigation: the existing test uses `entry_kind: "finding"` and `entry_kind: "change-log"`, both of which are still valid. The extension is additive.
- **Risk 5:** The new tool's `metaStateLoopDesignSchema.safeParse` validation runs after id generation. If the auto-generated id is `loop-design-` (with empty slug, e.g., title is all punctuation), the schema's `id: z.string()` accepts it (the schema has no format constraint on `id` for loop-designs, unlike the rule's `id: z.string().regex(/^rule-[a-z0-9-]+$/)`). Mitigation: the auto-generation uses `slugify` which strips non-alphanumeric chars; if the result is empty, the id is `loop-design-` (6 chars). The schema accepts this. A future plan could tighten the loop-design id format to `^loop-design-[a-z0-9-]+$`.
- **Risk 6:** The new tool writes to `meta-state.jsonl` directly via `writeEntry`. The MCP server's gate (inbound gate) might block direct writes to `meta-state.jsonl` (the write gate blocks `records/**` paths, but `meta-state.jsonl` is at the project root, not under `records/`). Verification: read the write gate pattern in `core/gate-logic.js` — `meta-state.jsonl` is NOT in the `records/**` blocklist, so direct writes are allowed. Confirmed by the prior phases (Phase 0 + Phase 2 used direct I/O).

## TDD Tests Added (this phase)

| Test File | Test Count | Asserts |
|-----------|------------|---------|
| `__tests__/meta-state-propose-design-tool.test.js` (new) | 4-5 | writes new entry; idempotency by addresses+proposed_design_for; idempotency by explicit id; validation failure (empty proposed_design_for); id collision |
| `__tests__/meta-state-list-entry-kind-extended.test.js` (new) | 2-3 | single-kind filter (rule); single-kind filter (loop-design); multi-kind filter (entry_kinds=array) |

**Total: 6-8 new tests across 2 new files; 0 regressions in the ~580 prior tests.**

## References

- `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` — the sibling tool whose shape `meta_state_propose_design` mirrors
- `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema` (Phase 1) — the schema validated against
- `tools/learning-loop-mcp/core/meta-state.js#writeEntry` — the per-root write queue
- `tools/learning-loop-mcp/core/slugify.js` — slug helper for the auto-generated id
- `tools/learning-loop-mcp/lib/gate-logging.js#appendGateLog` — the audit log helper
- `tools/learning-loop-mcp/tools/manifest.json` — the tool list
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — the filter extension
- Locked Decisions #8, #9 in `plan.md` — no consultation, idempotency by set equality
