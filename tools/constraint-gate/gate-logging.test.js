import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendGateLog, rotateGateLog } from "./gate-logging.js";

describe("gate-logging", () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gate-logging-test-"));
  });

  it("appendGateLog creates log file if missing", () => {
    appendGateLog(tmp, { tool: "test", decision: "ok" });
    const logPath = join(tmp, ".claude", "coordination", "gate-log.jsonl");
    const content = readFileSync(logPath, "utf8");
    assert.ok(content.includes("test"));
    assert.ok(content.includes("ok"));
  });

  it("appendGateLog appends multiple entries", () => {
    appendGateLog(tmp, { tool: "test1" });
    appendGateLog(tmp, { tool: "test2" });
    const logPath = join(tmp, ".claude", "coordination", "gate-log.jsonl");
    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).tool, "test1");
    assert.equal(JSON.parse(lines[1]).tool, "test2");
  });

  it("rotateGateLog rotates when size exceeds limit", () => {
    const logDir = join(tmp, ".claude", "coordination");
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, "gate-log.jsonl");
    // Write a large file to trigger rotation
    const largeContent = "x".repeat(11 * 1024 * 1024);
    writeFileSync(logPath, largeContent);
    rotateGateLog(logDir);
    assert.ok(!statSync(logPath, { throwIfNoEntry: false })?.isFile() || statSync(logPath).size < 100);
    const backups = readdirSync(logDir).filter((f) => f.startsWith("gate-log-"));
    assert.ok(backups.length > 0);
  });

  it("rotateGateLog does not throw on missing file", () => {
    const logDir = join(tmp, ".claude", "coordination");
    mkdirSync(logDir, { recursive: true });
    assert.doesNotThrow(() => rotateGateLog(logDir));
  });

  it("appendGateLog does not throw on failure", () => {
    // Pass an invalid root path that cannot be written to
    assert.doesNotThrow(() => appendGateLog("/nonexistent/root", { tool: "test" }));
  });
});
