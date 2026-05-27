import { describe, it } from "node:test";
import assert from "node:assert";
import { extract } from "#mcp/core/generate-capabilities/adapters/tanstack-adapter.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe("tanstack-adapter", () => {
  it("extracts route paths from fixture router and route files", async () => {
    const result = await extract(root, { routerPath: join(root, "tools", "generate-capabilities", "fixtures", "tanstack", "router.tsx") });
    assert.ok(Array.isArray(result.entries));
    assert.strictEqual(result.entries.length, 2);

    const sources = result.entries.map((e) => e.source);
    assert.ok(sources.includes("/reference/equity"));
    assert.ok(sources.includes("/reference/company/$symbol"));
  });

  it("derives domain from first path segment", async () => {
    const result = await extract(root, { routerPath: join(root, "tools", "generate-capabilities", "fixtures", "tanstack", "router.tsx") });
    for (const entry of result.entries) {
      assert.strictEqual(entry.domain, "reference");
    }
  });

  it("ignores index route without RoutePath import", async () => {
    const result = await extract(root, { routerPath: join(root, "tools", "generate-capabilities", "fixtures", "tanstack", "router.tsx") });
    const sources = result.entries.map((e) => e.source);
    assert.ok(!sources.includes("/"));
  });
});
