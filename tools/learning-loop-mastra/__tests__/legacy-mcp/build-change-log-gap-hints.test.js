/**
 * TDD tests for buildChangeLogGapHints — the pure (b) detection builder
 * for Rec 12 closed-loop (Plan 4: rec12-closed-loop, phase 3).
 *
 * Mirrors the build-stale-dispatch-hints.test.js fixture style: pure fn,
 * no I/O, caller-supplied `touchedPaths` Set (the dispatchIds convention).
 * Joins touched bound-artifact paths (phase 2) against change-log
 * coverage (phase 1's canonicalizer) and returns the gap set.
 */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { buildChangeLogGapHints } from "../../core/loop-introspect.js";

/**
 * Build a change-log fixture entry. The build only inspects
 * `entry_kind`, `change_target`, and `applies_to.schemas` — all other
 * fields are decoration.
 */
function makeChangeLog(opts) {
  return {
    id: opts.id ?? `meta-cl-${Math.random().toString(36).slice(2, 10)}`,
    entry_kind: "change-log",
    created_at: opts.created_at ?? "2026-07-08T00:00:00.000Z",
    change_target: opts.change_target ?? "",
    ...(opts.applies_to ? { applies_to: opts.applies_to } : {}),
    status: "active",
  };
}

describe("buildChangeLogGapHints — Rec 12 closed-loop (b)", () => {
  test("empty registry + empty touched → empty candidates + protocol prompt", () => {
    const result = buildChangeLogGapHints([]);
    assert.deepStrictEqual(result.gap_candidates, []);
    assert.ok(typeof result.gap_protocol_prompt === "string");
    assert.ok(result.gap_protocol_prompt.length > 0);
  });

  test("bound filter: README.md is not bound → not in candidates; bound path is", () => {
    const touched = new Set(["docs/loop-engine.md", "README.md"]);
    const result = buildChangeLogGapHints([], touched);
    assert.deepStrictEqual(result.gap_candidates, ["docs/loop-engine.md"]);
  });

  test("exact-path coverage eliminates the touched bound path", () => {
    const touched = new Set(["docs/loop-engine.md"]);
    const entries = [makeChangeLog({ change_target: "docs/loop-engine.md" })];
    const result = buildChangeLogGapHints(entries, touched);
    assert.deepStrictEqual(result.gap_candidates, []);
  });

  test("directory coverage over-covers all paths under docs/", () => {
    const touched = new Set(["docs/a.md", "docs/b.md"]);
    const entries = [makeChangeLog({ change_target: "docs/" })];
    const result = buildChangeLogGapHints(entries, touched);
    assert.deepStrictEqual(result.gap_candidates, []);
  });

  test("compound change_target with a non-path token: the path tokens cover", () => {
    const touched = new Set(["AGENTS.md", "meta-state.jsonl"]);
    const entries = [
      makeChangeLog({ change_target: "AGENTS.md + meta-state.jsonl + core/x.js" }),
    ];
    const result = buildChangeLogGapHints(entries, touched);
    assert.deepStrictEqual(result.gap_candidates, []);
  });

  test("applies_to.schemas covers a touched bound path (real C3 registry fixture)", () => {
    const touched = new Set(["docs/loop-engine.md"]);
    const entries = [
      makeChangeLog({
        change_target: "<non-path>",
        applies_to: { schemas: ["docs/loop-engine.md"] },
      }),
    ];
    const result = buildChangeLogGapHints(entries, touched);
    assert.deepStrictEqual(result.gap_candidates, []);
  });

  test("mixed scenario: directory covers docs; others remain gaps", () => {
    const touched = new Set([
      "docs/a.md",
      "tools/learning-loop-mastra/core/y.js",
      "schemas/s.json",
    ]);
    // Only covers docs/ — the other bound paths remain gaps.
    const entries = [makeChangeLog({ change_target: "docs/" })];
    const result = buildChangeLogGapHints(entries, touched);
    // Sort is deterministic, by path string.
    assert.deepStrictEqual(result.gap_candidates, [
      "schemas/s.json",
      "tools/learning-loop-mastra/core/y.js",
    ]);
  });

  test("caps at 5 (deterministic path-string order)", () => {
    const paths = [
      "docs/z.md",
      "docs/a.md",
      "docs/m.md",
      "schemas/3.json",
      "schemas/1.json",
      "schemas/2.json",
      "tools/learning-loop-mastra/core/y.js",
    ];
    const touched = new Set(paths);
    const result = buildChangeLogGapHints([], touched);
    assert.strictEqual(result.gap_candidates.length, 5);
    // localeCompare order: digits/underscores before letters, but here we use plain text.
    assert.deepStrictEqual(result.gap_candidates, [
      "docs/a.md",
      "docs/m.md",
      "docs/z.md",
      "schemas/1.json",
      "schemas/2.json",
    ]);
  });

  test("non-path change_target ignored — touched bound path remains a gap", () => {
    const touched = new Set(["docs/loop-engine.md"]);
    const entries = [makeChangeLog({ change_target: "meta-state-finding-categories" })];
    const result = buildChangeLogGapHints(entries, touched);
    assert.deepStrictEqual(result.gap_candidates, ["docs/loop-engine.md"]);
  });

  test("empty touchedPaths → no gaps", () => {
    const entries = [makeChangeLog({ change_target: "docs/x.md" })];
    const result = buildChangeLogGapHints(entries, new Set());
    assert.deepStrictEqual(result.gap_candidates, []);
  });

  test("empty entries → all bound touched paths are gaps", () => {
    const touched = new Set(["docs/a.md", "schemas/b.json", "README.md"]);
    const result = buildChangeLogGapHints([], touched);
    // README.md is not bound → dropped.
    assert.deepStrictEqual(result.gap_candidates, ["docs/a.md", "schemas/b.json"]);
  });

  test("determinism: two runs over the same fixture produce identical order", () => {
    const touched = new Set([
      "schemas/x.json",
      "docs/a.md",
      "tools/learning-loop-mastra/core/y.js",
    ]);
    const r1 = buildChangeLogGapHints([], touched);
    const r2 = buildChangeLogGapHints([], touched);
    assert.deepStrictEqual(r1.gap_candidates, r2.gap_candidates);
    assert.deepStrictEqual(r1.gap_protocol_prompt, r2.gap_protocol_prompt);
  });

  test("pre-rename mcp entries ARE normalized to mastra and cover real git paths", () => {
    // The real registry has 104 legacy entries under tools/learning-loop-mcp/.
    // The detector must normalize `mcp` → `mastra` so those count as
    // coverage (otherwise every legacy entry's bound paths surface as gaps).
    const touched = new Set([
      "tools/learning-loop-mastra/core/gate-logic.js",
      "docs/loop-engine.md",
    ]);
    const entries = [
      // Pre-rename target string — would not match a git path without normalization.
      makeChangeLog({ change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules" }),
    ];
    const result = buildChangeLogGapHints(entries, touched);
    // gate-logic.js covered after rename + anchor strip; loop-engine.md is uncovered.
    assert.deepStrictEqual(result.gap_candidates, ["docs/loop-engine.md"]);
  });

  test("non-change-log entries are ignored in the coverage join", () => {
    const touched = new Set(["docs/loop-engine.md"]);
    // A finding entry with the same change_target — must NOT cover.
    const entries = [
      {
        entry_kind: "finding",
        created_at: "2026-07-08T00:00:00.000Z",
        status: "open",
        change_target: "docs/loop-engine.md",
      },
    ];
    const result = buildChangeLogGapHints(entries, touched);
    assert.deepStrictEqual(result.gap_candidates, ["docs/loop-engine.md"]);
  });

  test("prompt names the first gap path when one exists (L1)", () => {
    const touched = new Set(["docs/loop-engine.md"]);
    const result = buildChangeLogGapHints([], touched);
    assert.ok(
      result.gap_protocol_prompt.includes("docs/loop-engine.md"),
      `prompt should include the first gap path; got "${result.gap_protocol_prompt}"`,
    );
  });

  test("prompt references meta_state_log_change (the documented backfill tool)", () => {
    const result = buildChangeLogGapHints([]);
    assert.ok(result.gap_protocol_prompt.includes("meta_state_log_change"));
  });
});