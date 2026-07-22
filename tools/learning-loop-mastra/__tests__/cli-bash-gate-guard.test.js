// cli-bash-gate-guard.test.js — Phase 3 of plans/260721-1933-cli-transport-phase1-read-only-slice.
//
// Guard test for the read-only CLI transport. The bash gate is default-allow
// (core/gate-logic.js:1008-1016 — promoted rules return {decision:"escalate"}
// on match, not "ok"); a read-only `node bin/loop.mjs ...` invocation matches
// no blocking regex and writes no protected path, so it passes as
// { decision: "ok" }.
//
// This test locks the assumption against a future blocking regex rule that
// would silently break the CLI transport. The CLI IS the protection — no
// registry rule was promoted for it.

import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateBashGate } from "../core/evaluate-bash-gate.js";

const CLI_BIN_PATH = "tools/learning-loop-mastra/bin/loop.mjs";
const READ_ONLY_CLI = `node ${CLI_BIN_PATH} meta_state_list '{}'`;
const WRITE_REDIRECT_CLI = `node ${CLI_BIN_PATH} meta_state_list '{}' > meta-state.jsonl`;

describe("cli bash-gate guard (Phase 3)", () => {
  test("read-only CLI command passes the bash gate as decision: 'ok'", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "cli-bash-gate-guard-"));
    const decision = evaluateBashGate({ command: READ_ONLY_CLI, root: tmpRoot });
    assert.strictEqual(decision.decision, "ok", `expected ok; got ${JSON.stringify(decision)}`);
  });

  test("write-shape CLI command (meta_state_report) passes the bash gate as decision: 'ok'", () => {
    // Plan 260722-1343 Phase 1 step 6 — assumption-lock for the write-shape
    // invocation. The CLI IS the write transport for `meta_state_report`
    // (and every CLI_WRITE_TOOLS member); the bash gate is default-allow
    // with promoted-rule escalation, so this MUST continue to pass as
    // `ok` today and after every future promotion. Locks against a future
    // blocking regex rule that would silently break the write channel.
    const WRITE_CLI = `node ${CLI_BIN_PATH} meta_state_report '{}'`;
    const tmpRoot = mkdtempSync(join(tmpdir(), "cli-bash-gate-guard-"));
    const decision = evaluateBashGate({ command: WRITE_CLI, root: tmpRoot });
    assert.strictEqual(decision.decision, "ok", `expected ok; got ${JSON.stringify(decision)}`);
  });

  test("write-redirect variant IS blocked (proves the gate still guards writes)", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "cli-bash-gate-guard-"));
    const decision = evaluateBashGate({ command: WRITE_REDIRECT_CLI, root: tmpRoot });
    assert.strictEqual(decision.decision, "block", `expected block; got ${JSON.stringify(decision)}`);
    assert.strictEqual(decision.hard_block, true, "write-redirect must be a hard block");
  });
});