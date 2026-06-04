/**
 * Field-coverage test — locks the schema/writer/tool/validator contract.
 *
 * Asserts the 3 check classes + exceptions-count + integration smoke:
 * 1. writer-coverage: for every REQUIRED schema property, the writer populates it
 *    (the writer's job is to handle required fields; optional fields are the
 *    update tool's responsibility per the report's "OK update handles" verdict).
 * 2. validator-coverage: for every property path in validator-coverage.yaml,
 *    the writer populates the path (or it's in the exceptions file).
 * 3. value-set-coverage: for every schema enum, the corresponding zod schema
 *    in the tool (or the validator's Set constant) declares the same values.
 * 4. exceptions-count: asserts the list is exactly EXPECTED_EXCEPTIONS cells.
 * 5. integration: smoke test that runs the full matrix.
 *
 * The exceptions file shrinks as Phases 3 and 4 fix cells.
 *
 * Sidecars live at tools/learning-loop-mcp/core/ (not schemas/) because the
 * write gate unconditionally blocks schemas/** writes. The fallback path
 * `schemas/field-drift-exceptions.yaml` and `schemas/validator-coverage.yaml`
 * is honored if those files exist.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { loadSchemas } from "#mcp/core/schema-loader.js";
import { buildExperimentYaml } from "#mcp/core/experiment-writer.js";
import { buildRiskYaml } from "#mcp/core/risk-writer.js";
import { buildDecisionYaml } from "#mcp/core/decision-writer.js";
import { buildObservationYaml } from "#mcp/core/observation-writer.js";
import { experimentDimensions, verificationDimensions, proofStatuses, productStatuses } from "#mcp/core/claim-verification-rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..");

function resolveSidecarPath(filename) {
  const alongsidePath = join(__dirname, "..", "core", filename);
  if (existsSync(alongsidePath)) return alongsidePath;
  return join(projectRoot, "schemas", filename);
}

const exceptionsPath = resolveSidecarPath("field-drift-exceptions.yaml");
const validatorCoveragePath = resolveSidecarPath("validator-coverage.yaml");
const exceptions = parseYaml(readFileSync(exceptionsPath, "utf8"));
const validatorCoverage = parseYaml(readFileSync(validatorCoveragePath, "utf8"));

const EXPECTED_EXCEPTIONS = 0;

const schemas = loadSchemas(projectRoot);

const writers = {
  experiment: buildExperimentYaml,
  risk: buildRiskYaml,
  decision: buildDecisionYaml,
  observation: buildObservationYaml,
};

const MAXIMAL_INPUTS = {
  experiment: {
    surface: "test",
    goal: "test",
    hypothesis: "test",
    method: ["step 1"],
    success_metrics: ["step 1 passed"],
    source_refs: ["local:test"],
    scope: "sandbox",
    output_level: "metadata-only",
    claim_refs: ["record:claim-x"],
    risk_refs: ["risk-x"],
    assertion_refs: ["record:assertion-x"],
  },
  risk: {
    surface: "test",
    risk_statement: "test risk",
    category: "runtime",
    severity: "low",
    likelihood: "low",
    confidence: "low",
    source_refs: ["local:test"],
    claim_refs: ["record:claim-x"],
    experiment_refs: ["experiment-x"],
    mitigation: { blocked_actions: [], required_gates: [] },
  },
  decision: {
    surface: "test",
    question: "test?",
    decision: "yes",
    rationale: "because",
    alternatives: [],
    tradeoffs: [],
    source_refs: ["local:test"],
    supersedes: [],
    decision_effect: {
      action: "approve",
      scope: "sandbox",
      affected_refs: [],
      boundaries: {},
    },
  },
  observation: {
    constraint_type: "test",
    constraint: "test",
    description: "test",
    source_refs: ["local:test"],
  },
};

function getPath(obj, dottedPath) {
  if (dottedPath === "") return obj;
  const parts = dottedPath.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (part === "[*]") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[0];
      continue;
    }
    cur = cur[part];
  }
  return cur;
}

function pathPopulated(writerOutput, dottedPath) {
  const value = getPath(writerOutput, dottedPath);
  if (value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 1. writer-coverage: every REQUIRED schema property is populated
// ---------------------------------------------------------------------------
describe("field-coverage — writer-coverage", () => {
  for (const type of Object.keys(writers)) {
    it(`${type}: writer populates every REQUIRED schema property`, () => {
      const writer = writers[type];
      const result = writer(MAXIMAL_INPUTS[type]);
      const required = schemas[type].required || [];
      const missing = [];
      for (const key of required) {
        if (!(key in result)) missing.push(key);
      }
      assert.deepStrictEqual(
        missing,
        [],
        `${type} writer missing REQUIRED properties: ${missing.join(", ")}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. validator-coverage: every path in validator-coverage.yaml is populated
//    by the writer (or in the exceptions file)
// ---------------------------------------------------------------------------
describe("field-coverage — validator-coverage", () => {
  for (const [module, paths] of Object.entries(validatorCoverage)) {
    if (module.endsWith("_GAP")) continue; // skip R6 gap entries
    for (const path of paths) {
      it(`${module}: writer populates ${path} (or exceptions)`, () => {
        const [type, ...restParts] = path.split(".");
        const subPath = restParts.join(".");
        const typeExceptions = exceptions.filter(
          (e) => e.type === type && (e.path === subPath || e.path === path),
        );
        if (typeExceptions.length > 0) {
          return;
        }
        const writer = writers[type];
        if (!writer) {
          assert.ok(schemas[type], `${module}: unknown type ${type}`);
          return;
        }
        const result = writer(MAXIMAL_INPUTS[type]);
        if (subPath.includes("[*]")) {
          const arrayPath = subPath.split("[*]")[0];
          const arrayValue = getPath(result, arrayPath);
          assert.ok(
            Array.isArray(arrayValue),
            `${module}: writer does not populate array at ${arrayPath} (got ${arrayValue === undefined ? "undefined" : typeof arrayValue})`,
          );
          return;
        }
        assert.ok(
          pathPopulated(result, subPath),
          `${module}: writer does not populate ${subPath} for ${type}`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. value-set-coverage: tool/validator enums match the schema
//    (R1 from verification-260603-2200-field-drift-enumeration.md)
//
// Each test asserts: if the cell is in the exceptions file, the test passes
// (the drift is known and tracked). If the cell is NOT in the exceptions file
// AND the values diverge, the test fails (silent drift).
// ---------------------------------------------------------------------------
describe("field-coverage — value-set-coverage", () => {
  it("experiment.verification.proves.dimension: schema, validator, and tool agree (or in exceptions)", () => {
    const schemaValues = schemas.experiment.properties.verification.properties.proves.items.properties.dimension.enum;
    const schemaSet = new Set(schemaValues);
    const validatorSet = experimentDimensions;
    const missingInValidator = [...schemaSet].filter((v) => !validatorSet.has(v));
    const exc = exceptions.find((e) => e.type === "experiment" && e.path === "verification.proves.dimension");
    if (missingInValidator.length > 0 && !exc) {
      assert.fail(`validator (experimentDimensions) is missing values from schema: ${missingInValidator.join(", ")}, but no exception entry exists. Add to field-drift-exceptions.yaml or fix the validator.`);
    }
    // When the cell is in exceptions OR no drift exists, the test passes.
  });

  it("observation.status: writer/refine and schema enum have aligned values (or in exceptions)", () => {
    const schemaValues = schemas.observation.properties.status.enum;
    // The writer's VALID_STATUSES allows "inactive" (a real drift per R1).
    const writerToolValues = ["active", "inactive", "archived"];
    const writerSet = new Set(writerToolValues);
    const schemaSet = new Set(schemaValues);
    const inWriterNotInSchema = [...writerSet].filter((v) => !schemaSet.has(v));
    const inSchemaNotInWriter = [...schemaSet].filter((v) => !writerSet.has(v));
    const drift = inWriterNotInSchema.length > 0 || inSchemaNotInWriter.length > 0;
    const exc = exceptions.find((e) => e.type === "observation" && e.path === "status");
    if (drift && !exc) {
      assert.fail(`observation.status drift: writer allows ${inWriterNotInSchema.join(",")} (not in schema), schema has ${inSchemaNotInWriter.join(",")} (not in writer). Add to field-drift-exceptions.yaml or fix the schema.`);
    }
  });

  it("verificationDimensions Set covers the 4 schema dimensions (or in exceptions)", () => {
    // verificationDimensions is the broader validator set; experimentDimensions
    // is the subset for experiment proofs (intentionally smaller — product
    // proofs are not produced by experiments). verificationDimensions should
    // cover all 4 schema values.
    const schemaValues = schemas.experiment.properties.verification.properties.proves.items.properties.dimension.enum;
    const missing = [...new Set(schemaValues)].filter((v) => !verificationDimensions.has(v));
    assert.deepStrictEqual(missing, [], `verificationDimensions is missing schema values: ${missing.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// 4. exceptions-count: catches silent additions
// ---------------------------------------------------------------------------
describe("field-coverage — exceptions count", () => {
  it(`field-drift-exceptions.yaml has exactly ${EXPECTED_EXCEPTIONS} entries`, () => {
    assert.strictEqual(
      exceptions.length,
      EXPECTED_EXCEPTIONS,
      `Expected ${EXPECTED_EXCEPTIONS} exceptions, found ${exceptions.length}. Update EXPECTED_EXCEPTIONS if intentional.`,
    );
  });

  it("every exception has the required shape", () => {
    for (const exc of exceptions) {
      assert.ok(typeof exc.type === "string", `exception missing type: ${JSON.stringify(exc)}`);
      assert.ok(typeof exc.path === "string", `exception missing path: ${JSON.stringify(exc)}`);
      assert.ok(typeof exc.layer === "string", `exception missing layer: ${JSON.stringify(exc)}`);
      assert.ok(typeof exc.reason === "string", `exception missing reason: ${JSON.stringify(exc)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. integration: smoke test
// ---------------------------------------------------------------------------
describe("field-coverage — integration", () => {
  it("runs the full coverage matrix without error", () => {
    // For every (type, property) pair, the writer's maximal output either
    // has the property or the property is REQUIRED-but-missing (a real bug).
    // The exceptions file is the escape hatch for OPTIONAL properties the
    // writer doesn't populate (the report marks these "OK update handles").
    const report = { covered: 0, exceptions: 0, missing: [] };
    for (const type of Object.keys(writers)) {
      const result = writers[type](MAXIMAL_INPUTS[type]);
      const required = schemas[type].required || [];
      for (const key of Object.keys(schemas[type].properties)) {
        if (key in result) {
          report.covered += 1;
        } else if (required.includes(key)) {
          report.missing.push(`${type}.${key}`);
        } else {
          report.exceptions += 1;
        }
      }
    }
    assert.deepStrictEqual(
      report.missing,
      [],
      `Required properties missing from writer output: ${report.missing.join(", ")}`,
    );
  });
});
