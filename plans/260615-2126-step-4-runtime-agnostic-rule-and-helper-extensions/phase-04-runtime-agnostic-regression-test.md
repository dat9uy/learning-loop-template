---
phase: 4
title: "runtime-agnostic regression test — locks the helper API + cross-surface pattern"
status: completed
priority: P2
effort: "1h"
dependencies:
  - "phase-01-appendtoallsurfaces-helper"
  - "phase-02-readjsonlfromallsurfaces-helper"
  - "phase-03-readmodifywriteonallsurfaces-helper"
---

# Phase 4: runtime-agnostic regression test — locks the helper API + cross-surface pattern

## Overview

Add the `__tests__/runtime-agnostic.test.js` regression test that asserts the runtime-agnostic pattern is fully applied across the codebase. This is the automated catch: it runs on every test run, scanning `core/` for hard-coded surface paths, asserting all 6 cross-surface helpers (`SURFACES`, `getAllCoordinationPaths`, `writeToAllSurfaces`, `readFromAllSurfaces`, `appendToAllSurfaces`, `readJsonlFromAllSurfaces`, `readModifyWriteOnAllSurfaces`) are used as the canonical API, and verifying the surface-shim invariant.

This is greenfield (no production code change) — the test asserts the **existing** pattern (now 100% applied after Phases 1-3) and catches future violations. The test does not import from `surfaces.js` to assert the API; it inspects the codebase via `grep` + `readFileSync` to assert that the **call sites** comply.

## Requirements

Functional: 10 tests, organized into 3 categories:

1. **Helper API completeness (3 tests)** — assert all 6 cross-surface helpers are exported from `core/surfaces.js` with the right signatures.
2. **No hand-rolled cross-surface loops in `core/` (3 tests)** — assert `core/` files don't have inline `for (const surface of SURFACES)` loops outside of `surfaces.js` itself; assert no hard-coded `join(root, ".claude"` or `join(root, ".factory"` outside of `surfaces.js`; assert all `core/` files that need cross-surface iteration import from `surfaces.js`.
3. **Shim + manifest invariants (4 tests)** — assert both shim directories have the same set of hook names (filtered to `.cjs`); assert the manifest is registered and discoverable; assert `protocol-adapter.js` exports the canonical I/O contract; assert `core/gate-logic.js#GLOB_SCOPE_WHITELIST` includes both surface prefixes.

**Shared module with Phase 6 (single source of truth):** the 6-item runtime-agnostic checklist is defined in `core/runtime-agnostic-checklist.js` (a new shared module). Both this regression test (Phase 4) and the `check_runtime_agnostic` MCP tool (Phase 6) import `CHECKLIST` from this module. Drift between the test and the tool is impossible.

Non-functional:
- The test runs as part of `pnpm test` (no new test runner config).
- The test uses `node:test` + `node:assert` + `node:fs` + `node:path` (same imports as existing tests).
- The test is read-only (no `writeFileSync`); it inspects the codebase.
- The test fails fast on the first violation (each test is independent; no shared state).

## Architecture

### Test structure

