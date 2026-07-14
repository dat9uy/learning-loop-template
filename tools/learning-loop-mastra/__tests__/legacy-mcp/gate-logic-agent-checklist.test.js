import assert from "node:assert";
import { test } from "vitest";
import { applyPromotedRules } from "../../core/gate-logic.js";
import { metaStateRuleEntrySchema } from "../../core/meta-state.js";

await test("agent-checklist rule loads through schema and is a no-op for applyPromotedRules", () => {
  const rule = metaStateRuleEntrySchema.parse({
    entry_kind: "rule",
    id: "rule-runtime-agnostic-features",
    origin: "meta-20260615T0000Z-agnostic",
    enforcement: "agent",
    pattern_type: "agent-checklist",
    pattern: "{}",
    description: "New features must follow the runtime-agnostic checklist (shim-not-fork + cross-surface helpers).",
    status: "active",
    promoted_at: "2026-06-15T00:00:00.000Z",
    promoted_by: "operator",
  });

  const result = applyPromotedRules("docker run ubuntu", null, [rule], "/tmp/agent-checklist-test-root");

  assert.deepStrictEqual(result, { decision: "ok" });
});
