---
title: "Test runner summary: TAP wrapper + pnpm test:summary for agent context cost"
description: "CANCELLED — superseded by the vitest migration (Path B). The TAP-wrapper approach reinvented vitest's native --reporter=json output and a red-team review proved the hand-rolled TAP parser fundamentally broken against Node v24's real emitter. vitest gives the same structured-failure output for free. See plans/260713-1625-vitest-migration-replace-node-test-c8."
status: cancelled
priority: P2
branch: "main"
tags: ["cancelled", "superseded"]
blockedBy: []
blocks: []
supersededBy: "260713-1625-vitest-migration-replace-node-test-c8"
created: "2026-07-13T08:10:27.881Z"
createdBy: "ck:plan"
source: skill
---

# Test runner summary: TAP wrapper + pnpm test:summary for agent context cost

> **⚠ CANCELLED — superseded by Path B (vitest migration).**
> This plan is **not being implemented**. It is retained as a historical record of the abandoned approach.
> Replacement: [`plans/260713-1625-vitest-migration-replace-node-test-c8/`](../260713-1625-vitest-migration-replace-node-test-c8/plan.md)
>
> **Why cancelled:** A red-team review proved the hand-rolled TAP parser fundamentally broken against Node v24's real TAP emitter (YAML-wrapped `ok`, 6-space nested indent, `error: |-` block scalars), and the operator assessment was that the wrapper both reinvented the wheel (vitest's `--reporter=json` emits the same structured-failure document natively) and added permanent technical debt (a bespoke parser coupled to an undocumented Node output format). Path B subsumes this plan's goal (the agent-context bleed fix) and additionally retires the `.fallowrc` test-ignore workaround and deletes the hand-rolled namespaced runner. The `loop-design-vitest-migration-replace-node-test-and-c8` registry entry now points to Path B as its implementing plan.

## Overview

Add a structured-failures-only runner (`pnpm test:summary`) alongside the existing per-namespace `pnpm test` so the agent can debug without re-reading the passing-test backlog on every iteration.

**Closes:** `meta-260712T0730Z-test-runner-pollutes-agent-context` (loop finding, status=open, addresses=["..."] in `loop-design-vitest-migration-replace-node-test-and-c8`).

**Predecessor to:** `loop-design-vitest-migration-replace-node-test-and-c8` (parked; the vitest path is a longer-horizon replacement for both `node:test` and `c8` — Path A is the minimum viable agent-context fix that ships immediately).

**Three file touches (primary):**

1. **NEW** `tools/scripts/test-globs.mjs` — single source of truth for the `GLOBS` array currently duplicated in `run-pnpm-test-namespaced.mjs` (extracted so both runners import the same list).
2. **NEW** `tools/scripts/run-pnpm-test-summary.mjs` — TAP-streaming runner that emits NDJSON summary lines + mirrors per-namespace `.summary.json` to `.test-logs/`. ~120 LoC.
3. **MODIFY** `tools/scripts/run-pnpm-test-namespaced.mjs` — replace inline `GLOBS` with `import { GLOBS } from "./test-globs.mjs"`. Net: −13 lines, +1 import.

**Supporting touches (smaller than primary):**

- `package.json` — add `"test:summary": "node tools/scripts/run-pnpm-test-summary.mjs"`.
- `tools/scripts/__tests__/test-globs.test.js` (or similar) — unit tests for the TAP→summary transform.
- `AGENTS.md` or `core/loop-introspect.js` — append a `pnpm-test-summary` hint so the agent knows to prefer it on debug iterations.
- `docs/project-changelog.md` — single sentence documenting the new script.

## Problem Statement

The agent debug loop re-runs `pnpm test` and absorbs the entire streamed spec output (2621 lines across 15 namespaces in `.test-logs/`, ~1115 individual `✔` / `✖` test-event lines) into context. Each debug iteration re-floods the context with previously-seen passing tests. The cost is not the first run — it's every subsequent iteration where the agent has to `grep '✖'` through passing-test noise.

`node --test` does not have a built-in `--reporter=json` in Node 24 (it errors with `ERR_MODULE_NOT_FOUND: Cannot find package 'json'`). `--reporter=tap` is built-in, structured. Node v24's actual TAP emitter format (verified 2026-07-13 with committed fixtures) differs from the simpler pre-Node-24 form: every `ok` line is wrapped in a YAML diagnostic block, multi-line errors use `error: |-` block scalars, and nested subtests use 6-space indentation. The parser handles all three.

