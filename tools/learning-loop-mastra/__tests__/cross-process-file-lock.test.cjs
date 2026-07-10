"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

// Plan 260711-0030 Phase 1 RED test.
// Two independent Node processes firing parallel writeEntry calls must
// produce 0 lost entries. With the per-process enqueue Map only, the
// cross-process race on meta-state.jsonl drops entries; with proper-lockfile
// wrapping the registry mutation, every entry survives.

test("parallel writes from 2 independent processes: 0 entries lost (race window widened)", async () => {
  const root = mkdtempSync(join(tmpdir(), "registry-lock-test-"));
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const repoRoot = join(__dirname, "..", "..", "..");
    const childScript = `
      import { writeEntry, generateId } from "${repoRoot}/tools/learning-loop-mastra/core/meta-state.js";
      import { slugify } from "${repoRoot}/tools/learning-loop-mastra/core/slugify.js";
      const root = ${JSON.stringify(root)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const calls = Array.from({length: 10}, async (_, i) => {
        await sleep(50);
        return writeEntry(root, {
          id: generateId(slugify("worker-" + process.pid + "-" + i)),
          entry_kind: "change-log",
          change_dimension: "semantic",
          change_target: "tools/test/w-" + process.pid + "-" + i,
          change_diff: {added: [], removed: [], changed: []},
          reason: "RED test: worker pid=" + process.pid + " call " + i + " for cross-process lock",
          status: "active",
          created_at: new Date().toISOString(),
          version: 0,
        });
      });
      Promise.all(calls).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
    `;

    const children = await Promise.all([0, 1].map(() =>
      spawn(process.execPath, ["-e", childScript], { stdio: "inherit" })
    ));

    await new Promise((resolve, reject) => {
      let exited = 0;
      children.forEach((c) => {
        c.on("exit", (code) => {
          if (code !== 0) reject(new Error("child exited " + code));
          else if (++exited === 2) resolve();
        });
      });
    });

    const content = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim();
    const lines = content.split("\n").filter(Boolean);
    assert.equal(lines.length, 20, "expected 20 entries; got " + lines.length);

    const ids = new Set(lines.map((l) => JSON.parse(l).id));
    assert.equal(ids.size, 20, "duplicate ids detected — lock failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});