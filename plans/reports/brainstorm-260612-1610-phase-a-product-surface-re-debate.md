# Brainstorm: Phase A — Product-Surface Re-Debate (one-file-per-surface, code-as-source)

> **Status:** approved by operator 2026-06-12 16:10; **§11 closed 2026-06-12 second-pass consensus** (operator intent + skill authority). The dependency-balance convention, pre-mortem channel, and revision loop are operator-confirmed. The post-productization skill-migration target has been **moved to the master tracker as Phase G** (mechanics, not content — does not belong in a Phase A re-debate report). Phase A scope is unchanged. Aligned to the productization master tracker at `plans/reports/productization-260612-1530-master-tracker.md` § Phase A. Refines the locked 2026-06-12 reframe (meta-surface as the only bound surface) into a concrete Phase A design.

---

## 0. Final Decision Summary (2026-06-12 22:45, post-red-team + operator adjudication)

**The full design in §1-§13 below is the forensic record.** This section is the lock-in: what shipped as a plan, what changed during red-team, and why.

### 0.1 What was re-debated

The 2026-06-12 reframe locked the meta-surface as the only bound surface. The product surface (decisions, experiments, risks, observations, capabilities, claims, evidence, index-entries) is unbound and re-debated from the meta-surface. Phase A of the productization master tracker is the re-debate.

### 0.2 What changed during red-team (vs §1-§13 below)

| # | Report claim (§X) | Red-team finding | Disposition | Corrected to |
|---|---|---|---|---|
| 1 | §2 / §5.2 / §5.6 / §8: "19 ledger events" in `observation-vnstock-device-slot-ledger.yaml` | Verified by `grep -c '^\s*-\s*timestamp:'`: actual count is **18** | Accept | **18 events**. Conversion script asserts `length === 18`. |
| 2 | §5.2 / §5.6: forensic stub at `records/observations/_forensic-stubs/` bypasses `core/gate-logic.js:401` via "underscore prefix trick" | Factually wrong. `globMatch("records/observations/**", normalized)` matches any depth including subdirectories with any prefix. The glob does not look at directory names. | Accept | **`records/_unbound/<schema>/`** (sibling to `records/<vendor>/`). Verified: NOT under `records/observations/**` (hard-block) and NOT in `WRITE_PATH_PATTERNS` (conditional-block), so falls through to `decision: 'ok'`. |
| 3 | §5.3: 3 deleted `capability_*` tools "replaced by derivation functions in `core/derivation/derive-capabilities.js`" | Operator challenge (2026-06-12 22:35, `/ck:ask`): "Why derivation while we don't use that concept anymore?" The loop's reframe (master tracker § Phase A A3) makes `rule` entries the canonical capability representation. The derivation function is a new abstraction for a concept the loop no longer uses. | Accept | **No `core/derivation/derive-capabilities.js` file created.** The 3 `capability_*` tools are deleted with no replacement function. Callers query via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})` directly. |
| 4 | §5.5 / §5.6: 8 schemas deleted without specifying what happens to 40+ active records in `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` | The 40+ records would be silently orphaned — schema validation removed, index extraction pipeline broken, §8 #4 success metric fails. | Accept | **Phase 5 archives 40+ records to `records/_unbound/<schema>/<vendor>/`** before the schemas are deleted. The records stay queryable, unbound, and the archive is documented. |
| 5 | §5.1: `affected_system` as free string | Allows typos that corrupt the LRU cache key in `readRegistryWithCache` (Phase 1). | Accept | **`affected_system` is a Zod enum** (not free string), extending the existing 6-value enum (`'gate-logic' | 'record-validation' | 'index-extractor' | 'mcp-tools' | 'workflow-registry' | 'vnstock_vendor'`) with the new partition values. |
| 6 | §5.6: 6 tool files deleted (`capability_*` x3, `index_extract`, `index_search`, `index_update_claim`, `record_*observation*` x2) | Operator challenge (2026-06-12 22:42): "Why only capabilities, why not delete the evidence, claims, index tool, etc... as well?" — the same simplification logic that kills `capability` kills all 14 product-surface concepts. | Accept | **13 tool files deleted** (not 6). All product-surface tools referencing dead concepts. Net: **56 → 43 MCP tools** (down from the report's 50). |
| 7 | §5.2: sidecar `kind` is "ledger-event" / "budget-state" (extensible, not locked) | Stays. The `kind` enum is small and operator-extensible. | Accept (no change) | 2 kinds: `ledger-event` (the 18 events) and `budget-state` (extensible). |

### 0.3 Why we delete all 14 product-surface tools (operator's framing)

The 2026-06-12 reframe collapsed Bridge 5+6 into one atomic meta-surface. The meta-surface's 4-kind union (`finding | change-log | rule | loop-design`) is the *only* contract the loop writes. The product-surface concepts (`capability`, `claim`, `evidence`, `index-entry`, `decision`, `experiment`, `risk`, `observation`) were each attempts to *internalize* something the loop touched. Each attempt failed the same way (per §11.7.1's failure-mode genealogy): the registry wanted to be a *post*-state, and the concept was a *pre*-state or a *mutable state*, and forcing one into the other's shape produced a record that was structurally dishonest.

The 13 tools being deleted are the MCP surface for those failed registries. They:
- Encode the obsolete product-surface schema as Zod parameters (`capability_list_verified`'s `include_candidates`, `index_update_claim`'s `claim_id`/`status`, etc.).
- Write to obsolete paths (`records/evidence/**`, `records/capabilities/**`, `records/index/**`) that the gate's `WRITE_PATH_PATTERNS` no longer recognizes.
- Depend on schemas (`capability.schema.json`, `claim.schema.json`, `index-entry.schema.json`) being valid; deleting the schemas breaks them.

