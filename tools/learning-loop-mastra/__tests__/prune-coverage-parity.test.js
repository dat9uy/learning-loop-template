// Phase 0 hygiene gate.
//
// Verifies the test-tree prune + over-broad fallow ignore retirement landed
// cleanly. Each PRUNE_FILE row was confirmed dead/redundant in the
// 2026-07-13 scout pass; tool-deletion-coverage / schema-deletion-coverage
// were dropped from the prune list after the confirmation diff proved the
// asserted manifest/schema counts are live invariants.
//
// This file lives directly under __tests__/ so the mastra-js namespace glob
// (`__tests__/*.test.js`) picks it up; subdirectory placement under
// `freshness/` would not be matched.
//
// "pnpm test stays green" is the real load-bearing-coverage assertion; this
// gate is the structural counterpart. If pnpm test is green but these rows
// fail, the prune is incomplete; if these rows pass but pnpm test fails, the
// prune dropped load-bearing coverage.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LL = dirname(fileURLToPath(import.meta.url)) + "/..";

const PRUNE_FILES = [
  "__tests__/legacy-cleanup.test.cjs",
  "__tests__/server-name-rename.test.cjs",
  "__tests__/legacy-mcp/fix-loop-design-refs.test.js",
  "__tests__/legacy-mcp/lifecycle-migration-finalize.test.js",
  "__tests__/legacy-mcp/g8-subcommand-class-entry.test.js",
  "__tests__/legacy-mcp/no-stale-ref-category-enum.test.js",
  "__tests__/legacy-mcp/sp0-change-log-self-log.test.js",
  "__tests__/legacy-mcp/sp1-derive-status-acceptance.test.js",
  "__tests__/legacy-mcp/sp2-check-grounding-acceptance.test.js",
  "__tests__/phase-e-foundation/agents-section-1-layers.test.js",
  "__tests__/phase-e-foundation/fcis-invariant.test.js",
  "__tests__/phase-e-foundation/no-core-legacy-refs.test.js",
  "__tests__/phase-e-foundation/schema-doc-exists.test.js",
  "__tests__/phase-e-shell-restructure/agents-md-layer-locations.test.js",
  "__tests__/phase-e-shell-restructure/external-refs-updated.test.js",
  "__tests__/phase-e-shell-restructure/meta-state-fingerprints-repointed.test.js",
  "__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js",
  "__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js",
  "__tests__/phase-e-shell-restructure/test-relative-imports.test.js",
  "__tests__/interface/interface-dir-exists.test.js",
  "__tests__/debug/agent-e2e-integration.test.cjs",
];

describe("Phase 0 hygiene gate — prune", () => {
  for (const rel of PRUNE_FILES) {
    test(`prune: ${rel} deleted`, () => {
      assert.strictEqual(
        existsSync(join(LL, rel)),
        false,
        `prune file still exists: ${rel}`,
      );
    });
  }
});

describe("Phase 0 hygiene gate — fallowrc ignore retirement", () => {
  test("__tests__/legacy-mcp/** removed from .fallowrc.json", () => {
    const fallowrc = JSON.parse(readFileSync(join(LL, ".fallowrc.json"), "utf8"));
    const ignore = Array.isArray(fallowrc.ignorePatterns) ? fallowrc.ignorePatterns : [];
    assert.strictEqual(
      ignore.includes("__tests__/legacy-mcp/**"),
      false,
      "legacy-mcp/** ignore should be removed (post-prune, only 2 files are still under legacy-mcp that fallow would flag — neither load-bearing)",
    );
  });

  test("**/*.test.{js,cjs} ignore lines REMAIN (fallow 3.3.0 lacks a vitest plugin, so test files must stay ignored to avoid 192 unused-file false positives — see r2/fallow-test-tree-clean for the regression guard)", () => {
    const fallowrc = JSON.parse(readFileSync(join(LL, ".fallowrc.json"), "utf8"));
    const ignore = Array.isArray(fallowrc.ignorePatterns) ? fallowrc.ignorePatterns : [];
    assert.strictEqual(
      ignore.includes("**/*.test.js"),
      true,
      "**/*.test.js must remain in ignorePatterns while fallow lacks a vitest plugin",
    );
    assert.strictEqual(ignore.includes("**/*.test.cjs"), true);
    assert.strictEqual(ignore.includes("**/*.spec.js"), true);
    assert.strictEqual(ignore.includes("**/*.spec.cjs"), true);
  });
});