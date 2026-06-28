import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { applyPromotedRules } from "../../core/gate-logic.js";
import { metaStateRuleEntrySchema } from "../../core/meta-state.js";
import { buildProcessHints } from "../../core/loop-introspect.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

const RULE_ID = "rule-tool-integration-same-commit-dep";

await test("rule-tool-integration-same-commit-dep loads through schema and is a no-op for applyPromotedRules", () => {
  const rule = metaStateRuleEntrySchema.parse({
    entry_kind: "rule",
    id: RULE_ID,
    origin: "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but",
    enforcement: "agent",
    pattern_type: "consult-checklist",
    pattern: JSON.stringify({
      version: 1,
      items: [
        { id: "same-commit-dependency", description: "When a workflow adds pnpm exec <tool>, npx <tool>, or npm run <script>, the tool MUST be in devDependencies (or dependencies) in the SAME commit. Verify with `grep '<tool>' package.json` after any .github/workflows/*.yml edit. Symptom of skip: CI's `pnpm install --frozen-lockfile` fails with `command not found` on the first PR." },
        { id: "baseline-flag-format", description: "When wiring `fallow audit` in CI, generate baselines with `fallow <sub> --save-baseline <path>` (audit format: array of `path:export` strings). NEVER `--save-regression-baseline` (regression format: nested objects). The two flags produce INCOMPATIBLE JSON; the audit --*-baseline flag fails to parse the regression format." },
        { id: "baseline-storage", description: "`fallow` auto-creates `<root>/.fallow/.gitignore: *` that silently gitignores `<root>/.fallow/baselines/`. Verify `git ls-files <root>/.fallow/baselines/` returns expected files BEFORE committing. Prefer `plans/<plan-slug>/reports/fallow/` (which inherits plan gitignore); if you must keep at `<root>/.fallow/baselines/`, add `!.fallow/baselines/` exception to root `.gitignore`." },
      ],
    }),
    description: "Tool integration hygiene: same-commit dependency, baseline flag format, and baseline storage.",
    status: "active",
    promoted_at: "2026-06-28T07:42:50.719Z",
    promoted_by: "operator",
  });

  const result = applyPromotedRules(
    "pnpm exec fallow audit --gate new-only",
    null,
    [rule],
    "/tmp/consult-checklist-tool-integration-test-root",
  );

  assert.deepStrictEqual(result, { decision: "ok" });
});

await test("PROCESS_HINTS has a row containing the literal rule-tool-integration-same-commit-dep id (R-HIGH-7 drift guard)", () => {
  const processHints = buildProcessHints();
  // H6 ordering gate at loop-describe-tool.js:90-102 uses substring match:
  //   processHints.some((h) => h.includes(rule.id))
  // A future contributor who paraphrases the row ("the tool-integration checklist")
  // would silently break the gate. This test catches that drift.
  const mentions = processHints.some((row) => row.includes(RULE_ID));
  assert.strictEqual(mentions, true, `PROCESS_HINTS must contain literal substring ${RULE_ID}`);
});

await test("hook mirror LOCAL_PROCESS_HINTS contains the same rule id (cold-session parity guard)", () => {
  // cold-session-discoverability.test.cjs:366-386 enforces strictEqual, but that
  // test runs in isolation. This test asserts the literal id is present in the
  // hook mirror array, giving a faster signal if the mirror is forgotten.
  // cwd is tools/learning-loop-mastra/ when running via namespaced test runner;
  // .factory/ lives at the project root. Use __dirname-relative path for portability.
  const hookSource = readFileSync(join(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs"), "utf8");
  assert.ok(
    hookSource.includes(RULE_ID),
    `LOCAL_PROCESS_HINTS in .factory/hooks/loop-surface-inject.cjs must contain literal substring ${RULE_ID}`,
  );
});
