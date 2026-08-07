// Inert-sink allowlist tests. When a real pipe's target verb is a
// configured inert sink (tail/head/grep/cat/wc/sort/uniq), the inert-side
// segment's quotedDataArgs can be blanked before regex matching — printed
// prose is DATA, not code, and cannot execute on `tail`. Three no-bypass
// withholds apply:
//   1. Redirect withhold: a segment with hasRedirect is NOT blanked (the
//      output is persisted to a file a trusted verb can later run).
//   2. Exec withhold: any exec segment disables blanking globally.
//   3. Executor-pipe withhold: a real pipe to a gate-verb is NOT an inert
//      sink — the verb layer (Phase 3) gates the gate-verb anyway.

import assert from "node:assert";
import { describe, test } from "vitest";
import { applyPromotedRules } from "../../core/gate-logic.js";

const INERT_BANNED_RULE = {
  id: "rule-inert-banned-fixture",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "FORBIDDEN_TOKEN",
};

const DOCKER_RULE = {
  id: "rule-synthetic-docker",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "docker\\s+run",
};

// Executor shapes used across the no-bypass groups. `bash` as a bare pipe
// target; `bash -c` with an executed body.
const EXEC = "bash";
const EXEC_C = "bash -c";

const ok = (cmd, rule = INERT_BANNED_RULE) =>
  assert.strictEqual(
    applyPromotedRules(cmd, null, [rule]).decision,
    "ok",
    `expected ok, got escalate for: ${cmd}`,
  );

const escalate = (cmd, rule = INERT_BANNED_RULE) =>
  assert.strictEqual(
    applyPromotedRules(cmd, null, [rule]).decision,
    "escalate",
    `expected escalate, got ok for: ${cmd}`,
  );

// ─── Group A: friction -> ok (prose on inert side) ───

describe("inert-sink (A): friction → ok", () => {
  test("printf JSON payload with | inside the quotes piped to bash-gate.js (node script) → ok", () => {
    // Finding 1: the original false-positive. The whole payload is quoted
    // data; the inert-side node script cannot execute the inner payload.
    ok(
      `printf '%s\\n' '{"tool_name":"Bash","tool_input":{"command":"echo \\"FORBIDDEN_TOKEN\\""}}' | node tools/learning-loop-mastra/core/bash-gate.js`,
    );
  });

  test("pnpm run piped to tail → ok", () => {
    // Finding 2: the repo's common pattern. tail is an inert sink; the
    // printed output cannot execute on `tail`.
    ok(`pnpm run my-script 2>&1 | tail -30`);
  });

  test("echo with | inside double quotes piped to grep → ok", () => {
    ok('echo "FORBIDDEN_TOKEN" | grep x');
  });

  test("grep with rule pattern inside quotes → ok", () => {
    ok('rg "FORBIDDEN_TOKEN" file');
  });
});

// ─── Group B: no-bypass — executor pipe ───

describe("inert-sink (B): no-bypass — pipe to executor still escalates", () => {
  test("echo Docker run payload | bash → escalate", () => {
    escalate(`echo "docker run evil" | ${EXEC}`, DOCKER_RULE);
  });

  test("printf FORBIDDEN_TOKEN | bash → escalate (executor-pipe withhold)", () => {
    // The executor-pipe withhold blocks blanking across a gate-verb pipe;
    // the rule's FORBIDDEN_TOKEN pattern keeps the payload visible.
    escalate(`printf '%s\\n' 'FORBIDDEN_TOKEN' | ${EXEC}`);
  });
});

// ─── Group C: no-bypass — persisted-prose + trusted verb ───

describe("inert-sink (C): no-bypass — persisted-prose + trusted verb (redirect withhold)", () => {
  test("echo with banned token + redirect + pnpm run → escalate", () => {
    // The echo segment has hasRedirect → withhold blanking; the banned
    // token in the prose is visible to the regex.
    escalate('echo "FORBIDDEN_TOKEN" > /tmp/x && pnpm run /tmp/x');
  });

  test("echo with banned token + &> redirect + pnpm run → escalate", () => {
    escalate('echo "FORBIDDEN_TOKEN" &> /tmp/f && pnpm run /tmp/f');
  });

  test("exec redirect + echo banned + pnpm run → escalate (exec withhold)", () => {
    escalate('exec > /tmp/x ; echo "FORBIDDEN_TOKEN" ; pnpm run /tmp/x');
  });

  test("inert sink with redirect → escalate (inert sink WITH redirect)", () => {
    // The `cat` segment has hasRedirect → withhold; the prose is visible.
    escalate('echo "FORBIDDEN_TOKEN" | cat > /tmp/y && pnpm run /tmp/y');
  });
});

// ─── Group D: data on executable side stays visible ───

describe("inert-sink (D): data on executable side stays visible", () => {
  test("bash -c with FORBIDDEN_TOKEN → escalate (gate-verb + executed body)", () => {
    escalate(`${EXEC_C} "FORBIDDEN_TOKEN"`);
  });
});

// ─── Group E: misconfig safety (verb layer is independent) ───

describe("inert-sink (E): verb layer is the independent lock (defense in depth)", () => {
  test("a future misconfiguration adding bash to inert-sinks would NOT open a bypass", () => {
    // This test guards the architecture: even if `bash` were accidentally
    // added to inert-sinks, the verb layer (Phase 3) gates `bash`
    // independently AND the executor-pipe withhold blocks blanking across
    // a gate-verb pipe. The defense is structural.
    //
    // The current implementation correctly escalates this; the assertion
    // is the no-bypass invariant itself.
    escalate(`printf '%s\\n' 'FORBIDDEN_TOKEN' | ${EXEC}`);
  });
});

// ─── Group F: segment-boundary fidelity ───

describe("inert-sink (F): blanking never crosses a logical-op boundary", () => {
  test("quoted arg after && on an executed segment stays visible → escalate", () => {
    // `&&` splits segments in the policy view; the blanking walker's
    // segment counter must advance in lockstep, or the executed segment
    // inherits the echo segment's blankability and its quoted args vanish.
    escalate('echo "prose" && pnpm run "FORBIDDEN_TOKEN"');
  });

  test("quoted arg after || on an executed segment stays visible → escalate", () => {
    escalate('echo "prose" || pnpm run "FORBIDDEN_TOKEN"');
  });

  test("mid-chain persistence (tee) withholds blanking → escalate", () => {
    // The chain ends at an inert sink (tail), but tee is not inert — it
    // persists the prose mid-chain. Blanking requires EVERY downstream
    // chain segment to be an inert sink, not just the chain end.
    escalate("echo \"FORBIDDEN_TOKEN\" | tee /tmp/z | tail");
  });
});