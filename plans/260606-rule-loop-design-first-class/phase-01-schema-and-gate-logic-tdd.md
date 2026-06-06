---
phase: 1
title: "Schema: 2 new branch schemas + union extension + narrowed promoted_to_rule + gate-logic rewrite (TDD)"
status: pending
priority: P1
effort: "3h"
dependencies: [0]
---

# Phase 1: Schema and gate-logic rewrite (TDD)

## Overview

The 4-kind union is the structural foundation: extend `metaStateEntrySchema` from 2 to 4 members, narrow `promoted_to_rule` on findings from `z.object({...})` to `z.string()`, and rewrite `loadPromotedRules` to read the new `entry_kind: "rule"` entries. TDD discipline: write the 5-7 new schema tests FIRST (red), add the 2 branch schemas + union extension (green), then update `loadPromotedRules` and `meta-state-promote-rule-tool.js` to read/write the new shape. The 4 existing test files (`gate-promoted-rules.test.js`, `gate-scope-predicate.test.js`, `gate-resolution-evidence.test.js`, `integration-promoted-rule.test.js`) all pass with no assertion changes — same enforcement, same `checkResolutionEvidence` behavior. The 1 new rule entries land in Phase 2 (migration), not Phase 1.

## Requirements

### Functional

**Schema additions in `tools/learning-loop-mcp/core/meta-state.js`:**