Keeping them as "stubs" or "deprecated" tools adds maintenance cost with zero value: no caller can usefully invoke a tool whose schema is deleted, and the meta-surface's existing tools cover every legitimate query (`meta_state_list` for rules-as-capabilities, `meta_state_query_drift` for staleness, `meta_state_relationships` for cross-references).

**The deletion is not a cleanup — it is the canonical end-state for those concepts.** The meta-surface is the only bound surface. The product-surface is unbound, archived, and the tools that operated on it are retired.

### 0.4 Plan location and structure

- **Plan file:** `plans/260612-1700-meta-surface-re-debate/plan.md`
- **Phases:** 8 (per operator selection; Phase 5 absorbs the archive step that the report did not address)
- **Total effort:** ~21h
- **Red-team report:** `plans/260612-1700-meta-surface-re-debate/reports/from-code-reviewer-to-planner-red-team-scope-complexity-critic-plan-review-report.md` (10 findings, 6 accepted, 4 rejected)

### 0.5 What this summary is NOT

- **Not a replacement for §1-§13.** The full design record, the dependency-balance convention (§11.1), the pre-mortem channel (§11.2), the revision loop (§11.3), and the failure-mode genealogy (§11.7) are all preserved below for forensic continuity.
- **Not a contract change.** §11 is closed (consensus 2026-06-12). The corrections in §0.2 are clarifications, not scope changes.
- **Not a promotion of any meta-state entry.** The corrections are reflected in the plan's Phase 1 (Zod enum), Phase 2 (count 18), Phase 5 (archive path), and Phase 7 (13 tool deletions), but no new `meta_state_log_change` is filed for the report itself.

---

## 1. Problem statement

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
| 1 | **Expected output** | (a) A design report (this file). (b) Future plan that ships: extended `meta-state.jsonl` schema; new `runtime-state.jsonl` sidecar; 8 schemas deleted; 22 tools deleted (per operator adjudication 2026-06-13; the original plan said 13, but the 7 `record_crud` "survivors" were also removed); 2 tools added; 18 ledger events converted from yaml. |
| 2 | **Acceptance criteria** | (a) The meta-surface's 4-kind union is preserved; no 5th kind. (b) `core/gate-logic.js#evaluateWritePath` continues to enforce write-path patterns after the schema change. (c) `meta_state_list({affected_system: 'vnstock'})` returns the same data the current `records/vnstock/` contains (after conversion). (d) `observation-vnstock-device-slot-ledger.yaml`'s 18 events appear in `runtime-state.jsonl` with a `source_ref` to a meta-state pointer. (e) `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` after the conversion. |
| 3 | **Scope boundary** | Phase A only. **Out of scope:** Bridge 5 engine Approach 3 (Phase B); Mastra migration (Phases C-E); Bridge 7 product-surface binding (Phase F); legacy `records/<vendor>/` content (stays unbound per §3.10). |
| 4 | **Non-negotiable constraints** | (a) 4-kind union locked since SP3 — no new kinds. (b) Internalization Rule (§6 of `AGENTS.md`) — every entry has a `code_ref` (extends `evidence_code_ref`). (c) The gate's read path continues to work. (d) `meta_state_resolve` consult-rule (`rule-no-orphaned-evidence`) must still apply after the schema change. (e) The `rule-no-new-artifact-types` consult-gate (AGENTS.md §2) must be respected; new root-level files (e.g., `runtime-state.jsonl`) need an `affected_system` partition, not parallel surfaces. |
| 5 | **Touchpoints** | `meta-state.jsonl`; `runtime-state.jsonl` (new); 8 `schemas/*.schema.json` (deleted in Phase 8); `records/observations/*.yaml` (8 files, archived to `records/_unbound/observation/`); `core/{meta-state,gate-logic,inbound-state,patterns}.js`; 16 `meta_state_*-tool.js`; 3 `capability_*-tool.js`; 5 of 5 `index_*-tool.js` (entire group removed per Phase 7 operator adjudication); 2 `record_*observation*-tool.js`; `tools/{manifest,agent-manifest}.json`. **Note:** `core/derivation/derive-capabilities.js` was originally proposed here as the replacement function for `capability_*` tools, but per red-team #3 / operator challenge 2026-06-12 22:35, no replacement function was created — the 3 capability tools are deleted with no replacement, and callers query via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})`. |

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

**Why it loses:** the 4-kind union is *load-bearing* for the test suite (985 tests pre-Phase A, 937 tests post-Phase A; structural changes need a release cycle). Predict Report 2 verdict: CAUTION, with the sidecar pattern (Approach A) as the recommended alternative.

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

**Conversion of `observation-vnstock-device-slot-ledger.yaml`**: 18 `ledger[]` rows → 18 `runtime-state.jsonl` rows with `kind: 'ledger-event'` (verified by `grep -c '^\s*-\s*timestamp:'` on the yaml; the report's original "19" was an off-by-one error corrected by red-team #1). The yaml is archived at `records/_unbound/observation/observation-vnstock-device-slot-ledger.yaml` (sibling to `records/<vendor>/`; this path falls through to `decision: 'ok'` because it is NOT under the gate's hard-block on `records/observations/**` and NOT in `WRITE_PATH_PATTERNS`). The report's original `_forensic-stubs/` path was factually wrong — `globMatch("records/observations/**", normalized)` matches any depth including subdirectories with any prefix; the glob does not look at directory names. The correct path is `records/_unbound/<schema>/` (per red-team #2). A new `finding` entry with `affected_system: 'vnstock'`, `ledger_ref: 'vnstock-device-slot'`, and `code_fingerprint: <sha256-of-conversion-script>` is added.

