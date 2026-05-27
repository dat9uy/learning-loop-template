import { z } from "zod";
import { loadRecords } from "../../validate-records/record-loader.js";
import { loadSchemas } from "../../validate-records/schema-loader.js";
import { validateRecords } from "../../validate-records/record-validation-rules.js";
import { validateDerivedAssurance } from "../../validate-records/derived-claim-assurance.js";
import { validateFilenameConventions } from "../../validate-records/filename-convention-validation.js";
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

    const validationErrors = validateRecords(records, schemas, root, args.allow_disallowed_fixtures || false);
    const derivedErrors = validateDerivedAssurance(records);
    const warnings = validateFilenameConventions(records);

    const errors = [...validationErrors, ...derivedErrors];

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
