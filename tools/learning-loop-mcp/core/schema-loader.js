import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const schemaMapping = {
  claim: "claim.schema.json",
  experiment: "experiment.schema.json",
  decision: "decision.schema.json",
  risk: "risk.schema.json",
  capability: "capability.schema.json",
  "extracted-assertion": "index-entry.schema.json",
  observation: "observation.schema.json",
};

function applyObservationOverride(root, schema) {
  const overridePath = join(root, "tools", "learning-loop-mcp", "core", "observation-schema-override.json");
  if (!existsSync(overridePath)) return schema;
  const override = JSON.parse(readFileSync(overridePath, "utf8"));
  return {
    ...schema,
    properties: {
      ...(schema.properties || {}),
      ...(override.properties || {}),
    },
  };
}

export function loadSchemas(root) {
  return Object.fromEntries(
    Object.entries(schemaMapping).map(([type, filename]) => {
      const raw = JSON.parse(readFileSync(join(root, "schemas", filename), "utf8"));
      const schema = type === "observation" ? applyObservationOverride(root, raw) : raw;
      return [type, schema];
    }),
  );
}
