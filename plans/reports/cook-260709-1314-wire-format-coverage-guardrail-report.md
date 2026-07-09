# Cook report — wire-format coercion coverage guardrail

**Plan:** `plans/260709-1237-wire-format-coverage-guardrail/`
**Mode:** `--auto` (auto-approve low-risk schema wraps; guardrail test is artifact-validated)
**Date:** 2026-07-09

## Status: DONE_WITH_NOTES

All acceptance criteria met. Plan's audit undercounted by 3 holes — guardrail surfaced them and they were closed in the same PR.

## Changes

| File | Change | Why |
|---|---|---|
| `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` | wrap `categories` with `z.preprocess(stripEnvelope, …)` | hole — `loop_describe` is session-start discovery |
| `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` | wrap `key` array branch with `z.preprocess(stripEnvelope, …)` | hole — union array branch unprotected |
| `tools/learning-loop-mastra/core/meta-state.js` | wrap `proposed_design_for`, `addresses`, `reopens` | 3 holes surfaced by guardrail walker (audit missed) |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-get-instruction-wire-format.test.js` | new — 8 schema tests | phase 01 coverage |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/wire-format-array-guard.test.js` | new — structural walker + 4 synthetic probes | phase 02 guardrail |
| `meta-state.jsonl` | 1 finding + 4 change-logs | audit trail |

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | `loop_describe` accepts `categories: {item:["gate-logic-bug"]}` | ✔ test `loop_describe schema accepts coerced categories: {item:[...]} envelope` |
| 2 | `loop_get_instruction` accepts `key: {item:["slug"]}` | ✔ test `loop_get_instruction schema accepts coerced key: {item:[...]} envelope` |
| 3 | Non-coerced paths unchanged (string/number/bare-array) | ✔ 3 explicit no-regression tests for both tools |
| 4 | Guardrail enumerates all 32 handler tools, passes | ✔ loads + walks 32 tool schemas, 0 unguarded arrays |
| 5 | `mcp-tools-list-parity` parity unaffected | ✔ 4/4 parity tests pass; shim already preprocess-aware |
| 6 | Meta-pattern finding filed, change-logs logged | ✔ `meta-260709T1316Z-recurring-mcp-wire-format-coercion-…` + 4 change-logs |

## Validation evidence

- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-get-instruction-wire-format.test.js` → 8/8 pass
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/wire-format-array-guard.test.js` → 5/5 pass
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/zod-optional-coerce.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/zod-union-envelope.test.js` → 20/20 pass
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-script-caller-passthrough.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-list-compact.test.js` → 24/24 pass
- `node --test tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js tools/learning-loop-mastra/__tests__/coerce-correctness.test.js` → 18/18 pass
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-description-mode.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-warm-tier.test.js` → 14/14 pass
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/build-inverse-indexes.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/file-index.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/build-registry-summary.test.js` → 19/19 pass
- **Negative control**: temporarily unwrapped `categories` → guardrail failed with `loop_describe:categories (path: root.optional)` → restored.

## Notes

- **Audit undercount**: The plan's grep-based audit claimed `promote_rule`, `archive`, `list`, `resolve`, `batch` were the only array-using tools; the structural walker found 3 more (`propose_design.proposed_design_for`, `propose_design.addresses`, `report.reopens`) that share the same vulnerability. Closed in the same PR because the source-of-truth (`metaStateLoopDesignSchema`/`metaStateFindingEntrySchema`) is the canonical site.
- **Detection method**: walker compares preprocess function name via `def.transform?.name === "stripEnvelope" | "deepStripEnvelope"`. Verified via Node inspection that `stripEnvelope.name === "stripEnvelope"` survives ESM re-export. Reference comparison (`s === stripEnvelope`) would also work; function name is used because it doesn't require holding a reference across module boundaries.
- **Walker scope**: handles `optional`/`default`/`nullable`/`pipe`/`union`/`discriminatedUnion`/`array` — same set `schema-parity.js` already relies on (proven path). Skips `object` recursion (handled by field-level loop at the schema root).

## Out of scope (deferred per plan)

- Resolve the meta-pattern finding — keep open until plan's post-merge closeout runs.
- Plan said "two hole-fixes don't get their own findings (folded into the one meta-pattern finding filed in phase 01)". Three additional holes found by the guardrail are also folded into the same meta-pattern finding; the change-logs cite it.