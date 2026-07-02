---
title: "Mastra-Code Surface Coverage — Plan 5-Lite Follow-Up"
description: "Extend the .mastracode surface to the 5 source files that still hard-code the 2-surface list, plus the missing .mastracode/coordination/hooks shim dir they depend on."
status: pending
priority: P2
branch: "main"
tags: [hardening, surfaces, mastra-code]
blockedBy: []
blocks: []
created: "2026-07-02T09:49:09.397Z"
createdBy: "ck:plan"
source: skill
---

# Mastra-Code Surface Coverage — Plan 5-Lite Follow-Up

## Overview

Plan 5-Lite (commit `c58a8c8`, branch `hardening/plan-5-lite-r2-lim4`) extended the
`SURFACES` registry to `.mastracode` and updated the **test** files that hard-coded
the 2-surface list, but Phase 3 C3 scope enumerated test files only. Five **source**
files still hard-code `[".claude", ".factory"]` and therefore do not cover the
mastra-code surface. These are pre-existing gaps, not regressions, and are documented
in `docs/security/plan-5-hardening.md` § Out-of-Scope. This plan closes them.

Scouting surfaced one prerequisite the doc under-emphasized: `.mastracode/coordination`
exists but **`.mastracode/coordination/hooks` does not exist at all**. Extending
`SHIM_DIRS` (one of the 5 files) to 3 entries forces creating that dir with 4
byte-identical mirrored shims, or the `shims-in-sync` checklist item flags the real
repo. That work is the load-bearing coupling of this plan.

### The 5 source files

| File | Hard-coded site | Fix shape |
|------|-----------------|-----------|
| `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js:36` | `for (const dir of [".claude", ".factory"])` writing `.last-operator-message` | Iterate `SURFACES` via `writeToAllSurfaces` (preserve `GATE_MARKER_PATH` override) |
| `tools/learning-loop-mastra/tools/legacy/mark-preflight-complete-tool.js:17-19` | `coordDirs = […, .claude/coordination, .factory/coordination]` | Derive `coordDirs` from `SURFACES.map(s => join(root,s,"coordination"))` (preserve `GATE_COORD_DIR` override); update description text |
| `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (`PATH_WRITE_PATTERNS`) | 4 regex literals for `.claude` + `.factory` preflight-marker writes | Add 2 literals for `.mastracode/coordination/.loop-preflight-*` (`>` and `tee`); update comment |
| `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js:11` (`SHIM_DIRS`) | 2-entry array | Extend to 3 (add `.mastracode/coordination/hooks`); update `shims-in-sync` description/fix text. **Coupled to prerequisite below.** |
| `tools/learning-loop-mastra/core/gate-override.js:28,54` | doc comment lists 2 surfaces | Cosmetic: generalize comment to "all SURFACES". Logic already iterates `SURFACES`. |

### Prerequisite (scout finding)

`.mastracode/coordination/hooks/` is missing. The existing 4 shim files
(`bash-coordination-gate.cjs`, `inbound-state-gate.cjs`,
`recurrence-check-on-start.cjs`, `write-coordination-gate.cjs`) must be mirrored
into it **byte-identical** to the `.factory` copies (the `shims-in-sync` item
checks SHA256 equality across shim dirs). Create the dir + copy the 4 shims before
or together with extending `SHIM_DIRS`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Scope & Prerequisites](./phase-01-research.md) | Pending |
| 2 | [Source Migration](./phase-02-implement.md) | Pending |
| 3 | [Tests & Gate](./phase-03-verify.md) | Pending |

## Dependencies

- **Depends on:** Plan 5-Lite (`plans/260701-2250-plan-5-lite-r2-lim4/`) already
  shipped the `.mastracode` registry entry, R2 allowlist `mastra-code` block, and
  `LOOP_SURFACE=.mastracode` wiring. This plan consumes those; it does not change
  them.
- **Blocks:** none. Downstream "add a 4th runtime" work benefits but is not gated.
- No cross-plan `blockedBy`/`blocks` relationships detected among unfinished plans
  in `plans/` (the relevant prior plan is already completed).

## Acceptance Criteria

- [ ] All 5 source files iterate `SURFACES` (or derive from it); no source file
  outside `surfaces.js` hard-codes the 2-surface list for cross-surface I/O.
- [ ] `.mastracode/coordination/hooks/` exists with the 4 mirrored shims, SHA256
  equal to the `.claude` and `.factory` copies.
- [ ] `runtime-agnostic.test.js` shim-name-set assertion covers all 3 surfaces.
- [ ] `pnpm test` green (no regressions); `pnpm fallow:gate` green.
- [ ] Site-by-site review of each migrated file against the pattern (the journal's
  load-bearing lesson: "N-of-N migrations need per-site review, not aggregate
  claims").
- [ ] `docs/security/plan-5-hardening.md` § Out-of-Scope updated: the 5 source
  files move from "tracked for a follow-up plan" to "closed by `<this plan>`".

## Out of Scope

- R2 allowlist, identity pinning, path containment, audit-log hardening — all
  shipped by Plan 5-Lite; untouched here.
- The line-99 invariant blind spot in `runtime-agnostic.test.js`
  (`runtime-agnostic-checklist.js` contains the literal string `from "./surfaces.js"`
  inside its own check logic, so the grep false-passes it as "imports surfaces.js").
  Pre-existing test-quality gap; not a regression and not required for coverage.
  Noted for awareness; do not expand scope to fix it unless the user asks.
- The 9 regex-bypass forms documented in the checklist (F-2) — unchanged.
- Windows UNC / device paths — deferred by Plan 5-Lite.