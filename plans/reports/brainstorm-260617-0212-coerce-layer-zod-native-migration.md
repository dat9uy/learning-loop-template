# Brainstorm — Coerce Layer Zod-Native Migration (Q2)

**Type:** brainstorm (debt-resolution decision)
**Date:** 2026-06-17
**Slug:** coerce-layer-zod-native-migration
**Status:** consensus — operator-approved 2026-06-17; ready for `/ck:plan` handoff
**Aligned to:** `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` Plan 1 (C5) factory
**Predecessor:** 2026-06-16 coercion probe (1/6 PASS) + Q2 problem-solving report (4 paths A/B/C/D)
**Successor:** `/ck:plan` for the migration plan (single PR; not Phase C scope)

---

## Problem

The `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema` layer in `tools/learning-loop-mastra/create-loop-tool.js:39-146` (and its twin `coerceParamsToSchema`/`coerceValue`/`unwrapItemWrap`/`installWireFormatCoercion` in `tools/learning-loop-mcp/tool-registry.js:1-136, 197-235`) is library-induced technical debt:

- **Why it exists:** Mastra's `createTool({inputSchema})` does not apply wire-format coercion; the 2026-06-16 probe proved 1/6 wire-format cases pass against raw `createTool`. The factory's `z.preprocess()` + `unwrapItem` are mandatory.
- **Why it's debt:** the same coercion logic is re-implemented in 2 places (legacy + mastra). The factory reads Zod v3/v4 internals (`_def.typeName` + `def` fallback) — unstable contract. The unwrap pattern strips `{item: X}` envelopes, which are an SDK wire-format quirk (NOT spec-conformant; not a bug; an SDK design choice).
- **The mastra skill is silent on coercion.** `.agents/skills/mastra/SKILL.md` and `references/core-concepts.md` do not address wire-format quirks. Mastra assumes coercion is upstream. This confirms the debt is library-induced, not a missing Mastra feature.

**The question:** how do we remove the coerce layer (or absorb it declaratively) so the loop's schema is the source of truth and the wire format adapts to it?

## Evaluated Options

### Option A — Zod-native coerce (z.coerce.* + z.union for envelope) ✅ CHOSEN

Replace imperative coercion with declarative Zod:
- `z.boolean().optional()` → `z.coerce.boolean().optional()` (string→bool at parse time)
- `z.number()` → `z.coerce.number()` (string→number at parse time)
- `z.array(z.string())` for fields that may arrive as `{item: [...]}` → `z.union([z.array(z.string()), z.object({item: z.array(z.string())})])` (both shapes accepted at parse time)
- Delete `coerceScalar`, `unwrapItem`, `coerceShape`, `wrapSchema` from `tools/learning-loop-mastra/create-loop-tool.js` (the factory collapses to a 1-line re-export of the inputSchema).
- Delete `coerceValue`, `unwrapItemWrap`, `coerceParamsToSchema`, `installWireFormatCoercion` from `tools/learning-loop-mcp/tool-registry.js`.
- Migrate 4 wire-format regression tests to zod-native contract (see Implementation Considerations).

**Pros:**
- 1-day effort (5-7 hours).
- ~150 lines of imperative code deleted; 0 lines of imperative code added.
- Schema is the source of truth. Wire format adapts to schema, not the reverse.
- Library-induced debt: 100% absorbed. The `z.coerce.*` API is Zod's official coercion mechanism (Zod v3.20+).
- Parity gate (Plan 2 closed) validates byte-identical output. Both servers wrap the same handler, so the migration is symmetric.

**Cons:**
- `z.coerce.boolean()` has different semantics from the current manual `coerceValue`:
  - Current: only `"true"` → `true`, `"false"` → `false` exactly. Other strings pass through unchanged.
  - `z.coerce.boolean()`: any truthy value (`"1"`, `1`, `"yes"`, non-empty string) → `true`; any falsy value (`"0"`, `0`, `"no"`, `""`, `null`) → `false`. **Semantic widening.**
- `z.union()` for array fields doubles schema size for affected fields (~15 of 29 tools).
- 4 wire-format tests must be rewritten in the new zod-native contract.

### Option B — Custom stdio parser (kill the source)

