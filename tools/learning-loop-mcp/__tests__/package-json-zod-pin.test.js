import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(__dirname)));

test("package.json pins zod to 4.4.3 exact (no caret, tilde, or range)", () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  assert.strictEqual(
    pkg.dependencies.zod,
    "4.4.3",
    `zod must be pinned to 4.4.3 exact, got: ${pkg.dependencies.zod}`
  );
});
