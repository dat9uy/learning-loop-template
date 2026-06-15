---
phase: 6
title: "check_runtime_agnostic MCP tool — the audit surface"
status: pending
priority: P2
effort: "2h"
dependencies:
  - "phase-05-consult-checklist-pattern-type"
---

# Phase 6: check_runtime_agnostic MCP tool — the audit surface

## Overview

Add a new MCP tool `check_runtime_agnostic` that audits a file or directory against the 6-item runtime-agnostic checklist. The tool is the **enforcement surface** for the `rule-runtime-agnostic-features` rule (Phase 7). Agents are expected to call it when adding a new feature; the tool returns structured feedback with `fix_suggestion` for each failure.

The tool reuses the same verification predicates that the regression test (Phase 4) uses, but exposes them as an MCP-callable surface. The tool is registered in `agent-manifest.json` and the MCP server's `tools/manifest.json`.

## Requirements

Functional:
- New file `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js`:
  - **Input schema** (Zod): `{ feature_path: string }` (a file or directory path relative to the project root).
  - **Output**: `{ feature_path, items_checked, items_passed, items_failed, failures: [{ item_id, description, expected, found, fix_suggestion }] }`.
  - **Behavior**:
    1. Resolve `feature_path` to an absolute path (default: relative to project root).
    2. For each of the 6 checklist items, run the verification predicate against the feature path.
    3. Collect failures with `fix_suggestion` per item.
    4. Return the structured result.
- The 6 checklist items (from Report 2 § The 6-item checklist):
  1. `core-in-universal-location` — primary file in `tools/learning-loop-mcp/{core,hooks,tools}/`.
  2. `shims-in-sync` — if hooks are needed, both shim directories have the shim.
  3. `protocol-adapter-i-o` — hook I/O goes through `protocol-adapter.js`.
  4. `manifest-registered` — new MCP tools are in `agent-manifest.json`.
  5. `cross-surface-iteration` — code uses `surfaces.js` helpers, not hard-coded paths.
  6. `parameterized-for-new-surfaces` — `SURFACES` is the single source of truth.
- Register the tool in `agent-manifest.json` (new group `runtime_agnostic` or extend the `gate` group; recommend new group per Report 2).
- Register the tool in `tools/manifest.json`.
- New test file `__tests__/check-runtime-agnostic-tool.test.js` with 4 tests.

Non-functional:
- The tool is read-only (no `writeFileSync`).
- The tool is hermetic (no network, no external state).
- The tool's response is JSON-serializable; no class instances, no functions.

## Architecture

### Tool implementation

