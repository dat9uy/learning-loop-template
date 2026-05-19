import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { computeHash } from "./hash-computer.js";
import { buildIndexEntry } from "./index-entry-builder.js";
import { runExtraction } from "./extract-index.js";
import { loadSchemas } from "../validate-records/schema-loader.js";
import { validateRecords } from "../validate-records/record-validation-rules.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const extractIndexPath = join(root, "tools", "extract-index", "extract-index.js");

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

    const indexFiles = readdirSync(join(tmp, "records", "index")).filter((f) => f.endsWith(".yaml"));
    assert.strictEqual(indexFiles.length, 1);

    const yamlText = readFileSync(join(tmp, "records", "index", indexFiles[0]), "utf8");
    const record = parseYaml(yamlText);
    record.__file = `records/index/${indexFiles[0]}`;

    const schemas = loadSchemas(root);
    const errors = validateRecords([record], schemas, tmp);
    assert.deepStrictEqual(errors, [], `schema errors: ${errors.join(", ")}`);
  });

  it("omits context when evidence has no Context nested bullet", () => {
    writeEvidence(tmp, "test/no-context.md", `---\ncapability: test-cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# No Context\n## Findings\n- [no-ctx-topic] The assertion text.\n`);
    const result = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.strictEqual(result.errors.length, 0);

    const indexFiles = readdirSync(join(tmp, "records", "index")).filter((f) => f.endsWith(".yaml") && f.includes("no-ctx"));
    assert.strictEqual(indexFiles.length, 1);

    const yamlText = readFileSync(join(tmp, "records", "index", indexFiles[0]), "utf8");
    const record = parseYaml(yamlText);
    assert.strictEqual(record.context, undefined);

    record.__file = `records/index/${indexFiles[0]}`;
    const schemas = loadSchemas(root);
    const errors = validateRecords([record], schemas, tmp);
    assert.deepStrictEqual(errors, [], `schema errors: ${errors.join(", ")}`);
  });
});

describe("extract-index CLI", () => {
  it("--dry-run against clean tmp root returns exit 0", () => {
    const tmp = makeTmpProject();
    writeEvidence(tmp, "test/valid.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Valid\n");
    const result = execSync(`node ${extractIndexPath} --dry-run --root ${tmp}`, { encoding: "utf8" });
    assert.match(result, /Processed 1 evidence files/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns exit 2 on unknown flag", () => {
    const result = runWithCode("--bad-flag");
    assert.strictEqual(result.code, 2);
  });

  it("returns exit 0 on real repo with all frontmatter valid", () => {
    const result = runWithCode("--dry-run");
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /Processed \d+ evidence files/);
  });

  it("returns exit 0 for --capability nonexistent on clean root", () => {
    const tmp = makeTmpProject();
    writeEvidence(tmp, "test/valid.md", "---\ncapability: cap\ndimension: runtime\nscope: sandbox\nvalidation_status: passed\n---\n# Valid\n");
    const result = execSync(`node ${extractIndexPath} --dry-run --capability nonexistent --root ${tmp}`, { encoding: "utf8" });
    assert.match(result, /Processed 1 evidence files/);
    rmSync(tmp, { recursive: true, force: true });
  });
});