Write a custom MCP stdio handler that does NOT wrap arrays as `{item: X}`. Bypasses `@modelcontextprotocol/sdk`'s `validateToolInput`.

**Pros:** 100% removal of the unwrap layer; the source is fixed.

**Cons:** 3-5 days; re-implements upstream SDK behavior; couples to SDK internals; future SDK upgrades may re-introduce the quirk. **Rejected** (high coupling risk).

### Option C — HTTP transport migration (sidestep stdio)

Migrate both servers from stdio to Streamable HTTP transport. The MCP spec is silent on `{item: X}` envelopes; HTTP transport parses the request body as JSON-RPC (same as stdio). **Envelope quirk may or may not persist** depending on whether the wrapping is in the stdio-specific framing or in the transport-agnostic parser (research inconclusive; not safe to bet on).

**Pros:** Possible envelope elimination; aligns with Phase E (Mastra Code future).

**Cons:** 2-3 days; transport change ripples to Droid/Claude runtime config; conflicts with Phase E sequencing. **Rejected** for the coerce-removal scope; appropriate as a future parallel move if/when Phase E ships.

### Option D — Defer (current state)

**Pros:** 0 hours. Documents itself.

**Cons:** Debt grows. The 2 parallel coercion implementations will drift. **Rejected** because the operator has explicitly flagged this as debt they don't want to keep.

## Final Recommendation

**Option A** (Zod-native coerce). Single PR. Effort: 5-7 hours. Risk: medium (semantic widening + union verbosity). Library-bounded.

**Locked-in decisions (operator approval 2026-06-17):**
1. Accept `z.coerce.boolean()` semantic widening (any truthy/falsy value coerced). Document the new contract.
2. Use `z.union([z.array(...), z.object({item: z.array(...)})])` for array/object fields that may arrive as `{item: X}` envelopes.
3. Migrate 4 wire-format tests to zod-native contract (see Implementation Considerations).
4. Do NOT pursue HTTP transport migration as part of this work. HTTP is Phase E scope; not coupled to coerce removal.
5. Do NOT pursue custom stdio parser. SDK coupling risk is too high.

## Rationale

1. **The coerce layer is library-induced debt, not a domain choice.** Mastra's `createTool` is silent on wire-format quirks; the spec is silent on `{item: X}` envelopes. We can't fix the source without forking the SDK (Option B) or migrating to a transport that may or may not fix it (Option C). The only layer we own is the schema layer.
2. **The schema layer is the right layer to fix it.** Zod's `z.coerce.*` API is designed for this exact use case. `z.union()` is the declarative way to absorb both wire-format variants. The migration moves coercion from imperative-walker to declarative-schema, which is the YAGNI/KISS/DRY win.
3. **The semantic widening is acceptable.** `z.coerce.boolean()` is a superset of the current `coerceValue` (any value the current code accepts is also accepted by `z.coerce.boolean()`, plus more). The "more" is the only risk: agents sending `"1"` for boolean will now work (today: rejected). This is a UX improvement, not a regression.
4. **The 4 wire-format tests are the durable contract.** They document the agent-facing wire format regardless of implementation. Migrating them to zod-native assertions locks the new contract.
5. **Effort is bounded.** 5-7 hours; 1 PR; no transport change; no schema redesign. The migration is surgical.

## Implementation Considerations

### Schema migration pattern

For each tool's `inputSchema` in `tools/learning-loop-mcp/tools/`:

| Field type | Current | New |
|---|---|---|
| Optional boolean | `z.boolean().optional()` | `z.coerce.boolean().optional()` |
| Optional number | `z.number().optional()` | `z.coerce.number().optional()` |
| Array (may arrive as `{item: X}`) | `z.array(z.string())` | `z.union([z.array(z.string()), z.object({item: z.array(z.string())})])` |
| Object (may arrive as `{item: X}`) | `z.object({...})` | `z.union([z.object({...}), z.object({item: z.object({...})})])` |
| String (no change) | `z.string()` | `z.string()` |
| Enum (no change) | `z.enum([...])` | `z.enum([...])` |

