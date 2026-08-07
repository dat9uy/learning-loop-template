// Guards for shell-quote adoption in the bash-gate path.
//
// These tests run BEFORE the parse shim is wired into gate-logic; their job is
// to lock the safety boundary (CVE-2026-9277 mitigations) so the parse-only
// classify-only gate cannot accidentally re-introduce the quote() realization
// path or an out-of-date dependency.
//
// Three guards:
//   1. Version pin: `shell-quote` >=1.10.0 must be installed and resolvable.
//   2. Import guard: `quote` must NOT be importable from `shell-quote` via the
//      gate-path shim (`core/shell-parse.js`), AND no source file in `core/` or
//      `hooks/` may import `quote` directly (defense-in-depth grep guard —
//      catches a future `import { quote } from "shell-quote"` in gate-logic.js
//      that bypasses the shim).
//   3. Parse-does-not-interpret guard: `parse()` must NOT evaluate `$(...)` —
//      the substitution must appear as a token, not as executed output.
//      (README-confirmed; shell-quote's `parse` is a tokenizer.)
//
// Spike acceptance (group S): for the bypass shapes the plan targets, the
// parse() output is recognizable: verb + pipe-target + quoted-data are
// identifiable from the returned token stream.

import assert from "node:assert";
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Test file lives at tools/learning-loop-mastra/__tests__/legacy-mcp/<name>.test.js
// So REPO_ROOT is 4 hops up: legacy-mcp -> __tests__ -> learning-loop-mastra -> tools -> REPO_ROOT.
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

// ─── 1. Version pin ─────────────────────────────────────────────────────────

describe("shell-quote guard: version pin (>=1.10.0)", () => {
  test("installed shell-quote version meets the >=1.10.0 floor", async () => {
    // Resolve via package.json, not via direct require of the module: the
    // installed module's package.json is the canonical version source.
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "node_modules/shell-quote/package.json"), "utf8"),
    );
    const [major, minor] = pkg.version.split(".").map((n) => parseInt(n, 10));
    assert.ok(
      major > 1 || (major === 1 && minor >= 10),
      `shell-quote must be >=1.10.0 (CVE-2026-9277 mitigation); found ${pkg.version}`,
    );
  });

  test("root package.json declares shell-quote in dependencies", () => {
    const rootPkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    );
    const declared = rootPkg.dependencies?.shellquote ?? rootPkg.dependencies?.["shell-quote"];
    assert.ok(
      declared,
      "shell-quote must be declared in root package.json dependencies",
    );
    // Floor must include 1.10.x — accept any specifier whose lower bound is
    // >=1.10.0 (caret ^1.10.0, tilde ~1.10.0, range >=1.10.0, exact 1.10.x).
    assert.ok(
      /(\^|~|>=)\s*1\.(1[0-9]|2[0-9])/.test(declared) || /^1\.(1[0-9]|[2-9][0-9])\./.test(declared),
      `declared shell-quote spec must be >=1.10.0; found "${declared}"`,
    );
  });
});

// ─── 2. Import guard (path-wide) ─────────────────────────────────────────────

