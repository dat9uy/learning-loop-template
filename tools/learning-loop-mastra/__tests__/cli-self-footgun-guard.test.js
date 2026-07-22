import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateBashGate } from "../core/evaluate-bash-gate.js";
import { metaStatePromoteRuleTool } from "../tools/handlers/meta-state-promote-rule-tool.js";
import { metaStateReportTool } from "../tools/handlers/meta-state-report-tool.js";

const CLI_COMMAND = "node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{}'";
const CLI_MATCH_PATTERN = String.raw`\bnode\s+tools/learning-loop-mastra/bin/loop\.mjs\b`;

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.sequential("a promoted regex can intercept the CLI transport", async () => {
  const originalRoot = process.env.GATE_ROOT;
  const originalMode = process.env.LOOP_SESSION_MODE;
  const root = mkdtempSync(join(tmpdir(), "cli-self-footgun-"));
  process.env.GATE_ROOT = root;
  process.env.LOOP_SESSION_MODE = "live";

  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "cli-self-footgun-fixture",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Fixture proving whether a promoted gate regex can intercept the CLI transport.",
    });
    const finding = JSON.parse(report.content[0].text);

    const promotion = await metaStatePromoteRuleTool.handler({
      id: finding.id,
      rule_id: "rule-test-cli-self-footgun",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: CLI_MATCH_PATTERN,
    });
    const promoted = JSON.parse(promotion.content[0].text);
    assert.strictEqual(promoted.promoted, true, "promotion path currently accepts the self-matching rule");

    const decision = evaluateBashGate({ command: CLI_COMMAND, root });
    assert.strictEqual(
      decision.decision,
      "escalate",
      `the promoted rule must intercept CLI invocation; got ${JSON.stringify(decision)}`,
    );
    assert.strictEqual(decision.rule_id, "rule-test-cli-self-footgun");
  } finally {
    restoreEnv("GATE_ROOT", originalRoot);
    restoreEnv("LOOP_SESSION_MODE", originalMode);
  }
});
