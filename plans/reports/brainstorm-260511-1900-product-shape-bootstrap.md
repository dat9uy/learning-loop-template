---
type: brainstorm-report
slug: product-shape-bootstrap
created: "2026-05-11T19:00:00+07:00"
related_plan: "plans/260511-0030-fastapi-reference-build/"
proposed_plan: "plans/260511-1900-product-shape-bootstrap/"
---

# Brainstorm — Product Shape Bootstrap

## Problem

Parent plan `260511-0030-fastapi-reference-build` shipped 3 FastAPI endpoints + 2 TanStack routes with passing contract tests. Operator cannot yet run the product end-to-end and form a product-shape judgment. Smoke tests verify contract; they do not verify entry points, navigation, or UX gaps.

## Gap Inventory (from current state scout)

| # | Gap | Type | Blocks demo? |
|---|---|---|---|
| 1 | No `dev` script for API | DX | Yes |
| 2 | No `dev` script for web (only `build` + `test`) | DX | Yes |
| 3 | No root `pnpm dev` | DX | No (workaround: two terminals) |
| 4 | No `/` route on web; root URL 404s | Product | Yes |
| 5 | No `<Link>` from equity row → company detail | Product | Yes (must hand-edit URL) |
| 6 | `/reference/search` API has no UI; phase 2b loop hole | Product / loop | No (but closes phase 2b) |
| 7 | No run-instruction README per stack | DX | No |

## Meta-Question (user-raised)

"Do we need to talk about learning-loop framing for the product side now?"

**Decision: not yet. Drop tripwire, defer formalization to N≥3 product slices.**

Reasoning:
- Existing `claim-product-*-reference` claims already carry a `runtime` dimension. Operator walkthrough fits as `verification.proves: runtime`, `output: sample-output`. No new dimension or claim shape needed at N=1.
- Premature schema design is the loop's most common failure mode (Q5 / Q6 rules in `operator-guide.md` came from deferring).
- Pattern needs to recur 2-3 times before "operator-inspectable" abstracts cleanly into a verification class. Until then, one experiment record per slice covers it.
- Tripwire via `records/evidence/meta/product-shape-verification-class.md` with `## Trigger: N≥3 product slices walkthrough planned`. Same pattern as Q5 R2.

## Approaches Considered

### Approach A — DX-only, no records
Add scripts + index route + nav links. Skip records entirely. Treat as plain DX chore.

- Pros: Fastest. KISS.
- Cons: Repo premise is the loop. Skipping records for product-side work normalizes two-speed governance. Long-term rot risk.
- **Verdict: rejected.**

### Approach B — Records-light single plan (RECOMMENDED)
Two-phase plan. Skill phase ships scripts + routes + search UI. Loop phase captures operator walkthrough as new experiment record citing existing product claims. Tripwire file dropped in same loop phase.

- Pros: Honors loop without inventing new schema. One new experiment record, no new dimensions. Tripwire forces reconsideration at N=3.
- Cons: Slight overhead vs. Approach A (~30 min for the records phase).
- **Verdict: adopted.**

### Approach C — Full records build with new verification class
Pre-build claim ("product is operator-inspectable"), new dimension or verification.proves class, post-build flip. Mirror parent plan rigor.

- Pros: Maximum rigor. Establishes pattern.
- Cons: YAGNI violation at N=1. Designs a generalization before the pattern has recurred. Likely wrong abstraction; will need rework at N≥3.
- **Verdict: rejected.**

## Recommended Solution

Plan: `plans/260511-1900-product-shape-bootstrap/`. Two phases. Records-light. Adopts Approach B.

### Phase 1 — Bootstrap + UI surfaces (skill, ck:backend-development + ck:tanstack)

