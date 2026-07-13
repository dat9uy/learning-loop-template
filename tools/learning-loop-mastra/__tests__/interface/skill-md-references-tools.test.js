import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

const SKILL_PATHS = [
  ".claude/skills/learning-loop/SKILL.md",
  ".factory/skills/learning-loop/SKILL.md",
];

for (const rel of SKILL_PATHS) {
  const fullPath = join(ROOT, rel);

  test(`${rel} references loop_describe`, () => {
    assert.ok(existsSync(fullPath), `expected ${rel} to exist`);
    const content = readFileSync(fullPath, "utf8");
    assert.ok(content.includes("loop_describe"), `expected ${rel} to contain "loop_describe"`);
  });

  test(`${rel} references meta_state_list`, () => {
    const content = readFileSync(fullPath, "utf8");
    assert.ok(content.includes("meta_state_list"), `expected ${rel} to contain "meta_state_list"`);
  });
}

test("both SKILL.md files reference the interface contract", () => {
  for (const rel of SKILL_PATHS) {
    const fullPath = join(ROOT, rel);
    const content = readFileSync(fullPath, "utf8");
    assert.ok(
      content.includes("interface/CONTRACT.md"),
      `expected ${rel} to contain "interface/CONTRACT.md"`
    );
  }
});
