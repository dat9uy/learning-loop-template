// R2 guard: locks the 4 fallowrc ignore lines that prevent fallow from
// flagging 192 test files as `unused-files`.
//
// Fallo 3.3.0 (the project's pinned version) does NOT have a vitest plugin
// that auto-registers `*.test.*` as entry points. The vitest migration's
// plan claimed otherwise, but the empirical check shows fallow's
// `list --entry-points` returns only manual-entry files. Until fallow
// ships such a plugin, the 4 `**/*.test.{js,cjs}` + `**/*.spec.{js,cjs}`
// lines in `.fallowrc.json` are required to suppress the false-positive
// unused-file flood.
//
// This guard asserts those 4 lines are present. If a future commit removes
// them (assuming the plugin exists or is shipping), this test fails and
// the removal must be paired with adding the actual fallow vitest plugin
// to the project's pinned fallow version.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// File lives at tools/learning-loop-mastra/__tests__/r2/fallow-test-tree-clean.test.js
// To get to repo root, traverse up 4 levels: r2 → __tests__ → learning-loop-mastra → tools → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");

describe("fallow test-tree ignore guard (Phase 2 R13)", () => {
  test(".fallowrc.json keeps the 4 test/spec ignore lines (fallow 3.3.0 lacks a vitest plugin; without these, 192 unused-file false positives)", () => {
    const fallowrc = JSON.parse(
      readFileSync(join(ROOT, "tools/learning-loop-mastra/.fallowrc.json"), "utf8"),
    );
    const ignore = Array.isArray(fallowrc.ignorePatterns) ? fallowrc.ignorePatterns : [];
    const requiredPatterns = ["**/*.test.js", "**/*.test.cjs", "**/*.spec.js", "**/*.spec.cjs"];
    for (const required of requiredPatterns) {
      expect(
        ignore.includes(required),
        `${required} must remain in .fallowrc.json's ignorePatterns. Fallo 3.3.0 does ` +
          `not register test files as entry points (no vitest plugin); removing this line ` +
          `reintroduces a 192-item unused-file false-positive flood. If a future commit removes ` +
          `this line, pair it with the actual fallow vitest plugin registration (when fallow ships ` +
          `such a plugin).`,
      ).toBe(true);
    }
  });
});