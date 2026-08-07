// Regression tests for the per-segment echo/printf prose false-positive class.
//
// The promoted-rule pass evaluates each rule regex twice: a per-segment pass
// (primary) and a full-command pass (superset, for patterns spanning a
// delimiter). The full-command pass already blanks echo/printf quoted args
// (stripEchoProse), so `echo "pnpm test label" | tail` is ok. The per-segment
// pass did NOT, so a single segment whose banned token — including the `|`
// itself — lives INSIDE a quoted arg matched and escalated before the
// full-command pass could blank it. Printed prose is DATA: it cannot execute.
//
// The relaxation is pipe-target-aware rather than unconditional, because
// blanking echo prose whose output is routed somewhere executable would open a
// real bypass (`echo "docker run evil" | bash`). Promoted-rule-only tokens
// (vitest/artifact) have NO matchConstraintPattern backstop — applyPromotedRules
// is the only gate — so the per-segment relaxation must open no bypass on its
// own. Blanking therefore requires BOTH:
//   - no redirect operator (`>`/`>>`/`<`) outside quotes in the segment
//     (a redirect persists the output: `echo "banned" > f && bash f`), AND
//   - the segment is not followed by a real `|` pipe (any target — the exec-sink
//     long tail is unbounded, so ANY real pipe preserves).
// `||`, `&&`, `;`, `&` and end-of-command are NOT pipes: they do not route the
// echo's stdout into the next segment (`echo "X" && bash` runs bash with its
// OWN stdin), so those shapes blank.
//
// Groups:
//  A relaxation → ok            (no redirect, no real pipe)
//  B bypass     → escalate      (real pipe / redirect — the no-bypass lock)
//  C logical-op → ok            (`||`/`&&`/`;` are not pipes)
//  D real violations → escalate (no echo involved, or executed bodies)
//  E full-command relaxation preserved → ok (stripEchoProse untouched)
//  F unquoted-arg limitation → escalate (accepted pre-existing limitation)

import assert from "node:assert";
import { describe, test } from "vitest";
import { applyPromotedRules } from "../../core/gate-logic.js";

// Live rule pattern (meta-state v2). The `|` the pattern requires is what makes
// the quoted-data cases interesting: the `|` itself is inside the quotes.
const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b",
};

// Live rule pattern for the prose class with no pipe requirement at all.
const ARTIFACT_RULE = {
  id: "rule-no-new-artifact-types",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern:
    "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
};

// Synthetic first-class-token rule, used only to exercise the immediate-exec
// sink shapes with a token that has no pipe in its pattern.
const DOCKER_RULE = {
  id: "rule-synthetic-docker",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "docker\\s+run",
};

const CLI_BIN = "tools/learning-loop-mastra/bin/loop.mjs";

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

describe("echo prose (A): relaxation — no redirect, no real pipe → ok", () => {
  test("printf inline-JSON repro payload with | inside the quotes → ok", () => {
    // The observed false-escalation: an agent printing a JSON repro script.
    // The `|` that satisfies the rule lives inside the single-quoted JSON.
    ok(
      `printf '%s\\n' '{"tool_name":"Bash","tool_input":{"command":"echo \\"pnpm test run 2>&1 | tail\\""}}'`,
    );
  });

  test('echo "pnpm test foo | grep bar" → ok (| inside double quotes)', () => {
    ok('echo "pnpm test foo | grep bar"');
  });

  test('echo "create new convention" → ok (printing is not creating)', () => {
    ok('echo "create new convention"', ARTIFACT_RULE);
  });

  test("printf '{\"x\":\"pnpm test | tail\"}' → ok", () => {
    ok(`printf '%s\\n' '{"x":"pnpm test | tail"}'`);
  });

  test('echo "a > b" → ok (> inside quotes is data, not a redirect)', () => {
    // Locks segmentHasRedirect quote-awareness: a quoted `>` must not be read
    // as a redirect, or every prose case with an angle bracket over-preserves.
    ok('echo "pnpm test a > b | grep c"');
  });
});

