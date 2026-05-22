import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  sanitizeSlug,
  generateTimestamp,
  generateRecordId,
  generateFilename,
  resolveRecordDir,
  atomicWriteYaml,
  findRecordById,
  updateRecordFile,
} from "./record-writer.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "record-writer-test-"));
}

describe("sanitizeSlug", () => {
  it("converts to kebab-case", () => {
    assert.equal(sanitizeSlug("MCP CRUD Ownership"), "mcp-crud-ownership");
  });

  it("strips path traversal", () => {
    assert.equal(sanitizeSlug("../../etc/evil"), "etc-evil");
  });

  it("strips leading slashes", () => {
    assert.equal(sanitizeSlug("/etc/passwd"), "etc-passwd");
  });

  it("returns null for empty string", () => {
    assert.equal(sanitizeSlug(""), null);
  });

  it("returns null for null", () => {
    assert.equal(sanitizeSlug(null), null);
  });
});

describe("generateTimestamp", () => {
  it("produces YYMMDDTHHmmZ format", () => {
    const ts = generateTimestamp();
    assert.match(ts, /^\d{6}T\d{4}Z$/);
  });
});

describe("generateRecordId", () => {
  it("includes type, surface, timestamp, slug", () => {
    const id = generateRecordId({ type: "decision", surface: "product", slug: "mcp-crud" });
    assert.ok(id.startsWith("decision-product-"));
    assert.ok(id.endsWith("-mcp-crud"));
  });

  it("works without surface", () => {
    const id = generateRecordId({ type: "decision", slug: "test" });
    assert.ok(id.startsWith("decision-"));
    assert.ok(id.endsWith("-test"));
  });

  it("works without slug", () => {
    const id = generateRecordId({ type: "risk", surface: "api" });
    assert.ok(id.startsWith("risk-api-"));
  });
});

describe("generateFilename", () => {
  it("appends .yaml", () => {
    const name = generateFilename({ type: "decision", surface: "product", slug: "test" });
    assert.ok(name.endsWith(".yaml"));
    assert.ok(name.startsWith("decision-product-"));
  });
});

describe("resolveRecordDir", () => {
  it("uses surface-first layout", () => {
    const dir = resolveRecordDir("/root", { type: "decision", surface: "product" });
    assert.equal(dir, "/root/records/product/decisions");
  });

  it("falls back to flat layout", () => {
    const dir = resolveRecordDir("/root", { type: "decision" });
    assert.equal(dir, "/root/records/decisions");
  });
});

describe("atomicWriteYaml", () => {
  it("creates a YAML file", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    const result = atomicWriteYaml(dirPath, "test.yaml", { id: "test-1", status: "draft" });
    assert.equal(result.written, true);
    assert.ok(existsSync(result.path));
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.id, "test-1");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("detects duplicates", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    atomicWriteYaml(dirPath, "dup.yaml", { id: "dup-1" });
    const result = atomicWriteYaml(dirPath, "dup.yaml", { id: "dup-2" });
    assert.equal(result.written, false);
    assert.equal(result.reason, "already_exists");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks path traversal", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    const result = atomicWriteYaml(dirPath, "../../etc/evil.yaml", { id: "evil" });
    assert.equal(result.written, false);
    assert.equal(result.reason, "path_traversal_blocked");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("findRecordById", () => {
  it("finds a record by ID", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, "test.yaml"), "id: decision-test-1\nstatus: draft\n");
    const found = findRecordById(dirPath, "decision-test-1");
    assert.ok(found);
    assert.equal(found.data.id, "decision-test-1");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null when not found", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    mkdirSync(dirPath, { recursive: true });
    const found = findRecordById(dirPath, "nonexistent");
    assert.equal(found, null);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null for missing directory", () => {
    const found = findRecordById("/nonexistent/path", "anything");
    assert.equal(found, null);
  });
});

describe("updateRecordFile", () => {
  it("updates mutable fields and preserves immutable ones", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    mkdirSync(dirPath, { recursive: true });
    const past = "2026-05-22T00:00:00Z";
    writeFileSync(
      join(dirPath, "test.yaml"),
      `id: decision-test-1\nschema_version: "1.0"\ntype: decision\nstatus: draft\ncreated_at: ${past}\nupdated_at: ${past}\nsource_refs: []\nquestion: Q?\ndecision: D\n`
    );
    const result = updateRecordFile(dirPath, "decision-test-1", { status: "reviewed", decision: "D2" });
    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.status, "reviewed");
    assert.equal(content.decision, "D2");
    assert.equal(content.id, "decision-test-1");
    assert.equal(content.created_at, past);
    assert.equal(content.schema_version, "1.0");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns not_found for missing ID", () => {
    const tmp = createTmpDir();
    const dirPath = join(tmp, "records", "product", "decisions");
    mkdirSync(dirPath, { recursive: true });
    const result = updateRecordFile(dirPath, "nonexistent", { status: "reviewed" });
    assert.equal(result.updated, false);
    assert.equal(result.reason, "not_found");
    rmSync(tmp, { recursive: true, force: true });
  });
});
