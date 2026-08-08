# Phase 4 report — resolve finding, docs, runtime-agnostic audit, ship

Date: 2026-08-08
Status: in-progress (docs/audit/verification done; merge + post-merge finding-resolution pending)

## What was done in-branch

### Docs (evergreen)
- `docs/architecture.md` § Context-Injection Division of Labor — updated the source-of-truth schema doc to include the `tier` injection-policy field; added a "Startup vs on-demand" paragraph describing the model (4 startup hints auto-injected full-text + `hint_index` of all slugs; on-demand full text via `loop_get_instruction`; warm-only filter; cold tier + renderer stay unfiltered; `listHints` no-filter default); updated the production-injection builder description; updated the surface table rows for `.factory` push (now emits startup pointers + `hint_index`), warm `loop_describe` (startup-tier + `hint_index`; cold unfiltered), `loop_get_instruction` (canonical on-demand full-text fetch), and the sidecar (startup pointers + index, no on-demand full text). Links to `core/hint-registry.js` as the machine-owned source; no registry details duplicated into prose.

### Runtime-agnostic audit
- `check_runtime_agnostic` 6/6: `hint-registry.js`, `loop-introspect.js`, `loop-describe-tool.js`.
- The two universal session-start hooks score 3/6 and 4/6 — pre-existing HEAD baseline (failures are protocol-adapter/surfaces.js patterns elsewhere in the files; this plan's diff only adds additive `hint_index` + `{tier}` plumbing, introducing no hard-coded surface paths). Confirmed by diffing the hooks: only additive fields + filter args.
- `.factory/hooks/loop-surface-inject.cjs` is outside the audit's `UNIVERSAL_DIRS`/`SHIM_DIRS` (the `.factory/hooks/` blind spot, red-team #9). Covered instead by `.factory/hooks/__tests__/loop-surface-inject.test.cjs:68-71`, which asserts the factory block carries `--- hint_index ---` and lists `gate-verb-allowance`. That test is green.

### Fallow gate
- `pnpm fallow:gate` non-zero → `pnpm fallow:brief` triaged. One PR-introduced actionable finding (`unused-re-export projectToPointers` at `loop-introspect.js:138`, created when `projectToPointers` moved from a local function to an import+re-export this plan) — fixed by dropping `projectToPointers` from the re-export (kept `buildHintIndex`; internal callers at lines 141/210 still bind via the import). No external importer existed (grep-confirmed).
- Remaining findings are baseline-inherited: the 1 duplication clone group is the pre-existing `buildProcessHints`/`buildProcessPointers` ruleMap-loading block (both functions existed at origin/main; only the `tier` param was added); the complexity findings are pre-existing (the gate excluded 2 inherited; `buildContextPayload`'s branching predates this plan — the diff added only additive field assignments, no new branches).

### Success-criteria verification (via loop CLI)
- `loop_get_instruction({key:"gate-verb-allowance"})` returns the full hint: `gate_mark_preflight({surface:"runtime-state"})` + `runtime_state_record` with `<verb>` placeholder + `id` MUST equal `affected_system` + sentinel `local:meta-state:gate-verb-allowance` (non-resolving) + 30-min expiry + "the promoted-rule denylist still applies during the allowance window". Index 16. ✓
- Warm `loop_describe`: `discoverability_hints` = 4 (startup set); `process_hints` = 0 (both standalone on-demand); `hint_index` = 29 (19 standalone [17 discoverability + 2 process] + 10 rule-derived process slugs merged — the complete discovery surface per red-team #11). `gate-verb-allowance` absent from warm `discoverability_hints`, present in `hint_index`. ✓
- Cold `loop_describe`: `discoverability_hints` = 17 (unfiltered, includes `gate-verb-allowance`). ✓
- `listHints` no-filter default + numeric indices 0-15 unchanged + `gate-verb-allowance` at 16: pinned by `hint-registry.test.cjs` (green). ✓

### Tests
- `pnpm test` (full) exit 0; `pnpm exec vitest --changed` 52 files / 400 tests green; `hint-dedup-invariant.test.cjs` 4/4.
- File-index re-ground: `meta_state_refresh_file_index` on all 8 edited paths; 8 findings regrounded. The `cold-tier-regression` grounding test failed transiently after the re-export edit re-drifted `loop-introspect.js`'s hash; re-grounded and re-green.

## Pending (post-merge)

- `meta_state_resolve({id:"meta-260808T1614Z-loop-get-instruction-gate-verb-allowance-returns-unknown-hin", ...})` — HARD post-merge step (precondition: branch on main, per the 260808-1222 lesson). The resolution cites this plan: the `gate-verb-allowance` key + the injection-policy tier mechanism + the dedup.
- `runtime-state.jsonl` is excluded from the feature commit (only transient `gate-verb:node` allowance rows from this session's audit/verification runs).

## Notes / deviations

- Subagent quota was hit mid-Phase-3 (403 usage limit). Phases 1-2 were completed by delegated `fullstack-developer` agents; Phase 3's code work was already on disk when the agent failed, so the controller completed it inline (file-index re-ground + this report) with no rework — the dedup-invariant test was already green. Phase 4 (docs, audit, fallow triage, verification, ship) was done inline by the controller since subagent delegation remained unavailable.
- Cold-tier count is 17, not the phase text's "16" — the append-only invariant (adding a 17th discoverability row) necessarily grows the unfiltered cold tier. Documented in the Phase 1 report; consistent with the load-bearing invariants.