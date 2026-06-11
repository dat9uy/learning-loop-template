---
phase: 3
title: "Tests, regression sweep, and stdio round-trip"
status: pending
priority: P2
effort: "2h"
dependencies:
  - 2
---

# Phase 3: Tests, regression sweep, and stdio round-trip

## Overview

Add a stdio transport regression test for the new `id: string[]` filter to lock the wire-format coercion contract, then run the full `pnpm check` to catch any drift in the existing test suite. The implementation is complete; this phase validates transport + full-coverage regression.

## Requirements

- Functional: stdio round-trip test asserts `meta_state_list({ id: ["a", "b", "c"] })` returns matching entries and the response `id_filter` field echoes the array verbatim.
- Non-functional: full `pnpm check` (validate:records + validate:plan-loop + test) exits 0.
- Non-functional: test count delta is recorded in the closeout journal.
- Non-functional: any test failure surfaces to operator with the file:line reference and the proposed fix scope.

## Architecture

The stdio test uses the `withMcpServer` helper pattern from `wire-format-top-level-coercion.test.js` and `loop-get-instruction.test.js`. It spawns the server as a child process, sends a `tools/call` JSON-RPC message with `meta_state_list` and the `id: string[]` parameter, and asserts the response contains the expected entries.

The test seeds a small registry with 3 entries (a, b, c) and calls `meta_state_list({ id: ["a", "b"] })`. Expected: 2 entries returned; `id_filter` echoes `["a", "b"]`; no `{item: [...]}` wrap on the wire format.

## Related Code Files

- Read: `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` (the `withMcpServer` helper, ~120 lines)
- Read: `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` (the stdio array-input test for `loop_get_instruction`)
- Read: `tools/learning-loop-mcp/server.js` (server entry point — must be in `GATE_ROOT` env)

**Create**
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`

## Implementation Steps

### Step 3.1: Create the stdio round-trip test

Create `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(__dirname));
const serverEntry = join(projectRoot, "tools", "learning-loop-mcp", "server.js");

function copySchemas(tempRoot) {
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(tempRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }
}

async function withMcpServer(fn) {
  const tempRoot = mkdtempSync(join(tmpdir(), "list-id-stdio-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);

  // Seed the registry with 3 entries
  const seedEntries = [
    { id: "alpha", entry_kind: "finding", status: "active", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha for stdio id filter test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "beta", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "beta for stdio id filter test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "gamma", entry_kind: "change-log", status: "active", change_dimension: "surface", change_target: "tools/test.js", change_diff: { added: ["id filter"], removed: [], changed: [] }, reason: "gamma for stdio id filter test (min 20 chars)", created_at: new Date().toISOString() },
  ];
  writeFileSync(
    join(tempRoot, "meta-state.jsonl"),
    seedEntries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "utf8"
  );

  const child = spawn("node", [serverEntry], {
    env: { ...process.env, GATE_ROOT: tempRoot },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextId = 1;
  const pending = new Map();

  const send = (id, method, params) => new Promise((resolve, reject) => {
    const msg = { jsonrpc: "2.0", id, method, params };
    child.stdin.write(JSON.stringify(msg) + "\n");
    pending.set(id, { resolve, reject });
  });

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg.result);
        }
      } catch (err) {
        // Skip non-JSON lines (server logs)
      }
    }
  });

  child.stderr.on("data", () => {}); // Drain stderr

  try {
    await fn({ send, tempRoot });
  } finally {
    child.kill();
  }
}

test("meta_state_list { id: ['alpha', 'beta'] } round-trips top-level array via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send(1, "tools/call", {
      name: "meta_state_list",
      arguments: { id: ["alpha", "beta"], compact: true },
    });
    assert(result.content, "tools/call result missing content");
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 2, `expected 2 entries, got ${text.count}`);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta"]);
    assert.deepStrictEqual(text.id_filter, ["alpha", "beta"]);
  });
});

test("meta_state_list { id: ['alpha', 'nonexistent'] } silently skips missing ids via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send(1, "tools/call", {
      name: "meta_state_list",
      arguments: { id: ["alpha", "nonexistent"], compact: true },
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });
});

