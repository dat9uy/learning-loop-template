import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const schemaMapping = {
  "meta-state": "meta-state.schema.json",
  "runtime-state": "runtime-state.schema.json",
};

export function loadSchemas(root) {
  return Object.fromEntries(
    Object.entries(schemaMapping).map(([type, filename]) => {
      const path = join(root, "schemas", filename);
      if (!existsSync(path)) {
        return [type, null];
      }
      const raw = JSON.parse(readFileSync(path, "utf8"));
      return [type, raw];
    }).filter(([, schema]) => schema !== null),
  );
}
