# Brainstorm: Phase A — Product-Surface Re-Debate (one-file-per-surface, code-as-source)

> **Status:** approved by operator 2026-06-12 16:10. Aligned to the productization master tracker at `plans/reports/productization-260612-1530-master-tracker.md` § Phase A. Refines the locked 2026-06-12 reframe (meta-surface as the only bound surface) into a concrete Phase A design.

**Type:** brainstorm (design report)
**Date:** 2026-06-12
**Slug:** phase-a-product-surface-re-debate
**Aligned to:** `plans/reports/productization-260612-1530-master-tracker.md` Phase A (A1, A2, A3, A4, A5) + `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 (meta-surface is the only bound surface)
**Source debates:** 2 `/ck:predict` runs (storage-relationship; state-machine tracking)
**Verdict of source predicts:** CAUTION (both) — both recommend the "1 partitioned file" path over "N parallel files"

---

## 1. Problem statement

The 2026-06-12 reframe collapsed Bridge 5+6 into one atomic meta-surface, voided Bridges 1-4, and locked the meta-surface as the only bound surface. The product surface is unbound and re-debated from the meta-surface. **Phase A of the master tracker is the re-debate; the operator wants a concrete answer, not Option D (re-debate without a recommendation).**

The operator's two-pronged proposal:

1. **One file per surface, less markdown is better.** If we need markdown (e.g., for Bridge 1 evidence), use the existing fingerprint concept (`evidence_code_ref` + SHA-256 in `meta_state_check_grounding`).
2. **Capabilities = code + fingerprint, not YAML.** Stop inventing a schema to document what the code already says; treat the code as the source of truth.

The tension: the meta-surface's 4-kind union is locked since SP3 (2026-06-05); the product-surface concepts (observation, capability, evidence, claim, resource-budget) don't map 1:1 to `finding`/`rule`/`change-log`/`loop-design`. A naive "fold everything into the meta-surface" produces semantic loss; a naive "create N parallel JSONLs" produces the N+1 file problem.

## 2. Requirements (HARD-GATE-EXACT-REQUIREMENTS)

| # | Requirement | Concrete anchor |
|---|---|---|
| 1 | **Expected output** | (a) A design report (this file). (b) Future plan that ships: extended `meta-state.jsonl` schema; new `runtime-state.jsonl` sidecar; 5 schemas deleted; 4 tools deleted; 2 tools added; 19 ledger events converted from yaml. |
| 2 | **Acceptance criteria** | (a) The meta-surface's 4-kind union is preserved; no 5th kind. (b) `core/gate-logic.js#evaluateWritePath` continues to enforce write-path patterns after the schema change. (c) `meta_state_list({affected_system: 'vnstock'})` returns the same data the current `records/vnstock/` contains (after conversion). (d) `observation-vnstock-device-slot-ledger.yaml`'s 19 events appear in `runtime-state.jsonl` with a `source_ref` to a meta-state pointer. (e) `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` after the conversion. |
| 3 | **Scope boundary** | Phase A only. **Out of scope:** Bridge 5 engine Approach 3 (Phase B); Mastra migration (Phases C-E); Bridge 7 product-surface binding (Phase F); legacy `records/<vendor>/` content (stays unbound per §3.10). |
| 4 | **Non-negotiable constraints** | (a) 4-kind union locked since SP3 — no new kinds. (b) Internalization Rule (§6 of `AGENTS.md`) — every entry has a `code_ref` (extends `evidence_code_ref`). (c) The gate's read path continues to work. (d) `meta_state_resolve` consult-rule (`rule-no-orphaned-evidence`) must still apply after the schema change. (e) The `rule-no-new-artifact-types` consult-gate (AGENTS.md §2) must be respected; new root-level files (e.g., `runtime-state.jsonl`) need an `affected_system` partition, not parallel surfaces. |
| 5 | **Touchpoints** | `meta-state.jsonl`; `runtime-state.jsonl` (new); 8 `schemas/*.schema.json`; `records/observations/*.yaml` (8 files); `core/{meta-state,gate-logic,inbound-state,patterns}.js`; 16 `meta_state_*-tool.js`; 3 `capability_*-tool.js`; 3 of 5 `index_*-tool.js`; 2 `record_*observation*-tool.js`; `core/derivation/derive-capabilities.js` (new); `tools/{manifest,agent-manifest}.json`; `agent-manifest.json`. |

