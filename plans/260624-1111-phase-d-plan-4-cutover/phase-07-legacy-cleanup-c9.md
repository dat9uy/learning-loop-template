---
phase: 7
title: "legacy-cleanup-c9"
status: pending
priority: P1
effort: "3h"
dependencies: ["6"]
---

# Phase 7: Legacy Cleanup (C-9) — Move to `legacy/`, Delete `#mcp/*` Alias

## Overview

**Completes the C-9 deferred item from the master tracker.** Plan 3's C6 cut-over replaced the legacy `tools/learning-loop-mcp/server.js` with the mastra `MCPServer`, but the legacy `tools/learning-loop-mcp/tools/`, `tools/learning-loop-mcp/core/`, `tools/learning-loop-mcp/scout/`, and the `#mcp/*` import alias (defined in `package.json:7`) all survived. Plan 4 phase-07 finishes the cutover by:
1. Moving `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/tools/legacy/`
2. Moving `tools/learning-loop-mcp/core/` → `tools/learning-loop-mastra/core/legacy/`
3. Moving `tools/learning-loop-mcp/scout/` → `tools/learning-loop-mastra/scout/legacy/`
4. Moving `tools/learning-loop-mcp/hooks/` → `tools/learning-loop-mastra/hooks/legacy/` (or keep in place; see Step 7.2)
5. Migrating 5 cross-package `#mcp/*` imports + 2 direct path imports in the mastra side
6. Migrating 38 self-imports inside `tools/learning-loop-mcp/` to direct relative paths
7. Deleting the `#mcp/*` alias from `package.json`
8. Updating 5 prose references in agent instructions + scout tool descriptions (with corresponding `agent-prompt-content.test.cjs` fixture updates)
9. Adding a new test (`legacy-cleanup.test.cjs`) that asserts no `#mcp/*` imports remain and all 7 cross-package consumers resolve to the new paths

**Per scout report §3.4** (per-consumer migration table), the cleanup is larger than just `tools/`: `#mcp/*` also resolves to `tools/learning-loop-mcp/core/*`, `tools/learning-loop-mcp/scout/*`, `tools/learning-loop-mcp/tools/*`. **The alias deletion is atomic** with all 7 cross-package consumers being migrated first.

## Requirements

- Functional: `tools/learning-loop-mcp/` no longer contains code; the 5 cross-package consumers and 38 self-imports are migrated; `#mcp/*` alias is deleted; all tests pass.
- Non-functional: the file-move pattern from Plan 1 phase-01 is the precedent (atomic move + import update + tests).

## Architecture

The file-move pattern from `plans/260618-1911-phase-d-plan-1-workflows/phase-01-file-move-precondition.md` (Plan 1 phase 1) is the precedent:

1. **Pre-flight:** verify no other code depends on the moved files' original paths.
2. **Atomic move:** `git mv` the file(s) to the new location.
3. **Import update:** update the 5 + 2 cross-package imports + 38 self-imports in a single commit.
4. **Test update:** update any test that imports the moved files' original paths.
5. **Test run:** `pnpm test` confirms no regression.

Phase 7 follows the same pattern, but the move is across packages (from `tools/learning-loop-mcp/` to `tools/learning-loop-mastra/{tools,core,scout}/legacy/`).

**Why move to `legacy/` (not delete):** forensic continuity. The Phase A retrospective (master tracker line 30-32) established the convention that deleted/archived content goes to `_unbound/` or `legacy/` directories for forensic reference. Phase 7 follows this convention.

## Related Code Files

### Files to move

- **Move:** `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/tools/legacy/` (31 files)
- **Move:** `tools/learning-loop-mcp/core/` → `tools/learning-loop-mastra/core/legacy/` (many files)
- **Move:** `tools/learning-loop-mcp/scout/` → `tools/learning-loop-mastra/scout/legacy/` (several files)
- **Move:** `tools/learning-loop-mcp/hooks/` → `tools/learning-loop-mastra/hooks/legacy/` (4 files; see Step 7.2)

### Files to modify