The `z.union` is awkward for object fields. An alternative is to wrap the inputSchema in `z.preprocess((v) => isItemEnvelope(v) ? v.item : v, innerSchema)` — but that re-introduces the imperative walker. Trade-off: declaration in `z.union` (verbose schema) vs. declaration in factory (re-introduces wrapper).

**Recommendation:** use `z.union` for array fields; use `z.preprocess` only for object fields where `z.union` would be unmaintainable. Document the rule.

### 4 wire-format tests → zod-native contract

| Current test | New test (rename) | New assertion |
|---|---|---|
| `wire-format-coercion-fix.test.js` | `zod-coerce-boolean-string.test.js` | `z.coerce.boolean().parse("true")` → `true`; `parse("1")` → `true`; `parse("")` → `false` |
| `wire-format-top-level-coercion.test.js` | `zod-coerce-top-level.test.js` | `z.coerce.boolean()` at top of `inputSchema` accepts `"true"` |
| `wire-format-meta-state-optional-fields.test.js` | `zod-optional-coerce.test.js` | `z.coerce.boolean().optional().parse(undefined)` → `undefined`; `parse("true")` → `true` |
| `wire-format-patch-recursion.test.js` | `zod-union-envelope.test.js` | `z.union([z.array(z.string()), z.object({item: z.array(z.string())})]).parse({item: ["a", "b"]})` → `["a", "b"]`; `parse(["a", "b"])` → `["a", "b"]` |

**Test location:** co-locate with the schemas they test (per tool, not in global `__tests__/`). The 4 global tests become smoke tests for the contract; per-tool tests are the implementation.

### Code deletion

**In `tools/learning-loop-mastra/create-loop-tool.js`:**
- Delete: `coerceScalar`, `unwrapItem`, `extractShape`, `coerceShape`, `wrapSchema` (~100 lines)
- Keep: `createLoopTool({ id, description, inputSchema, execute })` as a 1-line re-export of `createTool({ id, description, inputSchema, execute })` (the wrapper no longer adds value once coercion is in the schema)
- Update: the file's docstring header — the Plan 3 cut-over note stays, but the coercion section is removed.

**In `tools/learning-loop-mcp/tool-registry.js`:**
- Delete: `coerceValue`, `unwrapItemWrap`, `coerceParamsToSchema`, `installWireFormatCoercion` (~140 lines)
- Keep: `unwrapTypeName` (used by other callers? verify with grep)
- Update: `registerTool` (lines 240-280+) — remove the `coerceParamsToSchema` call from the handler wrapper.

**Verification:** grep for `coerceParamsToSchema`, `installWireFormatCoercion`, `unwrapItemWrap` across the codebase to confirm no other callers.

### Risk to parity gate

Plan 2's parity harness (closed 2026-06-17) compares legacy output to mastra output via:
- `z.toJSONSchema({ target: "draft-7" })` schema comparison (inputSchema shape)
- 4-tool read-only content deepEqual (output)

