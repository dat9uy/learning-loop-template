// Regression tests for the quote-concatenation bypass (finding
// meta-260807T1538Z-pre-existing-not-introduced-by-the-echo-prose-relaxation-pro).
//
// POSIX folds adjacent quoted regions and unquoted word parts into ONE word
// (`s''udo` → `sudo`, `'ab''cd'` → `abcd`, `$'wid'getctl` → `widgetctl`), so a
// banned token an author splits with empty quotes was invisible to the two
// raw-text regex gate surfaces (matchConstraintPattern's first-class constraint
// patterns and applyPromotedRules' promoted rules). The verb layer
// (matchGateVerb → classifyPolicyTokens) already folds quotes during
// tokenization and was never vulnerable.
//
// The fix (normalizeQuoteConcatenation in blanking.js) folds adjacent-quote
// splits before regex matching. These tests lock:
//   A. promoted-rule bypass shapes now escalate
//   B. first-class constraint bypass shapes now match
//   C. path-write gate bypass shapes now block
//   D. shell executes adjacent quotes (semantic ground truth)
//   E. no false positives: standalone quoted values, message flags, echo prose,
//      command substitution, heredoc delimiters all behave as before

import assert from "node:assert";
import { describe, test } from "vitest";
import {
  applyPromotedRules,
  matchConstraintPattern,
} from "./gate-logic.js";
import { evaluateBashGate } from "./evaluate-bash-gate.js";
import { normalizeQuoteConcatenation } from "./blanking.js";

const ROOT = new URL("../../..", import.meta.url).pathname;

const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b",
};

