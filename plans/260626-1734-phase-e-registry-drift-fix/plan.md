---
title: "Phase E Registry Drift: consistency-check + audit-trail orphan fix + review followups"
description: "Implement meta_state_consistency_check (core + MCP tool) to detect status/audit-field drift; fix the 3 audit-trail orphans it surfaces; apply remaining CRITICAL/IMPORTANT items from the Phase 7 Fix code review (last_verified_at backfill, D3 atomicity documentation). Solves the orphan-drift class at the root cause by replacing ad-hoc detection with a canonical probe."
status: pending
priority: P2
branch: "phase-e/plan-3-housekeeping"
tags: [phase-e, housekeeping, registry-lifecycle, consistency-check, sp3-extended, audit-trail, tdd, review-followup]
blockedBy: [260626-1535-phase-e-stale-sweep-fix]
blocks: []
created: "2026-06-26T10:47:25.941Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Registry Drift

> **Source:** `plans/reports/code-review-260626-1704-GH-3-phase-e-stale-sweep-fix-report.md` (CRITICAL-1, CRITICAL-2, CRITICAL-3, IMPORTANT-1) + `plans/reports/researcher-260626-1734-consistency-check-tool-design-report.md` (design) + active finding `meta-260614T1236Z-no-automated-registry-consistency-check-exists-to-detect-ent`.
> **Predecessor plan:** Plan 7 Fix (`plans/260626-1535-phase-e-stale-sweep-fix/`, status=shipped).
> **Operator decisions captured:** (1) v1 covers `finding` + `change-log` only (rule/loop-design deferred per YAGNI); (2) on-demand MCP probe (no gate-decision integration); (3) 5 invariants in v1 (4 explicit from finding + 1 newly identified `status: reported` MUST NOT carry `resolved_at`); (4) supersede is the canonical fix path for orphan entries; (5) entry #3 (self-referential orphan) handled by `meta_state_ack` to align status with audit fields.

## Overview

Plan 7 Fix shipped a corrective batch and sweep-success assertion but left three registry inconsistencies in place (audit-trail orphans on entries that transitioned `auto-resolved → active`). This plan addresses them at the root cause by building the consistency-check finding's recommended remediation — a `meta_state_consistency_check` MCP probe — and applying the canonical supersede path to the orphans it surfaces.

Phases:
1. **Core** (TDD): `consistencyCheck(entries)` in `core/consistency-check.js` + 16 unit tests
2. **Tool** (TDD): `meta_state_consistency_check` MCP tool + manifest entry + 8 tool tests
3. **Diagnose**: invoke tool via MCP, classify all drift found
4. **FixOrphans**: file 2 change-log entries + 2 `meta_state_supersede` calls + 1 `meta_state_ack` for self-referential entry; re-run tool, expect 0 drift
5. **ReviewItems**: `last_verified_at` backfill on 10 entries; D3 atomicity deviation documented in journal
6. **DocsVerify**: update plan-7-fix footer, run full pnpm test, close out

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Core](./phase-01-core.md) | Pending | All 16 core tests GREEN; `META_STATE_CONSISTENCY_INVARIANTS` exports ≥ 5 invariants with stable ids (F-1..F-4 + 1 new) |
| 2 | [Tool](./phase-02-tool.md) | Pending | All 8 tool tests GREEN; tool registered in `manifest.json`; gate-log entries have correct shape |
| 3 | [Diagnose](./phase-03-diagnose.md) | Pending | Tool invoked via MCP; drift inventory documented; each entry classified (orphan / known-pattern / new-class) |
| 4 | [FixOrphans](./phase-04-fixorphans.md) | Pending | Tool returns 0 drift (or expected baseline); supersede + ack applied via canonical MCP paths |
| 5 | [ReviewItems](./phase-05-reviewitems.md) | Pending | `last_verified_at` set on 10 entries; journal documents D3 deviation |
| 6 | [DocsVerify](./phase-06-docsverify.md) | Pending | Plan 7 Fix footer updated; full pnpm test GREEN (13 namespaces); cold-tier regression PASS |

## Scope Inventory (3 known orphans + 1 missing invariant — confirmed 2026-06-26)

| # | Entry id | Status | Drift | Fix path |
|---|----------|--------|-------|----------|
| O-1 | `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` | `active` | F-1: carries `resolved_at` + `resolved_by` from prior auto-resolve | `meta_state_supersede` (file new change-log first) |
| O-2 | `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met` | `active` | F-1: carries `resolved_at` + `resolved_by` from prior auto-resolve | `meta_state_supersede` (file new change-log first) |
| O-3 | `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en` | `reported` | NEW invariant: `status: reported` MUST NOT carry `resolved_at`/`resolved_by` (introduced by 4132891 revert) | `meta_state_ack` (aligns status with audit fields; resolution text preserved as `resolution` field on now-active entry) |

