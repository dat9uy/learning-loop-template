# Phase 5 Report — Contract drift and cross-surface validation

- Phase: phase-05-contract-drift-and-cross-surface-validation
- Plan: `plans/260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification/plan.md`
- Status: DONE
- Date: 2026-08-09

## Summary

Pinned the canonical L2 Vitest test-output contract and proved no drift across the executable artifacts (package scripts, JSON reporter config, parser scripts, effective promoted rule) and the runtime projections (Claude hooks, Factory adapter, `loop_get_instruction`). The canonical `pnpm-test-discipline` prose in `core/hint-registry.js` drives every agent-facing surface. The drift test resolves the effective `rule-no-raw-stdout-vitest` through `loadPromotedRules()`'s canonical max-version projection — it DETECTS the v0/v1/v2 disagreement in raw history and resolves to v2 (`tail|head|grep`) without suppressing the versioned rows. Mastracode stays pull-only by explicit matrix test. Full project suite: 3338 passed / 4 skipped / 0 failed.

## Files modified

| File | Action | Change |
|---|---|---|
| `tools/learning-loop-mastra/__tests__/test-output-contract-drift.test.cjs` | Created | 16 drift + projection-parity tests (see (a)). |
| `docs/loop-engine.md` | Modified | 2 stale unconditional-recurrence statements corrected to "only evaluator-proven unexpected-match events file recurrence findings; ordinary fires are telemetry." |

No change needed (verified not stale): `core/hint-registry.js` prose already encodes every contract token the drift test checks (KISS — no redundant structured fields added); `hint-registry.test.cjs` and `rule-derived-process-hints.test.cjs` already lock canonical shape/order/contract and projection consistency; `package.json`, `vitest.config.mjs`, `tools/scripts/vitest-failures.sh`, `tools/scripts/test-one.sh` all match the contract (drift test proves it, no edit needed); `docs/runtime-contract.md` has no stale recurrence or contract-owner wording.

## (a) Drift-test assertions + effective-rule resolution result

The new `test-output-contract-drift.test.cjs` (16 tests) asserts all of these agree:

1. **Registry prose**: `pnpm-test-discipline` text names `.test-logs/vitest-results.json`, `pnpm test:iter`, `pnpm test:one`, `vitest run --bail=1`, `tools/scripts/vitest-failures.sh`, and the exit-code semantics "exit 0 green / 1 failed / 2 missing-or-invalid"; calls "JSON is the source of truth".
2. **package.json**: `test:iter` runs `vitest run --bail=1` + suppresses raw stdout (`1>/dev/null`) + calls `vitest-failures.sh`; `test:one` calls `tools/scripts/test-one.sh`.
3. **vitest.config.mjs**: declares a `json` reporter writing `.test-logs/vitest-results.json`.
4. **vitest-failures.sh**: parses `numFailedTests` from the JSON artifact, default path `$1` = `.test-logs/vitest-results.json`, exits 0/1/2 per contract.
5. **test-one.sh**: runs `vitest run --bail=1`, suppresses stdout, delegates to `vitest-failures.sh`.
6. **Effective rule**: `findProjectRoot()` resolves the real repo root; `loadPromotedRules(root)` resolves exactly one `rule-no-raw-stdout-vitest` row whose pattern includes ALL of `tail|head|grep`.
7. **v0/v1/v2 disagreement detection (not suppression)**: reads the raw `meta-state.jsonl` and asserts ≥3 active rows exist, incl. a narrower historical v0 row (`tail|grep`) AND a wide row — then asserts `loadPromotedRules()` resolves to the max raw version (2) with the wide pattern. This is the plan's required behavior: report the disagreement, resolve through canonical max-version, never treat same-kind version history as a delete task.
8. **Negative assertion**: none of the three runtime adapters (`.claude` universal `session-start-inject-{discoverability,process-hints}.cjs`, `.factory/hooks/loop-surface-inject.cjs`) contains a SECOND full Vitest policy paragraph (no `pnpm test:iter`, `vitest run --bail=1`, `vitest-failures.sh`, `vitest-results.json`, or the slug). They must project from the registry. Additionally each adapter IS asserted to import the core `loop-introspect` builders.
9. **Mastracode pull-only**: `hooks-lock.json` marks `.mastracode` wiring `kind:"none"` for both SessionStart inject hooks; `.mastracode/hooks.json` SessionStart list contains no `session-start-inject` command; `.mastracode/hooks/` directory does not exist.

**Effective-rule resolution result: v0/v1/v2 disagreement DETECTED and resolved.** Raw history: v0 `(tail|grep)` (line 12) + v1/v2 `(tail|head|grep)` (lines 99/292), all active. `loadPromotedRules()` resolves the max-version row v2 (`tail|head|grep`). No projection or script names the narrower `tail|grep` set, so nothing needed correction.

**Self-defeating check verified twice**: a temporary test asserting `exit 9` in `vitest-failures.sh` failed (exit 1), proving the drift suite catches a wrong exit-code expectation. Temp file deleted.

## (b) Projection parity for `pnpm-test-discipline` across Claude / Factory / loop_get_instruction

Verified in-test + by an end-to-end Node probe:

