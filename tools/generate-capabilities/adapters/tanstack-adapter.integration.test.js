import { describe, it } from "node:test";
import assert from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "./tanstack-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");

if (process.env.INTEGRATION) {
describe("tanstack-adapter integration", { timeout: 30000 }, () => {
  it("extracts entries from actual router.tsx and route files", async () => {
    const result = await extract(root);
    assert.ok(Array.isArray(result.entries));
    assert.strictEqual(result.entries.length, 2);

    const sources = result.entries.map((e) => e.source);
    assert.ok(sources.includes("/reference/equity"));
    assert.ok(sources.includes("/reference/company/$symbol"));

    for (const entry of result.entries) {
      assert.strictEqual(entry.domain, "reference");
    }
  });
});
}