## Output Contract

`pnpm test:summary` emits NDJSON to stdout, **18 lines total** in this order:

1. **Start line:**
   ```json
   {"kind":"start","timestamp":"2026-07-13T…Z"}
   ```
2. **Per-namespace lines** (16 lines, one per glob in `GLOBS` order):
   ```json
   {"kind":"ns","ns":"mcp-tests","ok":false,"total":143,"pass":141,"fail":2,"failures":[{"test":"R6.1 fires when …","file":"…/foo.test.js","error":"AssertionError: …"}],"duration_ms":4512,"parse_failed":false,"exit_code":1,"signal":null,"raw_bytes":12480}
   ```
   - `ok` requires ALL of: `parsed.fail === 0`, `child.exitCode === 0`, `child.signal === null` (Red Team Finding 3).
   - `parse_failed` surfaces malformed TAP without crashing.
   - `exit_code` / `signal` propagate subprocess state for debugging.
3. **Suite footer (1 line):**
   ```json
   {"kind":"suite","ok":false,"total":1115,"pass":1113,"fail":2,"duration_ms":24812}
   ```

Per-namespace summary mirrored atomically (temp-write + rename) to `.test-logs/<ns>.summary.json`. Raw TAP mirrored to `.test-logs/<ns>.tap` as the `parse_failed` fallback surface. The agent can re-read failures between iterations without re-running the suite.

**Non-goals (deliberately out of scope):**

- Modifying `pnpm test` (humans + pre-commit hook stay untouched). Note: `pnpm test` suite-footer count changes from 15 → 16 globs after Phase 1b (test-globs-tests is added) — this is a Phase 1b behavior change, NOT a Phase 3 wire-up change.
- Replacing `c8` coverage pipeline (orthogonal; stays as-is).
- Adding a new entry kind to meta-state (no schema change).
- Migrating to vitest (deferred to the parked loop-design).
- Adding `pnpm test:summary` to the pre-commit hook chain.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundation](./phase-01-foundation.md) | Pending |
| 2 | [TAP-Implementation](./phase-02-tap-implementation.md) | Pending |
| 3 | [Wire-up](./phase-03-wire-up.md) | Pending |

## Dependencies

- **Blocked by:** none.
- **Blocks:** none directly. The parked `loop-design-vitest-migration-replace-node-test-and-c8` (active, severity_hint=low) can be re-evaluated after this plan ships; the wrapper's `kind:"suite"` final-line protocol is structurally similar to vitest's JSON `numFailedTests` field, so agents trained on the wrapper output transfer cleanly to vitest's emitter.
- **Touches registry entry:** `meta-260712T0730Z-test-runner-pollutes-agent-context` will resolve via `meta_state_refresh_file_index({path:"package.json"})` (Step 4a) followed by `meta_state_resolve({id: "...", resolution: "..."})` (Step 4b) in Phase 3 after the new script lands and a smoke run confirms NDJSON shape.

## Acceptance Criteria

- [ ] `tools/scripts/test-globs.mjs` exists (Phase 1a) with 15 GLOBS entries; `run-pnpm-test-namespaced.mjs` imports `GLOBS` from it (no duplicate array).
- [ ] Phase 1b adds the 16th `test-globs-tests` entry as a SEPARATE COMMIT.
- [ ] `node tools/scripts/run-pnpm-test-summary.mjs` runs all 16 globs sequentially, emits 18 NDJSON lines (1 start + 16 ns + 1 suite).
- [ ] `pnpm test:summary` exits 0 on full-pass, exits 1 on any namespace failure (including import/syntax/crash via `child.exitCode` check).
- [ ] On failure, each per-namespace `<ns>.summary.json` contains the failing test names + sanitized first-line error message (no full stack trace; credential-like patterns redacted).
- [ ] `pnpm test` (existing) continues to exit 0; suite-footer count goes 15 → 16 across the Phase 1 commit boundary (15 after Phase 1a, 16 after Phase 1b). Pre-commit hook is unchanged in chain — `pnpm test && pnpm fallow:gate` still gates.
- [ ] TAP parser unit tests cover 7 committed fixtures: pass-with-yaml-block, single-line error (`---` in body), multi-line error (`error: |-`), nested subtests, truncated stream, empty glob, parent-summary-without-leaves. Plus 2 `sanitizeFailureError` tests. Plus 1 fixture-drift-guard test.
- [ ] All 4 PROCESS_HINTS-related files contain the byte-identical new string: `loop-introspect.js#PROCESS_HINTS`, `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS`, `loop-get-instruction-tool.js#HINT_SUGGESTIONS_PROCESS`, `loop-get-instruction-tool.js#HINT_KEY_MAP_PROCESS` (with slug → index). `cold-session-discoverability.test.cjs` parity test passes.
- [ ] `pnpm test:summary` smoke test uses temp-file capture (`> /tmp/summary.ndjson`) — never `| head/tail/wc` (Red Team Finding 10).
- [ ] Cross-invocation lock fires when another test run is active; emits `{kind:"error", message:"another test run is active"}` and exits 1.
- [ ] `.test-logs/` is verified gitignored before any summary write.
- [ ] `meta-260712T0730Z-test-runner-pollutes-agent-context` resolves with `resolution` text referencing all 4 hint-mirror files + the parked vitest successor.

