// Gate-verb layer tests — the security boundary that closes finding 3's
// bypass class. Every command whose verb (or pipe-target verb) is a
// configured gate-verb returns `escalate` when no active observation
// exists; passes when one does — same decision shape as docker/sudo.
//
// Gate-verbs cover BOTH direct executors (bash/sh/eval/zsh/ksh/dash)
// AND indirection-to-executor verbs (env/xargs/find -exec/exec/./source),
// plus verb+flag variants (node -e, python -c, ruby -e, perl -e/E).
// PATH-qualified verbs normalize via basename; command-prefixes
// (sudo/time/nice/nohup/command) skip past to the real verb.

import assert from "node:assert";
import { describe, test } from "vitest";
import { matchGateVerb } from "../../core/gate-logic.js";

// ─── A. Direct executor bypass shapes — escalate without observation ───

describe("matchGateVerb: direct executor shapes (no observation)", () => {
  test("echo + pipe to bash → gate-verb:bash", () => {
    const result = matchGateVerb('echo "evil" | bash');
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("printf -v assignment then bash → gate-verb on the bash segment", () => {
    const result = matchGateVerb(`printf -v x 'evi'; bash`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("bash here-string with $() composition → gate-verb:bash", () => {
    const result = matchGateVerb(`bash <<< "$(echo ev)$(il)"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("eval with quoted variable → gate-verb:eval", () => {
    const result = matchGateVerb(`eval "$x"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:eval");
  });

  test("node -e with assembled execSync → gate-verb:node", () => {
    const result = matchGateVerb(`node -e "require('child_process').execSync('evil')"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:node");
  });

  test("sh -c → gate-verb:sh", () => {
    const result = matchGateVerb(`sh -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:sh");
  });

  test("python -c with import → gate-verb:python", () => {
    const result = matchGateVerb(`python -c "import os; os.system('evil')"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:python");
  });

  test("zsh -c → gate-verb:zsh", () => {
    const result = matchGateVerb(`zsh -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:zsh");
  });
});

// ─── A2. Indirection-to-executor verbs (red-team #1) ───

describe("matchGateVerb: indirection-to-executor verbs", () => {
  test("env bash -c → gate-verb:env (env with gate-verb arg is indirection)", () => {
    const result = matchGateVerb(`env bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:env");
  });

  test("xargs bash → gate-verb:xargs", () => {
    const result = matchGateVerb(`echo "evil" | xargs bash`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:xargs");
  });

  test("find . -exec bash → gate-verb:find", () => {
    const result = matchGateVerb(`find . -exec bash -c 'evil' \\;`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:find");
  });

  test("PATH-qualified /bin/bash → gate-verb:bash (basename normalization)", () => {
    const result = matchGateVerb(`/bin/bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("/usr/bin/zsh -c → gate-verb:zsh", () => {
    const result = matchGateVerb(`/usr/bin/zsh -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:zsh");
  });

  test(". evil.sh (dot/source alias) → gate-verb:.", () => {
    const result = matchGateVerb(`. evil.sh`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:.");
  });

  test("source evil.sh → gate-verb:source", () => {
    const result = matchGateVerb(`source evil.sh`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:source");
  });

  test("exec bash → gate-verb:exec", () => {
    const result = matchGateVerb(`exec bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:exec");
  });

  test("command bash -c → verb bash via prefix skip, gate-verb:bash", () => {
    const result = matchGateVerb(`command bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("sudo bash -c → verb bash via sudo prefix skip, gate-verb:bash", () => {
    const result = matchGateVerb(`sudo bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("nice bash → gate-verb:bash", () => {
    const result = matchGateVerb(`nice bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });

  test("nohup bash → gate-verb:bash", () => {
    const result = matchGateVerb(`nohup bash -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:bash");
  });
});

// ─── A3. verb+flag variants (red-team #5) ───

describe("matchGateVerb: verb+flag variants", () => {
  test("node --eval → gate-verb:node", () => {
    const result = matchGateVerb(`node --eval "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:node");
  });

  test("node -p → gate-verb:node", () => {
    const result = matchGateVerb(`node -p "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:node");
  });

  test("python3 -c → gate-verb:python3", () => {
    const result = matchGateVerb(`python3 -c "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:python3");
  });

  test("perl -e → gate-verb:perl", () => {
    const result = matchGateVerb(`perl -e "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:perl");
  });

  test("perl -E → gate-verb:perl", () => {
    const result = matchGateVerb(`perl -E "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:perl");
  });

  test("ruby -e → gate-verb:ruby", () => {
    const result = matchGateVerb(`ruby -e "evil"`);
    assert.ok(result);
    assert.strictEqual(result, "gate-verb:ruby");
  });

  // Negative — flag is required for verb+flag entries.
  test("node script.js → NOT a gate-verb (no -e flag)", () => {
    const result = matchGateVerb(`node script.js`);
    assert.strictEqual(result, null);
  });

  test("python script.py → NOT a gate-verb (no -c flag)", () => {
    const result = matchGateVerb(`python script.py`);
    assert.strictEqual(result, null);
  });
});

// ─── C. Non-gate-verb commands pass through ───

describe("matchGateVerb: non-executor verbs are NOT gated by the verb layer", () => {
  test("pnpm test → null (verb layer doesn't gate)", () => {
    assert.strictEqual(matchGateVerb(`pnpm test`), null);
  });

  test("git commit -m → null", () => {
    assert.strictEqual(matchGateVerb(`git commit -m "msg"`), null);
  });

  test("node loop.mjs ... → null (no -e flag)", () => {
    assert.strictEqual(matchGateVerb(`node loop.mjs meta_state_list '{}'`), null);
  });

  test("cat file → null", () => {
    assert.strictEqual(matchGateVerb(`cat file.txt`), null);
  });

  test("tail -f file → null", () => {
    assert.strictEqual(matchGateVerb(`tail -f file.log`), null);
  });

  test("grep pattern file → null", () => {
    assert.strictEqual(matchGateVerb(`grep pattern file.txt`), null);
  });
});

// ─── Indirection predicate: env/xargs/find only match when followed by executor ───

describe("matchGateVerb: indirection predicate precision", () => {
  test("env FOO=bar (no executor verb) → null", () => {
    // `env` alone with only env-assignments does not execute a verb.
    assert.strictEqual(matchGateVerb(`env FOO=bar`), null);
  });

  test("find . -name '*.js' (no -exec) → null", () => {
    // find without -exec/-execdir/-ok does not execute.
    assert.strictEqual(matchGateVerb(`find . -name '*.js'`), null);
  });
});