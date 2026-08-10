import assert from "node:assert";
import { describe, test } from "vitest";
import { classifyCommand, CLASSIFIER_MODES } from "./command-classification.js";
import { applyPromotedRules } from "./gate-logic.js";

// Pure classifier unit tests — no hooks, no runtime, no I/O. These cover the
// Phase-2 "Tests Before" matrix:
//   1. Quoted inert data -> event mode proves inert-data + unexpected-match.
//   2. Real executable pipes / executor bodies / process substitution /
//      redirects / command substitutions -> gate preserves executable content;
//      event mode never labels them unexpected.
//   3. Quoted/unquoted heredocs, herestring exclusion, malformed syntax ->
//      fail-closed.
//   4. Mode differences: gate preserves executable content; recurrence
//      collapses approved data variants; event emits unexpected only when
//      provenance is proven.
//   5. Fail-closed: classifier exceptions return unblanked/unknown views,
//      never an allowed decision.

// The effective promoted rule pattern (canonical max-version v2).
const VITEST_RULE_PATTERN = "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b";
// Narrow sub-pattern that avoids pipe-spanning matches so a match provably
// lies inside a single inert span.
const NARROW = "vitest run";

const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: VITEST_RULE_PATTERN,
};

describe("classifier mode constants", () => {
  test("CLASSIFIER_MODES lists the three modes", () => {
    assert.deepStrictEqual(CLASSIFIER_MODES, ["gate", "recurrence", "event"]);
  });
});

// ─── 1. Quoted inert data → unexpected-match ─────────────────────────────────

describe("event mode: quoted inert data proves unexpected-match", () => {
  test("quoted heredoc body containing a raw vitest pipe → inert-data + unexpected-match", () => {
    const cmd = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "inert-data");
    assert.strictEqual(r.candidate_kind, "unexpected-match");
    // Decision stays ok (the gate blanked the inert body).
    const gate = applyPromotedRules(cmd, null, [VITEST_RULE], "/tmp");
    assert.strictEqual(gate.decision, "ok");
  });

  test("double-quoted heredoc body → inert-data + unexpected-match", () => {
    const cmd = "cat <<\"EOF\"\nvitest run foo.test.js | tail\nEOF\n";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "inert-data");
    assert.strictEqual(r.candidate_kind, "unexpected-match");
  });

  test("node -e body containing a raw vitest pipe → inert-data + unexpected-match", () => {
    const cmd = 'node -e "vitest run foo | tail"';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "inert-data");
    assert.strictEqual(r.candidate_kind, "unexpected-match");
  });

  test("grep/jq/rg quoted pattern arg → inert-data + unexpected-match", () => {
    for (const cmd of [
      'grep -E "vitest run foo | tail" /tmp/x.log',
      "jq '.x | test(\"vitest run\")' file",
      'rg "vitest run | tail" file',
    ]) {
      const r = classifyCommand(cmd, { mode: "event", rulePattern: NARROW });
      assert.strictEqual(r.match_origin, "inert-data", cmd);
      assert.strictEqual(r.candidate_kind, "unexpected-match", cmd);
    }
  });

  test("echo prose routed to an inert sink → inert-data + unexpected-match", () => {
    // Narrow pattern keeps the match inside the quoted prose; the pipe target
    // tail is an inert sink, so the prose is provably inert.
    const cmd = 'echo "vitest run" | tail -5';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: NARROW });
    assert.strictEqual(r.match_origin, "inert-data");
    assert.strictEqual(r.candidate_kind, "unexpected-match");
  });

  test("bare echo prose (no pipe) → inert-data + unexpected-match", () => {
    const cmd = 'echo "vitest run"';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: NARROW });
    assert.strictEqual(r.match_origin, "inert-data");
    assert.strictEqual(r.candidate_kind, "unexpected-match");
  });

  test("printf prose piped to an inert sink → inert-data + unexpected-match", () => {
    const cmd = 'printf "%s\\n" "vitest run" | grep -q x';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: NARROW });
    assert.strictEqual(r.match_origin, "inert-data");
    assert.strictEqual(r.candidate_kind, "unexpected-match");
  });
});

// ─── 2. Real executable content is never unexpected ──────────────────────────

