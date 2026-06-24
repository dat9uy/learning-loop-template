import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENTS_MD = join(import.meta.dirname, "..", "..", "..", "..", "AGENTS.md");

test("AGENTS.md §1 names the 3 layers", () => {
  let content;
  try {
    content = readFileSync(AGENTS_MD, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      assert.fail("AGENTS.md does not exist");
    }
    throw err;
  }

  // Check first 100 lines for the 3 layer names
  const first100 = content.split("\n").slice(0, 100).join("\n");

  assert.ok(
    first100.includes("Core"),
    'AGENTS.md §1 (first 100 lines) missing "Core"'
  );
  assert.ok(
    first100.includes("Mastra shell"),
    'AGENTS.md §1 (first 100 lines) missing "Mastra shell"'
  );
  assert.ok(
    first100.includes("Runtime interface"),
    'AGENTS.md §1 (first 100 lines) missing "Runtime interface"'
  );

  // Verify original content is preserved
  for (const phrase of ["meta-surface", "4-kind", "product surface"]) {
    assert.ok(
      content.includes(phrase),
      `AGENTS.md missing preserved content: "${phrase}"`
    );
  }
});
