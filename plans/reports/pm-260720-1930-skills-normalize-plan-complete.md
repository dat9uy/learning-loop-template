# PM Status — plan 260720-1825 (skills manifest self-healing normalize)

| | |
|---|---|
| Plan | `plans/260720-1825-skills-manifest-self-healing-normalize-step-npx-clobber-recovery/` |
| Status | **completed** (3/3 phases) |
| Branch | main (uncommitted) |
| Finding resolved | `meta-260720T1451Z-npx-skills-cli-clobbers-skills-lock-json-…` |
| Change-log | `meta-260720T1909Z-tools-scripts-normalize-skills-mjs` |

## Phase completion

| # | Phase | Status | Evidence |
|---|-------|--------|----------|
| 1 | Probe clobber shape + failing tests | completed | probe report exists; `normalize-skills.test.js` red→green; tmp-root only (live `skills-lock.json` clean) |
| 2 | Implement normalize + self-healing sync | completed | `skills-lib.mjs`/`normalize-skills.mjs`/`sync-skills.mjs` shipped; `package.json` `skills:normalize`; gate ok; `check_runtime_agnostic` 6/6 |
| 3 | Resolve finding + change-log + docs | completed | finding `resolved`; change-log records capability; `docs/skills-management.md` shipped |

## Test evidence (fresh, this session)

| Suite | Result |
|-------|--------|
| `normalize-skills.test.js` | 10/10 (incl. new top-level-passthrough regression test) |
| `sync-skills.test.js` | 19/19 |
| `skills-mirror-parity.test.js` | 9/9 |
| `skills-manifest.test.js` | 15/15 |
| `node --check` (3 scripts) | ok |
| `mastra_gate_check("pnpm skills:sync")` | ok |
| `check_runtime_agnostic(skills-lib.mjs)` | 6/6 pass |

## Checkbox accounting

- plan.md success criteria: 6/6 `[x]`
- phase-01: 4/4 `[x]`
- phase-02: 9/9 `[x]`
- phase-03: 4/5 `[x]` — **1 deferred**: PR-body meta-state delta enumeration (gated on shipping to a PR; per `rule-pr-body-registry-deltas`)

## Sync-back guard

All completed work mapped to phase files. No orphan completed items. Phase-3 PR-body checkbox intentionally left unchecked — it is a ship-time action, not an implementation gap. Do NOT claim "fully complete including ship" until the PR body enumerates: (a) resolved finding `meta-260720T1451Z` + resolution note, (b) new change-log `meta-260720T1909Z` + initial status `active`.

## Review fixes applied this session (post-ship hardening)

Code review of the last 3 commits surfaced 5 items; all addressed:
1. Stale "cluster" comments → mtime-max accuracy (code + test + plan "Implementation outcome" note)
2. F6 trust-anchor shift → documented at code site (not reverted — operator's documented trade-off)
3. mtime brittleness → assumption + fallback documented in `detectExternalHash` JSDoc
4. Top-level field stripping → `normalizeManifest` now passes through unknown top-level keys + regression test
5. External fan-out parity → added `postExternalFanOutParityCheck` (closes internal/external asymmetry)

## Unresolved questions

- None blocking. Open: does the operator want item #2's stronger cluster-gated tamper-rejection restored as a separate change? (Currently the documented position is "trust the freshly-installed surface.")
- Open: when shipping to a PR, populate the PR-body delta enumeration (phase-03 last checkbox).