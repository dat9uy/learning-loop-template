// classifyPolicyTokens — the parse-to-policy-view shim that converts a shell
// command string into a structured view the gate checks against. Owns token
// interpretation only; gate-verbs / inert-sinks / data-verbs are policy,
// applied in later phases from patterns.json config.
//
// Policy view shape:
//   { segments: [{ verb, args, quotedDataArgs, hasRedirect, pipeTarget? }],
//     containsExec: boolean }
//
// Tests below lock the structural shape across the bypass + legitimate
// shapes the plan targets. They are pure-function tests — no I/O, no gate.

import assert from "node:assert";
import { describe, test } from "vitest";
import { classifyPolicyTokens } from "../../core/shell-parse.js";

function firstSegment(cmd) {
  const view = classifyPolicyTokens(cmd);
  assert.ok(view.segments.length >= 1, `expected at least one segment for: ${cmd}`);
  return view.segments[0];
}

// ─── A. Verb recognition (command-prefix skip + env-assignment skip + basename) ──

describe("classifyPolicyTokens: verb recognition", () => {
  test("A1: simple verb", () => {
    assert.strictEqual(firstSegment("pnpm test").verb, "pnpm");
  });

  test("A2: command-prefix `sudo` is skipped → verb is the next", () => {
    assert.strictEqual(firstSegment("sudo apt update").verb, "apt");
  });

  test("A3: command-prefix `command` is skipped → verb is the next", () => {
    assert.strictEqual(firstSegment("command bash -c \"evil\"").verb, "bash");
  });

  test("A4: command-prefix `nice` is skipped", () => {
    assert.strictEqual(firstSegment("nice bash -c \"evil\"").verb, "bash");
  });

  test("A5: command-prefix `nohup` is skipped", () => {
    assert.strictEqual(firstSegment("nohup bash -c \"evil\"").verb, "bash");
  });

  test("A6: command-prefix `time` is skipped", () => {
    assert.strictEqual(firstSegment("time bash -c \"evil\"").verb, "bash");
  });

  test("A7: env-assignment `FOO=bar` is skipped → verb is the next", () => {
    assert.strictEqual(firstSegment("FOO=bar bash").verb, "bash");
  });

  test("A8: PATH-qualified verb `/bin/bash` normalizes via basename", () => {
    assert.strictEqual(firstSegment("/bin/bash -c \"evil\"").verb, "bash");
  });

  test("A9: PATH-qualified verb `/usr/bin/zsh` normalizes via basename", () => {
    assert.strictEqual(firstSegment("/usr/bin/zsh -c \"evil\"").verb, "zsh");
  });

  test("A10: stacked command-prefixes + env-assignment all skipped", () => {
    // sudo + env-prefix + PATH-qualified: verb is bash.
    assert.strictEqual(firstSegment("sudo FOO=bar /bin/bash -c \"evil\"").verb, "bash");
  });
});

// ─── B. Indirection verbs surface (red-team #1, #2) ──

describe("classifyPolicyTokens: indirection-to-executor verbs surface", () => {
  test("B1: bare `env bash -c …` surfaces verb `env`", () => {
    assert.strictEqual(firstSegment("env bash -c \"evil\"").verb, "env");
  });

  test("B2: bare `xargs bash` surfaces verb `xargs`", () => {
    assert.strictEqual(firstSegment("xargs bash").verb, "xargs");
  });

  test("B3: `find . -exec bash …` surfaces verb `find`", () => {
    assert.strictEqual(firstSegment("find . -exec bash -c \"evil\" \\;").verb, "find");
  });

  test("B4: `. evil.sh` (dot/source alias) surfaces verb `.`", () => {
    assert.strictEqual(firstSegment(". evil.sh").verb, ".");
  });

  test("B5: `source evil.sh` surfaces verb `source`", () => {
    assert.strictEqual(firstSegment("source evil.sh").verb, "source");
  });

  test("B6: `exec bash` surfaces verb `exec`", () => {
    assert.strictEqual(firstSegment("exec bash -c \"evil\"").verb, "exec");
  });

  test("B7: bare `env` with only env-assignments surfaces verb `env` (Phase 3 distinguishes)", () => {
    // Indirection predicate lives in Phase 3 (env with a gate-verb arg).
    // The shim just surfaces `env` so Phase 3 can decide.
    assert.strictEqual(firstSegment("env FOO=bar").verb, "env");
  });
});

// ─── C. Real pipe vs logical op (pipeTarget only on real pipe) ──