**Invariant registry (v1, 5 total):**

| ID | Status | Rule | Source |
|----|--------|------|--------|
| F-1 | `active` | MUST NOT carry `resolved_at` or `resolution` | `meta-state.jsonl:114` finding description |
| F-2 | `archived` | MUST carry `archived_at`, `archived_by`, `archived_reason` | finding description |
| F-3 | `resolved` | MUST carry `resolved_by` | finding description |
| F-4 | `superseded` | MUST carry `consolidated_into` | finding description |
| NEW-1 | `reported` | MUST NOT carry `resolved_at` or `resolved_by` (terminal-audit fields on non-terminal status) | discovered via Plan 7 Fix 4132891 revert; journal O1 |

12 implicit invariants from researcher's Section 1.2 are deferred to a follow-up plan (v2) per YAGNI — the v1 set is sufficient to catch the known orphan class and the user's scope ("fix the bugs raised by the tool").

## Resolved Design Decisions

| # | Decision | Source | Rationale |
|---|----------|--------|-----------|
| D1 | v1 scope = `finding` + `change-log` only | YAGNI | Researcher Section 1.3 / Section 5 OQ-7; rule + loop-design branches have separate invariant sets deferred to v2 |
| D2 | Probe, not gate | Finding description | Finding recommends "OR expose a `meta_state_consistency_check` MCP probe that returns the list of drifted entries without mutating state" — matches SP1/SP2/SP3 pattern |
| D3 | On-demand via MCP tool, not recurring sweep | YAGNI | Sweep territory belongs to `meta_state_sweep` (staleness); consistency check is operator-driven diagnostic |
| D4 | 5 invariants in v1 (4 explicit + 1 new) | User's "fix at root" framing | Adding the new invariant closes the loop on the 4132891-style drift that caused orphan O-3 |
| D5 | `meta_state_supersede` is canonical fix path | Researcher Section 2 + IMMUTABLE_PATCH_FIELDS | `resolved_*` is deny-listed (core/meta-state.js:259-270); patch cannot clear them. Supersede is the only logged bypass. |
| D6 | O-3 fixed by `meta_state_ack` (not supersede) | Self-referential analysis | O-3's `resolution` text *describes* the ack of O-1/O-2 — preserving `resolution` on the now-active entry documents the operator decision |
| D7 | TDD throughout: tests written first, implementation satisfies tests | `--tdd` flag | Each phase has a TDD gate; tests fail before implementation, pass after |
| D8 | Branch stays `phase-e/plan-3-housekeeping` | Plan naming convention | Continuation of housekeeping series; same branch as predecessor |
| D9 | No cold-tier test integration in v1 | YAGNI | Cold-tier is cold-startup invariants; consistency check is operator-driven; defense-in-depth test is a follow-up |
| D10 | Per-op CAS via `_expected_version` for any batch operations | Plan 7 Fix D4 precedent | Catches concurrent writers between read and apply |

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | v1 invariant set is incomplete — drift class not covered surfaces in production | Medium | Researcher's Section 5 OQ-7; deferred invariants are documented in v2 plan; cold-tier test can be extended in follow-up |
| R2 | `meta_state_supersede` is `OPERATOR_MODE=1` gated | Low | Phase 4 explicitly sets OPERATOR_MODE=1 for the duration of the supersede calls |
| R3 | The new `meta_state_consistency_check` tool is read-only but exposes drift that operators might want to suppress | Low | Probe shape (no mutation); operator decides what to do (matches SP1/SP2/SP3) |
| R4 | Re-running the consistency check after Phase 4 reveals drift we didn't predict | Medium | Phase 3 diagnoses first; Phase 4 fixes the predicted set; any new drift is filed as a new finding and fixed in a follow-up plan |
| R5 | `last_verified_at` backfill requires a follow-up `meta_state_batch` that could conflict with concurrent writers | Low | Per-op CAS via `_expected_version`; tool retries once with fresh version on mismatch |
| R6 | O-3 fix (`meta_state_ack`) preserves `resolution` text, which now appears on an `active` entry — appears to violate F-1 | Low | `meta_state_ack` clears `expires_at`; `resolution` field is technically distinct from `resolved_at`/`resolved_by`. F-1's "MUST NOT carry `resolution`" wording is ambiguous; O-3's `resolution` text is operator-supplied content, not a state-machine terminal marker. Document in plan; consider tightening F-1 wording in v2. |
| R7 | Plan 7 Fix footer correction in Phase 6 creates a confusing chronology | Low | Footer explicitly references Plan 7 Fix Plan 8 (this plan) as the corrective layer |

## Verification (how to test the change is right)

