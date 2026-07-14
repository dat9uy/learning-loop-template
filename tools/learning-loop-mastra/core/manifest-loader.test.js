import { test } from "vitest";
import assert from "node:assert";
import { resolveToolFile, resolveToolImportUrl } from "./manifest-loader.js";

test("resolveToolFile strips tools/ prefix and lands under tools/handlers/", () => {
  const resolved = resolveToolFile("tools/gate-tool.js");
  assert.ok(
    resolved.endsWith("/tools/handlers/gate-tool.js"),
    `expected path under tools/handlers/, got ${resolved}`,
  );
});

test("resolveToolImportUrl returns a file:// URL usable by dynamic import()", async () => {
  const url = resolveToolImportUrl("tools/gate-tool.js");
  assert.match(url, /^file:\/\/.*\/tools\/handlers\/gate-tool\.js$/);
  // Smoke: dynamic import via the helper URL must succeed (this is what
  // every server-side consumer depends on). Regression guard for finding
  // meta-260714T1630Z-after-the-mcp-server-restart-triggered-by-plan-260714-1358-r.
  const mod = await import(url);
  assert.ok(mod.gateCheckTool, "expected gateCheckTool export from imported handler");
});

test("resolveToolFile rejects inputs that do not start with 'tools/'", () => {
  assert.throws(
    () => resolveToolFile("not-tools-prefix.js"),
    /must start with "tools\/"/,
  );
  assert.throws(
    () => resolveToolFile(undefined),
    /must start with "tools\/"/,
  );
});