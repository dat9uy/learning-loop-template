import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { computeHash } from "#mcp/core/extract-index/hash-computer.js";
import { buildIndexEntry } from "#mcp/core/extract-index/index-entry-builder.js";
import { runExtraction } from "#mcp/core/extract-index/extract-index.js";
import { loadSchemas } from "#mcp/core/schema-loader.js";
import { validateRecords } from "#mcp/core/record-validation-rules.js";

const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const extractIndexPath = join(root, "tools", "extract-index-cli.js");

function runWithCode(args) {
  try {
    const stdout = execSync(`node ${extractIndexPath} ${args}`, { encoding: "utf8", cwd: root });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

function makeTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), "extract-index-test-"));
  mkdirSync(join(tmp, "records", "evidence", "test"), { recursive: true });
  mkdirSync(join(tmp, "records", "experiments"), { recursive: true });
  mkdirSync(join(tmp, "records", "index"), { recursive: true });
  mkdirSync(join(tmp, "records", "claims"), { recursive: true });
  mkdirSync(join(tmp, "records", "product", "index"), { recursive: true });
  mkdirSync(join(tmp, "records", "product", "claims"), { recursive: true });
  return tmp;
}

function writeEvidence(tmp, relPath, content) {
  writeFileSync(join(tmp, "records", "evidence", relPath), content);
}

function writeExperiment(tmp, name, content) {
  writeFileSync(join(tmp, "records", "experiments", name), content);
}

function writeIndex(tmp, name, content) {
  writeFileSync(join(tmp, "records", "index", name), content);
}

function writeClaim(tmp, name, content) {
  writeFileSync(join(tmp, "records", "claims", name), content);
}

describe("hash-computer", () => {
  it("produces deterministic sha256:<hex>", () => {
    const h1 = computeHash(Buffer.from("hello"));
    const h2 = computeHash(Buffer.from("hello"));
    assert.strictEqual(h1, h2);
    assert.match(h1, /^sha256:[a-f0-9]{64}$/);
  });

  it("rejects non-Buffer input", () => {
    assert.throws(() => computeHash("hello"), /Buffer/);
  });
});

describe("index-entry-builder", () => {
  it("maps passed to active", () => {
    const entry = buildIndexEntry({
      finding: { topicTag: "tag", assertion: "A.", context: null, caveats: [], lineAnchor: "L1", bulletIndex: 1 },
      meta: { capability: "cap", dimension: "runtime", scope: "s", validation_status: "passed" },
      evidencePath: "records/evidence/test.md",
      hash: "sha256:abc",
      sourceRefs: [{ file: "local:records/evidence/test.md", section: "## Findings", bullet_index: 1, line_anchor: "L1" }],
      nCount: 1,
      experimentMap: new Map(),
      agentRun: "run-1",
      firstExtractedAt: "2026-05-19T17:00:00Z",
      lastUpdatedAt: "2026-05-19T17:00:00Z",
    });
    assert.strictEqual(entry.status, "active");
    assert.strictEqual(entry.schema_version, "1.0");
    assert.strictEqual(entry.type, "extracted-assertion");
    assert.strictEqual(entry.id, "assertion-cap-runtime-tag");
    assert.strictEqual(entry.n_count, 1);
  });

  it("returns null for failed validation_status", () => {
    const entry = buildIndexEntry({
      finding: { topicTag: "tag", assertion: "A.", context: null, caveats: [], lineAnchor: "L1", bulletIndex: 1 },
      meta: { capability: "cap", dimension: "runtime", scope: "s", validation_status: "failed" },
      evidencePath: "records/evidence/test.md",
      hash: "sha256:abc",
      sourceRefs: [],
      nCount: 0,
      experimentMap: new Map(),
      agentRun: "run-1",
      firstExtractedAt: "2026-05-19T17:00:00Z",
      lastUpdatedAt: "2026-05-19T17:00:00Z",
    });
    assert.strictEqual(entry, null);
  });
});

