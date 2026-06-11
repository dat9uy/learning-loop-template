---
phase: 2
title: "TDD: implement id + ref_by/ref_field filters"
status: pending
priority: P2
effort: "3h"
dependencies:
  - 1
---

# Phase 2: TDD: implement id + ref_by/ref_field filters

## Overview

TDD-first implementation of the two new filters in `meta_state_list`. Write the failing tests, then implement the schema extension, handler logic, and 13th discoverability hint. Tests stay red until the implementation lands.

## Requirements

- Functional: `meta_state_list` schema accepts `id` (string|string[]), `ref_by` (string), `ref_field` (enum of 6 values).
- Functional: handler applies `ref_by`/`ref_field` first, then `id`, then existing filters.
- Functional: response includes `id`, `ref_by`, `ref_field` in `filters_applied` (with `id` normalized to array).
- Functional: `ref_by` without `ref_field` (and vice versa) returns a structured error, not a throw.
- Functional: scan-backed `ref_field` values (`consolidated_into`, `proposed_design_for`) tolerate the wire-format wrap `{item: [...]}`.
- Non-functional: TDD — test files exist before the implementation, run red, then green.
- Non-functional: 13th hint added to `DISCOVERABILITY_HINTS` and the hook mirror in the same commit.
- Non-functional: warm-tier + cold-session + loop-describe-warm-tier test files updated to 13 in the same commit.

## Architecture

Two new tests files at `tools/learning-loop-mcp/__tests__/`:
- `meta-state-list-id-filter.test.js` — unit tests for the `id` filter
- `meta-state-list-ref-by-filter.test.js` — unit tests for the `ref_by`/`ref_field` filter

The stdio round-trip test (`meta-state-list-id-stdio.test.js`) lives in Phase 3 to keep the implementation phase focused on in-process unit tests.

The handler is extended in-place in `meta-state-list-tool.js`. The filter pipeline becomes:

1. `readRegistry(root)` — unchanged
2. Auto-resolve / expiry check — unchanged
3. **`ref_by`/`ref_field` filter (NEW)** — runs against inverse maps (4 fields) or full scan (2 fields). Builds a `Set` of matching entry ids.
4. **`id` filter (NEW)** — `Set` membership against the requested ids.
5. Existing `filterEntries` — unchanged.
6. Terminal-status + archived exclusion — unchanged.

The order is intentional: `ref_by`/`ref_field` first because it's the most selective (1-hop neighborhood), then `id` (set membership), then the broad filter pass.

## Related Code Files

- Read: `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (current handler)
- Read: `tools/learning-loop-mcp/core/meta-state.js#filterEntries` (existing filter pipeline)
- Read: `tools/learning-loop-mcp/core/loop-introspect.js#buildInverseIndexes` (the 5 inverse maps)

**Create**
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js`
- `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js`

**Modify**
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — extend `schema` and `handler`
- `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` — add 13th hint
- `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` — mirror
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — 12 → 13
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` — 12 → 13
- `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js#HINT_SUGGESTIONS` — add suggestion for 13th hint (keeps the helper symmetric; alias `narrow-query` → 12)
- `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` — add test for new alias

## Implementation Steps

### Step 2.1: Create the TDD test for `id` filter

Create `tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js`:

