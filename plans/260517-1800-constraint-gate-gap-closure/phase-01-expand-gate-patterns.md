---
phase: 1
title: "Expand Gate Patterns"
status: complete
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Expand Gate Patterns

## Overview

Add patterns for python imports of vendor packages and bootstrap/setup commands. These are the commands that actually trigger external system interactions but slip through the current gate.

## Requirements

- Functional: `python -c "import vnstock_data"` matches a constraint pattern
- Functional: `pnpm bootstrap:api` matches a constraint pattern
- Functional: `python -c "import vnstock"` (any vnstock module) matches
- Functional: `uv sync` matches (package manager install variant)
- Non-functional: patterns use word-boundary regex, consistent with existing patterns
- Non-functional: patterns are a single source of truth (ESM export)

## Related Code Files

- Modify: `tools/constraint-gate/gate-logic.js` — add patterns to `CONSTRAINT_PATTERNS`
- Modify: `tools/constraint-gate/gate-logic.test.js` — add tests for new patterns
- Read: `tools/constraint-gate/server.js` — verify pattern import works

## TDD Steps

### Step 1: Write tests for new patterns

Add to `gate-logic.test.js`:

```javascript
// python import of vendor package
test("python import vnstock_data matches vendor-api", () => {
  assert.strictEqual(matchConstraintPattern('python -c "import vnstock_data"'), "vendor-api");
});

test("python import vnstock matches vendor-api", () => {
  assert.strictEqual(matchConstraintPattern("python -c 'import vnstock'"), "vendor-api");
});

test("python3 import vnstock_data matches vendor-api", () => {
  assert.strictEqual(matchConstraintPattern("python3 -c 'import vnstock_data'"), "vendor-api");
});

// bootstrap/setup commands
test("pnpm bootstrap:api matches package-manager", () => {
  assert.strictEqual(matchConstraintPattern("pnpm bootstrap:api"), "package-manager");
});

test("pnpm setup matches package-manager", () => {
  assert.strictEqual(matchConstraintPattern("pnpm setup"), "package-manager");
});

// uv sync (package manager install variant)
test("uv sync matches package-manager", () => {
  assert.strictEqual(matchConstraintPattern("uv sync"), "package-manager");
});

// negative cases - should NOT match
test("python print does not match", () => {
  assert.strictEqual(matchConstraintPattern('python -c "print(1)"'), null);
});

test("import os does not match", () => {
  assert.strictEqual(matchConstraintPattern('python -c "import os"'), null);
});
```

### Step 2: Run tests (expect failures)

```bash
node --test tools/constraint-gate/gate-logic.test.js
```

### Step 3: Implement pattern expansion

In `gate-logic.js`, expand `CONSTRAINT_PATTERNS`:

```javascript
export const CONSTRAINT_PATTERNS = {
  docker: /\bdocker\b(?!-)/,
  sudo: /\bsudo\b/,
  "package-manager": /\b(pip|npm|yarn|pnpm|uv)\s+(install|add|sync|bootstrap|setup)\b/,
  "vendor-api": /\bcurl\b.*api|import\s+vnstock(?:_data)?\b/,
};
```

Changes:
- `package-manager`: add `uv` to tool list, add `sync|bootstrap|setup` to subcommands
- `vendor-api`: add `import\s+vnstock` to catch python imports of vnstock modules

### Step 4: Run tests (expect passes)

```bash
node --test tools/constraint-gate/gate-logic.test.js
```

### Step 5: Run full test suite

```bash
pnpm test
```

## Success Criteria

- [ ] `matchConstraintPattern('python -c "import vnstock_data"')` returns `"vendor-api"`
- [ ] `matchConstraintPattern("pnpm bootstrap:api")` returns `"package-manager"`
- [ ] `matchConstraintPattern("uv sync")` returns `"package-manager"`
- [ ] `matchConstraintPattern('python -c "print(1)"')` returns `null`
- [ ] All existing tests pass
- [ ] New tests pass

## Risk Assessment

- **Risk:** `import\s+vnstock` matches non-vendor imports. **Mitigation:** vnstock is the vendor package name; no standard library or common package uses this prefix.
- **Risk:** `bootstrap` matches non-package-manager commands. **Mitigation:** combined with `pnpm|npm|yarn|pip|uv` prefix, so only matches when preceded by a package manager.
