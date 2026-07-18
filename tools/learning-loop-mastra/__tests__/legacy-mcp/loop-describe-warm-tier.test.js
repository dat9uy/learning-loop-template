import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";
import { buildDiscoverabilityHints, buildProcessHints } from "../../core/loop-introspect.js";

describe("loop_describe warm tier discoverability_hints", () => {
  test("warm tier returns discoverability_hints with 16 strings", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.discoverability_hints));
    assert.strictEqual(parsed.discoverability_hints.length, 16);
    for (const hint of parsed.discoverability_hints) {
      assert.strictEqual(typeof hint, "string");
      assert.ok(hint.length > 0);
    }
  });

  test("warm tier returns process_hints with ≥1 string", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.process_hints), "process_hints must be array");
    assert.ok(parsed.process_hints.length >= 1, "process_hints must have ≥1 entry");
    for (const hint of parsed.process_hints) {
      assert.strictEqual(typeof hint, "string");
      assert.ok(hint.length > 0);
    }
  });

  test("each discoverability hint contains the documented substrings", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    const [citation, autoDefault, sourceRef, grounding, noCode, statusLifecycle, reopensHint, ruleLifecycle, toolSelection, layerSplit, relationshipScript, onDemandLookup, narrowQuery, phaseAHint, sessionIdHint, runtimeAgnosticHint] = parsed.discoverability_hints;

    assert.ok(citation.includes("meta_state_report"));
    assert.ok(citation.includes("evidence_code_ref"));

    assert.ok(autoDefault.includes("evidence_code_ref"));
    assert.ok(autoDefault.includes("mechanism_check"));

    assert.ok(sourceRef.includes("local:meta-state:<id>"));

    assert.ok(grounding.includes("meta_state_derive_status"));
    assert.ok(grounding.includes("meta_state_refresh_file_index"));

    assert.ok(noCode.includes("meta_state_log_change"));
    assert.ok(noCode.includes("change_target"));

    assert.ok(statusLifecycle.includes("reported"));
    assert.ok(statusLifecycle.includes("active"));
    assert.ok(statusLifecycle.includes("resolved"));
    assert.ok(statusLifecycle.includes("superseded"));
    // Plan 260611-1000 phase 4 removes "expired" from the statusLifecycle
    // hint (the legacy 'expired' status was removed). The string still
    // mentions 6 statuses but no longer enumerates 'expired'.

    assert.ok(reopensHint.includes("reopens"));
    assert.ok(reopensHint.includes("cascade-resolve"));

    assert.ok(ruleLifecycle.includes("meta_state_list"));
    assert.ok(ruleLifecycle.includes("loop_describe"));
    assert.ok(ruleLifecycle.includes("loop_designs"));

    assert.ok(toolSelection.includes("canonical MCP tool"));
    assert.ok(toolSelection.includes("4-question framework"));

    assert.ok(layerSplit.includes("priority-1 prompt"));
    assert.ok(layerSplit.includes("AGENTS.md"));

    assert.ok(relationshipScript.includes("relationship_validate"));
    assert.ok(relationshipScript.includes("meta_state_report"));
    // Plan 260611-1000-remove-expired-status retargeted the cascade to a
    // 1-step path. The legacy 2-step 'migrate then resolve' script was
    // removed; the canonical script is now lint -> report -> resolve.
    assert.ok(relationshipScript.includes("meta_state_resolve"));
    assert.ok(relationshipScript.includes("1 step"));

    assert.ok(onDemandLookup.includes("loop_get_instruction"));
    assert.ok(onDemandLookup.includes("product/**"));
    assert.ok(onDemandLookup.includes("meta-state.jsonl"));

    assert.ok(narrowQuery.includes("meta_state_list"));
    assert.ok(narrowQuery.includes("id:"));
    assert.ok(narrowQuery.includes("ref_by"));

    assert.ok(sessionIdHint.includes("session_id"));
    assert.ok(sessionIdHint.includes("meta_state_list"));
    assert.ok(sessionIdHint.includes("compact"));

    assert.ok(runtimeAgnosticHint.includes("runtime-agnostic"));
    assert.ok(runtimeAgnosticHint.includes("check_runtime_agnostic"));
    assert.ok(runtimeAgnosticHint.includes("runtime-agnostic.test.js"));
  });

  test("process hint pnpm-test-discipline contains documented substrings", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    const pnpmTestDiscipline = parsed.process_hints[0];
    // parse-once-via-script + do-not-hand-parse clause + retained same-file-read rule.
    assert.ok(pnpmTestDiscipline.includes("pnpm test"));
    assert.ok(pnpmTestDiscipline.includes(".test-logs/"));
    assert.ok(pnpmTestDiscipline.includes("vitest-failures.sh"));
    assert.ok(pnpmTestDiscipline.includes("Do NOT"));
    assert.ok(pnpmTestDiscipline.includes("same-file-read"));
  });

  test("summary tier does NOT include discoverability_hints or process_hints", async () => {
    const result = await loopDescribeTool.handler({ tier: "summary" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.discoverability_hints, undefined);
    assert.strictEqual(parsed.process_hints, undefined);
  });

  test("cold tier includes both discoverability_hints and process_hints", async () => {
    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.discoverability_hints));
    assert.strictEqual(parsed.discoverability_hints.length, 16);
    assert.ok(Array.isArray(parsed.process_hints));
    assert.ok(parsed.process_hints.length >= 1);
  });

  test("buildDiscoverabilityHints returns 16 frozen entries", () => {
    const hints = buildDiscoverabilityHints();
    assert.strictEqual(hints.length, 16);
    assert.ok(Object.isFrozen(hints));
  });

  test("buildProcessHints returns ≥1 entry (Phase 3: rule-derived projection)", () => {
    // Phase 3 (plans/260717-1826-unify-context-injection): buildProcessHints
    // is no longer a frozen const-returning function. It now reads the
    // registry, resolves rule-derived entries from rule.hint_text, and
    // returns a non-frozen array (callers should not mutate). The test
    // asserts the array contains entries (post-backfill: 8 rule-derived
    // + 2 standalone = 10).
    const hints = buildProcessHints();
    assert.ok(hints.length >= 1);
  });

  test("loop_get_instruction resolves pnpm-test-discipline from PROCESS_HINTS", async () => {
    const { loopGetInstructionTool } = await import("../../tools/handlers/loop-get-instruction-tool.js");
    const result = await loopGetInstructionTool.handler({ key: "pnpm-test-discipline" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.results.length, 1);
    assert.ok(parsed.results[0].hint.includes("pnpm test"), "must resolve the process hint");
    assert.strictEqual(parsed.results[0].source, "process");
    assert.strictEqual(parsed.results[0].error, undefined);
  });

  // Compact-index contract (warm is an index, not a full dump). Full prose
  // lives behind per-id lookups; warm must NOT carry per-entry descriptions or
  // rule patterns, and must surface a lookup_hint pointing at those lookups.
  test("warm tier is a compact index: no per-entry descriptions/patterns, lookup_hint present", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);

    // findings + anti-patterns: id + classifier only, no description.
    for (const f of parsed.active_findings) {
      assert.ok(typeof f.id === "string" && f.id.length > 0, "finding must carry id");
      assert.ok(typeof f.category === "string", "finding must carry category");
      assert.strictEqual(f.description, undefined, "warm finding must NOT carry full description");
    }
    for (const a of parsed.anti_patterns) {
      assert.ok(typeof a.id === "string" && a.id.length > 0, "anti-pattern must carry id");
      assert.strictEqual(a.description, undefined, "warm anti-pattern must NOT carry full description");
    }
    // rules: id + pattern_type only, no raw pattern.
    for (const r of parsed.rules) {
      assert.ok(r.rule_id && r.pattern_type, "rule must carry rule_id/pattern_type");
      assert.strictEqual(r.pattern, undefined, "warm rule must NOT carry full pattern");
    }
    // tools: name + a short one-line description (≤ 130 chars — one sentence, capped).
    for (const t of parsed.tools) {
      assert.ok(typeof t.name === "string" && t.name.length > 0, "tool must carry a name");
      assert.ok(typeof t.description === "string", "tool must carry a one-line description");
      assert.ok(t.description.length <= 130, `tool one-liner must be compact (≤130 chars); "${t.name}" was ${t.description.length}`);
    }
    // lookup_hint points the agent at the per-id lookups.
    assert.ok(typeof parsed.lookup_hint === "string" && parsed.lookup_hint.length > 0, "must carry lookup_hint");
    assert.ok(parsed.lookup_hint.includes("meta_state_list"), "lookup_hint must point at meta_state_list for detail");
  });
});