test("meta_state_list { ref_by, ref_field } round-trips via stdio", async () => {
  // Extend the seed with a relationship: change-log with consolidates=alpha
  // (test setup is shared via tempRoot re-seeding; we use a separate temp).
  // For simplicity, this test uses the same 3 entries; ref_by=alpha, ref_field=addresses
  // returns 0 entries (no loop-designs in the seed).
  await withMcpServer(async ({ send }) => {
    const result = await send(1, "tools/call", {
      name: "meta_state_list",
      arguments: { ref_by: "alpha", ref_field: "addresses", compact: true },
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.strictEqual(text.ref_by_filter, "alpha");
    assert.strictEqual(text.ref_field_filter, "addresses");
  });
});

test("meta_state_list { ref_by } without ref_field returns structured error via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send(1, "tools/call", {
      name: "meta_state_list",
      arguments: { ref_by: "alpha" },
    });
    // The handler returns the error inside content[0].text as JSON
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.error, "ref_pair_required");
  });
});
```

### Step 3.2: Run the stdio test alone first

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js 2>&1 | tail -40
```

Expected: green. If the array is wrapped as `{item: ["alpha", "beta"]}`, the assertion `text.id_filter` will fail (the wrap would put the array inside `id_filter.item`). The wire-format coercion fix in `meta-260610T1458Z-...` should prevent the wrap; this test is the regression lock.

### Step 3.3: Run the full test suite

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm test 2>&1 | tail -50
```

Expected: all tests pass. Record the test count delta:
- Before: 961 (per the loop-get-instruction closeout journal).
- After: 961 + 4 (id-filter unit) + 8 (ref-by unit) + 4 (stdio) + 1 (loop-get-instruction narrow-query) - N (any consolidated tests) = ~978.

If any pre-existing test fails, do not auto-fix; surface the failure to operator with file:line + proposed fix scope.

### Step 3.4: Run the full check

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm check 2>&1 | tail -30
```

Expected: exit 0. The check is:
1. `pnpm generate:capabilities --dry-run` — capability drift check.
2. `pnpm validate:records` — record schema validation.
3. `pnpm validate:plan-loop` — plan file validation.
4. `pnpm test` — full test sweep.

If capability drift is reported and is pre-existing (unrelated to this plan), note it in the closeout journal under "Out of scope" and continue.

### Step 3.5: Grep for any missed hint-length assertion sites

```bash
cd /home/datguy/codingProjects/learning-loop-template
grep -rn "discoverability_hints.length\|hints.length" tools/learning-loop-mcp __tests__ .factory/hooks 2>/dev/null
```

Every `length === 12` site must now be `length === 13`. The grep output should show no stale `12` references.

### Step 3.6: Confirm no direct file I/O to `meta-state.jsonl` was performed

```bash
cd /home/datguy/codingProjects/learning-loop-template
git diff --stat meta-state.jsonl 2>&1 | tail -5
```

Expected: `meta-state.jsonl` should not appear in the diff (Phase 3 makes no registry mutations; Phase 4 does).

## Success Criteria

- [ ] Step 3.1 stdio test file created.
- [ ] Step 3.2 stdio test passes (green); no `{item: [...]}` wrap.
- [ ] Step 3.3 full `pnpm test` passes; test count delta recorded.
- [ ] Step 3.4 full `pnpm check` exits 0.
- [ ] Step 3.5 no stale `12` references in hint-length assertions.
- [ ] Step 3.6 `meta-state.jsonl` is untouched (no diff).

## Risk Assessment

- **Risk**: stdio test flaky due to child process startup timing. **Mitigation**: the `withMcpServer` helper has been battle-tested in `wire-format-top-level-coercion.test.js` and `loop-get-instruction.test.js`; same pattern.
- **Risk**: a pre-existing test breaks due to the new `filters_applied` shape. **Mitigation**: read the failing test, assess if the assertion is exact-shape (then update) or field-set (then no update needed). Document any change in the closeout journal.
- **Risk**: `pnpm generate:capabilities` reports drift unrelated to this plan. **Mitigation**: note in the closeout journal under "Out of scope"; the plan does not ship capability changes.

## Hand-off to Phase 4

Phase 4 performs the registry mutations: reactivate the design, ship change-logs, resolve the originating finding, return the design to `inactive` with `shipped_in_plan`, and write the closeout journal.
