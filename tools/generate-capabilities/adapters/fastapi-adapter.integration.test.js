import { describe, it } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "./fastapi-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");

if (process.env.INTEGRATION) {
describe("fastapi-adapter integration", { timeout: 30000 }, () => {
  it("extracts entries from a running dev server", { timeout: 30000 }, async () => {
    const server = spawn("uv", ["run", "uvicorn", "src.main:app", "--port", "0"], {
      cwd: join(root, "product", "api"),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let port = null;
    let stderr = "";
    const readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      server.stderr.on("data", (data) => {
        stderr += data.toString();
        const match = stderr.match(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/);
        if (match && !port) {
          port = parseInt(match[1], 10);
          clearTimeout(timeout);
          resolve();
        }
      });
      server.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await readyPromise;

    // Poll health until ready
    let healthy = false;
    const healthStart = Date.now();
    while (!healthy && Date.now() - healthStart < 10000) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) healthy = true;
      } catch {
        // ignore
      }
      if (!healthy) await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(healthy, "Server health check failed");

    try {
      const result = await extract(root, { serverUrl: `http://127.0.0.1:${port}` });
      assert.ok(Array.isArray(result.entries));
      assert.strictEqual(result.entries.length, 3);

      const sources = result.entries.map((e) => e.source);
      assert.ok(sources.includes("GET /reference/equity"));
      assert.ok(sources.includes("GET /reference/company/{symbol}"));
      assert.ok(sources.includes("GET /reference/search"));

      for (const entry of result.entries) {
        assert.strictEqual(entry.domain, "reference");
      }
    } finally {
      server.kill("SIGTERM");
      // Force kill if still alive after 2s
      setTimeout(() => server.kill("SIGKILL"), 2000);
    }
  });
});
}
