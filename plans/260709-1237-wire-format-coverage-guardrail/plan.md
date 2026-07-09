# Plan — wire-format coercion coverage: close remaining holes + guardrail

**Date:** 2026-07-09
**Status:** not started
**Skill:** problem-solving (Meta-Pattern Recognition + Simplification Cascade)
**Preceding ship:** `4b6402f` meta_state_batch recursive envelope strip (`meta-260709T1017Z-…-batch`, resolved `7545923`).

## The meta-pattern

MCP wire-format array coercion (`array` → `{item:[...]}` envelope) has bitten 4+ tools, each fixed ad hoc at runtime:

| Tool | Fix | Where |
|---|---|---|
| `meta_state_patch` | nest arrays inside `patch` | `meta-state-patch-tool.js` |
| `meta_state_propose_design` / `report` | `stripEnvelope` per field | plans `260608-1015`, `260611-2230` |
| `meta_state_batch` | `deepStripEnvelope` on `operations` (just shipped) | `4b6402f` |
| `meta_state_promote_rule` / `archive` / `list` / `resolve` | `stripEnvelope` per field | already protected |

The codebase's intended terminal state is **per-schema `z.preprocess`** — the generic `coerceParamsToSchema` walker was deliberately retired ("post-Phase 2 the schema is the source of truth", `create-loop-tool.js:8`). So the leverage move is not another runtime patch; it is (a) close the two remaining unguarded holes and (b) install a guardrail so the next tool can't silently regress.

## The two remaining holes (audit-verified)

| File | Field | Current | Risk |
|---|---|---|---|
| `loop-describe-tool.js:13` | `categories` | `z.array(z.string()).optional()` — **no preprocess** | `loop_describe` is the session-start discovery tool (highest call frequency). Coerced `categories: {item:[...]}` → category/tier filter silently rejected. Highest blast radius. |
| `loop-get-instruction-tool.js:88-92` | `key` (array branch) | `z.union([z.string(), z.number(), z.array(…)])` — array branch **no preprocess** | Coerced `key: {item:[...]}` → parse fails. |

The other 5 array-using tools (`promote_rule`, `archive`, `list`, `resolve`, `batch`) are already protected — confirmed by grep.

## Guardrail

Structural test: walk every handler tool schema with the zod-v4 introspection pattern already in `mastra/schema-parity.js` (`buildParitySchema` handles `pipe`/`optional`/`default`/`nullable`/`array`/`union` via `schema._zod.def.type`). For each schema field, if a `ZodArray` is reachable (through `optional`/`default`/`union`/`pipe`) **without** an intervening `z.preprocess(stripEnvelope | deepStripEnvelope, …)` ancestor, fail with `tool:field`. Extends the existing `MIGRATED_TOOL_NAMES` enumeration pattern in `mcp-tools-list-parity.test.js`.

Turns the recurring runtime `validation_failed` into a detected compile/test-time invariant.

## Phases

- [`phase-01-close-holes.md`](./phase-01-close-holes.md) — protect `loop_describe.categories` + `loop_get_instruction.key` array branch; per-tool tests; file the meta-pattern finding.
- [`phase-02-guardrail.md`](./phase-02-guardrail.md) — structural schema-walker guardrail test; assert all array fields are preprocess-guarded.

Phase 1 may ship first (protects the session-start tool immediately); phase 2 is the leverage. One PR or two — operator's call (split = clean per-finding revert, per prior practice).

## Acceptance criteria

1. `loop_describe` accepts `categories: {item:["gate-logic-bug"]}` and filters on it.
2. `loop_get_instruction` accepts `key: {item:["slug"]}` and resolves.
3. Both tools' non-coerced (`categories: ["x"]`, `key: "slug"`) paths unchanged (no behavior regression).
4. Guardrail test enumerates all handler tool schemas and **passes** (no reachable `ZodArray` without a strip-preprocess); fails loudly with `tool:field` on any future regression.
5. Existing tests pass; `mcp-tools-list-parity.test.js` parity unaffected (the preprocess wrapper is already shim-aware).
6. Meta-pattern finding filed (`meta_state_report`, category loop-anti-pattern, subtype `wire-format-coercion-recurrence`) and resolved at closeout; Rec 12 change-logs in-PR.

## Dependencies / risks

- Reuses `core/envelope-stripper.js` (`stripEnvelope`) + `mastra/schema-parity.js` walker pattern. No new abstraction.
- **Risk:** zod-v4 introspection fragility — `_zod.def.type` is stable across the `pipe`/`optional`/`default`/`array`/`union` cases `schema-parity.js` already relies on, so the walker is proven. Fallback if a case is missed: behavioral probe with hand-curated samples for the known array fields (less general, ships now); file a follow-up finding for full coverage.
- **Rollback:** revert the two preprocess wraps + the guardrail test. No registry/data impact.