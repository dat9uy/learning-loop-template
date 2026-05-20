---
phase: 1
title: "Update Gate Utils"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Update Gate Utils

## Overview

Add a `pathMatchesObservation()` helper to `gate-utils.cjs` that determines whether a target file path matches a `write-path` observation's constraint slug. Both the write gate (Phase 2) and bash gate (Phase 3) will call this helper.

## Requirements

- Functional: Map observation `constraint` slugs to glob patterns for path matching.
- Functional: Support exact-directory and wildcard-directory slugs.
- Non-functional: Helper stays under 20 lines, pure function, no side effects.

## Architecture

### Constraint Slug → Path Mapping

| Constraint slug | Unblocks |
|---|---|
| `records-evidence` | `records/evidence/**` |

Only `records/evidence/**` is blocked by the write gate's `DOMAIN_RULES`. Other `records/**` paths are already allowed. The helper receives `(observation, filePath)` and returns `true` when:
1. `observation.constraint_type === 'write-path'`
2. `observation.status === 'active'`
3. `observation.constraint` maps to a glob that matches `filePath`
4. `filePath` does NOT match `records/observations/**` (helper enforces this invariant)

### Implementation

```javascript
const WRITE_PATH_PATTERNS = {
  'records-evidence': 'records/evidence/**',
};

function pathMatchesObservation(observation, filePath) {
  if (observation.constraint_type !== 'write-path') return false;
  if (observation.status !== 'active') return false;
  if (globMatch('records/observations/**', filePath)) return false;
  const pattern = WRITE_PATH_PATTERNS[observation.constraint];
  if (!pattern) return false;
  return globMatch(pattern, filePath);
}
```

The helper explicitly returns `false` for `records/observations/**` regardless of observation constraint. This is defense-in-depth: callers should also block `observations/**` early, but the helper is safe by default.

## Related Code Files

- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs`

## Implementation Steps

1. Read current `gate-utils.cjs` to confirm `globMatch` signature.
2. Add `WRITE_PATH_PATTERNS` constant after `MARKER_TTL_MS`.
3. Add `pathMatchesObservation` function after `checkObservationStaleness`.
4. Export `pathMatchesObservation` in `module.exports`.
5. Update `schemas/observation.schema.json` to add optional `constraint_type` and `constraint` string properties.
6. Run `node .claude/coordination/__tests__/gate-utils.test.cjs` to ensure no regressions.

## Success Criteria

- [ ] `pathMatchesObservation` exported from `gate-utils.cjs`.
- [ ] `pathMatchesObservation({ constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' }, 'records/evidence/foo.md')` returns `true`.
- [ ] `pathMatchesObservation({ constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' }, 'records/evidence/foo.md')` returns `true`.
- [ ] `pathMatchesObservation({ constraint_type: 'write-path', status: 'active' }, 'records/evidence/foo.md')` returns `false` (missing constraint).
- [ ] `pathMatchesObservation({ constraint_type: 'docker', constraint: 'records-evidence', status: 'active' }, 'records/evidence/foo.md')` returns `false` (wrong constraint_type).
- [ ] `pathMatchesObservation({ constraint_type: 'write-path', constraint: 'records-evidence', status: 'archived' }, 'records/evidence/foo.md')` returns `false` (inactive).
- [ ] `pathMatchesObservation({ constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' }, 'records/observations/foo.yaml')` returns `false` (helper blocks observations/**).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `globMatch` regex edge case | Low | Low | `globMatch` already used in write gate; behavior verified. Helper explicitly excludes `records/observations/**`. |

## Next Steps

- Phase 2: Update Write Gate (uses `pathMatchesObservation`).
- Phase 3: Update Bash Gate (uses `pathMatchesObservation`).
