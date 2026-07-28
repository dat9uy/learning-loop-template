# Research: hooks-lock.json checklist integration, dead-shim reconciliation, Pattern C, docs

Scope: research only, no code changes. Feeds the hooks-unification plan. All claims cite file:line.

## 1. Checklist integration

### Mechanism facts
- `CHECKLIST` is an exported array (`core/runtime-agnostic-checklist.js:183`) shared between the regression test (`__tests__/legacy-mcp/runtime-agnostic.test.js:7`) and the `check_runtime_agnostic` MCP tool (confirmed at `docs/architecture.md:248`).
- Each item's `verify(featurePath, root)` returns `{ ok, expected?, found?, fix_suggestion? }` (`runtime-agnostic-checklist.js:165-182`).
- The regression test asserts `CHECKLIST.length === 6` (`runtime-agnostic.test.js:17`).
- The CHECKLIST is described as "REGEX-BASED ITEMS, best-effort" (`runtime-agnostic-checklist.js:168`), but it is NOT pure-regex: `shims-in-sync` reads+hashes files (`:207-240`), and `manifest-registered` reads + `JSON.parse`s `agent-manifest.json` (`:287-297`). **I/O in `verify()` is established precedent** — adding a check that reads runtime `settings.json`/`hooks.json` fits the signature.
- `shims-in-sync` already uses `buildShimMaps(root)` (`:152-160`, derived from `SHIM_DIRS` = `SURFACES.map(s => ${s}/coordination/hooks)` at `:14`) to enumerate shim filenames per surface — but it only checks **presence + byte-identity**, never that any shim is **wired** into a runtime config.
- `featurePath` is effectively ignored by `shims-in-sync` (it scans `SHIM_DIRS` regardless) — repo-global checks are precedent.

### Recommendation: (a) NEW CHECKLIST item `hooks-wiring-coverage`

Rationale (ranked):
1. **Visibility is the point of the finding.** The loop-anti-pattern finding says "drift invisible." A standalone vitest only runs in CI; a CHECKLIST item also surfaces in `check_runtime_agnostic` MCP tool, so an operator/auditor can call it before shipping. This is the same argument that put `shims-in-sync` in the CHECKLIST rather than leaving it as a standalone test.
2. **Reuses existing helper.** `buildShimMaps` already enumerates per-surface shim files; a wiring check adds a cross-reference against `hooks-lock.json` (manifest declares per-surface wiring kind) + each runtime's `settings.json`/`hooks.json` (actual wiring). Net new code is small.
3. **I/O in `verify()` is precedent** (`manifest-registered` reads+parses JSON; `shims-in-sync` hashes files). Reading `settings.json`/`hooks.json` is the same shape.
4. **Cost is one line.** Bumping `runtime-agnostic.test.js:17` from 6 → 7 is trivial.

Trade-offs / risks:
- **MCP surface change.** Adding the item changes the `check_runtime_agnostic` tool's output surface. Acceptable: the tool returns a list of item results, so adding an item is additive, not a contract break. Document the new item in `docs/architecture.md:248` (the existing checklist enumeration).
- **Feature-scoping mismatch.** `verify(featurePath, root)` is feature-scoped, but wiring-coverage is repo-global. Precedent (`shims-in-sync`, `manifest-registered`) already ignores `featurePath`. Acceptable.
- **Why NOT (b) extend `shims-in-sync`:** conflates two concerns (file byte-identity vs runtime wiring). `shims-in-sync` is shim-only; wiring-coverage spans all wiring kinds (shim/direct/adapter). Stretching it muddies the item and makes failures unreadable.
- **Why NOT (c) standalone vitest only:** matches the `skills-mirror-parity.test.js` model, but loses MCP audit visibility. The finding explicitly flags invisibility — standalone-only re-creates it.

Item shape (for the plan): `id: "hooks-wiring-coverage"`; `verify` reads `hooks-lock.json` (the new manifest) + each surface's declared wiring kind; for each hook entry, asserts the corresponding `settings.json`/`hooks.json`/`mcp.json` wires it on every surface the manifest declares. Reuses `buildShimMaps` for kind=="shim" entries.

