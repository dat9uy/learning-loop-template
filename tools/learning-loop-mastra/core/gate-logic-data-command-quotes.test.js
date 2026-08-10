// Decision-level locks for data-command quoted-arg blanking (gate-logic.js).
//
// Locks: banned tokens inside a quoted pattern argument to a pure-data
// command (grep/egrep/fgrep/rg/jq) are DATA and must not satisfy a rule.
// Asserted through the public surface (matchConstraintPattern +
// applyPromotedRules with inline rules) rather than strip-helper internals.

import assert from "node:assert";
import { describe, test } from "vitest";
import {
  matchConstraintPattern,
  applyPromotedRules,
} from "./gate-logic.js";

const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b",
};

describe("data-command quote blanking: false-positive cases (must NOT match)", () => {
  test('grep -E "pnpm test|grep" file → ok (the observed scout FP)', () => {
    const result = applyPromotedRules('grep -E "pnpm test|grep" /tmp/x.log', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}`);
  });

  test('rg "vitest run|tail" file → ok', () => {
    const result = applyPromotedRules('rg "vitest run|tail" file', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok");
  });

  test('jq filter with pnpm test inside → ok', () => {
    const result = applyPromotedRules("jq '.x | test(\"pnpm test\")' file", null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok");
  });

  test('grep pattern with nested double-quotes (the exact scout command) → ok', () => {
    // The real scout command that was false-escalated at 2026-07-16T14:16:
    // a single-quoted grep arg containing double-quoted JSON substrings and
    // both 'vitest' and 'pnpm test' and a literal '|grep'.
    const cmd = `grep -oE '"command":"[^"]*(vitest|pnpm test|grep)[^"]*"' /tmp/cba9_cmds.txt`;
    const result = applyPromotedRules(cmd, null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}`);
  });

  test('grep spanning a real pipe: grep "pnpm test|grep" file | tail → ok', () => {
    // The full-command pass must not re-introduce the FP: the banned tokens
    // are inside the grep pattern; the | tail is a real pipe to tail, not to
    // vitest. Not a real violation.
    const result = applyPromotedRules('grep -E "pnpm test|grep" file | tail', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok");
  });

  test('matchConstraintPattern: sudo grep "docker" → sudo (docker data blanked, real sudo kept)', () => {
    // docker lives only in the grep pattern (data) → must NOT return "docker".
    // sudo IS a real command here → must return "sudo". This also unblocks a
    // today-false "docker" block on the common `sudo grep <pattern>` form.
    const result = matchConstraintPattern('sudo grep "docker run" /etc/passwd');
    assert.strictEqual(result, "sudo", `expected sudo, got ${result}`);
  });

  test('matchConstraintPattern: grep "docker" file → null (docker is data)', () => {
    assert.strictEqual(matchConstraintPattern('grep "docker" file'), null);
  });

  test('matchConstraintPattern: rg "sudo apt" file → null (sudo is data)', () => {
    assert.strictEqual(matchConstraintPattern('rg "sudo apt" file'), null);
  });
});

