---
phase: 2
title: "Operator Walkthrough and Records"
status: completed
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Operator Walkthrough and Records

## Context Links

- Brainstorm: `plans/reports/brainstorm-260511-1900-product-shape-bootstrap.md`
- Existing claims: `records/claims/claim-product-fastapi-reference.yaml`, `records/claims/claim-product-tanstack-reference-view.yaml`
- Schema: `schemas/experiment.schema.json`
- Parent plan post-build phases: `plans/260511-0030-fastapi-reference-build/phase-03-post-build-records-api.md`, `phase-05-post-build-records-web.md`
- Q5 deferred-meta-evidence pattern: `docs/operator-guide.md` → "Q5 R2 - Pre-experiment scan of `records/evidence/meta/`"

## Overview

Loop phase. Operator runs the bootstrapped product, walks a fixed click-path through the UI, captures text observations as evidence, authors one new experiment record citing the existing product claims, and drops a tripwire meta-evidence file deferring product-side learning-loop generalization until N≥3 product slices. Existing claims are **not flipped** this iteration.

## Key Insights

- The existing product claims (`claim-product-fastapi-reference`, `claim-product-tanstack-reference-view`) already carry a `runtime` dimension. Operator walkthrough fits as `verification.proves: runtime`, `output: sample-output`. No new dimension or claim shape needed at N=1.
- Whether to flip those claims' verification blocks based on the walkthrough is a separate decision deferred to a future iteration. This phase only adds an experiment record.
- Tripwire follows the Q5 R2 pattern: file under `records/evidence/meta/` with `## Trigger` section that fires when N≥3 product walkthroughs are planned, instructing future agents to revisit whether "operator-inspectable" deserves its own verification class.
- Walkthrough evidence uses text (URL list, observed column shapes, redacted samples). No screenshots — binary artifacts conflict with repo conventions favoring grep-friendly text.

## Requirements

- Functional: Operator click-path completes end-to-end. Evidence captures URLs visited, observed column counts/shape (schema-shape only — no raw values, no identifiers, no time-series values), and any observed UX issues. New experiment record validates. Tripwire file present.
- Non-functional: No product code edits. No raw external data in evidence (column names + counts only; sample values redacted to class labels like `<symbol>`, `<numeric>`).

## Architecture

```
Operator walkthrough click-path:
  /                                    (landing)
    → click "Equity list"
  /reference/equity                   (table; observe column shape, row_count)
    → click first symbol cell
  /reference/company/{symbol}         (detail; observe columns)
    → back, type "ACB" in search on /
  / (search results)                  (inline result table; observe shape)
    → click result row symbol
  /reference/company/ACB              (detail)

Records produced (phase 2 writes):
  records/evidence/product/operator-shape-walkthrough/walkthrough-<ts>.md
  records/experiments/experiment-operator-product-shape-walkthrough-<ts>.yaml
  records/evidence/meta/product-shape-verification-class.md
```

## Related Code Files

- Create: `records/evidence/product/operator-shape-walkthrough/walkthrough-260511T1900Z.md`
- Create: `records/experiments/experiment-operator-product-shape-walkthrough-260511T1900Z.yaml`
- Create: `records/evidence/meta/product-shape-verification-class.md`
- Read: `records/claims/claim-product-fastapi-reference.yaml`
- Read: `records/claims/claim-product-tanstack-reference-view.yaml`
- Read: `schemas/experiment.schema.json`
- Read: `docs/operator-guide.md` (claim verification, evidence model, agent intake flow)
- Read: `docs/claim-verification.md`

## Implementation Steps

1. Read schemas + existing product claims to confirm citable refs and required experiment fields.
2. Scan `records/evidence/meta/` for `## Trigger` matches on event class "product slice operator walkthrough" — per Q5 R2 rule. If any matches, read and apply guidance.
3. Operator runs `pnpm dev:api` and `pnpm dev:web` (or two-terminal equivalent per phase 1 README).
4. Operator walks the click-path documented under Architecture. For each step, record:
   - URL visited.
   - HTTP status observed (200, 404, etc.).
   - Component visible (`LandingPage`, `EquityTable`, `CompanyDetail`, `SearchBox` results table).
   - Column names rendered (schema-shape only — names, not values).
   - Row count if relevant (counts only, no row identifiers).
   - Whether navigation links worked (yes/no per step).
   - Any UX issue observed (e.g. "search returns 0 rows for query 'AAA' which is in equity list" — issue class only, no raw values).