1. **Phase 1 (Core):** `node --test tools/learning-loop-mastra/core/__tests__/consistency-check.test.js` shows 16/16 GREEN; `META_STATE_CONSISTENCY_INVARIANTS` has exactly 5 entries (F-1..F-4 + NEW-1).
2. **Phase 2 (Tool):** `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js` shows 8/8 GREEN; manifest has the new entry; gate-log writes one line per invocation.
3. **Phase 3 (Diagnose):** `mcp__learning-loop__mastra_meta_state_consistency_check` returns drift_count ≥ 3 (the known orphans) with stable invariant_ids; diagnostic report at `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md` lists each entry with classification.
4. **Phase 4 (FixOrphans):** Re-running the tool returns drift_count = 0 (or expected baseline if any new drift was introduced by supersede's `superseded_at`/`superseded_by` field addition — none expected). All transitions via canonical MCP paths; gate-log records each call.
5. **Phase 5 (ReviewItems):** `meta_state_batch` sets `last_verified_at` on 10 entries; journal at `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` documents D3 atomicity deviation; review's CRITICAL-3 + IMPORTANT-1 marked resolved.
6. **Phase 6 (DocsVerify):** `pnpm test` GREEN across 13 namespaces; cold-tier regression PASS (Phase 6 sweep-success assertion still ≤ 1 stale); plan 260626-1535 footer updated.
7. **Cross-plan:** all 4 prior review CRITICAL/IMPORTANT items closed (CRITICAL-1, CRITICAL-2, CRITICAL-3, IMPORTANT-1); CRITICAL-4 (D6 audit-gap fix) already in history, no action.
8. **End-to-end:** New tool `meta_state_consistency_check` is the canonical way to detect status/audit-field drift; future drift of this class is caught on first operator invocation.

## Open Items

- **OO1 — v2 invariant expansion.** The 12 implicit invariants (I-1..I-12) from researcher's Section 1.2 are deferred. They cover edge cases like `acked_at` requirement on `active` (I-5), `consolidated_into` reference validity (I-12), etc. File as a follow-up plan if real drift surfaces in v1.
- **OO2 — Cold-tier test integration.** Adding the consistency check to `__tests__/legacy-mcp/cold-tier-regression.test.js` would catch drift at every test run. Deferred per YAGNI; a follow-up plan can add it as defense-in-depth.
- **OO3 — F-1 wording ambiguity.** "MUST NOT carry `resolved_at` or `resolution`" is ambiguous about whether `resolution` on an `active` entry (operator-supplied content) is forbidden. Phase 4's O-3 fix relies on the looser reading. Document the ambiguity; consider tightening in v2.
- **OO4 — Rule + loop-design branches.** These entry kinds are not checked in v1. If a future bug surfaces in those branches (e.g., `rule` entry with `status: "inactive"` but no `supersedes`), the check should be extended.

## Cross-references

- **Code review:** `plans/reports/code-review-260626-1704-GH-3-phase-e-stale-sweep-fix-report.md`
- **Design research:** `plans/reports/researcher-260626-1734-consistency-check-tool-design-report.md`
- **Audit-trail orphan research:** returned inline by `researcher-260626-1734-audit-trail-orphan-fix` (not written to disk)
- **Test pattern scout:** returned inline by `scout-260626-1734-meta-state-test-patterns` (not written to disk)
- **Predecessor plan:** `plans/260626-1535-phase-e-stale-sweep-fix/plan.md` (status=shipped)
- **Predecessor journal:** `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` (updated in Phase 5)
- **Active finding being implemented:** `meta-260614T1236Z-no-automated-registry-consistency-check-exists-to-detect-ent`
- **Core mechanics:**
  - `tools/learning-loop-mastra/core/consistency-check.js` (NEW — Phase 1)
  - `tools/learning-loop-mastra/tools/legacy/meta-state-consistency-check-tool.js` (NEW — Phase 2)
  - `tools/learning-loop-mastra/tools/legacy/manifest.json` (modify — Phase 2)
  - `tools/learning-loop-mastra/core/meta-state.js:259-270` (IMMUTABLE_PATCH_FIELDS — read for Phase 4)
  - `tools/learning-loop-mastra/tools/legacy/meta-state-supersede-tool.js` (canonical fix path — Phase 4)
  - `tools/learning-loop-mastra/tools/legacy/meta-state-ack-tool.js` (O-3 fix — Phase 4)
  - `tools/learning-loop-mastra/tools/legacy/meta-state-batch-tool.js` (last_verified_at backfill — Phase 5)

---

**Status:** Pending — awaiting operator approval of design decisions + phase structure. Operator has confirmed v1 scope (D1), probe shape (D2), invariant count (D4), and supersede-as-fix (D5).