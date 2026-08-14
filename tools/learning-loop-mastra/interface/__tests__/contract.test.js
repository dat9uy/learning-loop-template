import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

import { listRuntimes } from "../../core/runtime-topology.js";
import { validate, validateAll, REQUIREMENT_IDS } from "../contract.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

test("contract exports the current requirement set", () => {
  assert.deepEqual(REQUIREMENT_IDS, [
    "hook-shim-set",
    "mcp-client-config",
    "skill-spec",
    "identity-marker",
    "settings-integration",
    "tools-manifest-has-path-fields",
    "runtime-owned-i2-delivery",
    "codex-initial-delivery",
  ]);
});

test("validateAll defaults to every Runtime Topology participant", () => {
  assert.deepEqual(Object.keys(validateAll()), listRuntimes().map((runtime) => runtime.id));
});

test("Codex passes its native MCP and Initial Delivery checks", () => {
  const result = validate("codex", PROJECT_ROOT);
  assert.equal(result.path_map["mcp-client-config"].ok, true);
  assert.equal(result.path_map["codex-initial-delivery"].ok, true);
  assert.equal(result.path_map["runtime-owned-i2-delivery"].applicable, false);
  assert.ok(result.missing.includes("hook-shim-set"));
  assert.ok(result.missing.includes("settings-integration"));
});

for (const runtimeId of ["claude-code", "hermes"]) {
  test(`${runtimeId} passes shared wiring checks but reports its runtime-owned I2 gap`, () => {
    const result = validate(runtimeId, PROJECT_ROOT);
    assert.equal(result.path_map["hook-shim-set"].ok, true);
    assert.equal(result.path_map["mcp-client-config"].ok, true);
    assert.equal(result.path_map["settings-integration"].ok, true);
    assert.equal(result.path_map["runtime-owned-i2-delivery"].code, "runtime_owned_delivery_missing");
    assert.equal(result.path_map["runtime-owned-i2-delivery"].owner, runtimeId);
    assert.ok(result.missing.includes("runtime-owned-i2-delivery"));
    assert.equal(result.ok, false);
  });
}

for (const retiredRuntimeId of ["droid", "mastra-code"]) {
  test(`${retiredRuntimeId} is rejected instead of validated through a legacy alias`, () => {
    const result = validate(retiredRuntimeId, PROJECT_ROOT);
    assert.equal(result.ok, false);
    assert.equal(result.error, `unknown-runtime-id: ${retiredRuntimeId}`);
    assert.deepEqual(result.path_map, {});
  });
}

test("the current contract does not claim retired runtime surfaces", () => {
  const contract = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/interface/contract.js"), "utf8");
  assert.equal(contract.includes(".factory"), false);
  assert.equal(contract.includes(".mastracode"), false);
  for (const surface of [".factory", ".mastracode"]) {
    for (const artifact of [
      "mcp.json",
      "hooks.json",
      "settings.json",
      "skills/learning-loop/SKILL.md",
      "skills/coordination-gate/SKILL.md",
      "skills/mastra/SKILL.md",
    ]) {
      assert.equal(existsSync(join(PROJECT_ROOT, surface, artifact)), false);
    }
  }
});
