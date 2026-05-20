import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  sanitizeSlug,
  generateFilename,
  generateObservationId,
  buildObservationYaml,
  writeObservation,
  updateObservation,
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

describe("updateObservation", () => {
  it("toggles status from active to inactive", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-test.yaml"),
      `id: obs-test-active\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${past}\nupdated_at: ${past}\nconstraint_type: test\nconstraint: test-toggle\nnotes: original`
    );

    const result = updateObservation({
      root: tmp,
      observation_id: "obs-test-active",
      status: "inactive",
    });

    assert.equal(result.updated, true);
    assert.equal(result.id, "obs-test-active");

    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.status, "inactive");

    rmSync(tmp, { recursive: true, force: true });
  });

  it("toggles status from inactive to active", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-test.yaml"),
      `id: obs-test-inactive\nschema_version: "1.0"\ntype: observation\nstatus: inactive\ncreated_at: ${past}\nupdated_at: ${past}\nconstraint_type: test\nconstraint: test-reactivate\nnotes: original`
    );

    const result = updateObservation({
      root: tmp,
      observation_id: "obs-test-inactive",
      status: "active",
    });

    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.status, "active");

    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns not_found when observation does not exist", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const result = updateObservation({
      root: tmp,
      observation_id: "obs-missing",
      status: "inactive",
    });

    assert.equal(result.updated, false);
    assert.equal(result.reason, "not_found");

    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects invalid status values", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-test.yaml"),
      `id: obs-test-invalid\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${past}\nupdated_at: ${past}\nconstraint_type: test\nconstraint: test-invalid\nnotes: original`
    );

    const result = updateObservation({
      root: tmp,
      observation_id: "obs-test-invalid",
      status: "deleted",
    });

    assert.equal(result.updated, false);
    assert.equal(result.reason, "invalid_status");

    rmSync(tmp, { recursive: true, force: true });
  });

  it("updates updated_at timestamp", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const oldTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-test.yaml"),
      `id: obs-test-time\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${oldTime}\nupdated_at: ${oldTime}\nconstraint_type: test\nconstraint: test-time\nnotes: original`
    );

    const before = Date.now();
    const result = updateObservation({
      root: tmp,
      observation_id: "obs-test-time",
      status: "inactive",
    });
    const after = Date.now();

    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    const updatedTime = new Date(content.updated_at).getTime();
    assert.ok(updatedTime >= before - 1000);
    assert.ok(updatedTime <= after + 1000);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects symlinked observation files", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const realFile = join(tmp, "real-obs.yaml");
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      realFile,
      `id: obs-test-symlink\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${past}\nupdated_at: ${past}\nconstraint_type: test\nconstraint: test-symlink\nnotes: original`
    );
    // Create symlink inside observations dir pointing outside
    const symlinkPath = join(obsDir, "observation-symlink.yaml");
    let hasSymlink = false;
    try {
      symlinkSync(realFile, symlinkPath);
      hasSymlink = true;
    } catch {
      // skip if platform does not support symlinks
    }

    if (hasSymlink) {
      const result = updateObservation({
        root: tmp,
        observation_id: "obs-test-symlink",
        status: "inactive",
      });

      assert.equal(result.updated, false);
      // Symlinked file should be skipped during scan
      assert.equal(result.reason, "not_found");
    }

    rmSync(tmp, { recursive: true, force: true });
  });

  it("preserves all fields except status, updated_at, and notes", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-test.yaml"),
      `id: obs-test-preserve\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${past}\nupdated_at: ${past}\nsource_refs:\n  - record:test\nnotes: original\nconstraint_type: test\nconstraint: test-preserve`
    );

    const result = updateObservation({
      root: tmp,
      observation_id: "obs-test-preserve",
      status: "archived",
      reason: "test reason",
    });

    assert.equal(result.updated, true);
    const content = parseYaml(readFileSync(result.path, "utf8"));
    assert.equal(content.id, "obs-test-preserve");
    assert.equal(content.schema_version, "1.0");
    assert.equal(content.type, "observation");
    assert.equal(content.status, "archived");
    assert.equal(content.created_at, past);
    assert.deepEqual(content.source_refs, ["record:test"]);
    assert.equal(content.constraint_type, "test");
    assert.equal(content.constraint, "test-preserve");
    // Notes should be appended with reason
    assert.ok(content.notes.includes("original"));
    assert.ok(content.notes.includes("test reason"));

    rmSync(tmp, { recursive: true, force: true });
  });
});
