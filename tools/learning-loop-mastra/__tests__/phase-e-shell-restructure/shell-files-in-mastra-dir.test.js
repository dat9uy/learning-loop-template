import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const MASTRA_DIR = join(PROJECT_ROOT, "tools", "learning-loop-mastra", "mastra");

const EXPECTED_FILES = [
  "server.js",
  "create-loop-tool.js",
  "create-loop-workflow.js",
  "create-loop-agent.js",
  "legacy-handler-adapter.js",
  "schema-parity.js",
  "schemas.js",
];

const EXPECTED_SUBDIRS = ["workflows", "agents"];

test("mastra/ contains the 7 expected shell files", () => {
  for (const f of EXPECTED_FILES) {
    assert.ok(
      existsSync(join(MASTRA_DIR, f)),
      `mastra/${f} must exist post-move`
    );
  }
});

test("mastra/ contains the 2 expected subdirs (workflows, agents)", () => {
  const entries = readdirSync(MASTRA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const sub of EXPECTED_SUBDIRS) {
    assert.ok(entries.includes(sub), `mastra/${sub}/ must exist post-move`);
  }
});

test("mastra/workflows-manifest.json and mastra/agents-manifest.json are at the new location", () => {
  assert.ok(
    existsSync(join(MASTRA_DIR, "workflows-manifest.json")),
    "mastra/workflows-manifest.json must exist post-move (was at top level pre-Plan-6)"
  );
  assert.ok(
    existsSync(join(MASTRA_DIR, "agents-manifest.json")),
    "mastra/agents-manifest.json must exist post-move (was at top level pre-Plan-6)"
  );
  // And NOT at top level
  assert.ok(
    !existsSync(join(PROJECT_ROOT, "tools", "learning-loop-mastra", "workflows-manifest.json")),
    "tools/learning-loop-mastra/workflows-manifest.json must NOT exist post-move (moved to mastra/)"
  );
  assert.ok(
    !existsSync(join(PROJECT_ROOT, "tools", "learning-loop-mastra", "agents-manifest.json")),
    "tools/learning-loop-mastra/agents-manifest.json must NOT exist post-move (moved to mastra/)"
  );
});

test("mastra/workflows/ contains all 10 workflow files", () => {
  const expectedWorkflows = [
    "workflow-classify-prompt.js",
    "workflow-intake-orient.js",
    "workflow-intake-plan.js",
    "workflow-intentional-skip.js",
    "workflow-prepare-runtime-request.js",
    "workflow-report-phase-status.js",
    "workflow-runtime-probe.js",
    "workflow-self-improvement.js",
    "workflow-storage-read.js",
    "workflow-storage-round-trip.js",
  ];
  const workflowsDir = join(MASTRA_DIR, "workflows");
  for (const f of expectedWorkflows) {
    assert.ok(existsSync(join(workflowsDir, f)), `mastra/workflows/${f} must exist`);
  }
});
