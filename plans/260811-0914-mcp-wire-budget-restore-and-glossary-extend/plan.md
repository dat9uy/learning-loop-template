---
title: "MCP wire budget restore and glossary-extend"
description: "Restore the 55,000-byte MCP manifest wire ceiling (Option A, 247-byte trim), then structurally shrink the wire by extending the field-glossary ref pattern across handler schemas (Option B), then re-anchor the budget test to the post-B steady-state. Resolves finding meta-260811T0805Z-manifest-context-budget-raised-a-second-consecutive-time-mcp."
status: completed
priority: P1
effort: "1-2d"
tags: [meta-state-tools, mcp-wire-budget, field-glossary, tdd]
created: 2026-08-11
---

# MCP wire budget restore and glossary-extend

## Overview

The MCP manifest wire budget was raised a second consecutive time (55,000 → 55,750) to
absorb `meta_state_list` tool-doc growth. The analysis report
(`plans/reports/analysis-260811-0844-cold-session-context-mcp-wire-budget.md`) established
that the 55 KB wire is a **test-only boundary guard** — production sets
`LOOP_RECORDS_VIA_CLI=1` and loads only the 8-tool residue (4,563 bytes); the budget test
measures 44 tools / 55,247 bytes by booting the server without the flag. Optimizing the
wire is insurance against a forgotten flag, not a production context win, but it satisfies
the finding's mandate and stops the repeated-bump cycle.

This plan implements the report's resolved sequence: **A** (restore 55,000 now) → **B**
(structural glossary-extend) → **post-B re-anchor**. The recoverable wire lives in
schema-embedded description prose (11,208 bytes; 159 inlined descriptions across handlers,
avg 65 bytes) that duplicates the field glossary. Extending the existing `See field_glossary.`
ref pattern (already used by 3 handlers) shrinks the wire structurally and removes the
manual drift that caused the bumps.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Restore the budget test ceiling to 55,000 via a ~247-byte tool-description trim | P1 |
| 2 | Structurally shrink the wire by extending glossary refs (existing 19 entries only) across handler schemas | P1 |
| 3 | Re-anchor the budget test ceiling to the post-B measured steady-state + headroom | P2 |
| 4 | Keep all handler behavior unchanged (refs are description-only; schema shape preserved) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Restore the 55,000 ceiling](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Structural glossary-extend](./phase-02-structural-glossary-extend.md) | Completed |
| 3 | [Phase 3: Post-B budget re-anchor](./phase-03-post-b-budget-re-anchor.md) | Completed |

## Non-goals

- **Option C (derive sketch enums from schema)** — separate plan. The report's Seam 2
  names a `cli-write-hint-sketch-drift.test.cjs` drift test that does **not** exist at the
  referenced path; that discrepancy is C-scope and must be re-scouted before C is planned.
- **Expanding the field glossary** — Phase 2 uses only the existing 19 `FIELD_GLOSSARY`
  entries; no new entries are added, so `loop_describe` cold-tier output is unchanged
  (validation decision).
- **Tier 1 production-context levers** (steering 26 KB, SessionStart hints 11.8 KB,
  cold-tier summary-first) — named in the report for awareness; out of scope. They are the
  real production context cost but are not what the finding mandates.
- No behavioral change to any tool's accepted args or return shape.

## Acceptance criteria

- [x] `mcp-wire-budget` test asserts `<= 55,000` and passes (Phase 1).
- [x] `cli-context-savings` test still passes after the Phase 1 trim (no snapshot break).
- [x] A shared glossary-ref helper replaces the per-handler `describeChangeField` pattern
      and is used by the **allowlisted, semantically-aligned** handler+field pairs (Phase 2).
- [x] `field-glossary.test.js` covers the helper + ref-coverage **for the allowlist only**,
      and asserts `meta_state_list` filter fields are NOT refs (Phase 2).
- [x] Phase 2 audit produced the allowlist + audited convertible bytes; the gate is
      "wire drops by ≥ the audited convertible bytes."
- [x] **No new `FIELD_GLOSSARY` entries added** — only the existing 19 used; cold-tier
      glossary output unchanged (validation decision).
- [x] Measured wire after Phase 2 is below 55,000 and dropped by ≥ the audited bytes. The
      exact number is recorded for Phase 3.
- [x] No handler's `inputSchema` shape changed (only `description` strings) — verified by
      the existing wire-format / parity tests passing.
