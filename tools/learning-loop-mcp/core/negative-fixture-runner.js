import { join } from "node:path";
import { validateDerivedAssurance } from "./derived-claim-assurance.js";
import { validateFilenameConventions } from "./filename-convention-validation.js";
import { loadRecords } from "./record-loader.js";
import { loadSchemas } from "./schema-loader.js";
import { validateRecords } from "./record-validation-rules.js";
import { RecordParseError } from "./yaml-parse-wrapper.js";

export function runNegativeFixtures(rootPath, allowDisallowed) {
  const schemas = loadSchemas(rootPath);
  const cases = [
    ["invalid-reference", "missing record reference"],
    ["retired-pack-source-ref", "/source_refs/0 pattern: must match pattern"],
    ["disallowed-legacy-source", "disallowed legacy source"],
    ["disallowed-local-source", "local source must stay under records/evidence"],
    ["capability-source-outside-allowlist", "local source must stay under records/evidence, records/*/evidence, product/*/capabilities"],
    ["non-capability-source-in-product", "local source must stay under records/evidence"],
    ["capability-source-glob-traversal", "local source must stay under records/evidence, records/*/evidence, product/*/capabilities"],
    ["local-source-traversal", "local source must stay under records/evidence"],
    ["missing-local-source", "missing local source"],
    ["unsupported-source-ref", "/source_refs/0 pattern: must match pattern"],
    ["malformed-array", "/source_refs/0 type: must be string"],
    ["missing-dimensions", "/ required: must have required property 'verification'"],
    ["unsupported-dimension-status", "static status must be one of claimed, verified, rejected"],
    ["high-state-without-proof", "runtime verified status requires proof refs"],
    ["runtime-without-human-approval", "runtime verification requires approved human approval"],
    ["product-without-decision", "product approved decision proof must reference claim"],
    ["verified-mismatched-proof", "install verified status requires matching experiment proof ref"],
    ["verified-without-proof-refs", "static verified status requires proof refs"],
    ["product-unrelated-decision", "product approved decision proof must reference claim"],
    ["rejected-without-rejection-proof", "static rejected status requires proof refs"],
    ["rejected-with-related-non-rejection-decision", "static rejected status requires matching experiment proof ref"],
    ["invalid-plain-scalar", { kind: "yaml-syntax" }],
    ["invalid-risk-status", "/status enum: must be equal to one of the allowed values"],
    ["invalid-output-capture", "/output_capture type: must be object"],
    ["invalid-decision-effect", "/decision_effect/action enum: must be equal to one of the allowed values"],
    ["bad-timestamp", "/created_at pattern: must match pattern"],
    ["outside-reference-docs", "references outside-artifact"],
    ["experiment-missing-verification-assertion-refs", "verification.assertion_refs must name at least one assertion or claim"],
    ["risk-missing-assertion-refs", "validation-pass"],
  ];
  const errors = [];
  for (const [fixture, expected] of cases) {
    let records;
    try {
      const fixtureRoot = join(rootPath, "tools", "learning-loop-mcp", "fixtures", "negative");
      records = loadRecords(rootPath, join(fixtureRoot, fixture));
    } catch (parseError) {
      if (typeof expected === "string" && parseError.message.includes(expected)) {
        continue;
      }
      if (typeof expected === "object" && parseError instanceof RecordParseError && parseError.kind === expected.kind) {
        continue;
      }
      errors.push(`${fixture} failed with unexpected parse error: ${parseError.message}`);
      continue;
    }
    if (typeof expected === "object") {
      errors.push(`${fixture} did not fail with expected parse error kind: ${expected.kind}`);
      continue;
    }
    if (expected === "validation-pass") {
      const result = validateRecords(records, schemas, rootPath, allowDisallowed);
      if (result.length > 0) {
        errors.push(`${fixture} expected validation-pass (no errors) but got: ${result.join("; ")}`);
      }
      continue;
    }
    const result = validateRecords(records, schemas, rootPath, allowDisallowed);
    if (!result.some((error) => error.includes(expected))) {
      errors.push(`${fixture} did not fail with expected message: ${expected}`);
    }
  }
  return errors;
}

export function runValidateRecords(rootPath, opts = {}) {
  const schemas = loadSchemas(rootPath);
  const records = loadRecords(rootPath);
  const allowDisallowed = opts.allowDisallowedFixtures || false;
  const errors = validateRecords(records, schemas, rootPath, allowDisallowed);
  errors.push(...validateDerivedAssurance(records));
  if (opts.includeNegativeFixtures !== false) {
    errors.push(...runNegativeFixtures(rootPath, allowDisallowed));
  }
  const warnings = validateFilenameConventions(records);
  return { records, errors, warnings };
}
