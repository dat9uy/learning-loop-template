---
phase: 3
title: "New loop_describe Tool"
status: pending
priority: P2
effort: 8h
dependencies: [1, 2]
---

# Phase 3: New loop_describe Tool

## Overview

Create `tools/loop-describe-tool.js` MCP tool. Returns the loop's operational surface at 4 tiers (`hot`, `warm`, `cold`, `summary`) to prevent context bloat. Composes with `meta_state_list` for findings. Imports tool modules to read their `description` field. Tool description recommends calling at session start.

## Requirements

**Functional:**
- New tool `loop_describe` with `tier: "hot" | "warm" | "cold" | "summary"` (default: `warm`)
- Optional `categories: string[]` to filter meta-state findings
- Returns structured object: `{ tier, tools, record_types, meta_state_categories, gate_patterns, promoted_rules, active_findings, anti_patterns }`
- Imports each tool module from `tools/manifest.json` to read `description`
- Manifest metadata as fallback if module import fails

**Non-functional:**
- Lazy module import (only for requested tier)
- Response size: summary < 1KB, hot ~5KB, warm 10-25KB, cold 25-100KB
- Tool description recommends calling at session start

## Architecture

**Tool module:** Standard MCP pattern (zod schema, handler, registered in `tools/manifest.json`).

**Introspection helper (`core/loop-introspect.js`):**
- `listAllTools(root)`: from manifest + module `description`
- `listAllRecordTypes(root)`: from `schemas/*.schema.json`
- `listAllMetaCategories()`: from zod enum (extracted in Phase 1)
- `listAllGatePatterns(root)`: from `core/patterns.json`
- `listActiveFindings(root, { categories })`: wraps `meta_state_list({status: ["reported", "active"]})`
- `listAntiPatterns(root, { categories })`: wraps `meta_state_list({category: "loop-anti-pattern"})`
- `listPromotedRules(root)`: wraps `meta_state_list({status: "active", category: "loop-anti-pattern"})`

**Tiering logic:**
- `summary`: counts only
- `hot`: promoted rules + tool names (no descriptions)
- `warm`: hot + active findings + record types with descriptions + gate patterns
- `cold`: warm + full history + all findings

**Robustness echo:** response always includes `tier` field.

## Related Code Files

