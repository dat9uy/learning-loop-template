/**
 * Snapshot parity test for gate_check MCP tool.
 * Verifies that the handler returns byte-identical content[0].text for each fixture
 * captured in gate-check-snapshot.json. Locks the wire shape across refactors.
 */

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gateCheckTool } from "../../tools/handlers/gate-tool.js";

const SNAPSHOT_PATH = join(new URL(".", import.meta.url).pathname, "fixtures", "gate-check-snapshot.json");
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));

for (const fixture of snapshot.fixtures) {
  test(`snapshot: ${fixture.fixture_id}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "gate-snapshot-test-"));
    const origRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    try {
      // Set up observation file if the fixture needs one
      if (fixture.fixture_id === "constraint-with-observation") {
        writeFileSync(
          join(root, "runtime-state.jsonl"),
          JSON.stringify({ id: "obs-1", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() }) + "\n",
        );
      }
      if (fixture.fixture_id === "product-with-preflight") {
        const dir = join(root, ".claude", "coordination");
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, ".loop-preflight-product"),
          JSON.stringify({ surface: "product", completed_at: new Date().toISOString() }),
        );
      }

      const result = await gateCheckTool.handler(fixture.input);
      const actual = result.content[0].text;
      assert.strictEqual(
        actual,
        fixture.expected_return_json_string,
        `Wire shape mismatch for ${fixture.fixture_id}:\n  actual: ${actual}\n  expected: ${fixture.expected_return_json_string}`,
      );
    } finally {
      if (origRoot === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = origRoot;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
}
