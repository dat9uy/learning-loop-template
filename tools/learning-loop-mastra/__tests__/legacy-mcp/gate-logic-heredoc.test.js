import assert from "node:assert";
import { afterEach, describe, test } from "vitest";
import {
  applyPromotedRules,
  matchConstraintPattern,
  matchGateVerb,
  safeStripHeredocBodies,
  stripHeredocBodies,
} from "../../core/gate-logic.js";

// ─── stripHeredocBodies: heredoc data-blanking for the bash gate ─────────────
//
// Closes the only un-blanked data class in the gate's strip family: quoted-
// delimiter heredoc bodies (`<<'EOF'` / `<<"EOF"`, incl. `<<-` tab-stripping)
// attached to INERT verbs are DATA — POSIX suppresses `$(...)`/backtick/`$var`
// expansion when the delimiter word is quoted, so the body can never execute.
// Unquoted `<<EOF` bodies ARE shell-expanded and can execute → left visible
// (conservative residual). Executor-verb heredocs (`bash <<'EOF'`, `python3
// <<'EOF'`) run their bodies as programs → always visible (the heredoc
// analogue of the locked `stripNodeEvalBody` asymmetry). Herestrings `<<<`
// feed stdin directly and execute → never blanked.
//
// Fail-closed: any throw returns the command unchanged (allowlist's "unknown
// ⇒ visible" safety direction). Kill-switch: GATE_HEREDOC_BLANKER=0
// short-circuits at every call site.
//
// The test fixture mirrors the 8-shape command matrix from the disposition
// report (plans/reports/disposition-260809-1536-…-false-fire-retraction.md).
// The rule under test is the live registry rule `rule-no-raw-stdout-vitest`
// (pattern `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b`), provided
// inline so the test is deterministic and registry-independent.

const VITEST_RULE = [
  {
    id: "rule-no-raw-stdout-vitest",
    entry_kind: "rule",
    status: "active",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b",
  },
];

function promoted(command) {
  return applyPromotedRules(command, null, VITEST_RULE);
}

// Kill-switch tests mutate process.env — restore after each.
afterEach(() => {
  delete process.env.GATE_HEREDOC_BLANKER;
});

