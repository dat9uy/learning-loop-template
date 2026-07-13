import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { metaStateRefreshFileIndexTool, _clearRefreshHashCacheForTests } from "../../tools/handlers/meta-state-refresh-file-index-tool.js";
import { readFileIndex, canonicalIndexKey, _resetFileIndexCacheForTests } from "../../core/meta-state.js";
import { checkGrounding } from "../../core/check-grounding.js";

// F9: locks the O(1)-per-file-change invariant. One refresh_file_index call
// re-grounds ALL K findings anchored to a path — the win the migration delivers.
// Asserts the inverse too: without the index loaded, the same findings are drifted
// (so the win can't silently degrade to O(N) with no CI signal).
describe("O(1) regression: one refresh re-grounds all anchored findings (F9)", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("seed -> edit fixture -> one refresh_file_index -> all K grounded with index, drifted without it", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "o1-regression-"));
    process.env.GATE_ROOT = tempDir;
    _clearRefreshHashCacheForTests();
    _resetFileIndexCacheForTests();
    try {
      // A fixture file cited by K=3 findings (one bare, one :line, one #anchor —
      // all canonicalize to the same path key).
      writeFileSync(join(tempDir, "gate-logic.js"), "// original\n");

      const report = (ref) => metaStateReportTool.handler({
        category: "loop-anti-pattern", severity: "warning", affected_system: "gate-logic",
        description: "O(1) regression anchored finding (min 20 chars).",
        evidence_code_ref: ref, mechanism_check: true,
      });
      await report("gate-logic.js");
      await report("gate-logic.js:638");
      await report("gate-logic.js#checkResolutionEvidence");

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const ids = raw.trim().split("\n").map((l) => JSON.parse(l).id);
      const findings = raw.trim().split("\n").map((l) => JSON.parse(l));
      assert.strictEqual(ids.length, 3, "K=3 findings anchored to the fixture");

      // Seed the index with the original hash (one refresh call).
      const seedResult = await metaStateRefreshFileIndexTool.handler({ path: "gate-logic.js" });
      assert.strictEqual(JSON.parse(seedResult.content[0].text).status, "refreshed");
      assert.strictEqual(
        JSON.parse(seedResult.content[0].text).findings_regrounded, 3,
        "K count is 3 — the refresh re-grounds all anchored findings",
      );

      // Edit the fixture file (the cited path changed).
      writeFileSync(join(tempDir, "gate-logic.js"), "// edited — refactored\n");

      // WITHOUT the index loaded: all K findings are drifted (stale baseline).
      _resetFileIndexCacheForTests();
      const emptyIndex = readFileIndex(tempDir); // seeded with original hash → stale vs edited file
      for (const f of findings) {
        const g = checkGrounding(f, { root: tempDir, fileIndex: emptyIndex });
        assert.strictEqual(g.status, "drifted", `finding ${f.id} must drift with the stale index after the edit`);
        assert.strictEqual(g.drift_kind, "hash_mismatch");
      }

      // ONE refresh_file_index call re-grounds all K (the O(1) win).
      _clearRefreshHashCacheForTests();
      _resetFileIndexCacheForTests();
      const refreshResult = await metaStateRefreshFileIndexTool.handler({ path: "gate-logic.js" });
      assert.strictEqual(JSON.parse(refreshResult.content[0].text).status, "refreshed");
      assert.strictEqual(JSON.parse(refreshResult.content[0].text).findings_regrounded, 3);

      // WITH the (refreshed) index loaded: all K findings are grounded via the index.
      _resetFileIndexCacheForTests();
      const refreshedIndex = readFileIndex(tempDir);
      for (const f of findings) {
        const g = checkGrounding(f, { root: tempDir, fileIndex: refreshedIndex });
        assert.strictEqual(g.status, "grounded", `finding ${f.id} must be grounded via the refreshed index`);
        assert.strictEqual(g.drift_kind, null);
        assert.strictEqual(g.grounding.hash_match, true);
      }
    } finally {
      _clearRefreshHashCacheForTests();
      _resetFileIndexCacheForTests();
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});