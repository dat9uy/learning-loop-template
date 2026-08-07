// Regression tests for the loop CLI inline-JSON argv false-positive class.
//
// The bash gate's promoted-rule pass evaluates each rule's regex against the
// flat `tool_input.command` string. For the canonical loop tool surface
//   `node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'`
// the inline JSON argument is user-supplied DATA, not a shell command. When
// that JSON contains a banned test-pipe pattern (e.g. a meta_state_resolve
// payload describing a prior TDD loop), rule-no-raw-stdout-vitest matches the
// data and the gate escalates — blocking the CLI call. stripCliArgvPayload
// blanks the quoted JSON argv (quote-kind-aware) so the regex sees only the
// command verb.
//
// Locks (per plan 260807-1401-bash-gate-cli-argv-payload-strip):
//  - cases 4/4b: inline JSON argv (single AND double quoted, no `$(`) → ok
//  - case 7:    double-quoted `"$(pnpm test | tail)"` stays escalate (real
//               shell execution — the bypass the fix must NOT open)
//  - cases 1/4d/5/6: real pipes, locked echo limitation, real violations → escalate
//  - case 3:   `node -e` body → ok (already handled by stripNodeEvalBody; lock)
//  - spoofed recognition (non-canonical path, trailing token, arg-embedded
//               loop.mjs) → escalate (the helper must not over-blank)
//
// Mirrors the gate-logic-data-command-quotes.test.js idiom (inline VITEST_RULE
// fixture + applyPromotedRules). Phase 1 imports ONLY existing exports —
// stripCliArgvPayload unit tests are added in Phase 2 alongside the helper.

import assert from "node:assert";
import { describe, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPromotedRules,
  matchConstraintPattern,
  stripCliArgvPayload,
} from "../../core/gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDLERS_DIR = join(__dirname, "../../tools/handlers");

const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  // Live rule pattern (meta-state v2, refined to close the head loophole).
  pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b",
};

const CLI_BIN = "tools/learning-loop-mastra/bin/loop.mjs";

const ok = (cmd) =>
  assert.strictEqual(
    applyPromotedRules(cmd, null, [VITEST_RULE]).decision,
    "ok",
    `expected ok, got escalate for: ${cmd}`,
  );
const escalate = (cmd) => {
  const r = applyPromotedRules(cmd, null, [VITEST_RULE]);
  assert.strictEqual(r.decision, "escalate", `expected escalate, got ok for: ${cmd}`);
  assert.strictEqual(r.rule_id, "rule-no-raw-stdout-vitest");
};

describe("cli argv payload: false-positive cases (must NOT match)", () => {
  test("case 4: double-quoted inline JSON argv with the banned pattern → ok", () => {
    // The JSON is data; the `\"` are escaped inner quotes. No `$(`/backtick.
    ok(`node ${CLI_BIN} meta_state_resolve "{\\"id\\":\\"x\\",\\"resolution\\":\\"repro: pnpm test 2>&1 | tail\\"}"`);
  });

  test("case 4b: single-quoted inline JSON argv with the banned pattern → ok", () => {
    // Single-quoted JSON is the realistic loop CLI form (inner `"` are literal).
    ok(`node ${CLI_BIN} meta_state_resolve '{"id":"x","resolution":"repro: pnpm test 2>&1 | tail"}'`);
  });

  test("case 4c: --args-file form (no inline JSON) → ok (lock)", () => {
    // The banned pattern is not in the command string at all.
    ok(`node ${CLI_BIN} meta_state_resolve --args-file /tmp/x.json`);
  });

  test("case 3: node -e body with the banned pattern → ok (stripNodeEvalBody lock)", () => {
    ok(`node -e "console.log(pnpm test | tail)"`);
  });
});

describe("cli argv payload: real violations and locked limitations (must match)", () => {
  test("case 1: pnpm test piped to head → escalate (real pipe)", () => {
    escalate("pnpm test 2>&1 | head -50");
  });

  test("case 7: double-quoted \"$(pnpm test | tail)\" argv → escalate ($(...) IS executed)", () => {
    // `"$(...)"` is shell-expanded before node runs — a REAL violation. The
    // quote-kind-aware blanker must preserve double-quoted `$(...)`. This is
    // the critical bypass the fix must not open.
    escalate(`node ${CLI_BIN} meta_state_resolve "$(pnpm test 2>&1 | tail)"`);
  });

  test("case 4d: loop CLI segment + sibling real pipe → escalate (segment-scoped blanking)", () => {
    // The real pipe is in the sibling `pnpm test 2>&1 | tail` segment, not the
    // loop CLI segment. Blanking is segment-scoped → sibling stays enforceable.
    escalate(`node ${CLI_BIN} meta_state_list '{}' ; pnpm test 2>&1 | tail`);
  });

  test("case 5: echo \"pnpm test | grep\" → escalate (locked echo limitation)", () => {
    // echo is not a data command; the locked echo limitation is out of scope.
    escalate('echo "pnpm test | grep foo"');
  });

  test("case 6: pnpm exec vitest run piped to tail → escalate (real violation)", () => {
    escalate("pnpm exec vitest run 2>&1 | tail");
  });
});

