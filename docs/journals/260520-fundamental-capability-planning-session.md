---
capability: fundamental
date: "2026-05-20"
type: journal
scope: planning
---

# Fundamental Capability Planning Session

## Context

User asked to productize `capability-03-fundamental.py` (income statement, balance sheet, cash flow, financial ratios) into a full-stack feature: FastAPI backend + TanStack React frontend. Invoked `/ck:plan` for planning.

## What Went Well

1. **Codebase scouting was thorough.** Read 12+ files across `product/api/`, `product/web/`, `records/`, `docs/`, and `schemas/` before writing any plan content. This produced an accurate replication template from the reference capability.
2. **Pattern matching was clean.** The reference capability (`capability-fastapi-reference-rest` + `capability-tanstack-reference-render`) provided an unambiguous template: `DataFrameEnvelope` responses, runtime env gating, `_records_from_frame` helper, TanStack route loader pattern.
3. **Plan content is specific.** Phase files name exact file paths (`product/api/src/routers/fundamental.py`, `product/web/src/lib/fundamental-client.ts`), endpoint signatures, and acceptance criteria. No hand-wavy steps.
4. **Learning-loop compliance embedded.** Phase 5 explicitly calls for capability records, evidence files with `## Findings`, and `pnpm extract:index` — the loop is closed in the plan itself.

## Uncertainties

1. **Runtime probe data shapes are unverified.** The plan assumes `income_statement()`, `balance_sheet()`, `cash_flow()`, and `ratio()` return DataFrames with predictable columns. Phase 1 is supposed to verify this by running the probe, but if the live gate is unavailable, we fall back to source-code inspection. This is a real risk: the vnstock_data API could have drifted since the probe was last run.
2. **Frontend table performance for ratios.** Financial ratios DataFrames can be wide (many columns). The plan assumes plain `<table>` is sufficient, but this is untested. We may need horizontal scrolling or column virtualization.
3. **Cross-plan dependency blind spot.** Several active plans in `plans/260520-*` touch coordination hooks, capability records, and docs. We checked for file conflicts but did not do a deep read of each active plan. The `coordination-model-collapse` plan touches `.claude/` which does not overlap with our product files, so the conflict assessment was shallow but sufficient.

## Tool / Skill Issues

### `ck plan create` output path is wrong

`ck plan create --dir ./plans --phases "..."` scaffolded files directly into `./plans/` root, not into a timestamped subdirectory like every other plan in this repo. Example:

- Got: `plans/plan.md`, `plans/phase-01-*.md`
- Expected: `plans/260520-2101-fundamental-capability-productization/plan.md`

**Root cause:** `ck plan create` appears to use `--dir` as the literal output directory, not as a parent that gets a timestamped child. The skill docs say "Default scope is project-local (`./plans/` under the current project)" but the existing repo convention is timestamped subfolders.

**Impact:** User had to invoke `/ck:project-organization` as a separate step to move files. This is friction that could be eliminated if `ck plan create` either:
- Auto-generated the timestamped subdir when `--dir ./plans` is passed, or
- The skill instructions warned about this mismatch.

### `ck plan create` overwrote the empty `260520-fundamental-capability-backend/` directory

An earlier incomplete plan directory existed. `ck plan create` did not detect this and did not offer to resume or co-locate. Instead it dumped files in `plans/` root. This suggests `ck` does not scan for plan-scoped directories before scaffolding.

## Learning-Loop Skill Value

The learning-loop skill (via `CLAUDE.md` and memory) helped at three points:

1. **Constraint awareness.** The memory `feedback_check_records_first.md` triggered checking `records/capabilities/` and `records/observations/` before asking the user about system state. This avoided redundant questions.
2. **Gate pattern replication.** The `docs/operator-guide.md` and existing reference router showed exactly how runtime gating works (`VNSTOCK_REFERENCE_LIVE_GATE=approved` → raise HTTPException 403). We replicated this as `VNSTOCK_FUNDAMENTAL_LIVE_GATE` without needing to ask.
3. **Evidence format.** The `## Findings` convention with `[topic-tag]` assertions is documented in the operator guide; Phase 1 and Phase 5 of the plan reference this explicitly, ensuring machine-extractable index entries.

## Decisions Made

- Reuse `DataFrameEnvelope` pattern instead of typed row models (dynamic columns from vnstock_data make typed rows fragile).
- Gate behind `VNSTOCK_FUNDAMENTAL_LIVE_GATE` matching reference router.
- Client-side data fetching in frontend (TanStack loader pattern not needed for tabbed view; data fetched in `useEffect` per tab).
- No shared `_records_from_frame` utility extracted yet — inline copy in router to avoid cross-file coupling during this build. Can refactor later if a third capability emerges.

## Action Items

- [ ] Fix `ck plan create` skill to generate timestamped subdirectories or warn when `--dir` points to a parent with existing timestamped plans.
- [ ] After implementation, verify actual DataFrame columns from live probe and update evidence if shapes differ from assumptions.
