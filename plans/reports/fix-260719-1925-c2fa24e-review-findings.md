# Fix Report — c2fa24e review findings (all implemented)

- **Date:** 2026-07-19 · **Branch:** docs/central-skills-management · **Base review:** `plans/reports/code-review-260719-1735-central-skills-management-c2fa24e.md`
- **Mode:** autonomous · **Result:** all 8 review findings + 2 re-review findings fixed, verified, regression-free.

## Fixes

| Finding | Fix | Evidence |
|---|---|---|
| C1 vacuous F5 test | `sync-skills.mjs` argv[2] root-override seam; partial-fan-out test runs against tmp fixture with leaf-dir chmod, asserts exit 1 + named surface + stale content retained + no tmp debris | test run shows real EACCES failure path |
| C2 live-tree mutation | ALL materializer runs in tests are fixture-scoped via the seam; real-repo tests are read-only | `runSyncSkills(root)` requires explicit root |
| I1 prototype-chain + null crash | `contract.js` `lookupManifestSkill` helper (hasOwnProperty + null/typeof guard) at both lookup sites; +3 tests (constructor dir, null entry no-crash, symlink pin) | TDD red→green: pre-fix `skill-mirror-gap`, post-fix `skill-not-in-manifest` |
| I2 symlink F9 overclaim | comment corrected: symlinks excluded by shape (Dirent boundary), F9 covers real-dir only; behavior pinned by test | contract.test.js ghost-skill test |
| M1 fail-open on malformed manifest | `readManifest` shape guard → exit 2; per-entry null guard → exit 2 naming key | 2 tests, clean messages (no TypeError stack) |
| M2 gate regex whole-registry scan | line-scoped parse of `runtime-state.jsonl`, id-matched rows only | skills-manifest.test.js |
| M3 reason text contradicts design | `skills-canonical` reason reworded (detection-only + preflight); `evaluateSkillsPreflight` reports the firing rule's own glob as `matched_rule` | gate test asserts `matched_rule === "skills-lock.json"` |
| M5 mtime rewrite / fallow warn | opt-in `skipUnchanged` on `writeToAllSurfacesSection` (writeToAllSkills passes it; coordination/TTL callers keep always-rewrite); `writeOneSurface` extraction keeps complexity flat; fallow-ignore re-added with cross-root-consumer justification | `skills:sync` ×2 → `0 wrote, 6 unchanged`; fallow dead-code 0 |
| M4 malformed ledger metadata | corrected ledger-event appended (same id, flat strings, supersedes corrupt row's fingerprint); `meta_state_report` filed on `runtime_state_record` metadata channel | `meta-260719T1858Z-...`; row `sha256:0abcf89...` |
| Re-review #1 (M2 regression I introduced) | first-match-wins → any-row-wins scan over same-id rows (`roundTripRecordedInLines` pure helper); placeholder rows skip, hash rows activate | 5-case unit test incl. append-order cases |
| Re-review #2 null-entry crash in materializer | per-entry object guard (folded into M1 row above) | exit 2, names key, no stack |

Also closed phase-02 spec gaps: sentinel fan-out test (step 2), self-heal test (step 13), gate tests now strict (blocked without marker / allowed with marker / hooks-core narrowness), F15 assertions anchored (exact assignment line) + behavioral (debris check in failing-write fixture).

## Verification (fresh)

- `pnpm test:iter`: **2263 tests / 451 suites all green** (+7 vs pre-fix 2256)
- `contract.js claude-code|droid|mastra-code`: all exit 0
- `pnpm skills:sync` ×2: true no-op (`0 wrote, 6 unchanged`; mtime-stable asserted in test)
- `pnpm fallow:gate`: exit 0, "No issues in 22 changed files"; brief dead-code 0
- `check_runtime_agnostic(sync-skills.mjs)`: 6/6
- file-index re-seeded after deliberate contract.js edit (documented mid-loop flow)
- Delegated re-review (code-reviewer subagent): all 8 original findings verified closed; 2 new findings it raised were fixed in-session and re-tested.

## Files changed

`tools/scripts/sync-skills.mjs`, `core/surfaces.js`, `core/evaluate-write-gate.js`, `interface/contract.js`, 3 test files, `runtime-state.jsonl` (+1 corrected row), `meta-state.jsonl` (+1 finding), plan statuses synced (P1/P2 completed, P3 in-progress with Q4 remainder note).

## Unresolved questions

- Planted-symlink semantics (fail vs exclude-by-shape): currently excluded by shape, documented + pinned. Tightening to `skill-not-in-manifest` would be a behavior change — operator decision, deferred (post-npx no legitimate symlinks remain).
- F11/F12 activation awaits a permitted-sandbox npx round-trip appending `metadata.hashes.{claude,factory,mastracode}` to ledger-event `npx-skills-mastra-roundtrip-2026-07-19`.