describe("event mode: real executable content is never unexpected", () => {
  test("real vitest reader pipe → executable + ordinary-rule-fire", () => {
    const cmd = "vitest run --bail=1 foo.test.js 2>&1 | tail -10";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
    const gate = applyPromotedRules(cmd, null, [VITEST_RULE], "/tmp");
    assert.strictEqual(gate.decision, "escalate");
  });

  test("pnpm test piped to head → executable + ordinary-rule-fire", () => {
    const cmd = "pnpm test foo.test.js 2>&1 | head -5";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("bash -c body → executable + ordinary-rule-fire", () => {
    const cmd = 'bash -c "vitest run foo.test.js 2>&1 | tail -10"';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
    const gate = applyPromotedRules(cmd, null, [VITEST_RULE], "/tmp");
    assert.strictEqual(gate.decision, "escalate");
  });

  test("sh -c body → executable + ordinary-rule-fire", () => {
    const cmd = 'sh -c "vitest run foo 2>&1 | tail"';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("python -c body → executable + ordinary-rule-fire", () => {
    const cmd = 'python3 -c "vitest run foo 2>&1 | tail"';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("process substitution → executable + ordinary-rule-fire", () => {
    const cmd = "diff <(vitest run foo | tail) <(echo bar)";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("redirect persists prose → executable + ordinary-rule-fire", () => {
    // Redirect withhold: echo prose routed to a file can be persisted, so it
    // is NOT blanked and stays executable content.
    const cmd = 'echo "vitest run foo | tail" > /tmp/f';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("echo prose piped to an executor (bash) → executable, never inert", () => {
    const cmd = 'echo "vitest run foo | tail" | bash';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("command substitution in double quotes stays visible → executable", () => {
    const cmd = 'echo "$(vitest run foo | tail)" | tail -5';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("real vitest run on its own (no pipe) → unclassified, no false unexpected", () => {
    // The rule pattern requires a pipe; no match exists.
    const r = classifyCommand("vitest run foo.test.js", { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.candidate_kind, "unclassified");
  });
});

// ─── 3. Heredocs, herestrings, malformed syntax → fail-closed ────────────────

describe("fail-closed: heredocs, herestrings, malformed syntax", () => {
  test("unquoted heredoc body stays visible (never inert) → executable", () => {
    const cmd = "cat <<EOF\nvitest run foo.test.js | tail\nEOF\n";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("executor-verb heredoc stays visible (never inert) → executable", () => {
    const cmd = "bash <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("herestring (<<<) is not a heredoc → executable", () => {
    const cmd = 'cat <<< "vitest run foo.test.js | tail"';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "executable");
    assert.strictEqual(r.candidate_kind, "ordinary-rule-fire");
  });

  test("malformed unterminated quote → unknown/unclassified", () => {
    const cmd = 'bash -c "unterminated vitest run foo | tail';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "unknown");
    assert.strictEqual(r.candidate_kind, "unclassified");
  });

  test("pipe-spanning match without stable offsets → unclassified (mixed/unknown)", () => {
    // The full rule pattern greedily spans the closing quote and the real
    // pipe; the match is not contained in a single inert span, so it must not
    // be labelled unexpected.
    const cmd = 'echo "vitest run foo | tail" | tail -5';
    const r = classifyCommand(cmd, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.notStrictEqual(r.candidate_kind, "unexpected-match");
    assert.strictEqual(r.candidate_kind, "unclassified");
  });
});

// ─── 4. Mode differences ─────────────────────────────────────────────────────

describe("mode policy differences", () => {
  const INERT_CMD = "cat <<'EOF'\nvitest run foo | tail\nEOF\n";
  const EXEC_CMD = "vitest run foo 2>&1 | tail -10";

  test("gate mode preserves executable content (no executor body blanked)", () => {
    for (const cmd of [
      'bash -c "vitest run foo | tail"',
      'sh -c "vitest run foo | tail"',
      'python3 -c "vitest run foo | tail"',
      EXEC_CMD,
    ]) {
      const r = classifyCommand(cmd, { mode: "gate" });
      assert.ok(r.normalized.includes("vitest"), `gate must keep executor body: ${cmd}`);
    }
  });

  test("gate mode blanks quoted inert heredoc bodies", () => {
    const r = classifyCommand(INERT_CMD, { mode: "gate" });
    assert.ok(!r.normalized.includes("vitest run"), "quoted heredoc body must be blanked");
  });

  test("recurrence mode collapses approved data variants (coarser)", () => {
    const variants = [
      "cat <<'EOF'\nvitest run foo | tail\nEOF\n",
      "cat <<EOF\nvitest run foo | tail\nEOF\n",
    ];
    const keys = variants.map((c) => classifyCommand(c, { mode: "recurrence" }).normalized);
    assert.strictEqual(keys[0], keys[1], "recurrence collapses quoted+unquoted heredocs");
  });

  test("recurrence mode collapses node -e body variants", () => {
    const keys = [
      'node -e "vitest run"',
      'node -e \'vitest run\'',
      "node -e vitest run",
    ].map((c) => classifyCommand(c, { mode: "recurrence" }).normalized);
    assert.strictEqual(keys[0], keys[1]);
    assert.strictEqual(keys[0], keys[2]);
  });

  test("recurrence mode collapses redirect-target variants", () => {
    const keys = [
      "cat > /tmp/A <<'EOF'\nvitest run foo\nEOF\n",
      "cat > /tmp/B <<'EOF'\nvitest run foo\nEOF\n",
    ].map((c) => classifyCommand(c, { mode: "recurrence" }).normalized);
    assert.strictEqual(keys[0], keys[1], "varying redirect paths collapse to one class");
  });

  test("recurrence mode does NOT collapse distinct trailing real commands", () => {
    const a = classifyCommand("cat <<'EOF'\nvitest run foo\nEOF\n; vitest run bar | tail", { mode: "recurrence" }).normalized;
    const b = classifyCommand("cat <<'EOF'\nvitest run foo\nEOF\n", { mode: "recurrence" }).normalized;
    assert.notStrictEqual(a, b, "distinct trailing command must not collapse");
  });

  test("gate vs recurrence differ on data-heavy normalization", () => {
    // A quoted-heredoc command: gate blanks only the inert body (executor
    // structure preserved); recurrence collapses the heredoc entirely.
    const gate = classifyCommand(INERT_CMD, { mode: "gate" }).normalized;
    const rec = classifyCommand(INERT_CMD, { mode: "recurrence" }).normalized;
    assert.ok(gate.includes("cat"), "gate keeps the blankable verb structure");
    assert.notStrictEqual(gate, rec, "gate and recurrence must diverge on data");
  });

  test("event mode emits unexpected-match only when provenance is proven", () => {
    const inert = classifyCommand(INERT_CMD, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(inert.candidate_kind, "unexpected-match");
    const exec = classifyCommand(EXEC_CMD, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(exec.candidate_kind, "ordinary-rule-fire");
  });
});

// ─── 5. Fail-closed / error path ─────────────────────────────────────────────

describe("fail-closed error path", () => {
  test("null command → unknown/unclassified, no provenance assumption", () => {
    const r = classifyCommand(null, { mode: "event", rulePattern: VITEST_RULE_PATTERN });
    assert.strictEqual(r.match_origin, "unknown");
    assert.strictEqual(r.candidate_kind, "unclassified");
    assert.strictEqual(r.classification_error, true);
  });

  test("null command gate mode → unblanked fallback, unknown", () => {
    const r = classifyCommand(null, { mode: "gate" });
    assert.strictEqual(r.match_origin, "unknown");
    assert.strictEqual(r.candidate_kind, "unclassified");
    assert.strictEqual(r.classification_error, true);
    assert.strictEqual(r.normalized, "");
  });

  test("empty-string command → conservative empty view, not an error", () => {
    for (const mode of ["gate", "recurrence", "event"]) {
      const r = classifyCommand("", { mode });
      assert.strictEqual(r.match_origin, "unknown", mode);
      assert.strictEqual(r.candidate_kind, "unclassified", mode);
      assert.strictEqual(r.classification_error, undefined, mode);
      assert.strictEqual(r.normalized, "", mode);
    }
  });

  test("invalid mode never throws (fail-closed, not evaluator catch-path)", () => {
    let r;
    assert.doesNotThrow(() => {
      r = classifyCommand("vitest run foo | tail", { mode: "bogus", rulePattern: VITEST_RULE_PATTERN });
    });
    assert.strictEqual(r.match_origin, "unknown");
    assert.strictEqual(r.candidate_kind, "unclassified");
    assert.strictEqual(r.classification_error, true);
  });

  test("invalid rulePattern (RegExp object instead of string) → unknown/unclassified", () => {
    const r = classifyCommand("cat <<'EOF'\nvitest run foo | tail\nEOF\n", {
      mode: "event",
      rulePattern: new RegExp(VITEST_RULE_PATTERN),
    });
    assert.strictEqual(r.match_origin, "unknown");
    assert.strictEqual(r.candidate_kind, "unclassified");
  });

  test("classifier error returns an UNBLANKED gate view (never an allowed decision)", () => {
    // Directly exercise the error path: a gate-mode failure must fall back to
    // the raw command (executable-preserving), never a blanked/cleared form
    // that could turn a matched command into {decision:"ok"}.
    const r = classifyCommand('bash -c "vitest run foo | tail"', { mode: "gate" });
    assert.ok(r.normalized.includes("vitest"), "fallback keeps executor content visible");
    // The fallback view must never claim a candidate that would auto-file.
    assert.strictEqual(r.candidate_kind, "unclassified");
  });
});

// ─── Extra guards: over-collapse / distinct classes ──────────────────────────

describe("over-collapse guards", () => {
  test("two distinct trailing real commands remain distinct classes", () => {
    const a = "vitest run a.test.js | tail";
    const b = "vitest run b.test.js | tail";
    const ka = classifyCommand(a, { mode: "recurrence" }).normalized;
    const kb = classifyCommand(b, { mode: "recurrence" }).normalized;
    assert.notStrictEqual(ka, kb, "distinct trailing commands must not collapse");
  });

  test("real pipe and bare heredoc class do not collapse", () => {
    const real = classifyCommand("vitest run a.test.js | tail", { mode: "recurrence" }).normalized;
    const inert = classifyCommand("cat <<'EOF'\nvitest run a.test.js\nEOF\n", { mode: "recurrence" }).normalized;
    assert.notStrictEqual(real, inert);
  });
});