- [x] All three phases ship as a **single PR** (validation decision).
- [x] Budget test ceiling re-anchored (kept at 55,000 per user decision; wire 54,883) with
      rationale in the test comment; STOPGAP note removed (Phase 3).
- [x] Finding `meta-260811T0805Z-...` resolved once the ceiling is restored/re-anchored.

## Context

- **Analysis report (source of measured baseline + scope reframe):**
  `plans/reports/analysis-260811-0844-cold-session-context-mcp-wire-budget.md`
- **Finding:** `meta-260811T0805Z-manifest-context-budget-raised-a-second-consecutive-time-mcp`
- **Budget test:** `tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js`
- **Glossary:** `tools/learning-loop-mastra/core/field-glossary.js` (19 field definitions)
- **Existing ref pattern:** `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js`
  — local `describeChangeField(field, schema) => schema.describe("See field_glossary.${field}")`
- **Cross-plan scan:** no blocking overlap. `260802-0237-meta-state-lifecycle-migration`
  and `260808-1222-gate-verb-allowance-...` reference the glossary tangentially; neither
  edits the same handler schema-description surface.

## Key measured baseline (live, 2026-08-11)

| Surface | Bytes |
|---|---|
| 44-tool MCP manifest wire (test, no flag) | 55,247 |
| Production residue (8 tools, flag set) | 4,563 |
| Schema-embedded description bytes | 11,208 |
| — of which glossary refs | 909 (28 refs, avg 32 B) |
| — of which inlined (B's target) | 10,299 (159 descs, avg 65 B) |
| To restore 55,000 (Phase 1 trim) | 247 |
| Option B optimistic post-wire | ~50,110 |

## Risk profile

- **CRITICAL (red-team): Phase 2's coverage rule must be semantics-based, not name-based.**
  The 19 glossary keys (`id`, `status`, `affected_system`, `session_id`, `entry_kind`) are
  reused as **filter parameters** in read tools (e.g. `meta_state_list`'s 400-byte `id`
  filter desc) with divergent prose. A name→ref swap would delete behavioral hints. Phase 2
  converts a field only when the description prose actually duplicates the glossary entry's
  `meaning` (entry-field semantics), never for filter/query params that share the name. An
  explicit allowlist of handler+field pairs gates conversion.
- **HIGH (red-team): the real convertible set is ~3% of the top targets, not ~1,500 B.**
  Under "existing 19 entries only," `meta_state_list` is ~0% convertible, `meta_state_batch`
  ~45 B, `meta_state_promote_rule` ~55 B. The ~50,110 optimistic floor assumed name+semantic
  alignment that does not hold for query/filter tools. Phase 2's actual shrink is likely
  ~1-2 KB across all 44 handlers at best, not ~5 KB. **This weakens Phase 2's anti-bump-cycle
  justification — see the open decision below.**
- **MEDIUM (red-team): Phase 2 needs a measurable gate beyond "below 55,000."** Phase 1
  already satisfies that bar. Phase 2 must audit its real convertible set first and gate on
  it (e.g., "wire drops by ≥ the audited convertible bytes"), not on a ceiling Phase 1
  already meets.
- **Highest risk: Phase 2 touches 44 handler schemas.** Mitigation: extract the shared
  helper first (pure refactor), prove `.describe()` aliasing safety on 2-3 handlers (zod
  `.describe()` is immutable — verified), then convert in descending inlined-byte order,
  running the full suite per batch.
- **`cli-context-savings-script` snapshot (red-team): certain to break on Phase 1**, not
  conditional — all trim targets are CLI_TOOLS. Re-snapshot with per-tool byte-delta review.

## Resolved decision (red-team fork)

The red-team showed Phase 2's shrink is small (~1-2 KB) under "existing 19 entries only"
because the 19 glossary keys overlap inlined prose via name collisions (entry-fields vs
filter-params), not semantic duplication. **User decision: proceed with Phase 2
semantics-based + audit gate** (option a). Phase 2 converts only allowlisted,
semantically-aligned entry-field pairs; filter fields are excluded; an audit-first step
measures the real convertible set and gates on it. The glossary is not expanded (cold-tier
output unchanged). Honest about the limited immediate shrink; the durable benefit is the
shared-helper pattern + the semantics-based allowlist that prevents filter-semantics
corruption.

<!-- slug: mcp-wire-budget-restore-and-glossary-extend -->