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
//   - `unit` = the 4 original globs MINUS the e2e files (see
//     `tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js`
//     for the guard test).
//   - `e2e` = the explicit e2e file list — MCP-server-spawning tests AND
//     CLI-subprocess tests that `spawnSync`/`spawn` the `bin/loop.mjs` binary
//     (Strategy A from the plan: explicit list + guard test, KISS; drift
//     caught loud by the guard, not silently).
//
// Known noise: vitest's coverage instrumentation emits `vite:dynamic-import-vars`
// warnings for `mastra/server.js` and `agents/build-meta-state-tools.js` (they
// use dynamic `import(\`./${file}\`)` for plugin loading). Intentional production
// pattern; warnings are cosmetic. Suppressing would require a production change.

const E2E_FILES = [
  ".claude/coordination/__tests__/claude-code-mcp-loading.test.cjs",
  ".claude/coordination/__tests__/gate-integration.test.cjs",
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
  "tools/learning-loop-mastra/__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs",
  "tools/learning-loop-mastra/__tests__/legacy-mcp/zod-coerce-top-level.test.js",
  "tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs",
  "tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js",
  "tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js",
  "tools/learning-loop-mastra/__tests__/meta-state-patch-jit-payload.test.js",
  "tools/learning-loop-mastra/__tests__/mutex-scope.test.js",
  "tools/learning-loop-mastra/__tests__/server-runid.test.js",
  "tools/learning-loop-mastra/__tests__/storage-parity.test.cjs",
  "tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs",
  "tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs",
  // CLI-subprocess tests: spawn the `bin/loop.mjs` binary directly via
  // spawnSync/spawn. The plan's e2e definition is "MCP-server-spawning OR
  // CLI-subprocess"; these are the CLI-spawn half. Caught by the `LOOP_BIN`
  // / `cliPath` markers in the guard test (the spawn-arg variables that
  // carry the loop.mjs path). Mention-only files that reference the path in
  // comments/strings use `CLI_BIN_PATH`/`CLI_COMMAND` and are NOT caught.
  "tools/learning-loop-mastra/__tests__/cli-args-file-dispatch.test.js",
  "tools/learning-loop-mastra/__tests__/cli-schema-flag.test.js",
  "tools/learning-loop-mastra/__tests__/cli-workflow-dispatch.test.js",
  "tools/learning-loop-mastra/__tests__/cli-write-exit-codes.test.js",
  "tools/learning-loop-mastra/__tests__/runtime-state-versioned-dedup.test.js",
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
    // Coverage at the root so `pnpm test` (both projects, pre-push gate)
    // instruments ALL source files — fallow:gate then sees full coverage and
    // does not flag unit-exercised functions as 0%-tested. The fast pre-commit
    // gate (`pnpm test:unit`) overrides this via the `--coverage.enabled=false`
    // CLI flag (CLI flags DO override root config in vitest 4, unlike the
    // per-project `coverage.enabled: false` quirk) so the unit project skips
    // the ~19s istanbul transform tax. `clean: false` preserves coverage across
    // the unit+e2e merge when `pnpm test` runs both projects.
    coverage: {
      provider: "istanbul",
      reporter: ["json"],
      reportsDirectory: "coverage",
      include: ["tools/learning-loop-mastra/**/*.js"],
      exclude: ["**/*.test.{js,cjs,mjs}", "**/fixtures/**", "**/__tests__/helpers/**"],
      clean: false,
      enabled: true,
    },
    projects: [
      {
        test: {
          name: "unit",
          include: BASE_INCLUDE,
          // E2E files (MCP-server-spawning AND CLI-subprocess-spawning) are
          // excluded from the unit project. The guard test
          // (`test-tier-e2e-membership.test.js`) greps the marker set
          // (`connectMcpServer`/`with-mcp-server`/`StdioClientTransport`/
          // `@modelcontextprotocol/sdk/client`/`LOOP_BIN`/`cliPath`) and
          // asserts the e2e project's include equals this exclude — drift
          // becomes a loud failure, not a silent misclassification.
          exclude: [
            ...E2E_FILES,
            // Scout test fixtures — intentionally failing test inputs
            // that the scout pipeline runs as fixed corpora. Must not
            // pollute vitest's pass/fail tally. vitest 4's `projects`
            // config does NOT inherit `exclude` from the root — repeat
            // per project.
            "tools/learning-loop-mastra/scout/pipeline/test-fixtures/**",
          ],
          // Coverage is disabled for the pre-commit unit gate via the
          // `--coverage.enabled=false` CLI flag in the `test:unit` script
          // (CLI flags override root config; the per-project
          // `coverage.enabled: false` quirk does not apply to CLI overrides).
          // The full `pnpm test` (pre-push) runs both projects with root
          // coverage on, so unit-exercised source files ARE instrumented and
          // fallow:gate sees their coverage (no false 0%-tested CRAP inflation).
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
        },
      },
    ],
  },
});
