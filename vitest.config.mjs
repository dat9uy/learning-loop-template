import { defineConfig } from "vitest/config";

// Vitest hybrid test tiering — `unit` (fast, no subprocess) and `e2e` (MCP
// server + CLI subprocess). See `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/`.
//
// Shared config (top-level `test`):
//   - timeouts 120s for the 6 `before(fn,{timeout})` hooks that bootstrap a Mastra MCP server.
//   - reporters default + json — agent-context fix (vitest --reporter=json emits
//     `.test-logs/vitest-results.json` with numFailedTests + assertionResults[]).
//   - globals: true — the 12 .claude/coordination/ + .factory/hooks/ gate tests are CJS and
//     cannot `require("vitest")`; vitest globals let those files run without an import.
//
// Coverage:
//   - istanbul (chosen over v8 because fallow:gate's coverage input requires
//     Istanbul-format JSON; @vitest/coverage-istanbul produces it natively).
//   - top-level `enabled: true` so CI/pre-push (running all projects) collects
//     coverage from every project; `unit` overrides to `false` so the pre-commit
//     fast gate skips the ~19s istanbul transform tax.
//
// Project boundary:
//   - `unit` = the 4 original globs MINUS the 19 e2e files (see
//     `tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js`
//     for the guard test).
//   - `e2e` = the explicit 19-file list (Strategy A from the plan: explicit list
//     + guard test, KISS; drift caught loud by the guard, not silently).
//
// Known noise: vitest's coverage instrumentation emits `vite:dynamic-import-vars`
// warnings for `mastra/server.js` and `agents/build-meta-state-tools.js` (they
// use dynamic `import(\`./${file}\`)` for plugin loading). Intentional production
// pattern; warnings are cosmetic. Suppressing would require a production change.

const E2E_FILES = [
  ".claude/coordination/__tests__/claude-code-mcp-loading.test.cjs",
  "tools/learning-loop-mastra/__tests__/agent-parity.test.cjs",
  "tools/learning-loop-mastra/__tests__/cli-mcp-subset-registration.test.js",
  "tools/learning-loop-mastra/__tests__/cli-read-parity.test.js",
  "tools/learning-loop-mastra/__tests__/cli-write-parity.test.js",
  "tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/loop-get-instruction.test.js",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-list-id-stdio.test.js",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-derived-schema.test.js",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/zod-coerce-top-level.test.js",
  "tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js",
  "tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js",
  "tools/learning-loop-mastra/__tests__/meta-state-patch-jit-payload.test.js",
  "tools/learning-loop-mastra/__tests__/mutex-scope.test.js",
  "tools/learning-loop-mastra/__tests__/server-runid.test.js",
  "tools/learning-loop-mastra/__tests__/storage-parity.test.cjs",
  "tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs",
];

const BASE_INCLUDE = [
  "tools/learning-loop-mastra/**/*.test.{js,cjs,mjs}",
  ".claude/coordination/__tests__/*.test.cjs",
  ".factory/hooks/__tests__/*.test.cjs",
  "tools/scripts/__tests__/*.test.js",
];

export default defineConfig({
  test: {
    testTimeout: 120000,
    hookTimeout: 120000,
    globals: true,
    reporters: ["default", "json"],
    outputFile: {
      json: ".test-logs/vitest-results.json",
    },
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
    // Coverage is configured per-project (see below). Vitest 4's per-project
    // `coverage.enabled: false` does NOT actually disable coverage when the
    // root has `enabled: true` — coverage-final.json gets generated either way.
    // So coverage lives ONLY on the e2e project. When `pnpm test` runs both
    // projects, the e2e project's coverage is the one emitted. Unit-only
    // changes will not appear in coverage-final.json; the plan accepts this
    // as a known minor regression (unit files have low CRAP, fallow's CRAP
    // inflation is bounded).
    projects: [
      {
        test: {
          name: "unit",
          include: BASE_INCLUDE,
          // Files that match the e2e markers (`connectMcpServer` /
          // `with-mcp-server`) are excluded from the unit project. The
          // guard test (`test-tier-e2e-membership.test.js`) greps the
          // same markers and asserts the e2e project's include equals
          // this exclude — drift becomes a loud failure, not a silent
          // misclassification.
          exclude: [
            ...E2E_FILES,
            // Scout test fixtures — intentionally failing test inputs
            // that the scout pipeline runs as fixed corpora. Must not
            // pollute vitest's pass/fail tally. vitest 4's `projects`
            // config does NOT inherit `exclude` from the root — repeat
            // per project.
            "tools/learning-loop-mastra/scout/pipeline/test-fixtures/**",
          ],
          // CJS gate tests under `.claude/coordination/__tests__` and
          // `.factory/hooks/__tests__` cannot `require("vitest")`; they
          // rely on vitest globals. vitest 4's `projects` config does
          // NOT inherit `globals: true` from the root — must repeat per project.
          globals: true,
          // The 6 `before(fn,{timeout})` hooks that bootstrap a Mastra MCP
          // server need >5s; default vitest 4 timeout is 5s. The root
          // testTimeout/hookTimeout do NOT propagate to projects in
          // vitest 4 — repeat per project.
          testTimeout: 120000,
          hookTimeout: 120000,
        },
      },
      {
        test: {
          name: "e2e",
          include: E2E_FILES,
          exclude: [
            "tools/learning-loop-mastra/scout/pipeline/test-fixtures/**",
          ],
          globals: true,
          testTimeout: 120000,
          hookTimeout: 120000,
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
      },
    ],
  },
});