describe("classifyPolicyTokens: real pipe sets pipeTarget; logical ops do not", () => {
  test("C1: real pipe `|` sets pipeTarget", () => {
    const view = classifyPolicyTokens('echo "x" | tail');
    assert.strictEqual(view.segments.length, 2);
    assert.strictEqual(view.segments[0].verb, "echo");
    assert.strictEqual(view.segments[0].pipeTarget, "tail");
    assert.strictEqual(view.segments[1].verb, "tail");
    assert.strictEqual(view.segments[1].pipeTarget, undefined);
  });

  test("C2: logical OR `||` does NOT set pipeTarget", () => {
    const view = classifyPolicyTokens('echo "x" || bash');
    assert.strictEqual(view.segments[0].verb, "echo");
    assert.strictEqual(view.segments[0].pipeTarget, undefined);
    assert.strictEqual(view.segments[1].verb, "bash");
  });

  test("C3: logical AND `&&` does NOT set pipeTarget", () => {
    const view = classifyPolicyTokens('echo "x" && bash');
    assert.strictEqual(view.segments[0].pipeTarget, undefined);
    assert.strictEqual(view.segments[1].verb, "bash");
  });

  test("C4: sequence `;` does NOT set pipeTarget", () => {
    const view = classifyPolicyTokens('echo "x"; bash');
    assert.strictEqual(view.segments[0].pipeTarget, undefined);
    assert.strictEqual(view.segments[1].verb, "bash");
  });

  test("C5: two real pipes (chain) set pipeTarget on each non-last segment", () => {
    const view = classifyPolicyTokens('echo "x" | cat | bash');
    assert.strictEqual(view.segments.length, 3);
    assert.strictEqual(view.segments[0].pipeTarget, "cat");
    assert.strictEqual(view.segments[1].pipeTarget, "bash");
    assert.strictEqual(view.segments[2].pipeTarget, undefined);
  });

  test("C6: `2>&1` is NOT a pipe (it is fd duplication, a redirect-flag)", () => {
    // `2>&1 | tail` — `2>&1` does not split segments, the only real `|`
    // sets pipeTarget to `tail`.
    const view = classifyPolicyTokens("pnpm test 2>&1 | tail");
    assert.strictEqual(view.segments.length, 2);
    assert.strictEqual(view.segments[0].verb, "pnpm");
    assert.strictEqual(view.segments[0].pipeTarget, "tail");
  });
});

// ─── D. HasRedirect (every redirect form, including &>, >&, fd-numbered) ──

describe("classifyPolicyTokens: hasRedirect detects every redirect form", () => {
  test("D1: `>` (write)", () => {
    assert.strictEqual(firstSegment('echo "x" > /tmp/f').hasRedirect, true);
  });

  test("D2: `>>` (append)", () => {
    assert.strictEqual(firstSegment('echo "x" >> /tmp/f').hasRedirect, true);
  });

  test("D3: `<` (read from file)", () => {
    assert.strictEqual(firstSegment("bash < /tmp/f").hasRedirect, true);
  });

  test("D4: `<<EOF` heredoc", () => {
    assert.strictEqual(firstSegment("bash <<EOF\nhi\nEOF").hasRedirect, true);
  });

  test("D5: `<<<` here-string", () => {
    assert.strictEqual(firstSegment('bash <<< "x"').hasRedirect, true);
  });

  test("D6: `&>` (write both) — the rejoin across the tokenizer", () => {
    // `&` is parsed as a logical op, so `echo "x" &> f` becomes
    // `echo "x" &` + `> f` in the raw token stream. The shim must rejoin
    // these into a `&>` redirect on the originating segment.
    assert.strictEqual(firstSegment('echo "x" &> /tmp/f').hasRedirect, true);
  });

  test("D7: `&>>` (append both)", () => {
    assert.strictEqual(firstSegment('echo "x" &>> /tmp/f').hasRedirect, true);
  });

  test("D8: `>&` (duplicate fd)", () => {
    assert.strictEqual(firstSegment('echo "x" >& /tmp/f').hasRedirect, true);
  });

  test("D9: fd-numbered `1>`", () => {
    assert.strictEqual(firstSegment('echo "x" 1> /tmp/f').hasRedirect, true);
  });

  test("D10: fd-numbered `2>&1` (the redirect-flag for fd duplication)", () => {
    assert.strictEqual(firstSegment("bash 2>&1").hasRedirect, true);
  });

  test("D11: no redirect → hasRedirect is false", () => {
    assert.strictEqual(firstSegment("pnpm test").hasRedirect, false);
  });
});

// ─── E. ContainsExec global flag (red-team #3) ──

describe("classifyPolicyTokens: containsExec flag (any exec segment disables blanking)", () => {
  test("E1: `exec > /tmp/f` sets containsExec", () => {
    const view = classifyPolicyTokens('exec > /tmp/f');
    assert.strictEqual(view.containsExec, true);
  });

  test("E2: `exec bash` sets containsExec", () => {
    const view = classifyPolicyTokens("exec bash");
    assert.strictEqual(view.containsExec, true);
  });

  test("E3: command with no `exec` → containsExec false", () => {
    const view = classifyPolicyTokens("echo x");
    assert.strictEqual(view.containsExec, false);
  });
});

// ─── F. Quoted data args (DATA, not code) ──