## Risk Summary

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | TAP parser misinterprets Node v24's actual emitter (multi-line `error: |-`, nested-subtest indent, `ok`-with-YAML-block) | Critical | 7 committed real-output fixtures + 2 sanitization tests + 1 drift-guard test in `__tests__/tap-parser.test.js`. Parser fails loud (`parse_failed: true`) on malformed input; agent falls back to `.test-logs/<ns>.tap`. |
| R2 | `GLOBS` drift between runners | Medium | Single source via `test-globs.mjs`. Phase 1 ships as 1a (extraction) + 1b (namespace add) for rollback independence. |
| R3 | Suite duration regression | Low | Sequential, same `node --test` invocation; wrapper adds <100ms TAP transform + ~50ms lock. |
| R4 | Child-process crash/syntax-error/import-error reports as success | High | `ok` requires `parsed.fail === 0 AND child.exitCode === 0 AND child.signal === null`. `parse_failed` separately signals malformed TAP. |
| R5 | PROCESS_HINTS drift across 4 mirror files | Critical | 4-file lockstep edit in Phase 3 Step 2; `cold-session-discoverability.test.cjs` parity test enforces byte-level equality. |
| R6 | `meta_state_resolve` blocked by `rule-no-orphaned-evidence` (package.json SHA change) | High | Phase 3 Step 4a: `meta_state_refresh_file_index({path: "package.json"})` BEFORE Step 4b's `meta_state_resolve`. |
| R7 | Cross-invocation race with concurrent `pnpm test` (pre-commit hook) | Medium | `proper-lockfile` mutex on `.test-locks/pnpm-test-summary.lock`. Namespaced runner doesn't take this lock — small race window remains; documented as known limitation. |
| R8 | `pnpm test:summary` SIGPIPE during smoke-test | Medium | Smoke recipe captures to temp file via `>` redirection; pipe-closing commands (`head`, `tail`, `wc -l`) are forbidden pre-runner-exit. |
| R9 | `.test-logs/<ns>.summary.json` leaks secrets via error field | Medium | Phase 1a verifies `.test-logs/` is gitignored (confirmed at `.gitignore:19`). Phase 2 adds `sanitizeFailureError` pass that strips credential-like patterns and truncates to 240 chars before write. |
| R10 | Phase 1 conflated extraction with namespace addition; no rollback | Medium | Phase 1 ships as TWO commits (1a + 1b). If Phase 2 reveals a bug post-Phase-2, rollback is: revert Phase 2, then independently revert either 1a or 1b. |
| R11 | Existing tests stop finding the `GLOBS` export after extraction | Low | `test-globs.test.js` pins `GLOBS.length` and asserts required namespaces present. |
| R12 | `pnpm test:summary` exit-code-rollup error (mismatched aggregation) | Low | `ok = results.every(r => r.ok)` — strict AND across all namespace results. |

## Out of Scope (Deferred)

- **Vitest migration** — `loop-design-vitest-migration-replace-node-test-and-c8` (parked). Its 3-phase cutover (shadow → dual-run → cutover) is a separate plan when it becomes a priority. Path A ships first because it is the smaller resolution that closes the documented agent-context finding.
- **Coverage thresholding / quality gates** — out of scope; the script reports test outcomes, not coverage. `c8` + `sanitize-coverage.mjs` stays the source of truth.
- **Replacing `.test-logs/<ns>.log` with `.test-logs/<ns>.summary.json`** — both files coexist. The spec log retains full diagnostic context; the summary is the agent-optimized small surface. The summary runner additionally writes `.test-logs/<ns>.tap` as the raw-TAP mirror.

