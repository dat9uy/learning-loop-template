---
phase: 3
title: "Make Write Gate Domain-Aware"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Make Write Gate Domain-Aware

## Overview

Rewrite `write-coordination-gate.cjs` to use the domain rules designed in Phase 1. Clean up `gate-utils.cjs` by removing profile-related exports that are now unreferenced.

## Requirements

- Functional: Domain rules from Phase 1 are implemented exactly.
- Functional: `records/observations/**` and `records/evidence/**` are blocked (observation integrity).
- Functional: `**/node_modules/**`, `**/dist/**`, `**/build/**` are blocked within `product/**`.
- Functional: `.claude/**` and root files (`*`) are explicitly allowed.
- Non-functional: Execution time remains under 50ms.

## Architecture

### Rewritten Write Gate

```javascript
const fs = require('fs');
const path = require('path');
const { globMatch } = require('./lib/gate-utils.cjs');

const DOMAIN_RULES = [
  { pattern: 'docs/**',           decision: 'allow' },
  { pattern: 'plans/**',          decision: 'allow' },
  { pattern: '.claude/**',        decision: 'allow' },
  { pattern: 'records/observations/**', decision: 'block', reason: 'Observation files affect bash gate decisions. Explicit approval required.' },
  { pattern: 'records/evidence/**',     decision: 'block', reason: 'Evidence files affect validation. Explicit approval required.' },
  { pattern: 'records/**',        decision: 'allow' },
  { pattern: 'evidence/**',       decision: 'allow' },
  { pattern: '**/node_modules/**', decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: '**/dist/**',        decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: '**/build/**',       decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: 'product/**',        decision: 'allow' },
  { pattern: 'tools/**',          decision: 'allow' },
  { pattern: 'schemas/**',        decision: 'block', reason: 'Schema changes require validation. Run pnpm validate:records first, then approve.' },
  { pattern: '*',                 decision: 'allow' },
  { pattern: '**',                decision: 'block', reason: 'Unknown path. Only write to known domains.' },
];

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }

  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath || typeof filePath !== 'string') {
    process.exit(0);
  }

  for (const rule of DOMAIN_RULES) {
    if (globMatch(rule.pattern, filePath)) {
      if (rule.decision === 'allow') {
        process.exit(0);
      } else {
        const output = {
          decision: 'block',
          reason: rule.reason || `Write to "${filePath}" is forbidden by domain rule "${rule.pattern}".`,
          file_path: filePath,
          matched_rule: rule.pattern,
        };
        console.log(JSON.stringify(output));
        process.exit(2);
      }
    }
  }

  // Should never reach here — '**' catch-all guarantees a match
  process.exit(0);
}

main();
```

### Why `globMatch` is Kept but `matchesAnyGlob` is Deleted

The old `matchesAnyGlob` took an array of glob strings and returned true if ANY matched. The new code loops over `DOMAIN_RULES` (an array of objects) and calls `globMatch` directly on each rule's pattern. `matchesAnyGlob` is no longer used — delete it from `gate-utils.cjs`.

### Cleanup of gate-utils.cjs

After the write gate is rewritten, remove these exports from `gate-utils.cjs` if confirmed unreferenced:
- `readCoordinationConfig` — unreferenced by remaining hooks
- `readActiveProfile` — unreferenced by remaining hooks  
- `getProfile` — unreferenced by remaining hooks
- `matchesAnyGlob` — unreferenced by new write gate

Keep these exports:
- `globMatch` — used by new write gate
- `readObservations` — used by bash gate and inbound gate
- `readLastOperatorMessage` — used by bash gate and inbound gate
- `checkObservationStaleness` — used by bash gate and inbound gate
- `matchConstraintPattern` — used by bash gate

## Related Code Files

- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs`
- Modify: `.claude/coordination/__tests__/write-coordination-gate.test.cjs`

## Implementation Steps

1. **Read current `write-coordination-gate.cjs` and `gate-utils.cjs`.**
2. **Rewrite `write-coordination-gate.cjs`** using the code above.
3. **Update `gate-utils.cjs`:**
   - Remove `readCoordinationConfig`, `readActiveProfile`, `getProfile`, `matchesAnyGlob` exports.
   - Keep `globMatch` (used by write gate).
4. **Rewrite `write-coordination-gate.test.cjs`:**
   - Test: Edit `docs/journals/foo.md` → allow (exit 0)
   - Test: Edit `plans/260520/foo.md` → allow (exit 0)
   - Test: Edit `.claude/settings.json` → allow (exit 0)
   - Test: Edit `records/observations/foo.yaml` → block (exit 2)
   - Test: Edit `records/evidence/foo.md` → block (exit 2)
   - Test: Edit `records/claims/foo.yaml` → allow (exit 0) — general records path
   - Test: Edit `product/api/main.py` → allow (exit 0)
   - Test: Edit `product/web/node_modules/foo/bar.js` → block (exit 2)
   - Test: Edit `schemas/observation.schema.json` → block (exit 2)
   - Test: Edit `README.md` → allow (exit 0)
   - Test: Edit `unknown/path/file.txt` → block (exit 2)
   - Test: Non-Edit/Write tool → exit 0
   - Test: Performance < 50ms
5. **Run the test suite:**
   - `node .claude/coordination/__tests__/write-coordination-gate.test.cjs`

## Success Criteria

- [ ] `write-coordination-gate.cjs` uses `DOMAIN_RULES` with no profile references.
- [ ] `records/observations/**` and `records/evidence/**` are blocked.
- [ ] `**/node_modules/**`, `**/dist/**`, `**/build/**` are blocked.
- [ ] `.claude/**` and root files (`*`) are allowed.
- [ ] All 13 test cases pass.
- [ ] Execution time remains under 50ms.
- [ ] `gate-utils.cjs` has no `readCoordinationConfig`, `readActiveProfile`, `getProfile`, or `matchesAnyGlob` exports.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Domain rules too permissive for observations | Very low | High | Explicitly blocked. Test verifies. |
| `globMatch` behavior differs from `matchesAnyGlob` for edge cases | Low | Medium | Both use the same regex conversion. Loop over rules is logically equivalent. |

## Next Steps

- Phase 4 consolidates bash gate and MCP server, cleans up remaining profile remnants.