describe("data-command quote blanking: command substitutions stay visible (must match)", () => {
  // A double-quoted `$(...)` or backtick region EXECUTES before the data
  // command runs (POSIX). The data-command blanker (blankAllQuoted) must NOT
  // blank it — a banned pattern inside is real execution, not inert data —
  // mirroring blankInertQuoted / collectQuotedInertSpans / the classifier's
  // data-command span exclusion (see command-classification.js:438-449).
  test('grep "$(vitest run x | tail)" file → escalate ($() inside grep arg executes)', () => {
    const result = applyPromotedRules('grep "$(vitest run x | tail)" file', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate", `expected escalate, got ${result.decision}`);
  });

  test('grep "$(pnpm test foo | grep bar)" file → escalate ($() inside grep arg executes)', () => {
    const result = applyPromotedRules('grep "$(pnpm test foo | grep bar)" file', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate", `expected escalate, got ${result.decision}`);
  });

  test('rg "`vitest run x | tail`" file → escalate (backtick inside rg arg executes)', () => {
    const result = applyPromotedRules('rg "`vitest run x | tail`" file', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate", `expected escalate, got ${result.decision}`);
  });

  test('echo "$(vitest run x | tail)" → escalate ($() inside echo prose executes)', () => {
    // Same class through the echo-prose full-command pass (stripEchoProse uses
    // the same blankAllQuoted default blanker).
    const result = applyPromotedRules('echo "$(vitest run x | tail)"', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate", `expected escalate, got ${result.decision}`);
  });

  test("single-quoted $(...) stays inert → ok (POSIX: no expansion in single quotes)", () => {
    // The asymmetry is mandatory: a literal $(...) inside single quotes is data
    // and must remain blanked.
    const result = applyPromotedRules("grep '$(vitest run x | tail)' file", null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}`);
  });

  test('matchConstraintPattern: grep "$(docker run x)" file → docker ($() executes)', () => {
    assert.strictEqual(matchConstraintPattern('grep "$(docker run ubuntu)" file'), "docker");
  });

  test('matchConstraintPattern: grep "$(sudo apt install)" file → sudo ($() executes)', () => {
    assert.strictEqual(matchConstraintPattern('grep "$(sudo apt install x)" file'), "sudo");
  });
});

describe("data-command quote blanking: real violations preserved (must match)", () => {
  test("vitest run … | tail → escalate (real pipe, no quotes)", () => {
    const result = applyPromotedRules("pnpm exec vitest run x.test.js 2>&1 | tail -30", null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
  });

  test('bash -c "vitest run | tail" → escalate (bash-c body NOT stripped)', () => {
    // Locked asymmetry: bash-c runs its body, so it stays enforceable.
    const result = applyPromotedRules('bash -c "vitest run foo | tail"', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate");
  });

  test('echo "pnpm test | grep" → ok (printed prose, no pipe target)', () => {
    // Printed prose is data: the `|` satisfying the rule is inside the quotes,
    // so nothing can execute it. The per-segment pass blanks echo/printf quoted
    // args when the segment has no redirect and no real `|` pipe. Bypass shapes
    // (real pipe, redirect) still escalate — locked in
    // gate-logic-echo-prose-pipe-target.test.js, which matters here because
    // rule-no-raw-stdout-vitest has no matchConstraintPattern backstop.
    const result = applyPromotedRules('echo "pnpm test foo | grep bar"', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok");
  });

  test('matchConstraintPattern: bash -c "docker run" → docker (bash-c preserved)', () => {
    assert.strictEqual(matchConstraintPattern('bash -c "docker run ubuntu"'), "docker");
  });

  test('matchConstraintPattern: node -e "…docker run…" → null (node-e strip still runs first)', () => {
    assert.strictEqual(matchConstraintPattern(`node -e "console.log('docker run ubuntu')"`), null);
  });
});

describe("data-command verb recognition (decision-level locks)", () => {
  test("no data command present → nothing blanked (real violation still escalates)", () => {
    // The blanking must only fire on data-command verbs; a command without one
    // keeps every token visible to the rule.
    const result = applyPromotedRules("pnpm exec vitest run x | tail", null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(matchConstraintPattern("ls -la"), null);
  });

  test("does NOT treat grep as a verb when it is an echo argument", () => {
    // `echo grep "docker run"` — echo is the verb; the quoted arg is echo
    // prose, which the constraint path never blanks, so the banned token
    // stays visible (same invariant as the echo-prose → exec-sink locks in
    // gate-logic-quoted-strings.test.js).
    assert.strictEqual(matchConstraintPattern('echo grep "docker run x"'), "docker");
  });

  test("preserves segment boundaries across a data segment and a real segment", () => {
    // The grep pattern (data) is blanked; the second segment's unquoted
    // banned token is a real violation and must still be caught.
    assert.strictEqual(matchConstraintPattern('grep "a|b" file; docker run x'), "docker");
    const result = applyPromotedRules('grep "pnpm test|tail" x; pnpm test 2>&1 | tail', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate");
  });
});

describe("full-command-pass: echo-prose false positives (must NOT match)", () => {
  test('echo "pnpm test" label piped to a real grep → ok (echo prose + real pipe)', () => {
    // The banned token lives only in the echo label; the | grep is a real
    // read-only pipe. The full-command pass must not bridge them. This is the
    // observed false-escalation: an investigative command that never ran vitest.
    const cmd = `echo "does pnpm test run a pretest/seed step" ; git log --oneline -5 | grep fix`;
    const result = applyPromotedRules(cmd, null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}`);
  });

  test('echo "pnpm test label" | tail → ok (spanning echo prose + real pipe)', () => {
    const result = applyPromotedRules('echo "pnpm test label" | tail -5', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}`);
  });

  test('printf "vitest run output" | grep → ok (printf is the same prose class)', () => {
    const result = applyPromotedRules('printf "vitest run output" | grep PASS', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}`);
  });
});

describe("executed-body verbs still escalate (no new false negative)", () => {
  test('bash -c "vitest run" | tail → escalate (executed body, NOT prose)', () => {
    // bash -c runs its quoted body, so the banned token is a real violation.
    // stripEchoProse must NOT blank bash-c quotes — only echo/printf prose.
    const result = applyPromotedRules('bash -c "vitest run foo" | tail -30', null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate", `expected escalate, got ${result.decision}`);
  });

  test("real vitest run piped to tail still escalates (banned token unquoted)", () => {
    const result = applyPromotedRules("pnpm exec vitest run x.test.js 2>&1 | tail -30", null, [VITEST_RULE]);
    assert.strictEqual(result.decision, "escalate");
  });
});
