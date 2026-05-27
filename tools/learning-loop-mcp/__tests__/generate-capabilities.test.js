import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { generateCapabilities } from "#mcp/core/generate-capabilities/generate-capabilities.js";

describe("generate-capabilities", () => {
  it("writes one YAML record per (stack, domain) from mock adapter entries", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "gc-test-"));
    const mockRegistry = {
      "HTTP/REST": async () => ({
        extract: async () => ({
          entries: [
            { source: "GET /reference/equity", domain: "reference" },
            { source: "GET /reference/company/{symbol}", domain: "reference" },
          ],
        }),
      }),
    };

    await generateCapabilities({
      root: outDir,
      outDir: join(outDir, "records", "capabilities"),
      registry: mockRegistry,
      stacks: [{ name: "api", surfaces: ["HTTP/REST"] }],
    });

    const recordPath = join(outDir, "records", "capabilities", "capability-fastapi-reference-rest.yaml");
    const record = YAML.parse(readFileSync(recordPath, "utf8"));
    assert.strictEqual(record.type, "capability");
    assert.strictEqual(record.stack, "api");
    assert.strictEqual(record.surface, "HTTP/REST");
    assert.strictEqual(record.maps.length, 2);

    rmSync(outDir, { recursive: true });
  });

  it("dry-run returns mismatch when records differ", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "gc-dry-"));
    mkdirSync(join(outDir, "records", "capabilities"), { recursive: true });
    writeFileSync(
      join(outDir, "records", "capabilities", "capability-api-reference-rest.yaml"),
      "type: capability\nstack: api\nsurface: HTTP/REST\nmaps:\n  - source: OLD\n",
      "utf8"
    );

    const mockRegistry = {
      "HTTP/REST": async () => ({
        extract: async () => ({
          entries: [{ source: "GET /reference/equity", domain: "reference" }],
        }),
      }),
    };

    const result = await generateCapabilities({
      root: outDir,
      outDir: join(outDir, "records", "capabilities"),
      registry: mockRegistry,
      stacks: [{ name: "api", surfaces: ["HTTP/REST"] }],
      dryRun: true,
    });

    assert.strictEqual(result.drift, true);
    assert.ok(result.diffs.length > 0);

    rmSync(outDir, { recursive: true });
  });

  it("dry-run returns no mismatch when records match", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "gc-dry-ok-"));
    mkdirSync(join(outDir, "records", "capabilities"), { recursive: true });

    const mockRegistry = {
      "HTTP/REST": async () => ({
        extract: async () => ({
          entries: [{ source: "GET /reference/equity", domain: "reference" }],
        }),
      }),
    };

    // First generate normally
    await generateCapabilities({
      root: outDir,
      outDir: join(outDir, "records", "capabilities"),
      registry: mockRegistry,
      stacks: [{ name: "api", surfaces: ["HTTP/REST"] }],
    });

    // Then dry-run should match
    const result = await generateCapabilities({
      root: outDir,
      outDir: join(outDir, "records", "capabilities"),
      registry: mockRegistry,
      stacks: [{ name: "api", surfaces: ["HTTP/REST"] }],
      dryRun: true,
    });

    assert.strictEqual(result.drift, false);
    assert.strictEqual(result.diffs.length, 0);

    rmSync(outDir, { recursive: true });
  });
});
