import { defineConfig } from "vitest/config";

// Vitest migration — Phase 1 / 2 config.
//
// include covers the 234-file test tree:
//   - tools/learning-loop-mastra/**/*.test.{js,cjs,mjs} — 222 files (was the
//     c8-included subset; widened so vitest also runs spec files).
//   - .claude/coordination/__tests__/*.test.cjs — 8 files (gate tests run as
//     script-style; vitest wrap transform converts to test() in Phase 2).
//   - .factory/hooks/__tests__/*.test.cjs — 4 files.
//
// testTimeout / hookTimeout: 120000 (red-team C2: the 6 before(fn,{timeout})
// hooks bootstrap a Mastra MCP server; default 10s flakes).
//
// reporters: default + json — agent-context fix (vitest --reporter=json emits
// `.test-logs/vitest-results.json` with numFailedTests + assertionResults[]).
//
// coverage provider: v8 (native V8 coverage; vitest 3.2.0+ emits an
// Istanbul-shaped coverage-final.json so fallow:gate accepts it without a
// third-party adapter).

export default defineConfig({
  test: {
    include: [
      "tools/learning-loop-mastra/**/*.test.{js,cjs,mjs}",
      ".claude/coordination/__tests__/*.test.cjs",
      ".factory/hooks/__tests__/*.test.cjs",
    ],
    exclude: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/dist/**",
      // Scout test fixtures — intentionally failing test inputs that the scout
      // pipeline runs as fixed corpora. They are not real tests and must not
      // pollute vitest's pass/fail tally. The fallow ignore pattern keeps them
      // out of dead-code analysis for the same reason.
      "tools/learning-loop-mastra/scout/pipeline/test-fixtures/**",
    ],
    testTimeout: 120000,
    hookTimeout: 120000,
    globals: true, // The 12 .claude/coordination/ + .factory/hooks/ gate tests are CJS and cannot `require("vitest")` — vitest globals let those files run without an import.
    reporters: ["default", "json"],
    outputFile: {
      json: ".test-logs/vitest-results.json",
    },
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
      reportsDirectory: "coverage",
      include: ["tools/learning-loop-mastra/**/*.js"],
      exclude: ["**/*.test.{js,cjs,mjs}", "**/fixtures/**", "**/__tests__/helpers/**"],
      clean: false,
      enabled: true,
    },
  },
});
