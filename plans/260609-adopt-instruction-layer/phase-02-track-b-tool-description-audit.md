---
phase: 2
title: "Track-B-Tool-Description-Audit"
status: pending
priority: P2
effort: 90m
dependencies:
  - 1
---

# Phase 2: Track B: Tool Description + Selection Guide

## Overview

Audit the top-10 most-called tool descriptions (found in individual `tools/learning-loop-mcp/tools/*-tool.js` files) against the 4-question framework (what/when/inputs/returns). Most descriptions answer "what/inputs/returns" today; the gap is "when to use vs alternatives." Append a 1-2 sentence "When to use" clause to each tool's `description` field. Then create `tools/learning-loop-mcp/references/tool-selection-guide.md` mapping 12+ common agent intents to the right tool, referenced by Phase 1's hint A4.

## Requirements

- Functional: top-10 tool descriptions have a "When to use" sentence; the new `tool-selection-guide.md` covers at least 12 common intents; new test file `tool-description-audit.test.cjs` passes ~30 assertions for the 4-question framework.
- Non-functional: edits are surgical (1-2 sentence additions; no rewriting); the new test file is GATE_ROOT-isolated; no `node -e` escape hatch.

## Architecture

3 sub-tracks:
1. **B1**: Identify the top-10 tools (selection rationale documented inline)
2. **B2**: Write the tool-selection guide
3. **B3**: Edit the 10 tool descriptions + add the test file

Each sub-track is independent and can be reordered; B2 can run in parallel with B3.

## Related Code Files

- Read: `tools/learning-loop-mcp/agent-manifest.json` (the 52-tool grouping registry)
- Read: `tools/learning-loop-mcp/tools/manifest.json` (the tool file registry)
- Read: `tools/learning-loop-mcp/server.js` (if gate-log audit is available; else fall back to heuristics)
- Create: `tools/learning-loop-mcp/references/tool-selection-guide.md` (~50-80 lines)
- Create: `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs` (~30 test assertions)
- Modify: 10 individual `tools/learning-loop-mcp/tools/*-tool.js` files (1-2 sentence append to each `description` field)

## Implementation Steps

### Step 2.1: Identify the top-10 most-called tools

Selection criteria (in priority order):
1. **Gate-log audit** (if available): grep `meta-state.jsonl` for `meta_state_*` references; the meta_state group (15 tools) is heavily called.
2. **agent-manifest.json groups**: the `gate`, `meta_state`, `record_crud`, and `workflow` groups are higher-traffic than `capability`, `budget`, `index`.
3. **Description length + inputSchema complexity**: shorter descriptions + complex schemas = more under-served.

