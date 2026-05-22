# Macro Layer Implementation — Learning Loop Compliance Victory

**Date**: 2026-05-22 20:30
**Severity**: Medium
**Component**: product/api (macro layer), product/web (macro frontend)
**Status**: Resolved

## What Happened

Successfully implemented Layer 5 (Macro data) from `records/vnstock/evidence/unified-ui-snapshot/05-macro-layer.md`.

Backend: 21 FastAPI endpoints across three domains:
- Economy (8): GDP, interest rate, inflation, unemployment, industrial production, retail sales, PMI, consumer confidence
- Currency (2): exchange rates, forex overview
- Commodity (11): gold, crude oil, brent, natural gas, copper, silver, corn, wheat, coffee, sugar, soybean

Frontend: TanStack Router `/macro` route with `MacroTabs` and `MacroTable` components using the established envelope pattern.

Tests: 41 new tests, all green. One pre-existing reference test failure unrelated to this work.

File discipline: split into 3 routers (`economy.py`, `currency.py`, `commodity.py`) and 3 test files to stay under the 200-line limit. No monster files.

Commits:
- `f8f3167` feat(api): add macro layer with economy, currency, commodity endpoints
- `83f856e` feat(web): add macro data frontend with tabs and table
- `a8dc9b2` test(api): add macro endpoint tests and fix fundamental stub
- `5bd99fc` feat(coordination): add macro layer decision record and implementation plan

## The Brutal Truth

This should not feel like a win. Implementing a straightforward data layer with a few endpoints and a table is baseline engineering work. The fact that I'm celebrating it is a symptom of how badly the previous attempt went.

Earlier today we tried the same thing with `/ck:cook` and it generated product code directly — no decision record, no preflight marker, no plan. The gate eventually blocked it, but only after code had already been produced, leaving a mess in the worktree and an experiment record documenting the failure (`experiment-product-macro-cook-no-loop-20260522T055121Z.yaml`).

The frustrating part is that the system had been designed specifically to prevent exactly this failure mode, and it still happened because the tool pathing was wrong. This time we did it manually, step by step, and it worked flawlessly. That means the process is sound but the automation is not.

## Technical Details

Files created/modified:
- `product/api/app/routers/macro/economy.py` — 8 endpoints
- `product/api/app/routers/macro/currency.py` — 2 endpoints
- `product/api/app/routers/macro/commodity.py` — 11 endpoints
- `product/web/src/routes/macro.tsx` — route component
- `product/web/src/components/macro/MacroTabs.tsx` — tab navigation
- `product/web/src/components/macro/MacroTable.tsx` — data table
- `product/api/tests/test_economy_endpoints.py`
- `product/api/tests/test_currency_endpoints.py`
- `product/api/tests/test_commodity_endpoints.py`

Record artifacts created via MCP CRUD tools:
- `decision-product-260522T2007Z-implement-macro-layer-api-with-economy-currency-and-commodity-endpoints-using-the-established-envelope-pattern-split-across-multiple-routers-to-keep-files-under-200-lines.yaml`
- `plans/260522-2008-macro-layer-implementation/` — full phase plan

## What We Tried

First attempt (automated): `/ck:cook` on the evidence file. Generated product code. Gate blocked writes to `product/**` because no preflight marker existed. No decision record existed either. Had to abandon the branch.

Second attempt (manual loop):
1. Read evidence file.
2. Created decision record via `create_decision_record` MCP tool.
3. Wrote implementation plan to `plans/260522-2008-macro-layer-implementation/`.
4. Asked user for approval.
5. Used `mark_preflight_complete` MCP tool to unlock `product/**` writes.
6. Implemented backend, frontend, tests sequentially.
7. Delegated to `tester` agent — 41/41 passed.
8. Delegated to `code-reviewer` agent — no blockers.
9. Committed.

## Root Cause Analysis

The first attempt failed because `/ck:cook` did not invoke the learning loop. It treated the evidence file as a direct specification and started coding, bypassing the decision-record requirement and the preflight gate. The coordination system is designed to catch this, but catching it after code generation wastes time and creates frustration.

The real root cause is that the tool did not surface the loop requirements upfront. The fix was human intervention: manually creating the decision record, writing the plan, and explicitly marking preflight complete before touching product code.

## Lessons Learned

- **Never trust a tool to follow process.** If the tool path is supposed to include planning and loop compliance, verify it explicitly before code generation begins.
- **MCP tools work.** `create_decision_record` and `mark_preflight_complete` functioned exactly as designed. The gates enforced the policy correctly once the records existed.
- **File size limits force good design.** Splitting the macro layer into three routers by domain (economy, currency, commodity) made the code more readable and the tests more focused. The constraint is a feature, not a bug.
- **Evidence files are not plans.** Evidence describes what exists in the upstream system. A plan describes how to map it into the product. `/ck:cook` on evidence alone is insufficient.

## Next Steps

- None for this feature. It is complete, tested, reviewed, and committed.
- Meta: investigate why `/ck:cook` did not trigger the planning phase automatically in the first attempt.
