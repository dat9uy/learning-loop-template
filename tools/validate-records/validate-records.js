import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDerivedAssurance } from "./derived-claim-assurance.js";
import { validateFilenameConventions } from "./filename-convention-validation.js";
import { loadRecords } from "./record-loader.js";
import { validateRecords } from "./record-validation-rules.js";
import { RecordParseError } from "./yaml-parse-wrapper.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const allowDisallowedFixtures = process.argv.includes("--allow-disallowed-fixtures");
const schemas = Object.fromEntries(
  ["claim", "experiment", "decision", "risk", "capability"].map((type) => [
    type,
    JSON.parse(readFileSync(join(root, "schemas", `${type}.schema.json`), "utf8")),
  ]),
);

function runNegativeFixtures() {
  const cases = [
    ["invalid-reference", "missing record reference"],
    ["retired-pack-source-ref", "/source_refs/0 pattern: must match pattern"],
    ["disallowed-legacy-source", "disallowed legacy source"],
    ["disallowed-local-source", "local source must stay under records/evidence"],
    ["capability-source-outside-allowlist", "local source must stay under records/evidence, product/*/capabilities"],
    ["non-capability-source-in-product", "local source must stay under records/evidence"],
    ["capability-source-glob-traversal", "local source must stay under records/evidence, product/*/capabilities"],
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
  ];
  const errors = [];
  for (const [fixture, expected] of cases) {
    let records;
    try {
      records = loadRecords(root, join(root, "fixtures", "negative", fixture));
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
    const result = validateRecords(records, schemas, root, allowDisallowedFixtures);
    if (!result.some((error) => error.includes(expected))) {
      errors.push(`${fixture} did not fail with expected message: ${expected}`);
    }
  }
  return errors;
}

function main() {
  const records = loadRecords(root);
  const errors = validateRecords(records, schemas, root, allowDisallowedFixtures);
  errors.push(...validateDerivedAssurance(records));
  errors.push(...runNegativeFixtures());
  const warnings = validateFilenameConventions(records);

  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }
  console.log(`Validated ${records.length} records.`);
  if (warnings.length) {
    console.error(warnings.map((warning) => `Warning: ${warning}`).join("\n"));
  }
}

main();
