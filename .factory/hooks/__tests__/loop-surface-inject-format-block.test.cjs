// Phase 1 (plans/260717-1826-unify-context-injection): formatBlock now takes
// (counts, hints, tier) — explicit hint arrays, no hidden mirror reads. The
// factory hook renders hints via direct core import; this test locks the
// deterministic render from a known input.

const assert = require("node:assert");

const hook = require("../loop-surface-inject.cjs");

describe("loop-surface-inject formatBlock", () => {
  test("renders counts header in warm tier", () => {
    const result = hook.formatBlock(
      {
        tool_count: 36,
        record_type_count: 8,
        rule_count: 1,
        active_finding_count: 12,
      },
      { discoverability_hints: [], process_hints: [] },
    );

    assert.ok(result.includes("=== loop surface (auto-injected at session start) ==="));
    assert.ok(result.includes("tools: 36"));
    assert.ok(result.includes("record types: 8"));
    assert.ok(result.includes("active rules: 1"));
    assert.ok(result.includes("active findings: 12"));
    assert.ok(result.includes("Do not invoke ck:use-mcp"));
  });

  test("renders discoverability + process hint sections when tier=warm", () => {
    const result = hook.formatBlock(
      { tool_count: 36, record_type_count: 8, rule_count: 1, active_finding_count: 12 },
      {
        discoverability_hints: [
          "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
          "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true`.",
        ],
        process_hints: [
          "Test discipline (deterministic parse). Iterate via `pnpm test:iter`.",
          "PR-body registry deltas. Every PR that touches `meta-state.jsonl` must enumerate its deltas.",
        ],
      },
      "warm",
    );

    assert.ok(result.includes("--- discoverability_hints ---"));
    assert.ok(result.includes("To cite a thing, point at the code"));
    assert.ok(result.includes("When you pass `evidence_code_ref`"));
    assert.ok(result.includes("--- process_hints ---"));
    assert.ok(result.includes("Test discipline (deterministic parse)"));
    assert.ok(result.includes("PR-body registry deltas"));
  });

  test("suppresses hint sections when tier=summary", () => {
    const result = hook.formatBlock(
      { tool_count: 36, record_type_count: 8, rule_count: 1, active_finding_count: 12 },
      {
        discoverability_hints: ["SHOULD-NOT-APPEAR-disc-hint"],
        process_hints: ["SHOULD-NOT-APPEAR-proc-hint"],
      },
      "summary",
    );

    assert.ok(result.includes("tools: 36"));
    assert.ok(!result.includes("--- discoverability_hints ---"), "summary tier must omit hints section");
    assert.ok(!result.includes("--- process_hints ---"), "summary tier must omit process hints section");
    assert.ok(!result.includes("SHOULD-NOT-APPEAR"));
  });
});
