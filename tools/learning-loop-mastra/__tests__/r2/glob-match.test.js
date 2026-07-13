import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { globMatch } from "../../core/gate-logic.js";

// Locks the semantics of `core/gate-logic.js#globMatch` so the R2 gate can rely
// on them without re-implementing glob logic (F14 / R10).
describe("globMatch semantics (R2 lock)", () => {
  test("empty pattern matches only empty string", () => {
    assert.equal(globMatch("", ""), true);
    assert.equal(globMatch("", "x"), false);
  });

  test("literal pattern matches exactly", () => {
    assert.equal(globMatch("runtime-state.jsonl", "runtime-state.jsonl"), true);
    assert.equal(globMatch("runtime-state.jsonl", "other.jsonl"), false);
  });

  test("dot is escaped (literal dot, not any-char)", () => {
    assert.equal(globMatch(".gate-override", ".gate-override"), true);
    // a wildcard-dot must NOT match an arbitrary char where a literal dot is expected
    assert.equal(globMatch(".gate-override", "xgate-override"), false);
  });

  test("single * matches [^/]* (no slash)", () => {
    assert.equal(globMatch(".claude/*", ".claude/x"), true);
    assert.equal(globMatch(".claude/*", ".claude/sub/x"), false, "* must not cross /");
  });

  test("** (globstar) matches across slashes including hidden", () => {
    assert.equal(globMatch(".claude/**", ".claude/x"), true);
    assert.equal(globMatch(".claude/**", ".claude/a/b/c"), true);
    assert.equal(globMatch(".claude/**", ".claude/.hidden/file"), true, "** matches .hidden");
    assert.equal(globMatch(".claude/**", ".factory/x"), false);
  });

  test("** at start: **/X requires a slash before X (globMatch translates ** to .*)", () => {
    // globMatch converts ** to .* and the following / is a literal. So **/X
    // matches "<anything>/X" but NOT the bare "X". This is the locked
    // semantics — BOOTSTRAP_DENY_PATTERNS must include BOTH "**/X" and "X"
    // to catch the bare-form write (e.g. ".loop/r2-allowlist.json" with no
    // path prefix).
    assert.equal(globMatch("**/.loop/r2-allowlist.json", "sub/.loop/r2-allowlist.json"), true);
    assert.equal(globMatch("**/.loop/r2-allowlist.json", "a/b/.loop/r2-allowlist.json"), true);
    assert.equal(globMatch("**/.loop/r2-allowlist.json", ".loop/r2-allowlist.json"), false, "**/X requires a slash before X; bare form needs its own pattern");
    assert.equal(globMatch("**/.loop/r2-allowlist.json", ".loop/other.json"), false);
  });

  test("**/runtime-state.jsonl: nested matches, bare form does not", () => {
    assert.equal(globMatch("**/runtime-state.jsonl", "deep/path/runtime-state.jsonl"), true);
    assert.equal(globMatch("**/runtime-state.jsonl", "runtime-state.jsonl"), false, "bare form needs its own pattern");
    assert.equal(globMatch("**/runtime-state.jsonl", "runtime-state.json"), false);
  });

  test(".claude** no-slash ambiguity still matches (warned but functional)", () => {
    // The phase file says `.claude**` (no slash before **) emits a startup
    // warning but still matches. globMatch treats ** as .*, so `.claude**`
    // matches `.claude` + anything (including slashes). This documents the
    // ambiguity: prefer `.claude/**` for "under .claude/".
    assert.equal(globMatch(".claude**", ".claude/x"), true);
    assert.equal(globMatch(".claude**", ".claude/a/b"), true);
    assert.equal(globMatch(".claude**", ".factory/x"), false);
  });

  test("brace expansion", () => {
    assert.equal(globMatch("{.claude,.factory}/**", ".claude/x"), true);
    assert.equal(globMatch("{.claude,.factory}/**", ".factory/x"), true);
    assert.equal(globMatch("{.claude,.factory}/**", ".mastracode/x"), false);
  });

  test("brace expansion with suffix", () => {
    assert.equal(globMatch("foo{A,B}bar", "fooAbar"), true);
    assert.equal(globMatch("foo{A,B}bar", "fooBbar"), true);
    assert.equal(globMatch("foo{A,B}bar", "fooCbar"), false);
  });

  test("wildcard matches dotfiles (** matches .*)", () => {
    // R10: ** must match paths starting with a dot
    assert.equal(globMatch("records/**", "records/.gitkeep"), true);
    assert.equal(globMatch("records/**/.gitkeep", "records/sub/.gitkeep"), true);
  });

  test("anchored full-path match (^$)", () => {
    // globMatch anchors the regex; partial matches must fail
    assert.equal(globMatch(".claude/**", "prefix/.claude/x"), false);
  });

  test("multiple ** segments", () => {
    assert.equal(globMatch("**/coordination/**", "a/coordination/b"), true);
    assert.equal(globMatch("**/coordination/**", "deep/coordination/x/y"), true);
    assert.equal(globMatch("**/coordination/**", "a/b"), false);
  });
});