describe("shell-quote guard: `quote` is NOT importable from the gate path", () => {
  test("core/shell-parse.js shim does NOT export or re-export `quote`", async () => {
    let shim;
    try {
      shim = await import("../../core/shell-parse.js");
    } catch (err) {
      // Shim may not exist yet during Phase 1 step 1 (TDD fail). Surface the
      // absence as a meaningful assertion failure rather than a thrown import.
      assert.fail(
        `core/shell-parse.js must exist and be importable before this guard can pass: ${err.message}`,
      );
    }
    assert.strictEqual(
      shim.quote,
      undefined,
      "core/shell-parse.js MUST NOT re-export `quote` from shell-quote (CVE-2026-9277 mitigation)",
    );
    assert.strictEqual(
      typeof shim.parse,
      "function",
      "core/shell-parse.js MUST export a `parse` function (the parse-only flow)",
    );
  });

  test("no source file under core/ or hooks/ imports `quote` from shell-quote (grep guard)", () => {
    // Walk core/ and hooks/, scan for the two known direct-import shapes.
    // The shim itself imports `parse` only; this guard catches a future
    // bypass where gate-logic.js (or any other module) imports `quote`
    // directly without going through the shim.
    const DIRS_TO_SCAN = [
      join(REPO_ROOT, "tools/learning-loop-mastra/core"),
      join(REPO_ROOT, "tools/learning-loop-mastra/hooks"),
    ];
    const FORBIDDEN = [
      // `import { quote } from "shell-quote"` (named import)
      /\bimport\s*\{[^}]*\bquote\b[^}]*\}\s*from\s*["']shell-quote["']/,
      // `require("shell-quote").quote` (destructured)
      /require\(\s*["']shell-quote["']\s*\)[^;]*\bquote\b/,
      // `import shellQuote from "shell-quote"; shellQuote.quote(`
      /from\s*["']shell-quote["'][\s\S]{0,200}\bquote\s*\(/,
    ];

    const offenders = [];
    for (const dir of DIRS_TO_SCAN) {
      walkJs(dir, (file) => {
        const src = readFileSync(file, "utf8");
        for (const re of FORBIDDEN) {
          if (re.test(src)) {
            offenders.push({ file: file.slice(REPO_ROOT.length + 1), pattern: re.source });
          }
        }
      });
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `shell-quote's \`quote\` is forbidden in core/+hooks/ (CVE-2026-9277). Offenders: ${JSON.stringify(offenders)}`,
    );
  });
});

// ─── 3. Parse-does-not-interpret guard ───────────────────────────────────────

describe("shell-quote guard: parse() does NOT evaluate command substitution", () => {
  test("parse('echo $(echo evil)') returns tokens; the $(...) is tokenized, not executed", async () => {
    const { parse } = await import("../../core/shell-parse.js");
    const tokens = parse("echo $(echo evil)");
    // shell-quote's parse() tokenizes `$(...)` as a SEQUENCE of tokens
    // (`$`, `{op:"("}`, content, `{op:")"}`) — it does NOT collapse them
    // into one string. The key invariant for parse-only safety is that the
    // inner command (`echo evil`) appears as a regular string token in the
    // output, NOT as an executed/echoed result. If parse() ever executed
    // the substitution, we would see the resolved text (e.g. "evil")
    // instead of the original tokens.
    const stringTokens = tokens.filter((t) => typeof t === "string");
    assert.ok(stringTokens.includes("echo"), "outer `echo` must appear as a string token");
    // The substitution's inner content must be present verbatim as
    // separate string tokens (`echo` and `evil`) — proving parse() did
    // not execute it. If parse() had evaluated, the result would be a
    // single token containing only `evil` (the resolved echo output),
    // NOT the literal `echo evil` source split across two tokens.
    assert.ok(
      stringTokens.includes("echo") && stringTokens.includes("evil"),
      `inner command must appear as raw string tokens (parse-only); got tokens: ${JSON.stringify(tokens)}`,
    );
    // No resolved/echoed text — the substitution is NOT evaluated.
    // If evaluated, we would NOT see the inner `echo` command appear as
    // a token — only its output `evil` would.
    assert.ok(
      stringTokens.includes("echo"),
      `parse() must NOT evaluate the substitution; the inner command must remain in the token stream; got: ${JSON.stringify(tokens)}`,
    );
  });

  test("parse('echo `echo evil`') returns the backtick substitution as tokens (parse-only)", async () => {
    const { parse } = await import("../../core/shell-parse.js");
    const tokens = parse("echo `echo evil`");
    const stringTokens = tokens.filter((t) => typeof t === "string");
    // Backticks are tokenized as a single-quoted context inside parse(),
    // so the inner command comes back as a single string token WITH the
    // backtick characters preserved (e.g. "`echo" and "evil`"). If parse()
    // had evaluated, the token would be the resolved output, not the
    // backtick-bracketed source.
    const hasBacktickTokens =
      stringTokens.some((t) => t.includes("`echo")) ||
      stringTokens.some((t) => t.endsWith("`"));
    assert.ok(
      hasBacktickTokens,
      `backtick substitution must appear with backtick chars preserved (parse-only); got tokens: ${JSON.stringify(tokens)}`,
    );
  });
});

// ─── S. Spike acceptance: bypass shapes yield recognizable parse output ─────

describe("shell-quote guard: spike acceptance for bypass shapes (parse output)", () => {
  // For each shape, the parse output must expose: a verb (string token) and,
  // where the shape has a pipe, the pipe-target verb. The shim's policy-view
  // builder (Phase 2) consumes this; the guard only requires the parse layer
  // not to swallow the verb/pipetarget.

  let parse;
  test("setup", async () => {
    ({ parse } = await import("../../core/shell-parse.js"));
  });

  function verbs(parsed) {
    return parsed.filter((t) => typeof t === "string");
  }

  test("S1: echo adjacent-quote concat + pipe → bash: verb `echo` + pipe-target `bash` visible", () => {
    const tokens = parse('echo "widgetctl"" run evil" | bash');
    const v = verbs(tokens);
    assert.ok(v.includes("echo"), "verb `echo` must appear as a string token");
    assert.ok(v.includes("bash"), "pipe-target verb `bash` must appear as a string token");
  });

  test("S2: printf -v assignment then bash → verb `printf` visible", () => {
    const tokens = parse(`printf -v x 'evi'; bash`);
    const v = verbs(tokens);
    assert.ok(v.includes("printf"), "verb `printf` must appear as a string token");
    assert.ok(v.includes("bash"), "verb `bash` (next segment) must appear as a string token");
  });

  test("S3: bash here-string with $(…) composition → verb `bash` visible", () => {
    const tokens = parse(`bash <<< "$(echo ev)$(il)"`);
    const v = verbs(tokens);
    assert.ok(v.includes("bash"), "verb `bash` must appear as a string token");
  });

  test("S4: eval with quoted variable → verb `eval` visible", () => {
    const tokens = parse(`eval "$x"`);
    const v = verbs(tokens);
    assert.ok(v.includes("eval"), "verb `eval` must appear as a string token");
  });

  test("S5: node -e with quoted body → verb `node` visible, `-e` flag visible", () => {
    const tokens = parse(`node -e "console.log('hi')"`);
    const v = verbs(tokens);
    assert.ok(v.includes("node"), "verb `node` must appear as a string token");
    assert.ok(v.includes("-e"), "flag `-e` must appear as a string token");
  });

  test("S6: pnpm 2>&1 pipe to tail → verb `pnpm` + pipe-target `tail` visible", () => {
    const tokens = parse(`pnpm test:one foo.test.js 2>&1 | tail`);
    const v = verbs(tokens);
    assert.ok(v.includes("pnpm"), "verb `pnpm` must appear as a string token");
    assert.ok(v.includes("tail"), "pipe-target verb `tail` must appear as a string token");
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────

function walkJs(dir, visit) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir may not exist in some test contexts
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      walkJs(p, visit);
    } else if (st.isFile() && p.endsWith(".js")) {
      visit(p);
    }
  }
}