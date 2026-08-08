---
phase: 4
title: "Resolve finding, docs, runtime-agnostic audit, ship"
status: in-progress
priority: P1
effort: "1-2h"
dependencies: [1, 2, 3]
---

# Phase 4: Resolve finding, docs, runtime-agnostic audit, ship

## Overview

Close the loop after Phases 1–3 are green on the branch: resolve the B finding `meta-260808T1614Z-...` via `meta_state_resolve` (citing this plan), update evergreen docs to describe the new startup-vs-on-demand hint model, run the runtime-agnostic audit across changed files, run the full suite + fallow gate, and hand off for review/ship. This phase does loop bookkeeping + docs only — no feature code.

## Requirements

- Functional: `meta_state_derive_status({id:"meta-260808T1614Z-..."})` to confirm safe to resolve, then `meta_state_resolve({id, resolution, resolved_by:"operator"})` with a resolution citing this plan (the gate-verb-allowance key + the injection-policy mechanism + the dedup).
- Functional: evergreen docs updated only where user-visible behavior changed — the hint-injection model (startup vs on-demand, the `hint_index`). Target the smallest owning surface (per `documentation-management.md`): likely `docs/architecture.md` (the gate/3-layer/meta-state section) or `docs/loop-engine.md` (concept vocabulary) — discover the target via the docs navigation, do not assume. Do NOT duplicate the registry details into docs; link to `core/hint-registry.js` as the machine-owned source.
- Functional: `check_runtime_agnostic` 6/6 on every changed file in `core/` + the universal hooks (the feature is a shared-registry + universal-hook change; the per-runtime MCP residue is untouched).
- Functional: full `pnpm test` green; `pnpm fallow:gate` green (or non-actionable findings only).
- Non-functional: all `meta-state.jsonl` writes via loop tools (CLI); no direct file edits. No plan IDs / phase numbers / finding codes in code comments, test names, or commit messages (describe the invariant directly).

## Architecture

Loop bookkeeping mirrors plan 260808-1222's Phase 4 pattern: derive-status → resolve → confirm. The resolution text records that the B finding is addressed by the injection-policy mechanism + the on-demand `gate-verb-allowance` key + the dedup, shipped in this plan. Docs are the only evergreen edit; the registry + AGENTS.md/CLAUDE.md trims from Phase 3 ARE the contract.

## Related Code Files

- No feature code modified in this phase.
- Reference: `meta-state.jsonl` (the finding record — mutated only via `meta_state_resolve` CLI).
- Modify: the smallest-owning docs surface for the hint-injection model (discover at execution time).
- Modify (already done in Phase 3): `AGENTS.md`, `CLAUDE.md` — no further edits here.

## Implementation Steps

1. Precondition: Phases 1–3 green on the branch (`pnpm test` + `vitest --changed` green), AND the branch is **merged to main** (the resolve step 3 is a hard post-merge step — red-team #15; resolving before merge risks the branch reverting, the 260808-1222 lesson).
2. Run `meta_state_derive_status({id:"meta-260808T1614Z-loop-get-instruction-gate-verb-allowance-returns-unknown-hin"})` — confirm it is safe to resolve.
3. `meta_state_resolve({id:"meta-260808T1614Z-...", resolution:"Addressed by plan 260808-2018: added the gate-verb-allowance loop_get_instruction key (the 2-call incantation + id==affected_system rule + sentinel source_ref + the promoted-rule denylist still applies during the allowance window) on an injection-policy tier that makes it on-demand; reclassified 12 discoverability + 2 process hints on-demand (keep 4 startup); emitted hint_index on warm loop_describe + the .claude universal hook + the .factory forked hook (cold tier + renderer stay unfiltered); deduped hint text against CLAUDE.md/AGENTS.md. The key is fetchable via loop_get_instruction({key:'gate-verb-allowance'}) without a block or a CLAUDE.md re-read.", resolved_by:"operator"})`.
4. Confirm: `meta_state_list({id:[...]})` shows `status:"resolved"`.
5. Discover the docs target (grep docs/ for the existing hint-injection / discoverability description); update the smallest owning surface to describe startup-vs-on-demand + `hint_index`; link to `core/hint-registry.js` as the source of truth.
6. `check_runtime_agnostic` on each changed `core/` file + the universal hooks. **(red-team #9)** The audit's `UNIVERSAL_DIRS`/`SHIM_DIRS` exclude `.factory/hooks/` (it's not under `coordination/hooks/`), so 6/6 does NOT prove `.factory` delivery. Add a **manual `.factory` verification**: run the `.factory` SessionStart hook (or its test) and confirm `hint_index` is present in its output. Note the blind spot in the docs.
7. Full `pnpm test`; `pnpm fallow:gate` (run `pnpm fallow:brief` if non-zero; grep `severity=` for actionable findings; ignore baseline-inherited).
8. Re-ground any finding that cites a changed path: `meta_state_refresh_file_index({path})` for `hint-registry.js`, `loop-introspect.js`, `loop-describe-tool.js`, the two `.claude` hooks, `.factory/hooks/loop-surface-inject.cjs`, `AGENTS.md`, `CLAUDE.md` if the loop flags drift.
9. Conventional commit(s) — no plan IDs / finding codes in the message; describe the invariant (e.g. `feat(hints): injection-policy tier + on-demand gate-verb-allowance key + dedup`).

## Success Criteria

- [ ] Finding `meta-260808T1614Z-...` is `resolved` strictly post-merge (branch on main); no direct `meta-state.jsonl` writes.
- [ ] Evergreen docs describe the startup-vs-on-demand hint model + `hint_index`; link to `hint-registry.js`, no duplicated details.
- [ ] `check_runtime_agnostic` 6/6 on changed `core/` + universal-hook files, PLUS a manual `.factory` verification (the audit's `.factory/hooks/` blind spot is noted).
- [ ] `pnpm test` green; `pnpm fallow:gate` green or non-actionable.
- [ ] Commit message(s) free of plan IDs / phase numbers / finding codes.

## Risk Assessment

- **Risk: resolving the finding before the code is merged (the 260808-1222 lesson).** *Signal:* finding resolved but the branch reverts/misses. *Response:* resolve only after Phases 1–3 tests are green on the branch; resolve is a late step, not pre-merge. If the ship flow merges to main before review, resolve post-merge (mirror 260808-1222 Phase 4's post-merge decision).
- **Risk: docs churn beyond the smallest owning surface.** *Signal:* edits spread across multiple docs files. *Response:* the hint-injection model is one concept — keep it to one docs section + a link to the registry source; do not copy registry details into prose. `documentation-management.md` governs: update only user-visible behavior/contracts.
- **Risk: `fallow:gate` surfaces a finding introduced by the AGENTS.md/CLAUDE.md trim.** *Signal:* `pnpm fallow:brief` shows a high-severity row on the trimmed docs. *Response:* the trim moved content to its canonical home, so the finding is likely a false-positive on the now-shorter passage; verify, and if the trim genuinely dropped load-bearing content, restore that passage (per Phase 3 risk response) rather than weakening the gate.