describe("classifyPolicyTokens: quotedDataArgs captures tokens that came from a quoted context", () => {
  test("F1: `echo \"hello world\"` records `hello world` as quotedData", () => {
    assert.deepStrictEqual(firstSegment('echo "hello world"').quotedDataArgs, ["hello world"]);
  });

  test("F2: `printf '%s\\n' 'evil'` records the JSON arg as quotedData", () => {
    const seg = firstSegment(`printf '%s\\n' '{"x":"evil"}'`);
    assert.deepStrictEqual(seg.quotedDataArgs, ["%s\\n", '{"x":"evil"}']);
  });

  test("F3: adjacent-quote concat collapses to one quotedData arg", () => {
    const seg = firstSegment('echo "widgetctl"" run evil"');
    assert.deepStrictEqual(seg.quotedDataArgs, ["widgetctl run evil"]);
  });

  test("F4: `node -e \"code\"` records the body as quotedData", () => {
    const seg = firstSegment(`node -e "console.log('hi')"`);
    assert.deepStrictEqual(seg.quotedDataArgs, ["console.log('hi')"]);
  });

  test("F5: unquoted args are NOT in quotedDataArgs", () => {
    const seg = firstSegment("pnpm test:one foo.test.js");
    assert.deepStrictEqual(seg.quotedDataArgs, []);
  });
});

// ─── G. Bypass shapes from brainstorm ──

describe("classifyPolicyTokens: brainstorm bypass shapes", () => {
  test("G1: echo adjacent-quote concat + pipe to bash", () => {
    const view = classifyPolicyTokens('echo "widgetctl"" run evil" | bash');
    assert.strictEqual(view.segments.length, 2);
    assert.strictEqual(view.segments[0].verb, "echo");
    assert.strictEqual(view.segments[0].pipeTarget, "bash");
    assert.deepStrictEqual(view.segments[0].quotedDataArgs, ["widgetctl run evil"]);
    assert.strictEqual(view.segments[1].verb, "bash");
  });

  test("G2: printf -v assignment then bash", () => {
    const view = classifyPolicyTokens(`printf -v x 'evi'; bash`);
    assert.strictEqual(view.segments.length, 2);
    assert.strictEqual(view.segments[0].verb, "printf");
    assert.deepStrictEqual(view.segments[0].args.slice(0, 2), ["-v", "x"]);
    assert.strictEqual(view.segments[0].pipeTarget, undefined); // ; not pipe
    assert.strictEqual(view.segments[1].verb, "bash");
  });

  test("G3: bash here-string with $() composition", () => {
    const view = classifyPolicyTokens(`bash <<< "$(echo ev)$(il)"`);
    assert.strictEqual(view.segments.length, 1);
    assert.strictEqual(view.segments[0].verb, "bash");
    assert.strictEqual(view.segments[0].hasRedirect, true);
  });

  test("G4: eval with quoted variable", () => {
    const view = classifyPolicyTokens(`eval "$x"`);
    assert.strictEqual(view.segments[0].verb, "eval");
  });

  test("G5: node -e with body", () => {
    const view = classifyPolicyTokens(`node -e "require('child_process').exec('evil')"`);
    assert.strictEqual(view.segments[0].verb, "node");
    assert.deepStrictEqual(view.segments[0].args[0], "-e");
    assert.strictEqual(view.segments[0].quotedDataArgs.length, 1);
  });

  test("G6: pnpm test piped to tail", () => {
    const view = classifyPolicyTokens(`pnpm test:one foo.test.js 2>&1 | tail`);
    assert.strictEqual(view.segments[0].verb, "pnpm");
    assert.strictEqual(view.segments[0].pipeTarget, "tail");
    assert.strictEqual(view.segments[1].verb, "tail");
  });
});

// ─── H. Indirection + command-prefix + PATH-qualified combinations ──

describe("classifyPolicyTokens: combined shapes (red-team regressions)", () => {
  test("H1: `sudo bash -c \"evil\"` → verb `bash` (sudo is a prefix, gated independently)", () => {
    assert.strictEqual(firstSegment("sudo bash -c \"evil\"").verb, "bash");
  });

  test("H2: `/bin/bash -c \"evil\"` → verb `bash` (basename normalization)", () => {
    assert.strictEqual(firstSegment("/bin/bash -c \"evil\"").verb, "bash");
  });

  test("H3: `command bash -c \"evil\"` → verb `bash` (command prefix skipped)", () => {
    assert.strictEqual(firstSegment("command bash -c \"evil\"").verb, "bash");
  });

  test("H4: `nice bash -c \"evil\"` → verb `bash`", () => {
    assert.strictEqual(firstSegment("nice bash -c \"evil\"").verb, "bash");
  });

  test("H5: `FOO=bar bash` → verb `bash` (env-assignment skipped)", () => {
    assert.strictEqual(firstSegment("FOO=bar bash").verb, "bash");
  });

  test("H6: `echo \"x\" && bash` → echo's pipeTarget is unset, bash is its own segment", () => {
    const view = classifyPolicyTokens('echo "x" && bash');
    assert.strictEqual(view.segments[0].verb, "echo");
    assert.strictEqual(view.segments[0].pipeTarget, undefined);
    assert.strictEqual(view.segments[1].verb, "bash");
  });
});