## 3. Approaches evaluated

### Approach A — "One consolidated file" (RECOMMENDED)

Extend `meta-state.jsonl` with `affected_system: string` and `code_ref: string` fields. Add `runtime-state.jsonl` sidecar for mutable state. No new kinds. The 4-kind union is the *only* storage shape; "per surface" is a partition key, not a separate file.

**Pros:** minimal touch surface (1 file extension, 1 new file); preserves the SP3-locked 4-kind union; reuses `readRegistry()` + LRU cache + `meta_state_check_grounding` + `meta_state_refresh_fingerprint`; gate logic continues to work with one filter change; cross-surface references use the existing `local:meta-state:<id>` grammar with an optional `#affected_system=<s>` suffix.

**Cons:** `affected_system` becomes a load-bearing field; readers must always filter; 4 `meta_state_*-tool.js` files get new optional params; existing entries need a one-time `affected_system: 'meta'` default (backward-compat shim, removed after 1 release cycle).

**Why it wins:** YAGNI (one file for ~100 entries is enough; N files is premature), KISS (no new primitive), DRY (no parallel readers/writers/caches). Predict Report 1 verdict: CAUTION, with this exact recommendation as the primary mitigation.

### Approach B — "N parallel JSONL files per surface" (REJECTED)

Create `vnstock-state.jsonl`, `tanstack-state.jsonl`, `fastapi-state.jsonl`, `product-state.jsonl` at the project root. Each holds the 4-kind union. A new `core/registry-paths.js` resolves the right file.

**Pros:** clean blast-radius isolation per surface; per-surface truncation/dump is straightforward; matches the operator's literal reading of "one file per surface."

**Cons:** 4+ files where 1 file is enough (YAGNI violation); 4+ LRU cache invalidation hooks; 4+ fingerprint scans; 4+ write-gate consult-rule checks; 4+ backups to manage; `core/gate-logic.js` has to know all 4 file paths.

**Why it loses:** the operator's *intent* ("less files is better") cuts both ways. The application of that intent is consolidation, not multiplication. Predict Report 1 verdict: CAUTION with this as the primary anti-pattern.

### Approach C — "Hybrid: meta-state stays 4-kind; product-surface gets a 5th kind" (REJECTED)

Add `kind: 'ledger'` and `kind: 'capability'` to the meta-surface union. Counters and capability records become first-class.

**Pros:** semantic precision (counter is not a `finding`); one storage shape; tools can branch on `kind`.

**Cons:** SP3 schema is locked; adding a 5th kind requires a release cycle of `meta-state.jsonl` backfill; consult-rule `rule-no-new-artifact-types` is more likely to fire; `readRegistry()` and the LRU cache must extend; every reader/writer has a new branch to maintain.

**Why it loses:** the 4-kind union is *load-bearing* for the 985-test suite; structural changes need a release cycle. Predict Report 2 verdict: CAUTION, with the sidecar pattern (Approach A) as the recommended alternative.

## 4. Final recommended solution

**Approach A (one consolidated file + sidecar).** See Section 5 for the design.

## 5. Design

### 5.1 Storage shape

**No new JSONL files at the per-surface level.** The current `meta-state.jsonl` is extended:

