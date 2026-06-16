# Project Changelog

## 2026-06-15 — Step 4: Runtime-Agnostic Rule Closure + Helper Extensions

**Plan:** `plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/`
**Change-log:** `meta-260615T2236Z-tools-learning-loop-mcp-agent-manifest-json-agents-md-meta-s`

### Added

- **3 new cross-surface helpers in `core/surfaces.js`:**
  - `appendToAllSurfaces(root, subpath, line)` — true append semantics across all surfaces; creates parent directories; best-effort per surface with PII-safe error logging.
  - `readJsonlFromAllSurfaces(root, subpath, options)` — reads JSONL from all surfaces with dedup (by `ts::command_prefix::rule_id::decision`), optional `since` filtering, and `asc` sorting.
  - `readModifyWriteOnAllSurfaces(root, subpath, modifier, options)` — per-surface read-modify-write with caller-supplied modifier function; supports atomic write-temp+rename per surface and optional `removeOnNull` deletion.

- **Shared runtime-agnostic checklist** (`core/runtime-agnostic-checklist.js`) — 6-item checklist shared between the regression test and the `check_runtime_agnostic` MCP tool. Each item has an `id`, `description`, and `verify(featurePath, root)` function returning structured pass/fail with `fix_suggestion`.

- **Regression test** (`__tests__/runtime-agnostic.test.js`) — 11 tests covering: checklist structure, all 7 exported helpers from `surfaces.js`, `SURFACES` frozen + canonical contents, helper signature stability, no hand-rolled `for-of-SURFACES` loops in `core/`, no hard-coded `join(root, ".claude"|".factory")` in `core/`, coordination-path imports from `surfaces.js`, shim parity between `.claude/` and `.factory/`, manifest group structure, protocol-adapter exports, and `GLOB_SCOPE_WHITELIST` parameterized via `SURFACES.map`.

- **`consult-checklist` pattern type** — new gate pattern type in `core/gate-logic.js#applyPromotedRules`. No-op at command-check time; used by `check_runtime_agnostic` to verify compliance against the checklist. First instance of a pattern type that delegates verification to an external checklist rather than inline regex.

- **`check_runtime_agnostic` MCP tool** — audits any file or directory against the 6-item checklist. Returns `{ feature_path, items_checked, items_passed, items_failed, failures[] }` with per-failure `expected`, `found`, and `fix_suggestion`. Registered in `agent-manifest.json` under the `runtime_agnostic` group.

- **`rule-runtime-agnostic-features` meta-state rule** — promoted finding `meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n` to a `rule` entry. Enforcement class: `agent` (consult). Pattern: every feature must use the shim-not-fork pattern + cross-surface iteration via `core/surfaces.js` helpers.

### Changed

- **`gate-decision-log.js`** — refactored to use `appendToAllSurfaces` for decision log writes and `readJsonlFromAllSurfaces` for decision log reads (replacing hand-rolled per-surface loops). The `appendDecisionLog` function now delegates to the helper; `readDecisionLog` uses dedup + sort via the helper.

- **`gate-override.js`** — refactored to use `readModifyWriteOnAllSurfaces` for override marker writes (replacing hand-rolled per-surface read-modify-write) and `readFromAllSurfaces` for reads. The cache invalidation logic is preserved; the cross-surface iteration is now delegated to the helper.

- **`AGENTS.md` §2** — added "Runtime-Agnostic Pattern (rule-runtime-agnostic-features)" subsection documenting the shim-not-fork pattern, the 7 `core/surfaces.js` helpers, and the `check_runtime_agnostic` audit tool. Updated MCP tool count from 56 to 36 (verified 2026-06-15).

- **`agent-manifest.json`** — added `runtime_agnostic` group with `check_runtime_agnostic` tool. Added `runtime_state_record` to `gate` group and `runtime_state_read` to `introspection` group (shipped in prior steps; now reflected in manifest).

### Planning-Order Status

All 4 steps of the planning-order sequence are now closed:

| Step | Source | Status | Shipped at |
|------|--------|--------|------------|
| 1 | Report 2 P0-1 (helper + 2 refactors) | shipped | 2026-06-15 |
| 2 | Report 1 P1 (stderr + override + log + recurrence) | shipped | 2026-06-15 |
| 3 | Report 1 P2 (node -e strip) | shipped | 2026-06-15 |
| 4 | Report 2 P2-5 (test + pattern type + tool + rule) | shipped | 2026-06-15 |

See `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` for the full dependency matrix and problem-solving techniques that justified the order.
