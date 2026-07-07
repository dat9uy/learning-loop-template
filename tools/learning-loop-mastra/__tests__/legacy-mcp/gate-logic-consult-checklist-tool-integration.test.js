import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { applyPromotedRules } from "../../core/gate-logic.js";
import { metaStateRuleEntrySchema, readRegistry } from "../../core/meta-state.js";
import { buildProcessHints } from "../../core/loop-introspect.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

const RULE_ID = "rule-tool-integration-same-commit-dep";

await test("rule-tool-integration-same-commit-dep loads through schema and is a no-op for applyPromotedRules", () => {
  // The description below is a custom value chosen for clarity in this test;
  // it does NOT match the auto-generated form that meta_state_promote_rule
  // would produce (which uses `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.`).
  // This test exercises the schema independently of the tool, so any string
  // that satisfies metaStateRuleEntrySchema#description is acceptable here.
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
    status: "open",
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
  // PROJECT_ROOT is resolved via import.meta.dirname + 4 levels up so the path
  // is stable across runner cwd variations (namespaced runner sets cwd to
  // tools/learning-loop-mastra/, so a relative ".factory/..." would break).
  const hookSource = readFileSync(join(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs"), "utf8");
  assert.ok(
    hookSource.includes(RULE_ID),
    `LOCAL_PROCESS_HINTS in .factory/hooks/loop-surface-inject.cjs must contain literal substring ${RULE_ID}`,
  );
});

// Phase 3 of plans/260629-2011-fallow-tools-v2-action-swap/: extend the rule
// with a 4th item covering third-party GitHub Action SHA pinning. TDD guard:
// the live registry rule MUST carry the 4th item; PROCESS_HINTS MUST mention
// SHA pinning. If a future contributor reverts either, these tests fail.
await test("registry rule has 4th item covering 3rd-party Action SHA pin", () => {
  const entries = readRegistry(PROJECT_ROOT);
  const rule = entries.find((e) => e.id === RULE_ID);
  assert.ok(rule, `rule ${RULE_ID} must exist in registry`);
  assert.strictEqual(rule.entry_kind, "rule");
  const items = JSON.parse(rule.pattern).items;
  const fourth = items.find((i) => i.id === "third-party-action-sha-pin");
  assert.ok(fourth, "4th item `third-party-action-sha-pin` must be present in the rule pattern");
  assert.match(
    fourth.description,
    /commit SHA/,
    "4th item description must mention `commit SHA` pinning",
  );
  assert.match(
    fourth.description,
    /cryptograph|verif|signed|Ed25519|SHA-256/,
    "4th item description must reference cryptographic verification",
  );
});

await test("PROCESS_HINTS mentions 3rd-party Action SHA pin", () => {
  const hints = buildProcessHints();
  const matched = hints.find(
    (h) => /fallow-rs\/fallow@<commit-sha>/.test(h) || /third-party Action.*SHA/i.test(h) || /SHA.{0,40}pin/i.test(h),
  );
  assert.ok(
    matched,
    "PROCESS_HINTS row must reference SHA pinning for third-party Actions (e.g., `fallow-rs/fallow@<commit-sha>` or 'third-party Action SHA pin')",
  );
});
