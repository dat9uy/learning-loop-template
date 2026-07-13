import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod";
import { metaStateProposeDesignTool } from "../../tools/handlers/meta-state-propose-design-tool.js";
import { metaStateLoopDesignSchema } from "../../core/meta-state.js";

const MIGRATED_FIELDS = {
  title: true,
  description: true,
  proposed_design_for: true,
  addresses: true,
  affected_system: true,
  severity_hint: true,
};

describe("meta_state_propose_design codegen parity", () => {
  test("tool schema exposes exactly the same keys as derived pick + merge projection", () => {
    const derivedSchema = metaStateLoopDesignSchema
      .pick(MIGRATED_FIELDS)
      .merge(z.object({
        loop_design_id: z.string().optional(),
      }));
    const derivedKeys = Object.keys(derivedSchema.shape).sort();
    const toolKeys = Object.keys(metaStateProposeDesignTool.schema).sort();

    assert.deepEqual(toolKeys, derivedKeys, "tool schema keys differ from derived schema keys");
  });

  test("tool schema preserves the tool-level loop_design_id parameter", () => {
    const toolSchema = z.object(metaStateProposeDesignTool.schema);
    const withExplicitId = toolSchema.safeParse({
      title: "A test design title",
      description: "A test design description that is long enough.",
      proposed_design_for: ["rule-a"],
      addresses: [],
      affected_system: "mcp-tools",
      loop_design_id: "loop-design-explicit-id",
    });
    assert.equal(withExplicitId.success, true, `tool schema rejected explicit loop_design_id: ${withExplicitId.error?.message}`);
  });

  test("tool schema affected_system enum matches source of truth (widened)", () => {
    // The derived projection uses the entry schema's 15-value enum.
    // We verify the runtime schema accepts a value outside the old 6-value tool enum.
    const toolSchema = z.object(metaStateProposeDesignTool.schema);
    const widenedValue = toolSchema.safeParse({
      title: "A test design title",
      description: "A test design description that is long enough.",
      proposed_design_for: ["rule-a"],
      addresses: [],
      affected_system: "product",
    });
    assert.equal(widenedValue.success, true, `tool schema should accept source-of-truth enum value 'product': ${widenedValue.error?.message}`);
  });

  test("valid caller payload parses through both tool schema and derived schema", () => {
    const derivedSchema = metaStateLoopDesignSchema
      .pick(MIGRATED_FIELDS)
      .merge(z.object({
        loop_design_id: z.string().optional(),
      }));
    const payload = {
      title: "A test design title",
      description: "A test design description that is long enough.",
      proposed_design_for: ["rule-a", "rule-b"],
      addresses: ["finding-1"],
      affected_system: "mcp-tools",
      severity_hint: "high",
      loop_design_id: "loop-design-explicit-id",
    };

    const toolResult = z.object(metaStateProposeDesignTool.schema).safeParse(payload);
    assert.equal(toolResult.success, true, `tool schema rejected valid payload: ${toolResult.error?.message}`);

    const derivedResult = derivedSchema.safeParse(payload);
    assert.equal(derivedResult.success, true, `derived schema rejected valid payload: ${derivedResult.error?.message}`);
  });

  test("tool schema rejects empty proposed_design_for like derived schema", () => {
    const derivedSchema = metaStateLoopDesignSchema
      .pick(MIGRATED_FIELDS)
      .merge(z.object({
        loop_design_id: z.string().optional(),
      }));
    const payload = {
      title: "A test design title",
      description: "A test design description that is long enough.",
      proposed_design_for: [],
      addresses: [],
      affected_system: "mcp-tools",
    };

    const toolResult = z.object(metaStateProposeDesignTool.schema).safeParse(payload);
    const derivedResult = derivedSchema.safeParse(payload);

    assert.equal(toolResult.success, false, "tool schema should reject empty proposed_design_for");
    assert.equal(derivedResult.success, false, "derived schema should reject empty proposed_design_for");
  });
});
