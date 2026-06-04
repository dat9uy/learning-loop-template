/**
 * Spike: does zod 4's built-in z.fromJSONSchema() cover the JSON Schema subset
 * our 7 active record types use?
 *
 * Context: this spike is the experiment that answers the unresolved question
 * from `plans/reports/research-260603-1600-json-schema-to-zod-libraries.md`.
 * If it passes, the full Approach 2 implementation (see
 * `plans/reports/brainstorm-260603-field-coverage.md`) can use
 * `z.fromJSONSchema()` as a 30-line wrapper with no new dependency.
 *
 * Scope: 7 active schemas + 1 deprecated schema (claim, uses $defs/$ref).
 * Features exercised: type, properties, required, enum, const, pattern,
 * array.items (with nested pattern), nested object.
 *
 * Non-goals: refactoring tool files, building core/schema-to-zod.js, replacing
 * hand-written zod schemas in any production code. Test-only change.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");

const ACTIVE_SCHEMAS = [
  { file: "experiment.schema.json", label: "experiment" },
  { file: "risk.schema.json", label: "risk" },
  { file: "decision.schema.json", label: "decision" },
  { file: "observation.schema.json", label: "observation" },
  { file: "index-entry.schema.json", label: "extracted-assertion" },
  { file: "capability.schema.json", label: "capability" },
];

const DEPRECATED_SCHEMAS = [
  { file: "claim.schema.json", label: "claim (deprecated, uses $defs/$ref)" },
];

function loadSchema(filename) {
  return JSON.parse(readFileSync(join(root, "schemas", filename), "utf8"));
}

describe("z.fromJSONSchema() — viability per active record type", () => {
  for (const { file, label } of ACTIVE_SCHEMAS) {
    it(`converts ${label} schema without throwing`, () => {
      const schema = loadSchema(file);
      assert.doesNotThrow(
        () => z.fromJSONSchema(schema),
        `z.fromJSONSchema() threw on ${label}; the conversion is not viable for Approach 2.`,
      );
    });
  }
});

describe("z.fromJSONSchema() — minimal-record round-trip per active record type", () => {
  it("experiment: minimal valid record parses; invalid status enum fails", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("experiment.schema.json"));
    const minimal = {
      id: "experiment-spike-test",
      schema_version: "1.0",
      type: "experiment",
      status: "draft",
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      source_refs: ["local:spike"],
      goal: "spike test",
      hypothesis: "spike test",
      method: ["step 1"],
      success_metrics: ["step 1 passed"],
      result: "",
      agent_outcome: "",
      product_outcome: "",
      observations: [],
      promotion_review: [],
    };
    assert.doesNotThrow(() => zodSchema.parse(minimal));
    assert.throws(() => zodSchema.parse({ ...minimal, status: "BOGUS" }));
  });

  it("risk: minimal valid record parses; invalid severity enum fails", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("risk.schema.json"));
    const minimal = {
      id: "risk-spike-test",
      schema_version: "1.0",
      type: "risk",
      status: "draft",
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      risk_statement: "spike test risk",
      category: "other",
      severity: "medium",
      likelihood: "medium",
      confidence: "medium",
      source_refs: ["local:spike"],
    };
    assert.doesNotThrow(() => zodSchema.parse(minimal));
    assert.throws(() => zodSchema.parse({ ...minimal, severity: "BOGUS" }));
  });

  it("decision: minimal valid record parses; invalid status enum fails", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("decision.schema.json"));
    const minimal = {
      id: "decision-spike-test",
      schema_version: "1.0",
      type: "decision",
      status: "draft",
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      source_refs: ["local:spike"],
      question: "spike?",
      decision: "yes",
      rationale: "test",
      alternatives: [],
      tradeoffs: [],
      supersedes: [],
    };
    assert.doesNotThrow(() => zodSchema.parse(minimal));
    assert.throws(() => zodSchema.parse({ ...minimal, status: "BOGUS" }));
  });

  it("observation: minimal valid record parses; invalid source_ref pattern fails", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("observation.schema.json"));
    const minimal = {
      id: "obs-spike-test",
      schema_version: "1.0",
      type: "observation",
      status: "active",
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      source_refs: ["local:spike"],
    };
    assert.doesNotThrow(() => zodSchema.parse(minimal));
    assert.throws(() =>
      zodSchema.parse({ ...minimal, source_refs: ["not-a-prefixed-ref"] }),
    );
  });

  it("extracted-assertion: minimal valid record parses; invalid status enum fails", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("index-entry.schema.json"));
    const minimal = {
      id: "assertion-spike-static-test",
      schema_version: "1.0",
      type: "extracted-assertion",
      status: "active",
      assertion: "spike test",
      capability: "spike-cap",
      dimension: "static",
      scope: "spike-scope",
      topic_tag: "spike-tag",
      n_count: 1,
      superseded_by: null,
      supersedes: [],
      source_refs: [
        {
          file: "local:records/evidence/spike.md",
          section: "## Findings",
          bullet_index: 1,
          line_anchor: "L1",
        },
      ],
      experiment_refs: [],
      extraction: {
        agent_run: "spike",
        first_extracted_at: "2026-06-03T00:00:00Z",
        last_updated_at: "2026-06-03T00:00:00Z",
        evidence_immutable_hash: "sha256:" + "0".repeat(64),
      },
    };
    assert.doesNotThrow(() => zodSchema.parse(minimal));
    assert.throws(() => zodSchema.parse({ ...minimal, status: "BOGUS" }));
  });

  it("capability: minimal valid record parses; invalid schema_version const fails", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("capability.schema.json"));
    const minimal = {
      schema_version: "2.0",
      type: "capability",
      stack: "spike",
      surface: "HTTP/REST",
      maps: [{ source: "local:spike" }],
    };
    assert.doesNotThrow(() => zodSchema.parse(minimal));
    assert.throws(() => zodSchema.parse({ ...minimal, schema_version: "BOGUS" }));
  });
});

describe("z.fromJSONSchema() — array.items with nested pattern (experiment.assertion_refs)", () => {
  it("experiment.assertion_refs: array of strings with pattern is enforced", () => {
    const zodSchema = z.fromJSONSchema(loadSchema("experiment.schema.json"));
    const minimal = {
      id: "experiment-arr-spike",
      schema_version: "1.0",
      type: "experiment",
      status: "draft",
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      source_refs: ["local:spike"],
      goal: "spike",
      hypothesis: "spike",
      method: ["step 1"],
      success_metrics: ["step 1 passed"],
      result: "",
      agent_outcome: "",
      product_outcome: "",
      observations: [],
      promotion_review: [],
    };
    // Valid: matches the pattern `^record:assertion-...-(static|install|runtime|product)-[a-z0-9-]+$`
    assert.doesNotThrow(() =>
      zodSchema.parse({
        ...minimal,
        assertion_refs: ["record:assertion-spike-static-foo"],
      }),
    );
    // Invalid: does not match the pattern
    assert.throws(() =>
      zodSchema.parse({
        ...minimal,
        assertion_refs: ["not-a-valid-assertion-ref"],
      }),
    );
  });
});

describe("z.fromJSONSchema() — deprecated claim schema ($ref / $defs support)", () => {
  for (const { file, label } of DEPRECATED_SCHEMAS) {
    it(`${label}: conversion behavior is documented (does not assert pass/fail)`, () => {
      const schema = loadSchema(file);
      let conversionResult;
      let conversionThrew = false;
      let conversionErrorMessage = null;
      try {
        conversionResult = z.fromJSONSchema(schema);
      } catch (err) {
        conversionThrew = true;
        conversionErrorMessage = err?.message ?? String(err);
      }
      if (conversionThrew) {
        // Document the failure as a passing test (we're just recording the outcome).
        console.log(
          `[claim spike] z.fromJSONSchema() THREW: ${conversionErrorMessage}`,
        );
        console.log(
          "[claim spike] VERDICT: $ref/$defs NOT supported by z.fromJSONSchema(). Pre-resolve with ajv or hand-write adapter for claim.",
        );
        return;
      }
      // Conversion didn't throw. Try a minimal claim that exercises the $ref chain.
      const minimalClaim = {
        id: "claim-spike-test",
        schema_version: "1.0",
        type: "claim",
        status: "draft",
        created_at: "2026-06-03T00:00:00Z",
        updated_at: "2026-06-03T00:00:00Z",
        source_refs: ["local:spike"],
        subject: "spike",
        claim: "spike claim",
        scope: "spike-scope",
        evidence_refs: [],
        confidence: "high",
        limitations: [],
        approval: {
          status: "draft",
          reviewer: "spike",
          reviewed_at: "2026-06-03T00:00:00Z",
        },
        verification: {
          static: { status: "claimed", proof_refs: [] },
        },
      };
      try {
        conversionResult.parse(minimalClaim);
        console.log(
          "[claim spike] z.fromJSONSchema() converted claim.schema.json AND parsed a minimal record with $ref'd verification.static.",
        );
        console.log(
          "[claim spike] VERDICT: $ref/$defs appear to be supported (or silently ignored). Verify by testing a record that USES the $ref path strictly.",
        );
      } catch (parseErr) {
        console.log(
          `[claim spike] z.fromJSONSchema() converted, but parse failed: ${parseErr?.message ?? String(parseErr)}`,
        );
        console.log(
          "[claim spike] VERDICT: $ref/$defs conversion is partial — schema object built, but runtime validation does not follow the $ref chain. Pre-resolve with ajv or hand-write adapter.",
        );
      }
    });
  }

  it("claim: strict-ref check — invalid verification.static.status enum is rejected (proves $ref chain is enforced)", () => {
    // This is the test that distinguishes "$ref followed correctly" from "$ref silently ignored".
    // `verification.static` $ref's `proof_dimension` which has `status: { enum: ["claimed", "verified", "rejected"] }`.
    // If the $ref chain is honored, status: "BOGUS" must be rejected.
    const schema = loadSchema("claim.schema.json");
    const zodSchema = z.fromJSONSchema(schema);
    const badClaim = {
      id: "claim-strict-ref-test",
      schema_version: "1.0",
      type: "claim",
      status: "draft",
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      source_refs: ["local:spike"],
      subject: "spike",
      claim: "spike claim",
      scope: "spike-scope",
      evidence_refs: [],
      confidence: "high",
      limitations: [],
      approval: {
        status: "draft",
        reviewer: "spike",
        reviewed_at: "2026-06-03T00:00:00Z",
      },
      verification: {
        // `status: "BOGUS"` violates the enum inside proof_dimension (the $ref target).
        static: { status: "BOGUS", proof_refs: [] },
      },
    };
    let parseThrew = false;
    let parseErrorMessage = null;
    try {
      zodSchema.parse(badClaim);
    } catch (err) {
      parseThrew = true;
      parseErrorMessage = err?.message ?? String(err);
    }
    if (parseThrew) {
      console.log(
        "[claim strict-ref] $ref chain IS enforced: invalid status enum was rejected.",
      );
      console.log(`[claim strict-ref] rejection message: ${parseErrorMessage}`);
    } else {
      console.log(
        "[claim strict-ref] $ref chain is SILENTLY IGNORED: invalid status enum was accepted.",
      );
      console.log(
        "[claim strict-ref] VERDICT: claim schema must be pre-resolved (ajv) or hand-written; do not rely on z.fromJSONSchema() alone for $ref-heavy schemas.",
      );
    }
    // The spike is informational; we DO assert the parseThrew expectation so the
    // test fails loudly if behavior regresses (e.g., zod 4.5 silently drops $ref support).
    assert.strictEqual(
      parseThrew,
      true,
      "Expected claim schema to reject invalid status in $ref'd verification.static. " +
        "If this fails, zod 4.4.3 silently dropped $ref enforcement; the field-coverage plan must add a pre-resolve step.",
    );
  });
});

describe("z.fromJSONSchema() — spike metadata", () => {
  it("logs the zod version this spike is testing against", () => {
    // Read zod's package.json for the version — useful when the spike is rerun
    // months later and we want to know if zod has been bumped.
    const zodPkg = JSON.parse(
      readFileSync(join(root, "node_modules", "zod", "package.json"), "utf8"),
    );
    console.log(`[spike metadata] zod version: ${zodPkg.version}`);
    // Sanity: spike assumes zod >= 4.2 (when fromJSONSchema landed).
    const [major, minor] = zodPkg.version.split(".").map(Number);
    assert.ok(
      major > 4 || (major === 4 && minor >= 2),
      `zod ${zodPkg.version} does not include z.fromJSONSchema() (requires >= 4.2). Bump zod or use an external library.`,
    );
  });
});

// --- Phase 0 extensions: lock the easy cases of the wrapper's contract ---
// These tests pin the simple structural behavior of z.fromJSONSchema() that
// the schema-to-zod wrapper (core/schema-to-zod.js) depends on. Per
// research-260603-2200-zod-description-passthrough.md, description passthrough
// works for required fields; this test pins the easy case. The optional-wrapper
// re-apply path (tested in __tests__/schema-to-zod.test.js) handles the hard
// case.
describe("z.fromJSONSchema() — Phase 0 extensions (TDD locks the contract)", () => {
  it("required field description is reachable via .description (regression-safety for wrapper)", () => {
    const zodSchema = z.fromJSONSchema({
      type: "object",
      properties: { name: { type: "string", description: "required name field" } },
      required: ["name"],
    });
    assert.strictEqual(zodSchema.shape.name.description, "required name field");
  });

  it("additionalProperties: false is enforced — rejects extras (regression-safety for 6-schema upgrade)", () => {
    const zodSchema = z.fromJSONSchema({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    });
    assert.throws(
      () => zodSchema.parse({ name: "ok", extra: "BOGUS" }),
      /unrecognized|extra|additional/i,
    );
  });
});
