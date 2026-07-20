---
phase: 2
title: "Repair schemas write gate (preflight delegation)"
status: pending
priority: P2
effort: "4h"
dependencies: []
---

# Phase 2: Repair schemas write gate (preflight delegation)

## Overview

Resolve finding `meta-260720T1104Z-the-schemas-write-gate-at-tools-learning-loop-mastra-core-bo` by
converting the `schemas/**` write-gate rule from a dead-end simple-glob block (with a reason that
references a non-existent `pnpm validate:records` script and no working override path) into a
preflight-delegating rule mirroring the `skills` rule. Repair the reason text to the canonical
workflow and sweep the inherited stale `pnpm validate:records` references from the live reference
docs. TDD: write the gate behavior tests first (red), rewire the rule (green), sweep docs.

## Requirements

- **Functional**
  - `evaluateWriteGate({filePath:"schemas/runtime-state.schema.json"})` without a marker returns
    `{ decision: "block", surface: "schemas", reason, preflight_checklist }` where `reason` does
    **not** mention `pnpm validate:records` and points at the canonical workflow
    (`gate_mark_preflight(surface:"schemas")` → edit → `meta_state_log_change`).
  - After `gate_mark_preflight({surface:"schemas"})`, the same call returns `{ decision: "ok" }`.
  - `gate_mark_preflight` accepts `surface: "schemas"` (schema description updated; the `z.string()`
    validator already accepts any string).
  - `schemas` is removed from `BOUND_ARTIFACTS` and handled by a special-cased `schemas` entry in
    `WRITE_GATE_RULES` (mirroring `skills`/`skills-canonical`).
- **Non-functional**
  - `bound-artifacts.test.js` updated: the pinned-order assertion lists the 5 remaining simple-glob
    rules (`records, runtime-state, meta-state, file-index, build-artifacts`); a new assertion
    confirms `schemas` is handled by `evaluateWriteGate` (preflight-delegating), not `BOUND_ARTIFACTS`.
  - No live `pnpm validate:records` string remains under
    `tools/learning-loop-mastra/tools/handlers/references/` (docs + `evals/evals.json`).

## Architecture

Mirror the `skills` preflight pattern (Phase 5 of plan 260707-0114):

- `core/bound-artifacts.js`: delete the `schemas` entry from the `BOUND_ARTIFACTS` array and its
  const declaration. The frozen array drops from 6 to 5 entries. Update the module header comment
  that enumerates the rules.
- `core/evaluate-write-gate.js`:
  - Add `const SCHEMAS_GLOB = "schemas/**";`.
  - Add a `schemas` entry to `WRITE_GATE_RULES` **BEFORE `...BOUND_ARTIFACTS`** (red-team F4 —
    preserves today's first-match precedence over `build-artifacts`' `{,**/}dist/**` /
    `{,**/}build/**` / `{,**/}node_modules/**` globs, which would otherwise shadow
    `schemas/dist/**` etc. and silently break the preflight override for that subset):
    `{ name: "schemas", matchedRule: "schemas/**", match: (relPath) => globMatch(SCHEMAS_GLOB, relPath), reason: null }`.
    **Use the `SCHEMAS_GLOB` constant, NOT the literal `globMatch("schemas/**", …)`** (red-team F1
    Critical — `bound-artifacts.test.js:84-101` forbids `globMatch("schemas/**"` in
    `evaluate-write-gate.js`; mirroring `SKILL_CANONICAL_GLOB` keeps that test green without
    modification).
  - Add an `if (matched.name === "schemas") return evaluateSchemasPreflight({ filePath: relPath, root: resolvedRoot });` branch.
  - Add `evaluateSchemasPreflight({ filePath, root, matchedRule })` mirroring
    `evaluateSkillsPreflight`: read the `.loop-preflight-schemas` marker via `findPreflightMarker("schemas", resolvedRoot)`; block with a checklist that names `gate_mark_preflight(surface:"schemas")` and `meta_state_log_change`.
- `tools/handlers/mark-preflight-complete-tool.js`: update the `surface` schema description and the
  tool `description` to list `"schemas"` alongside `"product"`/`"skills"` (marker
  `.loop-preflight-schemas`, same 30-min TTL, same coordination-dir fan-out). **Tighten the validator
  from `z.string()` to `z.enum(["product", "skills", "schemas"])`** (red-team S6 — closes the
  arbitrary-marker litter vector in the same commit since the tool is already being edited).
- Docs: see the categorized sweep in Implementation Steps step 6 (red-team S5/S4).

The marker is stored in each runtime surface's `coordination/.loop-preflight-schemas` (same path
mechanism as `skills`), so no `SURFACES` change is needed — `findPreflightMarker` already scans all
surfaces' coordination dirs for the named marker.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/bound-artifacts.js` (remove `schemas` rule + const).
- Modify: `tools/learning-loop-mastra/core/evaluate-write-gate.js` (add `schemas` rule BEFORE
  `...BOUND_ARTIFACTS` + `evaluateSchemasPreflight` + dispatch branch; use `SCHEMAS_GLOB` constant).
