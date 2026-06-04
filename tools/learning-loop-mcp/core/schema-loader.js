import { readFileSync } from "node:fs";
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

export function loadSchemas(root) {
  return Object.fromEntries(
    Object.entries(schemaMapping).map(([type, filename]) => [
      type,
      JSON.parse(readFileSync(join(root, "schemas", filename), "utf8")),
    ]),
  );
}