```javascript
import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "list-id-filter-"));
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

const SEED_ENTRIES = [
  { id: "alpha", entry_kind: "finding", status: "active", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha finding for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
  { id: "beta", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "beta finding for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
  { id: "gamma", entry_kind: "change-log", status: "active", change_dimension: "surface", change_target: "tools/test.js", change_diff: { added: ["id filter"], removed: [], changed: [] }, reason: "gamma change-log for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
];

describe("meta_state_list id filter", () => {
  let root;
  let originalGateRoot;

  before(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    writeRegistry(root, SEED_ENTRIES);
  });

  after(() => {
    process.env.GATE_ROOT = originalGateRoot;
    rmSync(root, { recursive: true, force: true });
  });

  test("id: 'alpha' returns only the alpha entry", async () => {
    const result = await metaStateListTool.handler({ id: "alpha" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
    assert.deepStrictEqual(text.filters_applied.id, ["alpha"]);
  });

  test("id: ['alpha', 'beta'] returns both, no gamma", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "beta"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 2);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta"]);
    assert.deepStrictEqual(text.filters_applied.id, ["alpha", "beta"]);
  });

  test("id: ['nonexistent'] returns empty array", async () => {
    const result = await metaStateListTool.handler({ id: ["nonexistent"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.deepStrictEqual(text.entries, []);
  });

  test("id: ['alpha', 'nonexistent'] silently skips missing", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "nonexistent"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });

  test("id composes with status filter (AND)", async () => {
    // Add a resolved entry
    const resolved = { id: "delta-resolved", entry_kind: "finding", status: "resolved", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "resolved entry for compose test (min 20 chars)", created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), resolved_by: "test" };
    writeFileSync(join(root, "meta-state.jsonl"), [...SEED_ENTRIES, resolved].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ id: ["alpha", "delta-resolved"], status: "active" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });

  test("id composes with entry_kind filter (AND)", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "gamma"], entry_kind: "change-log" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "gamma");
  });

  test("id with no value (undefined) returns all entries (backward compat)", async () => {
    const result = await metaStateListTool.handler({});
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 3);
  });
});
```

Run the test file and confirm it fails (red):

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js 2>&1 | tail -30
```

Expected: `id: 'alpha'` tests fail because the schema rejects the unknown field.

### Step 2.2: Create the TDD test for `ref_by`/`ref_field` filter

Create `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js`:

```javascript
import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "list-ref-by-"));
}

const NOW = new Date().toISOString();

const SEED_ENTRIES = [
  // target finding
  { id: "target-finding", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "target finding for ref_by test (min 20 chars)", created_at: NOW },
  // loop-design that addresses target-finding
  { id: "design-A", entry_kind: "loop-design", status: "active", title: "design A addresses target", description: "design A for ref_by test (min 20 chars)", affected_system: "mcp-tools", proposed_design_for: ["rule-test"], addresses: ["target-finding"], created_at: NOW, created_by: "test" },
  // loop-design that addresses something else
  { id: "design-B", entry_kind: "loop-design", status: "active", title: "design B addresses other", description: "design B for ref_by test (min 20 chars)", affected_system: "mcp-tools", proposed_design_for: ["rule-test"], addresses: ["other-finding"], created_at: NOW, created_by: "test" },
  // finding that reopens target-finding
  { id: "reopener", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "reopener for target-finding (min 20 chars)", created_at: NOW, reopens: ["target-finding"] },
  // finding that consolidates target-finding
  { id: "consolidating-change", entry_kind: "change-log", status: "active", change_dimension: "semantic", change_target: "test.js", change_diff: { added: [], removed: [], changed: [] }, reason: "consolidates target-finding (min 20 chars)", created_at: NOW, consolidates: "target-finding" },
];

describe("meta_state_list ref_by/ref_field filter", () => {
  let root;
  let originalGateRoot;

  before(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    writeFileSync(join(root, "meta-state.jsonl"), SEED_ENTRIES.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  });

  after(() => {
    process.env.GATE_ROOT = originalGateRoot;
    rmSync(root, { recursive: true, force: true });
  });

  test("ref_field=addresses returns the loop-designs that cite target-finding", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "addresses" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "design-A");
    assert.strictEqual(text.filters_applied.ref_by, "target-finding");
    assert.strictEqual(text.filters_applied.ref_field, "addresses");
  });

  test("ref_field=reopens returns findings that re-open target-finding", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "reopens" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "reopener");
  });

  test("ref_field=consolidated_into returns change-logs that consolidate target-finding", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "consolidated_into" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "consolidating-change");
  });

  test("ref_by with no matching entries returns empty array", async () => {
    const result = await metaStateListTool.handler({ ref_by: "nonexistent", ref_field: "addresses" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
  });

  test("ref_by without ref_field returns structured error", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.error, "ref_pair_required");
  });

  test("ref_field without ref_by returns structured error", async () => {
    const result = await metaStateListTool.handler({ ref_field: "addresses" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.error, "ref_pair_required");
  });

  test("ref_by + ref_field + id filter composes (AND)", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "addresses", id: ["design-A", "design-B"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "design-A");
  });

  test("proposed_design_for scan tolerates wire-format wrap {item: [...]}", async () => {
    // Add a loop-design with proposed_design_for wrapped as {item: [...]} (the
    // pre-fix-loop-design-refs shape that meta_state_patch can produce).
    const wrappedDesign = { id: "design-C", entry_kind: "loop-design", status: "active", title: "design C proposed design for target-finding", description: "design C for ref_by wire-format test (min 20 chars)", affected_system: "mcp-tools", proposed_design_for: { item: ["target-finding"] }, addresses: [], created_at: NOW, created_by: "test" };
    const all = [...SEED_ENTRIES, wrappedDesign];
    writeFileSync(join(root, "meta-state.jsonl"), all.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "proposed_design_for" });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.count >= 1, "should find at least design-C");
    assert.ok(text.entries.some((e) => e.id === "design-C"), "design-C should be in results");
  });
});
```

Run the test file and confirm it fails (red):

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js 2>&1 | tail -30
```

