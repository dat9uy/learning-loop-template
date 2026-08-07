#!/usr/bin/env node
/**
 * commit-msg hook — `rule-no-plan-ids-in-stable-code-artifacts`.
 *
 * Thin I/O adapter: reads the candidate commit message file git passes as
 * $1, runs the shared lineage matcher, and rejects the commit if any line
 * carries plan-ID / phase-number / finding-code lineage. The matcher and
 * durable-id masking live in core/stable-artifacts-lineage.js so this hook and
 * the file-scan regression test cannot drift apart.
 *
 * Wired via package.json > simple-git-hooks > commit-msg:
 *   "node tools/learning-loop-mastra/hooks/commit-msg-stable-artifacts.js $1"
 *
 * The hook is a local gate; hook-bypass flags are denied by the promoted
 * `rule-no-verify-bypass-denied` bash-gate rule. For an intentional operator
 * exception, use the audited `gate_override` tool rather than bypassing hooks.
 * It closes the enforcement gap surfaced by finding
 * meta-260801T1943Z-rule-rule-no-plan-ids-in-stable-code-artifacts-agent-checkli
 * (the file-scan test never scanned commit messages). Re-run `npx
 * simple-git-hooks` after changing the simple-git-hooks config to install it.
 */

import { readFileSync } from "node:fs";
import { findLineageMatches } from "../core/stable-artifacts-lineage.js";

const msgPath = process.argv[2];

if (!msgPath) {
  console.error("commit-msg-stable-artifacts: missing commit message file path (expected $1)");
  process.exit(2);
}

let message;
try {
  message = readFileSync(msgPath, "utf8");
} catch (err) {
  // If the message file is unreadable, fail closed — but exit 2 (usage) so the
  // operator sees a config error rather than a silent pass.
  console.error(`commit-msg-stable-artifacts: cannot read ${msgPath}: ${err.message}`);
  process.exit(2);
}

// Skip cleanup-lines git emits for its own bookkeeping (e.g. a leading
// "# Please enter the commit message..." comment block). Only the message
// the operator authored is in scope for the lineage ban; commented hints are
// stripped before matching so a hint line cannot trip the gate.
const authored = message
  .split("\n")
  .filter((line) => !line.startsWith("#"))
  .join("\n");

const hits = findLineageMatches(authored);

if (hits.length) {
  const detail = hits
    .map((h) => `  line ${h.line}: ${h.content.trim()}\n    matched: ${h.patterns.join(", ")}`)
    .join("\n");
  console.error(
    `commit-msg: rejected — plan-ID / phase-number / finding-code lineage is banned in commit messages\n` +
      `by rule-no-plan-ids-in-stable-code-artifacts. Describe the change directly; keep plan lineage in plan docs and git history.\n` +
      `Offending line(s):\n${detail}\n` +
      `Use gate_override for an intentional operator exception.`,
  );
  process.exit(1);
}

process.exit(0);