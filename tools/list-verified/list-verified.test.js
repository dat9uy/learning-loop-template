import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listVerifiedClaims } from "./list-verified.js";

function createTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), "list-verified-test-"));
  mkdirSync(join(tmp, "records", "claims"), { recursive: true });
  mkdirSync(join(tmp, "records", "evidence"), { recursive: true });
  return tmp;
}

describe("listVerifiedClaims", () => {
  let tmp;
  beforeEach(() => {
    tmp = createTmpProject();
  });

  it("returns empty when no claims or evidence", () => {
    const result = listVerifiedClaims(tmp);
    assert.equal(result.claims.length, 0);
    assert.equal(result.evidence.length, 0);
  });

  it("finds verified claims", () => {
    writeFileSync(
      join(tmp, "records", "claims", "claim-1.yaml"),
      `id: claim-1\napproval:\n  status: approved\nsubject: Test Claim\nverification:\n  static:\n    status: verified\n    reason: tested\n`
    );
    const result = listVerifiedClaims(tmp);
    assert.equal(result.claims.length, 1);
    assert.equal(result.claims[0].id, "claim-1");
    assert.deepEqual(result.claims[0].verified_dimensions, ["static"]);
  });

  it("ignores non-approved claims", () => {
    writeFileSync(
      join(tmp, "records", "claims", "claim-2.yaml"),
      `id: claim-2\napproval:\n  status: pending\nsubject: Pending Claim\nverification:\n  static:\n    status: verified\n    reason: tested\n`
    );
    const result = listVerifiedClaims(tmp);
    assert.equal(result.claims.length, 0);
  });

  it("ignores claims without verified dimensions", () => {
    writeFileSync(
      join(tmp, "records", "claims", "claim-3.yaml"),
      `id: claim-3\napproval:\n  status: approved\nsubject: Unverified Claim\nverification:\n  static:\n    status: claimed\n    reason: not yet\n`
    );
    const result = listVerifiedClaims(tmp);
    assert.equal(result.claims.length, 0);
  });

  it("maps evidence correctly", () => {
    writeFileSync(
      join(tmp, "records", "evidence", "ev-1.md"),
      `---\ncapability: api\ndimension: static\nscope: unit\nvalidation_status: passed\nclaim_support: supports\n---\nSome evidence.\n`
    );
    const result = listVerifiedClaims(tmp);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].capability, "api");
    assert.equal(result.evidence[0].dimension, "static");
    assert.equal(result.evidence[0].status, "passed");
  });

  it("skips evidence without claim_support", () => {
    writeFileSync(
      join(tmp, "records", "evidence", "ev-2.md"),
      `---\ncapability: api\ndimension: static\nscope: unit\nvalidation_status: passed\n---\nSome evidence.\n`
    );
    const result = listVerifiedClaims(tmp);
    assert.equal(result.evidence.length, 0);
  });

  it("skips evidence without frontmatter", () => {
    writeFileSync(join(tmp, "records", "evidence", "ev-3.md"), `No frontmatter here.\n`);
    const result = listVerifiedClaims(tmp);
    assert.equal(result.evidence.length, 0);
  });
});