describe("cli argv payload: spoofed recognition (must match — no over-blanking)", () => {
  test("non-canonical relative path ./loop.mjs → escalate", () => {
    // ./loop.mjs does not end with bin/loop.mjs → not the canonical script.
    escalate(`node ./loop.mjs meta_state_resolve 'pnpm test 2>&1 | tail'`);
  });

  test("loop.mjs as a trailing token (not the script) → escalate", () => {
    // loop.mjs is an argument to evil.mjs, not the script-path token.
    escalate(`node evil.mjs 'pnpm test 2>&1 | tail' loop.mjs`);
  });

  test("loop.mjs embedded in another script's arg → escalate", () => {
    // loop.mjs appears inside --name, not positionally as the script.
    escalate(`node /some/other/runner.mjs --name "loop.mjs" --cmd 'pnpm test 2>&1 | tail'`);
  });

  test("nodejs verb: canonical loop CLI inline JSON argv → ok (verb normalization)", () => {
    // nodejs is the same node-family verb; recognition normalizes it.
    ok(`nodejs ${CLI_BIN} meta_state_resolve '{"id":"x","resolution":"repro: pnpm test 2>&1 | tail"}'`);
  });
});

describe("stripCliArgvPayload: unit behavior", () => {
  test("blanks the single-quoted JSON of a canonical loop.mjs segment", () => {
    assert.strictEqual(
      stripCliArgvPayload(`node ${CLI_BIN} meta_state_resolve '{"id":"x","resolution":"pnpm test | tail"}'`),
      `node ${CLI_BIN} meta_state_resolve ''`,
    );
  });

  test("blanks the double-quoted JSON argv when free of $(/backtick", () => {
    assert.strictEqual(
      stripCliArgvPayload(`node ${CLI_BIN} meta_state_resolve "{\\"id\\":\\"x\\",\\"r\\":\\"pnpm test | tail\\"}"`),
      `node ${CLI_BIN} meta_state_resolve ""`,
    );
  });

  test("preserves a double-quoted $(...) argv verbatim (no bypass)", () => {
    const cmd = `node ${CLI_BIN} meta_state_resolve "$(pnpm test 2>&1 | tail)"`;
    assert.strictEqual(stripCliArgvPayload(cmd), cmd);
  });

  test("leaves a sibling real-pipe segment intact (segment-scoped, case 4d)", () => {
    const out = stripCliArgvPayload(`node ${CLI_BIN} meta_state_list '{}' ; pnpm test 2>&1 | tail`);
    assert.ok(out.includes("pnpm test 2>&1 | tail"), `sibling segment must stay visible: ${out}`);
    assert.ok(!out.includes(`'{}'`), `loop CLI quoted argv must be blanked: ${out}`);
  });

  test("no-ops on the --args-file form (no quoted JSON to blank)", () => {
    const cmd = `node ${CLI_BIN} meta_state_resolve --args-file /tmp/x.json`;
    assert.strictEqual(stripCliArgvPayload(cmd), cmd);
  });

  test("no-ops on spoofed recognition shapes (no over-blanking)", () => {
    const a = `node ./loop.mjs meta_state_resolve 'pnpm test 2>&1 | tail'`;
    assert.strictEqual(stripCliArgvPayload(a), a);
    const b = `node evil.mjs 'pnpm test 2>&1 | tail' loop.mjs`;
    assert.strictEqual(stripCliArgvPayload(b), b);
    const c = `node /some/other/runner.mjs --name "loop.mjs" --cmd 'pnpm test 2>&1 | tail'`;
    assert.strictEqual(stripCliArgvPayload(c), c);
  });

  test("recognizes the loop CLI segment after a command prefix (sudo)", () => {
    assert.strictEqual(
      stripCliArgvPayload(`sudo node ${CLI_BIN} meta_state_resolve '{"r":"pnpm test | tail"}'`),
      `sudo node ${CLI_BIN} meta_state_resolve ''`,
    );
  });
});

describe("static bypass guard: CLI tool handlers do not exec argv-derived input", () => {
  // Grounds the bypass-free claim: loop.mjs parses argv JSON via JSON.parse +
  // zod dispatch and never execs it. The handlers under tools/handlers/ are the
  // surface that processes CLI tool arguments — they must not spawn a child
  // process with that input. Passes from start (locks the precondition).
  const handlerFiles = readdirSync(HANDLERS_DIR).filter(
    (f) => f.endsWith(".js") && !f.endsWith(".test.js"),
  );

  test("no handler imports child_process", () => {
    for (const f of handlerFiles) {
      const src = readFileSync(join(HANDLERS_DIR, f), "utf8");
      assert.ok(
        !/child_process/.test(src),
        `${f} imports child_process — breaks the bypass-free precondition`,
      );
    }
  });

  test("no handler calls execSync/spawnSync/execFile/spawn", () => {
    for (const f of handlerFiles) {
      const src = readFileSync(join(HANDLERS_DIR, f), "utf8");
      assert.ok(
        !/\b(execSync|spawnSync|execFile|spawn)\s*\(/.test(src),
        `${f} invokes a child-process exec — breaks the bypass-free precondition`,
      );
    }
  });

  test("matchConstraintPattern: loop CLI inline JSON with banned token → null (data, not command)", () => {
    // Constraint patterns (e.g. package-manager/docker) also must not fire on
    // the inline JSON argv. matchConstraintPattern is NOT wired to
    // stripCliArgvPayload (YAGNI — no observed false-positive), but the inline
    // JSON here carries no constraint token, so this is a baseline lock.
    assert.strictEqual(
      matchConstraintPattern(`node ${CLI_BIN} meta_state_resolve '{"id":"x","resolution":"pnpm test | tail"}'`),
      null,
    );
  });
});