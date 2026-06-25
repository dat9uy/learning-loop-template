import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const INTERFACE_DIR = join(import.meta.dirname, "..", "..", "interface");

test("interface directory exists", () => {
  assert.ok(existsSync(INTERFACE_DIR), `expected ${INTERFACE_DIR} to exist`);
  assert.ok(statSync(INTERFACE_DIR).isDirectory(), "expected interface/ to be a directory");
});

test("interface directory contains 4 expected docs", () => {
  const expected = ["README.md", "CONTRACT.md", "contract.js", "RUNTIME_ONBOARDING.md"];
  const entries = readdirSync(INTERFACE_DIR);
  for (const name of expected) {
    assert.ok(entries.includes(name), `expected interface/ to contain ${name}`);
  }
});

test("interface/__tests__/ subdirectory exists", () => {
  const testsDir = join(INTERFACE_DIR, "__tests__");
  assert.ok(existsSync(testsDir), `expected ${testsDir} to exist`);
  assert.ok(statSync(testsDir).isDirectory(), "expected interface/__tests__/ to be a directory");
});
