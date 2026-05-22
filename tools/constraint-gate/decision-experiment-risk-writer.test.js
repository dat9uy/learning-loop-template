import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { createDecision, updateDecision, findDecisionById } from "./decision-writer.js";
import { createExperiment, updateExperiment, findExperimentById } from "./experiment-writer.js";
import { createRisk, updateRisk, findRiskById } from "./risk-writer.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "crud-writer-test-"));
}

// ─── Decision CRUD ───

describe("createDecision", () => {
  it("creates a decision record file", () => {
    const tmp = createTmpDir();
    const result = createDecision({ root: tmp, surface: "product", question: "Use MCP?", decision: "Yes, MCP owns all CRUD" });
    assert.equal(result.created, true);
    assert.ok(result.id.startsWith("decision-product-"));
    assert.ok(existsSync(result.path));
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.type, "decision");
    assert.equal(content.status, "draft");
    assert.equal(content.question, "Use MCP?");
    assert.equal(content.decision, "Yes, MCP owns all CRUD");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing question", () => {
    const tmp = createTmpDir();
    const result = createDecision({ root: tmp, surface: "product", decision: "Yes" });
    assert.equal(result.created, false);
    assert.equal(result.reason, "missing question");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing decision", () => {
    const tmp = createTmpDir();
    const result = createDecision({ root: tmp, surface: "product", question: "Q?" });
    assert.equal(result.created, false);
    assert.equal(result.reason, "missing decision");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("detects duplicate decisions", () => {
    const tmp = createTmpDir();
    createDecision({ root: tmp, surface: "product", question: "Q1?", decision: "Same decision" });
    const result = createDecision({ root: tmp, surface: "product", question: "Q2?", decision: "Same decision" });
    assert.equal(result.created, false);
    assert.equal(result.reason, "already_exists");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("uses surface-first directory layout", () => {
    const tmp = createTmpDir();
    const result = createDecision({ root: tmp, surface: "api", question: "Q?", decision: "D" });
    assert.ok(result.path.includes("records/api/decisions"));
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("updateDecision", () => {
  it("updates status and mutable fields", () => {
    const tmp = createTmpDir();
    const { id } = createDecision({ root: tmp, surface: "product", question: "Q?", decision: "D" });
    const result = updateDecision({ root: tmp, surface: "product", decision_id: id, updates: { status: "approved", rationale: "Tested and works" } });
    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.status, "approved");
    assert.equal(content.rationale, "Tested and works");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("preserves immutable fields", () => {
    const tmp = createTmpDir();
    const { id, path: filePath } = createDecision({ root: tmp, surface: "product", question: "Q?", decision: "D" });
    const original = parseYaml(readFileSync(filePath, "utf8"));
    updateDecision({ root: tmp, surface: "product", decision_id: id, updates: { id: "hacked", schema_version: "9.9", created_at: "2000-01-01" } });
    const after = parseYaml(readFileSync(filePath, "utf8"));
    assert.equal(after.id, original.id);
    assert.equal(after.schema_version, original.schema_version);
    assert.equal(after.created_at, original.created_at);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("findDecisionById", () => {
  it("finds existing decision", () => {
    const tmp = createTmpDir();
    const { id } = createDecision({ root: tmp, surface: "product", question: "Q?", decision: "D" });
    const found = findDecisionById({ root: tmp, surface: "product", decision_id: id });
    assert.ok(found);
    assert.equal(found.data.id, id);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null for missing decision", () => {
    const tmp = createTmpDir();
    const found = findDecisionById({ root: tmp, surface: "product", decision_id: "nonexistent" });
    assert.equal(found, null);
    rmSync(tmp, { recursive: true, force: true });
  });
});

// ─── Experiment CRUD ───

describe("createExperiment", () => {
  it("creates an experiment record file", () => {
    const tmp = createTmpDir();
    const result = createExperiment({ root: tmp, surface: "product", goal: "Verify MCP CRUD round-trips" });
    assert.equal(result.created, true);
    assert.ok(result.id.startsWith("experiment-product-"));
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.type, "experiment");
    assert.equal(content.status, "draft");
    assert.equal(content.goal, "Verify MCP CRUD round-trips");
    assert.equal(content.result, "");
    assert.equal(content.verification.requires_human_approval, true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing goal", () => {
    const tmp = createTmpDir();
    const result = createExperiment({ root: tmp, surface: "product" });
    assert.equal(result.created, false);
    assert.equal(result.reason, "missing goal");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("updateExperiment", () => {
  it("updates result and status", () => {
    const tmp = createTmpDir();
    const { id } = createExperiment({ root: tmp, surface: "product", goal: "Test goal" });
    const result = updateExperiment({ root: tmp, surface: "product", experiment_id: id, updates: { status: "reviewed", result: "Pass" } });
    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.status, "reviewed");
    assert.equal(content.result, "Pass");
    rmSync(tmp, { recursive: true, force: true });
  });
});

// ─── Risk CRUD ───

describe("createRisk", () => {
  it("creates a risk record file", () => {
    const tmp = createTmpDir();
    const result = createRisk({ root: tmp, surface: "product", risk_statement: "MCP server could fail to start" });
    assert.equal(result.created, true);
    assert.ok(result.id.startsWith("risk-product-"));
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.type, "risk");
    assert.equal(content.status, "draft");
    assert.equal(content.risk_statement, "MCP server could fail to start");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing risk_statement", () => {
    const tmp = createTmpDir();
    const result = createRisk({ root: tmp, surface: "product" });
    assert.equal(result.created, false);
    assert.ok(result.reason);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("defaults invalid category to 'other'", () => {
    const tmp = createTmpDir();
    const result = createRisk({ root: tmp, surface: "product", risk_statement: "R", category: "invalid-cat" });
    assert.equal(result.created, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.category, "other");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("accepts valid category", () => {
    const tmp = createTmpDir();
    const result = createRisk({ root: tmp, surface: "product", risk_statement: "R", category: "security" });
    assert.equal(result.created, true);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("updateRisk", () => {
  it("updates severity and status", () => {
    const tmp = createTmpDir();
    const { id } = createRisk({ root: tmp, surface: "product", risk_statement: "R" });
    const result = updateRisk({ root: tmp, surface: "product", risk_id: id, updates: { status: "active", severity: "high" } });
    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.status, "active");
    assert.equal(content.severity, "high");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("preserves immutable fields", () => {
    const tmp = createTmpDir();
    const { id, path: filePath } = createRisk({ root: tmp, surface: "product", risk_statement: "R" });
    const original = parseYaml(readFileSync(filePath, "utf8"));
    updateRisk({ root: tmp, surface: "product", risk_id: id, updates: { id: "hacked", created_at: "2000-01-01" } });
    const after = parseYaml(readFileSync(filePath, "utf8"));
    assert.equal(after.id, original.id);
    assert.equal(after.created_at, original.created_at);
    rmSync(tmp, { recursive: true, force: true });
  });
});
