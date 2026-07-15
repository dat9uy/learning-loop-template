import assert from "node:assert";
import { join, resolve } from "node:path";
import { test } from "vitest";
import { applyPromotedRules } from "../../core/gate-logic.js";
import { metaStateRuleEntrySchema } from "../../core/meta-state.js";
import { buildProcessHints } from "../../core/loop-introspect.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

const RULE_ID = "rule-fallow-brief-on-gate-failure";

await test("agent-checklist rule schema is valid for rule-fallow-brief-on-gate-failure (1-item checklist)", () => {
  // The description below is a custom value chosen for clarity in this test;
  // it does NOT match the auto-generated form that meta_state_promote_rule
  // would produce (which uses `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.`).
  // This test exercises the schema independently of the tool, so any string
  // that satisfies metaStateRuleEntrySchema#description is acceptable here.
  // Mirrors gate-logic-agent-checklist-tool-integration.test.js:19-37 pattern.
  const rule = metaStateRuleEntrySchema.parse({
    entry_kind: "rule",
    id: RULE_ID,
    origin: "meta-260712T0730Z-fallow-mcp-runtime-needs-format-json",
    enforcement: "agent",
    pattern_type: "agent-checklist",
    pattern: JSON.stringify({
      version: 1,
      items: [
        {
          id: "fallow-gate-failure-routes-to-brief",
          description: "When `pnpm fallow:gate` (or any local `fallow audit --gate new-only` invocation) exits non-zero, run `pnpm fallow:brief` next to get a compact CSV stream (one finding per line with severity/crap/path:line fields) instead of re-parsing the human-readable prose.",
        },
      ],
    }),
    description: "Fallow gate triage: route fallow:gate failures to fallow:brief for compact CSV triage.",
    status: "active",
    promoted_at: "2026-07-14T01:03:18.451Z",
    promoted_by: "operator",
  });

  // Round-trip through applyPromotedRules to confirm the rule shape is consumed
  // (agent-checklist rules return decision: 'ok' — they only surface via
  // PROCESS_HINTS, not via gate enforcement; see gate-logic.js:750-755).
  const result = applyPromotedRules(
    "pnpm fallow:gate",
    null,
    [rule],
    "/tmp/agent-checklist-fallow-brief-test-root",
  );

  assert.deepStrictEqual(result, { decision: "ok" });

  // Belt-and-suspenders: verify the parsed checklist has exactly 1 item with
  // the expected id. Catches drift if a future contributor extends the rule
  // and forgets to update PROCESS_HINTS in lockstep.
  const parsed = JSON.parse(rule.pattern);
  assert.strictEqual(parsed.items.length, 1);
  assert.strictEqual(parsed.items[0].id, "fallow-gate-failure-routes-to-brief");
});

await test("PROCESS_HINTS row #5 contains the literal rule-fallow-brief-on-gate-failure id (H6 ordering-gate drift guard)", () => {
  const processHints = buildProcessHints();
  // H6 ordering gate at loop-describe-tool.js:94-106 uses substring match:
  //   processHints.some((h) => h.includes(rule.id))
  // A future contributor who paraphrases the row ("the fallow brief hint")
  // would silently break the gate. This test catches that drift by reading
  // the source-of-truth file state directly (bypasses the running MCP
  // server's module cache, which loads PROCESS_HINTS once at startup).
  const mentions = processHints.some((row) => row.includes(RULE_ID));
  assert.strictEqual(mentions, true, `PROCESS_HINTS must contain literal substring ${RULE_ID}`);

  // Also verify row count == 9 (4 original + 1 fallow brief + 3 reclassified
  // advisory rule rows from plan 260714-1358-rule-vocabulary-realignment
  // Phase 1, Q3 validation reversal + 1 required-status-check row).
  assert.strictEqual(processHints.length, 10, "PROCESS_HINTS should have exactly 10 rows (9 prior + required-status-check-verify-combined-status appended)");
});
