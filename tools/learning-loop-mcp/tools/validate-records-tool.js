import { z } from "zod";
import { loadRecords } from "../core/record-loader.js";
import { loadSchemas } from "../core/schema-loader.js";
import { validateRecords } from "../core/record-validation-rules.js";
import { validateDerivedAssurance } from "../core/derived-claim-assurance.js";
import { validateFilenameConventions } from "../core/filename-convention-validation.js";
import { runNegativeFixtures } from "../core/negative-fixture-runner.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

function parseErrorMessage(msg) {
  const match = msg.match(/^([^:]+):\s+(.+)$/);
  if (match) {
    return { record: match[1].trim(), message: match[2].trim() };
  }
  return { record: "unknown", message: msg };
}

export const indexValidateTool = {
  name: "index_validate",
  description: "Validate YAML records against JSON schemas. Use AFTER writing records to verify correctness. Returns structured errors and warnings.",
  schema: {
    allow_disallowed_fixtures: z.boolean().optional().describe("Allow fixtures that use disallowed source_ref patterns (for test fixtures)"),
    include_negative_fixtures: z.boolean().optional().describe("Also validate negative test fixtures (default: false)"),
    root: z.string().optional().describe("Project root directory (default: auto-detected)"),
  },
  handler: async (args) => {
    const root = resolveRoot(args.root);

    let schemas, records;
    try {
      schemas = loadSchemas(root);
      records = loadRecords(root);
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            valid: false,
            error: true,
            message: `Failed to load records or schemas: ${error.message}`,
          }),
        }],
        isError: true,
      };
    }

    const allowDisallowed = args.allow_disallowed_fixtures || false;
    const validationErrors = validateRecords(records, schemas, root, allowDisallowed);
    const derivedErrors = validateDerivedAssurance(records);
    const warnings = validateFilenameConventions(records);

    const errors = [...validationErrors, ...derivedErrors];

    if (args.include_negative_fixtures) {
      const fixtureErrors = runNegativeFixtures(root, allowDisallowed);
      errors.push(...fixtureErrors);
    }

    const result = {
      valid: errors.length === 0,
      record_count: records.length,
      errors: errors.map(parseErrorMessage),
      warnings: warnings.map(parseErrorMessage),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "index_validate",
      decision: result.valid ? "ok" : "block",
      record_count: records.length,
      error_count: errors.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
