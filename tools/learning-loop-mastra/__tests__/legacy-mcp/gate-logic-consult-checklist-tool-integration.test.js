import assert from "node:assert";
import { resolve } from "node:path";
import { test } from "vitest";
import { applyPromotedRules } from "../../core/gate-logic.js";
import { metaStateRuleEntrySchema, readRegistry } from "../../core/meta-state.js";

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
    pattern_type: "agent-checklist",
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
    "/tmp/agent-checklist-tool-integration-test-root",
  );

  assert.deepStrictEqual(result, { decision: "ok" });
});

await test("rule entry carries hint_text mentioning SHA pin (Phase 3 invariant)", () => {
  // Phase 3 (plans/260717-1826-unify-context-injection): the rule-derived
  // process hint prose lives on the rule entry as `hint_text`. The legacy
  // PROCESS_HINTS-substring check is replaced by this invariant: the rule
  // entry's hint_text MUST reference SHA pinning (the 4th checklist item).
  const entries = readRegistry(PROJECT_ROOT);
  const rule = entries.find((e) => e.id === RULE_ID);
  assert.ok(rule, `rule ${RULE_ID} must exist in registry`);
  assert.strictEqual(rule.entry_kind, "rule");
  assert.ok(typeof rule.hint_text === "string" && rule.hint_text.length >= 20,
    `rule ${RULE_ID} must carry hint_text (>=20 chars); Phase 3 invariant`);
  assert.match(
    rule.hint_text,
    /commit SHA/,
    `rule ${RULE_ID} hint_text must mention "commit SHA" pinning`,
  );
  assert.match(
    rule.hint_text,
    /third-party Action SHA pin/i,
    `rule ${RULE_ID} hint_text must mention 3rd-party Action SHA pin`,
  );
});

await test("factory hook renders the rule id verbatim (Phase 1 single-source guard)", () => {
  // plans/260717-1826-unify-context-injection Phase 1: the factory hook no
  // longer carries a LOCAL_PROCESS_HINTS mirror — it imports the canonical
  // builders from core/loop-introspect.js. The drift-prevention guard here
  // therefore moves down to "the canonical builder must carry the rule id"
  // (already asserted by the prior PROCESS_HINTS test) AND the factory hook
  // source must not contain the rule id literal (otherwise a stale mirror
  // would silently drift). The hook renders the canonical text by reference,
  // so this is a stronger invariant than the old parity check.
  const { readFileSync } = require("node:fs");
  const hookSource = readFileSync(require("node:path").join(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs"), "utf8");
  assert.ok(
    !hookSource.includes("LOCAL_PROCESS_HINTS"),
    "factory hook must not carry a LOCAL_PROCESS_HINTS mirror (Phase 1 invariant)",
  );
  assert.ok(
    !hookSource.includes(RULE_ID),
    `factory hook must not embed the rule id literal ${RULE_ID} (single-source renders it from core)`,
  );
});

// Phase 3 of plans/260629-2011-fallow-tools-v2-action-swap/: extend the rule
// with a 4th item covering third-party GitHub Action SHA pinning. TDD guard:
// the live registry rule MUST carry the 4th item AND the hint_text (Phase 3
// invariant) must mention SHA pinning. If a future contributor reverts either,
// these tests fail.
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

await test("rule hint_text mentions 3rd-party Action SHA pin (Phase 3 invariant)", () => {
  const entries = readRegistry(PROJECT_ROOT);
  const rule = entries.find((e) => e.id === RULE_ID);
  assert.ok(rule, `rule ${RULE_ID} must exist in registry`);
  assert.match(
    rule.hint_text,
    /fallow-rs\/fallow@<commit-sha>|third-party Action SHA pin|SHA.{0,40}pin/i,
    "rule hint_text must reference SHA pinning for third-party Actions",
  );
});
