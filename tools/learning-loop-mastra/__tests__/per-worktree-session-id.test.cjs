"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function repoRoot() {
  return join(__dirname, "..", "..", "..");
}

// Plan 260711-0030 Phase 5 RED test.

test("two distinct worktrees (with .git/HEAD) get distinct session IDs", async () => {
  const wt1 = mkdtempSync(join(tmpdir(), "wt-session-A-"));
  const wt2 = mkdtempSync(join(tmpdir(), "wt-session-B-"));
  try {
    mkdirSync(join(wt1, ".git"));
    writeFileSync(join(wt1, ".git", "HEAD"), "ref: refs/heads/feature-A\n");
    mkdirSync(join(wt2, ".git"));
    writeFileSync(join(wt2, ".git", "HEAD"), "ref: refs/heads/feature-B\n");

    const { getSessionId } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/core/worktree-session-id.js")
    );
    const id1 = getSessionId(wt1);
    const id2 = getSessionId(wt2);
    assert.notEqual(id1, id2, "distinct worktrees get distinct session IDs");
    assert.equal(id1.length, 12, "session id is 12-char hex");
    assert.equal(id2.length, 12, "session id is 12-char hex");
  } finally {
    rmSync(wt1, { recursive: true, force: true });
    rmSync(wt2, { recursive: true, force: true });
  }
});

test("non-git fallback uses random suffix (distinct ids in same second)", async () => {
  const wt1 = mkdtempSync(join(tmpdir(), "nongit-A-"));
  const wt2 = mkdtempSync(join(tmpdir(), "nongit-B-"));
  try {
    const { getSessionId } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/core/worktree-session-id.js")
    );
    const id1 = getSessionId(wt1);
    const id2 = getSessionId(wt2);
    assert.notEqual(id1, id2, "non-git fallback produces unique IDs across tempdirs");
    assert.equal(id1.length, 12);
  } finally {
    rmSync(wt1, { recursive: true, force: true });
    rmSync(wt2, { recursive: true, force: true });
  }
});

test("marker file is scoped per session: 2 sessions don't share state", async () => {
  const root = mkdtempSync(join(tmpdir(), "marker-isolation-test-"));
  try {
    const { readLastOperatorMessage } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/core/inbound-state.js")
    );
    mkdirSync(join(root, ".claude", "coordination"), { recursive: true });

    // Write a marker for session A
    const sessionA = "session-AAAA";
    const sessionAPath = join(root, ".claude", "coordination", `.last-operator-message-${sessionA}`);
    writeFileSync(sessionAPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      prompt_snippet: "session-A state-change",
    }));

    // Reading with sessionB id should not find it
    const wrongRead = await readLastOperatorMessage(root, ".claude", "session-BBBB");
    assert.equal(wrongRead, null, "wrong-session read returns null (isolation)");

    // Reading with sessionA id should find it
    const correctRead = await readLastOperatorMessage(root, ".claude", sessionA);
    assert.ok(correctRead);
    assert.equal(correctRead.prompt_snippet, "session-A state-change");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy un-suffixed marker file is still readable (backward compat)", async () => {
  const root = mkdtempSync(join(tmpdir(), "marker-legacy-test-"));
  try {
    const { readLastOperatorMessage } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/core/inbound-state.js")
    );
    mkdirSync(join(root, ".claude", "coordination"), { recursive: true });

    // Pre-Phase-5 marker (un-suffixed) — must still be readable for migration.
    const legacyPath = join(root, ".claude", "coordination", ".last-operator-message");
    writeFileSync(legacyPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      prompt_snippet: "legacy-marker",
    }));

    const read = await readLastOperatorMessage(root, ".claude", "any-session-id");
    assert.ok(read, "legacy un-suffixed marker is still readable");
    assert.equal(read.prompt_snippet, "legacy-marker");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});