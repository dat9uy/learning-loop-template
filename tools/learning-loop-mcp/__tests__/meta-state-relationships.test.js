import { test } from "node:test";
import assert from "node:assert";
import { metaStateRelationshipsTool } from "../tools/meta-state-relationships-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

test("meta_state_relationships: inbound for rule origin", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "rule-no-new-artifact-types",
    direction: "inbound",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.id, "rule-no-new-artifact-types");
  assert.strictEqual(text.direction, "inbound");
  assert.ok(text.inbound, "inbound should be present");
  assert.ok(text.inbound.promoted_from, "inbound should have promoted_from");
  assert.ok(
    text.inbound.promoted_from.includes("meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal"),
    "promoted_from should include the originating finding"
  );
});

test("meta_state_relationships: outbound for finding with promoted_to_rule", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
    direction: "outbound",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.direction, "outbound");
  assert.ok(text.outbound, "outbound should be present");
  assert.strictEqual(text.outbound.promoted_to_rule, "rule-no-new-artifact-types");
});

test("meta_state_relationships: both directions for entry with refs", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
    direction: "both",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.direction, "both");
  assert.ok(text.outbound, "both should have outbound");
  assert.ok(text.inbound, "both should have inbound");
});

test("meta_state_relationships: missing entry returns error", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "non-existent-entry-id",
    direction: "both",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.error, "entry_not_found");
  assert.strictEqual(text.id, "non-existent-entry-id");
});
