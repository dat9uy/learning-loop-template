---
phase: 2
title: "Implementation"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Implementation

## Overview

Implement `stripMessageFlags` in `gate-logic.js` and modify `matchConstraintPattern` to call it before pattern matching. The function must be surgical — it only strips message flags, not all quoted strings.

## Requirements

- **Functional:** Message flags are stripped before pattern matching; wrapper commands remain intact.
- **Non-functional:** Zero performance impact on commands without message flags.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js`

## Implementation Steps

1. **Add `message_flags` to `patterns.json`**

```json
{
  "docker": "\\bdocker\\b(?!-)",
  "sudo": "\\bsudo\\b",
  "package-manager": "\\b(pip|npm|yarn|pnpm|uv)\\s+(install|add|sync|bootstrap|setup)\\b",
  "vendor-api": "\\bcurl\\b.*api|import\\s+vnstock(?!_data)\\b",
  "side-effect-import": "import\\s+vnstock_data\\b",
  "message_flags": ["-m", "--message", "--title", "--description", "--body"]
}
```

Note: `-t` is intentionally omitted because it collides with `timeout`, `ssh`, `screen`, etc. `--title` is the unambiguous form. `-body` is omitted because it is not a standard flag for any known CLI tool.

2. **Add `stripMessageFlags` function**

```javascript
const MESSAGE_FLAGS = new Set(PATTERNS_RAW.message_flags || []);

function stripMessageFlags(segment) {
  const tokens = segment.split(/\s+/);
  const result = [];
  let skipNext = false;

  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (MESSAGE_FLAGS.has(token)) {
      skipNext = true;
      continue;
    }
    result.push(token);
  }

  return result.join(" ");
}
```

3. **Modify `matchConstraintPattern`**

In the loop over segments, after trimming but before pattern matching:

```javascript
const stripped = stripMessageFlags(trimmed);
for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
  if (pattern.test(stripped)) return type;
}
```

4. **Run the new tests** — they should pass (green state).

5. **Run the full test suite** — verify no regressions.

## Success Criteria

- [ ] `MESSAGE_FLAGS` constant added with conservative initial list
- [ ] `stripMessageFlags` function added and unit-tested
- [ ] `matchConstraintPattern` calls `stripMessageFlags` before pattern matching
- [ ] New tests from Phase 1 pass (green state)
- [ ] All existing tests pass (no regression)