## 2. Dead .mastracode shims reconciliation

### Facts
- `.mastracode/hooks.json` wires universal hooks DIRECTLY (`node tools/learning-loop-mastra/hooks/universal/*.js` — `.mastracode/hooks.json:5,12,19,26,35,43`). No reference to `.mastracode/coordination/hooks/*.cjs` anywhere (`NO_MASTRACODE_SHIM_REF_IN_CONFIGS` confirmed via grep of `hooks.json`/`settings.json`/`mcp.json`).
- `.mastracode/coordination/hooks/{bash,inbound-state,recurrence,write}*.cjs` are byte-identical to `.claude` and `.factory` (verified via `diff`).
- `shims-in-sync` (`runtime-agnostic-checklist.js:204-240`) iterates `SHIM_DIRS` (all 3 surfaces) and asserts every shim name is present + byte-identical across ALL surfaces. Deleting `.mastracode` shims without changing `shims-in-sync` makes every shim fail as "missing .mastracode/coordination/hooks/X".
- Locked constraint: keep existing runtime behavior, do NOT collapse patterns. `.mastracode`'s existing behavior is "direct wiring" — switching it to shims (option b) changes behavior, OUT.
- `buildShimMaps` (`:152-160`) is derived from `SHIM_DIRS` which is derived from `SURFACES` (`:14`), "single source of truth" (`:12-14`).

### Recommendation: (a) delete the 4 dead shims + make `shims-in-sync` manifest-aware

The manifest (`hooks-lock.json`) becomes the authority for which surfaces use which wiring kind per hook. `shims-in-sync` (or a new wrapper) reads the manifest and only asserts shim presence+byte-identity across surfaces where the manifest declares `wiring_kind: "shim"` for that hook. `.mastracode` declares `wiring_kind: "direct"` for all 4 universal hooks → no shim expected → no parity assertion for `.mastracode`.

Interaction with `buildShimMaps`: the helper stays SURFACES-derived (single source of truth for surfaces), but the parity loop filters which surfaces participate per-hook by reading the manifest's per-surface wiring-kind. Concretely: instead of `allNames = union of all surfaces`, compute `allNames = union over surfaces where manifest declares kind=="shim" for this hook`. A surface with no shim-kind hooks simply drops out of the parity check.

Trade-offs:
- **Behavior preserved.** `.mastracode` keeps direct wiring; `.claude`/`.factory` keep shims. No runtime change.
- **Dead code removed.** 4 files that were only maintained to satisfy `shims-in-sync` go away. `shims-in-sync` stops maintaining dead code.
- **Manifest becomes the authority.** `SHIM_DIRS` (SURFACES-derived) stays as the universe; the manifest selects the subset. This matches the skills plan's pattern (`skills-lock.json` is the authority; `SURFACES` is the universe).
- **Risk:** if the manifest is wrong (declares kind=="shim" for a surface that has no shim), `shims-in-sync` now flags it. That is the desired drift detection.
- **Why NOT (c) keep as available-but-unwired:** that is the current anti-pattern — dead code maintained by `shims-in-sync` with no consumer, exactly what the finding flags.

## 3. Pattern C (.factory/hooks/loop-surface-inject.cjs)

