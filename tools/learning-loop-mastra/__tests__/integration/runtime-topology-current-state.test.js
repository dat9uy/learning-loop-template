import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

import { listRuntimes } from "../../core/runtime-topology.js";
import { SURFACES } from "../../core/surfaces.js";
import { validate } from "../../interface/contract.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const RETIRED_RUNTIME_IDS = ["droid", "mastra-code"];
const RETIRED_SURFACES = [".factory", ".mastracode"];

test("current Runtime Topology and retained mirror surfaces are exact", () => {
  assert.deepEqual(listRuntimes(), [
    { id: "codex", surface: ".codex", ownershipRoot: ".codex" },
    { id: "claude-code", surface: ".claude", ownershipRoot: ".claude" },
    { id: "hermes", surface: ".hermes", ownershipRoot: ".hermes" },
  ]);
  assert.deepEqual(SURFACES, [".claude", ".hermes"]);
});

test("retired runtime ids are not accepted by shared conformance", () => {
  for (const runtimeId of RETIRED_RUNTIME_IDS) {
    const result = validate(runtimeId, PROJECT_ROOT);
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(`unknown-runtime-id: ${runtimeId}`));
  }
});

test("Claude Code and Hermes expose typed runtime-owned I2 delivery gaps", () => {
  for (const runtimeId of ["claude-code", "hermes"]) {
    const result = validate(runtimeId, PROJECT_ROOT);
    const delivery = result.path_map["runtime-owned-i2-delivery"];

    assert.equal(result.ok, false);
    assert.ok(result.missing.includes("runtime-owned-i2-delivery"));
    assert.deepEqual(delivery, {
      id: "runtime-owned-i2-delivery",
      ok: false,
      applicable: true,
      code: "runtime_owned_delivery_missing",
      runtime_id: runtimeId,
      owner: runtimeId,
      message: `Initial I2 Rule Delivery is not declared for ${runtimeId}; the runtime owner must provide the current native adapter`,
    });
  }
});

test("retired runtime surfaces have no current tracked artifacts", () => {
  for (const surface of RETIRED_SURFACES) {
    for (const artifact of [
      "mcp.json",
      "hooks.json",
      "settings.json",
      "skills/learning-loop/SKILL.md",
      "skills/coordination-gate/SKILL.md",
      "skills/mastra/SKILL.md",
    ]) {
      assert.equal(
        existsSync(join(PROJECT_ROOT, surface, artifact)),
        false,
        `${surface}/${artifact} must be removed from current support`,
      );
    }
  }

  const hooksLock = JSON.parse(readFileSync(join(PROJECT_ROOT, "hooks-lock.json"), "utf8"));
  const skillsLock = JSON.parse(readFileSync(join(PROJECT_ROOT, "skills-lock.json"), "utf8"));
  const allowlist = JSON.parse(readFileSync(join(PROJECT_ROOT, ".loop", "r2-allowlist.json"), "utf8"));
  const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
  const serialized = JSON.stringify({ hooksLock, skillsLock, allowlist });

  for (const retired of [...RETIRED_RUNTIME_IDS, ...RETIRED_SURFACES]) {
    assert.equal(serialized.includes(retired), false, `current declarations must not mention ${retired}`);
  }
  assert.equal(packageJson.devDependencies?.mastracode, undefined);
  assert.equal(packageJson.scripts?.["smoke:mastracode"], undefined);
});
