import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";

test("no core/legacy references in source tree", () => {
  // After Phase 2 rename, zero source files should contain the substring
  // 'core/legacy'. Exclusions: this plan dir (audit trail) and historical
  // journals (forensic, not stale).
  const cmd = [
    "grep -r 'core/legacy'",
    "tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ tools/scripts/",
    "--include='*.js' --include='*.cjs' --include='*.mjs' --include='*.md'",
    "2>/dev/null",
    "| grep -v 'plans/260624-2335-phase-e-foundation'",
    "| grep -v 'docs/journals/260624-'",
    "| grep -v '__tests__/phase-e-foundation'",
    "| wc -l",
  ].join(" ");

  const raw = execSync(cmd, { encoding: "utf8" }).trim();
  const count = Number(raw);

  assert.strictEqual(
    count,
    0,
    `Found ${count} core/legacy references; expected 0 after rename`
  );
});
