---
phase: 1
title: "Foundation: extract GLOBS to shared module + unit tests"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Foundation

## Overview

Extract the `GLOBS` array currently inline-defined in `tools/scripts/run-pnpm-test-namespaced.mjs` into a new shared module `tools/scripts/test-globs.mjs`. This is the prerequisite for both runners (`run-pnpm-test-namespaced.mjs` and the upcoming `run-pnpm-test-summary.mjs`) to stay in sync via DRY rather than via copy-paste discipline.

**Commit structure:** Phase 1 is shipped as **two commits, not one**, to preserve the pure-extraction rollback boundary (per Red Team Finding 11):

- **Phase 1a — pure extraction:** Steps 1–6 below. Adds `tools/scripts/test-globs.mjs` with the 15 carried-over entries; `tools/scripts/run-pnpm-test-namespaced.mjs` imports from it; `tools/scripts/__tests__/test-globs.test.js` (5 tests, asserts `GLOBS.length === 15`). Zero behavior change in `pnpm test` suite-footer count.
- **Phase 1b — new namespace:** Step 7 below. Adds the 16th `test-globs-tests` entry to GLOBS; updates `test-globs.test.js` length assertion to `=== 16`. Behavior change: suite-footer count goes from 15 → 16 globs; pre-commit now runs the test-globs unit tests.

If Phase 2's TAP parser reveals a structural bug post-Phase-2, the rollback is: revert Phase 2, then independently revert either Phase 1a (restoring the inline GLOBS array) or Phase 1b (removing the test-globs-tests entry) without disturbing the other.

## Why this is Phase 1 (not bundled with Phase 2 or 3)

Two reasons:

1. **Cheap correctness win regardless of Phase 2.** Extracting the constant is a pure refactor with zero behavior change. Even if Phase 2 (TAP wrapper) is rejected during code review, this extraction is independently valuable.
2. **Forces the import boundary.** Before the TAP wrapper reads the GLOBS list, Phase 1 makes it explicit that BOTH runners consume the same source. Phase 2 cannot accidentally inline a second copy because there is no longer an inline copy in the namespaced runner to copy from.

## Requirements

### Functional

- `tools/scripts/test-globs.mjs` exports a named `GLOBS` constant: `Array<{ ns: string, pattern: string }>`.
- `tools/scripts/run-pnpm-test-namespaced.mjs` imports `GLOBS` from `./test-globs.mjs` and removes the inline definition.
- Phase 1a's shared module contains the 15 carried-over entries verbatim from the existing namespaced runner. Phase 1b adds the 16th `test-globs-tests` entry as a separate commit.
- `tools/scripts/__tests__/test-globs.test.js` asserts:
  - In Phase 1a: `GLOBS.length === 15`. In Phase 1b: updated to `GLOBS.length === 16`.
  - Each entry has `ns: string` and `pattern: string`.
  - All `ns` values match `^[a-z0-9-]+$` (the `NS_RE` from the existing runner).
  - No duplicate `ns` values.
  - At least these namespaces exist: `mcp-tests`, `mcp-core-tests`, `mcp-tools`, `r2-tests`, `phase-e-shell-restructure`, `test-globs-tests`. These are the namespaces that:
    - have security-sensitive tests (mcp-tools, r2-tests),
    - are the most recently added (phase-e-shell-restructure was the Plan 6 add-on),
    - or are the meta-test for this extraction (`test-globs-tests`).
  - **NOT** in the must-preserve set: `interface-contract-tests`. Per Red Team Finding 14, that namespace is a single-file glob (`tools/learning-loop-mastra/interface/__tests__/contract.test.js`); pinning it as a required namespace creates a brittle contract for future refactors. The pin lives in the module header comment as a known-design-state note ("single-file glob; sibling additions require a new namespace entry") instead.

### Non-functional

