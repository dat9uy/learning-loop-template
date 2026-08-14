import assert from "node:assert/strict";
import { test } from "vitest";

import {
  RUNTIME_TOPOLOGY,
  createRuntimeTopology,
  getRuntime,
  listRuntimes,
  runtimeIdForSurface,
} from "./runtime-topology.js";

test("Runtime Topology contains the current participant set and only topology facts", () => {
  assert.deepEqual(listRuntimes(), [
    { id: "codex", surface: ".codex", ownershipRoot: ".codex" },
    { id: "claude-code", surface: ".claude", ownershipRoot: ".claude" },
    { id: "hermes", surface: ".hermes", ownershipRoot: ".hermes" },
  ]);
  assert.strictEqual(listRuntimes(), RUNTIME_TOPOLOGY);
  for (const runtime of listRuntimes()) {
    assert.deepEqual(Object.keys(runtime).sort(), ["id", "ownershipRoot", "surface"]);
    assert.ok(Object.isFrozen(runtime));
  }
  assert.ok(Object.isFrozen(RUNTIME_TOPOLOGY));
});

test("Runtime Topology supports id and surface lookup", () => {
  assert.deepEqual(getRuntime("codex"), {
    id: "codex",
    surface: ".codex",
    ownershipRoot: ".codex",
  });
  assert.equal(getRuntime("missing"), undefined);
  assert.equal(runtimeIdForSurface(".hermes"), "hermes");
  assert.equal(runtimeIdForSurface(".missing"), undefined);
});

test("Runtime Topology rejects duplicate identities and owned surfaces", () => {
  assert.throws(
    () => createRuntimeTopology([
      { id: "one", surface: ".one", ownershipRoot: ".one" },
      { id: "one", surface: ".two", ownershipRoot: ".two" },
    ]),
    /duplicate runtime id.*one/i,
  );
  assert.throws(
    () => createRuntimeTopology([
      { id: "one", surface: ".same", ownershipRoot: ".one" },
      { id: "two", surface: ".same", ownershipRoot: ".two" },
    ]),
    /duplicate owned surface.*\.same/i,
  );
});

test("Runtime Topology rejects mechanism fields on catalog entries", () => {
  assert.throws(
    () => createRuntimeTopology([
      { id: "one", surface: ".one", ownershipRoot: ".one", capabilities: ["hooks"] },
    ]),
    /only id, surface, and ownershipRoot/i,
  );
});