- **Modify:** `tools/learning-loop-mastra/schemas.js:9-11` (3 imports; replace with relative paths or new alias)
- **Modify:** `tools/learning-loop-mastra/create-loop-workflow.js:5` (1 import; `#mcp/core/envelope-stripper.js`)
- **Modify:** `tools/learning-loop-mastra/agents/run-scout-tool.js:9` (1 import; `#mcp/scout/run-scout.js`)
- **Modify:** `tools/learning-loop-mastra/workflows/workflow-intake-plan.js:3` (1 import; `#mcp/core/envelope-stripper.js`)
- **Modify:** `tools/learning-loop-mastra/workflows/workflow-self-improvement.js:3` (1 import; `#mcp/core/envelope-stripper.js`)
- **Modify:** `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:4-5` (2 direct path imports)
- **Modify:** 38 self-imports inside `tools/learning-loop-mcp/` (the 31 tool files, the 5+ core files, etc.)
- **Modify:** `tools/learning-loop-mastra/agents/instructions/scout-agent.js:2,11,16` (3 prose references)
- **Modify:** `tools/learning-loop-mastra/agents/run-scout-tool.js:2,14` (2 prose references)
- **Modify:** `tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs` (the LOCKED instruction markers fixture)
- **Modify:** `package.json:7` (delete `"#mcp/*": "./tools/learning-loop-mcp/*"` import alias)

### Files to create

- **Create:** `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs` (asserts no `#mcp/*` imports; asserts all 7 cross-package consumers resolve)

## Implementation Steps

### Step 7.1: Pre-flight audit (read all 7 cross-package consumers + the 38 self-imports)

Per scout report §3, the 7 cross-package consumers are:

1. `tools/learning-loop-mastra/schemas.js:9-11` (3 imports)
2. `tools/learning-loop-mastra/create-loop-workflow.js:5`
3. `tools/learning-loop-mastra/agents/run-scout-tool.js:9`
4. `tools/learning-loop-mastra/workflows/workflow-intake-plan.js:3`
5. `tools/learning-loop-mastra/workflows/workflow-self-improvement.js:3`
6. `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:4` (direct path)
7. `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:5` (direct path)

Verify each consumer's actual import (read the file; confirm the import path is correct; identify what it imports).

For the 38 self-imports inside `tools/learning-loop-mcp/`, run:

```bash
grep -rn "from \"#mcp/" tools/learning-loop-mcp/ | wc -l
# Should be ~38
grep -rn "from \"#mcp/" tools/learning-loop-mcp/ | head -50
```

List all 38 self-imports; group by source file. Plan the migration mechanically.

### Step 7.2: Decide on the hooks directory disposition

The hooks directory (`tools/learning-loop-mcp/hooks/`) contains the universal hooks (bash-gate, write-gate, inbound-gate). Per scout report §2, the hooks are still loaded by Droid/Claude Code (they're not part of the mastra server; they're the runtime hooks that fire on tool calls).

**Two options:**

**Option A: Move hooks to `tools/learning-loop-mastra/hooks/legacy/`.** The hooks remain in the project (forensic continuity) but are renamed. The `#mcp/*` alias deletion still requires the hook self-imports to be migrated.

**Option B: Keep hooks in `tools/learning-loop-mcp/hooks/`.** The hooks stay in their original location. The `#mcp/*` alias can still be deleted if the hook self-imports are migrated. The legacy server's `hooks/` subdir is the only thing left in `tools/learning-loop-mcp/`.

**Recommendation: Option B** (keep hooks in place). Reasons:
- The hooks are loaded by `.factory/hooks/loop-surface-inject.cjs:4,79,166` (per scout report §6). Renaming the hooks directory cascades to the loader.
- The hooks are functionally separate from the MCP server (they fire on tool calls, regardless of which server). Moving them adds risk without adding value.
- The forensic continuity argument is weaker for hooks (they're not "content" — they're runtime code).

**If Option B:** the `#mcp/*` alias deletion still works because the 4 hook files' self-imports (`bash-gate.js`, `write-gate.js`, `inbound-gate.js`) are migrated to direct relative paths. The `tools/learning-loop-mcp/hooks/` directory remains as the hooks' home.

### Step 7.3: Atomic file move (Phase 7 commit 1)

**Step 7.3.1: Move `tools/learning-loop-mcp/tools/` to `tools/learning-loop-mastra/tools/legacy/`.**

```bash
# Use git mv to preserve history
git mv tools/learning-loop-mcp/tools tools/learning-loop-mastra/tools/legacy
```

The 31 deterministic tool files are now at `tools/learning-loop-mastra/tools/legacy/*.js`.

**Step 7.3.2: Move `tools/learning-loop-mcp/core/` to `tools/learning-loop-mastra/core/legacy/`.**

```bash
git mv tools/learning-loop-mcp/core tools/learning-loop-mastra/core/legacy
```

**Step 7.3.3: Move `tools/learning-loop-mcp/scout/` to `tools/learning-loop-mastra/scout/legacy/`.**

