---
phase: 4
title: "Sync CJS/ESM Patterns"
status: complete
priority: P2
effort: "20m"
dependencies: [1]
---

# Phase 4: Sync CJS/ESM Patterns

## Overview

Gate patterns are duplicated: `gate-logic.js` (ESM, MCP server) and `gate-utils.cjs` (CJS, hooks). Phase 1 expands patterns in `gate-logic.js` but the hooks still have the old patterns. Both must stay in sync. The brainstorm specified `gate-utils.cjs` as single source of truth via `createRequire`, but the current implementation duplicates the patterns inline.

## Requirements

- Functional: hook patterns match MCP server patterns exactly
- Functional: pattern changes in `gate-logic.js` are automatically available to hooks
- Non-functional: no runtime dependency from CJS hooks on ESM modules (not possible without createRequire)
- Non-functional: pattern definitions exist in exactly one place

## Architecture

Option A: `createRequire` in CJS to import ESM patterns (brainstorm recommendation)
Option B: Generate CJS from ESM at build time
Option C: Keep patterns in sync manually (current approach, fragile)

**Decision:** Option A — `createRequire` is the brainstorm's recommendation. The CJS hook can `require()` the ESM module's `CONSTRAINT_PATTERNS` export.

## Related Code Files

- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs` — use createRequire to import patterns
- Modify: `tools/constraint-gate/gate-logic.js` — ensure CONSTRAINT_PATTERNS is a clean export
- Read: `tools/constraint-gate/gate-logic.test.js` — verify patterns are accessible

## TDD Steps

### Step 1: Write test for CJS pattern import

Create new test file `.claude/coordination/__tests__/gate-utils.test.cjs`:

```javascript
const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("gate-utils.cjs pattern sync", () => {
  it("loads CONSTRAINT_PATTERNS from patterns.json", () => {
    const { CONSTRAINT_PATTERNS } = require("../hooks/lib/gate-utils.cjs");
    assert.ok(CONSTRAINT_PATTERNS);
    assert.ok(CONSTRAINT_PATTERNS.docker instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS.sudo instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS["package-manager"] instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS["vendor-api"] instanceof RegExp);
  });

  it("patterns match expected commands", () => {
    const { matchConstraintPattern } = require("../hooks/lib/gate-utils.cjs");
    assert.strictEqual(matchConstraintPattern("docker run ubuntu"), "docker");
    assert.strictEqual(matchConstraintPattern("sudo rm -rf /"), "sudo");
    assert.strictEqual(matchConstraintPattern("pnpm install"), "package-manager");
    assert.strictEqual(matchConstraintPattern("pnpm bootstrap:api"), "package-manager");
    assert.strictEqual(matchConstraintPattern('python -c "import vnstock_data"'), "vendor-api");
    assert.strictEqual(matchConstraintPattern("ls"), null);
  });
});
```

### Step 2: Run tests (expect failure — createRequire can't import ESM)

```bash
node --test .claude/coordination/__tests__/bash-coordination-gate.test.cjs
```

### Step 3: Implement createRequire approach

Since `createRequire` can't directly import ESM modules, we need a different approach:

**Option A revised:** Extract patterns to a JSON file that both ESM and CJS can read.

Create `tools/constraint-gate/patterns.json`:
```json
{
  "docker": "\\bdocker\\b(?!-)",
  "sudo": "\\bsudo\\b",
  "package-manager": "\\b(pip|npm|yarn|pnpm|uv)\\s+(install|add|sync|bootstrap|setup)\\b",
  "vendor-api": "\\bcurl\\b.*api|import\\s+vnstock"
}
```

Update `gate-logic.js`:
```javascript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));

export const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);
```

Update `gate-utils.cjs`:
```javascript
const { readFileSync } = require("fs");
const { join } = require("path");

// gate-utils.cjs lives at .claude/coordination/hooks/lib/gate-utils.cjs
// patterns.json lives at tools/constraint-gate/patterns.json
// Need 4 levels up to reach project root
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "../../../../tools/constraint-gate/patterns.json"), "utf8"));

const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);
```

### Step 4: Run tests (expect passes)

```bash
node --test .claude/coordination/__tests__/gate-utils.test.cjs
node --test tools/constraint-gate/gate-logic.test.js
node --test .claude/coordination/__tests__/bash-coordination-gate.test.cjs
```

### Step 5: Run full test suite

```bash
pnpm test
```

## Success Criteria

- [ ] `CONSTRAINT_PATTERNS` in CJS hooks matches ESM MCP server exactly
- [ ] Pattern changes in `patterns.json` are picked up by both systems
- [ ] All existing hook tests pass
- [ ] All existing gate-logic tests pass
- [ ] No manual sync required between CJS and ESM

## Risk Assessment

- **Risk:** JSON file can't store RegExp directly. **Mitigation:** store patterns as strings, convert to RegExp at load time. This is already the approach in both current implementations.
- **Risk:** `patterns.json` path resolution differs between CJS and ESM. **Mitigation:** use `__dirname` (CJS) and `import.meta.url` (ESM) to resolve relative to each module's location. Both point to the same `tools/constraint-gate/` directory.
- **Risk:** Adding a JSON dependency changes the module loading order. **Mitigation:** `readFileSync` at module load time is synchronous and deterministic. Both CJS and ESM support this.