- Modify: `tools/learning-loop-mastra/tools/handlers/mark-preflight-complete-tool.js` (description +
  schema description + tighten validator to `z.enum(["product","skills","schemas"])`).
- Modify (test): `tools/learning-loop-mastra/__tests__/legacy-mcp/bound-artifacts.test.js` —
  pinned-order to 5 rules; **header comment L9-10 and test title L31 from "6 simple-glob rules" to
  "5 simple-glob rules + 1 special-cased preflight rule"** (red-team F1/A5b); add a
  `schemas`-is-not-in-BOUND_ARTIFACTS + `evaluateWriteGate` handles `schemas` assertion. The
  existing "no longer inlines the 6 simple-glob literals" test (L84-101) stays green because the
  matcher uses `SCHEMAS_GLOB`, not the literal.
- Add (test): `tools/learning-loop-mastra/__tests__/legacy-mcp/schemas-write-gate.test.js` (block
  without marker, ok with marker, reason has no `validate:records`).
- Audit: `tools/learning-loop-mastra/core/change-log-bound-paths.js:46` (confirm `schemas/**` entry
  is path-list-only and unaffected by the rule move).
- Audit: `tools/learning-loop-mastra/core/loop-introspect.js:89` (the code consumer of
  `schemas/*.schema.json` — confirms the gate protects a real consumer).
- Sweep (live docs under `tools/learning-loop-mastra/tools/handlers/references/`):
  `orchestration-patterns.md`, `prompt-blueprints.md`, `prompt-blueprints-product-build.md`,
  `prompt-blueprints-state-gated.md`, `plan-phase-0-template.md`, `agent-anti-confusion-checklist.md`,
  `learning-loop-rules.md`, `meta-evidence-self-improvement.md`.
- Sweep (sibling dir, NOT under `references/` — red-team A2): `tools/learning-loop-mastra/tools/handlers/evals/evals.json`.

## Implementation Steps

1. **Red — gate behavior:** add `schemas-write-gate.test.js`:
   - `evaluateWriteGate({ filePath: "schemas/runtime-state.schema.json" })` →
     `decision: "block"`, `surface: "schemas"`, reason omits `validate:records`.
   - After `writePreflightMarker("schemas", coordDir)` (or `gate_mark_preflight({surface:"schemas"})`
     via the tool in an MCP test) → `decision: "ok"`.
   - `gate_mark_preflight` tool schema description includes `"schemas"`; `z.enum` accepts `"schemas"`.
   - `evaluateWriteGate({ filePath: "schemas/dist/foo.json" })` → matched by the `schemas` rule
     (NOT `build-artifacts`), proving the cascade-order fix (red-team F4).
   Confirm red (current code: `schemas` is a `BOUND_ARTIFACTS` block with the stale reason, no
   `surface` field, no override).
2. **Red — bound-artifacts test update (F1/A5b):** update `bound-artifacts.test.js` pinned-order to
   the 5-rule array; update header comment L9-10 and test title L31 from "6" to "5 + 1 special-cased
   preflight rule"; add `schemas`-is-not-in-BOUND_ARTIFACTS + `evaluateWriteGate` handles `schemas`
   assertions. Confirm the "no longer inlines the 6 simple-glob literals" test (L84-101) still passes
   against the new `globMatch(SCHEMAS_GLOB, …)` matcher (it should — no literal). Confirm red on the
   pinned-order/header assertions (current test asserts 6).
3. **Green — rewire:** in `bound-artifacts.js` remove `schemas`; in `evaluate-write-gate.js` add the
   `schemas` rule (BEFORE `...BOUND_ARTIFACTS`, using `SCHEMAS_GLOB`) + `evaluateSchemasPreflight` +
   dispatch branch; in `mark-preflight-complete-tool.js` update descriptions + tighten the validator
   to `z.enum(["product","skills","schemas"])`. Run `pnpm test:one` on the two test files → green.
4. **Green — reason text:** set the block reason to the canonical workflow:
   `"Schema changes are gated. Walk the preflight checklist, call gate_mark_preflight(surface:'schemas') to unlock for 30 minutes, edit, then log the change with meta_state_log_change."`
5. **Audit `change-log-bound-paths.js` + `loop-introspect.js`:** confirm `schemas/**` is unaffected
   by the rule move (path-list-only) and that `loop-introspect` reads `schemas/*.schema.json` (real
   consumer — no code change).
