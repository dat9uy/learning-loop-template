---
phase: 6
title: "Verify full suite + 4-gate smoke + runtime-agnostic audit"
status: pending
priority: P1
dependencies: [3, 4, 5]
---

# Phase 6: Verify full suite + 4-gate smoke + runtime-agnostic audit

## Overview

Whole-change verification. Red-team hardened: the residual-path grep is widened to the
repo root + `scripts/` + `file-index.jsonl`, excludes immutable history (`docs/journals/`,
`docs/_archive-260703/`), and runs a SECOND scoped grep over `__tests__/legacy-mcp/` (the
earlier `grep -v "__tests__/legacy-mcp/"` discarded whole files — the densest path-string
dir). Gate smoke covers **all 4** gate kinds (inbound + recurrence, not just bash+write).
Plus the `mcp-tools` non-zero count and a `file-index` drift check.

## Requirements

- Functional: every `plan.md` acceptance criterion met and demonstrated.
- Non-functional: verification driven through the real runtime surfaces (the gates actually
  fire), not just unit tests.

## Architecture

The rename could break three things at runtime: (1) the 4 coordination gates (fail-closed
— must resolve the new path), (2) the runtime-agnostic contract (universal-location +
byte-identical shims), (3) manifest tool-loading (`import(`../tools/handlers/${...}`)`
loads all tools). The residual-path grep is the hard assertion that no live `legacy/` path
ref remains — now correctly scoped so it can actually be satisfied.

## Related Code Files

- Verify (read-only unless a gap surfaces): `mastra/server.js`, the 12 coordination
  wrappers, `docs/loop-engine.md` (Rec 6 altitude), `baselines/fallow/*.json`,
  `file-index.jsonl`, `run-pnpm-test-namespaced.mjs` namespace counts.

## Implementation Steps

1. **Residual-path grep (the hard assertion) — widened + correctly scoped.** Run:
   ```bash
   grep -rn "tools/legacy\|hooks/legacy\|scout/legacy\|legacy-handler-adapter" \
     . --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" \
     --include="*.md" --include="*.jsonl" \
     | grep -v "node_modules/" \
     | grep -v "docs/journals/" | grep -v "docs/_archive-260703/" \
     | grep -v "gate-log.jsonl" | grep -v "meta-state.jsonl"
   ```
   This now covers repo root (`AGENTS.md`, `CLAUDE.md`), `scripts/`, `interface/`,
   `file-index.jsonl`, `baselines/`. Expected: **zero live path refs.** Survivors must be
   only conceptual "legacy" mentions (old enum statuses in `core/meta-state.js`,
   `core/loop-introspect.js` status-history comments, `core/README.md` "legacy outbound
   compat") — review each as conceptual-not-path. Fix any path survivor (a Phase-2 miss).
2. **Second scoped grep over `__tests__/legacy-mcp/`** (the dir the first grep's filepath
   filtering would hide, red-team Finding). Assert it has no `tools/legacy|hooks/legacy|
   scout/legacy|legacy-handler-adapter` path strings — only the bare `legacy-mcp` dir-name
   token is allowed:
   ```bash
   grep -rn "tools/legacy\|hooks/legacy\|scout/legacy\|legacy-handler-adapter" \
     tools/learning-loop-mastra/__tests__/legacy-mcp/
   ```
   Expected: zero hits (the dir name `legacy-mcp` itself is out of scope and unmatched by
   these patterns).
3. **Full suite + per-namespace counts.** `pnpm test` (namespaced runner). Confirm green
   at ≥ Phase-1 baseline AND the `mcp-tools` namespace `tests N` is non-zero (vacuous-green
   guard).
4. **4-gate smoke (runtime no-op).** For each of the 4 wrappers across runtimes, a direct
   sample-stdin invocation exits 0 (no ENOENT) — already confirmed in Phase 3 step 4;
   re-confirm post-commit. Plus the live bash + write gates evaluate on a benign command/
   edit. (Negative-case smoke is dropped — red-team Finding 10: a `git mv` cannot flip
   fail-closed→fail-open; it tests a pre-existing property, not this change. Positive
   resolution of all 4 gates is the rename-specific property that matters.)
5. **Runtime-agnostic audit.** `check_runtime_agnostic` MCP tool (or
   `__tests__/legacy-mcp/runtime-agnostic.test.js`) — `core-in-universal-location` +
   `shims-in-sync` (12 wrappers byte-identical across runtimes) pass. Add the assertion
   that each wrapper's line-13 path **exists on disk** (red-team: `shims-in-sync` checks
   byte-identity, not path-correctness).
6. **Manifest arithmetic.** The 42→44 tool surface loads via `../tools/handlers/`; every
   manifest entry resolves to a non-empty export.
7. **file-index drift check.** `meta_state_query_drift` reports zero false drifts (the 14
   stale keys were refreshed in Phase 4).
8. **Rec 6 altitude re-check.** Re-read the new `loop-engine.md` paragraph — names stores
   + roles, points to L2/L3, no mechanism vocabulary.
9. **Rec 12 change-log.** Record via `meta_state_log_change`: `change_dimension: mechanical`,
   `change_target: tools/learning-loop-mastra/{tools/handlers,hooks/universal,scout/pipeline}/ + mastra/handler-adapter.js`,
   `change_diff.added: [new paths]`, `change_diff.removed: [legacy/ paths]`,
   `reason: "Rec 5 — rename live legacy/ dirs to descriptive canonical names so legacy/ is reserved for dead code; UQ4 Option A. Rec 6 L1 memory-substrate paragraph bundled."`
   (If the Rec 6 L1 edit was not logged in Phase 5, log it here.) Note the fallow baseline
   regen mechanism in the entry.

## Success Criteria

- [ ] Widened residual-path grep returns zero live path refs (survivors reviewed as conceptual).
- [ ] Second scoped grep over `__tests__/legacy-mcp/` returns zero path-string hits.
- [ ] Full suite green at ≥ Phase-1 baseline; `mcp-tools` namespace non-zero.
- [ ] All 4 gate kinds resolve the new path (direct invocation exit 0); live bash+write gates evaluate.
- [ ] `check_runtime_agnostic` green; each wrapper's line-13 path exists on disk (not just byte-identical).
- [ ] `manifest-arithmetic` green (44 tools load via `tools/handlers/`).
- [ ] `meta_state_query_drift` reports zero false drifts (file-index refreshed).
- [ ] Rec 6 paragraph altitude-verified.
- [ ] `meta_state_log_change` recorded (rename + L1 edit + baseline-regen mechanism).

## Risk Assessment

- **Risk:** a gate silently fail-open (resolves but does not enforce). **Mitigation:**
  dropped the negative-case smoke per red-team (a `git mv` can't flip enforcement); if a
  reviewer wants belt-and-suspenders, a one-line negative check can be re-added — but it
  tests a pre-existing property, not this change. The 4-gate positive resolution is the
  load-bearing check.
- **Risk:** a cross-runtime gate left stale (e.g. `.mastracode` not updated). **Mitigation:**
  step 5 `shims-in-sync` + the line-13-exists assertion; the runtime-agnostic test
  enforces byte-identity + the grep enforces no `hooks/legacy/` survives anywhere.