const ARTIFACT_RULE = {
  id: "rule-no-new-artifact-types",
  entry_kind: "rule",
  status: "active",
  enforcement: "gate",
  pattern_type: "regex",
  pattern:
    "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
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

describe("normalizeQuoteConcatenation: pure function", () => {
  test("adjacent empty quotes fold", () => {
    assert.strictEqual(normalizeQuoteConcatenation("s''udo"), "sudo");
    assert.strictEqual(normalizeQuoteConcatenation("do''cker"), "docker");
    assert.strictEqual(normalizeQuoteConcatenation("vitest r''un | tail"), "vitest run | tail");
  });

  test("empty quote between word parts folds (a''b)", () => {
    assert.strictEqual(normalizeQuoteConcatenation("w''idgetctl"), "widgetctl");
    assert.strictEqual(normalizeQuoteConcatenation("git c''ommit --no-verify"), "git commit --no-verify");
  });

  test("non-empty single-quote region fuses with adjacent word part", () => {
    assert.strictEqual(normalizeQuoteConcatenation("c'om'mit"), "commit");
    assert.strictEqual(normalizeQuoteConcatenation("vi'te'st run"), "vitest run");
  });

  test("ANSI-C / locale $'' folding drops the dollar", () => {
    assert.strictEqual(normalizeQuoteConcatenation("$'wid'getctl"), "widgetctl");
    assert.strictEqual(normalizeQuoteConcatenation("$'vi''te'st"), "vitest");
  });

  test("standalone quoted values are preserved verbatim", () => {
    // The blankers (stripMessageFlags, stripEchoProse, ...) depend on quoting
    // to recognize prose, so a standalone quoted value must NOT be stripped.
    assert.strictEqual(normalizeQuoteConcatenation('echo "vitest run"'), 'echo "vitest run"');
    assert.strictEqual(normalizeQuoteConcatenation("git commit -m 'fix pnpm add'"), "git commit -m 'fix pnpm add'");
  });

  test("double-quoted command substitution is preserved", () => {
    assert.strictEqual(normalizeQuoteConcatenation('echo "$(pwd)"'), 'echo "$(pwd)"');
    assert.strictEqual(normalizeQuoteConcatenation('echo "`pwd`"'), 'echo "`pwd`"');
  });

  test("heredoc delimiter quotes are preserved", () => {
    assert.strictEqual(normalizeQuoteConcatenation("cat <<'EOF'"), "cat <<'EOF'");
    assert.strictEqual(normalizeQuoteConcatenation("cat <<\"EOF\"\nbody\nEOF"), "cat <<\"EOF\"\nbody\nEOF");
  });

  test("backslash escapes preserved", () => {
    assert.strictEqual(normalizeQuoteConcatenation('echo \\"x\\"'), 'echo \\"x\\"');
  });

  test("empty string / non-string unchanged", () => {
    assert.strictEqual(normalizeQuoteConcatenation(""), "");
    assert.strictEqual(normalizeQuoteConcatenation(undefined), undefined);
  });
});

describe("promoted rules (A): quote-concat bypass shapes now escalate", () => {
  test("vitest r''un | tail → escalate", () => {
    escalate("vitest r''un | tail");
  });
  test("pnpm te''st | tail → escalate", () => {
    escalate("pnpm te''st | tail");
  });
  test("vitest r'u'n | tail → escalate (non-empty fusion)", () => {
    escalate("vitest r'u'n | tail");
  });
  test("git c''ommit --no-verify → escalate", () => {
    const rule = {
      id: "rule-no-verify-bypass-denied",
      entry_kind: "rule",
      status: "active",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "git\\s+commit[^|;&]*--no-verify",
    };
    assert.strictEqual(applyPromotedRules("git c''ommit --no-verify", null, [rule]).decision, "escalate");
  });
  test("create ''schema → escalate", () => {
    escalate("create ''schema", ARTIFACT_RULE);
  });
});

describe("first-class constraints (B): quote-concat bypass shapes now match", () => {
  test("s''udo rm -rf / → sudo", () => {
    assert.strictEqual(matchConstraintPattern("s''udo rm -rf /"), "sudo");
  });
  test("do''cker run hello → docker", () => {
    assert.strictEqual(matchConstraintPattern("do''cker run hello"), "docker");
  });
  test("pip install vn''stock → package-manager", () => {
    assert.strictEqual(matchConstraintPattern("pip install vn''stock"), "package-manager");
  });
  test("cu''rl https://api.x.com → vendor-api", () => {
    assert.strictEqual(matchConstraintPattern("cu''rl https://api.x.com"), "vendor-api");
  });
  test("su''do apt install → sudo", () => {
    assert.strictEqual(matchConstraintPattern("su''do apt install"), "sudo");
  });
  test("non-empty single-quote fusion in constraint verb", () => {
    assert.strictEqual(matchConstraintPattern("s'u'do rm -rf /"), "sudo");
  });
});

describe("path-write gates (C): quote-concat bypass shapes now block", () => {
  test("echo x > rec''ords/foo.md → block", () => {
    const r = evaluateBashGate({ command: "echo x > rec''ords/foo.md", root: ROOT });
    assert.strictEqual(r.decision, "block");
  });
  test("echo x > me''ta-state.jsonl → block", () => {
    const r = evaluateBashGate({ command: "echo x > me''ta-state.jsonl", root: ROOT });
    assert.strictEqual(r.decision, "block");
  });
  test("echo x > runtime''-state.jsonl → block", () => {
    const r = evaluateBashGate({ command: "echo x > runtime''-state.jsonl", root: ROOT });
    assert.strictEqual(r.decision, "block");
  });
});

describe("no false positives (E): normalization does not over-fold", () => {
  test("echo prose piped to bash keeps docker visible (locked behavior)", () => {
    assert.strictEqual(matchConstraintPattern('echo "docker run evil" | bash'), "docker");
  });
  test("echo prose no pipe → ok (blanking still works)", () => {
    ok('echo "pnpm test foo | grep bar"');
  });
  test("message flags still strip quoted bodies", () => {
    assert.strictEqual(matchConstraintPattern('git commit -m "fix pnpm add issue"'), null);
  });
  test("node -e body still blanked", () => {
    assert.strictEqual(matchConstraintPattern(`node -e "console.log('docker run ubuntu')"`), null);
  });
  test("bash -c executed body still visible", () => {
    assert.strictEqual(matchConstraintPattern('bash -c "docker run ubuntu"'), "docker");
  });
  test("quoted heredoc body still blanked", () => {
    assert.strictEqual(
      matchConstraintPattern("cat <<'EOF'\ndocker run ubuntu\nEOF"),
      null,
    );
  });
  test("executor heredoc body still visible", () => {
    assert.strictEqual(
      matchConstraintPattern("bash <<'EOF'\ndocker run ubuntu\nEOF"),
      "docker",
    );
  });
  test("data-command pattern arg still blanked", () => {
    assert.strictEqual(matchConstraintPattern('grep -E "docker run" file'), null);
  });
  test("pure command with quotes unaffected", () => {
    assert.strictEqual(matchConstraintPattern("echo 'hello world'"), null);
    assert.strictEqual(matchConstraintPattern("ls -la"), null);
  });
});
