# Phase E Mechanism A+B Shipped

**Date:** 2026-06-27
**Branch:** `260627-1304-phase-e-mechanism-a-b-plan`
**Commits:** `1ea9bb3` (Mechanism A), `a4cf422` (Mechanism B)

## What shipped

**Mechanism A — Placement Manifest**
- `docs/placement.md`: 5-question decision tree + 7-role closed taxonomy (56 lines)
- `core/placement.yaml`: 29 production files enumerated with `path`/`role`/`summary`
- `placement-manifest.test.js`: 6 sub-tests (enumeration, role validation, path sanitization, layering, taxonomy agreement, temp-file add)
- `core/README.md`: cross-link to placement.md + soft-inversion contract section

**Mechanism B — Entry Domain Model**
- 4 factories: `core/entry/{finding,rule,change-log,loop-design}.js` wrapping canonical Zod schemas
- `core/entry/deep-freeze.js`: shared recursive freeze helper (DRY)
- `core/entry/index.js`: `factoryFor` dispatcher + `validateCrossRefs`/`findOrphans`/`outboundRefsAll` graph API
- `meta-state-relationships-tool.js`: reimplemented on factories with dual-field `promoted_to_rule` migration preserved
- `core/gate-logic.js`: exported `projectHasLearningLoopMcp` for factory use
- `run-pnpm-test-namespaced.mjs`: added `mcp-entry` glob for `core/entry/*.test.js`

## Corrections during implementation

| Item | Plan said | Actual |
|---|---|---|
| Production file count | 27 | 23 (then 29 after entry files added) |
| `gate-logic.js` role | primitive | facade (imports from meta-state + check-grounding) |
| `record-validation-rules.js` role | validator | helper (imports readRegistry from facade) |
| `deepFreeze` location | inline in each factory | shared `deep-freeze.js` (code review H1) |
| `createRule.inboundRefs()` | scan registry only | dual-field migration: always report `rule.origin` (code review C1) |

## Test results

- **Baseline:** 1282 pass
- **After:** 1335 pass (+53 new)
- **FCIS invariant:** holds (zero `@mastra/*` in `core/`)
- **Pre-existing failures fixed:** cold-session freshness sentinel refreshed, 2 grounding fingerprints refreshed

## Code review findings addressed

- **C1 (blocker):** Fixed `createRule.inboundRefs()` to always report `rule.origin` as `promoted_from`, even when the finding no longer exists in the registry
- **H1:** Extracted `deepFreeze` into shared `core/entry/deep-freeze.js`
- **M2:** Added snapshot test for dual-field inbound path (rule with legacy finding)

## Out of scope (future)

- Phase 3 evaluator refactor (separate plan)
- `buildInverseIndexes` parity test for `loop-introspect.js`
- `validateCrossRefs` O(N²) optimization (not needed at current scale)
