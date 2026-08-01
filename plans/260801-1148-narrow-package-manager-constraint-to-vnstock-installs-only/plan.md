---
title: "Narrow package-manager constraint to vnstock installs only"
description: "Tighten the bash-gate `package-manager` constraint pattern so it only fires when the install command actually contains the `vnstock` token. Routine non-vendor dep bumps (`pnpm add -D fallow`, `npm install react`, `pip install numpy`) stop being gated. vnstock vendor installs stay gated by the vnstock observation."
status: pending
priority: P1
effort: "3h"
tags: [gate, constraint, package-manager, vnstock, tdd]
created: 2026-08-01
---

# Narrow package-manager constraint to vnstock installs only

## Overview

The bash gate's `package-manager` constraint pattern (`core/patterns.json`) matches **every** `pip|npm|yarn|pnpm|uv` install/add/sync/bootstrap/setup command. The only affected_system that maps to `package-manager` is `vnstock` (`core/file-readers.js:25`). vnstock's latest budget-state row is `stopped` (`runtime-state.jsonl`), so it projects no observation, and `package-manager` has no other unlock path. Result: **all** package-manager commands repo-wide are blocked — including routine devDependency bumps unrelated to vnstock (see `plans/reports/debug-260801-1112-fallow-bump-package-manager-constraint.md`).

User decision: **vnstock should only be triggered if the install command has `vnstock` in it.** This restores the constraint's original intent (guard vendor-package installs) and unblocks routine dep bumps. TDD: encode the new contract in tests first (red), then narrow the regex (green).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Non-vnstock install commands no longer match the `package-manager` constraint (no observation required) | P1 |
| 2 | vnstock install commands (`pip install vnstock`, `uv pip install vnstock`, `pip install vnstock_data`, …) still match `package-manager` and still require the vnstock observation | P1 |
| 3 | The fallow 3.10.0 devDependency bump runs without a gate block, re-greening fallow scripts | P2 |
| 4 | Loop change-log records the gate-design change; leftover dep-bump report is resolved | P2 |

## Scope

**In scope**
- `core/patterns.json` — narrow the `package-manager` regex.
- Gate test files — flip non-vnstock assertions to `null`; keep/add vnstock assertions.
- Docs that describe the `package-manager` constraint as a general install guard.
- Loop record (`meta_state_log_change`) for the gate-design change; resolve the leftover `meta-260801T1118Z-observation-dep-bump-fallow-…` report.
- The fallow `3.10.0` bump as the real-world regression proof (only after the pattern is narrowed).

**Out of scope**
- The ≥5-finding byte-size measurement for the original `meta-260714T1248Z-…` finding (synthesized-failure fixture). That finding's plan (`260714-1200-fallow-brief-discovery`) is `completed`; the measurement is tracked on the finding itself, not here.
- Adding a new affected_system or new constraint type (YAGNI — narrowing the existing pattern is sufficient).
- Renaming the `package-manager` constraint type (high churn, low value; the name's intent was always vendor-package installs).
- Changing the `vendor-api` / `side-effect-import` constraints (orthogonal).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD red — encode new contract in tests](./phase-01-tdd-red.md) | Pending |
| 2 | [Phase 2: TDD green — narrow the package-manager regex](./phase-02-tdd-green.md) | Pending |
| 3 | [Phase 3: Verify, docs, loop record, unblock fallow bump](./phase-03-verify-and-record.md) | Pending |

## Success Criteria

- [ ] `pnpm add -D fallow@3.10.0`, `npm install react`, `pip install numpy` → `matchConstraintPattern` returns `null` (no gate block).
- [ ] `pip install vnstock`, `uv pip install vnstock`, `pip install vnstock_data`, `pnpm install vnstock` → still return `"package-manager"` (still gated by vnstock observation).
- [ ] `pnpm fallow:gate` and `pnpm fallow:brief` stay green on fallow 3.10.0 after the bump.
- [ ] Gate test suite (`evaluate-bash-gate`, `gate-logic-quoted-strings`, `gate-promoted-rules`, `evaluate-bash-gate-runtime-state`) passes.
- [ ] Docs describing the `package-manager` constraint updated to reflect vnstock-only matching.
- [ ] Loop change-log entry recorded; `meta-260801T1118Z-observation-dep-bump-fallow-…` resolved.

## Key Evidence

- Mapping (sole unlocker): `core/file-readers.js:25` — `vnstock: ["vendor-api", "package-manager"]`.
- Pattern (over-broad): `core/patterns.json:4` — `\b(pip|npm|yarn|pnpm|uv)\s+(install|add|sync|bootstrap|setup)\b`.
- Block decision: `core/gate-logic.js:482` — constraint matched + no active observation → block.
- vnstock state: `runtime-state.jsonl` latest `vnstock` budget-state row is `stopped` (2026-07-24) → projects nothing → no unlock.
- Existing vnstock tests (stay green): `core/evaluate-bash-gate.test.js:38,45,410,423`; `__tests__/legacy-mcp/evaluate-bash-gate-runtime-state.test.js:57,81,99`.
- Existing non-vnstock tests (must flip to `null`): `__tests__/legacy-mcp/gate-logic-quoted-strings.test.js:55,104,121,126`; `__tests__/legacy-mcp/gate-promoted-rules.test.js:18`.

## Open Questions

1. Should `pip install vnstock_data` (the sponsor/data package) also be gated? Plan assumes **yes** — the regex matches the `vnstock` prefix, catching both `vnstock` and `vnstock_data`. Confirm in review.
2. Is removing the "stop-and-think" guard for all non-vnstock installs acceptable? User decision says yes; risk noted in Phase 1.

<!-- slug: narrow-package-manager-constraint-to-vnstock-installs-only -->