import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metaStateLoopDesignSchema,
  metaStateEntrySchema,
} from "../../core/meta-state.js";

const validDesign = {
  id: "loop-design-cross-reference-fields",
  title: "Cross-reference fields on rule and loop-design schemas",
  status: "active",
  proposed_design_for: ["metaStateRuleEntrySchema", "metaStateLoopDesignSchema"],
  addresses: ["meta-260606T1543Z-meta-state-cross-reference-field-design"],
  description: "Adds typed cross-reference fields (proposed_design_for, addresses, origin) to the new rule and loop-design schemas. This eliminates the need for a generic related_to field on findings.",
  affected_system: "mcp-tools",
  created_at: "2026-06-06T08:31:52.110Z",
  created_by: "operator",
};

test("metaStateLoopDesignSchema accepts minimal valid loop-design entry", () => {
  assert.equal(metaStateLoopDesignSchema.safeParse(validDesign).success, true);
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

test("metaStateLoopDesignSchema accepts empty addresses array", () => {
  const design = { ...validDesign, addresses: [] };
  assert.equal(metaStateLoopDesignSchema.safeParse(design).success, true);
});

test("metaStateLoopDesignSchema rejects description shorter than 20 chars", () => {
  const bad = { ...validDesign, description: "too short" };
  assert.equal(metaStateLoopDesignSchema.safeParse(bad).success, false);
});

test("metaStateLoopDesignSchema rejects title shorter than 10 chars", () => {
  const bad = { ...validDesign, title: "short" };
  assert.equal(metaStateLoopDesignSchema.safeParse(bad).success, false);
});

test("metaStateEntrySchema union accepts loop-design entry via discriminator", () => {
  const parsed = metaStateEntrySchema.parse(validDesign);
  assert.equal(parsed.entry_kind, "loop-design");
});