5. Write evidence file `records/evidence/product/operator-shape-walkthrough/walkthrough-260511T1900Z.md`:
   - Header section with run timestamp, run_id, operator identity class (e.g. `operator`).
   - `## Walkthrough` table or bullet list of steps with the per-step observations above.
   - `## Observed Schema Shape` section listing column names per route observed.
   - `## Redacted Samples` section showing `<symbol>`, `<numeric>` placeholders for any data referenced — never raw values.
   - `## UX Observations` section listing any issues found (each as one bullet, issue class only).
   - `## Cleanup` section confirming no temp artifacts, no captured raw data.
6. Author experiment YAML `records/experiments/experiment-operator-product-shape-walkthrough-260511T1900Z.yaml`:
   - `id: experiment-operator-product-shape-walkthrough-260511T1900Z`
   - `subject`: Operator walkthrough of FastAPI Reference + TanStack Reference slice via dev servers.
   - `hypothesis`: The bootstrap surfaces (`/`, search box, equity → company `<Link>`) let operator inspect the product shape without URL editing.
   - `claim_refs`: `[claim-product-fastapi-reference, claim-product-tanstack-reference-view]`
   - `source_refs`: `[local:records/evidence/product/operator-shape-walkthrough/walkthrough-260511T1900Z.md]`
   - `verification`: `proves: runtime`, `scope: sandbox`, `output: sample-output`
   - `result`: `supports` if click-path completes; `does-not-support` if a navigation link breaks or a route 404s; `inconclusive` if walkthrough cannot complete for environmental reasons.
   - `result_reason`: one-line justification.
   - `observations`: bullet list mirroring the walkthrough evidence sections.
   - `boundaries.blocked_actions`: `[raw-data-capture, credential-capture, cell-values, identifiers, install-logs]`
   - `created_at`, `updated_at`: ISO-8601 timestamps.
7. Author tripwire file `records/evidence/meta/product-shape-verification-class.md`:
   - Header: deferred meta-evidence, written under Q5 R2 deferred pattern.
   - `## Trigger` section: when planning operator walkthrough for the 3rd distinct product slice, revisit whether "operator-inspectable" deserves its own verification class (e.g. a new `verification.proves` value or a fourth dimension). Increment trigger sample count on each walkthrough.
   - `## Current Sample Count` section: starts at 1 after this walkthrough.
   - `## Open Questions` for future revisit (does runtime + sample-output cover UX gaps? does evidence capture lose value at scale? should each product slice have its own walkthrough claim?).
   - `## Do Not` block: do not generalize before N≥3 walkthroughs land.
8. Run `pnpm validate:records` and `pnpm check`. Both must pass.
9. If validation fails, fix records (not product code). Do not edit product files in this phase.
10. Update the parent plan reference if needed (no edits expected — parent plan is closed).

## Pre-Drafted Constraint Prompt (for cook handoff)

```text
Task: Author operator walkthrough evidence + experiment + tripwire meta file for the FastAPI Reference Build product shape.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- plans/reports/brainstorm-260511-1900-product-shape-bootstrap.md
- plans/260511-1900-product-shape-bootstrap/plan.md
- plans/260511-1900-product-shape-bootstrap/phase-02-operator-walkthrough-and-records.md
- records/claims/claim-product-fastapi-reference.yaml
- records/claims/claim-product-tanstack-reference-view.yaml
- schemas/experiment.schema.json
- docs/operator-guide.md
- docs/claim-verification.md

Pre-experiment scan (Q5 R2 rule):
- ls records/evidence/meta/ and read each file with a ## Trigger section matching event class "product slice operator walkthrough".
- Apply any guidance found.

Goal:
- Author walkthrough evidence (text only, schema-shape only, no raw values).
- Author experiment record citing existing product claims with verification.proves: runtime, output: sample-output.
- Author tripwire meta-evidence file deferring product-side loop generalization to N>=3.

Allowed write paths:
- records/evidence/product/operator-shape-walkthrough/walkthrough-260511T1900Z.md
- records/experiments/experiment-operator-product-shape-walkthrough-260511T1900Z.yaml
- records/evidence/meta/product-shape-verification-class.md

Forbidden actions:
- Do NOT modify any file under product/api/src/ or product/web/src/.
- Do NOT modify any existing record (no claim flips, no edits to historical experiments/decisions).
- Do NOT capture raw external data, cell values, row identifiers, credentials, install logs, or config contents.
- Do NOT take or reference screenshots (text-only walkthrough).
- Do NOT use bare "capability" or "user" language.

Validation:
- pnpm validate:records — must pass.
- pnpm check — must pass.

Stop conditions:
- Existing product claims fail to validate before this phase starts.
- Click-path cannot complete due to a phase-1 defect → return to phase 1.
- Validation fails after authoring and cannot be fixed by record edits alone.
```

