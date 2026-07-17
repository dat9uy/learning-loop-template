---
phase: 3
title: "Closeout-plan parity verification + symmetric shell-script affordance"
status: completed
priority: P2
effort: "1h"
dependencies: [1, 2]
shipped_at: "2026-07-17"
shipped_by: "ak:cook --auto"
---

# Phase 3: Closeout-plan parity verification + symmetric shell-script affordance

## Overview

Two surfaces share the audit-trail concern with `meta_state_list`:

1. **Closeout plans that use `include_archived: true` as the verify-after-resolve pattern** (e.g., `plans/260710-0104-drift-driven-registry-closeout/phase-02-*`). These work today and continue to work — verify, no code change.

2. **`tools/scripts/registry-table.sh`** — the jq-based projection that mirrors `meta_state_list`'s collapse. Currently uses `group_by(.id) | map(max_by(.version))[]`, the same projection as the JS reader. Adding a `--all-versions` flag here is symmetric to the MCP tool and closes the shell-side escape hatch (operators who `tail -20 meta-state.jsonl` after seeing the registry-table call).

## Requirements

- **Functional:**
  - Verify that the existing `meta_state_list({id, include_archived: true})` verify-after-resolve pattern in closeout plans (specifically `plans/260710-0104-drift-driven-registry-closeout/phase-02-resolve-confirmed-shipped.md:23-67`) continues to work unchanged. No code changes to those plans.
  - Add an optional `--all-versions` flag to `tools/scripts/registry-table.sh` that bypasses the `max_by(.version)` projection and emits every line per id, sorted by `(id, version)` ascending. Symmetric to the MCP flag.
- **Non-functional:** the shell flag must be a no-op on a one-line-per-id file (identity projection). The default (no flag) preserves the existing collapse behavior — zero breaking change for current callers (`registry-table.sh | tail -20` per AGENTS.md §1.1).

## Architecture

`tools/scripts/registry-table.sh` (jq-based, mirror of the JS reader):
- Today reads `meta-state.jsonl change-log.jsonl` (default; both files may be absent), concatenates, runs `group_by(.id) | map(max_by(.version))[]`, emits one line per id.
- The new `--all-versions` flag swaps the jq expression to `group_by(.id) | map(sort_by(.version)[]) | .[] | select((.version // 0) >= 0)` (or equivalent: every line, sorted by `(id, version)`). The result is multi-line per id when the file has versioned-append history.

The MCP tool + shell script now share a symmetric flag pair (`include_all_versions` / `--all-versions`). One is the JS seam; the other is the jq seam. Both project the same underlying file set.

## Related Code Files

- Verify (no change): `plans/260710-0104-drift-driven-registry-closeout/phase-02-resolve-confirmed-shipped.md:23-67` — confirm `meta_state_list({id, compact: true, include_archived: true})` post-resolve still surfaces the v1 line. Document this in the closeout journal (Phase 4).
- Modify: `tools/scripts/registry-table.sh` — add `--all-versions` argv branch; header comment updated; behavior section appended.
- Create: `tools/scripts/__tests__/registry-table-all-versions.test.cjs` (or shell-side equivalent) — 2 tests:
  - Default (no `--all-versions`) emits one line per id (existing behavior).
  - `--all-versions` emits N lines per id when the fixture has N versions per id; preserves ordering.

## Implementation Steps

1. **Verify closeout-plan parity.** Run a focused grep across all `plans/*/phase-02-*-resolve-confirmed-shipped.md` and `plans/*/phase-03-*-closeout.md` for the pattern `meta_state_list.*include_archived.*true`. Confirm every match is in plan-files (not in code), document each match in the closeout journal.
2. **RED test for shell script.** Write the all-versions shell test first: assert `registry-table.sh --all-versions <dir>` emits N lines when the fixture has N versions per id. Confirm it fails (no flag exists yet).
3. **GREEN — add `--all-versions` to registry-table.sh.** Extend the argv parsing to accept `--all-versions`. Branch the jq expression. Default stays as-is. Update the header comment block with the new flag's contract.
4. **RED test for default preservation.** Assert `registry-table.sh <dir>` (no flag) still emits one line per id. Confirms no regression.
5. **Update AGENTS.md §1.1 read-recipe blockquote.** The current quote says "raw file is no longer table-readable post-Tier-2; run `tools/scripts/registry-table.sh | tail -20`". Append: `Pass --all-versions to see the full versioned-append history per id (multi-line for ids with multiple versions).`
6. **Run full shell-script test suite.** `pnpm exec vitest run __tests__/registry-table-all-versions.test.cjs` (or whatever the existing shell-test entrypoint is). Confirm GREEN.

## Success Criteria

- [x] All existing closeout plans using `include_archived: true` verified (no code/doc changes needed).
- [x] `tools/scripts/registry-table.sh --all-versions` returns multi-line per id on a versioned-append fixture.
- [x] Default `tools/scripts/registry-table.sh` (no flag) preserves the existing collapse behavior (zero breakage).
- [x] AGENTS.md §1.1 read-recipe blockquote extended.
- [x] Shell-side tests GREEN.

## Risk Assessment

- **P2 — jq expression complexity.** Sorting by `(id, version)` with `created_at` as tie-break is more verbose than the existing one-liner. Mitigation: keep the default jq expression as `group_by(.id) | map(max_by(.version))[]` (unchanged); only the `--all-versions` branch swaps to the multi-line sort. The added branch is local.
- **P2 — `registry-table.sh` already has positional path arguments.** Adding `--all-versions` as an argv-flag must not collide with the existing positional-path handling. Mitigation: parse `--all-versions` BEFORE the positional-path sweep; fail closed with usage hint if `--all-versions` appears after a positional path.
- **P3 — Operators confused by the asymmetric flag names** (`include_all_versions` MCP vs `--all-versions` shell). The naming is per-surface convention (camelCase JS, kebab-case CLI), but worth a one-liner in the AGENTS.md update to call it out.
- **P3 — Phase 3 is P2 priority because the shell script is a fallback surface.** If disk is tight, drop Phase 3 entirely and ship only Phases 1+2+4. The MCP-side affordance is the load-bearing fix.