describe("echo prose (B): bypass shapes stay escalate — the no-bypass lock", () => {
  test('echo "vitest run | tail" | bash → escalate (real pipe to exec sink)', () => {
    escalate('echo "vitest run | tail" | bash');
  });

  test('echo "docker run evil" | bash → escalate (real pipe, first-class token)', () => {
    escalate('echo "docker run evil" | bash', DOCKER_RULE);
  });

  test('echo "docker run evil" | cat | bash → escalate (two real pipes, NOT ||)', () => {
    // Critical: two `|` delimiters separated by a NON-empty segment is a pipe
    // chain, not a logical-OR. Classifying it as `||` would blank the prose and
    // reopen the exec-sink bypass. `||` requires an empty segment between the
    // two delimiter tokens.
    escalate('echo "docker run evil" | cat | bash', DOCKER_RULE);
  });

  test('echo "vitest run | tail" > /tmp/x && bash /tmp/x → escalate (redirect persists)', () => {
    escalate('echo "vitest run | tail" > /tmp/x && bash /tmp/x');
  });

  test('echo "docker run evil" > /tmp/x && bash /tmp/x → escalate (redirect persists)', () => {
    escalate('echo "docker run evil" > /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" >> /tmp/x && bash /tmp/x → escalate (append redirect)', () => {
    escalate('echo "docker run evil" >> /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" &> /tmp/x && bash /tmp/x → escalate (&> splits across the tokenizer)', () => {
    // `&` is a delimiter, so in `&>` the `>` opens the NEXT part and an
    // in-segment-only redirect scan misses it — the prose would blank while the
    // shell really does persist it to a file the next segment executes.
    escalate('echo "docker run evil" &> /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" &>> /tmp/x && bash /tmp/x → escalate (append form)', () => {
    escalate('echo "docker run evil" &>> /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" >& /tmp/x && bash /tmp/x → escalate (>& form)', () => {
    escalate('echo "docker run evil" >& /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" 1> /tmp/x && bash /tmp/x → escalate (fd-numbered redirect)', () => {
    escalate('echo "docker run evil" 1> /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" | tee /tmp/x && bash /tmp/x → escalate (pipe to a persisting sink)', () => {
    // Why pipe targets are never classified: tee persists just like a redirect.
    escalate('echo "docker run evil" | tee /tmp/x && bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" |& bash → escalate (|& is a pipe)', () => {
    escalate('echo "docker run evil" |& bash', DOCKER_RULE);
  });

  test('bash <<< "docker run evil" → escalate (here-string feeds bash)', () => {
    escalate('bash <<< "docker run evil"', DOCKER_RULE);
  });

  test('exec > /tmp/x ; echo "docker run evil" ; bash /tmp/x → escalate (exec rewrites fds)', () => {
    // The echo segment carries no redirect of its own — the earlier `exec`
    // pointed the shell's stdout at a file, so the prose is persisted anyway.
    // Any exec segment therefore disables blanking for the whole command.
    escalate('exec > /tmp/x ; echo "docker run evil" ; bash /tmp/x', DOCKER_RULE);
  });

  test('exec 3> /tmp/x ; echo "docker run evil" >&3 ; bash /tmp/x → escalate', () => {
    escalate('exec 3> /tmp/x ; echo "docker run evil" >&3 ; bash /tmp/x', DOCKER_RULE);
  });

  test('echo "docker run evil" > >(bash) → escalate (process substitution sink)', () => {
    escalate('echo "docker run evil" > >(bash)', DOCKER_RULE);
  });

  test('echo "create new schema" | bash → escalate (prose rule, exec sink)', () => {
    escalate('echo "create new schema" | bash', ARTIFACT_RULE);
  });

  test('echo "vitest run | tail" | sudo bash → escalate (sudo-prefixed exec sink)', () => {
    escalate('echo "vitest run | tail" | sudo bash');
  });

  test('sudo echo "docker run evil" | bash → escalate (sudo-prefixed echo, real pipe)', () => {
    // Locks segmentVerb prefix handling on the preserve path: the segment is
    // still recognized as echo, and the real pipe still preserves its prose.
    escalate('sudo echo "docker run evil" | bash', DOCKER_RULE);
  });
});

describe("echo prose (B2): printf -v assigns, it does not print → escalate", () => {
  // `printf -v VAR fmt args` writes the formatted result into a shell variable
  // instead of stdout. A later segment can then execute it, so the args are an
  // assignment payload, not prose, and must never be blanked. All of these run
  // the banned pattern for real when bash executes them.
  test('printf -v x "%s" "…" && sh -c "${x}" → escalate', () => {
    escalate('printf -v x "%s" "vitest run | tail" && sh -c "${x}"');
  });

  test('printf -v x "%s" "…" && eval "${x}" → escalate', () => {
    escalate('printf -v x "%s" "vitest run | tail" && eval "${x}"');
  });

  test('printf -v x "%s" "…" && bash -c "${x}" → escalate', () => {
    escalate('printf -v x "%s" "vitest run | tail" && bash -c "${x}"');
  });

  test('printf -v x "…" && sh -c "${x}" → escalate (payload in the format string)', () => {
    escalate('printf -v x "vitest run | tail" && sh -c "${x}"');
  });

  test('printf -v x "%s" "…" && bash <<< "${x}" → escalate (here-string sink)', () => {
    escalate('printf -v x "%s" "vitest run | tail" && bash <<< "${x}"');
  });

  test('printf -vx "%s" "…" && sh -c "${x}" → escalate (attached -vx form)', () => {
    escalate('printf -vx "%s" "vitest run | tail" && sh -c "${x}"');
  });

  test('printf "%s" "-v" → ok (a quoted literal -v is prose, not the flag)', () => {
    // The flag check runs after quote-blanking, so genuine prose that merely
    // contains "-v" still relaxes.
    ok('printf "%s" "-v pnpm test | tail"');
  });
});

describe("echo prose (C): logical operators are not pipes → ok", () => {  test('echo "pnpm test | tail" || bash → ok (|| is logical-OR)', () => {
    // bash runs with its OWN stdin here; echo's stdout goes to the terminal.
    ok('echo "pnpm test | tail" || bash');
  });

  test('echo "pnpm test | tail" && bash → ok (&& is logical-AND)', () => {
    ok('echo "pnpm test | tail" && bash');
  });

  test('echo "pnpm test | tail" ; bash → ok (; is a sequence separator)', () => {
    ok('echo "pnpm test | tail" ; bash');
  });

  test('echo "pnpm test | tail" & → ok (& backgrounds; no stdout routing)', () => {
    ok('echo "pnpm test | tail" &');
  });
});

describe("echo prose (D): real violations preserved → escalate", () => {
  test("pnpm exec vitest run 2>&1 | tail → escalate (no echo at all)", () => {
    escalate("pnpm exec vitest run 2>&1 | tail");
  });

  test('bash -c "vitest run foo | tail" → escalate (bash -c body runs)', () => {
    escalate('bash -c "vitest run foo | tail"');
  });

  test("loop CLI segment + sibling real pipe → escalate (segment-scoped)", () => {
    escalate(`node ${CLI_BIN} meta_state_list '{}' ; pnpm test 2>&1 | tail`);
  });

  test('loop CLI "$(pnpm test | tail)" → escalate ($() is real expansion)', () => {
    escalate(`node ${CLI_BIN} meta_state_resolve "$(pnpm test 2>&1 | tail)"`);
  });

  test('echo "$(pnpm test | tail)" → escalate (double-quoted $() is executed)', () => {
    // blankInertQuoted preserves double-quoted regions containing `$(`, so the
    // command substitution stays visible even though the verb is echo.
    escalate('echo "$(pnpm test 2>&1 | tail)"');
  });
});

describe("echo prose (E): existing full-command relaxation preserved → ok", () => {
  test('echo "pnpm test label" | tail -5 → ok (full-command stripEchoProse)', () => {
    // Per-segment preserves (real pipe), finds no match; the unchanged
    // full-command pass blanks the prose → ok. Locks that pass still working.
    ok('echo "pnpm test label" | tail -5');
  });

  test('printf "vitest run output" | grep PASS → ok (same class)', () => {
    ok('printf "vitest run output" | grep PASS');
  });
});

describe("echo prose (F): unquoted args stay visible → escalate", () => {
  test("echo $(docker run evil) → escalate (unquoted $() is real expansion)", () => {
    escalate("echo $(docker run evil)", DOCKER_RULE);
  });

  test("echo test-escalate-token → escalate (unquoted arg, accepted limitation)", () => {
    escalate("echo create new convention", ARTIFACT_RULE);
  });
});