## Implementation Strategy

1. **Phase 1a** is the cheapest correctness gain: pure extraction of the GLOBS constant to `tools/scripts/test-globs.mjs` so both runners import from one place. 15 GLOBS, behaviorally identical `pnpm test`.
2. **Phase 1b** adds the 16th `test-globs-tests` GLOB entry as a SEPARATE COMMIT, locking in the unit-test coverage in CI.
3. **Phase 2** builds the TAP transform + runner in isolation. Parser is a pure function `parseTap(tapString: string): NamespaceSummary` plus `sanitizeFailureError`. 7 committed real-output TAP fixtures + 1 drift-guard test. Runner uses `proper-lockfile` for cross-invocation lock + atomic temp-rename for summary writes.
4. **Phase 3** wires `pnpm test:summary` into the package manifest + 4 PROCESS_HINTS mirror files + docs, and resolves the meta-state finding via `refresh_file_index` THEN `resolve`.

This ordering puts the riskiest work (TAP parsing) in the middle phase where unit tests can validate it without yet touching the package manifest or repo docs.

## Red Team Review

### Session — 2026-07-13
**Findings:** 15 (5 Critical, 4 High, 6 Medium)
**Reviewers:** Assumption Destroyer, Failure Mode Analyst (peer session), Security Adversary
**Severity breakdown:** 5 Critical, 4 High, 6 Medium, 1 Low
**Deduplication:** 27 raw findings → 15 merged (overlap on PROCESS_HINTS schema, TAP parser, NDJSON contract)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | PROCESS_HINTS schema mismatch (`Object.freeze([strings])`, not `{key,re,hint}`) + missing mirror files (`LOCAL_PROCESS_HINTS`, `HINT_KEY_MAP_PROCESS`, `HINT_SUGGESTIONS_PROCESS`) — cold-session parity test fails on merge | Critical | Accept | Phase 3 Step 2 |
| 2 | TAP parser fundamentally broken against Node v24.18.0: (a) `parse_failed` fires on every green namespace (Node wraps `ok` in YAML blocks too), (b) 6-space nested-subtest indent not matched by 2-space regex, (c) single-line `error: '(.*)'` regex misses multi-line `error: |-` block scalars, (d) parent `not ok` line inflates leaf fail count, (e) test fixtures all use single-line form giving false confidence | Critical | Accept | Phase 2 Step 1+2 |
| 3 | Child exit code/signal discarded; `ok` computed only from `parsed.fail === 0`, so Node import/syntax/crash failures can exit 0 | Critical | Accept | Phase 2 Step 3 |
| 4 | Test imports use `.js` while created modules are `.mjs`; ESM resolution fails at import time | Critical | Accept | Phase 2 Step 2 |
| 5 | NDJSON line-count contradiction: plan said 17 in some places, 18 in others (actual: 1 start + 16 ns + 1 suite = 18) | High | Accept | plan.md, Phase 2/3 |
| 6 | `pnpm test` byte-equivalence claim false — Phase 1b changes suite-footer count from 15→16 globs; claim corrected to "behaviorally equivalent modulo suite-footer count and pre-commit-load-bearing test-globs unit tests" | High | Accept (modified) | Phase 1b, Phase 3 |
| 7 | `meta_state_resolve` blocked by `rule-no-orphaned-evidence`: Phase 3 modifies `package.json`, which changes its SHA-256; `gate-logic.js:652-716` compares current hash to baseline → `fingerprint_mismatch` blocks the resolve | High | Accept | Phase 3 Step 4a (added refresh_file_index call BEFORE resolve) |
| 8 | No cross-invocation lock despite pre-commit running `pnpm test` and existing runner explicitly documenting "concurrent runs unsupported"; `proper-lockfile` already in deps | High | Accept | Phase 2 main() (added `proper-lockfile` mutex) |
| 9 | `parse_failed` fallback path in plan points to `.test-logs/<ns>.log` — but the summary runner writes TAP to stdout, never to the `.log` file. Fallback is dead. | Medium | Accept | Phase 2 Step 3 (added raw TAP mirror to `.test-logs/<ns>.tap`) |
| 10 | `head -3` / `wc -l` / `tail -3` smoke-test recipes in Phase 2 Step 4 + Phase 3 Step 5 close the runner's stdout pipe and SIGPIPE it mid-emit; NDJSON stream truncates | Medium | Accept | Phase 2 Step 4, Phase 3 Step 5 (replaced with temp-file capture + post-filter) |
| 11 | Phase 1 is not a pure extraction (also adds `test-globs-tests` namespace) and has no rollback checkpoint; conflates two separable changes | Medium | Accept | Phase 1 (split into 1a/1b commits) |
| 12 | `/tmp/tap-inject.mjs` and `/tmp/tap-fail-probe.mjs` cited as verification artifacts are not in repo, ephemeral on every container — TAP-format claims cannot be independently falsified | Medium | Accept | Phase 2 Step 2 (added committed fixtures under `tools/scripts/__tests__/fixtures/`) |
| 13 | `.test-logs/` gitignore status unverified; failure `error` field written verbatim — first-line error may contain paths/env/credentials. Need explicit verification + sanitization pass. | Medium | Accept (modified) | Phase 1a Step 5 (gitignore verify) + Phase 2 tap-parser (sanitizeFailureError export) |
| 14 | `interface-contract-tests` is a single-file glob; pinning it as a required namespace in unit test creates brittle contract for future refactors. Drop from must-preserve set; keep as known-design-state note. | Medium | Accept (modified) | Phase 1 Step 3 (test-globs.test.js required set) |
| 15 | Parser hardening: footer capture uses `startsWith` instead of anchored regex; no TAP version guard (`TAP version 13` header check) for future Node emitter drift | Low | Accept | Phase 2 Step 1 (regex literals `^# tests \d+$`) |