1. **New `metaStateRuleEntrySchema`** — exact shape from plan.md Locked #2:
   - `entry_kind: z.literal("rule").default("rule")` (discriminator)
   - `id: z.string().regex(/^rule-[a-z0-9-]+$/)` (stable id, not timestamp-based — different from the timestamp-based `meta-YYMMDDTHHmmZ-` format used by findings/change-logs; rationale: a rule is more stable than a report; the rule_id IS the id, mirroring `rule-no-new-artifact-types`, `rule-cold-session-test-...` naming convention)
   - `origin: z.string()` (finding id that originated this rule; preserves historical lineage per Locked #5)
   - `enforcement: z.enum(["gate", "agent"])` (where the rule is enforced; "tool" removed from the existing `meta_state_promote_rule` tool's enum per Locked #1 — the canonical 2 enums are `gate` and `agent`)
   - `pattern_type: z.enum(["regex", "glob", "resolution-evidence-required"])` (the 3 pattern types that exist today; the schema is not extensible without a schema change, mirroring the existing tool's enum)
   - `pattern: z.string()` (the pattern — regex body, glob path, or session_id for `resolution-evidence-required`)
   - `scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional()` (optional scope filter)
   - `applies_to_resolution: z.string().optional()` (for `pattern_type=resolution-evidence-required`: the target finding id)
   - `supersedes: z.string().optional()` (prior rule id this rule refined)
   - `description: z.string().min(20)` (human-readable; min 20 chars to match finding/change-log schemas)
   - `status: z.enum(["active", "inactive"]).default("active")` (binary per Locked #3)
   - `promoted_at: z.string()` (ISO timestamp; when the rule was promoted)
   - `promoted_by: z.string()` (operator id; "operator" string per existing convention)
   - `evidence_code_ref: z.string().optional()` (SP2 grounding support)
   - `code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()` (SP2 fingerprint)
   - `refined_at: z.string().optional()` (ISO timestamp of last refinement)
   - `refined_by: z.string().optional()` (operator id of last refinement)
   - `refinement_reason: z.string().optional()` (why the rule was last refined)

2. **New `metaStateLoopDesignSchema`** — exact shape from plan.md Locked #3:
   - `entry_kind: z.literal("loop-design").default("loop-design")` (discriminator)
   - `id: z.string()` (standard timestamp-based `meta-YYMMDDTHHmmZ-slug` id, NOT the rule-style stable id — rationale: a loop-design is closer to a finding/report than to a rule; it has a creation event and a ship event, not a stable name)
   - `title: z.string().min(10)` (short human-readable title; min 10 chars)
   - `status: z.enum(["active", "inactive"]).default("active")` (binary per Locked #3; flips inactive when shipped)
   - `proposed_design_for: z.array(z.string())` (forward: ids of rules/schemas/tools this design will create/modify; non-empty array)
   - `addresses: z.array(z.string())` (backward: ids of findings this design responds to; the 3-edge graph `finding → loop-design → rule` per Locked #4)
   - `description: z.string().min(20)` (human-readable)
   - `affected_system: z.enum([...existing enum...])` (reuse the existing `affected_system` enum from `metaStateFindingEntrySchema`: `gate-logic | record-validation | index-extractor | mcp-tools | workflow-registry | vnstock_vendor`; this is a "loop-internal" design but the affected_system is the subsystem it touches, mirroring the finding convention)
   - `severity_hint: z.enum(["low", "medium", "high"]).optional()` (operator's read on the urgency)
   - `created_at: z.string()` (ISO timestamp)
   - `created_by: z.string()` (operator id)
   - `shipped_in_plan: z.string().optional()` (plan path; set when status flips inactive)
   - `shipped_at: z.string().optional()` (ISO timestamp of the ship event)

3. **`metaStateEntrySchema` union extension:**
   ```js
   export const metaStateEntrySchema = z.union([
     metaStateFindingEntrySchema,    // existing (unchanged shape, EXCEPT promoted_to_rule narrows)
     metaStateChangeEntrySchema,     // existing (unchanged shape)
     metaStateRuleEntrySchema,       // NEW
     metaStateLoopDesignSchema,      // NEW
   ]);
   ```

4. **`promoted_to_rule` narrows on `metaStateFindingEntrySchema`:**
   - Before: `z.object({ rule_id, enforcement, pattern_type, pattern, scope_predicate?, ...promoted_at, promoted_by })` (with optional fields and rich payload)
   - After: `z.string().describe("Rule id this finding was promoted to. The rule's own entry (entry_kind: 'rule') is the canonical source of enforcement data; the finding's id is the rule's origin (preserved as rule.origin).")`
   - Migration impact: 4 existing findings with object `promoted_to_rule` payloads must be mutated in Phase 2 BEFORE the schema is tightened. Phase 1 ships the narrowing + the union extension in one commit; Phase 2 ships the data migration. Until Phase 2 lands, `metaStateEntrySchema.parse()` will reject the 4 existing findings. Mitigation: Phase 1 wraps the narrowing in a feature flag or documents the breakage window. The plan is to do both in the same release, since the operator decided clean break, no backward-compat layer.

   - **CRITICAL ADDITION: Finding status enum fix.** The existing `metaStateFindingEntrySchema` defines `status: z.enum(["reported", "superseded"]).optional()` — but the actual registry contains findings with `status: "resolved"` (3 source findings), `status: "active"` (1 source finding, `meta-260606T1656Z`), and `status: "expired"` (2 prior findings). The schema is out of sync with the data. Phase 1 MUST add `"active"`, `"resolved"`, and `"expired"` to the finding status enum before any validation against `metaStateEntrySchema` can pass. This is a schema drift fix, not a new feature — the data already uses these values.

5. **`loadPromotedRules` rewrite in `tools/learning-loop-mcp/core/gate-logic.js` lines 566-610:**
   - Before: filters findings by `e.promoted_to_rule?.enforcement === "gate"` and `e.status in [active, resolved]`. Returns findings with the `promoted_to_rule` object attached.
   - After: filters rule entries by `e.entry_kind === "rule"` and `e.status === "active"`. Returns rule entries. The shape returned is the rule entry itself (not a finding with a nested payload).
   - The cache key is unchanged (`(mtime, size)` tuple). The cache value is now an array of rule entries instead of an array of finding entries. Cache invalidation triggers on the same mtime/size change.
   - The scope_predicate filter (lines ~600-608) is preserved: rules with `scope_predicate !== "none"` and `!== "project_has_learning_loop_mcp"` are filtered to where the predicate matches.

6. **`meta-state-promote-rule-tool.js` rewrite in `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js`:**
   - Before: mutates a finding to add `promoted_to_rule` payload (calls `updateEntry` with a patch)
   - After: writes a new `entry_kind: "rule"` entry (calls `writeEntry` with a new rule entry). The source finding's `promoted_to_rule` is updated to be the new rule's id string (cross-reference; mirrors the rule's `origin` pointing back to the finding).
   - The `enforcement` enum drops `"tool"` (Locked #1: canonical 2 enums are `gate` and `agent`).
   - The `pattern_type` enum gains `"resolution-evidence-required"` (currently not in the tool's enum but present in `loadPromotedRules` and `applyPromotedRules`; the tool's enum is out of sync today — this is a small but real fix).
   - The `preview` mode is preserved (test the pattern against sample commands/paths without activating).

### Non-functional
- All 4 existing test files (`gate-promoted-rules.test.js`, `gate-scope-predicate.test.js`, `gate-resolution-evidence.test.js`, `integration-promoted-rule.test.js`) pass with **zero assertion changes** (the public API of `loadPromotedRules` and `applyPromotedRules` is preserved: callers receive a list of rule-shaped objects, the call sites `rule.promoted_to_rule` still work because the rule entry has the same field structure as a finding's `promoted_to_rule` payload by design).
- Backward-compat for the in-flight `meta-260606T0443Z-...` rule: `loadPromotedRules` must continue to return the cold-session-test rule (it has `entry_kind: "finding"` and `promoted_to_rule: { pattern_type: "resolution-evidence-required", ... }` today; after Phase 1, it will be migrated to `entry_kind: "rule"` in Phase 2 — Phase 1's gate-logic rewrite must NOT break this rule between phases). Mitigation: Phase 1 ships a transitional `loadPromotedRules` that accepts BOTH `entry_kind === "rule"` AND `(entry_kind === "finding" && promoted_to_rule && category === "loop-anti-pattern")` for the duration of the Phase 1 → Phase 2 window. The transitional state is documented in the change-log (Phase 0 already shipped it).
- The new schemas are exported from `core/meta-state.js` so Phase 2's migration script can import them for roundtrip validation.

## Architecture

```
            ┌──────────────────────────────────────────────────────────────┐
            │ Phase 1 deliverable                                         │
            └────────────────────────┬─────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
  ┌───────────────┐          ┌───────────────────┐        ┌────────────────────┐
  │ Schema layer  │          │ Gate-logic layer  │        │ Tool layer         │
  │ (TDD first)   │          │ (transitional)    │        │ (TDD first)        │
  └───────┬───────┘          └─────────┬─────────┘        └─────────┬──────────┘
          │                            │                            │
          ▼                            ▼                            ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Schema layer (core/meta-state.js):                                   │
  │  • 2 new branch schemas (metaStateRuleEntrySchema,                   │
  │    metaStateLoopDesignSchema) — 5-7 roundtrip tests                  │
  │  • metaStateEntrySchema union: 2 → 4 members                         │
  │  • promoted_to_rule narrows: z.object → z.string                     │
  └──────────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Gate-logic layer (core/gate-logic.js#loadPromotedRules):             │
  │  • Transitional filter: BOTH entry_kind="rule" AND                   │
  │    (entry_kind="finding" AND promoted_to_rule AND category=loop-anti)│
  │  • Returns rule-shaped objects (rule entry OR finding with           │
  │    promoted_to_rule payload — same shape downstream)                 │
  │  • applyPromotedRules unchanged (consumes the same shape)            │
  └──────────────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Tool layer (tools/meta-state-promote-rule-tool.js):                  │
  │  • Writes entry_kind="rule" entries (not mutated findings)           │
  │  • enforcement enum drops "tool"                                     │
  │  • pattern_type enum gains "resolution-evidence-required"            │
  │  • 2-3 new tool tests                                                │
  └──────────────────────────────────────────────────────────────────────┘
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/meta-state.js` — add 2 branch schemas, extend union, narrow `promoted_to_rule`, export new schemas
- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js` — rewrite `loadPromotedRules` filter (transitional); preserve `applyPromotedRules` body
- **Modify:** `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — write `entry_kind: "rule"` entries; update enums
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-rule-schema.test.js` (5-7 tests)
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-loop-design-schema.test.js` (3-4 tests)
- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-promote-rule-rule-entry.test.js` (2-3 tests)
- **Read-only:** `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` (no changes; existing assertions still pass)
- **Read-only:** `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js` (no changes)
- **Read-only:** `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` (no changes)
- **Read-only:** `tools/learning-loop-mcp/__tests__/integration-promoted-rule.test.js` (no changes)
- **Read-only:** `tools/learning-loop-mcp/core/loop-introspect.js#listPromotedRules` (Phase 4 surfaces the new shape; Phase 1 does NOT change introspect)

## Implementation Steps

### Step 1: Write the 5-7 new schema tests (TDD red)

Create `tools/learning-loop-mcp/__tests__/meta-state-rule-schema.test.js`. Test fixture uses a temporary directory (`mkdtempSync`) with a fresh `meta-state.jsonl` (the tests are pure-schema tests; they don't touch the real registry).

```js
// meta-state-rule-schema.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateRuleEntrySchema,
  metaStateEntrySchema,
} from "#mcp/core/meta-state.js";

test("metaStateRuleEntrySchema accepts minimal valid rule entry", () => {
  const rule = {
    id: "rule-no-new-artifact-types",
    origin: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
    description: "Gate-enforced rule: blocks attempts to create new schema/artifact/directory/convention types without explicit operator approval. The rule's pattern was refined 2026-06-06 to require a context qualifier (article + trigger noun) after the create/propose/design verb.",
    status: "active",
    promoted_at: "2026-06-01T22:00:13.387Z",
    promoted_by: "operator",
  };
  const result = metaStateRuleEntrySchema.safeParse(rule);
  assert.equal(result.success, true, JSON.stringify(result.error?.format()));
});

test("metaStateRuleEntrySchema rejects non-rule entry_kind", () => {
  const bad = { ...validRule, entry_kind: "finding" };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateRuleEntrySchema rejects unstable id (must match rule-<slug>)", () => {
  const bad = { ...validRule, id: "meta-260606T1234Z-not-a-rule" };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateRuleEntrySchema rejects description shorter than 20 chars", () => {
  const bad = { ...validRule, description: "too short" };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateRuleEntrySchema accepts optional fields (scope_predicate, evidence_code_ref, code_fingerprint, refined_at, refined_by, refinement_reason, supersedes, applies_to_resolution)", () => {
  const rule = {
    ...validRule,
    scope_predicate: "project_has_learning_loop_mcp",
    evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules",
    code_fingerprint: "sha256:" + "a".repeat(64),
    refined_at: "2026-06-05T19:25:15.567Z",
    refined_by: "operator",
    refinement_reason: "G8 subcommand-class false positive (7 recurrences 2026-06-02..2026-06-06): bare 'create' matched CLI subcommand names like 'ck plan create' and 'record_create_*'. Refined pattern requires a context qualifier (optional article + trigger noun) after create/propose/design.",
  };
  assert.equal(metaStateRuleEntrySchema.safeParse(rule).success, true);
});

test("metaStateRuleEntrySchema rejects invalid code_fingerprint format", () => {
  const bad = { ...validRule, code_fingerprint: "md5:" + "a".repeat(32) };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateEntrySchema union accepts rule entry via discriminator", () => {
  // The discriminated union should accept a rule entry; verify by parsing
  // a valid rule and checking the entry_kind is preserved.
  const parsed = metaStateEntrySchema.parse(validRule);
  assert.equal(parsed.entry_kind, "rule");
});

// CRITICAL: The finding status enum must include "active", "resolved", "expired"
// because the registry already contains findings with these statuses.
// Without this, metaStateEntrySchema.parse() will reject existing entries.
test("finding status enum accepts 'resolved' and 'active' (registry compatibility)", () => {
  const finding = {
    id: "meta-260601T1353Z-test",
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Test finding that is resolved (already in registry)",
    status: "resolved",
    created_at: "2026-06-01T00:00:00Z",
  };
  const parsed = metaStateEntrySchema.parse(finding);
  assert.equal(parsed.status, "resolved");
});
```

Create `tools/learning-loop-mcp/__tests__/meta-state-loop-design-schema.test.js`:

```js
test("metaStateLoopDesignSchema accepts minimal valid loop-design entry", () => {
  const design = {
    id: "meta-260606T1531Z-cold-session-test-rule-deferred",
    title: "Cold-session test rule — deferred design",
    status: "active",
    proposed_design_for: ["rule-cold-session-test-must-pass-before-resolution"],
    addresses: ["meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list"],
    description: "Design note for the cold-session test rule: promote cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools as a gate-enforced rule that gates the resolution of meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list. The rule fires when meta_state_resolve is called on the target finding; the check is that the cold-session test's last evidence shows the gap is closed. Deferred 2026-06-06 per operator decision.",
    affected_system: "mcp-tools",
    created_at: "2026-06-06T08:31:52.110Z",
    created_by: "operator",
  };
  assert.equal(metaStateLoopDesignSchema.safeParse(design).success, true);
});

test("metaStateLoopDesignSchema rejects empty proposed_design_for", () => {
  const bad = { ...validDesign, proposed_design_for: [] };
  assert.equal(metaStateLoopDesignSchema.safeParse(bad).success, false);
});

test("metaStateLoopDesignSchema accepts inactive status with shipped_in_plan + shipped_at", () => {
  const design = {
    ...validDesign,
    status: "inactive",
    shipped_in_plan: "plans/260606-rule-loop-design-first-class/",
    shipped_at: "2026-06-06T20:00:00.000Z",
  };
  assert.equal(metaStateLoopDesignSchema.safeParse(design).success, true);
});

test("metaStateEntrySchema union accepts loop-design entry via discriminator", () => {
  const parsed = metaStateEntrySchema.parse(validDesign);
  assert.equal(parsed.entry_kind, "loop-design");
});
```

Run the tests to confirm RED: all 11 tests fail (the schemas don't exist yet).

### Step 2: Add the 2 new branch schemas (TDD green, part 1)

Edit `tools/learning-loop-mcp/core/meta-state.js`. Add the 2 schemas after `metaStateChangeEntrySchema` (line ~106):

```js
/**
 * Rule branch schema — promoted gate/agent rules with their own lifecycle.
 * Has .shape available for tool schema reuse.
 */
export const metaStateRuleEntrySchema = z.object({
  entry_kind: z.literal("rule").default("rule"),
  id: z.string().regex(/^rule-[a-z0-9-]+$/).describe("Stable rule id; not timestamp-based"),
  origin: z.string().describe("Finding id that originated this rule (preserves historical lineage)"),
  enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced"),
  pattern_type: z.enum(["regex", "glob", "resolution-evidence-required"]).describe("Pattern language"),
  pattern: z.string().describe("The pattern (regex body, glob path, or session_id)"),
  scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional()
    .describe("Optional scope filter: 'none' (default) or 'project_has_learning_loop_mcp'"),
  applies_to_resolution: z.string().optional()
    .describe("For pattern_type=resolution-evidence-required: the target finding id this rule gates"),
  supersedes: z.string().optional()
    .describe("Prior rule id this rule refined (replaces finding.promoted_to_rule.refined_at metadata)"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  status: z.enum(["active", "inactive"]).default("active")
    .describe("Binary per operator decision 2026-06-06. Refined/deprecated rules become inactive and use 'supersedes' to point to the new rule."),
  promoted_at: z.string().describe("ISO timestamp"),
  promoted_by: z.string().describe("Operator id"),
  evidence_code_ref: z.string().optional()
    .describe("Code reference; SP2 grounding still applies"),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("SHA-256 of evidence_code_ref; populated by SP2 check_grounding"),
  refined_at: z.string().optional().describe("ISO timestamp of last refinement"),
  refined_by: z.string().optional().describe("Operator id of last refinement"),
  refinement_reason: z.string().optional().describe("Why the rule was last refined"),
});

/**
 * Loop-design branch schema — deferred design notes with their own lifecycle.
 * Has .shape available for tool schema reuse.
 */
export const metaStateLoopDesignSchema = z.object({
  entry_kind: z.literal("loop-design").default("loop-design"),
  id: z.string().describe("Standard meta-state id (meta-YYMMDDTHHmmZ-slug)"),
  title: z.string().min(10).describe("Short human-readable title"),
  status: z.enum(["active", "inactive"]).default("active")
    .describe("Binary. Flips to inactive when the proposed work ships."),
  proposed_design_for: z.array(z.string()).min(1)
    .describe("Forward: ids of rules/schemas/tools this design will create or modify"),
  addresses: z.array(z.string())
    .describe("Backward: ids of findings this design responds to (the motivation; the why-this-exists)"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  affected_system: z.enum([
    "gate-logic", "record-validation", "index-extractor",
    "mcp-tools", "workflow-registry", "vnstock_vendor",
  ]).describe("Which system this design affects"),
  severity_hint: z.enum(["low", "medium", "high"]).optional()
    .describe("Operator's read on the urgency of shipping this design"),
  created_at: z.string().describe("ISO timestamp"),
  created_by: z.string().describe("Operator id"),
  shipped_in_plan: z.string().optional()
    .describe("Plan id (plans/YYMMDD-slug/) that shipped this design; set when status flips to inactive"),
  shipped_at: z.string().optional()
    .describe("ISO timestamp of the ship event"),
});
```

### Step 3: Extend the union and narrow promoted_to_rule (TDD green, part 2)

```js
export const metaStateEntrySchema = z.union([
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateRuleEntrySchema,       // NEW
  metaStateLoopDesignSchema,      // NEW
]);
```

For the `promoted_to_rule` narrowing, find the existing field on `metaStateFindingEntrySchema` and replace it. The current shape (line ~36 of `core/meta-state.js`) does NOT include `promoted_to_rule` explicitly (the field is added by the `meta_state_promote_rule` tool's patch, not by the schema). Therefore, the narrowing is: add a comment to the finding schema noting that `promoted_to_rule` is `z.string()` (the rule id) post-Phase-1, and add an optional field declaration for it so the schema can validate migrated entries:

```js
promoted_to_rule: z.string().optional()
  .describe("Rule id this finding was promoted to. The rule's own entry (entry_kind: 'rule') is the canonical source of enforcement data; the finding's id is the rule's origin (preserved as rule.origin)."),
```

This is **additive** (the field was untyped before, accepting whatever the tool wrote; now it's strictly a string). Phase 2's migration mutates the 4 existing object-payload findings to be string ids; until Phase 2 lands, the schema accepts the legacy object payloads (z.string().optional() returns success for any object too — zod is permissive here).

Wait, this is wrong: `z.string().optional()` rejects non-string values. Need to be more careful. The narrowing must accept BOTH string and legacy object during the Phase 1 → Phase 2 window, then Phase 2 makes the mutation and Phase 1 (or a follow-up) tightens to string-only. The cleanest approach:

```js
promoted_to_rule: z.union([z.string(), z.object({}).passthrough()]).optional()
  .describe("Rule id (post-Phase-2 migration) OR legacy object payload (Phase 1 transitional)."),
```

This is ugly. Alternative: Phase 1 does NOT add `promoted_to_rule` to the schema at all (keep it as an untyped field), and Phase 2 mutates the data + a follow-up Phase 1.5 tightens the schema. This is the cleaner path. Decision: **Phase 1 does NOT add `promoted_to_rule` to `metaStateFindingEntrySchema`**. The field stays untyped (the schema doesn't reject unknown fields; zod's default is to strip or pass-through). The 4 existing object payloads continue to parse. Phase 2 mutates the data. A follow-up `__tests__/meta-state-finding-schema-narrowed.test.js` (added in Phase 2) verifies the narrowing AFTER the migration.

The test for the narrowing becomes a Phase 2 deliverable, not a Phase 1 deliverable. The Phase 1 plan simplifies to: extend the union, add 2 branch schemas, rewrite `loadPromotedRules` and `meta-state-promote-rule-tool.js`. The narrowing is data-driven (Phase 2 mutates) and schema-enforced (a future Phase 6 follow-up adds the narrowed field).

Update: this aligns with Locked #7 "no backward-compat layer" — Phase 2 ships the data migration in the same release as Phase 1's schema extension. The test for the narrowing is a Phase 2 test, not a Phase 1 test.

### Step 4: Rewrite `loadPromotedRules` (TDD green, part 3)

Edit `tools/learning-loop-mcp/core/gate-logic.js` lines 566-610. The transitional filter:

```js
export function loadPromotedRules(root) {
  const path = join(root, "meta-state.jsonl");
  if (!existsSync(path)) return [];

  const stats = statSync(path);
  const mtime = stats.mtime.getTime();
  const size = stats.size;

  const cached = promotedRulesCache.get(root);
  if (cached && cached.mtime === mtime && cached.size === size) {
    return cached.rules;
  }

  let entries = [];
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    entries = lines.map((line) => JSON.parse(line));
  } catch {
    return [];
  }

  // Phase 1 transitional filter: BOTH entry_kind="rule" AND
  // (entry_kind="finding" AND promoted_to_rule AND category="loop-anti-pattern")
  // are accepted. Phase 2's migration moves all promoted_to_rule findings
  // into entry_kind="rule" entries; the legacy branch is removed in a
  // follow-up commit after the migration is verified.
  let rules = entries.filter((e) => {
    if (e.entry_kind === "rule" && e.status === "active") return true;
    if (
      e.entry_kind === "finding" &&
      (e.status === "active" || e.status === "resolved") &&
      e.category === "loop-anti-pattern" &&
      e.promoted_to_rule?.enforcement === "gate"
    ) return true;
    return false;
  });

  rules = rules.filter((r) => {
    const predicate = r.promoted_to_rule?.scope_predicate ?? r.scope_predicate;
    if (!predicate || predicate === "none") return true;
    if (predicate === "project_has_learning_loop_mcp") {
      return projectHasLearningLoopMcp(root);
    }
    console.warn(`Rule ${r.promoted_to_rule?.rule_id ?? r.id}: unknown scope_predicate "${predicate}"`);
    return true;
  });

  promotedRulesCache.set(root, { rules, mtime, size });
  return rules;
}
```

The shape returned is mixed: a rule entry has fields at the top level (`r.id`, `r.enforcement`); a legacy finding has the same fields nested under `r.promoted_to_rule`. Downstream callers (`applyPromotedRules`, `checkResolutionEvidence`, `listPromotedRules`) read `r.promoted_to_rule?.pattern_type` etc. — for rule entries, this returns `undefined`; the call sites must be updated to read top-level fields for rule entries. This is a breaking change in the call sites.

Cleanest path: normalize the shape in `loadPromotedRules`. For rule entries, synthesize a `promoted_to_rule` field at the top level by copying the top-level fields. This preserves the downstream call sites:

```js
rules = rules.map((r) => {
  if (r.entry_kind === "rule") {
    return {
      ...r,
      promoted_to_rule: {
        rule_id: r.id,
        enforcement: r.enforcement,
        pattern_type: r.pattern_type,
        pattern: r.pattern,
        scope_predicate: r.scope_predicate,
        applies_to_resolution: r.applies_to_resolution,
      },
    };
  }
  return r;
});
```

This is a synthesis layer; the synthesized `promoted_to_rule` matches the legacy shape exactly. Downstream call sites (`applyPromotedRules`, `checkResolutionEvidence`, `listPromotedRules`) continue to work without changes. Phase 2 removes the synthesis layer when all data is migrated.

### Step 5: Update `meta-state-promote-rule-tool.js` to write rule entries

Edit `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` lines 152-200. The activation mode block:

```js
// (preview block above unchanged)

// Activation mode
// Phase 1: write a new entry_kind="rule" entry (not a mutated finding).
// The source finding's promoted_to_rule is updated to the new rule's id string.

const { isSafeRegexPattern, isGlobScopeWhitelisted } = await import("#mcp/core/gate-logic.js");

if (pattern_type === "regex") {
  if (!isSafeRegexPattern(pattern)) {
    return /* pattern_rejected_by_safety_check */;
  }
}
if (pattern_type === "glob" && !isGlobScopeWhitelisted(pattern)) {
  return /* pattern_rejected_by_scope_whitelist */;
}

// Rule ID uniqueness check (RT Finding 10)
const alreadyActive = entries.find(
  (e) =>
    (e.entry_kind === "rule" && e.id === rule_id && e.status === "active") ||
    (e.entry_kind === "finding" &&
     e.status === "active" &&
     e.promoted_to_rule?.rule_id === rule_id)
);
if (alreadyActive) {
  return /* rule_id_already_active */;
}

const now = new Date().toISOString();
const ruleEntry = {
  id: rule_id,  // rule_id IS the id; stable, not timestamp-based
  entry_kind: "rule",
  origin: id,   // the source finding's id
  enforcement,
  pattern_type,
  pattern,
  ...(scope_predicate && scope_predicate !== "none" && { scope_predicate }),
  ...(pattern_type === "resolution-evidence-required" && { applies_to_resolution: pattern }),
  description: `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.`,
  status: "active",
  promoted_at: now,
  promoted_by: "operator",
};

await writeEntry(root, ruleEntry);

// Update the source finding's promoted_to_rule to be the rule's id string.
await updateEntry(root, id, { promoted_to_rule: rule_id });

return {
  content: [{ type: "text", text: JSON.stringify({
    promoted: true,
    rule_id,
    rule_entry_id: rule_id,
    source_finding_id: id,
    enforcement,
    pattern_type,
    pattern,
  }) }],
};
```

The tool's `enforcement` enum drops `"tool"` (Locked #1). The `pattern_type` enum gains `"resolution-evidence-required"`.

### Step 6: Add the 2-3 new tool tests (TDD red then green)

Create `tools/learning-loop-mcp/__tests__/meta-state-promote-rule-rule-entry.test.js`:

```js
test("meta_state_promote_rule writes entry_kind=rule entry (not mutated finding)", async () => {
  // Setup: mkdtempSync with a registry containing a finding
  // Act: call the tool's handler with preview=false
  // Assert: registry now has the rule entry; finding's promoted_to_rule is a string id
});

test("meta_state_promote_rule rejects 'tool' enforcement enum (per Locked #1)", async () => {
  // Assert: zod validation rejects pattern_type=tool at the tool's schema layer
});

test("meta_state_promote_rule accepts pattern_type=resolution-evidence-required", async () => {
  // Act: call with pattern_type=resolution-evidence-required
  // Assert: rule entry is written with applies_to_resolution populated
});
```

### Step 7: Run the full test suite

```bash
cd tools/learning-loop-mcp && node --test __tests__/meta-state-rule-schema.test.js __tests__/meta-state-loop-design-schema.test.js __tests__/meta-state-promote-rule-rule-entry.test.js __tests__/gate-promoted-rules.test.js __tests__/gate-scope-predicate.test.js __tests__/gate-resolution-evidence.test.js __tests__/integration-promoted-rule.test.js
```

All 7 test files pass: 5-7 new schema tests + 3 new tool tests + the 4 existing test files (no assertion changes).

## Success Criteria

- [ ] `tools/learning-loop-mcp/core/meta-state.js` exports `metaStateRuleEntrySchema` and `metaStateLoopDesignSchema`; `metaStateEntrySchema` is a 4-member union
- [ ] `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` accepts BOTH `entry_kind: "rule"` entries AND legacy `entry_kind: "finding"` with `promoted_to_rule` (transitional filter; removes the legacy branch in a follow-up after Phase 2)
- [ ] `loadPromotedRules` synthesizes `promoted_to_rule` on rule entries (so downstream call sites work unchanged)
- [ ] `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` writes `entry_kind: "rule"` entries (not mutated findings); the source finding's `promoted_to_rule` is updated to the new rule's id string
- [ ] `enforcement` enum drops `"tool"` (Locked #1); `pattern_type` enum gains `"resolution-evidence-required"`
- [ ] 5-7 new tests in `__tests__/meta-state-rule-schema.test.js` (all pass)
- [ ] 3-4 new tests in `__tests__/meta-state-loop-design-schema.test.js` (all pass)
- [ ] 2-3 new tests in `__tests__/meta-state-promote-rule-rule-entry.test.js` (all pass)
- [ ] All 4 existing test files (`gate-promoted-rules.test.js`, `gate-scope-predicate.test.js`, `gate-resolution-evidence.test.js`, `integration-promoted-rule.test.js`) pass with **zero assertion changes** — same public API
- [ ] `__tests__/meta-state-schema.test.js` (existing) passes (no schema-shape regressions)
- [ ] Total: ~10-14 new tests + 0 existing-test regressions across 7 test files
- [ ] No direct writes to `meta-state.jsonl` from this phase (Phase 1 is pure schema/logic; Phase 2 ships the data migration)

## Risk Assessment

- **Risk 1:** The 4 existing findings with object `promoted_to_rule` payloads continue to parse, but if `meta_state_promote_rule` is called on one of them in the Phase 1 → Phase 2 window, the tool would try to update `promoted_to_rule` to a string but the existing object would be in the way. Mitigation: the tool's updateEntry patches the field, replacing the object with the string (zod's `Object.assign(entry, cleanPatch)` overwrites). Verified by the test in Step 6.
- **Risk 2:** The synthesis layer in `loadPromotedRules` (Step 4) is a "fake promoted_to_rule" — if a downstream caller mutates the returned object, the mutation propagates to the cache. Mitigation: the synthesis is read-only downstream (callers read `rule.promoted_to_rule?.pattern_type` etc., never write); the cache is the same shape as the synthesis. A defensive `Object.freeze` could be added but is not necessary given the read-only call pattern.
- **Risk 3:** The 4 existing test files must pass with zero changes. Mitigation: the synthesis layer (Step 4) preserves the legacy shape for findings; rule entries are mapped to the same shape. The 4 test files test `loadPromotedRules` and `applyPromotedRules` against the legacy shape, which is still produced for legacy findings.
- **Risk 4:** The tool's `enforcement: "tool"` removal could break a test that expects this enum value. Mitigation: the existing tool tests use `enforcement: "gate"` (per the test file grep); `enforcement: "tool"` is not tested. Verified by reading the existing test file before the change.
- **Risk 5:** `pattern_type: "resolution-evidence-required"` is added to the tool's enum but `meta_state_promote_rule` is not the canonical way to add such a rule (the sibling plan 260606-cold-session-test-rule-promotion adds the rule directly via `writeEntry`). Mitigation: the tool supports it for completeness; the test in Step 6 verifies the new pattern_type is accepted at the schema layer.
- **Risk 6:** The schema extension might break the existing `meta_state_report` tool (which uses `metaStateFindingEntrySchema.shape` to build its input schema). Mitigation: the existing schema is unchanged; the shape is the same; the new branch schemas are added alongside, not modifying the existing one. The tool continues to work.

## TDD Tests Added (this phase)

| Test File | Test Count | Asserts |
|-----------|------------|---------|
| `__tests__/meta-state-rule-schema.test.js` (new) | 5-7 | minimal valid rule; entry_kind rejection; id format; description min length; optional fields; code_fingerprint format; union discrimination |
| `__tests__/meta-state-loop-design-schema.test.js` (new) | 3-4 | minimal valid design; empty proposed_design_for rejection; inactive status with shipped_in_plan; union discrimination |
| `__tests__/meta-state-promote-rule-rule-entry.test.js` (new) | 2-3 | writes rule entry; rejects "tool" enforcement; accepts "resolution-evidence-required" pattern_type |
| `__tests__/gate-promoted-rules.test.js` (existing) | unchanged | regression: same public API |
| `__tests__/gate-scope-predicate.test.js` (existing) | unchanged | regression: scope filter preserved |
| `__tests__/gate-resolution-evidence.test.js` (existing) | unchanged | regression: cold-session test still works |
| `__tests__/integration-promoted-rule.test.js` (existing) | unchanged | regression: end-to-end rule lifecycle |

**Total: 10-14 new tests across 3 new files; 0 regressions in 4 existing files.**

## References

- `tools/learning-loop-mcp/core/meta-state.js` — the schema file; the 2 new branch schemas are added after `metaStateChangeEntrySchema`
- `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` lines 566-610 — the rewritten filter
- `tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules` lines 648-705 — unchanged (consumes the synthesized shape)
- `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` — unchanged
- `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` lines 152-200 — the activation block to rewrite
- `tools/learning-loop-mcp/tools/manifest.json` — the tool list (no change in Phase 1; the new `meta_state_propose_design` tool is added in Phase 3)
- `tools/learning-loop-mcp/core/loop-introspect.js#listPromotedRules` — unchanged in Phase 1 (Phase 4 updates the call site)
- Locked Decisions #1, #2, #3, #4, #5 in `plan.md` — union size, schema shapes, status enums, cross-refs, origin
