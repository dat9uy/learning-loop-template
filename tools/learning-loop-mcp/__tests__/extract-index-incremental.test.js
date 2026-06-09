import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExtraction } from "../core/extract-index/extract-index.js";

function makeTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), "extract-incremental-test-"));
  mkdirSync(join(tmp, "records", "evidence", "test"), { recursive: true });
  mkdirSync(join(tmp, "records", "experiments"), { recursive: true });
  mkdirSync(join(tmp, "records", "index"), { recursive: true });
  mkdirSync(join(tmp, "records", "claims"), { recursive: true });
  mkdirSync(join(tmp, "records", "product", "index"), { recursive: true });
  return tmp;
}

function writeEvidence(tmp, relPath, content) {
  writeFileSync(join(tmp, "records", "evidence", relPath), content);
}

describe("extract-index incremental mode", () => {
  let tmp;

  beforeEach(() => {
    tmp = makeTmpProject();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("no-op when nothing changed (cache_hits > 0)", () => {
    writeEvidence(tmp, "test/unchanged.md", `---
capability: test-cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Unchanged
## Findings
- [topic-a] The system handles errors gracefully.
`);

    // First run writes index files so second run has existing entries to compare
    const first = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.equal(first.errors.length, 0);
    assert.equal(first.stats.entriesProduced, 1);

    // Second run with incremental (default)
    const second = runExtraction(tmp, { dryRun: true, verbose: false, incremental: true });
    assert.equal(second.errors.length, 0);
    assert.ok(second.stats.cache_hits > 0, `incremental re-run must have cache_hits > 0, got ${second.stats.cache_hits}`);
    assert.equal(second.stats.cache_misses, 0, "no changes means 0 cache_misses");
  });

  it("rebuild after content edit (cache_misses > 0)", () => {
    writeEvidence(tmp, "test/edit.md", `---
capability: test-cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Edit
## Findings
- [topic-b] Original assertion text.
`);

    // First run writes index files
    const first = runExtraction(tmp, { dryRun: false, verbose: false, incremental: true });
    assert.equal(first.errors.length, 0);

    // Edit the file
    writeEvidence(tmp, "test/edit.md", `---
capability: test-cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Edit
## Findings
- [topic-b] Modified assertion text.
`);

    // Remove existing index to avoid supersession hard-stop (test focuses on cache_misses, not supersession)
    const existingIndexPath = join(tmp, "records", "product", "index", "assertion-test-cap-runtime-topic-b.yaml");
    if (existsSync(existingIndexPath)) {
      rmSync(existingIndexPath, { force: true });
    }

    // Second run
    const second = runExtraction(tmp, { dryRun: true, verbose: false, incremental: true });
    assert.equal(second.errors.length, 0, `expected 0 errors, got: ${second.errors.join(" | ")}`);
    assert.ok(second.stats.cache_misses > 0, `edited file must produce cache_misses > 0, got ${second.stats.cache_misses}`);
  });

  it("mtime change with same content is a cache hit (content-hash primary key)", () => {
    writeEvidence(tmp, "test/touch.md", `---
capability: test-cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Touch
## Findings
- [topic-c] Assertion text.
`);

    // First run writes index files
    const first = runExtraction(tmp, { dryRun: false, verbose: false, incremental: true });
    assert.equal(first.errors.length, 0);

    // "Touch" the file: rewrite identical content
    const path = join(tmp, "records", "evidence", "test", "touch.md");
    const content = readFileSync(path, "utf8");
    writeFileSync(path, content, "utf8");

    // Second run
    const second = runExtraction(tmp, { dryRun: true, verbose: false, incremental: true });
    assert.equal(second.errors.length, 0);
    assert.equal(second.stats.cache_misses, 0, "same content after touch must produce 0 cache_misses");
    assert.ok(second.stats.cache_hits > 0, "same content after touch must produce cache_hits > 0");
  });

  it("--no-incremental forces full rebuild (cache_hits = 0)", () => {
    writeEvidence(tmp, "test/full.md", `---
capability: test-cap
dimension: runtime
scope: sandbox
validation_status: passed
---
# Full
## Findings
- [topic-d] Assertion text.
`);

    // First run writes index files
    runExtraction(tmp, { dryRun: false, verbose: false, incremental: true });

    // Second run with incremental=false
    const second = runExtraction(tmp, { dryRun: true, verbose: false, incremental: false });
    assert.equal(second.errors.length, 0);
    assert.equal(second.stats.cache_hits, 0, "--no-incremental must force cache_hits = 0");
    // cache_misses counts entries that need writing; with unchanged content and dryRun,
    // shouldWrite returns false for all entries, so cache_misses may be 0.
    // The key invariant is cache_hits = 0 (no short-circuit reads).
  });
});
