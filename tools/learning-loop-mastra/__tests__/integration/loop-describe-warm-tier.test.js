import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";
import { buildDiscoverabilityHints, buildProcessHints } from "../../core/loop-introspect.js";

describe("loop_describe warm tier discoverability_hints", () => {
  test("warm tier returns discoverability_hints with exactly the 4 startup hints", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.discoverability_hints));
    assert.strictEqual(parsed.discoverability_hints.length, 4,
      "warm auto-injects only the startup-tier hints; on-demand rows ride hint_index");
    for (const hint of parsed.discoverability_hints) {
      assert.strictEqual(typeof hint, "string");
      assert.ok(hint.length > 0);
    }
  });

  test("warm tier returns process_hints as an empty array (standalone rows on-demand)", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.process_hints), "process_hints must be array");
    // Both standalone process rows moved on-demand, and the warm payload's
    // projected rules map carries no hint_text, so rule-derived rows render
    // via the session-start hooks, not this payload — warm process_hints is
    // empty. The rows stay discoverable via hint_index + loop_get_instruction.
    assert.strictEqual(parsed.process_hints.length, 0, "warm process_hints must be empty");
  });

  test("warm discoverability_hints carry the 4 startup hints; on-demand hints resolve via loop_get_instruction", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    // Warm injection = the 4 startup hints, in registry order.
    const [toolSelection, layerSplit, onDemandLookup, phaseAHint] = parsed.discoverability_hints;

    assert.ok(toolSelection.includes("canonical MCP tool"));
    assert.ok(toolSelection.includes("4-question framework"));

    assert.ok(layerSplit.includes("priority-1 prompt"));
    assert.ok(layerSplit.includes("AGENTS.md"));

    assert.ok(onDemandLookup.includes("loop_get_instruction"));
    assert.ok(onDemandLookup.includes("hint_index"));

    assert.ok(phaseAHint.includes("meta-surface"));
    assert.ok(phaseAHint.includes("4-kind"));

    // The 13 on-demand hints are NOT auto-injected; their full text is fetched
    // per-slug via loop_get_instruction. Assert the same documented substrings
    // through the on-demand path.
    const { loopGetInstructionTool } = await import("../../tools/handlers/loop-get-instruction-tool.js");
    const fetchHint = async (slug) => {
      const res = await loopGetInstructionTool.handler({ key: slug });
      const r = JSON.parse(res.content[0].text).results[0];
      assert.strictEqual(r.error, undefined, `${slug} must resolve via loop_get_instruction`);
      return r.hint;
    };

    const citation = await fetchHint("internalization-rule");
    assert.ok(citation.includes("meta_state_report"));
    assert.ok(citation.includes("evidence_code_ref"));

    const autoDefault = await fetchHint("mechanism-check");
    assert.ok(autoDefault.includes("evidence_code_ref"));
    assert.ok(autoDefault.includes("mechanism_check"));

    const sourceRef = await fetchHint("source-refs");
    assert.ok(sourceRef.includes("local:meta-state:<id>"));

    const grounding = await fetchHint("derive-refresh");
    assert.ok(grounding.includes("meta_state_derive_status"));
    assert.ok(grounding.includes("meta_state_refresh_file_index"));

    const noCode = await fetchHint("designs-no-code");
    assert.ok(noCode.includes("meta_state_log_change"));
    assert.ok(noCode.includes("change_target"));

    const statusLifecycle = await fetchHint("status-lifecycle");
    assert.ok(statusLifecycle.includes("reported"));
    assert.ok(statusLifecycle.includes("active"));
    assert.ok(statusLifecycle.includes("resolved"));
    assert.ok(statusLifecycle.includes("superseded"));
    // The legacy 'expired' status was removed; the hint no longer enumerates
    // 'expired'. `superseded` is still mentioned (collapsed into `resolved` +
    // a citation row) so the hint documents the migration.

    const reopensHint = await fetchHint("reopens");
    assert.ok(reopensHint.includes("reopens"));
    // The `reopens` writer was dropped; the hint now documents explicit
    // `meta_state_resolve` (no cascade) instead of the legacy cascade-resolve.
    assert.ok(reopensHint.includes("meta_state_resolve"));
    assert.ok(reopensHint.includes("no cascade"));

    const ruleLifecycle = await fetchHint("rule-lifecycle");
    assert.ok(ruleLifecycle.includes("meta_state_list"));
    assert.ok(ruleLifecycle.includes("loop_describe"));
    assert.ok(ruleLifecycle.includes("loop_designs"));

    const relationshipScript = await fetchHint("reopens-script");
    assert.ok(relationshipScript.includes("relationship_validate"));
    assert.ok(relationshipScript.includes("meta_state_report"));
    // The canonical 'X is related to Y' script: lint -> report -> resolve
    // the orphan parent explicitly (no cascade — the `reopens` writer +
    // `cascade_from` arg were dropped).
    assert.ok(relationshipScript.includes("meta_state_resolve"));
    assert.ok(relationshipScript.includes("no cascade"));

    const narrowQuery = await fetchHint("narrow-query");
    assert.ok(narrowQuery.includes("meta_state_list"));
    assert.ok(narrowQuery.includes("id:"));
    assert.ok(narrowQuery.includes("ref_by"));

    const sessionIdHint = await fetchHint("session-id-query");
    assert.ok(sessionIdHint.includes("session_id"));
    assert.ok(sessionIdHint.includes("meta_state_list"));
    assert.ok(sessionIdHint.includes("compact"));

    const runtimeAgnosticHint = await fetchHint("runtime-agnostic-features");
    assert.ok(runtimeAgnosticHint.includes("runtime-agnostic"));
    assert.ok(runtimeAgnosticHint.includes("check_runtime_agnostic"));
    assert.ok(runtimeAgnosticHint.includes("runtime-agnostic.test.js"));
  });

  test("process hint pnpm-test-discipline is on-demand: absent from warm, resolves via loop_get_instruction", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    // Both standalone process rows moved on-demand; warm process_hints carries
    // only rule-derived rows (injected while their rule is active).
    assert.ok(
      !parsed.process_hints.some((h) => h.includes("pnpm test:iter")),
      "warm process_hints must exclude the on-demand pnpm-test-discipline row",
    );
    const { loopGetInstructionTool } = await import("../../tools/handlers/loop-get-instruction-tool.js");
    const res = await loopGetInstructionTool.handler({ key: "pnpm-test-discipline" });
    const pnpmTestDiscipline = JSON.parse(res.content[0].text).results[0].hint;
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
    // Cold is the full-history tier: the tier filter is warm-only, so the
    // appended on-demand row appears here too (all 17 registry rows).
    assert.strictEqual(parsed.discoverability_hints.length, 17);
    assert.ok(Array.isArray(parsed.process_hints));
    assert.ok(parsed.process_hints.length >= 1);
  });

  test("warm tier filters on-demand hints out of discoverability_hints but indexes them", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    // The on-demand row's full text is NOT auto-injected at warm...
    assert.ok(
      !parsed.discoverability_hints.some((h) => h.includes("gate-verb:<verb>")),
      "warm discoverability_hints must exclude the on-demand gate-verb-allowance text",
    );
    // ...but it stays discoverable via the hint_index (slug + suggestion).
    assert.ok(Array.isArray(parsed.hint_index), "warm tier must carry hint_index");
    const entry = parsed.hint_index.find((e) => e.slug === "gate-verb-allowance");
    assert.ok(entry, "hint_index must include gate-verb-allowance");
    assert.ok(typeof entry.suggestion === "string" && entry.suggestion.length > 20);
    // The index is the complete discovery surface: all registry slugs +
    // rule-derived process slugs.
    const slugs = parsed.hint_index.map((e) => e.slug);
    assert.strictEqual(new Set(slugs).size, slugs.length, "no duplicate slugs");
    for (const slug of ["internalization-rule", "pnpm-test-discipline", "file-edit-drift-and-fingerprints"]) {
      assert.ok(slugs.includes(slug), `hint_index must include ${slug}`);
    }
    // All 19 registry rows (both tiers, both kinds) are indexed.
    const { listHints } = await import("../../core/hint-registry.js");
    for (const e of listHints()) {
      assert.ok(slugs.includes(e.slug), `hint_index must include registry slug ${e.slug}`);
    }
  });

  test("cold tier carries no hint_index (warm-only discovery surface)", async () => {
    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.hint_index, undefined, "cold tier is unfiltered full history; no index");
  });

  test("hint-renderer stays unfiltered: provenance covers all 17 discoverability rows", async () => {
    // The renderer is inspection tooling — operators preview every hint,
    // on-demand rows included. It must never apply the warm tier filter.
    const renderer = await import("../../core/hint-renderer.js");
    const { listHints } = await import("../../core/hint-registry.js");
    const { partitions } = renderer.renderHints({ channel: "mcp-warm", charBudget: 999999 });
    const arr = JSON.parse(partitions[0]);
    const discCount = listHints({ kind: "discoverability" }).length;
    assert.strictEqual(discCount, 17, "registry holds 17 discoverability rows");
    assert.ok(
      arr.some((h) => (h.text ?? "").includes("gate-verb:<verb>") || (h.slug === "gate-verb-allowance")),
      "renderer output must include the on-demand row",
    );
  });

  test("buildDiscoverabilityHints returns 17 frozen entries when unfiltered, 4 at startup tier", () => {
    const all = buildDiscoverabilityHints();
    assert.strictEqual(all.length, 17);
    assert.ok(Object.isFrozen(all));
    const startup = buildDiscoverabilityHints({ tier: "startup" });
    assert.strictEqual(startup.length, 4, "startup-tier view = the 4 keepers only");
    assert.ok(!startup.some((h) => h.includes("gate-verb:<verb>")));
  });

  test("buildProcessHints returns ≥1 entry (rule-derived projection)", () => {
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
