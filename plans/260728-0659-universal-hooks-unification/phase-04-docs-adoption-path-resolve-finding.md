---
phase: 4
title: "Docs, adoption path, resolve finding"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2, 3]
---

# Phase 4: Docs, adoption path, resolve finding

## Overview
Document the hooks wiring manifest + the 4 wiring patterns + the "adding a new hook" adoption path in `docs/architecture.md`, then resolve the finding through the loop's meta-state lifecycle (`meta_state_derive_status` → `meta_state_resolve` + change-log entry). This closes the "adoption path undocumented" consequence of the finding and leaves the loop's self-model consistent with the shipped mechanism.

## Requirements
- Functional: `docs/architecture.md` gains a "Hooks Wiring Manifest" subsection covering the 6 universal hooks, the 4 wiring patterns (shim/direct/adapter/none), the per-runtime matrix, `hooks-lock.json` as source of truth, and the adoption path.
- Functional: `hooks-lock.json` is added to `CHANGE_LOG_BOUND_PATHS` in `core/change-log-bound-paths.js` so future manifest edits trigger `meta_state_log_change` (red-team F10 — the manifest is a load-bearing trust anchor; unlogged edits silently redefine "correct wiring").
- Functional: finding `meta-260726T1858Z-universal-hooks-unification-is-half-shipped-tools-learning-l` moves to `resolved` with a change-log entry citing this plan.
- Non-functional: docs update is the smallest owning surface (per documentation-management rule); no copying of machine-owned manifest details — link to `hooks-lock.json`. No plan IDs in stable code/comments (per rule).

## Architecture
**Doc location:** a new `### Hooks Wiring Manifest` subsection in `docs/architecture.md`, placed after the Outbound Gates section (near `:164` per research report) and cross-linked from the existing "Context-Injection Division of Labor" section (`:532`, added by plans/260717-1826).

**Adoption path (the deliverable that closes consequence #2):**
1. Implement the hook canonically in `tools/learning-loop-mastra/hooks/universal/` (ESM `.js` or `.cjs`).
2. Add a `hooks-lock.json` entry with `path`, `event`, and a per-runtime `wiring` map. Decide per surface: `shim` (if the runtime needs a CJS wrapper that `execFileSync`'s the universal hook — Claude Code / Droid PreToolUse), `direct` (if the runtime's config can invoke the universal hook directly — mastracode), `adapter` (runtime-local SessionStart content adapter), or `none` (pull-only / N/A).
3. If `shim`, mirror the `.cjs` shim byte-identical into each `kind:"shim"` surface's `coordination/hooks/` dir (the `shims-in-sync` checklist item enforces byte-identity).
4. Wire each runtime's `settings.json` / `hooks.json` under the entry's `event` (matcher for `PreToolUse`).
5. Run `pnpm test` — `hooks-lock-manifest.test.js` (shape), `hooks-wiring-parity.test.js` (wiring), and `runtime-agnostic.test.js` (`shims-in-sync`) go red→green.

**Finding resolution:** call `meta_state_derive_status` for the finding id (refresh derived status before resolving — per derive-refresh hint), then `meta_state_resolve` with a resolution citing this plan dir + the change-log entry id. Log a change-log entry via `meta_state_log_change` (`change_dimension: hooks`, `change_target: hooks-lock.json + core/runtime-agnostic-checklist.js`, `reason`: summary of the unification) and cite its id in the resolution `source_refs`.

## Related Code Files
- Modify: `docs/architecture.md` (new subsection + cross-link)
- Modify: `tools/learning-loop-mastra/core/change-log-bound-paths.js` (add `hooks-lock.json` to the bound-paths array — red-team F10)
- Read: `plans/260728-0659-universal-hooks-unification/plan.md` (matrix), `hooks-lock.json`, `docs/architecture.md` (existing hooks section + Context-Injection Division of Labor)
- No other code changes in this phase.

## Implementation Steps
1. **Read** `docs/architecture.md` around the Outbound Gates section and the Context-Injection Division of Labor section; confirm the insertion point.
2. **Write** the `### Hooks Wiring Manifest` subsection: a one-line intro, the wiring-kind table (shim/direct/adapter/none), the per-runtime matrix (link to `hooks-lock.json` rather than copy), and the 5-step adoption path above. Keep it evergreen — no plan IDs, no phase numbers.
3. **Add `hooks-lock.json` to `CHANGE_LOG_BOUND_PATHS`** in `core/change-log-bound-paths.js` (one-line; red-team F10). Verify the bound-paths test still passes.
4. **Resolve the finding.** Via the loop CLI (writes ride the CLI in this runtime):
   - `meta_state_log_change '{change_dimension:"hooks", change_target:"hooks-lock.json; core/runtime-agnostic-checklist.js; core/change-log-bound-paths.js; docs/architecture.md", change_diff:"<summary>", reason:"<unification summary>"}'` → capture the change-log id.
   - `meta_state_derive_status '{id:["meta-260726T1858Z-universal-hooks-unification-is-half-shipped-tools-learning-l"]}'`.
   - `meta_state_resolve '{id:"meta-260726T1858Z-...", resolution:"<summary>", source_refs:["local:plans/260728-0659-universal-hooks-unification/plan.md","local:meta-state:<change-log-id>"]}'`.
5. **Verify** `meta_state_list` shows the finding `resolved`; `meta_state_check_grounding` passes for the cited code paths.

## Success Criteria
- [ ] `docs/architecture.md` "Hooks Wiring Manifest" subsection documents the matrix + adoption path; links to `hooks-lock.json`.
- [ ] `hooks-lock.json` is in `CHANGE_LOG_BOUND_PATHS`; the bound-paths test passes.
- [ ] Finding `meta-260726T1858Z` is `resolved`; change-log entry cites this plan.
- [ ] `meta_state_check_grounding` passes for cited evidence paths.
- [ ] No plan IDs / phase numbers in the docs subsection.

## Risk Assessment
**Low.** Docs + meta-state resolution only — no code or runtime behavior change. Only risk is a stale cross-link target in `docs/architecture.md` (line numbers shift). Mitigation: anchor the subsection by heading name, not line number; verify links after writing (per documentation-management rule). The finding-resolution CLI calls are idempotent-ish — if `meta_state_resolve` is rejected (e.g. already resolved), surface the rejection rather than forcing.