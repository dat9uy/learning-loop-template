---
title: "Internal skill hash+maturity self-heal"
description: "normalizeManifest re-derives internal hash+maturity from canonicalSource; closes meta-260725T2311Z process gap (68101d1 incident)"
status: completed
priority: P1
effort: "3h"
branch: plan/internal-skill-hash-maturity-self-heal
tags: [skills, manifest, self-heal, tdd]
created: 2026-07-28
---

# Internal skill hash+maturity self-heal

## Overview

`normalizeManifest` (`tools/scripts/skills-lib.mjs:229-233`) byte-copies internal
skill entries verbatim, so the documented authoring path
(`edit canonical → pnpm skills:sync`) leaves `manifest.hash` and
`manifest.maturity` stale and trips the backstop drift tests
(`skills-manifest.test.js:90,105`). Replace the verbatim branch with a
re-derive-from-`canonicalSource` branch (one rule, two source-resolvers:
internal → deterministic canonical file; external → mtime detection heuristic),
enumerate restored internals in both CLI log lines, and close the finding with
a change-log entry.

Source design: `plans/reports/problem-solving-260728-0422-internal-skill-hash-maturity-self-heal.md`
(accepted; scope confirmed — hash **and** maturity folded in; tests-first).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Internal `hash`+`maturity` self-heal in `normalizeManifest` (both CLIs benefit) | P1 |
| 2 | `restoredInternals` enumerated in `sync-skills` + `normalize-skills` log lines | P2 |
| 3 | Shared `matchMaturityFrontmatter` export; backstop test consumes it (one regex) | P2 |
| 4 | Meta-state closure: patch finding scope, log change, resolve finding | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [TDD: failing tests](./phase-01-tdd-tests.md) | Completed |
| 2 | [Implement re-derive + CLI logs](./phase-02-implement-re-derive-cli-logs.md) | Completed |
| 3 | [Meta-state closure](./phase-03-meta-state-closure.md) | Completed |

## Success Criteria

- [x] Mutate canonical `SKILL.md` (content + maturity) → `pnpm skills:sync` →
      `skills-lock.json` `hash`/`maturity` equal `sha256(canonicalSource)` /
      canonical frontmatter, no manual re-derive (CLI end-to-end test)
- [x] Drifted-canonical unit test: `changed=true`, `restoredInternals=[name]`,
      re-derived fields match canonical
- [x] Rescoped internal-entries test proves idempotence, not preservation
- [x] Existing idempotence (`:163`) and backstop (`skills-manifest.test.js:90,105`)
      tests stay green
- [x] `restoredInternals` in both CLI log lines
- [x] Change-log entry recorded; finding patched (maturity in scope) and resolved
      with `source_refs` citing the change-log id

## Contract Change (accepted)

`normalize-skills.test.js:230` "internal entries preserved byte-identical" encodes
the gap as a contract. Intentionally rescoped to "re-derived from canonical;
unchanged when canonical matches manifest". No other test asserts internal
preservation (mirror-parity and fan-out byte-identity tests unaffected).

<!-- slug: internal-skill-hash-maturity-self-heal -->
