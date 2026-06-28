#!/usr/bin/env node
/**
 * Capture pre-refactor gate_check handler output for snapshot parity testing.
 * Run this BEFORE Phase 3 hook refactor. Writes to gate-check-snapshot.json.
 *
 * Usage: node __tests__/legacy-mcp/fixtures/capture-gate-check-snapshot.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gateCheckTool } from "../../../tools/legacy/gate-tool.js";

const FIXTURES = [
  {
    fixture_id: "constraint-with-observation",
    input: { command: "pip install vnstock" },
    setup: (root) => {
      writeFileSync(
        join(root, "runtime-state.jsonl"),
        JSON.stringify({ id: "obs-1", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() }) + "\n",
      );
    },
  },
  {
    fixture_id: "constraint-no-observation",
    input: { command: "pip install vnstock" },
    setup: () => {},
  },
  {
    fixture_id: "path-write-records",
    input: { file_path: "records/meta/test.json" },
    setup: () => {},
  },
  {
    fixture_id: "product-with-preflight",
    input: { file_path: "product/src/index.ts" },
    setup: (root) => {
      const dir = join(root, ".claude", "coordination");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, ".loop-preflight-product"),
        JSON.stringify({ surface: "product", completed_at: new Date().toISOString() }),
      );
    },
  },
  {
    fixture_id: "product-no-preflight",
    input: { file_path: "product/src/index.ts" },
    setup: () => {},
  },
  {
    fixture_id: "safe-command",
    input: { command: "ls -la" },
    setup: () => {},
  },
  {
    fixture_id: "empty-input",
    input: {},
    setup: () => {},
  },
];

async function capture() {
  const results = [];

  for (const fixture of FIXTURES) {
    const root = mkdtempSync(join(tmpdir(), "gate-snapshot-"));
    const origRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    try {
      fixture.setup(root);
      const result = await gateCheckTool.handler(fixture.input);
      results.push({
        fixture_id: fixture.fixture_id,
        input: fixture.input,
        expected_return_json_string: result.content[0].text,
      });
    } finally {
      process.env.GATE_ROOT = origRoot;
      rmSync(root, { recursive: true, force: true });
    }
  }

  const outPath = join(
    new URL(".", import.meta.url).pathname,
    "gate-check-snapshot.json",
  );
  writeFileSync(outPath, JSON.stringify({ fixtures: results }, null, 2) + "\n");
  console.log(`Captured ${results.length} fixtures to ${outPath}`);
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
