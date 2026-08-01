/**
 * Regression test for the commit-msg hook (rule-no-plan-ids-in-stable-code-
 * artifacts). The file-scan test covers code artifacts; this test covers the
 * commit-message boundary the file-scan test explicitly excluded.
 *
 * Two layers:
 *   - findLineageMatches over commit-message-shaped input (multi-line,
 *     durable-id masking, the offending forms a commit subject/body can carry)
 *   - the hook script itself, spawned with a candidate message file, asserting
 *     exit 1 on lineage and exit 0 on clean messages — including that git's
 *     `# …` cleanup-comment block never trips the gate
 */
import { test, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findLineageMatches } from "../core/stable-artifacts-lineage.js";

const HOOK = fileURLToPath(new URL("../hooks/commit-msg-stable-artifacts.js", import.meta.url));

function runHook(message) {
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-"));
  const msgFile = join(dir, "COMMIT_EDITMSG");
  writeFileSync(msgFile, message, "utf8");
  try {
    return spawnSync(process.execPath, [HOOK, msgFile], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("commit-msg matcher: rejects lineage in commit subject and body", () => {
  const bad = [
    "chore(stable-artifacts): phase 3 finalize",
    "refactor(stable-artifacts): final Phase 2 batch",
    "docs(plan): reframe Phase 4 warn-only",
    "feat: see plans/260717-1826-unify-context-injection for the design",
    "fix: Plan 4 of the rollout removed the marker",
  ];
  for (const subject of bad) {
    const hits = findLineageMatches(subject);
    expect(hits.length, subject).toBeGreaterThan(0);
  }

  // A multi-line message: the subject is clean but the body carries lineage.
  const mixed = "feat: add the commit-msg lineage gate\n\nThis closes the gap from\nPhase 3 of plans/260721-2300-loop-skill-layer.\n";
  const mixedHits = findLineageMatches(mixed);
  expect(mixedHits.length).toBe(1);
  expect(mixedHits[0].line).toBe(4);
});

test("commit-msg matcher: accepts clean messages and durable registry ids", () => {
  const good = [
    "chore(meta-state): record commit-message lineage enforcement-gap finding",
    "test(stable-artifacts): sweep lineage out of test names",
    "feat: add the commit-msg lineage gate\n\nResolve meta-260721T2300Z-agent-runtime-embeds-plan-ids by reusing the\nshared matcher; the rule-no-plan-ids-in-stable-code-artifacts hook now\nalso guards commit messages.\n",
    "Merge pull request #103 from dat9uy/plan-260801-stable-artifacts-sweep",
  ];
  for (const message of good) {
    expect(findLineageMatches(message).length, message).toBe(0);
  }
});

test("commit-msg hook: exits 1 on a lineage-bearing message and reports the line", () => {
  const res = runHook("chore(stable-artifacts): phase 3 finalize\n");
  expect(res.status).toBe(1);
  expect(res.stdout).toBe("");
  expect(res.stderr).toContain("plan-ID / phase-number / finding-code lineage");
  expect(res.stderr).toContain("phase 3 finalize");
});

test("commit-msg hook: exits 0 on a clean message", () => {
  const res = runHook("feat: add the commit-msg lineage gate\n");
  expect(res.status).toBe(0);
});

test("commit-msg hook: git's `#` cleanup-comment block does not trip the gate", () => {
  // git seeds COMMIT_EDITMSG with a commented hint block before the authored
  // message; a phase mention inside that block must not be rejected.
  const message = [
    "feat: add the commit-msg lineage gate",
    "",
    "# Please enter the commit message for your changes.",
    "# Lines starting with '#' will be ignored, and an empty message aborts the commit.",
    "# On branch main",
    "# Phase 3 of plans/260717-1826 was the prior approach",
    "feat: add the commit-msg lineage gate",
  ].join("\n");
  const res = runHook(message);
  expect(res.status).toBe(0);
});

test("commit-msg hook: exits 2 when the message file path is missing", () => {
  const res = spawnSync(process.execPath, [HOOK], { encoding: "utf8" });
  expect(res.status).toBe(2);
  expect(res.stderr).toContain("missing commit message file path");
});