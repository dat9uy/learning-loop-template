import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CONTRACT_MD = join(import.meta.dirname, "..", "..", "interface", "CONTRACT.md");

test("CONTRACT.md exists", () => {
  assert.ok(existsSync(CONTRACT_MD), `expected ${CONTRACT_MD} to exist`);
});

test("CONTRACT.md is larger than 500 bytes", () => {
  const size = statSync(CONTRACT_MD).size;
  assert.ok(size > 500, `expected CONTRACT.md > 500 bytes, got ${size}`);
});

test("CONTRACT.md contains all 5 requirement IDs", () => {
  const content = readFileSync(CONTRACT_MD, "utf8");
  const ids = ["hook-shim-set", "mcp-client-config", "skill-spec", "identity-marker", "settings-integration"];
  for (const id of ids) {
    assert.ok(content.includes(id), `expected CONTRACT.md to contain requirement ID "${id}"`);
  }
});

test("CONTRACT.md contains verification section", () => {
  const content = readFileSync(CONTRACT_MD, "utf8");
  assert.ok(
    content.includes("erification") || content.includes("erify"),
    "expected CONTRACT.md to contain a verification section"
  );
});

test("CONTRACT.md references contract.js validator", () => {
  const content = readFileSync(CONTRACT_MD, "utf8");
  assert.ok(content.includes("contract.js"), "expected CONTRACT.md to reference contract.js validator");
});
