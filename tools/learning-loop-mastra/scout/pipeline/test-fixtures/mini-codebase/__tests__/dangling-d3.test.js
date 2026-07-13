import { test } from "vitest";
import assert from "node:assert/strict";

// D3 fixture: imports a tool module that no longer exists.
import { removedTool } from "../removed-tool-that-no-longer-exists.js";

test("dangling D3: imports a removed tool module", () => {
  assert.ok(removedTool);
});