### Facts — premise correction
- The task prompt says Pattern C is "NOT in CHANGE_LOG_BOUND_PATHS." That premise is **STALE**. Finding `meta-260714T1248Z-change-log-bound-paths` is **resolved** (v2, resolved 2026-07-26, verified via `meta_state_list`): `.factory/hooks/**` IS in `CHANGE_LOG_BOUND_PATHS` (`core/change-log-bound-paths.js:55`). The resolution note states "only .factory has a hooks/ tree (.claude/hooks, .mastracode/hooks do not exist; coordination/hooks/*.cjs gate shims are a separate mirrored tree), so a single entry binds the sole runtime hooks adapter."
- Pattern C is single-source: it imports `core/loop-introspect.js` + `core/meta-state.js` directly via `await import` (`.factory/hooks/loop-surface-inject.cjs:67-73`), no LOCAL mirror (`plan/260717-1826:19` "Direct core import removes the wire, the spawn, and the mirror"). Byte-parity is N/A — there is no mirror to drift against.
- It is wired in `.factory/hooks.json` (`.factory/hooks.json:8`) as a SessionStart hook, NOT in `.factory/settings.json` (settings.json has the coordination/hooks shims; hooks.json has the adapter). Two config files on .factory — itself a wiring-pattern fact the manifest must capture.

### Recommendation
- **(b) CHANGE_LOG_BOUND_PATHS: NO ACTION.** Already bound (`change-log-bound-paths.js:55`). The finding is resolved. The plan should not re-add it.
- **(a) Add to hooks-lock.json as an `adapters` entry (or a hook entry with `wiring_kind: "adapter"`, surface `.factory` only).** The parity test then asserts: (i) the file exists at `.factory/hooks/loop-surface-inject.cjs`; (ii) `.factory/hooks.json` wires it on SessionStart; (iii) no other surface declares an adapter (it is runtime-local). No byte-identity assertion — single-source has nothing to parity-check. The manifest entry pins the existence + wiring contract; that is the drift detection.
- **(c) Parity check?** Yes for existence+wiring, no for byte-identity. Single-source means the only drift modes are "deleted" or "unwired" — both caught by the manifest-driven existence+wiring assertion. A byte-identity check across surfaces is meaningless (no other surface has it).

So: add Pattern C to `hooks-lock.json` with `wiring_kind: "adapter"`, `surface: ".factory"`, `event: "SessionStart"`, `path: ".factory/hooks/loop-surface-inject.cjs"`, `config: ".factory/hooks.json"`. The parity test covers existence+wiring only.

## 4. docs/architecture.md adoption-path section

### Existing structure
- Lines 59-110: "Inbound State Gate" (mentions `.claude/coordination/hooks/inbound-state-gate.cjs` shim → universal).
- Lines 112-164: "Outbound Gates" — lists shims (`.claude`, `.factory`) and notes "Mastra Code uses declarative `hooks.json` entries pointing at the same universal hook scripts" (`:122`).
- Lines 532-566: "Context-Injection Division of Labor" (added by plan 260717-1826 per decision 2, `plan/260717-1826:26`).

### Recommended insertion point
Insert a new **`### Hooks Wiring Manifest`** subsection immediately after the "Outbound Gates" section (after `docs/architecture.md:164`). Rationale: it is the natural sibling of the Outbound Gates section (which already lists shims + the .mastracode declarative note at `:122`); it avoids disturbing the Context-Injection Division of Labor section (which is plan-260717-1826-owned). Add a one-line cross-link from `:122` ("Mastra Code uses declarative hooks.json entries…") to the new subsection.

### Section outline (sketch)
- **`### Hooks Wiring Manifest`** — one paragraph: `hooks-lock.json` is the source of truth for which universal hooks exist, which surfaces wire them, and how (wiring kind). Canonical implementations live in `tools/learning-loop-mastra/hooks/universal/` (the 6 hooks: `bash-gate.js`, `inbound-gate.js`, `write-gate.js`, `recurrence-check-on-start.js`, `session-start-inject-discoverability.cjs`, `session-start-inject-process-hints.cjs`).
- **Wiring kinds** (table): `shim` (per-surface `.cjs` wrapper → universal; byte-identical across surfaces that use it), `direct` (runtime `hooks.json` invokes universal script directly; no shim), `adapter` (runtime-local hook with direct core import; single-source, no mirror), `pull-only` (no push wiring; surface consumes via MCP pull).
- **Per-runtime matrix** (table: hook × surface → wiring kind + config path). Columns: `.claude` (`settings.json`, shims), `.factory` (`settings.json` shims + `hooks.json` adapter), `.mastracode` (`hooks.json`, direct). Rows: the 6 hooks. Cells cite the wiring path. Pull-only cell: `.mastracode` SessionStart hints (per plan 260717-1826 Validation 1, `docs/architecture.md:550`).
- **`hooks-lock.json` as source of truth** — the manifest declares the matrix; the `hooks-wiring-coverage` CHECKLIST item + the parity test assert the matrix matches reality.
- **Adding a new hook (adoption path)** — numbered steps:
  1. Implement canonical in `tools/learning-loop-mastra/hooks/universal/` (single source).
  2. Add an entry to `hooks-lock.json` with per-surface wiring kind + config path.
  3. Wire each runtime's `settings.json`/`hooks.json` per the manifest (shim where kind=="shim" and mirror byte-identically; direct where kind=="direct"; adapter where kind=="adapter").
  4. Run `check_runtime_agnostic` (MCP) + the parity vitest — they go red→green.
