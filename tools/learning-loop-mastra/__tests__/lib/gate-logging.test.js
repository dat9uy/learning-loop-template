/**
 * Regression test for the "undefined/.claude/coordination/gate-log.jsonl"
 * silent-failure bug:
 *
 * Bug: `appendGateLog` did not validate its `root` argument. When tests
 * restored `process.env.GATE_ROOT = originalEnv` in a `finally` block with
 * `originalEnv === undefined`, Node coerced the assignment to the string
 * `"undefined"`. `resolveRoot()` then returned `<cwd>/undefined`, and
 * `appendGateLog` happily created that bogus directory via `mkdirSync`.
 *
 * Fix: `appendGateLog` now validates `root` and throws when the value is
 * not a non-empty absolute path. This test pins the contract: a bad
 * `root` MUST throw, not silently mkdir a junk directory.
 *
 * Companion to plan 260707-0812 Phase 4 fallow-gate closeout: this test
 * would have caught the bug when it first appeared.
 */

import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendGateLog } from "../../../lib/gate-logging.js";

describe("appendGateLog contract", () => {
  test("throws when root is undefined", () => {
    assert.throws(
      () => appendGateLog(undefined, { tool: "test", timestamp: "x" }),
      /invalid root/i,
    );
  });

  test("throws when root is the literal string 'undefined' (test pattern pollution)", () => {
    assert.throws(
      () => appendGateLog("undefined", { tool: "test", timestamp: "x" }),
      /invalid root/i,
    );
  });

  test("throws when root is an empty string", () => {
    assert.throws(
      () => appendGateLog("", { tool: "test", timestamp: "x" }),
      /invalid root/i,
    );
  });

  test("throws when root is a relative path", () => {
    assert.throws(
      () => appendGateLog("relative/path", { tool: "test", timestamp: "x" }),
      /must be an absolute path/i,
    );
  });

  test("does NOT create a junk directory at `<root>/.claude/coordination` when root is invalid", () => {
    const cwd = process.cwd();
    const bogusPath = resolve(cwd, "undefined");
    rmSync(bogusPath, { recursive: true, force: true });

    try {
      assert.throws(
        () => appendGateLog(undefined, { tool: "test", timestamp: "x" }),
      );
      // The original bug created this directory; with the fix it must not exist.
      assert.strictEqual(
        existsSync(bogusPath),
        false,
        `appendGateLog must not create ${bogusPath} (the original bug)`,
      );
    } finally {
      rmSync(bogusPath, { recursive: true, force: true });
    }
  });

  test("writes a JSONL entry to `<root>/.claude/coordination/gate-log.jsonl` when root is valid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-log-ok-"));
    try {
      appendGateLog(tempDir, { tool: "test-ok", timestamp: "2026-07-08T00:00:00Z" });
      const logPath = join(tempDir, ".claude", "coordination", "gate-log.jsonl");
      assert.ok(existsSync(logPath), `expected gate-log to exist at ${logPath}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});