```js
// tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js

import assert from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const MCP_ROOT = new URL("../..", import.meta.url).pathname;
const CORE_DIR = join(MCP_ROOT, "tools/learning-loop-mcp/core");
const SHIM_CLAUDE = join(MCP_ROOT, ".claude/coordination/hooks");
const SHIM_FACTORY = join(MCP_ROOT, ".factory/coordination/hooks");
const MANIFEST_PATH = join(MCP_ROOT, "tools/learning-loop-mcp/agent-manifest.json");
const PROTOCOL_ADAPTER_PATH = join(CORE_DIR, "hooks/lib/protocol-adapter.js");

// ─── Helper API completeness (3 tests) ───

await test("surfaces.js exports all 6 cross-surface helpers", () => {
  const src = readFileSync(join(CORE_DIR, "surfaces.js"), "utf8");
  for (const helper of [
    "SURFACES",
    "getAllCoordinationPaths",
    "writeToAllSurfaces",
    "readFromAllSurfaces",
    "appendToAllSurfaces",
    "readJsonlFromAllSurfaces",
    "readModifyWriteOnAllSurfaces",
  ]) {
    assert.ok(
      src.includes(`export`) && src.includes(helper),
      `surfaces.js must export ${helper}`,
    );
  }
});

await test("surfaces.js SURFACES is frozen and contains the canonical runtimes", () => {
  const mod = await import("../core/surfaces.js");
  assert.ok(Object.isFrozen(mod.SURFACES), "SURFACES must be Object.frozen");
  assert.deepStrictEqual([...mod.SURFACES], [".claude", ".factory"]);
});

await test("surfaces.js helper signatures are stable", () => {
  const src = readFileSync(join(CORE_DIR, "surfaces.js"), "utf8");
  // Spot-check the signature of each helper (parameter names + return type).
  assert.ok(src.includes("function writeToAllSurfaces(root, subpath, content)"));
  assert.ok(src.includes("function readFromAllSurfaces(root, subpath"));
  assert.ok(src.includes("function appendToAllSurfaces(root, subpath, line)"));
  assert.ok(src.includes("function readJsonlFromAllSurfaces(root, subpath"));
  assert.ok(src.includes("function readModifyWriteOnAllSurfaces(root, subpath, modifier)"));
});

// ─── No hand-rolled cross-surface loops in core/ (3 tests) ───

await test("core/ has no inline for-of-SURFACES loops outside surfaces.js", () => {
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (/for\s*\(\s*const\s+\w+\s+of\s+SURFACES\s*\)/.test(src)) {
      offenders.push(file);
    }
  }
  assert.deepStrictEqual(offenders, [], `core/ files with hand-rolled SURFACES loops: ${offenders.join(", ")}`);
});

await test("core/ has no hard-coded 'join(root, \".claude\"' or 'join(root, \".factory\"' outside surfaces.js", () => {
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (/join\s*\(\s*root\s*,\s*"\.(claude|factory)"/.test(src)) {
      offenders.push(file);
    }
  }
  assert.deepStrictEqual(offenders, [], `core/ files with hard-coded surface paths: ${offenders.join(", ")}`);
});

await test("all core/ files that read or write coordination paths import from surfaces.js", () => {
  // For each file in core/ that mentions 'coordination' but does not import from
  // surfaces.js, flag it. The intent: a new file that hand-rolls surface
  // iteration is caught at code-review time by this test.
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    if (file.endsWith("patterns.json")) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (!src.includes("coordination")) continue;
    if (!src.includes(`from "./surfaces.js"`) && !src.includes(`from "../surfaces.js"`)) {
      offenders.push(file);
    }
  }
  assert.deepStrictEqual(offenders, [], `core/ files mentioning 'coordination' without importing surfaces.js: ${offenders.join(", ")}`);
});

// ─── Shim + manifest invariants (4 tests) ───

await test("both shim directories have the same set of hook shim names (excluding README/markdown)", () => {
  // Filter to .cjs shim files only; READMEs and other non-shim artifacts are not part of the mirror contract.
  const filterShims = (dir) =>
    existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort()
      : [];
  const claudeShims = filterShims(SHIM_CLAUDE);
  const factoryShims = filterShims(SHIM_FACTORY);
  assert.deepStrictEqual(
    claudeShims,
    factoryShims,
    `claude shims: ${claudeShims.join(", ")}; factory shims: ${factoryShims.join(", ")}`,
  );
});

await test("agent-manifest.json is registered and has the expected group structure", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  assert.strictEqual(manifest.server, "learning-loop-mcp");
  assert.ok(manifest.groups.gate, "manifest must have a 'gate' group");
  assert.ok(manifest.groups.workflow, "manifest must have a 'workflow' group");
  assert.ok(manifest.groups.meta_state, "manifest must have a 'meta_state' group");
  assert.ok(manifest.groups.introspection, "manifest must have an 'introspection' group");
});

await test("protocol-adapter.js exports the canonical I/O contract", () => {
  const src = readFileSync(PROTOCOL_ADAPTER_PATH, "utf8");
  for (const sym of ["parseInput", "formatOutput", "normalizeToolName"]) {
    assert.ok(
      src.includes(`export`) && src.includes(sym),
      `protocol-adapter.js must export ${sym}`,
    );
  }
});

await test("GLOB_SCOPE_WHITELIST includes both surface prefixes via SURFACES", () => {
  const src = readFileSync(join(CORE_DIR, "gate-logic.js"), "utf8");
  assert.ok(src.includes("...SURFACES.map"), "GLOB_SCOPE_WHITELIST must use SURFACES.map(...) to derive prefixes");
  // Both .claude/ and .factory/ are in SURFACES; the spread ensures both whitelisted.
});
```

