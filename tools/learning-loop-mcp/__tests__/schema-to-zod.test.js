/**
 * Tests for core/schema-to-zod.js — the thin wrapper around zod 4.4.3's
 * z.fromJSONSchema() that adds project-specific concerns (excludeFields,
 * sidecar descriptions, strict-mode override).
 *
 * TDD-first: these tests were written BEFORE the implementation. See
 * plans/260603-field-coverage/phase-0-schema-to-zod-engine.md § Step 2.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  zodFromSchema,
  buildZodSchemaFor,
  zodObjectForProperties,
} from "../core/schema-to-zod.js";
import { loadDescriptions, clearDescriptionsCache } from "../core/schema-description-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");

function loadSchema(filename) {
  return JSON.parse(readFileSync(join(root, "schemas", filename), "utf8"));
}

const EXPERIMENT_MINIMAL = {
  id: "experiment-test",
  schema_version: "1.0",
  type: "experiment",
  status: "draft",
  created_at: "2026-06-03T00:00:00Z",
  updated_at: "2026-06-03T00:00:00Z",
  source_refs: ["local:test"],
  goal: "test",
  hypothesis: "test",
  method: ["step 1"],
  success_metrics: ["step 1 passed"],
  result: "",
  agent_outcome: "",
  product_outcome: "",
  observations: [],
  promotion_review: [],
};

const RISK_MINIMAL = {
  id: "risk-test",
  schema_version: "1.0",
  type: "risk",
  status: "active",
  created_at: "2026-06-03T00:00:00Z",
  updated_at: "2026-06-03T00:00:00Z",
  source_refs: ["local:test"],
  risk_statement: "test risk",
  category: "license",
  severity: "low",
  likelihood: "low",
  confidence: "low",
};

const DECISION_MINIMAL = {
  id: "decision-test",
  schema_version: "1.0",
  type: "decision",
  status: "draft",
  created_at: "2026-06-03T00:00:00Z",
  updated_at: "2026-06-03T00:00:00Z",
  source_refs: ["local:test"],
  question: "test?",
  decision: "test",
  rationale: "test",
  alternatives: [],
  tradeoffs: [],
  supersedes: [],
  decision_effect: { action: "defer", scope: "planning", affected_refs: [] },
};

const OBSERVATION_MINIMAL = {
  id: "obs-test",
  schema_version: "1.0",
  type: "observation",
  status: "active",
  created_at: "2026-06-03T00:00:00Z",
  updated_at: "2026-06-03T00:00:00Z",
  source_refs: ["local:test"],
  constraint_type: "test",
  constraint: "test",
  notes: "test",
};

// Tests 1-4: zodFromSchema smoke for 4 record types
describe("zodFromSchema() — smoke per record type", () => {
  it("returns a ZodObject for experiment schema", () => {
    const result = zodFromSchema(loadSchema("experiment.schema.json"));
    assert.ok(result instanceof z.ZodType);
  });

  it("returns a ZodObject for risk schema", () => {
    const result = zodFromSchema(loadSchema("risk.schema.json"));
    assert.ok(result instanceof z.ZodType);
  });

  it("returns a ZodObject for decision schema", () => {
    const result = zodFromSchema(loadSchema("decision.schema.json"));
    assert.ok(result instanceof z.ZodType);
  });

  it("returns a ZodObject for observation schema", () => {
    const result = zodFromSchema(loadSchema("observation.schema.json"));
    assert.ok(result instanceof z.ZodType);
  });
});

// Tests 5-10: buildZodSchemaFor for experiment
describe('buildZodSchemaFor("experiment", ...) — round-trip + validation', () => {
  it("returns a ZodType (smoke)", () => {
    const result = buildZodSchemaFor("experiment", { root });
    assert.ok(result instanceof z.ZodType);
  });

  it("accepts a minimal valid experiment record (round-trip)", () => {
    const schema = buildZodSchemaFor("experiment", { root });
    assert.doesNotThrow(() => schema.parse(EXPERIMENT_MINIMAL));
  });

  it('rejects status: "BOGUS" (enum check)', () => {
    const schema = buildZodSchemaFor("experiment", { root });
    assert.throws(() =>
      schema.parse({ ...EXPERIMENT_MINIMAL, status: "BOGUS" }),
    );
  });

  it("rejects input with id when id is in excludeFields (strict mode strips it)", () => {
    const schema = buildZodSchemaFor("experiment", { root, excludeFields: ["id"] });
    // After stripping id, providing it makes it an unrecognized extra → strict throws
    assert.throws(
      () => schema.parse(EXPERIMENT_MINIMAL),
      /unrecognized|extra|additional/i,
    );
  });

  it("accepts input with neither id nor schema_version when both are excluded", () => {
    const schema = buildZodSchemaFor("experiment", {
      root,
      excludeFields: ["id", "schema_version"],
    });
    const { id: _id, schema_version: _sv, ...withoutIds } = EXPERIMENT_MINIMAL;
    assert.doesNotThrow(() => schema.parse(withoutIds));
  });

  it("rejects extras even without excludeFields (.strict() is enforced)", () => {
    const schema = buildZodSchemaFor("experiment", { root });
    assert.throws(
      () => schema.parse({ ...EXPERIMENT_MINIMAL, extra_bogus: "BOGUS" }),
      /unrecognized|extra|additional/i,
    );
  });
});

// Tests 11-13: buildZodSchemaFor for risk/decision/observation
describe("buildZodSchemaFor() — round-trip for risk, decision, observation", () => {
  it('accepts a minimal valid risk record', () => {
    const schema = buildZodSchemaFor("risk", {
      root,
      excludeFields: [],
    });
    assert.doesNotThrow(() => schema.parse(RISK_MINIMAL));
  });

  it('accepts a minimal valid decision record', () => {
    const schema = buildZodSchemaFor("decision", {
      root,
      excludeFields: [],
    });
    assert.doesNotThrow(() => schema.parse(DECISION_MINIMAL));
  });

  it('accepts a minimal valid observation record', () => {
    const schema = buildZodSchemaFor("observation", {
      root,
      excludeFields: [],
    });
    assert.doesNotThrow(() => schema.parse(OBSERVATION_MINIMAL));
  });
});

// Test 14: unknown type throws
describe("buildZodSchemaFor() — error handling", () => {
  it('throws for unknown type', () => {
    assert.throws(
      () => buildZodSchemaFor("unknown_type", { root }),
      /unknown type/i,
    );
  });
});

// Test 15: sidecar loader is robust
describe("sidecar loader — loadDescriptions()", () => {
  it("returns an object (smoke; never throws even when file missing)", () => {
    clearDescriptionsCache();
    const result = loadDescriptions();
    assert.strictEqual(typeof result, "object");
    assert.notStrictEqual(result, null);
  });
});

// Tests 16-17: zodObjectForProperties
describe("zodObjectForProperties() — lower-level helper for nested blocks", () => {
  it("returns a ZodType with the expected 2 fields", () => {
    const result = zodObjectForProperties(
      {
        name: { type: "string" },
        age: { type: "integer" },
      },
      ["name"],
    );
    assert.ok(result instanceof z.ZodType);
    assert.ok("name" in result.shape);
    assert.ok("age" in result.shape);
  });

  it("rejects input missing a required field", () => {
    const result = zodObjectForProperties(
      {
        name: { type: "string" },
      },
      ["name"],
    );
    assert.throws(() => result.parse({}));
  });
});