### 5.3 Capabilities as derived view (A3)

**Delete `schemas/capability.schema.json` and the 3 `capability_*` MCP tools.** A "capability" is the union of:
1. Meta-state `rule` entries with `affected_system: '<surface>'`.
2. A fingerprint scan of the code that calls each `rule`'s `code_ref`.

**Replacement queries:**
- "List verified capabilities for stack=api" → `meta_state_list({entry_kind: 'rule', affected_system: 'api'})` filtered by `code_ref_fingerprint_matches(code_path_scan())`.

**No replacement function.** Per red-team #3 / operator challenge 2026-06-12 22:35 ("Why derivation while we don't use that concept anymore?"), `core/derivation/derive-capabilities.js` is **not created**. The 3 `capability_*` tools are deleted with no replacement function — the derivation abstraction is for a concept the loop no longer uses. Callers query capabilities via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})` directly. The directory `tools/learning-loop-mcp/core/derivation/` does not exist in the post-Phase A tree.

### 5.4 Evidence + claim (A2, A4)

**Delete `claim.schema.json` and `index-entry.schema.json`.** The "evidence" concept is already in the meta-state: `finding.description` + `code_ref` + `evidence_journal`. The "claim" concept is a `rule` with `affected_system: <vendor>`.

**The `index_*` MCP tools (5 today) are deleted entirely** (per Phase 7 operator adjudication; the report's "5 → 2" reduction was superseded). The original report proposed keeping `index_validate` + `index_validate_plans` and dropping `index_extract` / `index_search` / `index_update_claim`, but the operator's "aggressive simplification" directive (2026-06-12 22:42) deleted the entire `index` group — `index_validate` and `index_validate_plans` did not survive. The `index` group does not exist in `agent-manifest.json` post-Phase A. Callers use `meta_state_list` + fingerprint scan via `meta_state_check_grounding` for any cross-reference query.

### 5.5 Engine binding (A5)

**No binding to product-surface types.** The Bridge 5 engine stays meta-surface only. The `schemas/*.schema.json` files (8 today) become 3:
- `schemas/meta-state.schema.json` (the 4-kind union, extended with `affected_system` + `code_ref` + `ledger_ref`).
- `schemas/runtime-state.schema.json` (the ledger shape).
- `schemas/plan.schema.json` (the plan shape, moved from `plans/.templates/`).

**The 8 unbound schemas (`capability`, `claim`, `decision`, `experiment`, `index-entry`, `observation`, `resource-budget`, `risk`) are deleted.** Forensic stub at `schemas/_unbound/_README.md` lists what was deleted and why. (Note: the report's original wording said "5 unbound schemas" but the parenthetical list contains 8 entries — corrected to 8 in §0.2.)

### 5.6 Touchpoints

| File / directory | Action |
|---|---|
| `meta-state.jsonl` | Extended in place; no migration needed (existing entries default `affected_system: 'meta'`) |
| `runtime-state.jsonl` | Created; 18 rows converted from `observation-vnstock-device-slot-ledger.yaml` |
| `schemas/meta-state.schema.json` | Created (replaces the 4 inline zod branches in `meta-state.js`) |
| `schemas/runtime-state.schema.json` | Created |
| `schemas/plan.schema.json` | Created (moved from `plans/.templates/`) — note: not in the final implementation; deferred (see plan § Phase 1) |
| `schemas/{capability,claim,experiment,risk,decision,observation,resource-budget,index-entry}.schema.json` | Deleted (8 files) |
| `schemas/_unbound/_README.md` | Created (forensic record of deletions) |
| `records/observations/*.yaml` (8 files) | Archived to `records/_unbound/observation/`; 18 ledger events extracted to `runtime-state.jsonl` |
| `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/*.yaml` (40+ files) | Archived to `records/_unbound/<schema>/vnstock/` (Phase 5; added per red-team #4) |
| `records/<vendor>/**` (other vendors) | Unchanged (already unbound per §3.10) |
| `tools/learning-loop-mcp/core/meta-state.js` | Refactored: 4 zod branches → 1 imported `metaStateSchema`; add `affected_system`, `code_ref`, `ledger_ref`. **Note:** the import is deferred to Bridge 5 Phase B3 (see `phase-a-remaining-work.md` item 7); Phase 1 ships the schema + field support, the refactor lands when the codegen engine can produce the 4 zod schemas |
| `tools/learning-loop-mcp/core/gate-logic.js` | Refactored: `loadPromotedRules` filters by `affected_system`; add `loadLedger(affected_system)` |
| `tools/learning-loop-mcp/core/inbound-state.js` | Refactored: `checkObservationStaleness` partitions by `affected_system` and reads `runtime-state.jsonl` for non-meta observations (14 new tests in `__tests__/inbound-state-runtime-state.test.js`) |
| `tools/learning-loop-mcp/core/read-registry-cache.js` | **No-op** (the existing mtime+size cache key is already correct for a single-file registry; per `phase-a-remaining-work.md` item 8) |
| `tools/learning-loop-mcp/tools/meta-state-*-tool.js` | Updated: new fields surface as optional params |
| `tools/learning-loop-mcp/tools/{capability,index,record,workflow-product-surface}-*-tool.js` | Deleted (13 files per the plan; final 22 per operator adjudication 2026-06-13 — all 7 `record_crud` "survivors" also removed) |
| `tools/learning-loop-mcp/tools/runtime-state-read-tool.js` | Created (1 file) |
| `tools/learning-loop-mcp/tools/runtime-state-record-tool.js` | Created (1 file, operator-preflighted) |
| `tools/manifest.json` / `agent-manifest.json` | Updated: drop 22 tools, add 2. **Note:** `agent-manifest.json` post-Phase A has 4 groups (`gate`, `workflow`, `meta_state`, `introspection`); the `capability`, `index`, and `record_crud` groups are gone. Net manifest count: 38 (down from 56) |
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
| The 18 ledger events in `observation-vnstock-device-slot-ledger.yaml` need a verbatim conversion; a typo in `value`/`delta` could mask a real budget issue | High | The conversion is a 1-shot script with a verification step: the script reads the yaml, writes the JSONL, then asserts the new JSONL parses to 18 events with `delta` values that sum to the yaml's last-known state |
| Adding `runtime-state.jsonl` triggers the `rule-no-new-artifact-types` consult-gate | Medium | The rule's regex is `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)` — `runtime-state.jsonl` is a JSONL file, not a "schema" or "artifact type" in the rule's sense. Confirm via `gate_check` before any code that creates the file. |
| The 13-22 deleted MCP tools are referenced by `agent-manifest.json` (56-tool surface) and possibly external skills (`.claude/skills/**`, `.factory/skills/**`) | Medium | `meta_state_log_change` with `change_target: 'tools/manifest.json'` documents the deprecation in the audit trail (entry `meta-260613T0138Z-phase-a-tools-deleted`, 22 tools listed); the next `/ck:scout` or `/ck:cook` will surface the skill references |
| The 8 deleted schemas are imported by the 22 deleted tools; deleting the tools first requires deleting the schemas last (dependency order) | Low | The plan's 8 Phase A sub-phases enforce the order: (1) add new fields to meta-state; (2) convert ledger; (3) create `runtime-state.jsonl`; (4) add 2 new tools; (5) archive 40+ records; (6) wire-format + gate patterns; (7) delete 22 old tools; (8) delete 8 old schemas + write forensic README |

## 8. Success metrics and validation criteria

1. **Test parity:** the test suite passes after the changes. Baseline pre-Phase A: 985 tests (984 pass, 1 skipped) verified 2026-06-12. Post-Phase A: 937 tests (934 pass, 1 skipped, 2 pre-existing failures in `migrate-rule-entry-kind.test.js` unrelated to Phase A; per `phase-a-remaining-work.md` item 10). Any new tests cover the new fields + the sidecar + the partitioning.
2. **Schema validation:** `schemas/meta-state.schema.json` rejects entries with missing `affected_system` (defaults to `'meta'` for legacy entries via a Zod preprocess).
3. **Gate behavior:** `core/gate-logic.js#evaluateWritePath` continues to return `decision: 'block'` for `records/observations/**` and `decision: 'ok'` for `records/_unbound/**` (verified) and `schemas/meta-state.schema.json`.
4. **Query parity:** `meta_state_list({affected_system: 'vnstock'})` returns the same data the current `records/vnstock/decisions/*.yaml` + `experiments/*.yaml` + `risks/*.yaml` contain, after conversion.
5. **Ledger conversion:** the 18 events from `observation-vnstock-device-slot-ledger.yaml` appear in `runtime-state.jsonl` with consistent `value`/`delta` arithmetic (assertion `length === 18` enforced by the conversion script).
6. **Staleness check:** `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` for the 18 converted ledger events. (Function partitioned by `affected_system`; 14 new tests in `__tests__/inbound-state-runtime-state.test.js`.)
7. **Capability query:** `meta_state_list({entry_kind: 'rule', affected_system: 'vnstock'})` returns the same set of capabilities the original `capability_list_verified` tool returned, plus a fresh fingerprint scan via `meta_state_check_grounding`. No derivation function exists.

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

## 11. Consensus on operator intent + skill authority (260612 closeout)

**Status:** **closed 2026-06-12, second-pass consensus.** The original §11 ("Open question from operator (260612): operator intent + revision loop") was a multi-section open question across several iterations of self-correction. The closeout is the result of the operator's confirmation on 2026-06-12 of the dependency-balance convention and the post-productization skill-migration track.

The full pre-consensus draft is preserved in §11.6 (Archived open-question drafts) for forensic continuity. The current section is the consensus.

### 11.1 The dependency-balance convention (operator-confirmed 2026-06-12)

The operator's two-pronged §11 question (where does operator intent live, and how does the loop revise/improve a prior decision?) resolves into three dependency-balance rules:

| Concern | Authority | Rationale |
|---|---|---|
| **Plan-file authoring** (the pre-mortem) | The loop | The plan file is the contract. `ck:plan` is one way to write a plan file, not the only way. Whatever tool scaffolds the plan, the resulting `change-log` entry with `change_target: 'plans/.../plan.md'` is what makes the plan loop-citable. The skill is a helper, not the authority. |
| **Code execution mechanics** (scaffolding, cooking, testing, review) | The skill (with citation) | The `ck:*` skills are session-scoped, execution-focused. The rule: every skill invocation must be cited in the resulting `finding` or `change-log` entry's `evidence_journal`. A skill run the loop does not know about is a bypass waiting to happen. |
| **The contract itself** (the rule, the decision boundary, the consult-gate pattern) | The loop, no exceptions | The meta-surface is the only authoritative source. Skills may *apply* the contract; they do not *define* it. The rule's `pattern` + `enforcement` is the contract. |

**Single-sentence summary:** *Skills execute; the loop records; the meta-surface is the only thing that survives.* The plan-file convention is what makes that sentence operational — it is the artifact where operator intent meets agent execution without either one bypassing the loop.

### 11.2 The pre-mortem channel is the plan file (no schema change)

The 4-kind union is locked. No `method: []` field on `finding`; no `effect: {}` field on `rule`. The pre-mortem already has a home:

1. Operator (or agent on operator's behalf) writes `plans/<date>-<slug>/plan.md` *before* running the investigation. This is the pre-mortem: the hypothesis, the method, the success metrics, the boundaries.
2. The investigation runs (experiment, vendor interaction, code change).
3. The post-hit finding is filed via `meta_state_report`, with `evidence_journal: 'plans/<date>-<slug>/plan.md'` pointing back at the pre-mortem file.
4. The rule (if the finding is promoted) carries the contract via `pattern` + `enforcement`, citing the plan via `evidence_journal` or `addresses`.

The convention is in **active use today** (e.g., `evidence_journal: 'plans/260603-sp3-drift/plan.md'`, `evidence_journal: 'plans/260605-superseded-status-and-discoverability/plan.md'`, `evidence_journal: 'plans/reports/brainstorm-260602-sp0-log-change.md'` — three different real examples spanning change-log, finding, and rule entries). The convention is honored, not enforced.

**The enforcement question is deferred to the cold-session test** (post-Phase A) with a single mechanical guard: "for every active `finding` with `affected_system != 'meta'`, `evidence_journal` points at a file that exists on disk." This catches the actual failure mode (a citation that has been renamed/archived/deleted) without dictating the plan format. Required for Phase A: no. Recommended post-Phase A: yes.

### 11.3 The revision loop is the meta-surface's existing supersede + promote machinery

The operator's revision question ("how do we revise a prior decision?") resolves into two cases:

- **Revise the recipe (the pre-mortem was wrong):** the plan file is mutable. Edit it and file a `change-log` entry with `change_target: 'plans/.../plan.md'`. No schema change. The Internalization Rule is preserved.
- **Revise the contract (the rule is wrong):** the meta-surface has `meta_state_supersede` (a rule can be superseded by another rule with `supersedes: <old-rule-id>`). The superseded rule stays in the registry for lineage. The new rule is the new contract.

**What the loop *cannot* do today:** revise a *conclusion* the operator disagrees with, on the operator's authority alone, without going through the finding's `mechanism_check`. The fingerprint check (`meta_state_check_grounding`) and the `rule-no-orphaned-evidence` consult-gate are exactly the protections that prevent operator overrule from quietly invalidating empirical claims. This is the philosophical position of `docs/philosophy.md` ("Decisions Are Boundaries, Not Permissions"): a decision's blocked actions matter more than its allowed actions, and the loop's job is to keep the boundary visible.

### 11.4 The skill-migration target (moved to master tracker Phase G, 2026-06-12)

The operator confirmed the long-term intent: **after the meta-surface productizes, the loop will own `ck:plan`, `ck:cook`, and `ck:journal` as MCP tools.** This is the natural extension of the §11.1 dependency-balance convention.

**This sub-section has been moved to the productization master tracker as Phase G — Skill Migration Track** (see `plans/reports/productization-260612-1530-master-tracker.md` Phase G). The reason: the skill migration is a **mechanics** concern, not a **content/code/self-model** concern. Phases A-F of the master tracker are about *what the loop records / builds / learns about itself*; Phase G is about *how the work gets done in a single session*. The migration does not belong in a Phase A re-debate report; it belongs in its own parallel-dimension phase.

**What this sub-section keeps in the Phase A report (the operator-confirmed intent):**

- The dependency-balance convention (§11.1) names the migration target. The plan-file convention is internalizing, the `ck:*` skills are session-cited helpers, the contract is meta-surface-owned.
- The post-productization direction is operator-confirmed: the loop will own `ck:plan`, `ck:cook`, and `ck:journal` as MCP tools.
- The full design (migration sequence, stop condition, pre-conditions, NOTs) lives in three places: the master tracker (Phase G), `docs/trajectory.md` §4.7, and `docs/philosophy.md` Pillar 4.

**What this sub-section no longer contains (moved to the master tracker):**

- The migration sequence (`ck:plan` → `ck:journal` → `ck:cook`) — see Phase G1, G2, G3.
- The stop condition (cite-or-else semantics, three conditions) — see Phase G preamble.
- The pre-conditions to start the track — see Phase G preamble.
- The four "NOTs" (not replacement, not 4-kind refactor, not Bridge 1-4, not in Phase A scope) — see Phase G preamble.

**Cross-references for the moved content:**

- **Master tracker (canonical phase state):** `plans/reports/productization-260612-1530-master-tracker.md` Phase G — Skill Migration Track.
- **Trajectory (long-term direction):** `docs/trajectory.md` §4.7 — The skill-migration track.
- **Philosophy (pillar-level framing):** `docs/philosophy.md` Pillar 4 — Skill Authority vs. Loop Authority.

### 11.5 Phase A scope is unchanged (the consensus confirms it)

The consensus does **not** expand Phase A scope. Phase A remains:

- §5.1 storage shape (extend `meta-state.jsonl` with `affected_system` + `code_ref` + `ledger_ref`; add `runtime-state.jsonl` sidecar).
- §5.2 state-machine semantics (counter pattern, conversion of `observation-vnstock-device-slot-ledger.yaml`).
- §5.3 capabilities as derived view (delete `schemas/capability.schema.json` + 3 `capability_*` tools).
- §5.4 evidence + claim (delete `claim.schema.json` + `index-entry.schema.json`; reduce 5 `index_*` tools to 2).
- §5.5 engine binding (no binding to product-surface types; 3 schemas remain, 8 deleted).
- §5.6 touchpoints (per the dependency-ordered phase list).

**What Phase A also commits to, in light of the consensus:**

- The plan-file + `evidence_journal` convention is named as the pre-mortem channel in the §5.1 design rationale. No new field on `finding` or `rule`.
- The skill-migration target is **not in Phase A** — it is **Phase G** of the productization master tracker (a parallel-dimension mechanics phase; see §11.4 for the move note). The convention is the bridge: §11.1 lives in Phase A; the implementation lives in Phase G.
- The cold-session test's planned §11.2 enforcement check ("for every active `finding` with `affected_system != 'meta'`, `evidence_journal` points at a file that exists on disk") is **also out of scope** for Phase A. It is recommended post-Phase A.

**Net effect of the consensus on Phase A:** zero scope change. The consensus is a *philosophical + trajectory* commitment, not a *Phase A* commitment. Phase A still ships the 8 sub-phases named in §5.6 and §13. The skill-migration *target* is captured by Phase G of the master tracker; the *convention* that motivates it is captured here.

### 11.6 Archived open-question drafts (forensic continuity)

The original §11 was a multi-section open question. Its drafts are preserved here for forensic continuity, so the closeout is auditable. The drafts are not part of the consensus; they are the conversation that produced the consensus.

- **§11.1 (legacy 3-stage pipeline):** identified that the legacy `claim → experiment → decision` workflow had a recipe (the experiment) and a contract (the decision) on top of the result. *Resolution:* the recipe is the plan file; the contract is the rule's `pattern` + `enforcement`. No new schema fields needed.
- **§11.2 (the inversion insight):** legacy model is top-down (operator hypothesis → agent verification → operator commitment); the meta-surface is bottom-up (agent observation → operator ack). The 4 kinds describe *states of the loop's self-model*, not *stages of an investigation*. *Resolution:* the operator's "I want to test if X" is a *question* the operator asks the loop, not a *command* to it. The pre-mortem is the plan file.
- **§11.3 (the pre-mortem lifecycle problem, corrected):** every meta-surface entry is post-hit, retrospective, audit-trail-shaped. A `method: []` field on a `finding` is structurally wrong, not just "deferred" — at the moment the finding is created, the agent has *already* hit the thing. *Resolution:* the pre-mortem has a home (the plan file), and it is not in the meta-surface. The Internalization Rule is preserved.
- **§11.4 (what Phase A clears the way for, revised, sharper):** Phase A does not add a `method` field, does not add an `effect` field, does not pre-design a revision workflow. Phase A confirms the meta-surface lifecycle is correct as documented, confirms the plan-file + `evidence_journal` convention is the pre-mortem channel, and names the open questions as *convention-enforcement* + *context-engineering* problems, not *meta-surface-schema* problems. *Resolution:* the consensus agrees; the open questions are deferred to post-Phase A tracks (cold-session test enforcement; `/ck:context-engineering` for cross-surface isolation; the skill-migration track for the cited-helpers question).
- **§11.4 (post-productization skill-migration target, original draft, **moved**):** the original §11.4 was the full design of the skill-migration track (sequence, stop condition, pre-conditions, NOTs). On 2026-06-12 second-pass review, the operator confirmed that the skill-migration content is a *mechanics* concern, not a *content/code/self-model* concern, and therefore does not belong in a Phase A re-debate report. **The content has been moved to the productization master tracker as Phase G — Skill Migration Track** (`plans/reports/productization-260612-1530-master-tracker.md` Phase G), with cross-references to `docs/trajectory.md` §4.7 and `docs/philosophy.md` Pillar 4. The §11.4 in this report is now a thin pointer to the canonical home.
- **§11.5 (open sub-questions, final minimum set):** three sub-questions: (1) is the pre-mortem channel correctly identified? (2) should the pre-mortem convention be enforced or stay honored-by-convention? (3) is the cross-surface isolation problem a Phase A concern? *Resolution:* (1) yes (the plan file); (2) stay honored-by-convention for Phase A, with the cold-session test check as a post-Phase A recommendation; (3) no (it is a context-engineering problem, correctly deferred to `/ck:context-engineering`).

### 11.7 Why this scope, not the registries we already tried

§11.1 through §11.6 name *what* the convention is: plan-file authoring is the pre-mortem, `ck:*` skills are cited executors, the meta-surface is the contract, the skill-migration is the post-productization mechanics track. This sub-section names *why* the convention is what it is — specifically, why the pre-mortem lives at `plans/<date>-<slug>/plan.md` and not in any of the product-surface registries we have already tried, and why the dependency-balance (loop / skill / external) is the correct way to draw the line, not "internalize everything the loop touches."

#### 11.7.1 Why `plans/` is the correct scope (and the registries we tried are not)

Before the 2026-06-12 reframe, the loop attempted to internalize the pre-mortem into the product surface four times, with four different registry shapes. Each attempt failed the same way: the registry wanted to be a *record* of what the loop already learned, and the pre-mortem is *what the loop plans to learn* — the two have opposite temporal directions.

| Attempted registry | What it tried to capture | Why it failed as a pre-mortem |
|---|---|---|
| `evidence` (md files in `records/<vendor>/evidence/`) | A canonical narrative for "we read the vendor doc and saw X" | Static, post-hit. By the time the file exists, the reading is done. A pre-mortem is the *plan to read*, not the record of having read. |
| `index-entry` / `claim` (`schemas/{index-entry,claim}.schema.json` + `index_*` tools) | A typed assertion ("vendor X supports Y") with verification status | Status enum (`active \| superseded \| pending_approval`) is post-attestation. The pre-mortem has no status — it has a hypothesis, a method, a budget. Forcing pre-mortems into a status shape is what §11.3 archived as "the pre-mortem lifecycle problem": a `method: []` field on a `finding` is structurally wrong, not just deferred, because at the moment of creation the agent has *already* hit the thing. |
| `experiment` (yaml in `records/<vendor>/experiments/`) | Hypothesis + method + result | Closer in shape, but the schema is post-result. A pre-mortem has no `result` field. Padding the schema with `result: null` and conditional validation re-introduces the lifecycle problem at a finer granularity. |
| `observation` (yaml in `records/observations/`, e.g. `observation-vnstock-device-slot-ledger.yaml`) | A mutable fact about an *external* system (device slot consumed, budget exhausted) | Wrong axis entirely. Observations are about the substrate the loop operates against, not about the loop's own investigations. Phase A §5.1 moves the 18 ledger events to `runtime-state.jsonl` precisely because they are *mutable state*, not *static record*. |
| `capability` (yaml + `capability_*-tool.js`, deleted in Phase A) | A typed "the loop can do X" with verified status | Post-verification by construction. A pre-mortem is the plan to *verify*; the capability is the result. The two are not the same record. |

The pattern: **every registry we invented wanted to encode a *post*-state, and the pre-mortem is a *pre*-state.** Forcing a pre-state into a post-state shape (via nullable `result` fields, conditional `status` enums, post-hoc "intent" discriminators) produces a record that is structurally dishonest — it claims to be a pre-mortem but reads as a post-mortem with empty fields.

**`plans/<date>-<slug>/plan.md` is the correct scope because it is a markdown file the operator (or agent on the operator's behalf) authors *before* the investigation runs.** It is the one shape the loop has not yet tried to internalize, and for a principled reason: the plan file is *mutable on purpose* (§11.3 revision case 1), *readable to humans* (the operator's working memory), and *not yet load-bearing for the next agent's behavior* (the load-bearing shape is the resulting `finding` or `change-log` entry, which cites the plan file via `evidence_journal`). The plan file is the pre-mortem channel; the meta-surface is the post-mortem channel; the two are linked by the Internalization Rule (`AGENTS.md` §6), not collapsed into one shape.

**The convention is not "give up on internalizing the pre-mortem."** The convention is "the pre-mortem has a different shape and a different lifecycle than the post-mortem, and collapsing them is what produced the four failed registries above." A future Bridge may give the pre-mortem its own loop-citable surface (e.g., a `pre-mortem` kind in the meta-surface, or a `loop_plan_create` MCP tool — see Phase G of the master tracker). For Phase A, the plan file is the right scope because it preserves the temporal direction.

#### 11.7.2 Why the dependency-balance convention is the correct way, not "internalize everything"

The naive version of the Internalization Rule (`AGENTS.md` §6) is "if the loop touches it, the loop owns it." The dependency-balance convention (§11.1) is the operator-confirmed correction: there are three classes of work, and only one of them is fully internalizable. The classes are defined by *what the loop is allowed to know about itself*, not by what the loop happens to touch in a given session.

| Class | What the loop can know | Why it is or is not fully internalizable |
|---|---|---|
| **External system** (vendor API, device slot, budget, install/runtime contract) | The loop reads the substrate but does not define it. Observations are *operator-authored* (`docs/philosophy.md` §11); an agent that could update its own budget would have no external constraint. | **Not internalizable.** The loop must remain a *consumer* of external-system state, not the source. `meta_state_derive_status` does not re-derive the budget; it asks the operator. The two-tier governance model in `docs/philosophy.md` ("Governance Model: Two Tiers") is the source for this boundary. |
| **Internal implementation** (refactoring, module extraction, naming, structure within approved boundaries) | The loop writes the code and the code is its own record. A fingerprint is enough. | **Internalizable, but only the *citation*, not the *execution*.** The skill (`ck:cook`, `ck:refactor`, etc.) does the work; the loop records that it happened via a `change-log` entry with `change_target` pointing at the file. Trying to internalize the *execution* (i.e., replace the skill with a loop-owned executor) is Phase G's job, and even Phase G keeps the skill markdown as the readable spec. |
| **The contract itself** (the rule, the decision boundary, the consult-gate pattern) | The loop enforces it. The pattern + enforcement is the rule. | **Fully internalizable, no exceptions.** The meta-surface is the only authoritative source. Skills may *apply* the contract; they do not *define* it. This is the row in §11.1's table where the rule is "the loop, no exceptions." |

**Why the balance is correct, not "internalize everything":**

1. **Internalizing the external produces a closed loop with no ground truth.** If the loop both defines and verifies the device-slot budget, the budget becomes a self-fulfilling measurement. The loop's job is to be *pinned to* the substrate, not to *be* the substrate. The `rule-no-orphaned-evidence` consult-gate (which blocks `meta_state_resolve` when the code fingerprint is stale) is the same shape at a finer granularity: the loop's claims must be re-checked against the code, not against the loop's memory of the code.

2. **Internalizing the internal execution is unbounded scope.** The `ck:*` family currently has ~25 skills. Internalizing the *execution* of each one is a multi-quarter migration with a large surface for the gate logic to police. Internalizing the *citation* (a `change-log` entry per skill invocation) is one rule plus one MCP tool. The cite-or-else semantics of Phase G is the right size for the loop to enforce; the replace-the-skill semantics is the wrong size.

3. **Internalizing the contract is the only class with a clean stopping rule.** "Internalize the contract" terminates when the rule is promoted and the gate enforces it (the `meta_state_promote_rule` MCP tool is the terminal step). "Internalize the external" and "internalize the internal execution" have no analogous terminal step — the substrate can always grow a new vendor, the skill family can always grow a new helper. The dependency-balance convention is *which classes have a clean stopping rule*; the loop internalizes the class with a stopping rule and stops there.

**Single-sentence summary (extends §11.1):** *The loop internalizes the contract (full authority), cites the internal implementation (recording, not replacement), and reads the external system (consumer, not source).* The three classes are not "important / less important / least important" — they are three different relationships to the loop's self-model, and the wrong relationship in any one class breaks the system. A loop that owns its budget is a closed loop. A loop that replaces every skill is a slow skill. A loop that forgets its rules is a loop that does not survive its next refactor.

**Net effect of §11.7 on the consensus:** zero scope change. §11.1's table and the Phase G migration target are unchanged. What is added is the *failure-mode genealogy* (the four registries we tried) and the *three-class framework* (external / internal-implementation / contract), so a future agent reading §11.1 does not have to rediscover why "internalize everything" is wrong by repeating the four failed attempts.

---

## 12. References

- `plans/reports/productization-260612-1530-master-tracker.md` § Phase A — the canonical tracker; this report advances A1-A5 from open to designed.
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 — the 2026-06-12 reframe that locked the meta-surface as the only bound surface.
- `AGENTS.md` §1, §6, §10 — the meta-surface thesis, the Internalization Rule, the Bridges reframe.
- `tools/learning-loop-mcp/core/meta-state.js#REGISTRY_FILENAME` — the hard-coded constant that constrains Section 5.1.
- `tools/learning-loop-mcp/core/gate-logic.js:401` — the hard-block on `records/observations/**` that constrains the forensic stub location.
- `tools/learning-loop-mcp/core/inbound-state.js#checkObservationStaleness` — the staleness check that must continue to work after the conversion.
- `tools/learning-loop-mcp/core/patterns.json` — the constraint patterns; the new `side-effect-import` for `runtime_state_record` follows the same shape.
- `records/observations/observation-vnstock-device-slot-ledger.yaml` — the 19-event ledger that becomes the seed data for `runtime-state.jsonl`.
- `schemas/{capability,claim,experiment,risk,decision,observation,resource-budget,index-entry}.schema.json` — the 8 schemas to be deleted.

## 13. Next steps (when the operator is ready to plan)

1. **§11 is closed (consensus reached 2026-06-12).** The dependency-balance convention, the pre-mortem channel, and the revision loop are all operator-confirmed. The post-productization skill-migration target has been moved to the master tracker as **Phase G** (mechanics, not content — does not belong in a Phase A re-debate report; see §11.4 for the move note). The consensus does **not** expand Phase A scope; Phase A is unchanged.
2. Open a `plans/260612-1700-meta-surface-re-debate/plan.md` (or similar) with 8 sub-phases (one per touchpoint category in Section 5.6).
3. The plan's Phase 0 declares the 4-kind union stability check (the SP3 lock per the master tracker § Phase B1) and the §11.5 closed-consensus check (no `method` field on `finding`, no `effect` field on `rule`, plan-file + `evidence_journal` is the pre-mortem channel).
4. The plan's Phase 1-8 ships the changes in dependency order: meta-state schema → ledger conversion → runtime-state.jsonl → 2 new tools → 40+ record archive → wire-format + gate patterns → 22 tool deletions → 8 schema deletions. (No `method` / `effect` field additions; those are structurally wrong by the meta-state lifecycle, not just deferred.)
5. The plan's Phase 8 updates the master tracker: A1-A5 flip from `[ ]` to `[x]`. Phase A closure is recorded via `meta_state_log_change` with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` and `change_dimension: 'semantic'`.
6. **Other tracks (not in this plan, not in Phase A scope):**
   - **Phase G — Skill Migration Track** (per master tracker Phase G, `docs/trajectory.md` §4.7, `docs/philosophy.md` Pillar 4): `ck:plan` → `ck:journal` → `ck:cook` migration as MCP tools. **Canonical home is the master tracker Phase G**, not this report. Pre-conditions: Phase A ships, the dependency-balance convention is operational. Can ship in parallel with any of Phases A-F.
   - **Cold-session test enforcement check** (per §11.2): "for every active `finding` with `affected_system != 'meta'`, `evidence_journal` points at a file that exists on disk." Scheduled after Phase A. Mechanical, non-prescriptive.
   - **Cross-surface isolation** (per §11.5.3): context-engineering problem, correctly deferred to `/ck:context-engineering`. Not a Phase A concern.

**Operator declined `/ck:plan` handoff for this session** (closing conversation). The report is the deliverable. When the operator is ready, the planning will pick up at step 2; the post-Phase A tracks (cold-session enforcement, cross-surface isolation) and the parallel-dimension Phase G skill-migration track are tracked in the productization master tracker.