describe("extract-index gotchas", () => {
  let tmp;

  before(() => {
    tmp = makeTmpProject();
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("suggests missing frontmatter fields from siblings", () => {
    writeEvidence(tmp, "test/sibling.md", "---\ncapability: foo-cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Sibling\n");
    writeEvidence(tmp, "test/bad.md", "---\nscope: sandbox\nvalidation_status: passed\n---\n# Bad\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("capability") && e.includes("foo-cap")));
    assert.ok(result.errors.some((e) => e.includes("dimension") && e.includes("runtime")));
  });

  it("skips failed validation_status without error", () => {
    writeEvidence(tmp, "test/failed.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: failed\n---\n# Failed\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(!result.errors.some((e) => e.includes("failed.md")));
    assert.strictEqual(result.stats.filesWithFindings, 0);
  });

  it("errors on invalid validation_status and does not crash", () => {
    writeEvidence(tmp, "test/bad-status.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: pass\n---\n# Bad\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("bad-status.md") && e.includes("validation_status")));
    assert.strictEqual(result.stats.filesWithFindings, 0);
  });

  it("errors on invalid capability format", () => {
    writeEvidence(tmp, "test/bad-cap.md", "---\ncapability: ../../escape\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Bad\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("bad-cap.md") && e.includes("capability must match")));
  });

  it("errors on invalid dimension", () => {
    writeEvidence(tmp, "test/bad-dim.md", "---\ncapability: cap\ndimension: bad\nscope: sandbox\nvalidation_status: passed\n---\n# Bad\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("bad-dim.md") && e.includes("dimension must be one of")));
  });

  it("hard-stops on supersession without disproof note", () => {
    writeIndex(tmp, "assertion-cap-runtime-tag.yaml", `id: assertion-cap-runtime-tag\nschema_version: "1.0"\ntype: extracted-assertion\nstatus: active\nassertion: Old text.\ncapability: cap\ndimension: runtime\nscope: sandbox\ntopic_tag: tag\nn_count: 1\nsuperseded_by: null\nsupersedes: []\nsource_refs: []\nexperiment_refs: []\nextraction:\n  agent_run: run-1\n  first_extracted_at: "2026-05-19T17:00:00Z"\n  last_updated_at: "2026-05-19T17:00:00Z"\n  evidence_immutable_hash: sha256:old\n`);
    writeEvidence(tmp, "test/supersede.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Supersede\n## Findings\n- [tag] New text.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("Supersession hard-stop")));
  });

  it("allows supersession when disproof note confirms", () => {
    writeEvidence(tmp, "test/disproof.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Disproof\n## Findings\n- [tag] New text.\n## Confirmation / Disproof Notes\n- Disproves assertion-cap-runtime-tag\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("Supersession detected")));
  });

  it("ignores corrupt existing index with warning", () => {
    writeIndex(tmp, "corrupt.yaml", "this is not: valid yaml: : :");
    writeEvidence(tmp, "test/valid.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Valid\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(!result.errors.some((e) => e.includes("corrupt")));
    assert.strictEqual(result.stats.entriesProduced, 1);
  });

  it("warns on malformed experiment without blocking", () => {
    writeExperiment(tmp, "bad-experiment.yaml", "not: valid: : :");
    writeEvidence(tmp, "test/valid.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Valid\n## Findings\n- [tag] Assertion.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.strictEqual(result.stats.entriesProduced, 1);
  });
});

describe("supersession write-back", () => {
  function writeOldEntry(tmp, id, hash) {
    writeIndex(tmp, `${id}.yaml`, `id: ${id}\nschema_version: "1.0"\ntype: extracted-assertion\nstatus: active\nassertion: Old text.\ncapability: cap\ndimension: runtime\nscope: sandbox\ntopic_tag: tag-old\nn_count: 1\nsuperseded_by: null\nsupersedes: []\nsource_refs: []\nexperiment_refs: []\nextraction:\n  agent_run: run-1\n  first_extracted_at: "2026-05-19T17:00:00Z"\n  last_updated_at: "2026-05-19T17:00:00Z"\n  evidence_immutable_hash: sha256:${hash}\n`);
  }

  it("writes supersedes link on new entry when disproof note names old assertion-id", () => {
    const tmp = makeTmpProject();
    writeOldEntry(tmp, "assertion-cap-runtime-tag-old", "old");
    writeEvidence(tmp, "test/new.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# New\n## Findings\n- [tag-new] New text.\n## Confirmation / Disproof Notes\n- Disproves assertion-cap-runtime-tag-old\n");
    const result = runExtraction(tmp, { dryRun: false, verbose: false });
    const newYaml = parseYaml(readFileSync(join(tmp, "records", "product", "index", "assertion-cap-runtime-tag-new.yaml"), "utf8"));
    assert.deepStrictEqual(newYaml.supersedes, ["assertion-cap-runtime-tag-old"], `expected supersedes link, errors: ${result.errors.join(" | ")}`);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes superseded_by link on old entry when new disproof references it", () => {
    const tmp = makeTmpProject();
    writeOldEntry(tmp, "assertion-cap-runtime-tag-old", "old");
    writeEvidence(tmp, "test/new.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# New\n## Findings\n- [tag-new] New text.\n## Confirmation / Disproof Notes\n- Disproves assertion-cap-runtime-tag-old\n");
    runExtraction(tmp, { dryRun: false, verbose: false });
    const oldYaml = parseYaml(readFileSync(join(tmp, "records", "product", "index", "assertion-cap-runtime-tag-old.yaml"), "utf8"));
    assert.strictEqual(oldYaml.superseded_by, "assertion-cap-runtime-tag-new");
    assert.strictEqual(oldYaml.status, "superseded");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("hard-stops when assertion text changes without disproof note", () => {
    const tmp = makeTmpProject();
    writeIndex(tmp, "assertion-cap-runtime-tag.yaml", `id: assertion-cap-runtime-tag\nschema_version: "1.0"\ntype: extracted-assertion\nstatus: active\nassertion: Old text.\ncapability: cap\ndimension: runtime\nscope: sandbox\ntopic_tag: tag\nn_count: 1\nsuperseded_by: null\nsupersedes: []\nsource_refs: []\nexperiment_refs: []\nextraction:\n  agent_run: run-1\n  first_extracted_at: "2026-05-19T17:00:00Z"\n  last_updated_at: "2026-05-19T17:00:00Z"\n  evidence_immutable_hash: sha256:old\n`);
    writeEvidence(tmp, "test/rewrite.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Rewrite\n## Findings\n- [tag] Rewritten text.\n");
    const before = readFileSync(join(tmp, "records", "index", "assertion-cap-runtime-tag.yaml"), "utf8");
    const result = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("Supersession hard-stop")));
    const after = readFileSync(join(tmp, "records", "index", "assertion-cap-runtime-tag.yaml"), "utf8");
    assert.strictEqual(before, after, "old entry must not be mutated on hard-stop");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("hard-stops when disproof note names non-existent assertion-id", () => {
    const tmp = makeTmpProject();
    writeEvidence(tmp, "test/orphan.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Orphan\n## Findings\n- [tag-new] New text.\n## Confirmation / Disproof Notes\n- Disproves assertion-cap-runtime-missing-id\n");
    const result = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.ok(result.errors.some((e) => e.includes("assertion-cap-runtime-missing-id") && /non-existent|orphan/i.test(e)), `expected orphan error, got: ${result.errors.join(" | ")}`);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("frozen-claim drift", () => {
  function claimYaml({ id, capability, claimText, notes, dimReason }) {
    const notesLine = notes ? `notes: ${JSON.stringify(notes)}\n` : "";
    return `id: ${id}\nschema_version: "1.0"\ntype: claim\nstatus: approved\ncreated_at: "2026-05-01T00:00:00Z"\nupdated_at: "2026-05-01T00:00:00Z"\nsource_refs: []\n${notesLine}subject: "test"\nclaim: ${JSON.stringify(claimText)}\nscope: sandbox\nconfidence: high\napproval:\n  status: approved\n  reviewer: operator\n  reviewed_at: "2026-05-01T00:00:00Z"\nverification:\n  runtime:\n    status: verified\n    scope: sandbox\n    output: runtime-captured\n    reason: ${JSON.stringify(dimReason)}\n    proof_refs: []\ncapability: ${capability}\n`;
  }

  it("hard-stops when new entry contradicts frozen claim without supersession note", () => {
    const tmp = makeTmpProject();
    writeClaim(tmp, "claim-x.yaml", claimYaml({
      id: "claim-x",
      capability: "cap",
      claimText: "Thing-x is required.",
      notes: null,
      dimReason: "Thing-x required for capability cap.",
    }));
    writeEvidence(tmp, "test/contradict.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Contradict\n## Findings\n- [thing-x-not-required] Thing-x is no longer required.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(
      result.errors.some((e) => e.includes("claim-x") && e.includes("assertion-cap-runtime-thing-x-not-required")),
      `expected drift error naming both records, got: ${result.errors.join(" | ")}`
    );
    rmSync(tmp, { recursive: true, force: true });
  });

  it("passes when frozen claim notes already record supersession", () => {
    const tmp = makeTmpProject();
    writeClaim(tmp, "claim-x.yaml", claimYaml({
      id: "claim-x",
      capability: "cap",
      claimText: "Thing-x is required.",
      notes: "SUPERSEDED by experiment-2026-05-15. Thing-x no longer required.",
      dimReason: "Thing-x required.",
    }));
    writeEvidence(tmp, "test/resolved.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Resolved\n## Findings\n- [thing-x-not-required] Thing-x is no longer required.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(
      !result.errors.some((e) => /drift/i.test(e)),
      `expected no drift error, got: ${result.errors.join(" | ")}`
    );
    rmSync(tmp, { recursive: true, force: true });
  });

  it("does not hard-stop on unrelated frozen claims", () => {
    const tmp = makeTmpProject();
    writeClaim(tmp, "claim-other.yaml", claimYaml({
      id: "claim-other",
      capability: "other-cap",
      claimText: "Y is required.",
      notes: null,
      dimReason: "Y required.",
    }));
    writeEvidence(tmp, "test/unrelated.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Unrelated\n## Findings\n- [z-not-required] Z is not required.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    assert.ok(
      !result.errors.some((e) => /drift/i.test(e)),
      `expected no drift error for unrelated capability, got: ${result.errors.join(" | ")}`
    );
    rmSync(tmp, { recursive: true, force: true });
  });

  it("names both records in drift error message", () => {
    const tmp = makeTmpProject();
    writeClaim(tmp, "claim-y.yaml", claimYaml({
      id: "claim-y",
      capability: "cap",
      claimText: "Header-injection is required.",
      notes: null,
      dimReason: "Header-injection required for cap.",
    }));
    writeEvidence(tmp, "test/contradict2.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Contradict2\n## Findings\n- [header-injection-not-required] Header-injection is no longer required.\n");
    const result = runExtraction(tmp, { dryRun: true, verbose: false });
    const driftErr = result.errors.find((e) => /drift/i.test(e));
    assert.ok(driftErr, `expected a drift error, got: ${result.errors.join(" | ")}`);
    assert.ok(driftErr.includes("claim-y"), `error must name claim-y: ${driftErr}`);
    assert.ok(driftErr.includes("assertion-cap-runtime-header-injection-not-required"), `error must name new assertion: ${driftErr}`);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("extract-index round-trip", () => {
  let tmp;

  before(() => {
    tmp = makeTmpProject();
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("produces schema-valid index YAML from evidence", () => {
    writeEvidence(tmp, "test/roundtrip.md", `---\ncapability: test-cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Roundtrip\n## Findings\n- [test-topic] The system handles errors gracefully.\n  Context: Observed during sandbox testing.\n  Caveat: Only tested with small inputs.\n`);
    const result = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.stats.entriesProduced, 1);

    const indexFiles = readdirSync(join(tmp, "records", "product", "index")).filter((f) => f.endsWith(".yaml"));
    assert.strictEqual(indexFiles.length, 1);

    const yamlText = readFileSync(join(tmp, "records", "product", "index", indexFiles[0]), "utf8");
    const record = parseYaml(yamlText);
    record.__file = `records/product/index/${indexFiles[0]}`;

    const schemas = loadSchemas(root);
    const errors = validateRecords([record], schemas, tmp);
    assert.deepStrictEqual(errors, [], `schema errors: ${errors.join(", ")}`);
  });

  it("omits context when evidence has no Context nested bullet", () => {
    writeEvidence(tmp, "test/no-context.md", `---\ncapability: test-cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# No Context\n## Findings\n- [no-ctx-topic] The assertion text.\n`);
    const result = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.strictEqual(result.errors.length, 0);

    const indexFiles = readdirSync(join(tmp, "records", "product", "index")).filter((f) => f.endsWith(".yaml") && f.includes("no-ctx"));
    assert.strictEqual(indexFiles.length, 1);

    const yamlText = readFileSync(join(tmp, "records", "product", "index", indexFiles[0]), "utf8");
    const record = parseYaml(yamlText);
    assert.strictEqual(record.context, undefined);

    record.__file = `records/product/index/${indexFiles[0]}`;
    const schemas = loadSchemas(root);
    const errors = validateRecords([record], schemas, tmp);
    assert.deepStrictEqual(errors, [], `schema errors: ${errors.join(", ")}`);
  });
});

// CLI shim tests removed: the MCP shim uses resolveRoot() (always repo root) rather than --root.
// Integration tests for the shim are run separately via pnpm extract:index --dry-run.
// Core logic tests above cover all extraction behavior.