- **Cross-link** to "Context-Injection Division of Labor" (`:532`) for the SessionStart hint content (the hooks inject the registry; the registry's division of labor is documented there).

## 5. Open questions for the planner

1. **`hooks-lock.json` schema shape** — is the manifest keyed by hook (each entry lists per-surface wiring) or by surface×event (each entry lists the hook + kind)? Keyed-by-hook matches the parity test's mental model (one hook, N surfaces); keyed-by-surface×event matches the runtime config files. Recommend keyed-by-hook (parity test iterates hooks). Planner to finalize in Phase 1.
2. **`SHIM_DIRS` vs manifest subset** — should `SHIM_DIRS` stay SURFACES-derived (universe) and the parity check filter by manifest, or should `SHIM_DIRS` itself become manifest-derived? Recommend: keep `SHIM_DIRS` SURFACES-derived (single source of truth for surfaces, `:12-14`); filter at the parity loop. Avoids making `runtime-agnostic-checklist.js` import the manifest at module-load (keeps the CHECKLIST import-cycle-free).
3. **`README.md` parity** — `.claude/coordination/hooks/README.md` exists; `.factory`/`.mastracode` lack it. `shims-in-sync` filters to `.cjs` (`:156`) so README is invisible to the check. Out of scope for this plan, but flag: if the manifest declares "shims" as a directory contract, README parity is a latent gap. Defer.
4. **`.factory` two-config-file split** — `.factory` uses `settings.json` (shims) + `hooks.json` (adapter). The manifest must capture BOTH config files per surface. Confirm schema accommodates a surface with two config files (settings.json for PreToolUse/UserPromptSubmit shims, hooks.json for SessionStart adapter).
5. **CHECKLIST count bump** — `runtime-agnostic.test.js:17` asserts `CHECKLIST.length === 6`. Adding `hooks-wiring-coverage` → 7. Planner to update the assertion in the same phase that adds the item.
6. **MCP tool doc update** — `docs/architecture.md:248` enumerates the 6 CHECKLIST items. Update to 7 when the item lands.
7. **Does `check_runtime_agnostic` need a featurePath to scan?** The new item is repo-global (ignores `featurePath`, like `shims-in-sync`). Confirm the MCP tool's call sites pass a sensible `featurePath` (or none) — the item should not depend on it.

## Limitations
- Did not read `__tests__/legacy-mcp/skills-manifest.test.js` (the skills-mirror manifest test) in full; only skimmed `skills-mirror-parity.test.js` for the model. The manifest schema for skills may inform the hooks-lock schema but was not deeply cross-referenced.
- Did not read the full `check_runtime_agnostic` MCP tool handler — relied on `docs/architecture.md:248` for its behavior.
- Did not verify whether `.mastracode/settings.json` or `.mastracode/mcp.json` reference `coordination/hooks` (only confirmed `hooks.json` does not). A broader grep across the whole repo would confirm no other consumer exists; the targeted grep of the 3 config files is sufficient for the dead-shim claim but not exhaustive of every possible consumer.