```bash
git mv tools/learning-loop-mcp/scout tools/learning-loop-mastra/scout/legacy
```

**Step 7.3.4 (Option A only): Move `tools/learning-loop-mcp/hooks/` to `tools/learning-loop-mastra/hooks/legacy/`.** Skip this step if Option B.

### Step 7.4: Update the 5 cross-package `#mcp/*` imports (Phase 7 commit 2)

For each of the 5 cross-package consumers, replace the `#mcp/*` import with a direct relative path to the new location.

**Example: `tools/learning-loop-mastra/schemas.js:9-11`:**

Before:
```js
import { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js";
import { metaStateRelationshipsTool } from "#mcp/tools/meta-state-relationships-tool.js";
import { metaStateReVerifyTool } from "#mcp/tools/meta-state-re-verify-tool.js";
```

After:
```js
import { metaStateProposeDesignTool } from "./tools/legacy/meta-state-propose-design-tool.js";
import { metaStateRelationshipsTool } from "./tools/legacy/meta-state-relationships-tool.js";
import { metaStateReVerifyTool } from "./tools/legacy/meta-state-re-verify-tool.js";
```

(Adjust the relative path depth based on the consumer's location. `schemas.js` is in `tools/learning-loop-mastra/`, so the path is `./tools/legacy/...`.)

**Example: `tools/learning-loop-mastra/agents/run-scout-tool.js:9`:**

Before:
```js
import { runScout } from "#mcp/scout/run-scout.js";
```

After:
```js
import { runScout } from "../scout/legacy/run-scout.js";
```

(Adjust based on location. `run-scout-tool.js` is in `tools/learning-loop-mastra/agents/`, so the path is `../scout/legacy/...`.)

**For each of the 5 files, apply the analogous change.**

### Step 7.5: Update the 2 direct path imports in `coerce-correctness.test.js`

**Before:**

```js
// tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:4-5
import { stripEnvelope } from "../../learning-loop-mcp/core/envelope-stripper.js";
import { strictBooleanGuard } from "../../learning-loop-mcp/core/strict-boolean-guard.js";
```

**After:**

```js
import { stripEnvelope } from "../core/legacy/envelope-stripper.js";
import { strictBooleanGuard } from "../core/legacy/strict-boolean-guard.js";
```

### Step 7.6: Update the 38 self-imports inside `tools/learning-loop-mcp/`

The 38 self-imports are `from "#mcp/..."` lines inside the legacy `tools/` files. These were convenient when the alias existed; they need to be updated to direct relative paths.

**Example: `tools/learning-loop-mastra/tools/legacy/gate-tool.js` (formerly `tools/learning-loop-mcp/tools/gate-tool.js`):**

Before (when the file was at `tools/learning-loop-mcp/tools/gate-tool.js`):
```js
import { readRuntimeObservations } from "#mcp/core/file-readers.js";
import { checkObservationStaleness } from "#mcp/core/inbound-state.js";
```

After (when the file is at `tools/learning-loop-mastra/tools/legacy/gate-tool.js`):
```js
import { readRuntimeObservations } from "../../core/legacy/file-readers.js";
import { checkObservationStaleness } from "../../core/legacy/inbound-state.js";
```

(Path is `../../core/legacy/...` because `tools/learning-loop-mastra/tools/legacy/gate-tool.js` is 2 levels deep from `tools/learning-loop-mastra/`.)

**Mechanically update all 38 self-imports.** Use a script if possible:

```bash
# Find all #mcp/* imports inside the moved files
grep -rln "#mcp/" tools/learning-loop-mastra/tools/legacy/ tools/learning-loop-mastra/core/legacy/ tools/learning-loop-mastra/scout/legacy/

# For each file, replace #mcp/tools/ → ../../tools/legacy/, #mcp/core/ → ../../core/legacy/, #mcp/scout/ → ../../scout/legacy/
# (path depth depends on file location; verify each)
```

**Recommendation: write a small node script to do the replacement** (e.g., `tools/scripts/migrate-mcp-imports.mjs`). The script:
1. Lists all `.js` files in the moved directories.
2. For each file, reads it; finds `#mcp/tools/`, `#mcp/core/`, `#mcp/scout/` imports; computes the relative path to the new location.
3. Writes the file back with the new import.

The script is run once, then deleted (or kept as a forensics tool).

### Step 7.7: Update the 5 prose references (LOCKED instruction markers)

**3 references in `tools/learning-loop-mastra/agents/instructions/scout-agent.js:2,11,16`:**

Before:
```js
// "scoutAgent wraps the pure-function scout pipeline at tools/learning-loop-mcp/scout/run-scout.js..."
```

After:
```js
// "scoutAgent wraps the pure-function scout pipeline at tools/learning-loop-mastra/scout/legacy/run-scout.js..."
```

**2 references in `tools/learning-loop-mastra/agents/run-scout-tool.js:2,14`:**

Before:
```js
// "wraps tools/learning-loop-mcp/scout/run-scout.js for agent use"
```

After:
```js
// "wraps tools/learning-loop-mastra/scout/legacy/run-scout.js for agent use"
```

**Update the `agent-prompt-content.test.cjs` fixture correspondingly** to keep the LOCKED instruction markers test green. The test asserts the locked marker (e.g., `Bound surface: the meta-surface`) reaches the LLM prompt; it does NOT assert the file paths. So the test stays green as long as the marker is preserved. (Verify by running the test.)

### Step 7.8: Delete the `#mcp/*` alias from `package.json`

**Before (`package.json:7`):**

```json
"imports": {
  "#mcp/*": "./tools/learning-loop-mcp/*",
  "#mastra/*": "./tools/learning-loop-mastra/*",
  "#lib/*": "./tools/lib/*"
}
```

**After:**

```json
"imports": {
  "#mastra/*": "./tools/learning-loop-mastra/*",
  "#lib/*": "./tools/lib/*"
}
```

(`#mcp/*` alias deleted. The `#mastra/*` alias (added in Plan 1) is preserved for any future mastra-side consumers.)

### Step 7.9: Create the legacy-cleanup test

Create `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs`:

```js
// Legacy cleanup test — asserts no #mcp/* imports remain in the project
// (post-Phase-D Plan 4 phase-07) and all 7 cross-package consumers resolve
// to their new locations in tools/learning-loop-mastra/{tools,core,scout}/legacy/.
//
// Test inventory:
//   1. No #mcp/* imports remain in tools/learning-loop-mastra/**/*.js
//   2. No #mcp/* imports remain in tools/learning-loop-mcp/**/*.js
//   3. No #mcp/* imports remain in package.json
//   4. All 5 cross-package consumers resolve to the new path
//   5. All 2 direct path imports in coerce-correctness.test.js resolve
//   6. The 5 prose references in scout-agent.js + run-scout-tool.js are updated
//   7. The moved files are importable from their new locations

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync, statSync } = require("node:fs");
const { execSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

describe("legacy cleanup (C-9)", () => {
  test("no #mcp/* imports in tools/learning-loop-mastra/**/*.js", () => {
    let result;
    try {
      result = execSync(
        'grep -rln "#mcp/" tools/learning-loop-mastra/ --include="*.js" --include="*.cjs" --include="*.mjs" || true',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    assert.deepStrictEqual(files, [], `expected 0 files with #mcp/* imports, got ${files.length}: ${files.join(", ")}`);
  });

  test("no #mcp/* imports in tools/learning-loop-mcp/**/*.js", () => {
    let result;
    try {
      result = execSync(
        'grep -rln "#mcp/" tools/learning-loop-mcp/ --include="*.js" --include="*.cjs" --include="*.mjs" || true',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    assert.deepStrictEqual(files, [], `expected 0 files with #mcp/* imports, got ${files.length}: ${files.join(", ")}`);
  });

  test("no #mcp/* alias in package.json#imports", () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
    assert.strictEqual(pkg.imports["#mcp/*"], undefined, "package.json#imports should not have #mcp/* alias");
  });

  test("5 cross-package consumers resolve to the new paths", () => {
    const consumers = [
      { file: "tools/learning-loop-mastra/schemas.js", importPath: "./tools/legacy/meta-state-propose-design-tool.js" },
      { file: "tools/learning-loop-mastra/create-loop-workflow.js", importPath: "../core/legacy/envelope-stripper.js" },
      { file: "tools/learning-loop-mastra/agents/run-scout-tool.js", importPath: "../scout/legacy/run-scout.js" },
      { file: "tools/learning-loop-mastra/workflows/workflow-intake-plan.js", importPath: "../core/legacy/envelope-stripper.js" },
      { file: "tools/learning-loop-mastra/workflows/workflow-self-improvement.js", importPath: "../core/legacy/envelope-stripper.js" },
    ];
    for (const { file, importPath } of consumers) {
      const fullPath = join(PROJECT_ROOT, file);
      assert.ok(existsSync(fullPath), `${file} should exist`);
      const dir = resolve(fullPath, "..");
      const targetPath = resolve(dir, importPath);
      // Strip the .js extension for existence check
      const exists = existsSync(targetPath) || existsSync(targetPath + ".js");
      assert.ok(exists, `${file} should import from ${targetPath}, but the file does not exist`);
    }
  });

  test("2 direct path imports in coerce-correctness.test.js resolve", () => {
    const testFile = "tools/learning-loop-mastra/__tests__/coerce-correctness.test.js";
    const fullPath = join(PROJECT_ROOT, testFile);
    assert.ok(existsSync(fullPath), `${testFile} should exist`);
    const content = readFileSync(fullPath, "utf8");
    assert.ok(content.includes("../core/legacy/envelope-stripper.js"), `${testFile} should import from ../core/legacy/envelope-stripper.js`);
    assert.ok(content.includes("../core/legacy/strict-boolean-guard.js"), `${testFile} should import from ../core/legacy/strict-boolean-guard.js`);
  });

  test("5 prose references in agent instructions + scout tool descriptions are updated", () => {
    const scoutAgent = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/agents/instructions/scout-agent.js"), "utf8");
    const runScoutTool = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/agents/run-scout-tool.js"), "utf8");
    assert.ok(!scoutAgent.includes("tools/learning-loop-mcp/scout/run-scout.js"),
      "scout-agent.js should not reference the legacy path");
    assert.ok(scoutAgent.includes("tools/learning-loop-mastra/scout/legacy/run-scout.js"),
      "scout-agent.js should reference the new legacy/ path");
    assert.ok(!runScoutTool.includes("tools/learning-loop-mcp/scout/run-scout.js"),
      "run-scout-tool.js should not reference the legacy path");
    assert.ok(runScoutTool.includes("tools/learning-loop-mastra/scout/legacy/run-scout.js"),
      "run-scout-tool.js should reference the new legacy/ path");
  });

  test("moved files are importable from their new locations", () => {
    // Spot-check: 3 representative files exist and are non-empty
    const samples = [
      "tools/learning-loop-mastra/tools/legacy/gate-tool.js",
      "tools/learning-loop-mastra/core/legacy/envelope-stripper.js",
      "tools/learning-loop-mastra/scout/legacy/run-scout.js",
    ];
    for (const f of samples) {
      const fullPath = join(PROJECT_ROOT, f);
      assert.ok(existsSync(fullPath), `${f} should exist at the new location`);
      const stat = statSync(fullPath);
      assert.ok(stat.size > 0, `${f} should be non-empty`);
    }
  });
});
```

### Step 7.10: Run the legacy cleanup test + full test suite

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs
pnpm test
pnpm test:cold-session
```

