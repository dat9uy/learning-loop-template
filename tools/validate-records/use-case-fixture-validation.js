import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseYaml } from "./simple-yaml-parser.js";

const validClassifications = new Set([
  "product-build-request",
  "intentional-skip",
  "evidence-doc-execution-verification",
  "self-improvement",
  "external-decision-input",
]);

const validRecordTypes = new Set(["claim", "risk", "experiment", "decision"]);

export function validateUseCaseFixtures(root) {
  const errors = [];
  const fixturesDir = join(root, "fixtures", "use-cases");
  if (!existsSync(fixturesDir)) return errors;

  for (const fileName of readdirSync(fixturesDir).sort()) {
    if (!fileName.endsWith(".yaml")) continue;
    const filePath = join(fixturesDir, fileName);
    const label = relative(root, filePath);
    let fixture;
    try {
      fixture = parseYaml(readFileSync(filePath, "utf8"));
    } catch (e) {
      errors.push(`${label}: invalid YAML`);
      continue;
    }

    if (!fixture.id) errors.push(`${label}: missing id`);
    if (!fixture.prompt) errors.push(`${label}: missing prompt`);
    if (!validClassifications.has(fixture.expected_classification)) {
      errors.push(`${label}: invalid expected_classification ${fixture.expected_classification}`);
    }
    if (!Array.isArray(fixture.required_records)) {
      errors.push(`${label}: required_records must be array`);
    } else {
      for (const rt of fixture.required_records) {
        if (!validRecordTypes.has(rt)) errors.push(`${label}: invalid required record type ${rt}`);
      }
    }
    if (!Array.isArray(fixture.allowed_actions)) {
      errors.push(`${label}: allowed_actions must be array`);
    }
    if (!Array.isArray(fixture.blocked_actions)) {
      errors.push(`${label}: blocked_actions must be array`);
    }
    if (!["pass", "fail"].includes(fixture.expected_validation)) {
      errors.push(`${label}: expected_validation must be pass or fail`);
    }
    if (!fixture.notes) {
      errors.push(`${label}: missing notes`);
    }
  }

  return errors;
}