- Zero behavior change for `pnpm test` in Phase 1a (the runner script is equivalent pre/post extraction, suite-footer count unchanged at 15 globs). Phase 1b changes the suite-footer to 16 globs.
- The new file is named `test-globs.mjs` (kebab-case, follows the project's JS convention per `/home/datguy/.claude/rules/development-rules.md`).
- No new dependencies. No new package imports.
- `.test-logs/` is verified to be in `.gitignore` (per Red Team Finding 13). The verification step (`grep -E '^\.test-logs' .gitignore`) runs as part of Phase 1a Step 5 to confirm gitignore coverage before any summary JSON writes happen in Phase 2. The known state is `.gitignore:19 — .test-logs/ is gitignored` (verified during planning).

## Architecture

### Before (current state)

```
tools/scripts/run-pnpm-test-namespaced.mjs  (199 lines)
  └── const GLOBS = [ ... 15 entries ... ]   // inline, L24-L46 (extracted in Phase 1; the new shared module adds 1 more)
  └── function runGlob(glob)  // consumes GLOBS via closure
  └── async function main() {
        for (const glob of GLOBS) { results.push(await runGlob(glob)); }
      }
```

### After (this phase's target)

```
tools/scripts/test-globs.mjs  (~35 lines, NEW)
  └── export const GLOBS = [ ... 16 entries ... ]   // 15 verbatim + 1 new test-globs-tests
  └── export const NS_RE = /^[a-z0-9-]+$/           // also move (shared)

tools/scripts/run-pnpm-test-namespaced.mjs  (185 lines)
  └── import { GLOBS, NS_RE } from "./test-globs.mjs"   // new, 1 line
  └── (inline GLOBS array removed)
  └── (inline NS_RE removed — sanitizeNs still uses it via the imported binding)
  └── function runGlob(glob)  // unchanged
  └── async function main() {
        for (const glob of GLOBS) { results.push(await runGlob(glob)); }
      }
```

### Why `NS_RE` is also moved

The `NS_RE` constant is part of the same module-shape concern. If both runners independently validate ns format, they need a single source. Currently `run-pnpm-test-namespaced.mjs` uses `NS_RE` only in `sanitizeNs`. Phase 2's summary runner will need the same validator. Exporting it from `test-globs.mjs` keeps both runners honest.

## Related Code Files

### Create

- `tools/scripts/test-globs.mjs` — GLOBS + NS_RE module (~40 lines, includes 16 entries; see Step 2).
- `tools/scripts/__tests__/test-globs.test.js` — unit tests for shape invariants (~60 lines).

### Modify

- `tools/scripts/run-pnpm-test-namespaced.mjs` — replace inline GLOBS (L24-L46) with `import`. Remove inline NS_RE (L49). Net: −23 lines, +1 line.

### Delete

- None.

## Implementation Steps

### Step 1: Verify the current GLOBS list is exactly what's documented

Before extracting, reconfirm the actual count and contents. The existing comment block says "Active globs (12). Plan 6 adds phase-e-shell-restructure (total 13)." — but the actual array has 15 entries. Update the comment block in the new module to reflect actual state.

Command: `grep -c "ns:" tools/scripts/run-pnpm-test-namespaced.mjs` — verify 15 (the source has 15; the new module will have 16 after adding `test-globs-tests`).

### Step 2: Create `tools/scripts/test-globs.mjs`

Literal contents (the existing 15 entries, verbatim, with NS_RE also exported — Phase 1a; Step 7 in Phase 1b adds the 16th `test-globs-tests` entry separately):

```js
#!/usr/bin/env node
/**
 * Shared test GLOBS list + namespace regex used by every node --test runner script
 * (run-pnpm-test-namespaced.mjs and run-pnpm-test-summary.mjs).
 *
 * Single source of truth: if a new test directory appears, add it here.
 *
 * History (from run-pnpm-test-namespaced.mjs#GLOBS, 2026-07-13):
 *   - Plan 6 added phase-e-shell-restructure (now 15 namespaces total pre-Phase-1; 16 after).
 *   - Plan B Phase 3 dropped 2 dead globs:
 *     * tools/learning-loop-mcp/scout/*.test.js (matched fixture files, not live)
 *     * tools/learning-loop-mcp/evals/*.test.js (directory empty)
 *   - Plan 4 cutover (2026-06-24) repointed the 5 mcp-* globs at the
 *     tools/learning-loop-mastra/{__tests__/legacy-mcp, core, core/lib,
 *     tools/handlers}/ tree.
 *   - The r2-tests entry was added in __tests__/r2/*.test.js — placed under
 *     __tests__/r2/ specifically so the mastra-js __tests__/*.test.js glob
 *     misses it (kept security suite isolated).
 *   - 2026-07-13 plan 260713-1503-test-runner-summary Phase 1: extracted
 *     GLOBS into this shared module and added test-globs-tests (16 entries
 *     total).
 */

export const GLOBS = [
  { ns: "mcp-tests", pattern: "tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js" },
  { ns: "mcp-core-tests", pattern: "tools/learning-loop-mastra/core/__tests__/*.test.js" },
  { ns: "mcp-core", pattern: "tools/learning-loop-mastra/core/*.test.js" },
  { ns: "mcp-entry", pattern: "tools/learning-loop-mastra/core/entry/*.test.js" },
  { ns: "mcp-lib", pattern: "tools/learning-loop-mastra/core/lib/*.test.js" },
  { ns: "mcp-tools", pattern: "tools/learning-loop-mastra/tools/handlers/*.test.js" },
  { ns: "mastra-js", pattern: "tools/learning-loop-mastra/__tests__/*.test.js" },
  { ns: "mastra-cjs", pattern: "tools/learning-loop-mastra/__tests__/*.test.cjs" },
  { ns: "r2-tests", pattern: "tools/learning-loop-mastra/__tests__/r2/*.test.js" },
  { ns: "claude-coord-cjs", pattern: ".claude/coordination/__tests__/*.test.cjs" },
  { ns: "factory-cjs", pattern: ".factory/hooks/__tests__/*.test.cjs" },
  { ns: "phase-e-foundation", pattern: "tools/learning-loop-mastra/__tests__/phase-e-foundation/*.test.js" },
  { ns: "interface-regression-guards", pattern: "tools/learning-loop-mastra/__tests__/interface/*.test.js" },
  { ns: "interface-contract-tests", pattern: "tools/learning-loop-mastra/interface/__tests__/contract.test.js" },
  { ns: "phase-e-shell-restructure", pattern: "tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js" },
  // Phase 1b (separate commit) adds: { ns: "test-globs-tests", pattern: "tools/scripts/__tests__/*.test.js" }
  // — see Step 7 below. Phase 1a ships with 15 entries.
];

export const NS_RE = /^[a-z0-9-]+$/;
```

### Step 3: Create `tools/scripts/__tests__/test-globs.test.js`

Imports `GLOBS` and `NS_RE` and asserts the invariants:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GLOBS, NS_RE } from "../test-globs.mjs";

