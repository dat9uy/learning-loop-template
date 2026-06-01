import assert from "node:assert";
import { describe, it } from "node:test";
import { validateRecords } from "#mcp/core/record-validation-rules.js";
import { loadSchemas } from "#mcp/core/schema-loader.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function makeCandidateAssertion(id) {
  return {
    __file: `records/index/${id}.yaml`,
    id,
    schema_version: "1.0",
    type: "extracted-assertion",
    status: "candidate",
    assertion: "Test candidate assertion.",
    capability: "test-cap",
    dimension: "runtime",
    scope: "sandbox",
    topic_tag: "test-topic",
    n_count: 1,
    superseded_by: null,
    supersedes: [],
    source_refs: [],
    experiment_refs: [],
    extraction: {
      agent_run: "test-run",
      first_extracted_at: "2026-05-19T14:00:00Z",
      last_updated_at: "2026-05-19T14:00:00Z",
      evidence_immutable_hash: "sha256:abc123",
    },
  };
}

function makeActiveAssertion(id) {
  const r = makeCandidateAssertion(id);
  r.status = "active";
  return r;
}

function makeExperiment(id, refs) {
  return {
    __file: `records/meta/experiments/${id}.yaml`,
    id,
    schema_version: "1.0",
    type: "experiment",
    status: "draft",
    created_at: "2026-05-19T14:00:00Z",
    updated_at: "2026-05-19T14:00:00Z",
    source_refs: refs || [],
    evidence_refs: [],
    goal: "Test",
    hypothesis: "",
    method: [],
    success_metrics: [],
    result: "",
    agent_outcome: "",
    product_outcome: "",
    observations: [],
    promotion_review: [],
    verification: {
      claim_refs: ["record:claim-meta-260519T1400Z-dummy"],
      proves: [{ dimension: "runtime", scope: "sandbox", output_level: "metadata-only" }],
      requires_human_approval: true,
      approval_status: "not-required",
    },
    experiment_refs: [],
  };
}

function makeDummyClaim() {
  return {
    __file: "records/meta/claims/claim-meta-260519T1400Z-dummy.yaml",
    id: "claim-meta-260519T1400Z-dummy",
    schema_version: "1.0",
    type: "claim",
    status: "approved",
    created_at: "2026-05-19T14:00:00Z",
    updated_at: "2026-05-19T14:00:00Z",
    source_refs: [],
    subject: "test",
    claim: "Test claim",
    scope: "sandbox",
    confidence: "high",
    approval: {
      status: "approved",
      reviewer: "operator",
      reviewed_at: "2026-05-19T14:00:00Z",
    },
    verification: {
      runtime: {
        status: "verified",
        scope: "sandbox",
        output: "runtime-captured",
        reason: "Test reason",
        proof_refs: [],
      },
    },
    capability: "test-cap",
  };
}

function makeDecision(id, refs) {
  return {
    __file: `records/meta/decisions/${id}.yaml`,
    id,
    schema_version: "1.0",
    type: "decision",
    status: "draft",
    created_at: "2026-05-19T14:00:00Z",
    updated_at: "2026-05-19T14:00:00Z",
    source_refs: refs || [],
    evidence_refs: [],
    question: "Test?",
    decision: "Yes",
    rationale: "",
    alternatives: [],
    tradeoffs: [],
    supersedes: [],
    decision_effect: { action: "approve", scope: "product", affected_refs: [] },
  };
}

function makeRisk(id, refs) {
  return {
    __file: `records/meta/risks/${id}.yaml`,
    id,
    schema_version: "1.0",
    type: "risk",
    status: "active",
    created_at: "2026-05-19T14:00:00Z",
    updated_at: "2026-05-19T14:00:00Z",
    source_refs: refs || [],
    evidence_refs: [],
    risk_statement: "Test risk",
    category: "other",
    severity: "medium",
    likelihood: "medium",
    confidence: "medium",
  };
}