After this migration:
- **inputSchema shape may change** for tools with `z.coerce.*` or `z.union` fields. The schema-comparison test will need to compare the *normalized* shape (after Zod's preprocessing). Re-run the parity suite; if it fails, update the comparator to allow `z.coerce.*` ↔ `z.*` equivalence.
- **Output is unchanged** because coercion happens at parse time (before the handler runs). Handler receives the same coerced args. The 4-tool content deepEqual should still pass.

**Mitigation:** re-run Plan 2's full parity suite (75 mastra tests + 4-tool read-only content parity) as a smoke gate.

## Success Criteria

| Item | Pass Condition |
|---|---|
| Schema migration | All 29 tools in `tools/learning-loop-mcp/tools/` use `z.coerce.*` for booleans/numbers and `z.union` for envelope-bearing array fields |
| Coerce layer deleted | `coerceScalar`, `unwrapItem`, `coerceShape`, `wrapSchema` removed from mastra; `coerceValue`, `unwrapItemWrap`, `coerceParamsToSchema`, `installWireFormatCoercion` removed from legacy |
| 4 tests migrated | New `zod-coerce-*` and `zod-union-envelope` tests pass; old `wire-format-*` tests deleted |
| Parity suite passes | 75 mastra tests + 4-tool read-only content parity + 9 legacy namespaces = 0 regressions |
| Documentation | Plan 3 cut-over note in `tools/learning-loop-mastra/schemas.js` (added in Plan 2) updated to mention the schema-source-of-truth pattern |
| SP2 grounding | `meta_state_check_grounding` run on `tools/learning-loop-mastra/create-loop-tool.js` (now 1-line) to track post-migration state |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `z.coerce.boolean()` semantic widening changes behavior for edge cases (`"1"`, `null`, `""`) | Medium | Document the new contract in the operator-guide; if any tool relies on the strict semantic, the migration surfaces it as a test failure |
| `z.union` verbosity for object fields makes schemas unreadable | Low | Use `z.preprocess((v) => isItemEnvelope(v) ? v.item : v, innerSchema)` for object fields where `z.union` is unmaintainable; document the rule |
| Parity gate inputSchema comparison fails on `z.coerce.*` ↔ `z.*` mismatch | Medium | Update the comparator to allow `z.coerce.*` ↔ `z.*` equivalence; re-run suite |
| The 4 migrated tests are renamed, breaking any external doc reference | Low | Add a redirect comment in the new test files pointing to the old name; update `docs/...` if they reference the old names |
| Future Zod v5 changes the `z.coerce.*` API | Low | Zod v5 (in beta) keeps `z.coerce.*` API stable per the Zod v5 changelog (as of 2026-06-17); track via SP2 grounding on `package.json` |
| A future HTTP transport migration (Phase E) makes this work obsolete | Low | `z.coerce.*` is a Zod-native pattern, not a transport workaround; it stays valid under HTTP. Only the `z.union` for envelope becomes obsolete (HTTP may or may not have the envelope quirk — see Research Report). Net: partial obsolescence is acceptable |
| Operator forgets to migrate one of the 29 tools | Low | The parity suite will fail (legacy output diverges from mastra output for that tool); the failure is loud and localized |

## Open Questions

1. **`z.union` vs. `z.preprocess` for object fields:** the rule "use `z.union` for arrays, `z.preprocess` for objects" needs operator confirmation. Alternative: use `z.union` everywhere (consistent but verbose).
2. **Parity gate inputSchema comparator update:** the current comparator uses `z.toJSONSchema({ target: "draft-7" })` strict equality. Should the updated comparator be (a) looser (allow `z.coerce.*` ↔ `z.*` equivalence), or (b) regenerate legacy's inputSchema to match the new zod-native shape (so the comparison stays strict)? Option (b) is cleaner but couples the migration to a legacy rewrite.
3. **Test co-location:** per-tool tests vs. global `__tests__/`. The recommendation is co-located; if operator prefers global, the 4 tests stay in `__tests__/` with broader scope.
4. **Plan 3 timing:** should this migration land before Plan 3 (so the cut-over ships without coerce layer), or after (Plan 3 ships with coerce layer; migration is fast-follow)? The 5-7 hour effort + 1 PR is small enough to land before Plan 3, but it is independent of Plan 3's C6/C7 scope. Operator decision: land before or after?
5. **Migration of `coerceValue`-specific edge cases:** the current code handles `"true"` and `"false"` only. The migration accepts more. Any operator concern that this enables bad input from agents? (e.g., agent sends `null` and gets `false` instead of error.) If yes, gate the migration with input-validation at the handler level.

## References

- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` — Plan 1 (C5) factory origin
- `plans/reports/productization-260612-1530-master-tracker.md:147` — 1/6 PASS probe record
- `tools/learning-loop-mastra/create-loop-tool.js:39-146` — coerce layer (mastra)
- `tools/learning-loop-mcp/tool-registry.js:1-136, 197-235` — coerce layer (legacy)
- `tools/learning-loop-mcp/__tests__/wire-format-{coercion-fix,top-level-coercion,meta-state-optional-fields,patch-recursion}.test.js` — 4 tests to migrate
- `.agents/skills/mastra/SKILL.md` + `references/core-concepts.md` — mastra skill (silent on coercion)
- `modelcontextprotocol.io/specification/2025-11-25/basic/transports` — MCP spec (silent on `{item: X}` envelope)
- `tools/learning-loop-mcp/core/meta-state.js` — schema source for `meta_state_*` (no coerce changes needed there)
- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` — sibling brainstorm (Q1)
