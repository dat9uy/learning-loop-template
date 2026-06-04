# Phase 0 Reflection — Field-Coverage Plan (260603)

**Date:** 2026-06-04
**Plan:** `plans/260603-field-coverage/plan.md`
**Cook journal (full):** `docs/journals/260603-field-coverage-cook.md`
**Commits:** `6022cb9 feat(schema-to-zod)`, `ec2bdcd fix(record-validation)`

## TL;DR (30-second read)

Phase 0 of the field-coverage plan shipped the `core/schema-to-zod.js` wrapper + 19 new tests (17 unit + 2 spike extension). 592/592 tests pass. **BUT the plan's 6 schema `additionalProperties: false` additions were REVERTED** because the plan's "no-op for existing records" assumption was wrong — 25+ records have ad-hoc extras. The wrapper enforces strictness at the zod level via `.strict()` regardless, so Phases 1-4 are unblocked. 2 latent bugs were fixed out of plan scope (AJV `addFormats`, `observation` missing from `schemaMapping`).

## When to Bring This Up

- **Starting a new plan that touches schemas or records validation** — the strict-AJV upgrade is still pending (Phase 0.5 follow-up).
- **Planning the field-coverage follow-up work** — the additionalProperties: false upgrade needs a record-cleanup pass first.
- **Encountering the "G8 subcommand-class false positive" again** — the inbound gate's meta-state-first hint (commits b132f3c, 5db5180) is now active; read `meta-state.jsonl` first.
- **Reviewing the field-coverage plan's "Permissions" section** — the plan's "gate has approve affordance" was conceptual; the gate is a hard block.

## Key Decisions (memorable ones)

1. **Revert 6 schema additions; defer to follow-up plan.** The plan said the addition would be a "no-op" but 25+ records have extras (`result_reason` 13x, `approval` 5x, plus ~25 one-offs in observation/claim/capability). The wrapper's `.strict()` enforces at the zod level so this doesn't block Phases 1-4.

2. **Fix AJV `addFormats` in this cook** (commit `ec2bdcd`). Latent bug masked by the missing `observation` mapping. 2-line fix; defensible; not strictly Phase 0 scope but trivially safe.

3. **Add `observation` to `schemaMapping`** (commit `6022cb9`). Real plan bug — the spike bypassed the loader via `loadSchema(filename)`, so this wasn't caught during spike development.

4. **Schemas-bypass marker approach prototyped and reverted.** The gate change to honor `.schemas-bypass-active` is NOT in the current gate. A future plan that needs schema edits can re-introduce the bypass with a permanent design (env var or cook-active flag).

## Deferred Work (grep these terms)

- **"additionalProperties: false upgrade"** — needs a follow-up plan: (a) add recurring extras (`result_reason`, `approval`) to experiment schema, (b) clean up one-off fields in records or add to exceptions, (c) re-attempt the 6 schema additions.
- **"GATE_SCHEMAS_BYPASS or .schemas-bypass-active"** — re-introduce when next plan needs schema edits; prefer env var in agent startup config.
- **"observation in schemaMapping"** — DONE (commit `6022cb9`).
- **"AJV addFormats"** — DONE (commit `ec2bdcd`).

## Plan Bugs Surfaced (worth flagging to the planner)

1. **"The 183 existing records do not have extras"** — false. 25+ do.
2. **`observation` not in `schemaMapping`** — spike bypassed the loader; the plan's "all 4 record types are reachable via `buildZodSchemaFor`" claim was wrong.
3. **"Gate has approve affordance"** — conceptual. Gate is a hard block; the plan's "operator approval per the gate's affordance" has no implementation.
4. **Spike's `loadSchema(filename)` direct-load** — bypasses the loader's `schemaMapping`, so it can't catch loader-level bugs. The plan's spike should have used `loadSchemas(root)[type]` to mirror the production path.

## Test Count Delta

- Pre-cook: 573 tests
- Post-Phase 0: 592 tests (+19: 17 unit + 2 spike extension)
- Plan target: 622 (final). Phases 1-4 contribute the remaining ~30.

## 1-Sentence Summary

Phase 0 shipped the wrapper and tests cleanly, but the plan's 6-schema strict-AJV upgrade was reverted mid-cook when 25+ records turned out to have ad-hoc extras — the strict-AJV work is now a follow-up plan, the wrapper itself is correct, and 4 plan bugs were surfaced for the planner to address.

## References

- Full cook journal: `docs/journals/260603-field-coverage-cook.md`
- Plan: `plans/260603-field-coverage/plan.md`
- Phase 0 spec: `plans/260603-field-coverage/phase-0-schema-to-zod-engine.md`
- Planning journal: `docs/journals/260603-field-coverage-planning.md`
- Inbound gate fix: commits `b132f3c` + `5db5180` (read `meta-state.jsonl` first)