function makeClaim(id, refs) {
  return {
    __file: `records/meta/claims/${id}.yaml`,
    id,
    schema_version: "1.0",
    type: "claim",
    status: "approved",
    created_at: "2026-05-19T14:00:00Z",
    updated_at: "2026-05-19T14:00:00Z",
    source_refs: refs || [],
    subject: "test",
    claim: "Test claim",
    scope: "sandbox",
    confidence: "high",
    approval: {
      status: "approved",
      reviewer: "operator",
      reviewed_at: "2026-05-19T14:00:00Z",
    },
    verification: {
      runtime: {
        status: "verified",
        scope: "sandbox",
        output: "runtime-captured",
        reason: "Test reason",
        proof_refs: [],
      },
    },
    capability: "test-cap",
  };
}

describe("validateCandidateConsumption", () => {
  const schemas = loadSchemas(root);

  it("rejects experiment referencing candidate assertion", () => {
    const candidate = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    const dummyClaim = makeDummyClaim();
    const experiment = makeExperiment("experiment-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-test-topic",
    ]);
    const errors = validateRecords([candidate, dummyClaim, experiment], schemas, root);
    assert.ok(errors.some((e) => e.includes("candidate") && e.includes("assertion-cap-runtime-test-topic")), `errors: ${errors.join(" | ")}`);
  });

  it("allows experiment referencing active assertion", () => {
    const active = makeActiveAssertion("assertion-cap-runtime-active-topic");
    const dummyClaim = makeDummyClaim();
    const experiment = makeExperiment("experiment-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-active-topic",
    ]);
    const errors = validateRecords([active, dummyClaim, experiment], schemas, root);
    assert.ok(!errors.some((e) => e.includes("candidate")), `errors: ${errors.join(" | ")}`);
  });

  it("rejects decision referencing candidate assertion", () => {
    const candidate = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    const decision = makeDecision("decision-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-test-topic",
    ]);
    const errors = validateRecords([candidate, decision], schemas, root);
    assert.ok(errors.some((e) => e.includes("candidate") && e.includes("assertion-cap-runtime-test-topic")), `errors: ${errors.join(" | ")}`);
  });

  it("rejects risk referencing candidate assertion", () => {
    const candidate = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    const risk = makeRisk("risk-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-test-topic",
    ]);
    const errors = validateRecords([candidate, risk], schemas, root);
    assert.ok(errors.some((e) => e.includes("candidate") && e.includes("assertion-cap-runtime-test-topic")), `errors: ${errors.join(" | ")}`);
  });

  it("does NOT reject frozen-legacy claim referencing candidate assertion", () => {
    const candidate = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    const claim = makeClaim("claim-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-test-topic",
    ]);
    const errors = validateRecords([candidate, claim], schemas, root);
    assert.ok(!errors.some((e) => e.includes("candidate")), `errors: ${errors.join(" | ")}`);
  });

  it("does NOT reject candidate assertion referencing itself", () => {
    const candidate = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    // The candidate itself is not a product record; it should not be flagged.
    const errors = validateRecords([candidate], schemas, root);
    assert.ok(!errors.some((e) => e.includes("candidate")), `errors: ${errors.join(" | ")}`);
  });

  it("allows pending_approval assertion references", () => {
    const pending = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    pending.status = "pending_approval";
    const dummyClaim = makeDummyClaim();
    const experiment = makeExperiment("experiment-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-test-topic",
    ]);
    const errors = validateRecords([pending, dummyClaim, experiment], schemas, root);
    assert.ok(!errors.some((e) => e.includes("candidate")), `errors: ${errors.join(" | ")}`);
  });

  it("includes record file name in error message", () => {
    const candidate = makeCandidateAssertion("assertion-cap-runtime-test-topic");
    const dummyClaim = makeDummyClaim();
    const experiment = makeExperiment("experiment-meta-260519T1400Z-test", [
      "record:assertion-cap-runtime-test-topic",
    ]);
    const errors = validateRecords([candidate, dummyClaim, experiment], schemas, root);
    const candidateError = errors.find((e) => e.includes("candidate"));
    assert.ok(candidateError, `expected a candidate error, got: ${errors.join(" | ")}`);
    assert.ok(candidateError.includes("experiment-meta-260519T1400Z-test"), `error must name referencing record: ${candidateError}`);
  });
});