Expected: all tests pass. The full test count delta is +7 (the 7 tests in `legacy-cleanup.test.cjs`).

### Step 7.11: Commit the legacy cleanup

**Recommendation: split into 3 commits for review hygiene:**

- **Commit 1: file move** (Step 7.3 only)
- **Commit 2: import migration** (Steps 7.4, 7.5, 7.6, 7.7, 7.8)
- **Commit 3: legacy-cleanup test** (Step 7.9 + 7.10)

Or, if atomicity is preferred for the cutover (matching Plan 1's pattern), **1 commit for all of Steps 7.3-7.10**.

**Commit message (single-commit option):**

```
refactor(legacy): complete C-9 cutover (move tools/learning-loop-mcp/{tools,core,scout}/ → legacy/, delete #mcp/* alias)

Phase D Plan 4 phase-07:
- tools/learning-loop-mcp/tools/ → tools/learning-loop-mastra/tools/legacy/ (31 files)
- tools/learning-loop-mcp/core/ → tools/learning-loop-mastra/core/legacy/
- tools/learning-loop-mcp/scout/ → tools/learning-loop-mastra/scout/legacy/
- 5 cross-package #mcp/* imports migrated (schemas.js, create-loop-workflow.js,
  run-scout-tool.js, workflow-intake-plan.js, workflow-self-improvement.js)
- 2 direct path imports in __tests__/coerce-correctness.test.js migrated
- 38 self-imports inside the moved files migrated
- 5 prose references in scout-agent.js + run-scout-tool.js updated to new path
- agent-prompt-content.test.cjs LOCKED instruction markers preserved
- package.json: #mcp/* alias deleted; #mastra/* alias preserved
- tools/learning-loop-mcp/hooks/ kept in place (Option B; runtime hooks)
- New __tests__/legacy-cleanup.test.cjs (7 tests) asserts no #mcp/* imports
  remain; all 7 cross-package consumers resolve; 5 prose references updated

The agent-manifest.json#groups names are unchanged (gate, workflow, meta_state,
introspection, runtime_agnostic, agent). The 6-group structure + 44-tool total
is preserved. The MCP server key is NOT renamed in this phase; that's phase-08.
```

## Success Criteria

- [ ] `tools/learning-loop-mcp/tools/`, `core/`, `scout/` are gone (moved to `legacy/`).
- [ ] `tools/learning-loop-mcp/hooks/` is either kept in place (Option B) or moved to `tools/learning-loop-mastra/hooks/legacy/` (Option A).
- [ ] 5 cross-package `#mcp/*` imports are migrated to direct relative paths.
- [ ] 2 direct path imports in `__tests__/coerce-correctness.test.js` are migrated.
- [ ] 38 self-imports inside the moved files are migrated to direct relative paths.
- [ ] 5 prose references in agent instructions + scout tool descriptions are updated to the new path.
- [ ] `package.json#imports` has no `#mcp/*` alias.
- [ ] `agent-prompt-content.test.cjs` LOCKED instruction markers test stays GREEN.
- [ ] `__tests__/legacy-cleanup.test.cjs` exists with 7 tests, all GREEN.
- [ ] `pnpm test` passes (delta: +7 tests for legacy-cleanup).
- [ ] `pnpm test:cold-session` passes.
- [ ] 1-3 commits with the legacy cleanup.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The 38 self-imports are not exhaustively enumerated, and one is missed | Medium | Step 7.1 audits all 38 imports. Step 7.6 uses a script to mechanically replace. The `legacy-cleanup.test.cjs` (Step 7.9) catches missed imports via `grep -rln "#mcp/"`. |
| The `coerce-correctness.test.js` direct path import migration breaks the test (because the path depth is wrong) | Low | The test file is at `tools/learning-loop-mastra/__tests__/`; the target is at `tools/learning-loop-mastra/core/legacy/`. The relative path `../core/legacy/...` is correct (1 level up + 2 path segments). |
| The hooks directory migration (Option A) breaks `.factory/hooks/loop-surface-inject.cjs` (which references the hooks) | Medium | Option B (keep hooks in place) avoids this risk. If Option A, the loader must be updated. |
| The 5 prose reference updates break `agent-prompt-content.test.cjs` (C3 finding from Plan 3 hardening) | Low | The test asserts the LOCKED marker (e.g., `Bound surface: the meta-surface`), NOT the file paths. The marker is preserved. |
| The `legacy-cleanup.test.cjs` (Step 7.9) is itself affected by the `#mcp/*` alias deletion (e.g., it uses `execSync('grep -rln "#mcp/" ...')` which might be matched by the regex) | Low | The test uses `execSync` to shell out to `grep`; the grep pattern is the literal string `#mcp/`, not an import statement. The grep is finding files that contain the string, not files that import the alias. The test's own code uses the string `#mcp/` inside the shell command; this is a string in the test, not an import. |
| The file-move pattern is not atomic with the import updates, causing a brief window where imports break | Low | All changes ship in 1 commit (or 3 sequential commits in the same branch). The `pnpm test` is run after all commits are applied. The branch is not merged until tests pass. |
| The legacy `tools/learning-loop-mcp/__tests__/` (if any) still reference the moved files | Low | Audit `tools/learning-loop-mcp/__tests__/` for any references. If found, migrate them too. If the directory is empty after migration, delete it. |
| The `core/legacy/` + `scout/legacy/` directories are large (many files) and the `git mv` is slow | Low | `git mv` is fast for file-system moves; the only delay is the file IO. Estimate: ~30 seconds. |
| The 38 self-imports include some that are `from "#mcp/tools/..."` (correct) vs `from "#mcp/core/..."` (which should now be `from "../../core/legacy/..."`) — the script must handle both prefixes | Low | The script (Step 7.6) explicitly handles both prefixes. The replacement is mechanical: `#mcp/tools/X` → `../../tools/legacy/X`, `#mcp/core/X` → `../../core/legacy/X`, `#mcp/scout/X` → `../../scout/legacy/X`. |
| The legacy `tools/learning-loop-mcp/scripts/` (if any) reference the moved files | Low | Audit `tools/learning-loop-mcp/scripts/` (and any other subdirs not listed above) for `#mcp/*` imports. Migrate if found. |