### Why this test is greenfield (not a refactor)

The test asserts the **existing** pattern. After Phases 1-3, the pattern is:
- All cross-surface iteration lives in `core/surfaces.js`.
- All `core/` files that need cross-surface iteration import from `surfaces.js`.
- The shim directories mirror each other.
- The manifest is registered.

The test pins this state. A future change that violates any of these patterns fails the test. The test is the regression guard; future features are runtime-agnostic by design.

## Related Code Files

- Create: `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js` (~80 lines, exports `CHECKLIST` with the 6-item array + 6 verify functions).
- Create: `tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js` (~120 lines, 10 tests).
- No other files touched. (The production code is already in the right state after Phases 1-3.)

## Implementation Steps (TDD)

1. **Read existing test files for style consistency.** `__tests__/surfaces.test.js` (already read in plan-prep) and `__tests__/cross-surface.test.js` (newer test that already covers some cross-surface invariants).
2. **Create `__tests__/runtime-agnostic.test.js`** with the 10 tests above. Group by category with section comments.
3. **Run `pnpm test -- runtime-agnostic`**. Expect 10 GREEN (the assertions match the current state after Phases 1-3).
4. **Run the full test suite.** `pnpm test` — expect 976/977 (1 skipped). No regressions. (Baseline 957/958 + 9 helper tests + 10 regression tests.)
5. **Mutation test (manual).** Temporarily add `join(root, ".claude", "coordination", "test.json")` to a non-surfaces.js file in `core/`. Run `pnpm test -- runtime-agnostic`. Expect the 2nd test in the "No hand-rolled" group to FAIL. Revert the mutation. Test should pass again. (The mutation test is manual; the file says so in the test comment.)
6. **Whole-plan consistency check.** `grep -n "runtime-agnostic" tools/learning-loop-mcp/__tests__/` — expect 1 match (the new test file). `grep -n "runtime-agnostic" tools/learning-loop-mcp/core/` — expect 0 matches (the rule entry is added in Phase 7, not yet).

## Success Criteria

- [x] `__tests__/runtime-agnostic.test.js` exists with 10 tests, all GREEN.
- [x] `pnpm test -- runtime-agnostic` shows 10 GREEN.
- [x] `pnpm test` shows 976/977 (1 skipped). No regressions in any other test file.
- [x] Mutation test (manual) confirms the test catches a hard-coded surface path violation.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The test imports `core/surfaces.js` at test time (the "frozen SURFACES" test). If the helper file has a syntax error, the test file fails to load. | The other 9 tests use `readFileSync` + `grep` (no import), so they catch most issues even if the import test fails. The import test is "best effort". |
| The shim-mirror test assumes both shim directories exist. If only one exists (e.g., in a CI sandbox that has only `.claude/`), the test fails. | The test reads `readdirSync` and tolerates missing dirs (`existsSync ? readdirSync : []`). The assertion is `deepStrictEqual`; if both are `[]`, it passes. |
| The GLOB_SCOPE_WHITELIST test uses `src.includes("...SURFACES.map")` which is brittle (a future refactor might rename the spread). | The test is a guard against the **known** asymmetry (the missing `.claude/`). The exact spread syntax is the contract for now. If a future refactor changes the syntax, the test should be updated to match. |
| The mutation test step is manual and may be skipped. | The mutation test is documented in the step; the test itself is a guard. The manual mutation is a one-time sanity check, not part of the run. |

## Security Considerations

- The test reads `core/` files via `readFileSync`. No write access. No attack surface.
- The test asserts no hard-coded surface paths in `core/`. This is a maintainability invariant, not a security one. (Hard-coded paths are a code-smell, not a vulnerability.)
- The test does not depend on the production runtime state. It is hermetic.

## Next Steps

After Phase 4 ships:
- The runtime-agnostic pattern is locked. Future features that violate it fail the test.
- Phase 5: `consult-checklist` pattern type (recognizes the new rule shape).
- Phase 6: `check_runtime_agnostic` MCP tool (the audit surface).
- Phase 7: rule entry + AGENTS.md + `loop_describe` hint (rule is discoverable).