6. **Categorized doc sweep (red-team S5/S4/A3):** categorize every `pnpm validate:records` AND
   `pnpm check` occurrence under `tools/learning-loop-mastra/tools/handlers/` (both tokens are
   non-existent in `package.json` — verified) before editing:
   - **(a) Schemas-gate-unlock passages** (any passage specifically about editing `schemas/**`) →
     replace with `gate_mark_preflight(surface:'schemas')` → edit → `meta_state_log_change`.
   - **(b) General record-validation-hygiene passages** (the majority — "validate records after any
     change") → replace with the actual canonical record step (`pnpm test` and/or MCP record tools),
     **NOT** the schemas-gate unlock. Do NOT inject `gate_mark_preflight({surface:"schemas"})` into
     record-hygiene docs — that would pollute the audit trail with spurious unlock calls.
   - **`evals/evals.json` (red-team S4/A2):** the `runtime-proof-prompt` and `orchestration-prompt`
     evals test **record-validation hygiene**, NOT schemas-gate unlock. Replace the
     `pnpm validate:records`/`pnpm check` assertion text with the record-hygiene canonical step
     (`pnpm test`/MCP record tools) — NOT the schemas unlock. Provide the exact replacement
     assertion text inline so the executor does not reinterpret.
   - Sweep BOTH `pnpm validate:records` and standalone `pnpm check` (red-team A3 — the "where it
     shares the stale recipe" qualifier leaves standalone `pnpm check` references in 5+ files;
     widen the sweep to both tokens across all `handlers/` files).
7. **Verify (red-team A2/A3):** `grep -rn "validate:records\|pnpm check"
   tools/learning-loop-mastra/tools/handlers/` → 0 matches (covers `references/` AND `evals/`).
   `pnpm exec vitest --changed` green. `pnpm test` green. `pnpm gate:self-verify` green.

## Success Criteria

- [ ] `schemas/**` write-gate blocks without marker (surface `"schemas"`, no `validate:records` in
  reason) and returns `ok` after `gate_mark_preflight({surface:"schemas"})`.
- [ ] `BOUND_ARTIFACTS` has 5 simple-glob rules; `bound-artifacts.test.js` pinned-order + header +
  title updated to "5 + 1 special-cased preflight rule"; the "no longer inlines" test stays green.
- [ ] `schemas/dist/foo.json` matches the `schemas` rule, NOT `build-artifacts` (cascade F4 test).
- [ ] `gate_mark_preflight` tool description lists `"schemas"`; validator is
  `z.enum(["product","skills","schemas"])`.
- [ ] `grep -rn "validate:records\|pnpm check" tools/learning-loop-mastra/tools/handlers/` → 0 matches
  (covers `references/` + `evals/evals.json`).
- [ ] `evals/evals.json` updated to the record-hygiene canonical step (NOT the schemas unlock).
- [ ] `change-log-bound-paths.js` + `loop-introspect.js` audited — `schemas/**` unaffected / real consumer.
- [ ] `pnpm test` + `pnpm gate:self-verify` green.

## Risk Assessment

- **`bound-artifacts.test.js` no-inline-literals test** (Critical, red-team F1): the test at L84-101
  forbids `globMatch("schemas/**"` in `evaluate-write-gate.js`. Mitigation: use the `SCHEMAS_GLOB`
  constant in the matcher (mirror `SKILL_CANONICAL_GLOB`) — the forbidden regex
  `/globMatch\("schemas\/\*\*/` does not match `globMatch(SCHEMAS_GLOB, …)`. The test stays green
  unchanged.
- **Cascade ordering** (medium, red-team F4): moving `schemas` after `...BOUND_ARTIFACTS` lets
  `build-artifacts` shadow `schemas/dist/**`, `schemas/build/**`, `schemas/node_modules/**`.
  Mitigation: insert the `schemas` rule BEFORE `...BOUND_ARTIFACTS`; pin with the
  `schemas/dist/foo.json` test.
- **Surface validator litter** (medium, red-team S6): `z.string()` lets any client mint arbitrary
  markers. Mitigation: tighten to `z.enum(["product","skills","schemas"])` in the same commit.
- **Partial-write race** (low, red-team F8, pre-existing): `mark-preflight` fan-out is best-effort;
  any single surface's marker is sufficient to unlock the gate, so a partial fan-out failure still
  returns `ok`. This is pre-existing behavior the plan inherits. Mitigation: documented note only —
  no code change this plan; file a separate finding if all-or-nothing fan-out is desired.
- **Doc-sweep conflation** (medium, red-team S5/S4): injecting the schemas-gate unlock into general
  record-hygiene docs would pollute the audit trail. Mitigation: the categorized sweep (step 6)
  routes each occurrence to the correct canonical step.
- **Eval fixture drift** (low, red-team S4): `evals/evals.json` asserts on the dead script text.
  Mitigation: update the eval fixture to the record-hygiene canonical step (not the schemas unlock)
  in the same commit.
- **Operator workflow change** (low): operators who learned the dead `pnpm validate:records`
  incantation must now use the preflight path for schemas and `pnpm test`/MCP tools for records.
  Mitigation: the new reason text is the source of truth; the doc sweep propagates it.