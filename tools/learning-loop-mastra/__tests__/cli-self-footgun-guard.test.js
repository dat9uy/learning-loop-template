// cli-self-footgun-guard.test.js — Phase 1 of plans/260722-1343-write-capable-cli-w.
//
// The activation path of `meta_state_promote_rule` MUST reject a regex
// pattern that matches canonical CLI invocation shapes. Without this guard,
// a runtime can brick its own CLI transport by promoting a regex that
// intercepts every `node bin/loop.mjs ...` command (the bash gate is
// default-allow with promoted-rule escalation; a self-matching rule turns
// every CLI call into a gate escalation).
//
// Phase 1 flips the lock: today's "unguarded → accepted + intercepts" is
// replaced with "unguarded → rejected + named reason + gate-log row".
// Shape coverage: relative + absolute + bare forms; the helper
// `matchesCliTransport(pattern)` in core/cli-self-match.js owns the shape
// list so guard and test share one source of truth.

import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateBashGate } from "../core/evaluate-bash-gate.js";
import { metaStatePromoteRuleTool } from "../tools/handlers/meta-state-promote-rule-tool.js";
import { metaStateReportTool } from "../tools/handlers/meta-state-report-tool.js";
import { matchesCliTransport, CLI_INVOCATION_SHAPES } from "../core/cli-self-match.js";

const CLI_COMMAND = "node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{}'";

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.sequential("a promoted regex matching the CLI invocation shape is rejected (no rule is activated)", async () => {
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
      pattern: String.raw`\bnode\s+tools/learning-loop-mastra/bin/loop\.mjs\b`,
    });
    const promoted = JSON.parse(promotion.content[0].text);
    assert.strictEqual(promoted.promoted, false, "self-matching rule must be rejected by activation guard");
    assert.strictEqual(promoted.reason, "pattern_matches_cli_transport", `named reason required; got ${promoted.reason}`);

    // No rule was promoted → evaluateBashGate must still be ok.
    const decision = evaluateBashGate({ command: CLI_COMMAND, root });
    assert.strictEqual(decision.decision, "ok", `the rejected rule must NOT intercept CLI; got ${JSON.stringify(decision)}`);
  } finally {
    restoreEnv("GATE_ROOT", originalRoot);
    restoreEnv("LOOP_SESSION_MODE", originalMode);
  }
});

test("canonical CLI invocation shapes cover relative + absolute + bare forms", () => {
  assert.ok(Array.isArray(CLI_INVOCATION_SHAPES) && CLI_INVOCATION_SHAPES.length >= 3, "must export at least three canonical shapes (relative, absolute, bare)");
  // Every shape must be a valid RegExp source string.
  for (const s of CLI_INVOCATION_SHAPES) {
    assert.strictEqual(typeof s, "string");
    assert.ok(s.length > 0);
    new RegExp(s); // throws if invalid
  }
});

test("matchesCliTransport catches all canonical shapes", () => {
  assert.strictEqual(matchesCliTransport(String.raw`\bnode\s+tools/learning-loop-mastra/bin/loop\.mjs\b`), true);
  assert.strictEqual(matchesCliTransport(String.raw`\bnode\s+.*bin/loop\.mjs\b`), true);
  assert.strictEqual(matchesCliTransport(String.raw`\bnode\s+.*loop\.mjs\b`), true);
  // Non-matching patterns: unrelated tool paths.
  assert.strictEqual(matchesCliTransport(String.raw`\bcurl\b`), false);
  assert.strictEqual(matchesCliTransport(String.raw`\bsome-other-script\.mjs\b`), false);
});
