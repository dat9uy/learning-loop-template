// Prefixed echo/printf to an inert sink: the full-command pass must resolve
// verbs flag-aware (via the shared shell-parse resolver), so
// `time -p echo "pnpm test label" | tail` blanks the echo prose exactly the
// way the per-segment pass does. Before the shared resolver, the legacy
// verb resolver skipped env-assigns + ONE prefix but not the prefix's
// value-taking flags (`nice -n 5`), mis-read the flag value as the verb, and
// left the prose un-blanked → false-positive escalation.
//
// Locks:
//  - prefixed echo/printf to an inert sink (tail/grep/head) → ok
//  - prefixed echo piped to an EXEC sink → escalate (no new bypass)
//  - non-prefixed shapes unchanged (the full-command pass still blanks echo
//    prose on one side of a real read-only pipe)

import assert from "node:assert";
import { describe, test } from "vitest";
import { applyPromotedRules } from "./gate-logic.js";

const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b",
};

const DOCKER_RULE = {
  id: "rule-synthetic-docker",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "docker\\s+run",
};

const ok = (cmd, rule = VITEST_RULE) =>
  assert.strictEqual(
    applyPromotedRules(cmd, null, [rule]).decision,
    "ok",
    `expected ok, got escalate for: ${cmd}`,
  );

const escalate = (cmd, rule = VITEST_RULE) =>
  assert.strictEqual(
    applyPromotedRules(cmd, null, [rule]).decision,
    "escalate",
    `expected escalate, got ok for: ${cmd}`,
  );

describe("prefixed echo to an inert sink → ok", () => {
  test('time -p echo "pnpm test label" | tail → ok', () => {
    ok('time -p echo "pnpm test label" | tail');
  });

  test('nice -n 5 echo "pnpm test label" | tail → ok (value-taking flag)', () => {
    ok('nice -n 5 echo "pnpm test label" | tail');
  });

  test('time -p printf "vitest run x" | grep PASS → ok', () => {
    ok('time -p printf "vitest run x" | grep PASS');
  });

  test('sudo -u root echo "pnpm test label" | tail → ok (sudo value flag)', () => {
    ok('sudo -u root echo "pnpm test label" | tail');
  });

  test('nohup echo "pnpm test label" | head → ok', () => {
    ok('nohup echo "pnpm test label" | head');
  });
});

describe("prefixed echo bypass shapes → escalate (no new bypass)", () => {
  test('time -p echo "vitest run | tail" | bash → escalate (exec sink)', () => {
    escalate('time -p echo "vitest run | tail" | bash');
  });

  test('sudo echo "docker run evil" | bash → escalate', () => {
    escalate('sudo echo "docker run evil" | bash', DOCKER_RULE);
  });

  test('nice -n 5 echo "docker run evil" | tee /tmp/x && bash /tmp/x → escalate (tee persists)', () => {
    escalate('nice -n 5 echo "docker run evil" | tee /tmp/x && bash /tmp/x', DOCKER_RULE);
  });
});

describe("non-prefixed shapes unchanged", () => {
  test('echo "pnpm test label" | tail → ok (blanket blanking preserved)', () => {
    ok('echo "pnpm test label" | tail');
  });

  test("pnpm test 2>&1 | tail → escalate (real violation)", () => {
    escalate("pnpm test 2>&1 | tail");
  });
});
