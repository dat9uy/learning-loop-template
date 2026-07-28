# Universal Hooks Unification

**Date**: 2026-07-28 08:06
**Scope**: `tools/learning-loop-mastra/hooks/universal/` + per-runtime wiring across `.claude`, `.factory`, `.mastracode`
**Status**: Shipped. Parity drift is now detectable; the next universal hook has a documented adoption path.

## Outcome

The 4 coexisting universal-hook wiring patterns (shim, direct, adapter, none) across 3 runtimes are now declared in a single source of truth. Drift that previously hid behind green tests is detectable. `shims-in-sync` no longer false-greens on dead shims, and the adoption path for adding a new universal hook is documented and tested.

For operators: a new universal hook cannot ship without a manifest entry; a manifest entry cannot be removed without a change-log entry; a manifest-declared shim missing on all surfaces fails the parity check loudly.

## Mechanism

### The manifest

`hooks-lock.json` at repo root declares 6 universal hooks plus per-runtime wiring. Sibling of `skills-lock.json`. Per-hook entry: `id`, `description`, `surfaces[]` (each with `kind: shim|direct|adapter|none` and `path`).

The path is listed in `CHANGE_LOG_BOUND_PATHS` so manifest edits trigger `meta_state_log_change` — a low-cost guard against silent drift.

### The 4 wiring kinds

| kind | role |
|------|------|
| `shim` | surface-local `*.cjs` imports the universal hook by name (current model for most surfaces) |
| `direct` | surface reads the universal hook path directly (the goal state for new hooks) |
| `adapter` | surface-local file adapts a different surface's protocol (SessionStart `"startup"` matcher in `.claude`) |
| `none` | surface does not wire this hook (declared, not inferred) |

The manifest is the single declaration; the test surface verifies each surface reads the manifest, not its sibling surfaces.

### Test surface

- `hooks-lock-manifest.test.js` (8 tests) — shape, validity, and cross-validation against `tools/learning-loop-mastra/hooks/universal/`. A new universal hook without a manifest entry is detected.
- `hooks-wiring-parity.test.js` (24 tests) — `loadRuntimeHooks(surface)` resolves 3 runtime config shapes (`.claude` nested; `.factory` two-file merge; `.mastracode` flat); env-token canonicalization; array-matcher cardinality for `.mastracode` write-gate's 3 distinct wires; SessionStart adapter `"startup"` matcher.

### Manifest-aware `shims-in-sync`

`core/runtime-agnostic-checklist.js` gains `loadHooksManifest`, `shimNameToHookKey`, `shimSurfacesForHook`, `manifestDeclaredShimNames`. The parity set is restricted to surfaces the manifest declares `kind:"shim"` for. 4 existing shim tests rewritten, 4 new added (positive + 2 reviewer regressions). 4 dead `.mastracode/coordination/hooks/*.cjs` shims deleted.

## Decisions worth remembering

1. **Manifest as sibling, not part of `skills-lock.json`.** Hooks and skills have different lifecycles, validation rules, and trust anchors. Keeping them separate preserves the option to evolve each independently.

2. **4 kinds are exhaustive for current state.** shim/direct/adapter/none covers every observed wiring. Adding a 5th requires updating the manifest schema, the parity test, and `docs/architecture.md` — the manifest makes that coupling explicit.

3. **Manifest edits go through change-log.** A `hooks-lock.json` change without a `meta_state_log_change` entry is a trust violation. The path addition to `CHANGE_LOG_BOUND_PATHS` is cheap insurance.

4. **Parity is relative to declared `kind:"shim"`.** A surface that legitimately uses `kind:"direct"` does not get a shim parity failure when the universal hook is missing — that is the manifest's declaration. This kills a class of false negatives where the old shim-only check would pass on a surface that should not have had a shim at all.

5. **`loadRuntimeHooks` handles 3 config shapes, not 1.** The runtime configs (`.claude/settings.json` nested; `.factory/settings.json` + `.factory/hooks.json` two-file merge; `.mcp.json` flat) are not converging soon. Centralizing the loader in the test means changes to one shape do not silently break another.

6. **Array-matcher cardinality for `.mastracode` write-gate.** That surface registers 3 distinct wires via array matchers (PreToolUse, PostToolUse, etc.). The test counts, not just membership, so a deleted wire is caught.

7. **SessionStart adapter `"startup"` matcher.** The adapter is not a generic shim — it rewrites the matcher string from the universal hook's default to `"startup"`. The test asserts the rewritten matcher, not just the resolved path. A reviewer caught a near-miss where the test would have passed on the universal hook's default matcher.

8. **Dead shim removal is part of unification, not cleanup.** Once the manifest declares a surface as `kind:"direct"`, the old `*.cjs` shim has no role. Leaving it in place lets the parity check pass on a still-aliased import — that is the false-green this work set out to fix.

9. **HIGH-severity false-green: union declared-shim set into parity iteration.** The first cut of manifest-aware `shims-in-sync` used `manifestDeclaredShimNames` to filter the parity set, but a manifest-declared shim that was missing on ALL surfaces returned `{ok:true}` because the iteration had nothing to check. Unioning the declared set into the iteration inverts the direction: if the manifest says this shim should exist, the check verifies it does — and if it does not, the check fails loudly. Two regression tests pin this.

10. **Empty declared-shim set skips the check.** A future state where no surface uses `kind:"shim"` is not an error; the check is a no-op. The original draft fell back to "all SHIM_DIRS" — that re-introduced the old false-green by reverting to pre-manifest behavior. Empty means empty.

## Test gate

`pnpm test` → 284 files / 2615 passed / 1 skipped.

The pre-existing skip is unrelated to this work.

## Open follow-ups

None for this scope. The adoption path is documented in `docs/architecture.md`; new universal hooks now have a clear wiring decision and a parity check from day one.

## Traceability

Closed finding `meta-260726T1858Z-universal-hooks-unification-is-half-shipped-tools-learning-l` via the standard `meta_state_log_change` → `meta_state_derive_status` → `meta_state_resolve` flow. Implementation rec: `meta-260728T0752Z-hooks-lock-json`.