```js
// tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js

import { z } from "zod";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, basename } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";

const CHECKLIST = [
  {
    id: "core-in-universal-location",
    description: "Core logic lives in tools/learning-loop-mcp/{core,hooks,tools}/ (not under .claude/ or .factory/)",
    verify(featurePath, root) {
      if (existsSync(join(root, featurePath, "core", "surfaces.js"))) return { ok: true };
      // File-level check: the primary file is under tools/learning-loop-mcp/.
      const rel = relative(root, resolve(root, featurePath));
      return {
        ok: rel.startsWith("tools/learning-loop-mcp/"),
        found: rel,
        expected: "tools/learning-loop-mcp/{core,hooks,tools}/",
        fix_suggestion: "Move the feature's primary file under tools/learning-loop-mcp/core/, hooks/, or tools/.",
      };
    },
  },
  {
    id: "shims-in-sync",
    description: "If hooks are needed, both .claude/coordination/hooks/ and .factory/coordination/hooks/ have a shim",
    verify(featurePath, root) {
      const featureName = basename(featurePath, ".cjs").replace(/-gate$/, "-coordination-gate.cjs");
      const claudeShim = join(root, ".claude/coordination/hooks", featureName);
      const factoryShim = join(root, ".factory/coordination/hooks", featureName);
      const claudeExists = existsSync(claudeShim);
      const factoryExists = existsSync(factoryShim);
      if (claudeExists && factoryExists) return { ok: true };
      return {
        ok: false,
        found: { claude: claudeExists, factory: factoryExists },
        expected: "both shims present",
        fix_suggestion: `Create the missing shim: ${!claudeExists ? claudeShim : factoryShim}`,
      };
    },
  },
  {
    id: "protocol-adapter-i-o",
    description: "Hook stdin/stdout goes through protocol-adapter.js (parseInput, formatOutput, normalizeToolName)",
    verify(featurePath, root) {
      const fullPath = resolve(root, featurePath);
      if (!existsSync(fullPath)) return { ok: true }; // Not a file; skip.
      const src = readFileSync(fullPath, "utf8");
      if (!src.includes("readFileSync(0")) return { ok: true }; // Not a hook; skip.
      const usesAdapter = ["parseInput", "formatOutput", "normalizeToolName"].some((sym) =>
        src.includes(sym),
      );
      return usesAdapter
        ? { ok: true }
        : {
            ok: false,
            found: "no protocol-adapter import",
            expected: "import { parseInput, formatOutput, normalizeToolName } from 'protocol-adapter'",
            fix_suggestion: "Use protocol-adapter.js for hook I/O. The shim-not-fork pattern requires it.",
          };
    },
  },
  {
    id: "manifest-registered",
    description: "New MCP tools are registered in tools/learning-loop-mcp/agent-manifest.json",
    verify(featurePath, root) {
      if (!featurePath.endsWith("-tool.js")) return { ok: true }; // Not a tool; skip.
      const toolName = basename(featurePath, "-tool.js").replace(/-/g, "_");
      const manifest = JSON.parse(readFileSync(join(root, "tools/learning-loop-mcp/agent-manifest.json"), "utf8"));
      const groups = Object.values(manifest.groups);
      const found = groups.some((g) => g.tools?.includes(toolName));
      return found
        ? { ok: true }
        : {
            ok: false,
            found: toolName,
            expected: "registered in a group",
            fix_suggestion: `Add "${toolName}" to one of the groups in agent-manifest.json (recommended: a new 'runtime_agnostic' group or 'gate').`,
          };
    },
  },
  {
    id: "cross-surface-iteration",
    description: "Code uses surfaces.js helpers, not hard-coded .claude/ or .factory/ paths",
    verify(featurePath, root) {
      const fullPath = resolve(root, featurePath);
      if (!existsSync(fullPath) || !fullPath.endsWith(".js")) return { ok: true };
      const src = readFileSync(fullPath, "utf8");
      const hasHardCodedPath = /join\s*\(\s*root\s*,\s*"\.(claude|factory)"/.test(src);
      if (!hasHardCodedPath) return { ok: true };
      return {
        ok: false,
        found: "hard-coded 'join(root, \".claude\"' or 'join(root, \".factory\"'",
        expected: "use the surfaces.js helper",
        fix_suggestion: "Replace the hard-coded path with the appropriate surfaces.js helper (writeToAllSurfaces, readFromAllSurfaces, appendToAllSurfaces, readJsonlFromAllSurfaces, readModifyWriteOnAllSurfaces).",
      };
    },
  },
  {
    id: "parameterized-for-new-surfaces",
    description: "SURFACES is the single source of truth for the set of supported runtimes",
    verify(featurePath, root) {
      // File-level check: surfaces.js is the only file that hard-codes the runtime list.
      if (featurePath.endsWith("surfaces.js")) return { ok: true };
      const fullPath = resolve(root, featurePath);
      if (!existsSync(fullPath) || !fullPath.endsWith(".js")) return { ok: true };
      const src = readFileSync(fullPath, "utf8");
      // Heuristic: the file should not declare its own array of surface prefixes.
      const hasOwnSurfaceList = /\["\.(claude|factory|cursor|aider)"/.test(src);
      if (!hasOwnSurfaceList) return { ok: true };
      return {
        ok: false,
        found: "file declares its own surface prefix list",
        expected: "import { SURFACES } from 'surfaces.js'",
        fix_suggestion: "Use SURFACES from surfaces.js instead of declaring your own list.",
      };
    },
  },
];

const inputSchema = z.object({
  feature_path: z.string().describe("File or directory path (relative to project root) to audit"),
});

export const checkRuntimeAgnosticTool = {
  name: "check_runtime_agnostic",
  description: "Audit a file or directory against the runtime-agnostic checklist (the 6-item pattern codified in rule-runtime-agnostic-features). Use when adding a new feature to verify the shim-not-fork + cross-surface-iteration pattern. Returns structured feedback with fix_suggestion for each failure.",
  schema: { feature_path: z.string() },
  handler: async (raw) => {
    const { feature_path } = inputSchema.parse(raw);
    const root = resolveRoot();
    const failures = [];
    let items_checked = 0;
    let items_passed = 0;

    for (const item of CHECKLIST) {
      items_checked++;
      const result = item.verify(feature_path, root);
      if (result.ok) {
        items_passed++;
      } else {
        failures.push({ item_id: item.id, description: item.description, ...result });
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          feature_path,
          items_checked,
          items_passed,
          items_failed: failures.length,
          failures,
        }, null, 2),
      }],
    };
  },
};
```

### Manifest registration

Add to `tools/learning-loop-mcp/agent-manifest.json`:

```json
"runtime_agnostic": {
  "description": "Audit a feature's compliance with the runtime-agnostic pattern (shim-not-fork + cross-surface-iteration). Call when adding a new feature.",
  "tools": ["check_runtime_agnostic"],
  "ordering": "any"
}
```

