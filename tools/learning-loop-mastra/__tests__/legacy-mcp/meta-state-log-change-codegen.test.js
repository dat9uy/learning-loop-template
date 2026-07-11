import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { metaStateLogChangeTool } from "../../tools/handlers/meta-state-log-change-tool.js";
import { metaStateChangeEntrySchema } from "../../core/meta-state.js";

const MIGRATED_FIELDS = {
  change_dimension: true,
  change_target: true,
  change_diff: true,
  reason: true,
  applies_to: true,
  supersedes: true,
  consolidates: true,
  evidence_code_ref: true,
  evidence_journal: true,
  operation_envelope: true,
};

describe("meta_state_log_change codegen parity", () => {
  test("tool schema exposes exactly the same keys as derived pick projection", () => {
    const derivedSchema = metaStateChangeEntrySchema.pick(MIGRATED_FIELDS);
    const derivedKeys = Object.keys(derivedSchema.shape).sort();
    const toolKeys = Object.keys(metaStateLogChangeTool.schema).sort();

    assert.deepEqual(toolKeys, derivedKeys, "tool schema keys differ from derived schema keys");
  });

  test("tool schema omits handler-generated change-log fields", () => {
    const toolKeys = new Set(Object.keys(metaStateLogChangeTool.schema));
    const omittedFields = [
      "id",
      "entry_kind",
      "status",
      "created_at",
      "version",
      "expires_at",
      "affected_system",
      "code_ref",
      "ledger_ref",
    ];

    for (const field of omittedFields) {
      assert.equal(toolKeys.has(field), false, `handler-generated field ${field} should not be in tool schema`);
    }
  });

  test("valid caller payload parses through both tool schema and derived schema", () => {
    const derivedSchema = metaStateChangeEntrySchema.pick(MIGRATED_FIELDS);
    const payload = {
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: ["field"], removed: [], changed: [] },
      reason: "A reason that is at least twenty characters.",
      applies_to: { tools: ["meta_state_log_change"] },
      supersedes: "meta-260601T0000Z-old",
      consolidates: "meta-260601T0000Z-finding",
      evidence_code_ref: "file.js",
      evidence_journal: "journal.md",
    };

    const toolResult = z.object(metaStateLogChangeTool.schema).safeParse(payload);
    assert.equal(toolResult.success, true, `tool schema rejected valid payload: ${toolResult.error?.message}`);

    const derivedResult = derivedSchema.safeParse(payload);
    assert.equal(derivedResult.success, true, `derived schema rejected valid payload: ${derivedResult.error?.message}`);
  });

  test("tool schema rejects invalid change_dimension like derived schema", () => {
    const derivedSchema = metaStateChangeEntrySchema.pick(MIGRATED_FIELDS);
    const payload = {
      change_dimension: "invalid-dimension",
      change_target: "x",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "A reason that is at least twenty characters.",
    };

    const toolResult = z.object(metaStateLogChangeTool.schema).safeParse(payload);
    const derivedResult = derivedSchema.safeParse(payload);

    assert.equal(toolResult.success, false, "tool schema should reject invalid change_dimension");
    assert.equal(derivedResult.success, false, "derived schema should reject invalid change_dimension");
  });

  test("tool schema rejects too-short reason like derived schema", () => {
    const derivedSchema = metaStateChangeEntrySchema.pick(MIGRATED_FIELDS);
    const payload = {
      change_dimension: "semantic",
      change_target: "x",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "short",
    };

    const toolResult = z.object(metaStateLogChangeTool.schema).safeParse(payload);
    const derivedResult = derivedSchema.safeParse(payload);

    assert.equal(toolResult.success, false, "tool schema should reject too-short reason");
    assert.equal(derivedResult.success, false, "derived schema should reject too-short reason");
  });
});
