# Dead-Code Triage Tasks

> **Source plan:** `plans/260627-2042-phase-e-dead-code-sweep/plan.md`
> **Audit source:** `reports/researcher-260627-codebase-audit.md`
> **Fallow output:** `reports/fallow/unused-files.txt`, `unused-exports.txt`, `unused-deps.txt`
> **Updated as phases close.** Every row starts ☐ and ends ☑ / ⚠ / ❌.

**Status legend:** ☐ pending · ☑ resolved · ⚠ disputed · ❌ archived (only via Phase 5 step 0 archival policy)

## Triage table

| # | File / Export | Class | Fallow agrees? | Action | Doc updates | Status |
|---|---|---|---|---|---|---|
| 1 | `core/list-probes.js` | TEST-ONLY | (Phase 2 A2) | Delete | `core/placement.yaml:96-98` dropped; `docs/placement.md` `helper` row updated | ☐ |
| 2 | `__tests__/legacy-mcp/list-probes.test.js` | TEST-ONLY | (auto — excluded by `ignorePatterns`) | Delete with #1 | none | ☐ |
| 3 | `core/lib/source-ref-validator.js` | TEST-ONLY | (Phase 2 A1) | Delete | none (not in manifest) | ☐ |
| 4 | `core/lib/source-ref-validator.test.js` | TEST-ONLY | (auto — excluded by `ignorePatterns`) | Delete with #3 | none | ☐ |
| 5 | `core/surfaces.js` SURFACES export | LIVE (verify) | (Phase 2 A2) | Verify transitive use via `readRegistry()` chain in `core/meta-state.js` | none if verified | ☐ |
| 6 | `core/read-registry-cache.js` exports | LIVE (verify) | (Phase 2 A2) | Verify transitive use via `readRegistry()` chain in `core/meta-state.js` | none if verified | ☐ |
| 7 | `tools/manifest.json` | LIVE | (n/a — docs) | Add 1-line comment documenting the `tools/` → `legacy/` rewrite convention (resolves brainstorm open question #6) | n/a | ☐ (Phase 1) |
| 8 | `.fallowrc.json` | NEW | n/a | Write config: `entry`, `dynamicallyLoaded`, `ignorePatterns`, `rules`, `audit.gate` | n/a | ☐ (Phase 1) |
| 9 | `.gitignore` | LIVE | n/a | Add `.fallow/cache/` ignore + `!.fallow/baselines/` exception | n/a | ☐ (Phase 4) |
| 10 | CI workflow (`fallow audit --gate new-only`) | NEW | n/a | Add audit step + SARIF upload; pin fallow@2.102.0; use PR base sha for fork-PR fallback | n/a | ☐ (Phase 4) |
| 11 | `core/README.md` admission rule | LIVE | n/a | Add "Admission rule" section with pointer to `.fallowrc.json` | n/a | ☐ (Phase 5) |
| 12 | Regression baseline (`regression-baseline.json`) | NEW | n/a | Regenerate post-deletion; commit | n/a | ☐ (Phase 4) |
| 13 | Fingerprint baseline (`dead-code-baseline.json`) | NEW | n/a | Regenerate post-deletion; commit | n/a | ☐ (Phase 4) |
| 14 | Health baseline (`health-baseline.json`) | NEW | n/a | Generate; commit | n/a | ☐ (Phase 4) |
| 15 | Dupes baseline (`dupes-baseline.json`) | NEW | n/a | Generate; commit | n/a | ☐ (Phase 4) |
| 16 | FCIS invariant test (`__tests__/phase-e-foundation/fcis-invariant.test.js`) | LIVE | n/a | Run before AND after Phase 3 deletions; both must be green (R-CRIT-2 mitigation) | none | ☐ (Phase 3 step 1.5) |

## Notes

- **Rows 1-4** = the deletion set. 4 files total: 2 source + 2 test.
- **Rows 5-6** = LIVE-with-verification. The static auditor (researcher 2) flagged these as transitive-only. Fallow's `unused-exports` may or may not catch them. Resolution: grep `core/meta-state.js` for `readRegistry` calls and confirm the transitive chain. If fallow disagrees with the static auditor, mark `⚠ disputed` and STOP — do not delete.
- **Row 7** = documentation. Resolves open question #6 from the brainstorm. No code change beyond a 1-line comment.
- **Rows 8-15** = CI guard setup. All non-destructive.
- **Auto-excluded test files** (rows 2, 4): `__tests__/legacy-mcp/` and `**/*.test.*` are in `.fallowrc.json` `ignorePatterns`. Fallow won't flag them — the static auditor catches them instead.

## Phase-by-phase resolution

### Phase 1 closes
- ☑ Row 7 (manifest comment)
- ☑ Row 8 (.fallowrc.json written, fallow `list` validates)
- ☐ Rows 1-6, 9-15 (pending later phases)

### Phase 2 closes
- ☑ Rows 1, 3 (fallow agrees they're unused; reconciled with static audit)
- ☑ Row 5, 6 (fallow `unused-exports` confirms LIVE or ⚠ disputed)
- ☐ Rows 2, 4 (auto-excluded; deletion happens in Phase 3)
- ☐ Rows 9-15 (later phases)

### Phase 3 closes
- ☑ Row 1 (`core/list-probes.js` deleted)
- ☑ Row 2 (matching test deleted)
- ☑ Row 3 (`core/lib/source-ref-validator.js` deleted)
- ☑ Row 4 (matching test deleted)
- ☑ Rows 5, 6 (verified LIVE or ⚠ escalated)
- ☐ Rows 9-15 (later phases)

### Phase 4 closes
- ☑ Row 9 (.gitignore updated)
- ☑ Row 10 (CI workflow updated)
- ☑ Rows 12-15 (4 baseline files committed)

### Phase 5 closes
- ☑ Row 11 (admission rule in `core/README.md`)
- All rows ☑ or ❌ archived

## Disputes log

<!-- Format: ⚠ #N: <description> | resolution: <how resolved> -->

(empty — populate as disputes surface)

## Archive log

<!-- Format: ❌ #N: <file> archived to <path> | reason: <why kept instead of deleted> -->

(empty — populate only if any kept files need archiving)

## Test discovery notes (Phase 0)

Run `cat tools/scripts/run-pnpm-test-namespaced.mjs | head -120` (full file if longer) and record the answers:

- **Does the runner discover `core/lib/*.test.js` (sibling pattern)?** _____________ (expected YES; means deleting `core/lib/source-ref-validator.test.js` removes 24 tests)
- **Does the runner discover `core/__tests__/*.test.js`?** _____________ (expected YES per static audit)
- **Does the runner discover `__tests__/legacy-mcp/*.test.js`?** _____________ (expected YES per namespaced runner convention)

**Captured-before test counts (run once during Phase 0):**

- Total test count (run `pnpm test`, record the final summary line): _____________
- `__tests__/legacy-mcp/list-probes.test.js` test count: _____________ (verified via grep: 3 `it()` blocks)
- `core/lib/source-ref-validator.test.js` test count: _____________ (verified via grep: 24 `test()` calls)

**Expected post-deletion delta: −27 tests (3 + 24)** if both test files are in scope.

These are the baseline for Phase 5 delta computation.