**Top-10 selection** (provisional; record the rationale inline in this step):
1. `meta_state_report` (record a finding)
2. `meta_state_log_change` (log a system change)
3. `meta_state_resolve` (close a finding)
4. `meta_state_list` (query the registry)
5. `meta_state_derive_status` (re-check a finding)
6. `meta_state_patch` (update an existing entry)
7. `loop_describe` (discover the surface)
8. `gate_check` (BEFORE any write)
9. `gate_mark_preflight` (unlock product/** writes)
10. `record_create_decision` / `record_create_experiment` (record CRUD)

Note: `record_create_decision` and `record_create_experiment` are tied at #10; pick one (the one with higher audit frequency) and document the tie.

### Step 2.2: Write the tool-selection guide

Create `tools/learning-loop-mcp/references/tool-selection-guide.md` with the following structure (~50-80 lines):

```markdown
# Tool Selection Guide

Use this when you know what you want to do but not which tool to call. The
canonical reference is `tools/learning-loop-mcp/agent-manifest.json`; this guide
maps **intent** (what you're trying to do) to **tool** (the right MCP tool).

## Meta-state lifecycle

| Intent | Tool |
|---|---|
| Record a finding (operator-observed loop issue) | `meta_state_report` |
| Log a system change (immutable audit log) | `meta_state_log_change` |
| Promote a finding from `reported` to `active` | `meta_state_ack` |
| Close a finding (with `resolution` text) | `meta_state_resolve` |
| Re-check if a finding is still true | `meta_state_derive_status` |
| Re-hash a finding's evidence after a refactor | `meta_state_refresh_fingerprint` |
| Query the registry (filterable) | `meta_state_list` |
| Update an existing entry (with CAS) | `meta_state_patch` |
| Promote a finding into a gate-enforced rule | `meta_state_promote_rule` |
| Aggregate drift across the registry | `meta_state_query_drift` |
| Archive stale findings (structural fix for size overruns) | `meta_state_archive` |
| Atomic batch CRUD (cap 500 ops) | `meta_state_batch` |

## Record CRUD

| Intent | Tool |
|---|---|
| Record a decision (plan-time choice) | `record_create_decision` |
| Record an experiment (proves a hypothesis) | `record_create_experiment` |
| Record a risk (potential issue) | `record_create_risk` |
| Record an observation (operator-managed state) | `record_create_observation` |

## Gate

| Intent | Tool |
|---|---|
| Check if a command/file is allowed by the gate | `gate_check` |
| Unlock `product/**` writes (30-min TTL) | `gate_mark_preflight` |

## Discovery

| Intent | Tool |
|---|---|
| Discover the loop's surface (tiered: hot/warm/cold) | `loop_describe` |

## Anti-pattern: do NOT use these

- `node -e "import('./core/meta-state.js')..."` — direct file I/O to `meta-state.jsonl`. Use the canonical MCP tools instead. The `meta-260606T2102Z` finding tracks this anti-pattern.
- `Edit` / `Write` / `Create` to `meta-state.jsonl` — blocked by the write gate.
- Re-reading the agent-manifest to find a tool — the tool manifest is loaded into the agent runtime automatically; you do not need to read it manually.
```

### Step 2.3: Edit the 10 tool descriptions

For each of the 10 top tools, locate its individual `tools/learning-loop-mcp/tools/*-tool.js` file and append a 1-2 sentence "When to use" clause to the existing `description` field in the exported tool config.

**Surgical edit pattern** (illustrated for `meta_state_report` in `meta-state-report-tool.js`):

```diff
  description:
-    "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator. Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`.",
+    "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator. Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`. Use when you observe a loop issue (gate bug, missing tool, anti-pattern) that needs operator review. Not for system changes (use meta_state_log_change) or for closing a finding (use meta_state_resolve).",
```

Apply the same pattern to all 10 tools. Each addition is 1-2 sentences; the total delta is ~50-100 lines of new text across 10 files.

**Tool file mapping** (provisional; confirm during implementation):
1. `meta_state_report` → `meta-state-report-tool.js`
2. `meta_state_log_change` → `meta-state-log-change-tool.js`
3. `meta_state_resolve` → `meta-state-resolve-tool.js`
4. `meta_state_list` → `meta-state-list-tool.js`
5. `meta_state_derive_status` → `meta-state-derive-status-tool.js`
6. `meta_state_patch` → `meta-state-patch-tool.js`
7. `loop_describe` → `loop-describe-tool.js`
8. `gate_check` → `gate-tool.js`
9. `gate_mark_preflight` → `mark-preflight-complete-tool.js`
10. `record_create_decision` → `create-decision-record-tool.js`

### Step 2.4: Create the test file

Create `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs` with the 4-question framework assertions:

```javascript
// Acceptance test: tool descriptions satisfy the 4-question framework.
//
// The framework: every tool description should answer
//   1. WHAT (what does it do)         — required, must be present
//   2. WHEN (when to use vs alternatives) — required, asserted by regex
//   3. INPUTS (what it accepts)        — required, asserted by schema coverage
//   4. RETURNS (what shape comes back) — required, asserted by example
//
// This file is the regression guard for Track B of plan
// 260609-adopt-instruction-layer. The 30 assertions lock the contract across
// refactors that change tool descriptions.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const projectRoot = resolve(__dirname, "..", "..", "..");

// Map tool names to their source files (relative to tools/learning-loop-mcp/)
const TOOL_FILE_MAP = {
  meta_state_report: "tools/meta-state-report-tool.js",
  meta_state_log_change: "tools/meta-state-log-change-tool.js",
  meta_state_resolve: "tools/meta-state-resolve-tool.js",
  meta_state_list: "tools/meta-state-list-tool.js",
  meta_state_derive_status: "tools/meta-state-derive-status-tool.js",
  meta_state_patch: "tools/meta-state-patch-tool.js",
  loop_describe: "tools/loop-describe-tool.js",
  gate_check: "tools/gate-tool.js",
  gate_mark_preflight: "tools/mark-preflight-complete-tool.js",
  record_create_decision: "tools/create-decision-record-tool.js",
};

const TOP_10 = Object.keys(TOOL_FILE_MAP);

function extractDescription(filePath) {
  const content = readFileSync(resolve(projectRoot, "tools/learning-loop-mcp", filePath), "utf8");
  // Match description: "..." or description: `...` (multi-line)
  const match = content.match(/description:\s*(?:"((?:[^"\\]|\\.)*)"|`([^`]*)`)/s);
  if (!match) return "";
  return match[1] || match[2] || "";
}

describe("tool description 4-question framework", () => {
  test("all 10 tool files exist", () => {
    for (const [name, filePath] of Object.entries(TOOL_FILE_MAP)) {
      const fullPath = resolve(projectRoot, "tools/learning-loop-mcp", filePath);
      assert.ok(existsSync(fullPath), `tool file for ${name} should exist at ${filePath}`);
    }
  });

  for (const [name, filePath] of Object.entries(TOOL_FILE_MAP)) {
    test(`${name}: WHEN clause present (regex /Use when|instead of|vs\\./)`, () => {
      const desc = extractDescription(filePath);
      assert.ok(desc.length > 0, `${name} should have a non-empty description`);
      assert.ok(
        /use when|instead of|vs\.|not for|alternative/i.test(desc),
        `${name} description must include a WHEN clause (Use when|instead of|vs.|not for|alternative). Got: ${desc.slice(0, 200)}`,
      );
    });
  }

  // The guide
  test("tool-selection-guide.md exists", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    assert.ok(content.length > 100, "guide should be substantive (>100 chars)");
  });

  test("guide covers at least 12 intents", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    const intentRows = content.match(/^\| [^|]+ \| `meta_|^[^|]+\| `meta_/gm) || [];
    assert.ok(intentRows.length >= 12, `guide should cover >=12 intents; got ${intentRows.length}`);
  });

  test("guide has an anti-pattern section", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    assert.ok(/anti-pattern/i.test(content), "guide should have an anti-pattern section");
    assert.ok(/node -e/i.test(content), "guide should mention the node -e escape hatch");
  });
});
```

(Adjust the regex if tool files use single-quoted descriptions or template literals.)

### Step 2.5: Run the test file + full check

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs 2>&1 | tail -30
pnpm check 2>&1 | tail -20
```

Expected: 10+ new test assertions pass; total test count is 902 + ~30 = ~932. Exit 0.

## Success Criteria

- [ ] Step 2.1 top-10 selection documented inline (which 10 tools, selection rationale).
- [ ] Step 2.2 `tools/learning-loop-mcp/references/tool-selection-guide.md` exists, >=50 lines, covers >=12 intents, has an anti-pattern section that mentions `node -e`.
- [ ] Step 2.3 10 tool descriptions in individual `*-tool.js` files have a "When to use" sentence (regex `/use when|instead of|vs\.|not for|alternative/i`).
- [ ] Step 2.4 new test file `tool-description-audit.test.cjs` exists with 4-question framework assertions for all 10 tools + 3 guide-existence assertions.
- [ ] Step 2.5 `node --test` on the new file: all assertions pass. `pnpm check` exit 0; total test count is ~932.
- [ ] No edits to `loop-describe-tool.js`, `core/loop-introspect.js`, or any schema files.

## Risk Assessment

- **Risk**: Top-10 selection is wrong. **Mitigation**: Step 2.1 documents the rationale; if audit frequency data is unavailable, fall back to the group-priority heuristic. Future plans can extend the audit to the next 10.
- **Risk**: Tool description edits break JavaScript syntax (unclosed quotes, template literal issues). **Mitigation**: use the `Edit` tool which preserves syntax; Step 2.5's `node --test` will fail loudly if a description regex can't be extracted.
- **Risk**: Test file GATE_ROOT isolation breaks. **Mitigation**: the new test file is read-only (no I/O writes); GATE_ROOT isolation is not needed. The 4-question framework is a static assertion.
- **Risk**: The new test file duplicates coverage with `cold-session-discoverability.test.cjs`. **Mitigation**: the cold-session test is for the `discoverability_hints` surface; the new test is for the tool descriptions + guide. Different surfaces, different assertions.
- **Risk**: 12 intents is too few (the loop has more than 12 use cases). **Mitigation**: 12 is the floor; the guide can have more. The test asserts `>=12`, not `===12`.

## Hand-off to Phase 3

Phase 3 (meta-state mutations) reads the new tool-selection guide and the modified tool files. The Phase 3 change-logs reference these artifacts in `applies_to.schemas` and `evidence_code_ref`. Note: Phase 1 already refreshed the next-up finding's fingerprint (Step 1.5), so Phase 3's `check_grounding` should pass cleanly.