Expected: all tests fail because the schema rejects the new fields.

### Step 2.3: Extend the `metaStateListTool` schema and handler

Modify `tools/learning-loop-mcp/tools/meta-state-list-tool.js`:

```javascript
import { z } from "zod";
import {
  readRegistry,
  checkExpiry,
  filterEntries,
  updateEntry,
} from "#mcp/core/meta-state.js";
import { buildInverseIndexes, summarize } from "#mcp/core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const TERMINAL_STATUSES = new Set(["auto-resolved", "resolved", "superseded"]);

const REF_FIELDS = [
  "consolidated_into",
  "supersedes",
  "addresses",
  "proposed_design_for",
  "origin",
  "reopens",
];

// Inverse-map-backed fields are O(1) via buildInverseIndexes.
// Scan-backed fields (consolidated_into, proposed_design_for) iterate
// entries and tolerate the wire-format wrap {item: [...]} that
// meta_state_patch can produce on top-level arrays under passthrough
// ZodObject fields.
const INVERSE_BACKED_REF_FIELDS = new Set([
  "supersedes",
  "addresses",
  "origin",
  "reopens",
]);

function toCompact(entry) {
  const { description_preview, ...rest } = summarize(entry);
  return rest;
}

// Unwrap {item: [...]} -> [...] (the wire-format quirk meta_state_patch can
// produce). Mirrors the helper in core/loop-introspect.js#buildRegistrySummary.
function unwrapItemWrap(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.item)) {
    return value.item;
  }
  return value;
}

export const metaStateListTool = {
  name: "meta_state_list",
  description: "List meta-state registry entries. By default excludes terminal statuses (auto-resolved, resolved, superseded). Runs auto-resolve and expiry checks before returning. Use when you need to inspect, filter, or audit the registry. Pass `compact: true` for a token-efficient view (4KB vs 85KB for 53 entries). The narrow-query filters `id` (string|string[]) and `ref_by`+`ref_field` are the preferred way to fetch a specific entry or its 1-hop neighborhood without dumping the full registry. Not for mutating entries (use `meta_state_patch` or `meta_state_log_change` instead). The legacy `include_expired` parameter was removed in plan 260611-1000-remove-expired-status phase 3; terminal statuses are always excluded by default.",
  schema: {
    category: z.string().optional().describe("Filter by category"),
    status: z.string().optional().describe("Filter by status"),
    affected_system: z.string().optional().describe("Filter by affected system"),
    session_id: z.string().optional().describe("Filter by session_id (idempotency key for hook-emitted findings)"),
    entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()
      .describe("Filter by a single entry kind; default = both (legacy)"),
    entry_kinds: z.array(z.enum(["finding", "change-log", "rule", "loop-design"])).optional()
      .describe("Filter by multiple entry kinds (takes precedence over entry_kind if both set)"),
    id: z.union([z.string(), z.array(z.string())]).optional()
      .describe("Filter by id (string or string[]). Missing ids are silently skipped. Pairs with `ref_by`/`ref_field` for the narrow query path."),
    ref_by: z.string().optional()
      .describe("Filter entries that reference this id in `ref_field`. Required with `ref_field`."),
    ref_field: z.enum(REF_FIELDS).optional()
      .describe("Field used by the `ref_by` filter. Required with `ref_by`."),
    compact: z.boolean().optional().default(false).describe("Return only id, entry_kind, status, and ref fields (~4KB for 53 entries vs ~85KB full)"),
    include_archived: z.boolean().optional().default(false).describe("Include archived entries in results (default false)"),
  },
  handler: async ({ category, status, affected_system, session_id, entry_kind, entry_kinds, id, ref_by, ref_field, compact, include_archived }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const now = new Date().toISOString();
    const updated = [];

    // Validate ref_by/ref_field pair
    if ((ref_by && !ref_field) || (!ref_by && ref_field)) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "ref_pair_required",
          message: "ref_by and ref_field must be set together",
        }) }],
      };
    }

    for (const entry of entries) {
      let newStatus = null;
      const expired = checkExpiry(entry);

      if (expired) {
        newStatus = expired;
      }

      if (newStatus && newStatus !== entry.status) {
        await updateEntry(root, entry.id, { status: newStatus });
        entry.status = newStatus;
      }
      updated.push(entry);
    }

    let result = updated;

    // Filter pipeline order: ref_by/ref_field first (most selective),
    // then id (set membership), then existing filters.

    // Step 1: ref_by/ref_field filter
    if (ref_by && ref_field) {
      let matchingIds = new Set();

      if (INVERSE_BACKED_REF_FIELDS.has(ref_field)) {
        const inverse = buildInverseIndexes(updated);
        const inverseMap = {
          supersedes: inverse.supersedes_inverse,
          addresses: inverse.addresses_inverse,
          origin: inverse.origin_inverse,
          reopens: inverse.reopens_inverse,
        }[ref_field];
        const refs = inverseMap.get(ref_by) || [];
        matchingIds = new Set(refs);
      } else if (ref_field === "consolidated_into") {
        // Scan: pick change-logs where consolidates === ref_by
        for (const e of updated) {
          if (e.entry_kind === "change-log" && e.consolidates === ref_by) {
            matchingIds.add(e.id);
          }
        }
      } else if (ref_field === "proposed_design_for") {
        // Scan: pick loop-designs where proposed_design_for includes ref_by.
        // Tolerate the wire-format wrap {item: [...]}.
        for (const e of updated) {
          if (e.entry_kind === "loop-design") {
            const refs = unwrapItemWrap(e.proposed_design_for);
            if (Array.isArray(refs) && refs.includes(ref_by)) {
              matchingIds.add(e.id);
            }
          }
        }
      }

      result = result.filter((e) => matchingIds.has(e.id));
    }

    // Step 2: id filter
    if (id !== undefined) {
      const idSet = new Set(Array.isArray(id) ? id : [id]);
      result = result.filter((e) => idSet.has(e.id));
    }

    // Step 3: existing filters
    const activeFilters = {
      ...(category && { category }),
      ...(status && { status }),
      ...(affected_system && { affected_system }),
      ...(session_id && { session_id }),
      ...(entry_kind && !entry_kinds && { entry_kind }),
      ...(id !== undefined && { id: Array.isArray(id) ? id : [id] }),
      ...(ref_by && { ref_by }),
      ...(ref_field && { ref_field }),
    };

    if (entry_kinds) {
      result = result.filter((e) => entry_kinds.includes(e.entry_kind));
    } else {
      result = filterEntries(result, activeFilters);
    }

    // Terminal-status + archived exclusion
    const isExplicitStatusFilter = typeof status === "string" && TERMINAL_STATUSES.has(status);
    if (!isExplicitStatusFilter) {
      result = result.filter((e) => !TERMINAL_STATUSES.has(e.status));
    }
    if (!include_archived) {
      result = result.filter((e) => e.status !== "archived");
    }

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_list",
      count: result.length,
      filters_applied: activeFilters,
    });

    const output = {
      entries: compact ? result.map(toCompact) : result,
      count: result.length,
      filters_applied: activeFilters,
      include_archived: include_archived || false,
      entry_kind_filter: entry_kind || null,
      entry_kinds_filter: entry_kinds || null,
      id_filter: id !== undefined ? (Array.isArray(id) ? id : [id]) : null,
      ref_by_filter: ref_by || null,
      ref_field_filter: ref_field || null,
      compact: compact || false,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  },
};
```

