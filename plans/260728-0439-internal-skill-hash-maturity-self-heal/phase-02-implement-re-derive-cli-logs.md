---
phase: 2
title: "Implement re-derive + CLI logs"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Implement re-derive + CLI logs

## Overview

Replace the verbatim internal branch in `normalizeManifest` with a
re-derive-from-`canonicalSource` branch, export a shared
`matchMaturityFrontmatter` helper, and enumerate `restoredInternals` in both
CLI log lines. Phase 1 tests go green.

## Requirements

- Functional: internal `hash`+`maturity` self-heal; fail-closed on missing
  canonical; idempotent on consistent manifests; `restoredInternals` returned
  and logged by both CLIs
- Non-functional: `normalizeManifest` stays pure (parsed + repoRoot → result);
  one maturity regex, two consumers (normalizer + backstop test)

## Architecture

One rule, two source-resolvers: fields that are projections of canonical
content (`hash`, `maturity`) are re-derived from the entry's authoritative
source on every normalize — internal → `canonicalSource` (deterministic,
git-tracked), external → detected surface (mtime heuristic). The verbatim-copy
special case is deleted. Unknown externals (not in `EXTERNAL_POLICY`) remain
verbatim (surgical replace preserved).

Edge cases (locked by tests where applicable):

| Case | Behavior |
|---|---|
| canonical missing | fail-closed: return `error`, `changed:false` (matches external posture) |
| internal w/o `canonicalSource` | verbatim (defensive; schema requires it) |
| maturity frontmatter absent in canonical | keep stored `entry.maturity` |
| unknown external | verbatim, unchanged |
| re-run on consistent manifest | `entryEqual` → `changed:false`, no write/mtime bump |

## Related Code Files

- Modify: `tools/scripts/skills-lib.mjs` (new export + branch replacement, L229-235)
- Modify: `tools/scripts/sync-skills.mjs` (extend normalized log line, ~L285-287)
- Modify: `tools/scripts/normalize-skills.mjs` (extend normalized log line, ~L106-108)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-manifest.test.js`
  (`readFrontmatterMaturity` consumes the shared export, L37-42)

## Implementation Steps

1. Add to `skills-lib.mjs`:
   ```js
   export function matchMaturityFrontmatter(content) {
     const m = content.match(/^maturity:\s*(state-1|state-2|state-3)\s*$/m);
     return m ? m[1] : null;
   }
   ```
2. Replace the verbatim loop (`skills-lib.mjs:229-233`) with the re-derive
   branch per the accepted design (report §3): skip policy-externals already
   handled; `external === true` or missing `canonicalSource` → verbatim;
   missing canonical file → return `error`; otherwise re-derive
   `hash = sha256(canon)` and `maturity = matchMaturityFrontmatter(canon) ?? entry.maturity`;
   accumulate `restoredInternals` and set `changed` via `entryEqual`.
   Return `{ manifest: next, changed, restoredExternals, restoredInternals }`.
   Update the docblock (internals are re-derived, not byte-copied).
3. Extend the `sync-skills.mjs` normalized log line (~L285) to also print
   `re-derived N internal: names` from `norm.restoredInternals ?? []`.
4. Extend the `normalize-skills.mjs` normalized log line (~L106) the same way
   from `result.restoredInternals ?? []`.
5. Refactor `skills-manifest.test.js` `readFrontmatterMaturity` to import and
   call `matchMaturityFrontmatter` (one regex, two consumers).
6. Run the Phase 1 test files — all green. Then run the full legacy-mcp skills
   suite (`normalize-skills`, `sync-skills`, `skills-manifest`,
   `skills-mirror-parity`) to confirm no regressions.

## Success Criteria

- [ ] All Phase 1 tests pass
- [ ] Idempotence test (`normalize-skills.test.js:163`) green — consistent
      fixture → `changed:false`, no mtime bump
- [ ] Backstop tests (`skills-manifest.test.js:90,105`) green
- [ ] `skills-mirror-parity.test.js` green (cross-surface parity unaffected)
- [ ] Live check: `pnpm skills:sync` on the real repo is a no-op (manifest
      already consistent)

## Risk Assessment

- Risk: fail-closed on missing canonical could break `normalize-skills` in a
  partial-checkout context. Mitigation: matches existing external posture;
  schema requires `canonicalSource` on internals; defensive verbatim fallback
  when the field itself is absent.
- Risk: consumers of `normalizeManifest` destructure only known fields —
  additive `restoredInternals` return key is backward compatible.
