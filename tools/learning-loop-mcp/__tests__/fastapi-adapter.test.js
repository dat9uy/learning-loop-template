import { describe, it } from "node:test";
import assert from "node:assert";
import { extract } from "#mcp/core/generate-capabilities/adapters/fastapi-adapter.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

function makeFixtureRoot(fixtureName) {
  return join(root, "tools", "generate-capabilities", "fixtures", "http-rest", fixtureName);
}

describe("fastapi-adapter", () => {
  it("extracts entries from OpenAPI JSON fixture", async () => {
    const result = await extract(root, { useFixture: makeFixtureRoot("openapi.json") });
    assert.ok(Array.isArray(result.entries));
    assert.strictEqual(result.entries.length, 3);

    const sources = result.entries.map((e) => e.source);
    assert.ok(sources.includes("GET /reference/equity"));
    assert.ok(sources.includes("GET /reference/company/{symbol}"));
    assert.ok(sources.includes("GET /reference/search"));
  });

  it("derives domain from first path segment", async () => {
    const result = await extract(root, { useFixture: makeFixtureRoot("openapi.json") });
    for (const entry of result.entries) {
      assert.strictEqual(entry.domain, "reference");
    }
  });

  it("skips /health route", async () => {
    const result = await extract(root, { useFixture: makeFixtureRoot("openapi.json") });
    const sources = result.entries.map((e) => e.source);
    assert.ok(!sources.includes("GET /health"));
  });

  it("ignores non-HTTP methods", async () => {
    const openapi = {
      paths: {
        "/reference/test": {
          get: {},
          trace: {},
          parameters: {},
        },
      },
    };
    const result = await extract(null, { useOpenApi: openapi });
    assert.strictEqual(result.entries.length, 1);
    assert.strictEqual(result.entries[0].source, "GET /reference/test");
  });

  it("skips routes without a domain segment", async () => {
    const openapi = {
      paths: {
        "/": { get: {} },
        "/reference/equity": { get: {} },
      },
    };
    const result = await extract(null, { useOpenApi: openapi });
    assert.strictEqual(result.entries.length, 1);
    assert.strictEqual(result.entries[0].source, "GET /reference/equity");
  });
});
