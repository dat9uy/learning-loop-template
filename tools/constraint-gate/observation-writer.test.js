import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  sanitizeSlug,
  generateFilename,
  generateObservationId,
  buildObservationYaml,
  writeObservation,
} from "./observation-writer.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "obs-writer-test-"));
}

describe("sanitizeSlug", () => {
  it("converts to kebab-case", () => {
    assert.equal(sanitizeSlug("Docker stale mount"), "docker-stale-mount");
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

  it("handles special characters", () => {
    assert.equal(sanitizeSlug("sudo requirement!"), "sudo-requirement");
  });
});

describe("generateFilename", () => {
  it("generates correct filename", () => {
    assert.equal(generateFilename("Docker stale mount"), "observation-docker-stale-mount.yaml");
  });

  it("generates from sudo requirement", () => {
    assert.equal(generateFilename("sudo requirement"), "observation-sudo-requirement.yaml");
  });

  it("strips traversal from filename", () => {
    assert.equal(generateFilename("../../etc/evil"), "observation-etc-evil.yaml");
  });
});

describe("generateObservationId", () => {
  it("generates id with obs- prefix", () => {
    const id = generateObservationId();
    assert.ok(id.startsWith("obs-"));
  });

  it("generates unique ids", () => {
    const id1 = generateObservationId();
    const id2 = generateObservationId();
    assert.notEqual(id1, id2);
  });
});

describe("buildObservationYaml", () => {
  it("builds object with all required fields", () => {
    const obs = buildObservationYaml({
      constraint_type: "sudo",
      constraint: "cleanup_requires_sudo",
      description: "Cleanup requires sudo",
      source_refs: ["record:test"],
    });
    assert.equal(obs.schema_version, "1.0");
    assert.equal(obs.type, "observation");
    assert.equal(obs.status, "active");
    assert.ok(obs.id.startsWith("obs-"));
    assert.ok(obs.created_at);
    assert.ok(obs.updated_at);
    assert.deepEqual(obs.source_refs, ["record:test"]);
    assert.equal(obs.constraint_type, "sudo");
    assert.equal(obs.constraint, "cleanup_requires_sudo");
    assert.equal(obs.notes, "Cleanup requires sudo");
  });

  it("uses provided source_refs", () => {
    const obs = buildObservationYaml({
      constraint_type: "docker",
      constraint: "stale_mount",
      description: "test",
      source_refs: ["local:test", "record:ref-1"],
    });
    assert.deepEqual(obs.source_refs, ["local:test", "record:ref-1"]);
  });
});

describe("writeObservation", () => {
  it("creates observation file", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const result = writeObservation({
      root: tmp,
      constraint_type: "sudo",
      constraint: "cleanup_requires_sudo",
      description: "Cleanup requires sudo",
      source_refs: ["record:test"],
    });

    assert.equal(result.recorded, true);
    assert.ok(result.id.startsWith("obs-"));
    assert.ok(result.path.endsWith(".yaml"));
    assert.ok(existsSync(result.path));

    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.constraint_type, "sudo");
    assert.equal(content.type, "observation");

    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects duplicate observation", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const params = {
      root: tmp,
      constraint_type: "sudo",
      constraint: "cleanup_requires_sudo",
      description: "Cleanup requires sudo",
      source_refs: ["record:test"],
    };

    const first = writeObservation(params);
    assert.equal(first.recorded, true);

    const second = writeObservation(params);
    assert.equal(second.recorded, false);
    assert.equal(second.reason, "already_exists");
    assert.ok(second.existing_id);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks path traversal", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const result = writeObservation({
      root: tmp,
      constraint_type: "sudo",
      constraint: "../../etc/evil",
      description: "evil",
      source_refs: ["record:test"],
    });

    // Should write to observation-etc-evil.yaml, not escape directory
    assert.equal(result.recorded, true);
    assert.ok(result.path.includes("records/observations/observation-etc-evil.yaml"));

    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing constraint_type", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const result = writeObservation({
      root: tmp,
      constraint: "test",
      description: "test",
      source_refs: ["record:test"],
    });

    assert.equal(result.recorded, false);
    assert.ok(result.reason);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing constraint", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const result = writeObservation({
      root: tmp,
      constraint_type: "sudo",
      description: "test",
      source_refs: ["record:test"],
    });

    assert.equal(result.recorded, false);
    assert.ok(result.reason);

    rmSync(tmp, { recursive: true, force: true });
  });
});