- `loop-introspect.buildProcessHints({rulesById})` surfaces the canonical text unchanged; `buildProcessPointers` projects `${slug} — ${suggestion}`.
- `loop_get_instruction({key:"pnpm-test-discipline"})` returns `hint === registry.text` and `suggestion === registry.suggestion` (byte-identical).
- Claude sidecar payload (`buildContextPayload`) carries the slug + suggestion in `hint_index` and never embeds the full on-demand text.
- Factory `formatBlock` advertises `${slug} — ${suggestion}` in `hint_index` and pushes no full text (pull-only for on-demand rows).
- All derive from the same registry — no manual runtime prose mirror exists (the negative assertion in (a) proves no adapter re-types the policy).

## (c) Mastracode pull-only assertion result

PASS. `hooks-lock.json` `.mastracode` wiring is `kind:"none"` for both `session-start-inject-discoverability` and `session-start-inject-process-hints`. `.mastracode/hooks.json` has no `session-start-inject` hook. `.mastracode/hooks/` does not exist. No hook was created; `hooks-lock.json` was NOT modified. The assertion is derived from the canonical `SURFACES` set (`core/surfaces.js`) so the matrix stays parameterized for future runtimes.

## (d) Docs changes

`docs/loop-engine.md` — 2 edits, both stale unconditional-recurrence statements corrected:
- § Status of the cycle (line ~42): "when a rule recurs ... a finding is recorded automatically" → "a gate event files a recurrence finding only when the evaluator proves an `unexpected-match` (parser-proven inert data); ordinary rule fires are deterministic gate telemetry, not findings."
- § Open design questions #1 (line ~154): same correction applied to the gate-decision-half description.

`docs/runtime-contract.md` — no change (no stale recurrence or contract-owner wording; it already frames discoverability hints as the runtime surfacing the loop's hints, no owner claim).

`docs/architecture.md` — not in Phase-5 ownership; verified it already states `core/hint-registry.js` is the source of truth and `.mastracode` is pull-only by decision, so no change needed.

## (e) Runtime-agnostic audit result

Ran the live `check_runtime_agnostic` MCP tool handler against the new/changed feature surface:

- `core/command-classification.js` → 6/6 passed
- `core/recurrence-tracker.js` → 6/6 passed
- `core/gate-logic.js` → 6/6 passed
- `__tests__/test-output-contract-drift.test.cjs` → 5/6; the one failure is `core-in-universal-location`, a known false-positive shared by every test file (the pre-existing `legacy-mcp/runtime-agnostic.test.js` itself fails 4/6, incl. that item). The `parameterized-for-new-surfaces` item PASSES because the drift test derives `.mastracode`/`.factory`/`.claude` dirs from the canonical `SURFACES` set rather than hardcoding.

Regression gate `legacy-mcp/runtime-agnostic.test.js` (22 tests) passes green. Shim-not-fork + cross-surface-iteration invariants confirmed.

## (f) Full-suite count

- Seed step: `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` → exit 0.
- Full project `npx vitest run` → **3338 passed | 4 skipped | 0 failed** (323 passed | 1 skipped files). No vitest stdout piped to tail/grep/head; output captured to `/tmp/phase5-full.log`.
- Focused Phase-5 suites: drift 16 + hint-registry 21 + rule-derived-process-hints 15 + runtime-agnostic 22 = **74 passed / 0 failed**.
- The known `sync-skills` EACCES stderr line is environmental (pre-existing), not a test failure.

## Acceptance criteria check

- [x] One canonical `pnpm-test-discipline` contract drives agent-facing projections (drift test proves it, (a)+(b)).
- [x] Drift test catches script/config/rule/hint disagreement (negative-control verified, (a)).
- [x] No runtime-specific hint copy introduced (negative assertion, (a)#8).
- [x] Mastracode remains pull-only by explicit matrix test ((c)).
- [x] End-to-end recurrence behavior satisfies the plan Success criteria (all 8): real `vitest|pnpm test` pipes to tail/grep/head still escalate (evaluate-bash-gate 53+ green); sanctioned JSON workflow pinned (drift test); ordinary fires telemetry-only + unexpected-match-only filing + unknown telemetry-only (gate-recurrence 68 green); executor bodies/redirects/process-substitution visible (command-classification + evaluator green); distinct semantic classes remain distinct; heredoc/tracker-key tests green.
- [x] Full project test suite green (3338 passed / 4 skipped / 0 failed).

## Constraints honored

- `core/hint-registry.js` NOT modified (prose already encodes the full contract; KISS). No structured fields added.
- Gate depends only on classifier/evaluator — no coupling to introspection/hook code introduced.
- `meta-state.jsonl` NOT edited — v0/v1/v2 rows are legitimate versioned history; the drift test resolves through canonical max-version and REPORTS the disagreement.
- Mastracode stays pull-only — no hook created, `hooks-lock.json` untouched.
- No commit; plan files untouched; reports written under `plans/reports/`.
- No vitest stdout piped to tail/grep/head in any run command.

## Notes / open items

- The audit flag `core-in-universal-location` on the drift test file is the known test-file false-positive (all test files fail it; even the repo's own runtime-agnostic regression test does). Not a feature-surface concern.
- No `meta_state_report` was needed for this phase (no operator decision recorded; the runtime-agnostic audit is a release gate verified via the checklist regression test + live tool handler).

Status: DONE
Summary: Phase 5 pinned the canonical `pnpm-test-discipline` contract and proved zero drift across executable artifacts, effective rule data (v0/v1/v2 resolved via canonical max-version to `tail|head|grep`), and all runtime projections; Mastracode verified pull-only; full suite 3338 passed / 4 skipped / 0 failed.
Concerns/Blockers: none.
