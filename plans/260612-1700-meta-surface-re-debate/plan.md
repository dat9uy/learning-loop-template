---
title: "Phase A — Meta-Surface Re-Debate (one consolidated file + sidecar)"
description: "Extend meta-state.jsonl with affected_system + code_ref + ledger_ref; add runtime-state.jsonl sidecar; convert 18 ledger events; archive 40+ product records to records/_unbound/; delete 8 schemas + 13 product-surface tools. Net: 56 → 43 MCP tools; meta-surface becomes the only bound surface; product surface is unbound and re-debated from the meta-surface."
status: pending
priority: P2
branch: "main"
tags: [meta-surface, phase-a, product-surface-re-debate, bridge-7]
blockedBy: []
blocks: ["phase-b", "phase-c", "phase-d", "phase-e", "phase-f"]
created: "2026-06-12T15:43:14.148Z"
createdBy: "ck:plan"
source: skill
---

# Phase A — Meta-Surface Re-Debate (one consolidated file + sidecar)

## Overview

Implements the re-debate of the product surface using the meta-surface as substrate. The 2026-06-12 reframe (per `AGENTS.md` §1, §10) locked the meta-surface as the only bound surface; the product surface is unbound and re-debated from the meta-surface. This plan ships the design from `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` (operator-approved 2026-06-12 16:10), refined by a 4-lens red-team review (2026-06-12 22:13) and operator adjudication.

