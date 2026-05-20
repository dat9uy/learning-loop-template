import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { surfaceRegistry } from "./surface-registry.js";

/**
 * Validate capability records against product code surfaces.
 * @param {Array<Record<string, unknown>>} records
 * @param {string} root
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateCapabilityProductDrift(records, root) {
  const errors = [];
  const warnings = [];

  for (const record of records) {
    if (record.type !== "capability") continue;

    const validator = surfaceRegistry[record.surface];
    if (!validator) {
      warnings.push(
        `unsupported surface: ${record.__file} has surface "${record.surface}" — drift check skipped`
      );
      continue;
    }

    const driftErrors = validator(record, root);
    errors.push(...driftErrors);
  }

  return { errors, warnings };
}

// CLI entry point
if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { loadRecords } = await import("../validate-records/record-loader.js");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, "..", "..");
  const records = loadRecords(root);
  const result = validateCapabilityProductDrift(records, root);

  for (const warning of result.warnings) {
    console.warn(`WARNING: ${warning}`);
  }
  for (const error of result.errors) {
    console.error(`ERROR: ${error}`);
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }
  if (result.warnings.length > 0) {
    console.log(`OK (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`);
  } else {
    console.log("OK — zero drift detected");
  }
}
