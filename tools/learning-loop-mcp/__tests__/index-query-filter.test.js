import { describe, it } from "node:test";
import assert from "node:assert";
import { searchIndex } from "#mcp/core/search-index.js";
import { listVerifiedClaims } from "#mcp/core/list-verified.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), "query-filter-test-"));
  mkdirSync(join(tmp, "records", "product", "index"), { recursive: true });
  return tmp;
}

function writeIndex(tmp, surface, name, content) {
  const dir = join(tmp, "records", surface, "index");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

function candidateEntry(id, capability) {
  return `id: ${id}
schema_version: "1.0"
type: extracted-assertion
status: candidate
assertion: "Test candidate."
capability: ${capability}
dimension: runtime
scope: sandbox
topic_tag: test-topic
n_count: 1
superseded_by: null
supersedes: []
source_refs: []
experiment_refs: []
extraction:
  agent_run: run-1
  first_extracted_at: "2026-05-19T17:00:00Z"
  last_updated_at: "2026-05-19T17:00:00Z"
  evidence_immutable_hash: sha256:abc
`;
}

function activeEntry(id, capability) {
  return `id: ${id}
schema_version: "1.0"
type: extracted-assertion
status: active
assertion: "Test active."
capability: ${capability}
dimension: runtime
scope: sandbox
topic_tag: test-topic
n_count: 1
superseded_by: null
supersedes: []
source_refs: []
experiment_refs: []
extraction:
  agent_run: run-1
  first_extracted_at: "2026-05-19T17:00:00Z"
  last_updated_at: "2026-05-19T17:00:00Z"
  evidence_immutable_hash: sha256:abc
`;
}

describe("searchIndex candidate filter", () => {
  let tmp;

  it("excludes candidate entries by default", () => {
    tmp = makeTmpProject();
    writeIndex(tmp, "product", "assertion-cap-runtime-candidate.yaml", candidateEntry("assertion-cap-runtime-candidate", "cap"));
    writeIndex(tmp, "product", "assertion-cap-runtime-active.yaml", activeEntry("assertion-cap-runtime-active", "cap"));

    const results = searchIndex(tmp, {});
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes("assertion-cap-runtime-active"), "active should be included");
    assert.ok(!ids.includes("assertion-cap-runtime-candidate"), "candidate should be excluded by default");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("includes candidate entries when explicitly requested", () => {
    tmp = makeTmpProject();
    writeIndex(tmp, "product", "assertion-cap-runtime-candidate.yaml", candidateEntry("assertion-cap-runtime-candidate", "cap"));
    writeIndex(tmp, "product", "assertion-cap-runtime-active.yaml", activeEntry("assertion-cap-runtime-active", "cap"));

    const results = searchIndex(tmp, {}, false);
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes("assertion-cap-runtime-active"), "active should be included");
    assert.ok(ids.includes("assertion-cap-runtime-candidate"), "candidate should be included when excludeCandidates=false");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("includes candidate when status: candidate is explicitly requested", () => {
    tmp = makeTmpProject();
    writeIndex(tmp, "product", "assertion-cap-runtime-candidate.yaml", candidateEntry("assertion-cap-runtime-candidate", "cap"));
    writeIndex(tmp, "product", "assertion-cap-runtime-active.yaml", activeEntry("assertion-cap-runtime-active", "cap"));

    const results = searchIndex(tmp, { status: "candidate" }, true);
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes("assertion-cap-runtime-candidate"), "candidate should be included when status=candidate explicitly requested");
    assert.ok(!ids.includes("assertion-cap-runtime-active"), "active should be excluded when status=candidate");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("excludes candidate by default even with capability filter", () => {
    tmp = makeTmpProject();
    writeIndex(tmp, "product", "assertion-cap-runtime-candidate.yaml", candidateEntry("assertion-cap-runtime-candidate", "cap"));
    writeIndex(tmp, "product", "assertion-cap-runtime-active.yaml", activeEntry("assertion-cap-runtime-active", "cap"));

    const results = searchIndex(tmp, { capability: "cap" });
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes("assertion-cap-runtime-active"), "active should be included");
    assert.ok(!ids.includes("assertion-cap-runtime-candidate"), "candidate should be excluded by default");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("listVerifiedClaims candidate filter", () => {
  let tmp;

  it("excludes candidate entries by default", () => {
    tmp = makeTmpProject();
    mkdirSync(join(tmp, "records", "product", "evidence"), { recursive: true });
    writeFileSync(
      join(tmp, "records", "product", "evidence", "test.md"),
      `---
capability: cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Test
## Findings
- [test-topic] Assertion.
`
    );
    writeIndex(tmp, "product", "assertion-cap-runtime-candidate.yaml", candidateEntry("assertion-cap-runtime-candidate", "cap"));
    writeIndex(tmp, "product", "assertion-cap-runtime-active.yaml", activeEntry("assertion-cap-runtime-active", "cap"));

    const result = listVerifiedClaims(tmp);
    const assertionIds = (result.assertions || []).map((a) => a.id);
    assert.ok(assertionIds.includes("assertion-cap-runtime-active"), "active should be included");
    assert.ok(!assertionIds.includes("assertion-cap-runtime-candidate"), "candidate should be excluded by default");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("includes candidate entries when includeCandidates=true", () => {
    tmp = makeTmpProject();
    mkdirSync(join(tmp, "records", "product", "evidence"), { recursive: true });
    writeFileSync(
      join(tmp, "records", "product", "evidence", "test.md"),
      `---
capability: cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Test
## Findings
- [test-topic] Assertion.
`
    );
    writeIndex(tmp, "product", "assertion-cap-runtime-candidate.yaml", candidateEntry("assertion-cap-runtime-candidate", "cap"));
    writeIndex(tmp, "product", "assertion-cap-runtime-active.yaml", activeEntry("assertion-cap-runtime-active", "cap"));

    const result = listVerifiedClaims(tmp, true);
    const assertionIds = (result.assertions || []).map((a) => a.id);
    assert.ok(assertionIds.includes("assertion-cap-runtime-active"), "active should be included");
    assert.ok(assertionIds.includes("assertion-cap-runtime-candidate"), "candidate should be included when includeCandidates=true");
    rmSync(tmp, { recursive: true, force: true });
  });
});
