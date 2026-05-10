import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDerivedAssurance } from "./derived-claim-assurance.js";
import { validatePackSources } from "./pack-source-validation.js";
import { loadPackStatuses, loadRecords } from "./record-loader.js";
import { validateRecords } from "./record-validation-rules.js";
import { validatePublicationGates } from "./publication-gate-validation.js";
import { validateUseCaseFixtures } from "./use-case-fixture-validation.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const allowDisallowedFixtures = process.argv.includes("--allow-disallowed-fixtures");
const schemas = Object.fromEntries(
  ["claim", "experiment", "decision", "risk", "capability"].map((type) => [
    type,
    JSON.parse(readFileSync(join(root, "schemas", `${type}.schema.json`), "utf8")),
  ]),
);

function runNegativeFixtures(packStatuses) {
  const cases = [
    ["invalid-reference", "missing record reference"],
    ["unapproved-pack", "experiment consumes unreviewed pack"],
    ["disallowed-legacy-source", "disallowed legacy source"],
    ["disallowed-local-source", "local source must stay under records/evidence or knowledge-packs"],
    ["capability-source-outside-allowlist", "local source must stay under records/evidence, knowledge-packs, product/*/capabilities"],
    ["non-capability-source-in-product", "local source must stay under records/evidence or knowledge-packs"],
    ["capability-source-glob-traversal", "local source must stay under records/evidence, knowledge-packs, product/*/capabilities"],
    ["local-source-traversal", "local source must stay under records/evidence or knowledge-packs"],
    ["missing-local-source", "missing local source"],
    ["unsupported-source-ref", "unsupported source reference"],
    ["malformed-array", "source_refs[0] must be string"],
    ["missing-dimensions", "verification is required"],
    ["unsupported-dimension-status", "static status must be one of claimed, verified, rejected"],
    ["high-state-without-proof", "runtime verified status requires proof refs"],
    ["runtime-without-human-approval", "runtime verification requires approved human approval"],
    ["product-without-decision", "product approved decision proof must reference claim"],
    ["verified-mismatched-proof", "install verified status requires matching experiment proof ref"],
    ["verified-without-proof-refs", "static verified status requires proof refs"],
    ["product-unrelated-decision", "product approved decision proof must reference claim"],
    ["rejected-without-rejection-proof", "static rejected status requires proof refs"],
    ["rejected-with-related-non-rejection-decision", "static rejected status requires matching experiment proof ref"],
    ["invalid-plain-scalar", "Invalid plain scalar (YAML 1.2)"],
    ["invalid-risk-status", "status must be one of"],
    ["malformed-pack-ref", "malformed pack reference"],
    ["invalid-output-capture", "output_capture must be object"],
    ["invalid-decision-effect", "decision_effect.action must be one of"],
  ];
  const errors = [];
  for (const [fixture, expected] of cases) {
    let records;
    try {
      records = loadRecords(root, join(root, "fixtures", "negative", fixture));
    } catch (parseError) {
      if (parseError.message.includes(expected)) {
        continue;
      }
      errors.push(`${fixture} failed with unexpected parse error: ${parseError.message}`);
      continue;
    }
    const result = validateRecords(records, schemas, packStatuses, root, allowDisallowedFixtures);
    if (!result.some((error) => error.includes(expected))) {
      errors.push(`${fixture} did not fail with expected message: ${expected}`);
    }
  }
  return errors;
}

function runNegativePublicationGateFixtures() {
  const cases = [
    ["pack-rejected-claim", "claim is rejected/blocked"],
    ["pack-low-assurance", "claim assurance source-only is below gate minimum static"],
    ["pack-missing-record-ref", "missing record_ref"],
    ["pack-unresolved-conflict", "unresolved conflict between entries"],
  ];
  const errors = [];
  for (const [fixture, expected] of cases) {
    const fixtureRoot = join(root, "fixtures", "negative", fixture);
    const records = loadRecords(fixtureRoot, join(fixtureRoot, "records"));
    const result = validatePublicationGates(fixtureRoot, records, { transitional: false, packsRoot: join(fixtureRoot, "knowledge-packs") });
    if (!result.some((error) => error.includes(expected))) {
      errors.push(`${fixture} did not fail with expected message: ${expected}`);
    }
  }
  return errors;
}

function runNegativePackFixtures(recordIds) {
  const cases = [
    ["unsupported-pack-source-ref", "knowledge pack source_refs must use record references"],
    ["malformed-pack-source-refs", "source_refs must be array"],
    ["malformed-pack-source-ref-item", "source_refs[0] must be string"],
    ["source-allowlist-traversal", "source_allowlist is not allowed in knowledge packs"],
    ["nested-pack-source-allowlist", "source_allowlist is not allowed in knowledge packs"],
  ];
  const errors = [];
  for (const [fixture, expected] of cases) {
    const result = validatePackSources(join(root, "fixtures", "negative", fixture), recordIds);
    if (!result.some((error) => error.includes(expected))) {
      errors.push(`${fixture} did not fail with expected message: ${expected}`);
    }
  }
  return errors;
}

function main() {
  const records = loadRecords(root);
  const packStatuses = loadPackStatuses(root);
  const recordIds = new Set(records.map((record) => record.id));
  const errors = validateRecords(records, schemas, packStatuses, root, allowDisallowedFixtures);
  errors.push(...validateDerivedAssurance(records));
  errors.push(...validatePublicationGates(root, records, { transitional: true }));
  errors.push(...validatePackSources(root, recordIds));
  errors.push(...runNegativeFixtures(packStatuses));
  errors.push(...runNegativePackFixtures(recordIds));
  errors.push(...runNegativePublicationGateFixtures());
  errors.push(...validateUseCaseFixtures(root));
  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }
  console.log(`Validated ${records.length} records.`);
}

main();