### Step 2.4: Run the new tests; they should now pass

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js 2>&1 | tail -30
node --test tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js 2>&1 | tail -30
```

Expected: green.

### Step 2.5: Add the 13th discoverability hint

Modify `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS`:

```javascript
"Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default.",
```

Modify `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` with the same string.

### Step 2.6: Update `HINT_SUGGESTIONS` and `HINT_KEY_MAP` in `loop-get-instruction-tool.js`

```javascript
// HINT_KEY_MAP
"narrow-query": 12,

// HINT_SUGGESTIONS
"Use `meta_state_list({ id: [...] })` for one-call resolution of cross-reference ids; use `{ ref_by, ref_field }` for 1-hop neighborhood queries. Reserve the unfiltered list for batch audit only.",
```

### Step 2.7: Update warm-tier test files

`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`:
- Update `assert.strictEqual(warm.discoverability_hints.length, 12);` to `13`.
- Add the new 13th hint to the destructuring + assertion. The new hint must mention `meta_state_list`, `id:`, and `ref_by`.

`tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js`:
- Update `assert.strictEqual(parsed.discoverability_hints.length, 12);` (2 places: warm + cold) to `13`.
- Update `assert.strictEqual(hints.length, 12);` (in `buildDiscoverabilityHints` test) to `13`.
- Add a 13th destructured `narrowQuery` and assert it mentions `meta_state_list` and `narrow query`.

`tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`:
- Add a test asserting `loopGetInstructionTool.handler({ key: "narrow-query" })` returns the 13th hint.

### Step 2.8: Run the targeted tests

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js 2>&1 | tail -10
node --test tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js 2>&1 | tail -10
node --test tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js 2>&1 | tail -10
node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs 2>&1 | tail -10
node --test tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js 2>&1 | tail -10
```

