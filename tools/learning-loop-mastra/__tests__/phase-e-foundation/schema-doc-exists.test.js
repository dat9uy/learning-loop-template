import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_DOC = join(
  import.meta.dirname,
  "..",
  "..",
  "docs",
  "schemas.md"
);

test("schema doc exists and is non-trivial", () => {
  let content;
  try {
    content = readFileSync(SCHEMA_DOC, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      assert.fail(
        "Schema doc does not exist yet (expected after Phase 4): " + SCHEMA_DOC
      );
    }
    throw err;
  }

  const size = Buffer.byteLength(content, "utf8");
  assert.ok(
    size > 500,
    `Schema doc is too small (${size} bytes); expected > 500 bytes`
  );

  // Must enumerate the 4 meta-state entry kinds
  for (const kind of ["finding", "change-log", "rule", "loop-design"]) {
    assert.ok(
      content.includes(kind),
      `Schema doc missing expected kind: "${kind}"`
    );
  }

  // Must reference the wire envelope or parity contract
  const hasEnvelope =
    content.includes("envelope-stripper") || content.includes("wire envelope");
  const hasParity =
    content.includes("schema-parity") || content.includes("parity contract");

  assert.ok(
    hasEnvelope || hasParity,
    'Schema doc missing wire envelope or parity contract reference (expected "envelope-stripper" or "schema-parity")'
  );
});
