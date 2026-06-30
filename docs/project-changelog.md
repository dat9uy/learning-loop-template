# Project Changelog

## 2026-07-01 — Local Pre-Commit Parity: Fallow Gate + JSON Key-Path Anchors

**Change-log:** `meta-260701T0042Z-...` (consolidates 2 deferred findings from Phase E Plan 4)

### Changed

- **`tools/learning-loop-mastra/core/gate-logic.js:638-647`** — `stripEvidenceAnchor` now recognizes dotted JSON key-path suffixes (e.g., `package.json:simple-git-hooks.pre-commit`) in addition to the existing `#anchor` and `:digits` forms. Required-dot guard prevents misinterpreting version literals like `:1.0.0` as key paths.
- **`package.json:scripts.fallow:gate`** — new script wrapping `fallow audit --root tools/learning-loop-mastra --gate new-only` to mirror CI's Fallow PR gate locally.
- **`package.json:simple-git-hooks.pre-commit`** — chain extended to `pnpm test && pnpm fallow:gate` so dead code / high CRAP / dupes are caught before push (CI-only failure mode closed; PR #25 refactor round-trip class of bug prevented).

### Tests

- **`tools/learning-loop-mastra/__tests__/legacy-mcp/strip-evidence-anchor.test.js`** — 4 new tests covering key-path suffix, Windows path, mixed colon/dot conservative skip, and bare-key preservation.

### Resolved

- `meta-260701T0032Z-stripevidenceanchor-in-tools-learning-loop-mastra-core-gate` — superseded.
- `meta-260701T0009Z-ci-s-fallow-pr-gate-fallow-audit-gate-new-only-threshold-cra` — superseded.

## 2026-06-25 — Runtime Interface Contract (Phase E Plan 2)

**Plan:** Phase E Plan 2 (interface spec)

### Added

- **`tools/learning-loop-mastra/interface/`** — New Layer 3 directory containing the explicit runtime-to-loop contract:
  - `README.md` — overview of the interface layer and its relationship to the 3-layer architecture.
  - `CONTRACT.md` — the 5 requirements a runtime MUST satisfy: `hook-shim-set`, `mcp-client-config`, `skill-spec`, `identity-marker` (advisory), `settings-integration`.
  - `contract.js` — read-only validator. Run as `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`.
  - `RUNTIME_ONBOARDING.md` — step-by-step guide for adding a new runtime (worked example: Mastra Code).
  - `__tests__/contract.test.js` — 25-test contract validation suite (24 ship + 1 empty-file regression guard added in code review follow-up).
- **`tools/learning-loop-mastra/__tests__/interface/`** — 5 regression-guard test files (21 tests) for the interface layer.
- **`tools/scripts/run-pnpm-test-namespaced.mjs`** — 2 new GLOB entries for the interface test namespace.
- **Baseline capture script and report** for the interface layer.

### Changed

- **`.claude/skills/learning-loop/SKILL.md`** and **`.factory/skills/learning-loop/SKILL.md`** — E.0 update: added Runtime contract section and rewritten References section.
- **`docs/system-architecture.md`** — added 3-layer architecture section documenting Core / Mastra shell / Runtime interface layers.

## 2026-06-21 — MCP stdio SDK Conversion + Test Deadlock Fix (GH-2246)

**Plan:** `plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/`

### Changed

- **5 test files** — replaced hand-rolled MCP stdio/JSON-RPC clients with the official `@modelcontextprotocol/sdk Client` via the shared `with-mcp-server.js` helper:
  - `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`
  - `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`
  - `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js`
  - `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`
- **1 Droid hook** — `.factory/hooks/loop-surface-inject.cjs` now uses the SDK `Client` with `StdioClientTransport` instead of a hand-rolled parser.
- **`tools/learning-loop-mastra/__tests__/with-mcp-server.js`** — spawned test servers default to `MASTRA_STORAGE_DRIVER=memory`; callers can override via the optional `env` parameter.
- **`tools/learning-loop-mastra/__tests__/storage-parity.test.cjs`** — passes `MASTRA_STORAGE_DRIVER=libsql` to the helper so cross-process persistence tests keep working.
- **`tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs`** — relaxed stale tool-count assertion to account for workflow tools surfaced by the server.
- **`package.json`** — `test` script now includes `--test-timeout=30000` so future hangs fail fast instead of blocking pre-commit.

### Resolved

- `meta-260621T1743Z` — root cause corrected to "hand-rolled stdio parsers could not handle server stdout log lines / missing `notifications/initialized`"; `evidence_test` path corrected to `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`; status resolved.

### Acceptance

- `pnpm test`: **1114 pass / 0 fail / 1 skipped** across all test namespaces.
- Zero hand-rolled MCP stdio/JSON-RPC clients remain in tests or production hooks.

## 2026-06-18 — Coerce Layer Zod-Native Migration (GH-0029)

**Plan:** `plans/260618-0029-coerce-layer-zod-native-migration/`

### Added

- **`tools/learning-loop-mcp/core/envelope-stripper.js`** — `stripEnvelope` helper (undefined-safe). Strips `{item: ...}` MCP SDK envelopes before Zod parse. Used by 17 array + 3 object fields across 12 tools.
- **`tools/learning-loop-mcp/core/strict-boolean-guard.js`** — explicit semantic guards for 5 HIGH/CRITICAL boolean fields (`meta_state_sweep.apply`, `meta_state_archive.confirm`, `meta_state_promote_rule.preview`, `meta_state_check_grounding.run_tests`, `meta_state_derive_status.run_tests`). Locks `true`/`"true"` semantics; all other strings → `false`.
- **5 new test files**:
  - `tools/learning-loop-mcp/__tests__/zod-coerce-boolean-string.test.js`
  - `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js` (retains 1 stdio smoke gate)
  - `tools/learning-loop-mcp/__tests__/zod-optional-coerce.test.js`
  - `tools/learning-loop-mcp/__tests__/zod-union-envelope.test.js`
  - `tools/learning-loop-mcp/__tests__/boolean-semantic-guards.test.js` (locks 5 guarded fields)
- **`tools/learning-loop-mastra/__tests__/coerce-correctness.test.js`** — renamed + rewritten from `parity-zod-to-json-schema.test.js`. Single-server regression net with direct zod calls (no `coerceParams` import).

### Changed

- **40 tool inputSchemas** in `tools/learning-loop-mcp/tools/*.js` migrated to zod-native coercion:
  - 13 boolean fields → `z.coerce.boolean()` (12) or semantic guard (5 HIGH/CRITICAL).
  - 10 number fields → `z.coerce.number()`.
  - 17 envelope-bearing array fields → `z.preprocess(stripEnvelope, z.array(...))`.
  - 3 envelope-bearing object fields → `z.preprocess(stripEnvelope, z.object({...}))`.
- **`tools/learning-loop-mastra/mastra/create-loop-tool.js`** — collapsed from 146-line imperative factory to ~10-line `createTool` re-export. Deleted `coerceScalar`, `unwrapItem`, `coerceShape`, `wrapSchema`, `coerceParams`.
- **`tools/learning-loop-mastra/mastra/schema-parity.js`** — description preservation fixed (code-review finding). `z.toJSONSchema` parity harness now emits identical JSON Schema for all 39 registered tools.

### Removed

- **`tools/learning-loop-mcp/core/wire-format-coercion.js`** — deleted (183 lines). Legacy lifted helper superseded by zod-native primitives.
- **`tools/learning-loop-mastra/__tests__/parity-harness.js`** + **`parity-harness.test.js`** — deleted (191 lines + self-test). Dead post-Plan 3; zero callers.
- **4 mastra-side wire-format test files** — deleted as duplicates (mcp-side tests are canonical post-Plan 3).
- **4 mcp-side `wire-format-*.test.js` files** — renamed to `zod-coerce-*.test.js` / `zod-union-envelope.test.js`.
- **`tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js`** — renamed to `coerce-correctness.test.js`.

### Acceptance

- `pnpm test`: **1067 pass / 0 fail / 1 skip** across all test namespaces.
- JSON Schema parity harness: **0 mismatches across 39 registered tools**.
- Code review: passed after fixing description preservation in `schema-parity.js`.
- SP2 grounding: fingerprint recorded on `create-loop-tool.js` post-migration.

### Unblocks

- Phase D productization (coerce-layer debt cleared; no legacy imperative walkers remain).

---

**Plan:** `plans/260617-2352-GH-1607-plan-3-post-merge-followups/`

### Removed

- **`tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js`** — deleted. The in-process reload tool targeted legacy `@modelcontextprotocol/sdk` internals (`_registeredTools`, `setToolRequestHandlers`, `sendToolListChanged`) with no analog in Mastra's `MCPServer` SDK. Even with a `globalThis.__loopMcpServer` binding, the body could not work.
- **`tools/learning-loop-mcp/core/mcp-server-reload.js`** — deleted. Became dead code after the reload tool was removed.
- **`tools/learning-loop-mcp/__tests__/meta-state-refresh-tools-tool.test.js`** — deleted alongside the tool.

### Changed

- **`tools/learning-loop-mastra/tools/manifest.json`** — `meta-state-refresh-tools-tool` entry removed (40 → 39 tools).
- **`tools/learning-loop-mastra/agent-manifest.json`** — `mastra_meta_state_refresh_tools` removed from `meta_state.tools` array (20 → 19 entries).
- **`tools/learning-loop-mcp/tools/manifest.json` + `tools/learning-loop-mcp/agent-manifest.json`** — same removal applied to legacy manifests.
- **`docs/mcp-server-restart-protocol.md`** — rewritten as a restart-only protocol. Operator hot-reload uses `pnpm gate:server` (~1s restart cost) instead of in-process reload.

### Resolved

- `meta-260617T2356Z-pr-4-plan-3-cut-over-shipped-meta-state-refresh-tools-to-the` — tool deleted; restart is the canonical path.
- `meta-260617T2356Z-f4-meta-260616t2123z-the-learning-loop-mastra-peer-mcp-serve` — F4 `evidence_code_ref` patched to `tools/learning-loop-mastra/mastra/server.js:13` (the `PREFIX` line).
- `meta-260617T2357Z-master-tracker-c7-line-193-lists-groups-as-coordination-meta` — tracker C7 line 193 patched to canonical 5-group enumeration matching `agent-manifest.json`.
- `meta-260617T2357Z-tools-learning-loop-mastra-tests-connect-mcp-server-mutex-te` — mutex test comment patched to reflect actual assertion strength (non-regression check, not strict ordering).

## 2026-06-17 — Phase C Plan 3: Operational Cut-Over (C6 + C7)

**Plan:** `plans/260617-1950-phase-c-plan-3-cut-over/`
**Closeout report:** `plans/260617-1950-phase-c-plan-3-cut-over/reports/closeout-report.md`

### Added

- **`tools/learning-loop-mcp/core/wire-format-coercion.js`** — runtime-agnostic coercion helpers for MCP wire-format values (string↔boolean, string↔number, JSON blob parsing). Used by the canonical server to normalize incoming tool arguments before validation.
- **`tools/learning-loop-mcp/core/mcp-server-reload.js`** — in-process reload helpers for the canonical MCP server: `reloadMcpServer()` and `reloadIfNeeded()` with version-gate checks, enabling hot-reload without process restart during development.

### Changed

- **`tools/learning-loop-mastra/mastra/server.js`** — promoted from peer/secondary to **canonical MCP server**. Now the single source of truth for all MCP tool registrations. All 40 deterministic tools are `mastra_`-prefixed and live in 5 manifest groups (`coordination`, `meta_state`, `runtime_state`, `gate`, `introspection`).
- **`.mcp.json` / `.factory/mcp.json`** — reduced to a single `learning-loop-mastra` server entry. Legacy `learning-loop-mcp` server entry removed.
- **`package.json`** — `gate:server` script now points to `tools/learning-loop-mastra/mastra/server.js` (was `tools/learning-loop-mcp/server.js`).
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

- **`tools/learning-loop-mastra/mastra/schemas.js`** — added Plan 3 cut-over header comment (M-C1).
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
