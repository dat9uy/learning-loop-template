/**
 * Provider-owned skill inventory coverage.
 *
 * The parent Runtime Topology specification deliberately retires the
 * loop-owned manifest-schema/hash/maturity-parity contract. The lockfile may
 * therefore contain provider-native entries alongside loop-extended entries;
 * it is inventory, not the authority for loop-maintained membership. The
 * retained maturity and byte-identity contracts are covered at the runtime
 * skill-spec and mirror-parity seams respectively.
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const MANIFEST_PATH = join(MCP_ROOT, "skills-lock.json");

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

test("skills-lock.json exists at repo root", () => {
  assert.ok(existsSync(MANIFEST_PATH), `${MANIFEST_PATH} must exist`);
});

test("skills-lock.json is readable provider inventory", () => {
  const manifest = readManifest();
  assert.strictEqual(typeof manifest.version, "number", "manifest.version must be a number");
  assert.ok(manifest.skills && typeof manifest.skills === "object" && !Array.isArray(manifest.skills), "manifest.skills must be an inventory object");
  assert.ok(Object.keys(manifest.skills).length > 0, "provider inventory must contain at least one entry");
});