Scope:
- `product/api/pyproject.toml`: add `[project.scripts]` or surface uvicorn command via `pnpm dev:api` in root `package.json`.
- `product/web/package.json`: add `dev` (`vite dev`), `start` (tanstack-start prod).
- Root `package.json`: `pnpm dev` runs both. No `concurrently` dep — use `pnpm` parallel scripts or document two-terminal pattern (KISS).
- Web: new `/` index route. Single page with title + link to `/reference/equity` + symbol-search input (one form, posts to `/reference/search`, renders results table inline).
- Web: `EquityTable` renders `symbol` column as `<Link to={companyRoutePath} params={{symbol}}>` from `@tanstack/react-router`.
- Web: search input on `/` calls `fetchSearchSymbols(q)`. New helper in `reference-client.ts`. Inline result table with same `<Link>` pattern to company detail.
- READMEs: `product/api/README.md`, `product/web/README.md` with run commands, ports, env vars.

Constraint: no styling. No CSS frameworks. Plain HTML/JSX. "Looks like a product" is out-of-scope; "click-through works" is the bar.

### Phase 2 — Operator walkthrough + records (loop)

Scope:
- Operator runs `pnpm dev`. Walks: `/` → search "ACB" → click result → company detail → back → equity list → click symbol → company detail.
- Evidence: text walkthrough at `records/evidence/product/operator-shape-walkthrough/walkthrough-260511T1900Z.md`. URLs visited, observed counts/columns (schema-shape, redacted sample), any UX issues observed. No screenshots (binary; repo conventions prefer text).
- Experiment record: `records/experiments/experiment-operator-product-shape-walkthrough-260511T1900Z.yaml`.
  - `claim_refs`: `claim-product-fastapi-reference`, `claim-product-tanstack-reference-view`.
  - `verification.proves: runtime`, `output: sample-output`.
  - `result: supports` if walkthrough completes; `does-not-support` + observed gap list if not.
- Tripwire: `records/evidence/meta/product-shape-verification-class.md` with `## Trigger: when planning operator-walkthrough for 3rd distinct product slice, revisit whether 'operator-inspectable' deserves its own verification class. Increment trigger sample count on each walkthrough.`
- Validate: `pnpm validate:records` + `pnpm check`.

## Constraints

- Skill phase: no record edits.
- Loop phase: no product code edits.
- No new schema fields, no new dimensions.
- No CSS / styling / design work.
- No new third-party deps (no `concurrently`, no UI lib).
- vnstock device slot already consumed; no new install.

## Success Metrics

- `pnpm dev` (or documented equivalent) starts API + web; both reachable.
- Root URL `/` renders a usable page.
- Click-through equity → company works without URL editing.
- Search input on `/` returns rows for "ACB" and similar VN tickers.
- New experiment record validates. Existing product claims unchanged (no dimension flips this iteration).
- Tripwire file in place under `records/evidence/meta/`.
- `pnpm validate:records` + `pnpm check` pass.

## Risks

| Risk | Mitigation |
|---|---|
| Scope creep into styling | Skill phase explicit "no CSS" constraint; reviewer rejects if violated |
| `vite dev` port collision with TanStack Start | Use `vite dev` for dev; CORS already allows :5173 |
| Search returns empty for valid VN tickers (phase 2b regression) | Walkthrough tests "ACB" which is in the equity list per parent plan |
| Operator walkthrough surfaces UX bug | Expected outcome of this iteration; capture as `does-not-support` + follow-up plan |
| Two-terminal DX feels worse than `concurrently` | Acceptable for v1; revisit if N>2 product slices |

## Dependencies

- Parent plan `260511-0030-fastapi-reference-build` completed.
- `product/api/.venv` exists, `vnstock_data` imports.
- `product/web/node_modules` installed.
- Existing claims `claim-product-fastapi-reference`, `claim-product-tanstack-reference-view` validated.

## Next Steps

1. Invoke `/ck:plan` with this report as input. Produces `plans/260511-1900-product-shape-bootstrap/`.
2. After plan approval, `/ck:cook` to execute phases.
3. Run `/ck:journal` after completion.

## Unresolved Questions

None — all approach trade-offs resolved during brainstorm. Implementation details (e.g., exact `pnpm dev` strategy, whether to put search box on `/` vs dedicated route) deferred to plan phase.