Add to `tools/learning-loop-mcp/tools/manifest.json`:

```json
{ "file": "./tools/check-runtime-agnostic-tool.js", "export": "checkRuntimeAgnosticTool" }
```

## Related Code Files

- Create: `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js` (~110 lines).
- Modify: `tools/learning-loop-mcp/agent-manifest.json` — add `runtime_agnostic` group.
- Modify: `tools/learning-loop-mcp/tools/manifest.json` — register the new tool.
- Create: `tools/learning-loop-mcp/__tests__/check-runtime-agnostic-tool.test.js` — 4 tests.

## Implementation Steps (TDD)

1. **Append 4 RED tests to `__tests__/check-runtime-agnostic-tool.test.js`** (new file):
   - Test 1: tool returns `{ items_checked: 6, items_passed: N, items_failed: 6-N, failures: [...] }` for a compliant feature (e.g., `core/surfaces.js` itself).
   - Test 2: tool returns a failure for `cross-surface-iteration` when a feature has hard-coded `join(root, ".claude"...)`.
   - Test 3: tool returns a failure for `manifest-registered` when a new tool file is not in the manifest.
   - Test 4: tool's `fix_suggestion` is non-empty for each failure (the agent can act on it).
2. **Run `pnpm test -- check-runtime-agnostic-tool`**. Expect 4 RED.
3. **Create `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js`** with the implementation above.
4. **Register the tool in `agent-manifest.json` and `tools/manifest.json`**.
5. **Refresh the MCP server's tool modules**: this is automatic on next server start; for local testing, the `meta_state_refresh_tools` MCP tool reloads in-process. Alternatively, just restart the test runner.
6. **Run `pnpm test -- check-runtime-agnostic-tool`**. Expect 4 GREEN.
7. **Run the full test suite.** `pnpm test` — expect 972/973 (1 skipped). No regressions.
8. **Manual smoke test.** Call the tool via the MCP server (or via direct handler invocation in a Node REPL) against `core/surfaces.js` (expect 6/6 pass) and against a synthetic file with a hard-coded path (expect 1 failure with `fix_suggestion`).
9. **Whole-plan consistency check.** `grep -n "check_runtime_agnostic" tools/learning-loop-mcp/` — expect 4 matches (tool file, manifest, manifest.json, test file).

## Success Criteria

- [ ] `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js` exists with the 6-item checklist.
- [ ] `agent-manifest.json` has the `runtime_agnostic` group with `check_runtime_agnostic`.
- [ ] `tools/manifest.json` registers the new tool.
- [ ] `__tests__/check-runtime-agnostic-tool.test.js` exists with 4 tests, all GREEN.
- [ ] `pnpm test -- check-runtime-agnostic-tool` shows 4 GREEN.
- [ ] `pnpm test` shows 972/973 (1 skipped). No regressions.
- [ ] Manual smoke test confirms the tool returns structured feedback.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The tool's predicates return false positives (e.g., a file that legitimately hard-codes a surface path is flagged) | The predicates include skip conditions (e.g., `if (!src.includes("readFileSync(0"))` for `protocol-adapter-i/o`). The `fix_suggestion` field is the agent's escape hatch. |
| The tool imports from `core/surfaces.js` indirectly (via `resolveRoot`); if the import fails, the tool handler crashes | The handler is async; an import error becomes a JSON error in the response (the MCP wire layer catches thrown errors). The 4 tests cover the happy path; the failure path is tested by the MCP server's error handling. |
| The tool's `resolveRoot()` returns a different path in test vs production | The test creates a temp dir and overrides `GATE_ROOT` (or the equivalent env var). Verified by reading the existing test pattern in `gate-override.test.js`. |
| The `manifest-registered` predicate's tool-name derivation (`basename(featurePath, "-tool.js").replace(/-/g, "_")`) doesn't match the actual tool name (e.g., `gate-check-recurrence-tool.js` → `gate_check_recurrence`) | Verified by reading 5 existing tool filenames: `gate-tool.js` → `gate_check` ✓, `gate-override-tool.js` → `gate_override` ✓, `gate-check-recurrence-tool.js` → `gate_check_recurrence` ✓. The derivation is correct. |

## Security Considerations

- The tool is read-only. No file writes. No network access. No new attack surface.
- The tool's `feature_path` is resolved relative to the project root; path traversal (`../../../etc/passwd`) is bounded by `resolveRoot()`. The tool does not escape the project root.
- The tool's predicates do not execute untrusted code. They read files and pattern-match.
- The tool's response is JSON-serializable; no code execution on the client side.

## Next Steps

After Phase 6 ships:
- The audit surface is live. Agents can call `check_runtime_agnostic` when adding new features.
- Phase 7: rule entry + AGENTS.md + `loop_describe` hint. The rule is now discoverable + codified + documented.