**Rejected (1):**

| # | Finding | Severity | Rationale |
|---|---|---|---|
| AD-8 | `parseTap` not referentially transparent (uses `resolve()`) | Low | `resolve()` is a deterministic path normalizer (per Node docs — pure function of input string). Same inputs → same outputs → referentially transparent. Function has no I/O, no `Date.now()`, no `Math.random()`. AD-8 confuses "uses internal helper" with "non-pure". |

### Whole-Plan Consistency Sweep

**Files reread:** plan.md, phase-01-foundation.md, phase-02-tap-implementation.md, phase-03-wire-up.md
**Decision deltas checked:** 15 (one per accepted finding)

**Reconciled stale references:**

| Stale claim (pre-red-team) | Corrected to |
|---|---|
| "All 15 globs" (Phase 1) | "15 in Phase 1a; 16 after Phase 1b" |
| "TAP parser covers 5 unit tests" | "TAP parser covers 7 committed fixtures + 3 sanitize/error tests + 1 drift-guard test" |
| "17 NDJSON lines (1 start + 15 ns + 1 suite)" | "18 NDJSON lines (1 start + 16 ns + 1 suite)" |
| "PROCESS_HINTS schema is `{key, re, hint}`" | "PROCESS_HINTS is `Object.freeze([strings])`; 4-file lockstep edit" |
| "ok = parsed.fail === 0" | "ok = parsed.fail === 0 AND exitCode === 0 AND signal === null" |
| "pnpm test byte-equivalent pre/post Phase 3" | "behaviorally equivalent modulo 15→16 suite-footer count across Phase 1b commit" |
| "Phase 1 is a pure extraction" | "Phase 1 ships as 1a (extraction) + 1b (namespace add) — two commits" |
| "parse_failed fallback → .test-logs/<ns>.log" | "parse_failed fallback → .test-logs/<ns>.tap (raw TAP mirror written by runner)" |
| "Smoke test uses `head -3 | wc -l`" | "Smoke test uses temp-file capture (`> /tmp/...`) + post-filter" |
| "test imports use `from "../tap-parser.js"`" | "test imports use `from "../tap-parser.mjs"`" |
| "Risk R5: GLOBS.length === 15 in unit test" | "Risk R5: GLOBS.length === 15 in Phase 1a; === 16 in Phase 1b" |
| "Phase 3 modifies `loop-introspect.js` only" | "Phase 3 modifies 4 files in lockstep (loop-introspect.js + .factory mirror + loop-get-instruction-tool.js's 2 maps)" |

**Unresolved contradictions:** 0

All accepted findings have been applied inline to the phase files. The plan is consistent.