describe("stripHeredocBodies: 8-shape fixture (rule-no-raw-stdout-vitest)", () => {
  test("shape 1: real violation `vitest run foo 2>&1 | tail -10` escalates", () => {
    assert.strictEqual(promoted("vitest run foo 2>&1 | tail -10").decision, "escalate");
  });

  test("shape 2: real violation `pnpm test 2>&1 | grep FAIL` escalates", () => {
    assert.strictEqual(promoted("pnpm test 2>&1 | grep FAIL").decision, "escalate");
  });

  test("shape 3: quoted heredoc `cat <<'EOF' … pnpm test foo | tail … EOF` ok (was false-fire)", () => {
    const cmd =
      "cat <<'EOF'\n" +
      "heredoc data line\n" +
      "pnpm test foo | tail -10\n" +
      "more data\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("shape 4: node stdin-script `node --input-type=module <<'EOJS' …` ok (promoted-rule pass; accepted bypass)", () => {
    const cmd =
      "node --input-type=module <<'EOJS'\n" +
      "console.log('pnpm test x | tail');\n" +
      "EOJS";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("shape 5: unquoted `cat <<EOF … pnpm test | tail … EOF` escalates as visible residual (NOT blanked)", () => {
    const cmd =
      "cat <<EOF\n" +
      "pnpm test foo | tail -10\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "escalate");
  });

  test("shape 6: quoted heredoc body with `$(vitest run | tail)` ok (quoted delimiter suppresses expansion)", () => {
    const cmd =
      "cat <<'EOF'\n" +
      "$(vitest run | tail -10)\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("shape 7: `bash <<'EOF' … vitest run | tail … EOF` escalates (executed-body asymmetry)", () => {
    const cmd =
      "bash <<'EOF'\n" +
      "vitest run foo | tail -10\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "escalate");
  });

  test("shape 8: `sh <<'EOF'` / `python3 <<'EOF'` bodies escalate (asymmetry)", () => {
    const shCmd =
      "sh <<'EOF'\n" +
      "pnpm test | grep FAIL\n" +
      "EOF";
    assert.strictEqual(promoted(shCmd).decision, "escalate");
    const pyCmd =
      "python3 <<'EOF'\n" +
      "print('pnpm test | tail')\n" +
      "EOF";
    assert.strictEqual(promoted(pyCmd).decision, "escalate");
  });
});

describe("stripHeredocBodies: matrix rows 9–13 (delimiters, redirects, unterminated)", () => {
  test("row 9: `<<-'EOF'` tab-indented body + terminator ok", () => {
    const cmd =
      "cat <<-'EOF'\n" +
      "\tpnpm test foo | tail -10\n" +
      "\tdata\n" +
      "\tEOF";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("row 10: body containing `;` / `&` / `|` mid-line — no segment fracture", () => {
    const cmd =
      "cat <<'EOF'\n" +
      "git log; pnpm test foo | tail -5 & echo done\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("row 11: `cat <<'EOF' > f.txt … EOF` (redirect after operator) ok", () => {
    const cmd =
      "cat <<'EOF' > f.txt\n" +
      "pnpm test foo | tail -10\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("row 12: unterminated `cat <<'EOF' …` ok (blank to end, quoted delimiter)", () => {
    const cmd = "cat <<'EOF'\npnpm test foo | tail -10\nmore data";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("row 13: `cat <<'EOF' … docker run … EOF` via matchConstraintPattern → null (cat inert)", () => {
    const cmd =
      "cat <<'EOF'\n" +
      "docker run -it ubuntu\n" +
      "EOF";
    assert.strictEqual(matchConstraintPattern(cmd), null);
  });
});

describe("stripHeredocBodies: matrix rows 14–18 (executor visible, node split, herestring)", () => {
  test("row 14: `bash <<'EOF' … docker run … EOF` via matchConstraintPattern → docker (executor visible)", () => {
    const cmd =
      "bash <<'EOF'\n" +
      "docker run -it ubuntu\n" +
      "EOF";
    assert.strictEqual(matchConstraintPattern(cmd), "docker");
  });

  test("row 15: `node <<'EOJS' … child_process.execSync('sudo docker run') … EOJS` → sudo+docker (node EXCLUDED from constraint allowlist)", () => {
    const cmd =
      "node <<'EOJS'\n" +
      "require('child_process').execSync('sudo docker run -it ubuntu')\n" +
      "EOJS";
    assert.strictEqual(matchConstraintPattern(cmd), "docker");
  });

  test("row 16: `node <<'EOJS' … pnpm test | tail … EOJS` via applyPromotedRules → ok (node in promoted allowlist; accepted bypass)", () => {
    const cmd =
      "node <<'EOJS'\n" +
      "console.log('pnpm test foo | tail -10');\n" +
      "EOJS";
    assert.strictEqual(promoted(cmd).decision, "ok");
  });

  test("row 17: `node <<< '…execSync(\\'pip install x\\')'` → package-manager match (herestring NOT blanked)", () => {
    const cmd = `node <<< 'require("child_process").execSync("pip install x")'`;
    // package-manager pattern requires `vnstock` after install/add — use the
    // docker constraint which fires on `docker` alone.
    assert.strictEqual(matchConstraintPattern(`node <<< 'require("child_process").execSync("docker run")'`), "docker");
    // And the herestring must not be blanked by the blanker directly.
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
  });

  test("row 18: `cat <<< 'x'; bash -c '…'` — second command stays visible", () => {
    const cmd = "cat <<< 'x'; bash -c 'docker run ubuntu'";
    assert.strictEqual(matchConstraintPattern(cmd), "docker");
  });

  test("row 18b: herestring followed by NEWLINE + real command — the command is NOT blanked (constraint bypass lock)", () => {
    // Regression: the herestring exclusion must consume the ENTIRE `<<<`
    // operator. Emitting only one `<` re-parses the remaining `<<` as a
    // heredoc and blanks to end — hiding `docker run` on the next line from
    // the docker/sudo constraints (a trust-boundary bypass).
    const cmd = "cat <<< 'x'\ndocker run -it ubuntu";
    assert.strictEqual(stripHeredocBodies(cmd), "cat <<< 'x'\ndocker run -it ubuntu");
    assert.strictEqual(matchConstraintPattern(cmd), "docker");
  });

  test("row 18c: executor-verb herestring + NEWLINE + docker stays visible", () => {
    const cmd = "bash <<< 'x'\ndocker run -it ubuntu";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
    assert.strictEqual(matchConstraintPattern(cmd), "docker");
  });

  test("row 18d: herestring + NEWLINE + sudo stays visible", () => {
    const cmd = "cat <<< 'x'\nsudo rm -rf /tmp/foo";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
    assert.strictEqual(matchConstraintPattern(cmd), "sudo");
  });
});

describe("stripHeredocBodies: matrix rows 19–23 (gate-verb, prefixes, multi-heredoc, opaque spans)", () => {
  test("row 19: `cat <<'EOF' … | bash … EOF` via matchGateVerb → null (no gate-verb block on body bash)", () => {
    const cmd =
      "cat <<'EOF'\n" +
      "some data | bash -c 'echo hi'\n" +
      "EOF";
    assert.strictEqual(matchGateVerb(cmd), null);
  });

  test("row 20: `sudo bash <<'EOF' … vitest run | tail … EOF` escalates (prefixed executor)", () => {
    const cmd =
      "sudo bash <<'EOF'\n" +
      "vitest run foo | tail -10\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "escalate");
  });

  test("row 21: `nice python3 <<'EOF' …` escalates (prefixed executor)", () => {
    const cmd =
      "nice python3 <<'EOF'\n" +
      "print('pnpm test | tail')\n" +
      "EOF";
    assert.strictEqual(promoted(cmd).decision, "escalate");
  });

  test("row 22: two heredocs — `bash <<'B'` body stays visible (per-heredoc verb attribution)", () => {
    const cmd =
      "cat <<'A'\n" +
      "pnpm test x | tail -1\n" +
      "A\n" +
      "bash <<'B'\n" +
      "vitest run y | tail -2\n" +
      "B";
    // The bash heredoc body executes → escalates.
    assert.strictEqual(promoted(cmd).decision, "escalate");
  });

  test("row 23: opaque-span quote reset — unbalanced `don't` in body doesn't hide second heredoc", () => {
    const cmd =
      "bash <<'EOF'\n" +
      'echo "don\'t"\n' +
      "EOF\n" +
      "cat <<'EOF2'\n" +
      "pnpm test x | tail -1\n" +
      "EOF2";
    // Second heredoc (cat, quoted) blanked → ok; the bash body was a no-match.
    assert.strictEqual(promoted(cmd).decision, "ok");
  });
});

describe("stripHeredocBodies: rows 24–26 (fail-closed, kill-switch, quoted-string operator)", () => {
  test("row 24: blanker-throw ⇒ gate evaluates on original command (fail-visible)", () => {
    const cmd =
      "cat <<'EOF'\n" +
      "pnpm test foo | tail -10\n" +
      "EOF";
    // A blanker that throws must not crash the gate — the call site's
    // safeStripHeredocBodies wrapper catches and treats the command as
    // un-blanked (visible direction). We trigger a real throw by passing an
    // invalid allowlist (a plain object, not a Set — `.has` is not a
    // function). The wrapper must return the command unchanged and emit a
    // stderr diagnostic, never propagate.
    assert.strictEqual(safeStripHeredocBodies(cmd, { has: "not-a-function" }), cmd);
    // And the raw function still guards non-string inputs.
    assert.strictEqual(stripHeredocBodies(null), null);
    assert.strictEqual(stripHeredocBodies(undefined), undefined);
    assert.strictEqual(stripHeredocBodies(42), 42);
  });

  test("row 25: GATE_HEREDOC_BLANKER=0 ⇒ pre-pass short-circuits → shape 3 re-false-fires (kill-switch)", () => {
    process.env.GATE_HEREDOC_BLANKER = "0";
    const cmd =
      "cat <<'EOF'\n" +
      "pnpm test foo | tail -10\n" +
      "EOF";
    // With the kill-switch on, the blanker returns the command unchanged, so
    // the heredoc body reaches the regex → escalate (the pre-fix behavior).
    assert.strictEqual(promoted(cmd).decision, "escalate");
  });

  test("row 26: `<<` inside a quoted string (`echo \"a <<'EOF'\"`) not treated as operator", () => {
    const cmd = "echo \"a <<'EOF'\"";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
    // And a real command after it stays visible.
    const real = "echo \"a <<'EOF'\"; docker run ubuntu";
    assert.strictEqual(matchConstraintPattern(real), "docker");
  });
});

describe("stripHeredocBodies: unit behavior", () => {
  test("quoted-delimiter body blanked, operator + terminator preserved, newlines kept", () => {
    const cmd = "cat <<'EOF'\naaa\nbbb\nEOF\n";
    const out = stripHeredocBodies(cmd);
    assert.strictEqual(out, "cat <<'EOF'\n\n\nEOF\n");
  });

  test("unquoted delimiter body left fully visible", () => {
    const cmd = "cat <<EOF\naaa\nEOF\n";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
  });

  test("double-quoted delimiter `<<\"EOF\"` treated as quoted", () => {
    const cmd = "cat <<\"EOF\"\naaa\nEOF\n";
    assert.strictEqual(stripHeredocBodies(cmd), "cat <<\"EOF\"\n\nEOF\n");
  });

  test("executor verb `bash` body left visible even with quoted delimiter", () => {
    const cmd = "bash <<'EOF'\naaa\nEOF\n";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
  });

  test("herestring `<<<` never blanked", () => {
    const cmd = "cat <<< 'aaa'";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
  });

  test("multiple heredocs each blanked per-verb", () => {
    const cmd = "cat <<'A'\nx\nA\ncat <<'B'\ny\nB\n";
    assert.strictEqual(stripHeredocBodies(cmd), "cat <<'A'\n\nA\ncat <<'B'\n\nB\n");
  });

  test("non-blankable verb (ls) body left visible", () => {
    const cmd = "ls <<'EOF'\naaa\nEOF\n";
    assert.strictEqual(stripHeredocBodies(cmd), cmd);
  });
});
