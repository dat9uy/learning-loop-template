---
phase: 1
title: "De-risk jq projection"
status: pending
effort: "P2"
dependencies: []
---

# Phase 1: De-risk jq projection

## Overview

Ship `tools/scripts/registry-table.sh` — a `jq` projection that dedupes the registry by id (last-wins by max version) and emits one-line-per-id JSONL. It mirrors the `tools/scripts/vitest-failures.sh` idiom (small bash, `jq` does the work, read-only, no side effects). It is an **identity on a one-line-per-id file**, so the operator can adopt `registry-table.sh | fx` now and it stays valid through Tier 2 with zero relearning — de-risking Tier 2's ergonomics before any write-path work.

**Dependency:** Phase 1 ships AFTER [Phase 01a (pre-merge dedupe)](./phase-01a-pre-merge-dedupe.md) so the live `meta-state.jsonl` is a true one-line-per-id file before the script lands. The "identity on live file" claim becomes literally true (Validation Session 1 Q4).

## Requirements

- Functional: `registry-table.sh [paths...]` reads one or more JSONL registries (defaults to `meta-state.jsonl`), dedupes by `id` keeping `max_by(.version)`, re-streams one JSON object per line.
- Non-functional: read-only, no side effects, no gate preflight (mirrors vitest-failures.sh contract); deterministic output; exits 0 on success, 2 on missing/invalid file.
- Forward-compatibility: identical output on a one-line-per-id file (Tier 0/1) and on a versioned multi-line-per-id file (Tier 2). After Phase 2 ships, the script accepts multiple positional args to cover both files (default `meta-state.jsonl change-log.jsonl`) — already pre-declared in this phase's forward-compat note.

## Architecture

`jq -s 'group_by(.id) | map(max_by(.version))[]'` — slurp to array, group by id, pick max version per id, stream back. On singletons `max_by` returns the sole element → identity. The script is the operator-facing read surface; the internal chokepoint (Phase 2) is a separate concern but shares the same projection semantics, so the two stay aligned.

**Forward-compat note (Red Team F9, F11):** Today the live file has 313 lines / 309 unique ids (4 historical duplicate-id groups). Phase 1's manual check is reframed: the script produces one line per UNIQUE id; live data collapses 4 dup-id groups to max-version survivors. Phase 2's migration dedupes those groups FIRST so post-Phase-2 the script is identity on a true one-line-per-id file. Phase 2 step 1 also extends `PATH_ARG` to accept multiple positional args and defaults to `meta-state.jsonl change-log.jsonl` after the split — keeping the operator's "zero relearning" promise.

## Related Code Files

- Create: `tools/scripts/registry-table.sh`
- Create: `tools/scripts/__tests__/registry-table.test.js` (mirror `tools/scripts/__tests__/vitest-failures.test.js`)
- Create (test fixtures): `tools/scripts/__fixtures__/registry-one-line-per-id.jsonl`, `tools/scripts/__fixtures__/registry-versioned.jsonl`
- Reference: `tools/scripts/vitest-failures.sh` (idiom to mirror)

## Implementation Steps

1. Read `tools/scripts/vitest-failures.sh` + its test; mirror the **contract shape**: header comment, `set -euo pipefail`, missing-file → stderr guidance + exit 2, invalid-JSON → exit 2. The literal default for THIS script is `PATH_ARG="${1:-meta-state.jsonl}"` (the vitest-failures default is `.test-logs/vitest-results.json` — mirror the SHAPE, not the literal default path; Red Team F14c).
2. Write `registry-table.sh` with core `jq -s 'group_by(.id) | map(max_by(.version))[]' "$PATH_ARG"`. Add an invalid-JSON guard (`jq -e .` per-line or `jq -s` failure → exit 2 with hint).
3. Create fixtures: `registry-one-line-per-id.jsonl` (3 distinct ids, one line each, versions 1) and `registry-versioned.jsonl` (2 ids, id-A with v1+v3+v2, id-B with v1+v2 — expect max-by-version winners only).
4. Write `tools/scripts/__tests__/registry-table.test.js` (**`.test.js` extension** — vitest's include glob only picks up `.test.js` for `tools/scripts/__tests__/`; Red Team F14 follow-up). Tests: (a) identity — one-line-per-id fixture output equals input; (b) dedupe — versioned fixture output has one line per id, the max-version one; (c) missing file → exit 2; (d) invalid JSON → exit 2. No separate runner — vitest picks up via the configured include glob; `pnpm test` = `vitest run`.
5. Run the new test; ensure green. Run `pnpm test` to confirm no regression (script is additive, read-only).

## Success Criteria

- [ ] `tools/scripts/registry-table.sh` exists, executable, read-only, mirrors vitest-failures.sh **contract** (header / `set -euo pipefail` / exit codes).
- [ ] `tools/scripts/__tests__/registry-table.test.js` (`.test.js`) passes: identity on one-line-per-id; correct last-wins dedupe on versioned fixture; exit 2 on missing/invalid.
- [ ] `pnpm test` green (no regression).
- [ ] Manual check: `tools/scripts/registry-table.sh meta-state.jsonl | head` produces one line per **UNIQUE** id (live file has 4 historical dup-id groups collapsed to max-version survivors; Phase 2 dedupes those groups first so the script is identity on a true one-line-per-id file post-Phase-2). Red Team F9.

## Risk Assessment

Low. Pure additive read-only script + test. No registry writes, no write-path or chokepoint changes. Only risk is a `jq` version quirk (`group_by`/`max_by` are stable in jq ≥1.6; CI uses a pinned jq). If `max_by(.version)` encounters a missing `version` field, `max_by` treats null as smallest — all current registry entries carry `version`, so non-issue; fixture tests both confirm.