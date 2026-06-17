# Project Changelog

## 2026-06-17 — Phase C Plan 3: Operational Cut-Over (C6 + C7)

**Plan:** `plans/260617-1950-phase-c-plan-3-cut-over/`
**Closeout report:** `plans/260617-1950-phase-c-plan-3-cut-over/reports/closeout-report.md`

### Added

- **`tools/learning-loop-mcp/core/wire-format-coercion.js`** — runtime-agnostic coercion helpers for MCP wire-format values (string↔boolean, string↔number, JSON blob parsing). Used by the canonical server to normalize incoming tool arguments before validation.
- **`tools/learning-loop-mcp/core/mcp-server-reload.js`** — in-process reload helpers for the canonical MCP server: `reloadMcpServer()` and `reloadIfNeeded()` with version-gate checks, enabling hot-reload without process restart during development.

### Changed

- **`tools/learning-loop-mastra/server.js`** — promoted from peer/secondary to **canonical MCP server**. Now the single source of truth for all MCP tool registrations. All 40 deterministic tools are `mastra_`-prefixed and live in 5 manifest groups (`coordination`, `meta_state`, `runtime_state`, `gate`, `introspection`).
- **`.mcp.json` / `.factory/mcp.json`** — reduced to a single `learning-loop-mastra` server entry. Legacy `learning-loop-mcp` server entry removed.
- **`package.json`** — `gate:server` script now points to `tools/learning-loop-mastra/server.js` (was `tools/learning-loop-mcp/server.js`).
- **SessionStart hook** — updated to key on `mcpServers["learning-loop-mastra"]` and tool `mastra_loop_describe` for server discovery and capability probing.
- **`agent-manifest.json`** — 5 groups, 40 `mastra_`-prefixed deterministic tools. All legacy non-deterministic tools removed from the canonical surface.

### Removed

- **`tools/learning-loop-mcp/server.js`** — deleted. The legacy standalone MCP server is no longer maintained; all server logic lives in the Mastra-based canonical server.
- **`tools/learning-loop-mcp/tool-registry.js`** — deleted. Tool registration is now handled by the Mastra server via `agent-manifest.json` and `mastra-tools.js`.

### Resolved

- `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` — resolved structurally by deleting the peer-server bypass surface. The Mastra server is now the only server; there is no peer to bypass.

### Acceptance

- `pnpm test`: **1040 pass / 0 fail / 1 pre-existing skip** across all test namespaces.
- All 40 canonical tools respond to `tools/list` and `tools/call` via the Mastra server.
- Zero legacy server processes required for normal operation.

### Unblocks

- Phase D (productization beyond Mastra Phase 0-1).
- Future runtime-agnostic feature work can assume a single canonical server surface.

---

## 2026-06-17 — Phase C Plan 1a: Atomic Fix

**Plan:** `plans/260617-1138-phase-c-plan-1a-atomic-fix/`
**Closeout report:** `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md`

### Added

- **`consolidated_into_inverse` in `tools/learning-loop-mcp/core/loop-introspect.js`** — `buildInverseIndexes` now returns 6 inverse maps (was 5), enabling `meta_state_relationships` to expose `inbound.consolidated_by` for change-logs.
- **5 RED-first test files** across legacy and Mastra surfaces:
  - `tools/learning-loop-mcp/__tests__/meta-state-list-include-archived.test.js`
  - `tools/learning-loop-mcp/core/loop-introspect.test.js`
  - `tools/learning-loop-mcp/__tests__/meta-state-relationships-tool.test.js`
  - `tools/learning-loop-mcp/__tests__/package-json-zod-pin.test.js`
  - `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js`

### Changed

- **`tools/learning-loop-mcp/tools/meta-state-list-tool.js`** — `include_archived: true` now surfaces all terminal statuses (`superseded`, `resolved`, `auto-resolved`, `archived`) via a single flag.
- **`package.json`** — pinned `zod` to exact `4.4.3` to protect the parity gate's version-sensitive JSON-schema snapshot.
- **`tools/learning-loop-mastra/__tests__/with-mcp-server.js`** — added per-tempRoot Promise-chain mutex so `callTool`/`listTools` calls serialize when two MCP servers share a `GATE_ROOT`.
- **`plans/reports/productization-260612-1530-master-tracker.md`** — flipped Plan 1a checkbox to `[x]`.

### Resolved

- `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when`
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into`

### Acceptance

- `pnpm test`: **1069 pass / 0 fail / 1 pre-existing skip** across all 10 test namespaces.

### Unblocks

- Plan 1b (CR-3 to CR-6 hygiene).
- Plan 3 (C6+C7 cut-over).

---

## 2026-06-17 — Phase C Plan 2: Parity Gate (C4)

**Plan:** `plans/260616-2200-phase-c-plan-2-parity/`
**Closeout report:** `plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md`

### Added

- **Dual-server parity harness** in `tools/learning-loop-mastra/__tests__/parity-harness.js`:
  - `schemaJsonParity` — compares legacy and Mastra `inputSchema` values via `z.toJSONSchema({ target: "draft-7" })` after stripping spec-drift metadata (`$schema`, `title`, `additionalProperties`).
  - `toolsListParity` — compares legacy vs Mastra `tools/list` arrays for the migrated subset.
  - `toolsCallParity` — compares `tools/call` result payloads via `JSON.parse(content[0].text)` deep equality.
  - 6 invariant tests in `parity-harness.test.js` validate the helpers before any server spawn.

- **Dual-server MCP spawn helpers** in `tools/learning-loop-mastra/__tests__/with-mcp-server.js` and `with-both-mcp-servers.js`:
  - Shared temp `GATE_ROOT` so both `learning-loop-mcp` and `learning-loop-mastra` see the same registry.
  - In-flight promise mutex serializes cross-server calls to avoid interleaved registry writes.
  - Smoke tests verify both servers respond to `tools/list` and that legacy reports are visible to Mastra.

- **`parity-zod-to-json-schema.test.js`** — full structural parity test replacing the shape-only `parity-schema-shape.test.js`:
  - 29 schema parity tests (one per migrated deterministic tool).
  - 4 read-only `tools/call` content parity tests (`meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`).
  - 3 invariant probe tests (Draft 7 serialization, `additionalProperties` normalization, `z.preprocess` wrapper handling).

- **`mcp-protocol-e2e.test.cjs`** — parallel cold-session E2E for the Mastra server; mirrors the legacy E2E. Asserts initialize, 29 distinct tools, `tools/call loop_describe`, and `tools/call meta_state_list`.

- **`tools-list-collision.test.cjs`** — dual-server collision test asserting 40 legacy + 29 mastra = 69 distinct tool names, manifest-matched, no overlap, and `mastra_` prefix convention.

### Changed

- **`tools/learning-loop-mastra/schemas.js`** — added Plan 3 cut-over header comment (M-C1).
- **`plans/reports/productization-260612-1530-master-tracker.md`** — flipped C4 checkbox to `[x]` and updated last-updated line.
- **Plan 2 plan/phase files** — corrected test count math: 36 parity tests, 70 mastra-specific tests total; documented `gate_check` exclusion from content parity.

### Acceptance

- `pnpm test`: **1059 tests / 1058 pass / 0 fail / 1 pre-existing skip**.
- 9 legacy test namespaces pass.
- 69 distinct tools across both servers (40 legacy + 29 mastra) with zero collisions.

### Unblocks

- Plan 3 (C6+C7 cut-over).

---

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
