---
title: "meta_state_patch wire-format recursion hot fix + Bridge 5 deferral"
description: "Closes meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug (the meta_state_patch tool corrupts data via {item:[...]} wrapping when patch contains array + scalars, and coerceParamsToSchema does not recurse into passthrough ZodObjects). Ships 1 helper (unwrapItemWrap) in tool-registry.js#coerceParamsToSchema, adds 3 stdio regression tests, and files a separate Bridge 5 loop-design (loop-design-schema-source-of-truth) as pure deferral. Zero changes to meta-state-patch-tool.js — Bridge 5 reads coerceParamsToSchema later and deletes the unwrap branch when schema-derived schemas replace passthrough."
date: "2026-06-10T01:30:00Z"
tags: [meta, mcp-tools, meta-state, wire-format, recursion, recursion-bug, bridge-5, deferral, tdd, red-team-amended]
status: approved
session: 260610-wire-format-recursion
red_team_report: plans/reports/red-team-260610-0911-meta-state-patch-wire-format-recursion-report.md
red_team_amendments:
  - "1: Rename new test file .cjs -> .test.js (operator confirmed copy-paste; .cjs files are excluded from pnpm test glob)"
  - "2: Drop MAX_RECURSION_DEPTH 2->3 bump + drop MAX_UNWRAP_ITERATIONS constant (operator confirmed unjustified; YAGNI; 1-place usage)"
  - "3: Add pre-validation for propose_design empty-array shape; if it fails, file Bridge 5 deferral via log_change instead (operator agreed the data-integrity fix pattern is the same anti-pattern)"
  - "4: Add supersedes field to Step 1 change-log to formally correct stale change-log #510 (scouted: meta_state_log_change has supersedes field; canonical pattern)"
  - "5: Step 7 payload includes addresses: [] alongside scalars (Option B: earns the recursive proof framing; empty array exercises unwrap path)"
  - "6: Add a pre-Step-4 evidence_code_ref patch on finding #509 to point to the fix site (file evidence_code_ref is wrong; would hash the wrong file)"
  - "7: Reground Test 1 to patch a loop-design (not a finding); loop-designs have addresses in their schema, findings don't"
