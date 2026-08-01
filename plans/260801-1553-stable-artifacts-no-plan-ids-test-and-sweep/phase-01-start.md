---
phase: 1
title: "Add regression test + allowlist"
status: complete
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 1: Add regression test + allowlist

## Overview
Add `stable-artifacts-no-plan-ids.test.js` plus an allowlist sidecar seeded with the current 69 source matches. The test passes today and fails on any NEW plan-ID/phase-number match outside the allowlist. This is the state-3 gate that stops the bleed before the sweep begins; Phase 2's refactor is regression-safe under it.

## Requirements
- Functional: scan `tools/learning-loop-mastra/**` for the three plan-ID patterns; assert every current match is in the allowlist; fail with a diff on any new match.
- Non-functional: test runs under `vitest run` (default `pnpm test`); deterministic; no network; fast.

## Architecture
- **Test file:** `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.test.js`.
- **Allowlist sidecar:** `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.allowlist.json` — a sorted array of `"<relPath>\t<trimmedMatchedLine>"` entries (anchored by file + full line content, NOT line number — robust to the line shifts Phase 2 edits cause).
- **Glob/exclusion:** scan `*.js`, `*.cjs`, `*.mjs`, `*.yaml` under `tools/learning-loop-mastra/**`; exclude any path containing `__tests__/`, ending in `.test.js`, or ending in `.md`/`.json`. The sidecar (`.json`) and the test file itself (`.test.js`) are excluded by construction.
- **Patterns:** `/\b(plans?)\/\d{6}-/`, `/Phase \d+ of (plan|plans)/`, `/plan \d{6}-\d{4}/`.
- **Match key:** for each matching line, key = `${relPathFromScanRoot}\t${line.trim()}`. Compare current-match set ⊆ allowlist set. New matches (in current, not in allowlist) → fail with the offending keys. Stale allowlist entries (in allowlist, not in current) → `console.warn` only (non-failing) so the operator prunes them as the sweep progresses.
- **Seed:** generate the sidecar by running the same matcher over current code; commit the 69-entry snapshot. (A one-line seeder script or a test `--update-allowlist` mode is acceptable but YAGNI — a small node one-liner at seed time is enough; do not build a maintainer flag unless Phase 2 proves it needed.)

## Related Code Files
- Create: `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.test.js`
- Create: `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.allowlist.json`
- Reference (do not modify): `tools/learning-loop-mastra/core/placement.yaml`, `core/loop-introspect.js`, `core/evaluate-write-gate.js`, `core/bound-artifacts.js` (these carry the seeded matches).

## Implementation Steps (tests-first)
1. **Write the matcher + test first** (red→green against current code): define the glob, exclusions, three patterns, and the `matchKey` function. Run it; expect 69 current matches.
2. **Generate the allowlist sidecar** from the matcher output (sorted, deduped). Commit as the baseline.
3. **Write the assertion**: `expect(currentMatches).toEqual(expect.arrayContaining(...))` is wrong direction — instead assert `newMatches = currentMatches - allowlist` is empty; on failure print `newMatches` and the file:line for each. Assert allowlist loads and is non-empty (guards against an accidentally-empty sidecar passing vacuously).
4. **Run `pnpm test`** for the new file; confirm green.
5. **Negative test (manual, do not commit):** temporarily add `// Phase 9 of plans/999999-xxxx` to a core file, run the test, confirm it fails with the new match; revert. This proves the gate fires.
6. **Confirm pre-commit wiring:** `pnpm test` is the pre-commit command (`package.json:50-51`), so the test blocks commits on re-introduction with no extra hook.

## Success Criteria
- [ ] Test file + allowlist sidecar exist and `pnpm test` is green.
- [ ] Allowlist contains exactly the 69 current source matches (spot-check: `bound-artifacts.js:5` comment, one `placement.yaml` summary line, one `loop-introspect.js` string-literal line, and one `hooks/universal/*.cjs` comment).
- [ ] Negative check: a newly-added plan-ID comment fails the test.
- [ ] Stale-allowlist entries produce a non-failing `console.warn` (verify by deleting one allowlist entry's match via a temp edit, or by unit-testing the stale-diff path).

## Risk Assessment
- **Allowlist anchored by line content, not line number** — Phase 2 edits nearby lines; line numbers shift. Content anchoring survives shifts. Mitigated by design.
- **Empty-allowlist vacuous pass** — an accidentally-empty sidecar would make `currentMatches - {} ` always fail (good, since currentMatches is non-empty) — but once Phase 3 empties the allowlist, an empty allowlist IS the intended total ban (any current match fails). Distinguish: Phase 1 sidecar is non-empty (69); Phase 3 empties it deliberately. Add a Phase-3 step that flips the assertion to "no matches at all" when the allowlist is intentionally empty, or keep the set-diff semantics (empty allowlist ⇒ any match is "new" ⇒ fail), which already gives the total ban. Prefer the latter (KISS): set-diff semantics naturally become a total ban when the allowlist is empty.
- **Glob misses a new file type** — if a future source file is `.ts`/`.cjs`, the `*.js`/`*.yaml` glob misses it. Acceptable for now (repo is `.js`/`.yaml`); note as a maintenance caveat in the test header.