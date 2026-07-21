---
phase: 2
title: "MCP wire slimming — JIT branch contracts + shared field glossary"
status: pending
priority: P1
effort: "7h"
dependencies: [1]
---

# Phase 2: MCP wire slimming — JIT branch contracts + shared field glossary

## Overview

Move branch-union tool schemas off the wire into validation-error payloads (JIT contract) and dedupe cross-tool repeated prose into a shared field glossary served via `loop_describe` cold tier. Target (Validation V1): **manifest-tool wire 67,255B → ≤40,000B**. The total ≤45,000B is a separate follow-on phase (non-manifest ~15.26kB unslimmed here). Contract *location* moves; per-tool invocation contracts (stages, gating, field semantics, idempotency) are NEVER trimmed (`meta-260704T0959Z`).

> **🔴 Red Team (C1 — budget arithmetic):** The manifest-tool savings below sum to −30–32kB; 82.5kB − 32kB = **50–52kB**, above the ≤45,000B goal. The non-manifest surface (~15.26kB: 8 workflows + `update_r2_allowlist` + 3 `ask_*` agents, per research report `:60,:62`) is NOT slimmed by this phase.
>
> ✅ **VALIDATION V1 RESOLVED — split budget:** This phase targets the **manifest-tool portion ≤ 40,000B** only. The **total ≤ 45,000B** line is deferred to a separate workflow/agent-slimming follow-on phase (the non-manifest ~15.26kB is that phase's scope). Phase 6's budget gate checks manifest ≤40,000B, not total ≤45,000B. `<!-- Updated: Validation Session 1 - C1 split budget -->`

## Context Links

- Research (file:line inventory + landmines): `plans/reports/research-260720-1921-mcp-schema-jit-surface.md`
- Brainstorm §4.1 (per-shape treatment table)
- zod→wire flow: `docs/mcp-tool-schema-architecture.md` (updated in Phase 5)

## Key Insights (from research)

- Wire choke point: `create-loop-tool.js:69` (`schema._zod.toJSONSchema` override). JIT treatment edits tool `schema`/`describe` upstream — no choke-point change needed.
- Patch union is `meta-state-patch-tool.js:33`; branch validation already handler-side at `meta-state-patch-tool.js:142-157` → error payloads are the JIT delivery channel, delivery-independent on every profile (report-proven).
- **Two pinned invariants on patch** (`__tests__/mcp-tools-list-parity.test.js` Tests 5+7): wire `patch.minProperties ≥ 1` (keep `parityJsonSchemaHints` entry at `meta-state-patch-tool.js:32-34` — 🔴 Red Team (D8): the prior "lines 26-28" citation pointed at `MIGRATED_TOOL_NAMES` / unrelated code, not the entry) AND runtime `schema.patch.safeParse({})` must succeed (no `.min(1)`/refine on the runtime zod — handler-level `empty_patch` check at 119-129 stays the safety net).
- Flat-tool exact-prose duplication is only 264B — glossary win = long unique prose + near-dupes (`operation_envelope` ~1.4kB in `core/meta-state.js:420-439`, evidence fields ×3, status-enum prose 326-327, id-format prose 308/369/507).
- Never call `z.toJSONSchema` on a tool's ROOT schema (override → `{$ref:"#"}` sentinel); serialize BRANCH schemas via `buildPatchSchemaFor(kind)` — safe (no override on branches).

## Requirements

- Functional:
  - `meta_state_patch` wire schema: `patch` = free-form object + `minProperties:1` (parity hint), description = short-form + schema-derived mutable-field CSV via `listMutableFieldsCsv` (exists: `tools/lib/patch-hints.js`; currently used only in error hints — extend to description).
  - > **🔴 Red Team (H10 — free-form patch shape):** specify the new zod shape explicitly as `z.preprocess(deepStripEnvelope, z.record(z.string(), z.unknown()))` (passthrough object acceptable). `deepStripEnvelope` MUST stay on the path because handler-side `branchParse` (`meta-state-patch-tool.js:142`) expects envelope-stripped input; it is NOT dead code against the free-form record — it normalizes `{item:[...]}` envelopes before the permissive record accepts the inner object. Add an A-test asserting the envelope `{item:[...]}` round-trip still works against the new free-form shape (currently only covered against the union).
  - `invalid_field` + `empty_patch` error payloads carry `patch_schema` (per-kind JSON schema via `z.toJSONSchema(buildPatchSchemaFor(kind), {target:"draft-7", io:"input"})`; branch sizes: finding 5,969B / change-log 5,715B / rule 3,688B / loop-design 1,836B).
  - `meta_state_batch` light treatment: per-op branch shapes off-wire into `buildInvalidFieldResult` (meta-state-batch-tool.js:177-196); `no_content` hint CSV stays.
  - New `tools/learning-loop-mastra/core/field-glossary.js`: field-name → `{ meaning, format, example }` for the deduped fields (id format, status enums, evidence_*, operation_envelope, applies_to, source_ref, ledger_ref…). Static module, no I/O.
  - On-wire descriptions of big-flat tools (report 1,195B, list 1,271B, re_verify 1,077B, resolve 936B, log_change 599B, patch 700B) go short-form pointing at glossary; glossary served as `result.field_glossary` in `loop_describe` cold tier (slot at loop-describe-tool.js cold branch ~137-259; static content).
  - > **🔴 Red Team (H1 — cold-tier cache staleness):** the cold-tier cache (`core/loop-introspect-cache.js:103-105`) is keyed ONLY on `registry_sha256 + change_log_sha256 + file_index_sha256`. The glossary is static code → adds NO SHA → a pre-Phase-2 on-disk cache entry is a HIT returned as-is, WITHOUT `field_glossary`. CI passes (fresh cache miss) but an operator with an existing `records/meta/.cache/cold-tier.json` silently gets no glossary. **Fix:** inject `result.field_glossary = listFieldGlossary()` AFTER the cache read (so it lands on both hit and miss paths), OR bump a cache-version constant in `loop-introspect-cache.js` so old caches miss. Pin with a test that pre-seeds a stale cache entry and asserts the glossary key is present on a hit.
  - Zod validation errors at LOOP-OWNED points JIT-enriched with the failed field's glossary entry: patch tool 144-157 + 119-129; batch tool 177-196 + 200-205 (`formatFieldIssue`). MCP-level arg-validation formatter is node_modules-locked (`@mastra/mcp/dist/index.js:3186-3202`) — out of scope, documented.
- Non-functional: wire budget **manifest-tool portion ≤40,000B** this plan (Validation V1; total ≤45,000B is a separate follow-on phase); no new MCP tools (manifest counts 44/32/11/6 pinned in 4 test files); no `.describe()` change that alters core write-time zod message semantics (`entryIdRefsRefine` at core/meta-state.js:284-297 is dual-role wire+error — keep message intact).

## Architecture

```
wire (always)                    pull / JIT (at invocation)
─────────────────────────────    ─────────────────────────────────
patch: {type:object,             invalid_field/empty_patch result:
  minProperties:1}                 + patch_schema (per-kind JSON)
desc: 1-2 lines + field CSV      field_glossary via loop_describe cold
batch: slim op union             batch invalid_field: + op shape
flat tools: short desc           zod field_errors enriched w/ glossary
```

`field-glossary.js` is the single source for deduped prose; wire descriptions and JIT enrichment both reference it (DRY — no third copy).

## Related Code Files

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` | Modify: line 33 union → free-form object (keep `deepStripEnvelope` preprocess); describe short + CSV; add `patch_schema` to invalid_field (144-157) + empty_patch (119-129) payloads | −17.4kB wire | patch tool tests (behavior, additive-safe); parity Tests 5+7 |
| `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` | Modify: opSchema 26-46 slim; `buildInvalidFieldResult` 177-196 + `formatFieldIssue` 200-205 carry per-op shape | −1.5kB | batch tests 534-567 (shape additive) |
| `tools/learning-loop-mastra/core/field-glossary.js` | Create: glossary map + `getFieldGlossaryEntry(field)` + `listFieldGlossary()` | +~4kB source | new unit test |
| `tools/learning-loop-mastra/core/meta-state.js` | Modify: shorten `.describe()` prose at 308/323-327/369/398-403/464-469/507 (glossary pointer); keep zod messages + validation logic. **🔴 Red Team (H11): `420-439` is the `operation_envelope` zod SCHEMA (kind/target enums, `min(1)`/`max(200)`, control-char + `..` path-safety regexes, `content_hash` SHA-256 regex) — NOT describe prose. Its describe strings are already one-liners; do NOT "shorten" 420-439 — touch only the explicit `.describe()` call sites, leave every regex/constraint untouched.** | −8-10kB wire across reusers | meta-state-schema*.test.js (no describe-content asserts — safe) |
| `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js` | Modify: description 14 short-form — **preserve locked tokens** ("evidence_code_ref", "meta_state_derive_status", "Markdown paths in `source_refs` are deprecated"; NOT "Prefer `evidence_code_ref`") | −0.6kB | meta-state-report-description.test.js (content-locked) |
| `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` / `meta-state-re-verify-tool.js` / `meta-state-resolve-tool.js` / `meta-state-log-change-tool.js` | Modify: descriptions short-form | −2.5kB | description non-empty asserts only |
| `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` | Modify: cold branch adds `result.field_glossary = listFieldGlossary()` (1 line + import) | +pull-only | loop-describe tests (additive key, safe) |
| `tools/learning-loop-mastra/mastra/server.js` | Modify: line 251 stale "31 tools + 10 workflows + 3 agents across 6 groups" description string. **🔴 Red Team (D2): live registration is 33 tools + 8 workflows + 3 agents across 6 groups (not "32+8" — that mixes manifest-tool count 32 with live-workflow count 8). Derive from `Object.keys(tools).length`/`workflows`/`agents` so it can't re-drift, or state the source explicitly.** | n/a | none (not test-locked) |
| `tools/learning-loop-mastra/__tests__/` new: `field-glossary.test.js`, `meta-state-patch-jit-payload.test.js` | Create | — | — |

**Function/interface checklist:** `buildPatchSchemaFor(kind)` (reuse, unchanged); `listMutableFieldsCsv(kind, fallback)` (new consumer: patch description); `getFieldGlossaryEntry`/`listFieldGlossary` (new); `z.toJSONSchema(branchSchema, opts)` (JIT serialization); patch handler error builders (extended payloads); `deepStripEnvelope` preprocess (MUST stay on patch schema path — envelope round-trip test depends on it).

## Dependency Map

- Blocks: Phase 6 (budget measurement). Independent of Phases 3/4 (disjoint files).
- Phase 1 baseline numbers required before first refactor commit (before/after per-tool deltas).

## Implementation Steps (TDD)

### Step A — Tests Before
1. New `__tests__/meta-state-patch-jit-payload.test.js` (RED): invalid_field + empty_patch payloads contain `patch_schema` object whose `properties` keys match `buildPatchSchemaFor(entry_kind)` shape keys; patch wire schema has `patch.minProperties ≥ 1` and NO `anyOf` (free-form); description contains field CSV.
2. New `__tests__/field-glossary.test.js` (RED): glossary covers the deduped field set; entries have meaning/format/example; `listFieldGlossary()` returns all.
3. Extend loop-describe test (RED): cold tier includes `field_glossary` with ≥ N entries.
4. Wire-budget assertion in new test `__tests__/mcp-wire-budget.test.js` (RED): **manifest-tool wire ≤ 40,000B** (Validation V1; spawn-server method from parity test).

### Step B — Refactor (protected by A + existing suites)
5. `core/field-glossary.js` (new).
6. Patch tool: free-form patch schema (keep preprocess + parity hint), short describe + CSV, JIT `patch_schema` in both error payloads.
7. Batch tool: slim opSchema, per-op shape in invalid_field result.
8. `core/meta-state.js` describe shortenings (glossary pointers); big-flat tool descriptions short-form (respect locked tokens); glossary enrichment in loop-owned error builders.
9. loop-describe cold-tier slot; server.js:251 string fix.

### Step C — Tests After
10. Run A-tests (GREEN) + full adjacent suites: `meta-state-patch-tool.test.js`, `meta-state-batch-tool.test.js`, `meta-state-patch-immutable-fields.test.js`, `meta-state-patch-derived-schema.test.js`, `mcp-tools-list-parity.test.js`, `coerce-correctness.test.js`, `meta-state-report-description.test.js`, `manifest-arithmetic.test.cjs`, loop-describe suites.
11. Re-run `measure-context-surfaces.mjs`; record per-tool deltas in the baseline report.

### Step D — Regression gate
- `pnpm test:iter` fully green; **manifest-tool wire ≤40,000B** confirmed by measurement script (Validation V1; not just the new test).

## Test Scenario Matrix

| Scenario | Criticality | Covered by |
|---|---|---|
| patch `{description:"x"}` on finding succeeds (free-form runtime parse) | critical | existing patch tool tests |
| patch `{}` → `empty_patch` + hint tokens `meta_state_supersede`/`meta_state_resolve` + `patch_schema` | critical | A1 + existing 297-302 |
| patch unknown field → `invalid_field` with `field_errors[].field` + `patch_schema` | critical | A1 + existing 364-425 |
| envelope `{item:[...]}` unwrap round-trip | high | existing derived-schema test |
| wire `minProperties ≥ 1`, runtime `parse({})` ok | critical | existing parity Tests 5+7 |
| report description locked tokens preserved | high | existing report-description test |
| cold tier `field_glossary` present; warm tier unchanged | medium | A3 |
| manifest-tool wire ≤40,000B (V1) | critical | A4 + measurement script |
| batch invalid_field carries op shape; no_content hint unchanged | high | A + existing 534-567 |
| manifest counts 44/32/11/6 | critical | existing manifest-arithmetic |

## Success Criteria

- [ ] Live wire **manifest-tool portion ≤ 40,000B** (patch ~1.9kB, batch ≤ ~1kB, big-flat descriptions short-form)
  - ✅ **VALIDATION V1 RESOLVED — split budget.** The "≤45,000B total" is NOT this phase's checkbox — it is a separate follow-on workflow-slimming phase. Phase 6 measures manifest ≤40,000B here. `<!-- Updated: Validation Session 1 - C1 split budget -->`
- [ ] `invalid_field`/`empty_patch` payloads deliver the full per-kind contract at invocation (JIT) on any profile
- [ ] No locked-token test regressions; no manifest-count churn; `check_runtime_agnostic` clean
- [ ] Per-tool before/after table appended to the Phase 1 baseline report

## Risk Assessment

- **First-call error rate rises** (no upfront field list) → mitigated by description CSV + actionable `patch_schema` payloads; monitored via gate-log invalid_field frequency vs Phase 1 baseline (Phase 6 metric).
- **Contract relocation vs `meta-260704T0959Z`** → invocation-complete contract preserved at the boundary; ship-time change-log + relationship note (Phase 6).
- **`_zod.toJSONSchema` sentinel footgun** → only branch schemas serialized; add code comment at the JIT call site citing `docs/mcp-tool-schema-architecture.md` §3.3.
- **Fallow dup gate** flags new glossary prose duplication → glossary is the single source; wire descriptions reference, not copy.