describe("test-globs invariants", () => {
  test("GLOBS is a non-empty array of {ns, pattern} records", () => {
    assert.ok(Array.isArray(GLOBS));
    assert.ok(GLOBS.length > 0);
    for (const entry of GLOBS) {
      assert.ok(typeof entry.ns === "string");
      assert.ok(typeof entry.pattern === "string");
    }
  });

  test("namespace count matches the documented figure", () => {
    // Phase 1a: asserts 15 (carried-over entries only).
    // Phase 1b: updated to assert 16 after test-globs-tests is added.
    assert.equal(GLOBS.length, 15);
  });

  test("every ns matches NS_RE", () => {
    for (const { ns } of GLOBS) {
      assert.ok(NS_RE.test(ns), `ns "${ns}" violates NS_RE`);
    }
  });

  test("no duplicate namespaces", () => {
    const seen = new Set();
    for (const { ns } of GLOBS) {
      assert.ok(!seen.has(ns), `duplicate ns: ${ns}`);
      seen.add(ns);
    }
  });

  test("contains the security-sensitive + recently-added + meta-test namespaces", () => {
    // Note: interface-contract-tests intentionally NOT in this set —
    // see plan/phase-01-foundation.md#phase-1b "Known singleton note".
    const required = new Set([
      "mcp-tests", "mcp-core-tests", "mcp-tools", "r2-tests",
      "phase-e-shell-restructure", "test-globs-tests",
    ]);
    const present = new Set(GLOBS.map(e => e.ns));
    for (const ns of required) {
      assert.ok(present.has(ns), `missing required ns: ${ns}`);
    }
  });
});
```

### Step 4: Modify `tools/scripts/run-pnpm-test-namespaced.mjs`

Two edits:

**Edit 1** — replace the inline GLOBS array (L24-L46) with an import. The import goes after the existing `import { ... } from "node:..."` block (currently L7-L13).

```diff
-// Active globs (12). Plan 6 adds phase-e-shell-restructure (total 13).
-// [existing 23-line comment block]
-const GLOBS = [
-  { ns: "mcp-tests", pattern: "tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js" },
-  // ... etc
-];
+import { GLOBS, NS_RE } from "./test-globs.mjs";
```

**Edit 2** — remove `const NS_RE = /^[a-z0-9-]+$/;` (L49). NS_RE is now imported from the shared module.

### Step 5: Run `pnpm test` to verify equivalence (Phase 1a)

The full suite must pass with no behavioral change in Phase 1a. The summary line at the end (`[suite] ==> pass (15 globs, N tests, Ns)`) must match what was emitted before, modulo timestamps and counts. The per-namespace pass/fail counts are unchanged.

**Additional Phase 1a verification (Red Team Finding 13):** Confirm `.test-logs/` is in `.gitignore` before Phase 2 writes summary JSON:

```sh
grep -E '^\.test-logs' /home/datguy/codingProjects/learning-loop-template/.gitignore
```

Expected: at least one matching line (known state: `.gitignore:19 — .test-logs/`). If missing, STOP and surface to operator — do not proceed to Phase 2, which will write JSON files that may leak secrets if the gitignore coverage is absent.

### Step 6: Run `node --test tools/scripts/__tests__/test-globs.test.js` to verify the new unit tests pass

The new test file is referenced by the new `test-globs-tests` GLOB. In Phase 1a, the GLOB does not yet contain `test-globs-tests`, so `pnpm test` does not auto-pick it up. For Phase 1a verification, run ad-hoc:

```sh
node --test tools/scripts/__tests__/test-globs.test.js
```

After Phase 1b lands (Step 7), `pnpm test` picks it up automatically.

```sh
node --test tools/scripts/__tests__/test-globs.test.js
```

## Success Criteria

### Phase 1a Success Criteria
- [ ] `node --test tools/scripts/__tests__/test-globs.test.js` exits 0.
- [ ] `pnpm test` exits 0 with **15 globs** in the suite-footer — same per-namespace pass/fail counts as the pre-extraction baseline.
- [ ] `grep -c "const GLOBS" tools/scripts/run-pnpm-test-namespaced.mjs` returns 0 (no inline copy remains).
- [ ] `grep "import.*GLOBS.*test-globs" tools/scripts/run-pnpm-test-namespaced.mjs` returns the import line.
- [ ] `grep -E '^\.test-logs' .gitignore` returns at least one matching line (verified `.test-logs/` is gitignored before Phase 2 writes summary JSON).
- [ ] All 5 unit-test assertions in `tools/scripts/__tests__/test-globs.test.js` pass.

### Phase 1b Success Criteria (separate commit)
- [ ] GLOBS contains 16 entries (the original 15 + the new `test-globs-tests` entry).
- [ ] `test-globs.test.js` length assertion updated to `=== 16`.
- [ ] `pnpm test` exits 0 with **16 globs** in the suite-footer.
- [ ] `test-globs-tests` namespace's PASS line is visible in the namespaced runner output (verifying the unit tests ran in CI).

### Phase 1 (combined) Meta-Criteria
- [ ] `meta_state_check_grounding({id: "meta-260712T0730Z-..." })` is unchanged after Phase 1a (no fingerprint drift on the original finding; the test runner code itself does not shift in Phase 1a). After Phase 1b, the test-globs unit-test files are new (no prior evidence_code_ref), so no drift risk.

## Risk Assessment

### Risk: GLOBS extraction silently drops an entry

**Severity:** Low. **Mitigation:** The unit test pins `GLOBS.length === 15` after Phase 1a (updated to `=== 16` after Phase 1b). If extraction miscounts, the test fails immediately. `pnpm test` after the edit verifies that the same number of test events ran for the original 15 namespaces.

### Risk: `import` in a `.mjs` file under pnpm/Node ESM misconfigures resolution

**Severity:** Very Low. **Mitigation:** Both files use the `.mjs` extension and `package.json` has `"type": "module"`. The relative path `./test-globs.mjs` is unambiguous. Sanity-check by `node -e "import('./test-globs.mjs').then(m => console.log(m.GLOBS.length))"` — expect `15` in Phase 1a, `16` after Phase 1b.

### Risk: Adding `test-globs-tests` to GLOBS creates a cycle if the test asserts on something that hasn't loaded yet

**Severity:** Very Low. **Mitigation:** The unit test imports only from `../test-globs.mjs`. It has no dependency on the runner scripts that consume GLOBS. No cycle.

### Risk: Forgetting to update the inline comment block in the new module

**Severity:** Cosmetic. **Mitigation:** Step 2 includes the corrected comment block (15 namespaces after Phase 1a, 16 after Phase 1b). The unit test pin on `length ===` is the authoritative truth.

### Risk: `.test-logs/` is not in `.gitignore` — JSON summary writes may leak secrets

**Severity:** Medium (Red Team Finding 13). **Mitigation:** Phase 1a Step 5 verifies `grep -E '^\.test-logs' .gitignore` returns a match before Phase 2 writes summary JSON. If absent, the plan halts until operator confirms gitignore coverage. Phase 2 also adds a sanitization pass on `failure.error` before writeFileSync (strip credential-like patterns).

### Risk: Phase 1 conflates "extract GLOBS" with "add new namespace"

**Severity:** Medium (Red Team Finding 11). **Mitigation:** Phase 1 ships as **two commits** (Phase 1a pure extraction + Phase 1b namespace addition), documented in the "Commit structure" section above. Rollback independence is the structural guarantee.

## Step 7 (Phase 1b — SEPARATE COMMIT): Add `test-globs-tests` to GLOBS

This step is intentionally NOT part of Phase 1a's pure extraction commit. It is Phase 1b.

```js
{ ns: "test-globs-tests", pattern: "tools/scripts/__tests__/*.test.js" },
```

In the same commit:
- Update `test-globs.test.js` length assertion from `=== 15` to `=== 16`.

After Phase 1b lands, `pnpm test` runs the test-globs + tap-parser unit tests as part of the namespace suite automatically.