**Create:**
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (new tool)
- `tools/learning-loop-mcp/core/loop-introspect.js` (introspection helpers)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js`

**Modify:**
- `tools/learning-loop-mcp/tools/manifest.json` (register tool)
- `tools/learning-loop-mcp/agent-manifest.json` (add to a tool group)

## TDD Structure

### Tests Before (regression — composed tools still work)

1. `meta_state_list` still returns findings (composed by `loop_describe`)
2. `meta_state_report` schema unchanged (Phase 1)
3. `gate-logic` unchanged (Phase 2)
4. `tools/manifest.json` is valid JSON; existing tools still load

### Refactor

1. Create `core/loop-introspect.js` with helper functions
2. Create `tools/loop-describe-tool.js`:
   ```js
   import { z } from "zod";
   import * as introspect from "#mcp/core/loop-introspect.js";
   import { resolveRoot } from "#lib/resolve-root.js";

   export const loopDescribeTool = {
     name: "loop_describe",
     description: "Return the loop's current operational surface. **Recommended: call at session start to discover what the loop offers.** Supports tiered reads (hot/warm/cold/summary) to control context bloat.",
     schema: {
       tier: z.enum(["hot", "warm", "cold", "summary"]).optional()
         .describe("Read tier: hot=active rules only (~5KB), warm=active surface (default, 10-25KB), cold=full history (25-100KB), summary=counts only (<1KB)"),
       categories: z.array(z.string()).optional()
         .describe("Optional filter: only return entries matching these meta-state categories"),
     },
     handler: async ({ tier = "warm", categories }) => {
       const root = resolveRoot();
       const result = { tier, ...buildResponse(root, tier, categories) };
       return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
     },
   };
   ```
3. Register in `tools/manifest.json`:
   ```json
   { "file": "./tools/loop-describe-tool.js", "export": "loopDescribeTool" }
   ```
4. Add to `agent-manifest.json` (new group `introspection` or extend existing)

### Tests After (new behavior)

1. `tier: "summary"` returns counts only (no full descriptions; < 1KB)
2. `tier: "hot"` returns active rules + tool names (no descriptions; ~5KB)
3. `tier: "warm"` returns active state + tool surface with descriptions
4. `tier: "cold"` returns full history + all findings
5. `categories: ["loop-anti-pattern"]` filters `anti_patterns` to that category
6. `tier: "summary"` + `categories` returns counts only
7. Module import failure (bad path) → manifest fallback used; no crash
8. Tool description string contains "session start" (recommendation check)
9. Response includes `tier` field (robustness echo)
10. Default tier (no param) is `warm`

### Regression Gate

```bash
cd tools/learning-loop-mcp && pnpm test __tests__/loop-describe.test.js
```

## Implementation Steps

1. Read existing tool pattern (e.g., `meta-state-list-tool.js`)
2. Write 4 regression tests (Tests Before); run; pass
3. Create `core/loop-introspect.js` with helper functions
4. Create `tools/loop-describe-tool.js`
5. Register in `tools/manifest.json` and `agent-manifest.json`
6. Write 10 new behavior tests (Tests After); run; pass
7. Run full test suite: `pnpm test`

## Success Criteria

- [ ] `loop_describe` tool registered and callable via MCP
- [ ] All 4 tiers return correct slice of data
- [ ] Response size within tier budget
- [ ] Module import works; manifest fallback works
- [ ] Tool description recommends session-start call
- [ ] Default tier is `warm`
- [ ] Robustness echo (tier field) present
- [ ] All 14 tests pass (4 before + 10 after)
- [ ] No regression in existing tools

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Module import is slow | Lazy import (only for requested tier); cache results |
| Large response bloats context | Tier parameter is the control; default warm is 10-25KB |
| Manifest drift from code | `loop_describe` is the canary; if manifest mismatches, the tool surfaces it |
| Dynamic import errors | Try/catch; manifest fallback (just file path, no description) |
| Single bad module crashes the tool (RT Finding 4) | Per-import try/catch with 1s timeout; circuit breaker after 3 failures |
| Tier escalation has no fallback (RT Finding 10) | `degraded: true` flag in response; documented agent behavior |
| Existing meta-state entries invisible to new tool (RT Finding 12) | Migrate all 10 existing entries in Phase 4; legacy fallback in `loop_describe` |
| Agent never calls `loop_describe` (RT Finding 14) | Update `CLAUDE.md` and `AGENTS.md` with session-start recommendation |

## Red Team Findings Applied

**RT Finding 4 (Module Import Attack Surface) — Medium:** Wrap each dynamic import in `try/catch` with a 1-second timeout (using `Promise.race`). On failure, log a warning and use manifest metadata as fallback. Add a circuit breaker: if 3+ imports fail, mark the tool as broken and skip it. This isolates a single bad module from breaking the entire tool.

**RT Finding 10 (Tier Escalation Failure) — Medium:** The `loop_describe` response includes a `degraded: true` flag and a `warnings: string[]` field when partial data is returned. Document the agent's expected behavior: on `degraded: true`, retry with `tier: "summary"` or proceed with the partial data. Add a test for the degraded path.

**RT Finding 12 (Backward Compat) — High:** Add a legacy fallback in `loop_describe`. If the count of `loop-anti-pattern` entries is 0, also surface entries with `category: "gate-logic-bug"`, `category: "mcp-tool-missing"`, etc. These legacy entries are returned with a `legacy: true` flag and a `legacy_category` field. Phase 4 migrates all 10 existing entries to the new schema, so this fallback is for transition only.

**RT Finding 14 (Agent Meta-Cognition) — Medium:** Add a documentation step to this phase. Update `CLAUDE.md` (the quick reference) to add: "**At session start:** call `loop_describe({tier: "warm"})` to discover the loop's surface and active rules." Update `AGENTS.md` (the full reference) with a new section "Discovery: `loop_describe`" explaining the 4 tiers, the recommendation, and the robustness echo pattern.

**Updated Implementation Steps:**

1. Read existing tool pattern (e.g., `meta-state-list-tool.js`)
2. Write 4 regression tests (Tests Before); run; pass
3. Create `core/loop-introspect.js` with helper functions (per-import try/catch + timeout, RT Finding 4)
4. Create `tools/loop-describe-tool.js` with `degraded` flag support (RT Finding 10) and legacy fallback (RT Finding 12)
5. Register in `tools/manifest.json` and `agent-manifest.json`
6. **Update `CLAUDE.md` and `AGENTS.md` with `loop_describe` recommendation** (RT Finding 14)
7. Write 10 new behavior tests (Tests After); run; pass
8. Run full test suite: `pnpm test`

**Updated Success Criteria:**

- [ ] `loop_describe` tool registered and callable via MCP
- [ ] All 4 tiers return correct slice of data
- [ ] Response size within tier budget
- [ ] **Per-import try/catch with 1s timeout; circuit breaker after 3 failures** (RT Finding 4)
- [ ] **`degraded: true` flag set on partial-failure response** (RT Finding 10)
- [ ] **Legacy fallback for pre-migration categories with `legacy: true` flag** (RT Finding 12)
- [ ] **Documentation updated in `CLAUDE.md` and `AGENTS.md`** (RT Finding 14)
- [ ] Module import works; manifest fallback works
- [ ] Tool description recommends session-start call
- [ ] Default tier is `warm`
- [ ] Robustness echo (tier field) present
- [ ] All 14 tests pass (4 before + 10 after)
- [ ] No regression in existing tools
