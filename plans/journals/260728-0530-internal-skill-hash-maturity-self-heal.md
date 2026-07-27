---
title: "Internal skill hash+maturity self-heal"
date: 2026-07-28 05:30
branch: plan/internal-skill-hash-maturity-self-heal
plan: plans/260728-0439-internal-skill-hash-maturity-self-heal/plan.md
status: completed
tags: [skills, manifest, self-heal, tdd, meta-state]
---

# Internal skill hash+maturity self-heal

## Context

Editing a canonical internal `SKILL.md` followed by `pnpm skills:sync` left the
manifest hash and maturity stale because `normalizeManifest` copied internal
entries verbatim. Backstop tests caught the drift only later.

## What happened

1. Added unit and CLI authoring-path tests first. Both new tests failed against
   stale hash/maturity behavior; the consistent-canonical test remained green.
2. Updated `normalizeManifest` to re-derive internal hash and maturity from
   `canonicalSource`, fail closed when the canonical file is missing, preserve
   defensive fallbacks, and return `restoredInternals`.
3. Added shared `matchMaturityFrontmatter`; the normalizer and manifest backstop
   now consume one parser.
4. Updated both normalization CLI logs to enumerate re-derived internals.
5. Verified 2,573 tests passed, 4 skipped, 0 failed. `gate:self-verify`, fallow
   gate, syntax checks, and the live `pnpm skills:sync` no-op check passed.
6. Code review found no issues.
7. Recorded semantic change-log
   `meta-260728T0524Z-skills-lock-json-internal-entry-maintenance`, patched the
   original finding to include maturity, attached code/test evidence, and
   resolved it. Grounding reported no drift but skipped fingerprint comparison
   because the historical finding had no per-record fingerprint.

## Reflection

The old preservation test encoded the process gap as a contract. Rescoping it
was intentional: byte identity now demonstrates idempotence only when canonical
content already matches the manifest. The implementation stays small because
hash and maturity are projections of one authoritative source.

## Decisions

- Internal entries derive from deterministic `canonicalSource`; policy-known
  external entries keep their existing detected-surface resolver.
- Missing canonical files fail closed; absent `canonicalSource` remains a
  defensive verbatim fallback.
- `restoredInternals` is additive and backward compatible.
- No evergreen docs update: commands, configuration, schemas, and operator steps
  did not change; the existing documented workflow now behaves as promised.

## Next

- Commit and ship only when requested.
- Watch normal authoring use for unexpected CLI-log friction.

## Publishing

AgentWiki publishing skipped: no deterministic AgentWiki CLI or MCP surface was
available. This local journal is the work-history record.