Expected: all green.

### Step 2.9: Run the existing list tests to confirm no regression

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js 2>&1 | tail -10
node --test tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind.test.js 2>&1 | tail -10
node --test tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind-extended.test.js 2>&1 | tail -10
```

Expected: all green (the `filters_applied` shape gained new fields; existing tests should not assert its exact contents — confirm by reading the test files).

## Success Criteria

- [ ] Step 2.1 + 2.2 test files created and initially fail (red).
- [ ] Step 2.3 schema + handler extended; tests pass (green).
- [ ] Step 2.5 + 2.6 13th hint added to canonical + hook + loop_get_instruction surfaces.
- [ ] Step 2.7 warm-tier + cold-session + loop-get-instruction tests updated to 13.
- [ ] Step 2.8 all targeted tests pass.
- [ ] Step 2.9 existing list tests pass (no regression).
- [ ] No schema or feature removal; additive changes only.

## Risk Assessment

- **Risk**: `buildInverseIndexes` cost is O(N) on every call. **Mitigation**: it's only built when `ref_by`/`ref_field` is set; the existing `readRegistryWithCache` LRU absorbs the read cost.
- **Risk**: `proposed_design_for` scan is O(N) on every call when `ref_field=proposed_design_for`. **Mitigation**: 540KB JSONL, ~5ms scan; same order of magnitude as the current LRU-cached read. Revisit if registry grows past 2MB.
- **Risk**: existing tests assert the `filters_applied` shape exactly. **Mitigation**: read each test file before committing; the new fields are additive so the existing assertions should still pass. If a test breaks, update it with intent documented in the commit message.

## Hand-off to Phase 3

Phase 3 adds the stdio round-trip regression test and runs the full `pnpm check`. The implementation is complete; Phase 3 validates transport + the full test sweep.
