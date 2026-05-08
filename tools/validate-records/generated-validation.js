import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderGeneratedDocs } from "../generate-docs/generated-doc-content.js";

export function normalizedIndex(records) {
  return {
    generated_at: "1970-01-01T00:00:00.000Z",
    records: records
      .map(({ __file, ...record }) => ({ ...record, file: __file }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function validateGeneratedFiles(root, expectedIndex, records) {
  const errors = [];
  const indexPath = join(root, "records/index.generated.json");
  if (!existsSync(indexPath) || readFileSync(indexPath, "utf8") !== expectedIndex) {
    errors.push("records/index.generated.json is stale; run pnpm validate:records");
  }
  for (const [docPath, expectedContent] of Object.entries(renderGeneratedDocs(root, records))) {
    const fullPath = join(root, docPath);
    if (!existsSync(fullPath)) errors.push(`${docPath} is missing; run pnpm generate:docs`);
    else if (readFileSync(fullPath, "utf8") !== expectedContent) {
      errors.push(`${docPath} is stale; run pnpm generate:docs`);
    }
  }
  return errors;
}