supersedes: null
superseded_by: null
related:
  - loop-design-meta-state-patch-wire-format-recursion (closes this active design; status flips active→inactive on ship)
  - meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug (closes this reported finding; status flips reported→resolved on ship)
  - meta-260608T1258Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js (predecessor change-log; meta_state_patch tool shipped 2026-06-08)
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (auto-resolved; the structural parent of the wire-format coercion root cause)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (auto-resolved; re-opened briefly during plan 260609-adopt-instruction-layer closeout due to the bug this plan fixes)
  - loop-design-cross-reference-fields (shipped; sibling cross-reference design that motivated meta_state_patch)
  - loop-design-instruction-layer (shipped 2026-06-10T01:03:00Z; the design that hit the wire-format bug in Phase 3 and required an operator-approved node -e escape hatch to unwrap the corrupted value)
  - tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema (the fix point; current depth=2, no item-wrap unwrap)
  - tools/learning-loop-mcp/tools/meta-state-patch-tool.js#schema (UNCHANGED; passthrough stays until Bridge 5)
  - tools/learning-loop-mcp/core/gate-logic.js (NOT touched; keep fix in registry layer)
  - tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js (precedent test file; new tests mirror this pattern with stdio transport)
  - plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md (precedent TDD plan with 3 phases; 12 tests; F11 lesson on fingerprint refresh before resolve)
  - plans/260609-adopt-instruction-layer/plan.md (the plan that hit the bug in Phase 3 closeout; journal documents the 4 retries producing {item:{item:[...]}} shapes)
  - docs/journals/260609-adopt-instruction-layer-closeout.md (closeout journal; documents the operator-approved node -e escape hatch; documents version 1→13 retries)
  - AGENTS.md Bridge 5 (the deferred scope; this design's loop-design-schema-source-of-truth entry is a 200-char reference to this)
related_findings:
  - meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug (closed by Phase 3, after ack → refresh_fingerprint → check_grounding → resolve sequence per F11 from 260608-1015 plan)
---

# meta_state_patch wire-format recursion hot fix + Bridge 5 deferral

## TL;DR

The `meta_state_patch` MCP tool corrupts data when called via the stdio transport with a combined patch (array + scalars): top-level array values get wrapped as `{item: [...]}` and the wrapper can nest to `{item: {item: [...]}}` over multiple retries. The root cause is in `coerceParamsToSchema` — it does not (a) recurse into `ZodObject` with `.shape` missing (the `passthrough` case), and (b) does not unwrap `{item: X}` envelopes. Plan `260609-adopt-instruction-layer` hit this in Phase 3, produced 13 retries with nested wrapping, and required an operator-approved `node -e` escape hatch to surgically unwrap the value.

**This plan ships a hot fix (symptom-level) in 1 file + 1 test file + 1 helper, and files a separate Bridge 5 loop-design as pure deferral.** Zero changes to `meta-state-patch-tool.js`. Bridge 5 will read `coerceParamsToSchema` later, delete the unwrap branch, and replace `passthrough` with schema-derived schemas — that work is a multi-week scope, explicitly out of this plan.

**Plan mode:** `/ck:plan --tdd`. ~3h estimated effort. 3 phases (Red/Green/Refactor+Closeout), 4 new tests, 1 new helper, 0 constant changes, 8 registry mutations.

## Problem Statement

### The 2 active artifacts

| Artifact | Status | Class | Closed by |
|----------|--------|-------|-----------|
| `loop-design-meta-state-patch-wire-format-recursion` | active (v1) | design (symptom-level fix) | Status flips `active`→`inactive`, `shipped_in_plan` populated on ship |
| `meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug` | reported, mechanism_check=true | wire-format-bug | Resolved via ack → refresh_fingerprint → check_grounding → resolve sequence (F11 from 260608-1015 plan) |

### Why the user pushed for "split the loop design to the hot fix first then do it, hold Bridge 5 as separate"

Two structural reasons:

1. **Bridge 5 is multi-week scope.** Per AGENTS.md: "for every record type, four parallel hand-written 'field catalogues' exist (schema + tool zod + writer + validator). 11 drift cells across experiment + risk." The recursive problem (derive the patch tool schema from the loop-design schema at startup) touches all 4 record types. A 3-day hot fix is not in the same scope as a 2-week schema-derivation effort.

2. **The hot fix must leave a clean foundation for Bridge 5.** If the hot fix is a mass-recursive unwrap or a per-tool special case, a future Bridge 5 agent cannot read the code and understand intent. Per the user's framing: "the more we patching, the more it's harder to migrate to Bridge 5; we should leave good foundation for that (i.e. the future agent could read the code, understand the intent then translate the intent to Bridge 5 implementation)."

**Implication:** the fix MUST live in `coerceParamsToSchema` (the contract layer), not in `meta-state-patch-tool.js` (the tool layer). When Bridge 5 ships, the future agent reads `coerceParamsToSchema`, sees `unwrapItemWrap` is a wire-format-specific helper, and knows to delete it (not port it).

### Wire-format coercion as root cause (the unblocker)

The bug class is the same as `meta-260606T2202Z` (top-level array/boolean coercion in MCP tool schemas). Plan `260608-1015-meta-state-patch-tool-and-wire-format-fix` shipped the generic `coerceParamsToSchema` helper with:
- Top-level array/boolean/number re-hydration from strings
- Recursive walk into nested ZodObject (depth 2)
- Identity-preserving no-op for correctly-typed args

**Two gaps in that helper, both observed in production 2026-06-09:**

1. **`ZodObject` with `.shape` missing (the `passthrough` case).** The current recursion uses `schema.shape || schema`, which falls through to the `passthrough()` empty-shape case. The recursion guard `fieldSchema && typeName === "ZodObject"` works, but the recursion into the value object is a no-op for passthrough because there's no per-field schema to coerce against.

2. **`{item: X}` envelope wrapping.** The MCP SDK v1.29.0 wire framing wraps single-element top-level arrays as `{item: [value]}` (an idiom from the older JSON-RPC convention for arguments-as-objects). The current helper does not unwrap. Combined with the depth-2 recursion, the result is `{item: {item: [a, b, c]}}` over multiple retries.

### Observed reproduction (from plan 260609-adopt-instruction-layer closeout)

```js
// Single combined call (4 fields)
await meta_state_patch({
  id: "loop-design-instruction-layer",
  entry_kind: "loop-design",
  patch: {
    proposed_design_for: [trackA, trackB, meta-260606T1433Z],
    status: "inactive",
    shipped_in_plan: "plans/260609-adopt-instruction-layer/",
    shipped_at: "2026-06-10T01:03:00.000Z",
  },
  _expected_version: 0,
});

// Stored as:
// proposed_design_for: { item: { item: [trackA, trackB, meta-260606T1433Z] } }
//
// After 12 retries (versions 1 → 13):
// proposed_design_for: { item: { item: { item: ... } } }
```

The closeout journal records "1 line surgical fix, no audit log corruption" via `node -e` escape hatch to unwrap. The `meta-260606T2102Z` finding is NOT being re-opened (documented data fix to data the loop's own MCP tool corrupted, not an anti-pattern adoption).

## Evaluated Approaches

### Scope dimension (Q1 of discovery)

#### A. Hot fix only (CHOSEN)

Ship `unwrapItemWrap` helper + 4 stdio tests (3 + 1 pre-validation for empty arrays). File `loop-design-schema-source-of-truth` as pure deferral (or via `meta_state_log_change` if pre-validation fails). Zero constant changes (per red-team amendment 2: depth bump and `MAX_UNWRAP_ITERATIONS` constant both dropped).

**Pros:** lowest blast radius; matches the operator's "split it" framing; leaves a clean foundation for Bridge 5 (1 helper, 1 wire-in block, 3-iter bound inlined, easy to delete later); 8 registry mutations (1 supersedes change-log + 1 new loop-design + 1 evidence_code_ref patch + 1 lifecycle ack/refresh/resolve + 1 closeout).

**Cons:** does not solve the root cause class; future tools with combined array + scalar fields will hit the same bug and need the same fix.

**Decision:** ✓ CHOSEN. The user explicitly chose this scope.

#### B. Hot fix + auto-migrate Bridge 5 (rejected)

Ship the hot fix AND start the Bridge 5 schema-derivation work in the same plan.

**Pros:** closes the structural root cause; one PR.
**Cons:** 2-week scope; 4 record types to migrate; 11 drift cells to reconcile; mixes two independent concerns.

**Why rejected:** the user explicitly said "hold Bridge 5 as separate loop design for later."

#### C. Skip the hot fix, go straight to Bridge 5 (rejected)

Block all registry updates on Bridge 5 schema-derivation.

**Pros:** no patch-on-patch-on-patch debt.
**Cons:** 2-week freeze on registry updates; `meta-260610T0115Z` expires 2026-06-10T18:50:24.269Z (TTL pressure); loop cannot learn about its own registry.

**Why rejected:** TTL pressure + the loop's operational dependency on `meta_state_patch` (used by the cross-reference fields, the instruction layer, the cross-reference-fields plan, and 4+ other in-flight designs).

### Unwrap-scope dimension (Q2 of discovery)

#### A. Unwrap only when target is ZodArray (CHOSEN)

`unwrapItemWrap(value, typeName)` only unwraps `{item: X}` when `typeName === "ZodArray"` or `typeName === "ZodObject"`. Bounded to 3 iterations.

**Pros:** matches the documented symptom (arrays + passthrough objects); falsifies only the known wire-format class; typeName-gated prevents accidentally unwrapping legitimate `{item: X}` values.

**Cons:** could miss a future wire-format class that wraps scalars (e.g., `{value: X}`).

**Decision:** ✓ CHOSEN. Devil's Advocate: "If you can't see it in the schema, don't touch it."

#### B. Unwrap any `{item: X}` regardless of type (rejected)

Helper unwraps any `{item: X}` value up to 3 iterations.

**Pros:** catches unknown wire-format classes; no typeName gating.
**Cons:** could unwrap a legitimate `{item: X}` value that happens to be a real field; Security persona flagged as footgun.

**Why rejected:** too aggressive. If a future wire-format class appears, add a new branch (the helper signature is typeName-gated by design).

#### C. Unwrap when target is ZodArray OR ZodObject, no iteration bound (rejected)

Same as A but no 3-iter limit.

**Pros:** handles arbitrarily deep nesting.
**Cons:** could loop on self-referential passthrough schemas; Devil's Advocate flagged as infinite-recursion risk.

**Why rejected:** the 3-iter bound is sufficient for the observed nesting (max 2 in production; 3 is a safety margin).

### Bridge 5 loop-design shape (Q3 of discovery)

#### A. Single new loop-design entry, no scope (CHOSEN)

id=`loop-design-schema-source-of-truth`, status=`active`, `proposed_design_for=[]`, `addresses=[]`, single paragraph referencing AGENTS.md Bridge 5 + the 11 drift cells.

**Pros:** discoverable via `meta_state_list({ entry_kind: "loop-design" })`; pure deferral; zero scope.

**Cons:** one extra registry line.

**Decision:** ✓ CHOSEN.

#### B. New loop-design + explicit "Bridge 5 deferred" change-log (rejected)

Loop-design + a `meta_state_log_change` announcing the deferral.

**Pros:** visible change-log trail.
**Cons:** 2 registry lines for a deferral; the change-log is the wrong surface (change-logs are for ACTUAL changes, not for deferral announcements).

**Why rejected:** loop-design alone is the canonical deferral surface (per `meta_state_propose_design` schema).

#### C. Don't file a new loop-design (rejected)

Note in hot fix closeout journal that Bridge 5 is a separate future plan.

**Pros:** zero registry mutations.
**Cons:** not discoverable via `meta_state_list`; future agents see only the journal entry, not the registry.

**Why rejected:** registry discoverability is the whole point of the loop-design entry kind (per `meta-260606T2055Z-...` change-log).

### Plan mode (Q4 of discovery)

`/ck:plan --tdd` (CHOSEN) — matches the 260608-1015 precedent and the user's choice. 3 phases (Red/Green/Refactor+Closeout), 4 new tests (per red-team amendment 3: pre-validation for empty arrays added), 1 new helper, 0 constant changes, 8 registry mutations (per red-team amendments 4 + 6: +1 for `supersedes` on the change-log, +1 for `evidence_code_ref` patch). ~3h estimated effort.

### Touchpoints (Q5 of discovery)

#### A. `tool-registry.js#coerceParamsToSchema` only (CHOSEN)

Fix lives in 1 file. Zero changes to `meta-state-patch-tool.js`. The helper is added to the same file as the existing coercion logic. `core/gate-logic.js` is NOT touched.

**Pros:** single source of truth for the contract between wire format and Zod; Bridge 5 reads `coerceParamsToSchema` later and deletes the unwrap branch in 1 file edit; future agent reading this fix sees intent in 1 place.

**Cons:** none (matches Devil's Advocate consensus).

**Decision:** ✓ CHOSEN.

#### B. `tool-registry.js` + new helper in `core/gate-logic.js` (rejected)

Move `unwrapItemWrap` to `core/gate-logic.js` for "reusability."

**Pros:** future tools that want the unwrap can import it.
**Cons:** reusability is YAGNI (no other tool needs it; Bridge 5 deletes it); spreading the fix across 2 files makes intent harder to read.

**Why rejected:** Devil's Advocate: "Don't add a generic unwrap; if you can't see it in the schema, don't touch it."

#### C. Both files above + patch tool schema (rejected)

Touch `tool-registry.js`, `core/gate-logic.js`, AND `meta-state-patch-tool.js#schema` to declare ZodArray fields explicitly.

**Pros:** "proactive hardening" of the patch tool schema.
**Cons:** Architect flagged as "doing Bridge 5 in miniature"; Devil's Advocate flagged as cargo-cult pattern.

**Why rejected:** the user explicitly said "do not create a lot of technical debt; the more we patching, the more it's harder to migrate to Bridge 5; we should leave good foundation for that." The patch tool schema stays `passthrough` until Bridge 5 day.

## Final Architecture

### 1. New helper in `tool-registry.js`

**File:** `tools/learning-loop-mcp/tool-registry.js`

**New helper:**
```js
function unwrapItemWrap(value, typeName) {
  // Only unwrap {item: X} when the declared target type is array or object
  if (typeName !== "ZodArray" && typeName !== "ZodObject") return { value, unwrapped: 0 };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, unwrapped: 0 };

  let cur = value;
  let depth = 0;
  while (depth < 3) {
    const keys = Object.keys(cur);
    if (keys.length !== 1 || keys[0] !== "item") break;
    cur = cur.item;
    depth++;
  }
  return { value: cur, unwrapped: depth };
}
```

**Wired into `coerceParamsToSchema`:**

```js
// After existing coerceValue call:
const unwrapResult = unwrapItemWrap(coerced[key], typeName);
if (unwrapResult.unwrapped > 0) {
  coerced[key] = unwrapResult.value;
  didCoerce = true;
  if (root) {
    try {
      appendGateLog(root, {
        action: "item_wrap_unwrapped",
        field: key,
        depth: unwrapResult.unwrapped,
      });
    } catch { /* logging is best-effort */ }
  }
}
```

**No changes to `MAX_RECURSION_DEPTH`** (stays at 2). The 3-iter bound on the `{item: X}` chain is inlined in the helper — these are orthogonal concerns (the unwrap handles wire-format envelopes; the recursion handles nested ZodObject values). The 2→3 depth bump was proposed without a workload that hits depth 2 currently; dropped per operator ruling.

### 2. Zero changes to `meta-state-patch-tool.js`

The patch tool's schema stays:
```js
patch: z.object({}).passthrough()
  .describe("Partial fields to update. Nest arrays/booleans in this object. ...")
```

**Rationale:** Bridge 5 (deferred) replaces this with a schema-derived union. Adding ZodArray fields now would be doing Bridge 5 in miniature and would be deleted on Bridge 5 day. Future agent reading the registry in 6 months sees `coerceParamsToSchema` and knows to delete the unwrap branch in 1 file edit.

### 3. Regression test file: `__tests__/wire-format-patch-recursion.test.js`

**4 tests, all via stdio transport** (mirroring `wire-format-coercion-fix.test.js` pattern; the `.test.js` extension is picked up by `pnpm test`'s glob — `.cjs` files like `cold-session-discoverability.test.cjs` are excluded):

```js
// Test 1: Combined patch with array + scalars round-trips a flat array
// Setup: spawn MCP server via stdio, call meta_state_report to write a loop-design
//        (use a loop-design entry, not a finding — loop-designs have addresses / proposed_design_for in
//         their schema; findings don't, so coercion would skip the field)
// Call: meta_state_patch with patch: { addresses: ["a", "b", "c"], severity_hint: "low" }
//       (loop-design schema: addresses: z.array(z.string()).default([]), severity_hint: z.string().optional())
// Assert: registry shows addresses: ["a", "b", "c"] (flat array, no {item: ...} wrap)
// Assert: gate.log contains item_wrap_unwrapped entry with field="addresses", depth=2

// Test 2: Deeper nesting {item:{item:[...]}} unwraps correctly
// Setup: directly call coerceParamsToSchema with mock args containing nested {item:{item:[...]}}
// Assert: returns flat array; item_wrap_unwrapped log entry with depth=2

// Test 3: meta_state_propose_design with proposed_design_for + scalars
// Setup: spawn MCP server via stdio
// Call: meta_state_propose_design with proposed_design_for=[x, y] + addresses=[z] + title="..."
// Assert: registry shows proposed_design_for: [x, y] (flat array)
```

### 4. Bridge 5 deferral: `loop-design-schema-source-of-truth`

**File:** `meta-state.jsonl`

**Pre-validation (NEW per red-team amendment 3):** before filing the deferral, Test 1.5 in Phase 1 will call `meta_state_propose_design` with `proposed_design_for: []` and `addresses: []` (both empty arrays) over stdio. If the registry stores both as flat empty arrays, the canonical tool works for the deferral shape; file as below. If it stores them as `{item: []}` (deeper fix needed for empty arrays), defer Bridge 5 to a follow-up plan and file the deferral via a `meta_state_log_change` instead (change-logs don't have the array shape issue).

**Shape (filed via `meta_state_propose_design` after the hot fix is green and the pre-validation passes):**
```yaml
id: loop-design-schema-source-of-truth
entry_kind: loop-design
title: "Schema as source of truth (Bridge 5) — derive tool schemas from record schemas at startup"
status: active
proposed_design_for: []
addresses: []
description: |
  Deferred design (Bridge 5 per AGENTS.md): derive the meta_state_patch tool schema
  from the 4-kind Zod union (metaStateEntrySchema) at startup so the
  `z.object({}).passthrough()` and the `unwrapItemWrap` helper in
  tool-registry.js#coerceParamsToSchema can be deleted. 11 drift cells across
  experiment + risk per AGENTS.md Bridge 5. Hot fix for the current
  {item:[...]} wrap bug is shipped by plan <this-plan>/.
affected_system: mcp-tools
created_by: operator
```

**Why no fallback to direct registry write:** the previous plan proposed a "documented data-integrity fix pattern" that turned out to be the same `meta-260606T2102Z` anti-pattern (per red-team amendment 3; operator confirmed the distinction is tautological). Pre-validation removes the need for the fallback entirely.

### 5. Closeout registry mutations (8 total)

| # | Tool | Target | Purpose |
|---|------|--------|---------|
| 1 | `meta_state_log_change` | `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` | `change_diff.added: ["unwrapItemWrap helper"]`, `applies_to.tools: ["meta_state_patch", "meta_state_propose_design", "meta_state_report"]`, **`supersedes: "meta-20260609185059Z-meta-state-patch-wire-format-recursion-design-proposed"`** (per red-team amendment 4; formally corrects the stale change-target `core/gate-logic.js` → `tool-registry.js`) |
| 2 | `meta_state_propose_design` | id=`loop-design-schema-source-of-truth` | Bridge 5 deferral (see § 4 above; only if § 4 pre-validation passes) |
| 2.5 | `meta_state_patch` on `meta-260610T0115Z-...` | patch `evidence_code_ref` from `"tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler"` to `"tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"` | Per red-team amendment 6; the fingerprint in Step 4 must hash the fix site, not the patch tool's handler. Without this, `check_grounding` returns `drifted` against the wrong file |
| 3 | `meta_state_ack` | `meta-260610T0115Z-...` | Promote finding from `reported` to `active` (removes 24h TTL pressure) |
| 4 | `meta_state_refresh_fingerprint` | `meta-260610T0115Z-...` | F11 lesson from 260608-1015 plan: refresh fingerprint after editing evidence_code_ref files (now pointing to the correct file after Step 2.5) |
| 5 | `meta_state_check_grounding` | `meta-260610T0115Z-...` | Verify `grounded` status before resolve |
| 6 | `meta_state_resolve` | `meta-260610T0115Z-...` | Resolve with "Resolved:" narrative pointing at the change-log |
| 7 | `meta_state_patch` on `loop-design-meta-state-patch-wire-format-recursion` | `patch: { status: "inactive", shipped_in_plan: "plans/260610-meta-state-patch-wire-format-recursion/", shipped_at: "2026-06-10T...", addresses: [] }` (combined array + scalars) | **Option B per red-team amendment 5:** the recursive proof is earned by including `addresses: []` alongside the scalars. The empty array exercises the unwrap path (`{item: []}` is the natural edge case) without adding real new fields. The registry round-trip proves the fix works end-to-end. |

**Total registry mutations:** 8 (3 design/change-log + 1 evidence_code_ref fix + 1 lifecycle ack/refresh/resolve + 3 closeout). Note: Step 2.5 is a separate `meta_state_patch` call on the finding (not the change-log), distinct from Step 1's `meta_state_log_change`.

**Critical sequence** (per F11 from 260608-1015 plan): Steps 2.5 → 3 → 4 → 5 → 6 must happen in that order. Step 2.5 must precede Step 4 (so the fingerprint hashes the correct file). The `rule-no-orphaned-evidence` consult-gate will block Step 6 if Step 4 is missing or stale.

## Test Plan (TDD, 3 phases)

### Phase 1: Red (tests first)

**`tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`** (NEW, 4 tests; `.test.js` extension is required for `pnpm test` to pick it up — see red-team amendment 1):

1. **Combined patch with array + scalars round-trips a flat array (stdio transport)**
   - Setup: spawn MCP server via stdio, call `meta_state_report` to write a **loop-design** entry (per red-team amendment 7; findings don't have `addresses` in their schema, so coercion would skip the field)
   - Call: `meta_state_patch` with `patch: { addresses: ["a", "b", "c"], severity_hint: "low" }` (loop-design schema has `addresses: z.array(z.string()).default([])` and `severity_hint: z.string().optional()`)
   - Assert: registry shows `addresses: ["a", "b", "c"]` (flat array)
   - Assert: no `{item: ...}` wrapper
   - Assert: `gate.log` contains `item_wrap_unwrapped` entry with `field="addresses"`, `depth=2`

2. **Deeper nesting `{item:{item:[...]}}` unwraps correctly (unit test on `coerceParamsToSchema`)**
   - Setup: mock schema with `addresses: z.array(z.string())`
   - Call: `coerceParamsToSchema({ addresses: { item: { item: ["x", "y"] } } }, schema)`
   - Assert: returns `{ addresses: ["x", "y"] }`
   - Assert: helper unwrapped depth=2
   - Assert on value shape, not identity (per red-team medium #11: identity assertion is brittle)

3. **`meta_state_propose_design` with `proposed_design_for` + scalars (stdio transport)**
   - Setup: spawn MCP server via stdio
   - Call: `meta_state_propose_design` with `proposed_design_for=["x", "y"]`, `addresses=["z"]`, `title="test"`, `description="test"`, `affected_system="mcp-tools"`
   - Assert: registry shows `proposed_design_for: ["x", "y"]` (flat array)
   - Assert: no `{item: ...}` wrapper

3.5. **Pre-validation for Bridge 5 deferral shape (stdio transport)** (per red-team amendment 3):
   - Setup: spawn MCP server via stdio
   - Call: `meta_state_propose_design` with `proposed_design_for=[]` (empty array) and `addresses=[]` (empty array), `title="bridge-5-pre-validation"`, `description="..."`, `affected_system="mcp-tools"`
   - Assert: registry shows `proposed_design_for: []` and `addresses: []` (flat empty arrays)
   - Assert: no `{item: []}` wrapper
   - If the registry stores `{item: []}` for either, the hot fix is incomplete for empty arrays; surface a new finding, defer Bridge 5 to a follow-up plan, and Step 2 of § 5 falls back to `meta_state_log_change` instead of `propose_design`.

### Phase 2: Green (implementation)

1. Add `unwrapItemWrap(value, typeName)` helper in `tool-registry.js` (3-iter bound inlined per red-team amendment 2; no separate constant)
2. Wire `unwrapItemWrap` into `coerceParamsToSchema` (after existing `coerceValue` call; before the `ZodObject` recursion block)
3. No changes to `MAX_RECURSION_DEPTH` (stays at 2; depth bump dropped per red-team amendment 2)
4. Run new tests until all 4 pass

### Phase 3: Refactor + Closeout

1. Run full test suite (898 existing + 4 new = 902 tests) to confirm no regressions
2. Apply 8 registry mutations in sequence (see § 5 above; Steps 2.5 → 3 → 4 → 5 → 6 must be ordered)
3. Update `fix-loop-design-refs.test.js` if needed (mirrors precedent from 260609 plan; the test was updated to assert no-broken-refs)
4. Run `pnpm check` (validate records + extract index + tests)
5. Journal: `/ck:journal` to record session reflection

## Touchpoints Summary

| File | Action | Lines |
|------|--------|-------|
| `tools/learning-loop-mcp/tool-registry.js` | Add `unwrapItemWrap` helper + wire into `coerceParamsToSchema` (no constant changes; no `MAX_RECURSION_DEPTH` bump) | +25 |
| `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` | NEW (4 tests; `.test.js` extension) | ~200 |
| `meta-state.jsonl` | 1 change-log (with `supersedes` field) + 1 new loop-design + 1 evidence_code_ref patch + 1 ack + 1 refresh + 1 check_grounding + 1 resolve + 1 loop-design update (8 lines) | +8 |
| `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` | **UNCHANGED** (passthrough stays until Bridge 5) | 0 |
| `tools/learning-loop-mcp/core/gate-logic.js` | **UNCHANGED** (fix stays in registry layer) | 0 |

**Total new code:** ~225 lines (mostly tests). New core logic: ~25 lines (1 helper + 1 wire-in block, 3-iter bound inlined).

## Acceptance Criteria

- All 898 existing tests pass
- 4 new tests pass (3 stdio + 1 pre-validation, all via `.test.js` extension)
- Single combined `meta_state_patch` call with array + scalars stores a flat array (no `{item: ...}` wrap)
- `meta_state_propose_design` with `proposed_design_for` + scalars round-trips a flat array
- Pre-validation (Test 1.5): `propose_design` with empty arrays `proposed_design_for=[]` + `addresses=[]` stores flat empty arrays
- `item_wrap_unwrapped` audit log line visible in `gate.log` for the test cases
- Finding #509 (`meta-260610T0115Z-...`) `evidence_code_ref` updated from `meta-state-patch-tool.js#handler` → `tool-registry.js#coerceParamsToSchema` BEFORE the fingerprint refresh
- Finding #509 (`meta-260610T0115Z-...`) resolved with "Resolved:" narrative
- Loop-design #508 (`loop-design-meta-state-patch-wire-format-recursion`) status `active` → `inactive`, `shipped_in_plan` populated, **`addresses: []` round-trips flat in the closeout patch**
- New loop-design `loop-design-schema-source-of-truth` exists with status `active` and 200-char deferral paragraph (only if pre-validation passes; otherwise deferral is filed via `meta_state_log_change`)
- Change-log #510 (`meta-20260609185059Z-...`) formally superseded by the new Step 1 change-log via the `supersedes` field
- `pnpm check` passes (validate records + extract index + tests)
- **Zero changes to `meta-state-patch-tool.js`** (Bridge 5 reads `coerceParamsToSchema` later; the patch tool schema stays `passthrough` until then)
- `core/gate-logic.js` is **UNCHANGED** (fix stays in registry layer)
- `MAX_RECURSION_DEPTH` in `tool-registry.js` is **UNCHANGED** (stays at 2; depth bump dropped)
- Cold-session test (`rule-cold-session-test-must-pass-before-resolution`) passes after the change-log mutation (the cold-session test checks MCP tool availability, not registry content)

## Implementation Considerations & Risks

### Risk: Infinite recursion on self-referential passthrough schemas

`unwrapItemWrap` iterates `{item: X}` chains bounded to 3 iterations (inlined). `coerceParamsToSchema` recurses into `ZodObject` values bounded to depth 2 (unchanged). Both fail-safe to `return value` if the bound is hit.

**Mitigation:** both bounds are conservative; observed max is 2 in production for both mechanisms. The two bounds are orthogonal (unwrap is wire-format envelopes; recursion is nested ZodObject values) and are documented as such in the helper.

### Risk: Helper silently unwraps legitimate `{item: X}` value

`unwrapItemWrap(value, typeName)` is typeName-gated: only unwraps when `typeName === "ZodArray"` or `typeName === "ZodObject"`. A field declared as `z.string()` (or unwrapped as a primitive) is not affected.

**Mitigation:** the helper signature is `unwrapItemWrap(value, typeName)`, NOT `unwrapItemWrap(value)`. The typeName parameter is the gate.

### Risk: Test passes in-process but fails over stdio

The bug reproduces only via stdio transport. The current `wire-format-coercion-fix.test.js` uses in-process calls.

**Mitigation:** the 4 new tests use stdio transport (mirror the cold-session test pattern). Test 2 (deeper nesting) is a pure unit test on `coerceParamsToSchema` because the helper is a pure function.

### Risk: F11 lesson — fingerprint refresh before resolve

The `rule-no-orphaned-evidence` consult-gate blocks `meta_state_resolve` if any active finding with `mechanism_check: true` has a stale `code_fingerprint`. The fix code path touches `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema`, but finding #509's `evidence_code_ref` currently points to `tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler` (stale; the fix is not in that file).

**Mitigation:** Phase 3 Step 2.5 patches finding #509's `evidence_code_ref` to the fix site BEFORE Step 4 refreshes the fingerprint. Sequence: Step 2.5 (evidence_code_ref patch) → Step 3 (ack) → Step 4 (refresh_fingerprint) → Step 5 (check_grounding) → Step 6 (resolve).

### Risk: `meta_state_propose_design` has the same bug

The same root cause will hit `meta_state_propose_design` with combined `proposed_design_for` + scalars. Tests 3 and 1.5 cover this.

**Mitigation:** the fix is in `coerceParamsToSchema` (the registry layer), so it benefits all tools that use the wire-format coercion. Test 3 verifies with non-empty arrays; Test 1.5 verifies with empty arrays (the edge case the original plan missed).

### Risk (NEW per red-team amendment 6): wrong file hashed by fingerprint

Without Step 2.5 (the `evidence_code_ref` patch), Step 4's `meta_state_refresh_fingerprint` will hash `meta-state-patch-tool.js#handler` (the file currently in `evidence_code_ref`), not `tool-registry.js#coerceParamsToSchema` (the actual fix site). `meta_state_check_grounding` will return `drifted` against the wrong file, and the consult-gate will block the resolve.

**Mitigation:** Step 2.5 is mandatory; it precedes Step 4 in the sequence. If `evidence_code_ref` is not patchable (e.g., due to other gates), abort and surface the issue to the operator.

### Risk (NEW per red-team amendment 3): Bridge 5 deferral fails on empty arrays

Test 1.5 may fail: `propose_design` with `proposed_design_for: []` and `addresses: []` may still wrap as `{item: []}`. The hot fix's unwrap handles `{item: [a, b, c]}` but may not handle the empty-array edge case.

**Mitigation:** Test 1.5 pre-validates. If it fails, file a new finding (subtype: `wire-format-empty-array-edge-case`), defer Bridge 5 to a follow-up plan, and file the Bridge 5 deferral entry via `meta_state_log_change` (which doesn't have the `proposed_design_for` / `addresses` shape issue).

## Success Metrics

### Quantitative

- 898 existing tests still pass
- 4 new tests pass (3 stdio + 1 pre-validation)
- 1 helper added (unwrapItemWrap; 3-iter bound inlined)
- 0 constant changes (per red-team amendment 2)
- 8 registry mutations applied (1 supersedes change-log + 1 new loop-design + 1 evidence_code_ref patch + 1 lifecycle ack/refresh/resolve + 1 closeout)
- `pnpm check` passes

### Qualitative

- The recursive gap (plan 260609-adopt-instruction-layer closeout required an operator-approved `node -e` escape hatch to unwrap the corrupted value) is closed
- The fix lives in 1 file (`tool-registry.js`), so Bridge 5 can read it and delete the unwrap branch in 1 file edit
- Future agent reading the fix in 6 months sees intent in 1 place (the helper + the wire-in line), understands it's a wire-format-specific helper, and knows to delete it on Bridge 5 day
- The Bridge 5 deferral is a discoverable registry entry (not a journal note), so future agents see it via `meta_state_list({ entry_kind: "loop-design" })`

## Out of Scope (Deferred)

- **Bridge 5 (schema as source of truth):** deferred to `loop-design-schema-source-of-truth`. Multi-week scope. 4 hand-maintained field catalogues per record type, 11 drift cells. Bridge 5 will read `coerceParamsToSchema`, delete the unwrap branch, and replace `passthrough` with schema-derived schemas.
- **`meta_state_propose_design` update mode:** separate scope, separate plan (per precedent 260608-1015).
- **`meta_state_archive` / `meta_state_undo_resolve`:** full CRUD coverage, separate scope.
- **TTL redesign:** `meta-260608T0847Z-...` is a separate finding, separate plan.
- **Auth/role system for `meta_state_patch`:** currently any agent can patch any entry; operator-role check is a future plan.
- **Any change to `meta-state-patch-tool.js`:** the patch tool schema stays `passthrough` until Bridge 5. Adding ZodArray fields now would be doing Bridge 5 in miniature.

## Next Steps

1. **Approval:** user approved this design (2026-06-10)
2. **Handoff to plan:** invoke `/ck:plan --tdd` with this report as context (path: `plans/reports/brainstorm-260610-meta-state-patch-wire-format-recursion.md`)
3. **Plan output:** `plan.md` with 3 phases (Red/Green/Refactor+Closeout), 4 tests, 1 helper, 0 constant changes
4. **Implementation:** follows the TDD pattern from `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md`
5. **Closeout:** 8 registry mutations in sequence (per F11 from 260608-1015 plan; Step 2.5 `evidence_code_ref` patch must precede Step 4 fingerprint refresh)
6. **Validation:** `pnpm check` + cold-session test
7. **Journal:** `/ck:journal` to record session reflection

## Open Questions

None at design time. All decisions were resolved in the discovery Q&A and the multi-persona predict.