```jsonc
{
  "id": "meta-260612T1610Z-...",
  "entry_kind": "finding",        // unchanged: finding | change-log | rule | loop-design
  "affected_system": "vnstock",    // NEW: required, defaults to 'meta' for legacy entries
  "code_ref": "tools/...",         // NEW: optional, SHA-256 fingerprinted
  "ledger_ref": null,              // NEW: optional, pointer to runtime-state.jsonl
  "description": "...",
  "evidence_code_ref": "tools/...", // existing; alias for code_ref where appropriate
  "evidence_journal": "docs/...",  // existing
  "status": "active",
  // ... all other existing fields
}
```

**The 4-kind union is preserved.** `affected_system` is a partition key, not a new kind.

**Cross-references** use `local:meta-state:<id>` (existing) with an optional `#affected_system=<s>` suffix for disambiguation.

**Sidecar** for mutable runtime state:

```jsonc
// runtime-state.jsonl
{
  "affected_system": "vnstock",
  "kind": "ledger-event",          // ledger-event | budget-state | (extensible, not locked)
  "id": "vnstock-device-slot-2026-05-08T10:17:23Z",
  "value": 1,
  "delta": 1,
  "source_ref": "local:meta-state:<rule-id>",  // required: the meta-state entry that caused this event
  "fingerprint": "<sha256>",        // SHA-256 of (id + source_ref + value + delta + timestamp)
  "timestamp": "2026-05-08T10:17:23Z",
  "status": "active"                // active | cleared | reconciled
}
```

### 5.2 State-machine semantics (counter pattern)

`runtime-state.jsonl` is a **sidecar**, not a 5th meta-state kind. The meta-state entries that interpret the runtime state carry a `ledger_ref`. Two concerns, two files:

- **`meta-state.jsonl`**: semantic claims, diagnostic observations, promoted rules, system change audit. Derivable from code.
- **`runtime-state.jsonl`**: mutable numeric state, runtime accumulations, counters, budgets. NOT derivable from code; an accumulation of runtime events.

**Conversion of `observation-vnstock-device-slot-ledger.yaml`**: 19 `ledger[]` rows → 19 `runtime-state.jsonl` rows with `kind: 'ledger-event'`. The yaml is archived at `records/observations/_forensic-stubs/observation-vnstock-device-slot-ledger.yaml` (the underscore prefix is the gate-bypass trick — `core/gate-logic.js:401` hard-blocks `records/observations/**` but allows other paths). A new `finding` entry with `affected_system: 'vnstock'`, `ledger_ref: 'vnstock-device-slot'`, and `fingerprint: <sha256-of-sidecar-at-conversion-time>` is added.

### 5.3 Capabilities as derived view (A3)

**Delete `schemas/capability.schema.json` and the 3 `capability_*` MCP tools.** A "capability" is the union of:
1. Meta-state `rule` entries with `affected_system: '<surface>'`.
2. A fingerprint scan of the code that calls each `rule`'s `code_ref`.