## Todo List

- [x] Read schemas + existing product claims.
- [x] Pre-experiment scan of `records/evidence/meta/`.
- [x] Run `pnpm dev:api` + `pnpm dev:web` (operator action).
- [x] Walk the documented click-path.
- [x] Author walkthrough evidence file.
- [x] Author experiment record.
- [x] Author tripwire meta-evidence file.
- [x] `pnpm validate:records` passes.
- [x] `pnpm check` passes.

## Success Criteria

### Process Steps
- [x] Schemas and product claims read.
- [x] Meta-evidence pre-scan completed.
- [x] Walkthrough evidence file authored with schema-shape-only observations.
- [x] Experiment record validates against `experiment.schema.json`.
- [x] Tripwire file present at `records/evidence/meta/product-shape-verification-class.md` with `## Trigger`, current sample count, and Do Not block.
- [x] No product code modified.
- [x] No existing record modified.
- [x] `pnpm validate:records` + `pnpm check` pass.

### Experiment Outcome
- `supports` — click-path completes, all nav links work, search returns rows for "ACB" or comparable VN ticker.
- `does-not-support` — any nav link broken, any route 404s, search returns empty for tickers known to be in the equity list. Capture observations and follow-up plan needed.
- `inconclusive` — environment prevents walkthrough completion (dev server fails to boot, vnstock device gate, etc.).

## Risk Assessment

- **Risk**: Walkthrough evidence captures raw data. **Mitigation**: schema-shape-only rule + explicit `## Redacted Samples` placeholder convention + forbidden list in prompt.
- **Risk**: Loop phase agent attempts to "fix" a UX bug it observes (skill-phase work in loop phase). **Mitigation**: explicit forbidden list on `product/api/src/` and `product/web/src/`. If a bug is found, record `does-not-support` and create follow-up plan — do not patch.
- **Risk**: Tripwire wording too narrow, fails to fire when relevant. **Mitigation**: event class matches "product slice operator walkthrough" — broad enough to catch any future product slice; sample-count increment forces consideration on each walkthrough.
- **Risk**: Experiment validates but `claim_refs` cite stale claim shapes. **Mitigation**: read claim files first; cite by canonical id.

## Security Considerations

- Evidence file forbids: cell values, identifiers, time-series values, credentials, install logs, private artifacts, config contents.
- Operator must not paste live API responses into evidence — only column-name lists and class labels.
- Walkthrough touches the local FastAPI dev server only; no live external calls beyond what vnstock_data already performs server-side under existing approvals.

## Approval Gate

Operator approval required to close phase 2 (and plan). Review:
- Walkthrough evidence: schema-shape only, no raw values.
- Experiment YAML: correct `verification.proves`, correct `claim_refs`, justified `result`.
- Tripwire file: `## Trigger`, current sample count, Do Not block all present.
- Validation results.

## Next Steps

- Plan close-out. Mark `plan.md` status `completed`.
- Run `/ck:journal` capturing decisions, the deferred meta-question, and any UX observations from the walkthrough.
- If walkthrough surfaced a UX gap not covered by this plan, open a follow-up plan rather than patching in this phase.
- Future: when a 2nd product slice ships, re-walk the new slice and increment tripwire sample count.