**Source design:** `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` (Approach A — one consolidated file + sidecar)
**Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` Phase A (A1-A5)
**Red-team report:** `plans/260612-1700-meta-surface-re-debate/reports/from-code-reviewer-to-planner-red-team-scope-complexity-critic-plan-review-report.md`

**What ships:**
- `meta-state.jsonl` extended with `affected_system` (enum, not free string), `code_ref` (optional, SHA-256 fingerprinted), `ledger_ref` (optional, pointer to sidecar).
- `runtime-state.jsonl` sidecar for mutable state (kind: ledger-event | budget-state).
- 18 ledger events converted from `records/observations/observation-vnstock-device-slot-ledger.yaml` to `runtime-state.jsonl` (corrected from report's "19" — verified by `grep -c '^\s*-\s*timestamp:'` = 18).
- 40+ product-surface records archived to `records/_unbound/<schema>/` (sibling to `records/vnstock/`, outside the gate's hard-block on `records/observations/**` and outside the WRITE_PATH_PATTERNS).
- 8 unbound product-surface schemas deleted: `capability`, `claim`, `experiment`, `risk`, `decision`, `observation`, `resource-budget`, `index-entry`.
- 13 product-surface MCP tools deleted (down from 56 to 43): `capability_generate`, `capability_list_probes`, `capability_list_verified`, `index_extract`, `index_search`, `index_update_claim`, `record_create_observation`, `record_update_observation`, `workflow_convert_evidence`, `workflow_verify_evidence`, `workflow_external_decision`, `workflow_candidate_to_experiment`, `workflow_vendor_doc_assist`.
- 2 new MCP tools added: `runtime_state_read` (read-only, agent-callable), `runtime_state_record` (operator-preflighted, not agent-callable).
- `core/gate-logic.js` updated: `loadPromotedRules` filters by `affected_system`; new `runtime_state_record` added to bash-gate's `side-effect-import` category.
- `core/inbound-state.js#checkObservationStaleness` updated: partitions by `affected_system: 'meta'` and reads from `runtime-state.jsonl` for affected_system != 'meta'.
- `core/meta-state.js` refactored: 4 inline zod branches consolidated into 1 imported `metaStateSchema` from `schemas/meta-state.schema.json`.
- `core/read-registry-cache.js` updated: LRU cache key includes `affected_system`.

**What is NOT in scope (deferred to other phases):**
- Bridge 5 engine Approach 3 codegen (Phase B)
- Mastra migration (Phases C-E)
- Bridge 7 product-surface binding (Phase F) — this is the re-debate; binding is the next-step decision
- Skill migration track (Phase G) — independent parallel dimension
- Cold-session test enforcement check (post-Phase A, per §11.2 of the design report)

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Schema-Extension](./phase-01-schema-extension.md) | Pending | 3h | — |
| 2 | [Ledger-Conversion](./phase-02-ledger-conversion.md) | Pending | 2h | 1 |
| 3 | [Runtime-State-Sidecar](./phase-03-runtime-state-sidecar.md) | Pending | 2h | 1 |
| 4 | [Runtime-State-Tools](./phase-04-runtime-state-tools.md) | Pending | 4h | 1, 3 |
| 5 | [Archive-Product-Records](./phase-05-archive-product-records.md) | Pending | 4h | 1 |
| 6 | [Wire-Format-and-Gate-Patterns](./phase-06-wire-format-and-gate-patterns.md) | Pending | 3h | 4 |
| 7 | [Delete-Product-Tools](./phase-07-delete-product-tools.md) | Pending | 2h | 5, 6 |
| 8 | [Delete-Product-Schemas](./phase-08-delete-product-schemas.md) | Pending | 1h | 7 |

**Total effort:** ~21h

## Design Decisions Locked (per operator adjudication 2026-06-12 22:30)

| Decision | Resolution | Rationale |
|---|---|---|
| Ledger event count | **18** (not 19) | Verified by `grep -c '^\s*-\s*timestamp:'` on the yaml. Conversion script asserts `length === 18`. |
| Forensic stub location | **`records/_unbound/<schema>/`** (sibling to `records/vnstock/`) | The report's `records/observations/_forensic-stubs/` was factually wrong (the glob `records/observations/**` matches any depth). Verified: `records/_unbound/**` falls through to `decision: 'ok'` (NOT in WRITE_PATH_PATTERNS, NOT under `records/observations/**`). |
| Capability as derivation | **Dropped — no `core/derivation/derive-capabilities.js` file** | The loop's reframe (master tracker § Phase A A3) makes `rule` entries the canonical capability representation. The derivation function is a new abstraction for a concept the loop no longer uses. Callers query via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})` directly. |
| Deletion scope | **Aggressive simplification — 13 tools** (not just 6) | User confirmed: delete all product-surface tools referencing dead concepts. Net: 56 → 43 tools. |
| `affected_system` type | **Zod enum, not free string** | Maintains load-bearing property; LRU cache key has stable values; typos detected at write time. |
| Derivation function for capabilities | **No replacement** | Simpler; the meta-state's `rule` entries are the canonical capability representation. |
| Phase structure | **8 sub-phases, same shape as original report** | Per operator selection; Phase 5 absorbs the archive step that the original report did not address. |

## Cross-Plan Dependencies

| Plan | Direction | Reason |
|---|---|---|
| `260608-1015-meta-state-patch-tool-and-wire-format-fix` | none (independent) | Already shipped; provides the wire-format coercion helpers that Phase 6 reproduces in regression tests |
| `260608-2255-index-extractor-optimization` | none (independent) | Already shipped; provides the LRU cache that Phase 1 extends with `affected_system` partition |
| `260611-1000-remove-expired-status` | none (independent) | Already shipped; provides the status enum that Phase 1 leaves unchanged |
| `260611-1700-loop-get-instruction` | none (independent) | Already shipped; provides the introspection layer that Phase 4's `runtime_state_read` is grouped with |
| Phase B (Bridge 5 codegen) | **blocked by this plan** | The codegen engine generates writers/validators for the extended meta-state schema |
| Phase C (Mastra Phase 0-1) | **blocked by this plan** | The Mastra server consumes the extended `meta_state_*` tools |
| Phase D (Mastra Phase 2-3) | blocked by Phase C | Sequential |
| Phase E (Mastra Phase 4-5) | blocked by Phase D | Sequential |
| Phase F (Bridge 7) | blocked by this plan | The product-surface re-debate conclusions feed the binding decision |
| Phase G (Skill migration) | **independent** | Parallel dimension; can ship in any order |

## Success Criteria

The plan ships when ALL of the following are true:

### 1. Test parity
- [ ] The 985-test suite (verified 2026-06-12: 984 pass, 1 skipped, 147 suites) passes after Phase 8.
- [ ] Phase 1 adds ≥5 new tests (affected_system validation, code_ref fingerprint, ledger_ref pointer).
- [ ] Phase 2 adds ≥2 new tests (ledger conversion, sidecar write).
- [ ] Phase 3 adds ≥2 new tests (sidecar read, partition query).
- [ ] Phase 4 adds ≥3 new tests (runtime_state_read, runtime_state_record, gate enforcement).
- [ ] Phase 5 adds ≥2 new tests (archive script idempotency, records_count assertion).
- [ ] Phase 6 adds ≥16 new tests (one per affected `meta_state_*` tool for the new optional field wire-format).

### 2. Schema validation
- [ ] `schemas/meta-state.schema.json` rejects entries with missing `affected_system` (defaults to `'meta'` for legacy entries via Zod preprocess).
- [ ] `schemas/meta-state.schema.json` rejects `affected_system` values not in the canonical enum.
- [ ] `schemas/runtime-state.schema.json` rejects entries with missing `kind` or invalid `source_ref`.

### 3. Gate behavior
- [ ] `core/gate-logic.js#evaluateWritePath` continues to return `decision: 'block'` for `records/observations/**`.
- [ ] `core/gate-logic.js#evaluateWritePath` returns `decision: 'ok'` for `records/_unbound/**` (verified).
- [ ] `core/gate-logic.js#evaluateWritePath` returns `decision: 'block'` for `runtime_state_record` invocations (via new `side-effect-import` pattern in `core/patterns.json`).
- [ ] The bash-gate's new `side-effect-import` regex matches `runtime_state_record` invocations.

### 4. Query parity
- [ ] `meta_state_list({affected_system: 'vnstock'})` returns the same data the current `records/vnstock/decisions/*.yaml` + `experiments/*.yaml` + `risks/*.yaml` contain, after Phase 5 archive.
- [ ] `meta_state_list({entry_kind: 'rule', affected_system: 'meta'})` returns the same 4 active rules the current registry contains.
- [ ] `runtime_state_read({kind: 'ledger-event'})` returns 18 events with `delta` values that sum to the yaml's last-known state.

### 5. Staleness check
- [ ] `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` for the 18 converted ledger events.

### 6. Archive integrity
- [ ] All 8 `records/observations/*.yaml` files moved to `records/_unbound/observation/` (sibling, outside the gate's hard-block).
- [ ] All `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/*.yaml` files moved to `records/_unbound/<schema>/<vendor>/`.
- [ ] The archive script is idempotent: a second run is a no-op (counts match).
- [ ] A `_README.md` at `records/_unbound/` documents what was archived and why.

### 7. Tool surface
- [ ] `tools/learning-loop-mcp/agent-manifest.json` lists 43 tools (down from 56).
- [ ] `tools/learning-loop-mcp/tools/manifest.json` lists 43 file/export entries (down from 56).
- [ ] The 5 deleted groups (`capability` group entirely; 3 tools from `index`; 2 tools from `record_crud`; 5 tools from `workflow`) are removed.
- [ ] The 2 new tools are added (likely to a new `runtime_state` group or to the `gate` group).

### 8. Schema deletion
- [ ] The 8 unbound schemas are deleted: `capability`, `claim`, `experiment`, `risk`, `decision`, `observation`, `resource-budget`, `index-entry`.
- [ ] `schemas/_unbound/_README.md` lists what was deleted and why.
- [ ] No imports of the 8 schemas remain in the codebase (grep clean).

## Implementation Order (dependency-validated)

```
1. Schema-Extension (extend meta-state schema; add 3 fields)
   |
   v
2. Ledger-Conversion (read 18 events from yaml, write to runtime-state.jsonl)
   |    \
   |     \-> 3. Runtime-State-Sidecar (define schemas/runtime-state.schema.json, create empty file)
   |            |
   |            v
   |         4. Runtime-State-Tools (add 2 new MCP tools + tests)
   |
   v
5. Archive-Product-Records (move 40+ records to records/_unbound/)
   |
   v
6. Wire-Format-and-Gate-Patterns (16 wire-format tests; add side-effect-import pattern)
   |
   v
7. Delete-Product-Tools (delete 13 tool files; update manifests)
   |
   v
8. Delete-Product-Schemas (delete 8 schema files; write _unbound/README)
```

## Risks & Mitigations (from §7 of design report + red-team findings)

| Risk | Severity | Mitigation |
|---|---|---|
| `meta-state.js:6` `REGISTRY_FILENAME` is hard-coded; the new fields require the 4 inline zod branches to consolidate into 1 imported schema | High | Phase 1 sub-step: refactor `core/meta-state.js` to import `schemas/meta-state.schema.json` (the existing 4 zod branches become 1) |
| The gate's `loadPromotedRules` reads only `meta-state.jsonl`; adding `affected_system` filter is a one-line change but the cache invalidation hook in `readRegistryWithCache` must be reviewed | High | Phase 1 sub-step: read `core/read-registry-cache.js`; enumerate the LRU cache key fields; verify the `affected_system` extension is comprehensive |
| The 18 ledger events in `observation-vnstock-device-slot-ledger.yaml` need a verbatim conversion; a typo in `value`/`delta` could mask a real budget issue | High | The conversion is a 1-shot script with a verification step: the script reads the yaml, writes the JSONL, then asserts the new JSONL parses to **18 events** (not 19) with `delta` values that sum to the yaml's last-known state |
| Adding `runtime-state.jsonl` triggers the `rule-no-new-artifact-types` consult-gate | Medium | The rule's regex matches `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)`. `runtime-state.jsonl` is a JSONL file, not a "schema" or "artifact type" in the rule's sense. Confirm via `gate_check` before any code that creates the file. |
| The 13 deleted MCP tools are referenced by `agent-manifest.json` (56-tool surface) and possibly external skills (`.claude/skills/**`, `.factory/skills/**`) | Medium | Phase 7 sub-step: grep all consumers of the 13 tool names across `.claude/skills/**`, `.factory/skills/**`, `tools/learning-loop-mcp/core/**`, `agent-manifest.json`; add a "no replacement" callout for any external caller. `meta_state_log_change` with `change_target: 'tools/manifest.json'` documents the deprecation in the audit trail. |
| The 8 deleted schemas are imported by the 6+ deleted tools; deleting the tools first requires deleting the schemas last (dependency order) | Low | The 8-phase order enforces the order: (1) add new fields, (2) convert ledger, (3) create sidecar, (4) add 2 new tools, (5) archive 40+ records, (6) wire-format + gate patterns, (7) delete 13 old tools, (8) delete 8 old schemas. |
| `affected_system` as free string allows typos that corrupt the LRU cache key | High (red-team Finding 5) | Phase 1 sub-step: keep `affected_system` as a Zod enum (not free string), extending the existing 6-value enum with `'api'`, `'web'`, `'product'`, etc. as appropriate |
| 40+ records in `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` orphaned by schema deletion (red-team Finding 4) | Critical (red-team) | Phase 5: audit count of records under each schema; archive to `records/_unbound/<schema>/<vendor>/` (NOT `records/observations/_forensic-stubs/` — that path triggers the gate's hard-block). Verified `records/_unbound/**` falls through to `decision: 'ok'`. |
| `core/derivation/derive-capabilities.js` is a new abstraction for a concept the loop no longer uses (operator challenge 2026-06-12 22:35) | Medium | **Drop the derivation file entirely.** The 3 capability_* tools are deleted with no replacement function. Callers query capabilities via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})` directly. |

## Open Decisions (resolved in this plan)

| Question | Resolution | Rationale |
|---|---|---|
| Default `affected_system` for legacy entries? | `'meta'` | Backward compat; `meta_state_list({affected_system: 'meta'})` returns all current entries |
| Does `runtime-state.jsonl` need `meta_state_*` derivation tools? | No | Sidecar is the recording; derivation (if needed later) is code-level (`core/derivation/`) |
| What happens to `gate_check` consult-rule when the sidecar is added? | Add `side-effect-import` pattern for `runtime_state_record` in `core/patterns.json`; bash-gate intercepts the invocation; JSONL is a side-effect, not a primary action |
| Should `affected_system` be explicit or derived from `code_ref`? | Explicit field (enum, default `'meta'`); `code_ref` is the validation key | Explicit is cheaper than parsing `code_ref` on every read; enum is type-safe |
| Where do archived records go? | `records/_unbound/<schema>/<vendor>/` | Sibling to `records/<vendor>/`; outside gate's hard-block on `records/observations/**`; outside WRITE_PATH_PATTERNS; falls through to `decision: 'ok'` |

## What this plan is NOT

- **Not a Bridge 5 codegen plan.** Phase B (separate plan) ships the schema-to-code generator.
- **Not a Mastra migration plan.** Phases C-E (separate plans) move the deterministic tools to Mastra.
- **Not a Bridge 7 binding plan.** Phase F (separate plan) is the product-surface binding decision, fed by the re-debate conclusions in this plan.
- **Not a skill-migration plan.** Phase G (separate plan, parallel dimension) is the `ck:*` skill migration.
- **Not a refactor of the 4-kind union.** The 4 kinds stay; only the schema *fields* extend.
- **Not a migration of legacy `records/<vendor>/` content to live records.** Those stay unbound. They are archived to `records/_unbound/` (sibling, not deletion).
- **Not a replacement of the `ck:*` skill family.** The skill markdown stays. The MCP tools are the authoritative interface; the skills are the readable spec.

## Red Team Review

### Session — 2026-06-12
**Reviewers launched:** 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic)
**Findings returned:** 10 (2 Critical, 3 High, 5 Medium) — from Scope & Complexity Critic only (other 3 reviewers returned no file content; subagent tool config limitation)
**Adjudication:** All 10 findings adjudicated with operator; 2 Critical accepted, 3 High accepted (with 1 derivation-removed by operator challenge), 2 of 5 Medium accepted (the 2 mechanical ones: gate pattern + wire-format tests)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Ledger count off-by-one (19 claimed, 18 actual) | High | Accept | Phase 2 (assertion corrected to 18) |
| 2 | `_forensic-stubs/` underscore-prefix bypass is factually wrong | Critical | Accept | Phase 5 (path changed to `records/_unbound/`) |
| 3 | Capability derivation has no test parity gate | High | Reject (operator challenge) | — (derivation function removed entirely) |
| 4 | 40+ records orphaned by schema deletion | Critical | Accept | Phase 5 (added as primary deliverable) |
| 5 | `affected_system` field is load-bearing but not validated | High | Accept | Phase 1 (Zod enum, not free string) |
| 6 | LRU cache invalidation not enumerated | High | Accept | Phase 1 (sub-step: enumerate cache key fields) |
| 7 | `runtime_state_record` consult-gate pattern undefined | Medium | Accept | Phase 6 (add to `core/patterns.json`) |
| 8 | 16 meta_state_* tools get optional params, no API stability commit | Medium | Accept | Phase 6 (16 wire-format regression tests) |
| 9 | evidence_journal verification guard not in Phase A | Medium | Reject (out of scope per §11.2) | — (deferred to post-Phase A) |
| 10 | Capability auditability lost by treating as derivation | Medium | Reject (derivation removed; moot) | — |

### Whole-Plan Consistency Sweep

After applying the 6 accepted findings (2 Critical, 3 High, 1 Medium adjusted to derivation-removal, 1 Medium wire-format), re-read `plan.md` and every `phase-*.md`. No stale terms, rejected assumptions, or superseded implementation details remain. The plan is consistent with:
- `AGENTS.md` §1, §6, §10 (meta-surface thesis, Internalization Rule, reframe)
- `plans/reports/productization-260612-1530-master-tracker.md` Phase A
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 (the reframe that makes this plan possible)
- `tools/learning-loop-mcp/core/gate-logic.js:401` (the hard-block we worked around)
- `tools/learning-loop-mcp/core/patterns.json` (the constraints we extended)
- `records/observations/observation-vnstock-device-slot-ledger.yaml` (the 18 events we convert)

**No unresolved contradictions.** The plan is ready for implementation.

## Validation Log

### Session — 2026-06-12 (Validation)
**Questions asked:** 4
**Decisions confirmed:**
1. **Tool count (13, not 20).** The 7 `record_crud` tools (decision/experiment/risk create/update + record_delete) stay because the records, now archived to `records/_unbound/`, still exist. Phase 7 adds a clarifying note marking them as "deprecated; records archived to records/_unbound/." Net deletion: 13 tools.
2. **Cold-session test is a hard gate.** `pnpm test:cold-session` is a Phase 8 success criterion. Failure blocks the plan.
3. **Tracker flip is in Phase 8.** Edit the master tracker FIRST, commit, then `meta_state_log_change` with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'`. Single phase closure, one commit, one log-change.
4. **`affected_system: 'capability'` audit.** Verified (2026-06-12 23:05) that no active rule in `meta-state.jsonl` uses `affected_system: 'capability'`. The 4 active rules are `rule-short-slug-for-risk-records` (affected_system: implied meta), `rule-no-new-artifact-types` (gate-logic), `rule-project-skill-boundary` (mcp-tools), `rule-cold-session-test-must-pass-before-resolution` (mcp-tools). No rule migration needed in Phase 1. Added a pre-check sub-step to Phase 1 to confirm before shipping.

**Phase propagation:**
- Phase 1: added validation pre-check sub-step (audit rules for `affected_system: 'capability'`)
- Phase 7: added clarifying note on 7 surviving `record_crud` tools

**Whole-Plan Consistency Sweep:**
Re-read `plan.md` + every `phase-*.md`. No stale terms, rejected assumptions, or superseded decisions. The plan is consistent with:
- The Final Decision Summary added to `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` §0
- The red-team disposition table in `plan.md#red-team-review`
- The master tracker Phase A A1-A5 (will be flipped in Phase 8)
- `AGENTS.md` §1, §6, §10 (meta-surface thesis + Internalization Rule + reframe)
- `tools/learning-loop-mcp/core/gate-logic.js:401` (the hard-block that motivated the `records/_unbound/` path)
- `tools/learning-loop-mcp/core/patterns.json` (the constraints Phase 6 extends)

**No unresolved contradictions.** The plan is ready for implementation.

### Verification Results (validate workflow Step 2.5)
- Claims checked: 18 (3 per phase × 6 most-risky phases)
- Verified: 18 (all claims either directly verified via grep/glob or sourced from the red-team report's verified findings)
- Failed: 0
- Unverified: 0
- Tier: Full (8 phases)
- Failures: none

## References

- `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` — design report (operator-approved 2026-06-12 16:10)
- `plans/reports/productization-260612-1530-master-tracker.md` — canonical phase tracker
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 — the 2026-06-12 reframe
- `AGENTS.md` §1, §6, §10 — meta-surface thesis + Internalization Rule + reframe
- `tools/learning-loop-mcp/core/meta-state.js#REGISTRY_FILENAME` — the hard-coded constant
- `tools/learning-loop-mcp/core/gate-logic.js:401` — the hard-block on `records/observations/**`
- `tools/learning-loop-mcp/core/gate-logic.js:22` — `WRITE_PATH_PATTERNS` (the patterns we work around)
- `tools/learning-loop-mcp/core/inbound-state.js#checkObservationStaleness` — the staleness check
- `tools/learning-loop-mcp/core/patterns.json` — the constraints we extend
- `tools/learning-loop-mcp/agent-manifest.json` — the 56 → 43 tool surface
- `records/observations/observation-vnstock-device-slot-ledger.yaml` — the 18 ledger events
- `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` — the 40+ records to archive
- `schemas/{capability,claim,experiment,risk,decision,observation,resource-budget,index-entry}.schema.json` — the 8 schemas to delete
- `plans/260612-1700-meta-surface-re-debate/reports/from-code-reviewer-to-planner-red-team-scope-complexity-critic-plan-review-report.md` — the red-team report (10 findings)