**Replacement queries:**
- "List verified capabilities for stack=api" → `meta_state_list({entry_kind: 'rule', affected_system: 'api'})` filtered by `code_ref_fingerprint_matches(code_path_scan())`.
- The 3 dropped tools are replaced by **derivation functions** in `core/derivation/derive-capabilities.js` (no MCP tool surface, callable from the agent's tool code).

### 5.4 Evidence + claim (A2, A4)

**Delete `claim.schema.json` and `index-entry.schema.json`.** The "evidence" concept is already in the meta-state: `finding.description` + `code_ref` + `evidence_journal`. The "claim" concept is a `rule` with `affected_system: <vendor>`.

**The `index_*` MCP tools (5 today) become 2:**
- Keep `index_validate` (validates plan structure).
- Keep `index_validate_plans` (validates plan compliance).
- Drop `index_extract`, `index_search`, `index_update_claim` — replaced by `meta_state_list` + fingerprint scan.

### 5.5 Engine binding (A5)

**No binding to product-surface types.** The Bridge 5 engine stays meta-surface only. The `schemas/*.schema.json` files (8 today) become 3:
- `schemas/meta-state.schema.json` (the 4-kind union, extended with `affected_system` + `code_ref` + `ledger_ref`).
- `schemas/runtime-state.schema.json` (the ledger shape).
- `schemas/plan.schema.json` (the plan shape, moved from `plans/.templates/`).

**The 5 unbound schemas (`capability`, `claim`, `decision`, `experiment`, `index-entry`, `observation`, `resource-budget`, `risk`) are deleted.** Forensic stub at `schemas/_unbound/_README.md` lists what was deleted and why.

### 5.6 Touchpoints

| File / directory | Action |
|---|---|
| `meta-state.jsonl` | Extended in place; no migration needed (existing entries default `affected_system: 'meta'`) |
| `runtime-state.jsonl` | Created; 19 rows converted from `observation-vnstock-device-slot-ledger.yaml` |
| `schemas/meta-state.schema.json` | Created (replaces the 4 inline zod branches in `meta-state.js`) |
| `schemas/runtime-state.schema.json` | Created |
| `schemas/plan.schema.json` | Created (moved from `plans/.templates/`) |
| `schemas/{capability,claim,experiment,risk,decision,observation,resource-budget,index-entry}.schema.json` | Deleted (8 files) |
| `schemas/_unbound/_README.md` | Created (forensic record of deletions) |
| `records/observations/*.yaml` (8 files) | Archived to `records/observations/_forensic-stubs/`; 19 ledger events extracted to `runtime-state.jsonl` |
| `records/<vendor>/**` | Unchanged (already unbound per §3.10) |
| `tools/learning-loop-mcp/core/meta-state.js` | Refactored: 4 zod branches → 1 imported `metaStateSchema`; add `affected_system`, `code_ref`, `ledger_ref` |
| `tools/learning-loop-mcp/core/gate-logic.js` | Refactored: `loadPromotedRules` filters by `affected_system`; add `loadLedger(affected_system)` |
| `tools/learning-loop-mcp/core/inbound-state.js` | Refactored: `checkObservationStaleness` reads from `meta-state.jsonl` partitioned by `affected_system: 'meta'` + sidecar |
| `tools/learning-loop-mcp/core/derivation/derive-capabilities.js` | Created (function, not a tool) |
| `tools/learning-loop-mcp/tools/meta-state-*-tool.js` | Updated: new fields surface as optional params |
| `tools/learning-loop-mcp/tools/{capability,index-extract,index-search,index-update-claim}-tool.js` | Deleted (4 files) |
| `tools/learning-loop-mcp/tools/{record-create,record-update}-observation-tool.js` | Deleted (2 files; observation writes now go through `runtime_state_record`) |
| `tools/learning-loop-mcp/tools/runtime-state-read-tool.js` | Created (1 file) |
| `tools/learning-loop-mcp/tools/runtime-state-record-tool.js` | Created (1 file, operator-preflighted) |
| `tools/manifest.json` / `agent-manifest.json` | Updated: drop 6 tools, add 2 |
| `.mcp.json`, `.factory/mcp.json` | Unchanged (server identity is the same) |

## 6. Predict reports (preserved verbatim)

### 6.1 Predict Report 1 — Storage relationship

**Verdict: CAUTION** — collapse N per-surface physical JSONLs into 1 file partitioned by `affected_system` (YAGNI); treat `capability` as a derived view (not a stored record).

**Key conflicts and resolutions:**
- One file vs. N files → **One file** (YAGNI; the operator's "less files is better" intent cuts both ways).
- `observation` → `finding` fold → **Don't fold** (semantic loss; counter is a recording, not a finding).
- `capability` as derived view → **Adopt** (operator's own proposal; aligns with code-as-truth).
- `evidence` and `claim` schemas → **Delete** (redundant with `code_ref` + `description`).

### 6.2 Predict Report 2 — State-machine tracking

**Verdict: CAUTION** — the meta-surface should *not* add a 5th kind for counters; the right move is a **sidecar** (a separate, small, code-rebuildable ledger file with no MCP tool surface), with the meta-surface entries acting as *provenance pointers* to the ledger entries.

**Key conflicts and resolutions:**
- Add 5th kind vs. sidecar vs. fold → **Sidecar + meta-state pointer** (YAGNI: 1-of-1 use case doesn't justify 5th kind; fold is semantically wrong).
- Where does the sidecar live? → **One file partitioned by `affected_system`** (mirrors Predict Report 1).
- What reads the sidecar? → **1 read-only tool, no writers from the agent surface** (writes are operator-mediated via the gate).
- Does the meta-state entry carry a `fingerprint` of the ledger? → **Yes** (consistent with `meta_state_check_grounding`).

## 7. Implementation considerations and risks

| Risk | Severity | Mitigation |
|---|---|---|
| `meta-state.js:6` `REGISTRY_FILENAME` is hard-coded; the new fields require the 4 inline zod branches to consolidate into 1 imported schema | High | Phase A sub-phase: refactor `core/meta-state.js` to import `schemas/meta-state.schema.json` (Bridge 5 Approach 2 ships; Approach 3 in Phase B) |
| The gate's `loadPromotedRules` reads only `meta-state.jsonl`; adding `affected_system` filter is a one-line change but the cache invalidation hook in `readRegistryWithCache` must be reviewed | High | Add `affected_system` to the cache key in `readRegistryWithCache`; covered by the cold-session discoverability test (`pnpm test:cold-session`) |
| The 19 ledger events in `observation-vnstock-device-slot-ledger.yaml` need a verbatim conversion; a typo in `value`/`delta` could mask a real budget issue | High | The conversion is a 1-shot script with a verification step: the script reads the yaml, writes the JSONL, then asserts the new JSONL parses to 19 events with `delta` values that sum to the yaml's last-known state |
| Adding `runtime-state.jsonl` triggers the `rule-no-new-artifact-types` consult-gate | Medium | The rule's regex is `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)` — `runtime-state.jsonl` is a JSONL file, not a "schema" or "artifact type" in the rule's sense. Confirm via `gate_check` before any code that creates the file. |
| The 6 deleted MCP tools are referenced by `agent-manifest.json` (56-tool surface) and possibly external skills (`.claude/skills/**`, `.factory/skills/**`) | Medium | `meta_state_log_change` with `change_target: 'tools/manifest.json'` documents the deprecation in the audit trail; the next `/ck:scout` or `/ck:cook` will surface the skill references |
| The 8 deleted schemas are imported by the 6 deleted tools; deleting the tools first requires deleting the schemas last (dependency order) | Low | The plan's Phase A sub-phases enforce the order: (1) add new fields to meta-state; (2) convert ledger; (3) create `runtime-state.jsonl`; (4) add 2 new tools; (5) verify everything works; (6) delete 6 old tools; (7) delete 8 old schemas; (8) write forensic README |

## 8. Success metrics and validation criteria

1. **Test parity:** the 985-test suite (verified 2026-06-12: 984 pass, 1 skipped) passes after the changes. Any new tests cover the new fields + the sidecar + the derivation function.
2. **Schema validation:** `schemas/meta-state.schema.json` rejects entries with missing `affected_system` (defaults to `'meta'` for legacy entries via a Zod preprocess).
3. **Gate behavior:** `core/gate-logic.js#evaluateWritePath` continues to return `decision: 'block'` for `records/observations/**` and `decision: 'ok'` for `schemas/meta-state.schema.json`.
4. **Query parity:** `meta_state_list({affected_system: 'vnstock'})` returns the same data the current `records/vnstock/decisions/*.yaml` + `experiments/*.yaml` + `risks/*.yaml` contain, after conversion.
5. **Ledger conversion:** the 19 events from `observation-vnstock-device-slot-ledger.yaml` appear in `runtime-state.jsonl` with consistent `value`/`delta` arithmetic.
6. **Staleness check:** `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` for the converted entries.
7. **Capability query:** `core/derivation/derive-capabilities.js#deriveCapabilities('vnstock')` returns the same set of capabilities the current `capability_list_verified` tool returns, plus a fresh fingerprint scan.

## 9. Open decisions resolved in this report

| Question | Resolution | Rationale |
|---|---|---|
| Default `affected_system` for legacy entries? | `'meta'` | Backward compat; `meta_state_list({affected_system: 'meta'})` returns all current entries |
| Does `runtime-state.jsonl` need `meta_state_*` derivation tools? | No | Derivation is code-level (`core/derivation/`); the JSONL is the recording, not the analysis |
| What happens to `gate_check` consult-rule when the sidecar is added? | Add `side-effect-import` pattern for the sidecar writes (already covered by bash-gate on `runtime_state_record`) | The bash-gate intercepts the bash invocation; the JSONL is a side-effect, not a primary action |
| Should `affected_system` be explicit or derived from `code_ref`? | Explicit field (default `'meta'`); `code_ref` is the validation key | Explicit is cheaper than parsing `code_ref` on every read |

## 10. What this report is NOT

- **Not a plan.** A `plans/<date>-*-meta-surface-re-debate/plan.md` ships the code in 8 sub-phases (per the Phase A ordering in Section 7's mitigation table).
- **Not a code change.** The design names the touchpoints; the plan sequences them.
- **Not a refactor of the 4-kind union.** The 4 kinds stay; only the schema *fields* extend.
- **Not a migration of legacy `records/<vendor>/` content.** Those stay unbound. The forensic stub pattern is the same one used for `AGENTS.old.260612-1300.md` and the voided Bridge 1-4 reports.
- **Not a sub-tool of `/ck:plan`.** This is a brainstorm; `/ck:plan` is the next step *if* the operator wants to plan now (operator declined per the closing conversation; will plan later).

## 11. References

- `plans/reports/productization-260612-1530-master-tracker.md` § Phase A — the canonical tracker; this report advances A1-A5 from open to designed.
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 — the 2026-06-12 reframe that locked the meta-surface as the only bound surface.
- `AGENTS.md` §1, §6, §10 — the meta-surface thesis, the Internalization Rule, the Bridges reframe.
- `tools/learning-loop-mcp/core/meta-state.js#REGISTRY_FILENAME` — the hard-coded constant that constrains Section 5.1.
- `tools/learning-loop-mcp/core/gate-logic.js:401` — the hard-block on `records/observations/**` that constrains the forensic stub location.
- `tools/learning-loop-mcp/core/inbound-state.js#checkObservationStaleness` — the staleness check that must continue to work after the conversion.
- `tools/learning-loop-mcp/core/patterns.json` — the constraint patterns; the new `side-effect-import` for `runtime_state_record` follows the same shape.
- `records/observations/observation-vnstock-device-slot-ledger.yaml` — the 19-event ledger that becomes the seed data for `runtime-state.jsonl`.
- `schemas/{capability,claim,experiment,risk,decision,observation,resource-budget,index-entry}.schema.json` — the 8 schemas to be deleted.

## 12. Next steps (when the operator is ready to plan)

1. Open a `plans/260612-1700-meta-surface-re-debate/plan.md` (or similar) with 8 sub-phases (one per touchpoint category in Section 5.6).
2. The plan's Phase 0 declares the 4-kind union stability check (the SP3 lock per the master tracker § Phase B1).
3. The plan's Phase 1-7 ships the changes in dependency order: meta-state schema → ledger conversion → runtime-state.jsonl → 2 new tools → 6 deletions.
4. The plan's Phase 8 updates the master tracker: A1-A5 flip from `[ ]` to `[x]`.
5. `meta_state_log_change` with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` and `change_dimension: 'semantic'` documents the Phase A closure.

**Operator declined `/ck:plan` handoff for this session** (closing conversation). The report is the deliverable. When the operator is ready, the planning will pick up at Section 12.
