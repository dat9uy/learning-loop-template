---
phase: 1
title: "Bound-artifact detection set + change_target canonicalizer"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Bound-artifact detection set + change_target canonicalizer

## Overview

Land the two pure-logic prerequisites the gap builder (phase 3) joins against: (a) the Rec 12 **detection** set `CHANGE_LOG_BOUND_PATHS` — the path prefixes whose edits should trigger a change-log — and (b) a pure `canonicalizeChangeTarget(entry)` that turns a change-log entry's free-text `change_target` + `applies_to.schemas` into a repo-relative path/directory set, robust against three real-registry patterns (red-team C1/C2/C3): `#anchor` suffixes, the `mcp`→`mastra` rename, and bare loop-internal schemas. Both live in a new `core/change-log-bound-paths.js` sibling of `bound-artifacts.js` — `bound-artifacts.js` stays gate-only.

## Requirements

- Functional:
  - `CHANGE_LOG_BOUND_PATHS` is a frozen array of repo-relative glob prefixes covering the Rec 12 bound set: `docs/**`, `tools/learning-loop-mastra/core/**`, `tools/learning-loop-mastra/tools/**`, `tools/learning-loop-mastra/hooks/**`, `schemas/**`, `AGENTS.md`, `CONTRACT.md`, and the skills mirrors `.claude/skills/**`, `.factory/skills/**`, `.mastracode/skills/**`.
  - `canonicalizeChangeTarget(entry)` returns a `Set<string>` of repo-relative paths/dirs. Per token (from `change_target` split on `\s*\+\s*` and from `applies_to?.schemas` array): (1) strip `#.*` anchor suffix; (2) normalize `learning-loop-mcp` → `learning-loop-mastra`; (3) repo-relativeize: if the token starts with a loop-internal subdir (`core/`|`tools/`|`hooks/`|`mastra/`) without the `tools/learning-loop-mastra/` package prefix, prepend that prefix; (4) keep the token iff it contains `/` OR exactly matches a top-level allowlist (`AGENTS.md`, `CONTRACT.md`) — otherwise drop as non-path (red-team M5: bare `*.js`/`*.json` without `/` are dropped). Preserve trailing `/` (directory marker). Merge `applies_to.schemas` through the same pipeline.
- Non-functional: new data-only-ish module `core/change-log-bound-paths.js` (logic allowed — this is NOT `bound-artifacts.js`, whose FCIS is `@mastra/*`-imports-only); no `@mastra/*` imports; pure function (no I/O); deterministic.

## Architecture

New module `core/change-log-bound-paths.js` (ESM). Exports: `CHANGE_LOG_BOUND_PATHS` (frozen array) + `canonicalizeChangeTarget(entry)` + (optionally) `isBoundPath(p)` predicate used by phase 3. It may import `globMatch` from `./gate-logic.js` for the bound-path predicate (same as `bound-artifacts.js` does — permitted). It does NOT import `bound-artifacts.js` (detection is independent of the gate set).

Why a sibling, not co-located (red-team M2/UQ3): `bound-artifacts.js` is the write-gate constant (its FCIS test `bound-artifacts.test.js` enforces no-`@mastra/*`-imports, NOT "data-only" — it already imports `globMatch`). The Rec 12 detection set is a different concept (which edits *should be logged*) from the gate set (which writes *are blocked*). Co-locating detection logic + a Rec 12 concept there blurs the boundary; a sibling keeps each module single-purpose.

`bound-artifacts.js` is NOT modified in this phase — `BOUND_ARTIFACTS` + its pinned-order test stay unchanged.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/change-log-bound-paths.js`.
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-bound-paths.test.js` — TDD, fixtures drawn from REAL registry entries.
- Verify-only: `tools/learning-loop-mastra/__tests__/legacy-mcp/bound-artifacts.test.js` — confirm unchanged (not run in this phase unless touched; it isn't).

## Implementation Steps (TDD)

1. **Test first.** Create `change-log-bound-paths.test.js`:
   - Assert `CHANGE_LOG_BOUND_PATHS` is a frozen array containing the Rec 12 prefixes (exact set).
   - `canonicalizeChangeTarget` cases — draw from REAL `meta-state.jsonl` entries:
     - single path: `{change_target:"docs/loop-engine.md"}` → `Set(["docs/loop-engine.md"])`.
     - **anchor suffix (C1):** `{change_target:"tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules"}` → `Set(["tools/learning-loop-mastra/core/gate-logic.js"])`.
     - **pre-rename (C2):** `{change_target:"tools/learning-loop-mcp/core/meta-state.js"}` → `Set(["tools/learning-loop-mastra/core/meta-state.js"])`.
     - compound: `{change_target:"tools/learning-loop-mcp/agent-manifest.json + AGENTS.md + meta-state.jsonl + core/loop-introspect.js"}` → `Set(["tools/learning-loop-mastra/agent-manifest.json","AGENTS.md","tools/learning-loop-mastra/core/loop-introspect.js"])` (`meta-state.jsonl` bare → dropped per M5; `agent-manifest.json` under `mcp` → normalized + prefixed... actually `tools/learning-loop-mcp/agent-manifest.json` has `/` → kept + normalized to `tools/learning-loop-mastra/agent-manifest.json`).
     - directory: `{change_target:"docs/"}` → `Set(["docs/"])`.
     - non-path: `{change_target:"meta-state-finding-categories"}` → `Set([])`.
     - **bare schemas (C3):** `{change_target:"<non-path>", applies_to:{schemas:["core/meta-state.js"]}}` → `Set(["tools/learning-loop-mastra/core/meta-state.js"])`.
     - **repo-relative schemas pass-through:** `{applies_to:{schemas:["docs/loop-engine.md","AGENTS.md"]}}` → `Set(["docs/loop-engine.md","AGENTS.md"])` (already repo-relative / top-level).
     - **bare `*.js` without `/` dropped (M5):** `{change_target:"meta-state.js"}` → `Set([])`.
     - missing both → `Set([])`.
2. **Implement** `core/change-log-bound-paths.js` per the architecture + the 4-step canonicalization pipeline.
3. **Run** `pnpm test` legacy-mcp namespace; confirm green. Confirm `bound-artifacts.test.js` still green (untouched file).

## Success Criteria

- [ ] `CHANGE_LOG_BOUND_PATHS` exported, frozen, covers the Rec 12 set exactly.
- [ ] `bound-artifacts.js` + its pinned-order test unchanged (green).
- [ ] `canonicalizeChangeTarget` passes all 10+ real-registry fixture cases (anchor, rename, bare schemas, compound, directory, non-path, bare-`*.js`-dropped).
- [ ] `change-log-bound-paths.test.js` green; no `@mastra/*` import in the new module.
- [ ] No regression in `bound-artifacts.test.js`.

## Risk Assessment

Low. New module + pure function; the only regression surface is correctness of the canonicalizer, pinned by real-registry fixtures (not synthetic). The C1/C2/C3 patterns are empirically verified (red-team sampled 167 entries). Mitigation: fixtures mirror real entries; the 4-step pipeline is pinned case-by-case. Rollback: delete the new module + test; phase 3 import breaks (revert phase 3 too).