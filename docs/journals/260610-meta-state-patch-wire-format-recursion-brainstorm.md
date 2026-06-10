# Journal: 260610 — meta_state_patch wire-format recursion brainstorm + plan

## Summary

Brainstormed the `loop-design-meta-state-patch-wire-format-recursion` loop-design (status `active`, v1) and its associated finding `meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug` (status `reported`, mechanism_check=true). Operator chose to split: ship a hot fix (symptom-level) in a new TDD plan, defer Bridge 5 (schema as source of truth) as a separate loop-design entry. Produced `plans/reports/brainstorm-260610-meta-state-patch-wire-format-recursion.md` (design source) and `plans/260610-meta-state-patch-wire-format-recursion/plan.md` (3 TDD phases, ~3h effort). 7 registry mutations planned for Phase 3 closeout. Operator chose "End session" at post-plan handoff; plan is ready for review/execution later.

## Key decisions

1. **Scope split per operator framing:** "the more we patching, the more it's harder to migrate to Bridge 5; we should leave good foundation for that (i.e. the future agent could read the code, understand the intent then translate the intent to Bridge 5 implementation)." Hot fix = 1 file + 1 helper + 1 test file. Bridge 5 = separate loop-design entry, no scope, no code changes.
2. **Fix lives in `tool-registry.js#coerceParamsToSchema` (registry layer), NOT in `meta-state-patch-tool.js` (tool layer).** Devil's Advocate consensus: "If you can't see it in the schema, don't touch it." Architect: Bridge 5 reads `coerceParamsToSchema` later, deletes the unwrap branch, and the patch tool schema can stay `passthrough` until then. A future agent reading this fix in 6 months sees intent in 1 place, translates cleanly.
3. **TypeName-gated unwrap (`ZodArray` or `ZodObject` only), max 3 iterations.** Aggressive unwrap of any `{item: X}` shape was rejected as a footgun (Security persona). Bounded iterations prevent infinite loops on self-referential passthrough schemas.
4. **`MAX_RECURSION_DEPTH` bumped 2 → 3** to match the documented `{item:{item:[...]}}` nesting depth (observed max 2 in production; 3 is a safety margin).
5. **Bridge 5 deferral entry: `loop-design-schema-source-of-truth`, status `active`, `proposed_design_for=[]`, `addresses=[]`, ~200-char paragraph referencing AGENTS.md Bridge 5 + 11 drift cells.** Pure deferral, zero scope. Discoverable via `meta_state_list({ entry_kind: "loop-design" })`.
6. **Plan mode: `/ck:plan --tdd`** (matches user choice + 260608-1015 + 260609-adopt-instruction-layer precedent). 3 phases: Red (3 tests) → Green (1 helper + 1 line) → Refactor + Closeout (7 registry mutations).

## Multi-persona predict (ck:predict) output

Ran 5-persona debate on the 2 open design questions (unwrap scope + touchpoint strategy) before finalizing.

**Verdict: CAUTION (proceed with disciplined approach).**

**Agreements (all 5):**
- Bug is real and structural (registry itself is inoperable; loop cannot learn about its own failures)
- Fix MUST ship hot, not wait for Bridge 5 (multi-week scope vs ~24h TTL pressure on finding #509)
- Fix MUST be self-evident and self-documenting (future-Bridge-5 agent must read and understand intent)
- Fix belongs in `coerceParamsToSchema` (registry layer), NOT in patch tool

**Conflicts resolved:** unwrap scope → C (ZodArray + ZodObject, 3-iter bound); touchpoints → A (registry layer only, zero changes to patch tool); recursion depth → 2 → 3; regression test scope → 3 tests including stdio transport; backward compat → typeName-gated helper.

**Top 3 risks identified:**
1. Infinite recursion on self-referential passthrough schemas → bounded by 3-iter + depth-3
2. Helper silently unwraps legitimate `{item: X}` value → typeName-gated
3. F11 lesson: fingerprint refresh before resolve → Phase 3 sequence lock-in (ack → refresh → check_grounding → resolve)

## What shipped (this session)

- `plans/reports/brainstorm-260610-meta-state-patch-wire-format-recursion.md` (~430 lines; design source)
- `plans/260610-meta-state-patch-wire-format-recursion/plan.md` (12KB; status: pending)
- `plans/260610-meta-state-patch-wire-format-recursion/phase-01-red-tdd-tests-first.md` (8KB; 3 failing tests)
- `plans/260610-meta-state-patch-wire-format-recursion/phase-02-green-implementation.md` (8KB; 1 helper + 1 wire-in)
- `plans/260610-meta-state-patch-wire-format-recursion/phase-03-refactor-and-closeout.md` (16KB; 7 registry mutations)
- `docs/journals/260610-meta-state-patch-wire-format-recursion-brainstorm.md` (this entry)

**No code changes.** No registry mutations. Plan is ready for `/ck:plan red-team` (recommended) or `/ck:cook` (faster, riskier) when the operator resumes.

## Tool surface used

- `ck plan create` (CLI v4.4.0, engineer kit v2.19.1) — scaffolded plan + 3 phase stubs
- `ck plan status` — verified 3 pending phases
- `Read` + `Grep` + `Glob` + `LS` + `Execute` — codebase exploration (existing registries, plan precedents, journal closeouts)
- `Task` not used; `TodoWrite` for in-session tracking

## Out of scope (deferred)

- Bridge 5 (schema as source of truth) → `loop-design-schema-source-of-truth` deferral entry planned for Phase 3
- `meta_state_propose_design` update mode (separate scope per precedent 260608-1015)
- `meta_state_archive` / `meta_state_undo_resolve` (full CRUD coverage)
- TTL redesign
- Auth/role system for `meta_state_patch`

## Operator handoff state

- Plan path: `plans/260610-meta-state-patch-wire-format-recursion/plan.md`
- Plan status: `pending` (0/3 phases complete)
- Design source: `plans/reports/brainstorm-260610-meta-state-patch-wire-format-recursion.md`
- Next step (when operator resumes): `/ck:plan red-team plans/260610-meta-state-patch-wire-format-recursion/plan.md` (recommended) or `/ck:cook plans/260610-meta-state-patch-wire-format-recursion/plan.md` (faster)
