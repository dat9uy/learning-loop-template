# Phase 3 report — dedup hint text + minimal CLAUDE.md and AGENTS.md

Date: 2026-08-08
Status: COMPLETE (green)

## What changed

- `tools/learning-loop-mastra/core/hint-registry.js` — `text`/`suggestion` trims on the audit-named rows. Each trimmed hint keeps its unique operational residue + a one-line pointer to the canonical doc surface; the duplicated prose passage moved out. No slug/order/`tier` edits.
- `AGENTS.md` §2 step 3 — the mechanism-check + derive-refresh asides trimmed to a single pointer line naming the canonical hints (`loop_get_instruction({ key: 'mechanism-check' })` / `derive-refresh`). §1/§3 otherwise unchanged.
- `CLAUDE.md` gate-verb bullet — the full 2-call incantation prose trimmed to a pointer: `loop_get_instruction({key:'gate-verb-allowance'})` + the block message. The accepted pre-block discovery tradeoff (one extra `loop_get_instruction` lookup on the proactive path; blocked path stays zero-discovery) is stated inline.
- New `tools/learning-loop-mastra/__tests__/hint-dedup-invariant.test.cjs` — the durable cross-surface dedup invariant. Scoped to PROSE sentences (sentence boundaries, code-dominated sentences skipped), with an operational-recipe allowlist (`meta_state_re_verify({ id, refresh: true })`, `meta_state_touch({ id })`, `loop_get_instruction`, `meta_state_list`). Asserts: no hint `text` sentence is duplicated verbatim in AGENTS.md/CLAUDE.md; trimmed hints carry pointers + retain their unique residue; `gate-verb-allowance` hint and `evaluate-bash-gate.js` block message share the canonical substrings; CLAUDE.md carries a pointer, not the full incantation.

## Verification

- `pnpm test:one __tests__/hint-dedup-invariant.test.cjs` → 4/4 pass.
- `pnpm exec vitest --changed` → 52 files / 400 tests pass.
- File-index re-ground: `meta_state_refresh_file_index` ran on all 8 edited paths; 8 findings regrounded (2 on hint-registry.js, 2 on loop-introspect.js, 1 on loop-describe-tool.js, 1 on .factory hook, 2 on discoverability hook). No findings cite AGENTS.md/CLAUDE.md (no re-ground strictly required; refreshed anyway).
- `check_runtime_agnostic`: hint-registry.js 6/6, loop-introspect.js 6/6, loop-describe-tool.js 6/6. The two universal session-start hooks score 3/6 and 4/6 — pre-existing HEAD baseline (failures are protocol-adapter/surfaces.js patterns elsewhere in the file; this phase's diff only adds additive `hint_index` + `{tier}` plumbing and introduces no hard-coded surface paths). `.factory/hooks/loop-surface-inject.cjs` is outside the audit's dirs (the `.factory/hooks/` blind spot, red-team #9) — covered by the `.factory` hook test instead.

## Notes / deviations

- The Phase 3 implementation agent hit a session-quota API error after completing the work but before writing this report and before the file-index re-ground. The re-ground was completed by the controller; no code rework needed — the dedup test was already green, confirming the trims landed correctly.
- Under-trimmed by design (Phase 3 risk response): every trim moves content to a named canonical home; nothing deleted. The dedup-invariant test catches residual duplication without forcing aggressive cuts.
- Out of scope (left for a separate finding): merging `reopens` / `reopens-script` slugs.