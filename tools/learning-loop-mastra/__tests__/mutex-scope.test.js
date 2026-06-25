import { describe, test } from "node:test";
import assert from "node:assert";
import { performance } from "node:perf_hooks";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMcpServer } from "./with-mcp-server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const mastraEntry = join(projectRoot, "tools/learning-loop-mastra/mastra/server.js");

function copySchemas(tempRoot) {
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(tempRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }
}

function prepareTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "mutex-scope-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);
  return tempRoot;
}

describe("connectMcpServer mutex scope", () => {
  test("different tempRoot connections do not serialize listTools", async () => {
    const tempRootA = prepareTempRoot();
    const tempRootB = prepareTempRoot();

    const a = await connectMcpServer(mastraEntry, tempRootA);
    const b = await connectMcpServer(mastraEntry, tempRootB);

    try {
      const work = { a: {}, b: {} };

      const patch = (client, key) => {
        const original = client.listTools.bind(client);
        client.listTools = async () => {
          work[key].start = performance.now();
          try {
            return await original();
          } finally {
            work[key].end = performance.now();
          }
        };
      };

      patch(a.client, "a");
      patch(b.client, "b");

      await Promise.all([a.listTools(), b.listTools()]);

      assert.ok(
        work.a.start < work.b.end,
        "server A work should start before server B completes"
      );
      assert.ok(
        work.b.start < work.a.end,
        "server B work should start before server A completes"
      );
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});
