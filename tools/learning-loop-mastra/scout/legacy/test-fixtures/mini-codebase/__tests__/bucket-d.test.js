import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Bucket D fixture: spawns droid exec for end-to-end agent behavior.
test("bucket D: spawns droid exec for end-to-end probe", async () => {
  const child = spawn("droid", ["exec", "--auto", "low", "echo hi"], {
    stdio: "pipe",
  });
  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve);
  });
  assert.equal(exitCode, 0);
});
