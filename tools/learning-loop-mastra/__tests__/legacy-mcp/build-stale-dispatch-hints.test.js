// Tests for plan 260704-0301-stale-findings-dispatch-handle Phase 3:
// buildStaleDispatchHints in core/loop-introspect.js + the four TTL cases
// (the close-flow test is gated by existing toolchain — covered by the
// cold-tier test; TTL regression-pins guard against the future
// re-introduction of the auto-resolve path).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildStaleDispatchHints } from "../../core/loop-introspect.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { metaStateDispatchFindingTool } from "../../tools/legacy/meta-state-dispatch-finding-tool.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("buildStaleDispatchHints — Rec 10 surfacing", () => {
  function setupTempRegistry() {
    const tempDir = mkdtempSync(join(tmpdir(), "build-stale-dispatch-"));
    process.env.GATE_ROOT = tempDir;
    return tempDir;
  }

  function makeEntry(opts) {
    return {
      id: opts.id ?? `meta-test-${Math.random().toString(36).slice(2, 10)}`,
      entry_kind: "finding",
      created_at: opts.created_at ?? new Date().toISOString(),
      category: opts.category ?? "gate-logic-bug",
      severity: opts.severity ?? "warning",
      affected_system: opts.affected_system ?? "meta",
      description: opts.description ?? "Build-stale-dispatch-hints test fixture",
      status: opts.status ?? "stale",
      ...(opts.evidence_code_ref !== undefined
        ? { evidence_code_ref: opts.evidence_code_ref }
        : {}),
      ...(opts.ledger_ref ? { ledger_ref: opts.ledger_ref } : {}),
    };
  }

  test("returns empty fixable_candidates when registry is empty", () => {
    const result = buildStaleDispatchHints([]);
    assert.deepStrictEqual(result.fixable_candidates, []);
    assert.deepStrictEqual(result.orphan_findings, []);
    assert.ok(result.dispatch_protocol_prompt.includes("Rec 10"));
  });

  test("includes a stale finding with non-empty evidence_code_ref, severity=warning, no ledger_ref", () => {
    const result = buildStaleDispatchHints([
      makeEntry({ id: "meta-stale-1", evidence_code_ref: "tools/x.js:1" }),
    ]);
    assert.strictEqual(result.fixable_candidates.length, 1);
    assert.strictEqual(result.fixable_candidates[0].id, "meta-stale-1");
  });

  test("excludes findings with severity=escalate", () => {
    const result = buildStaleDispatchHints([
      makeEntry({ id: "meta-stale-1", severity: "escalate", evidence_code_ref: "tools/x.js:1" }),
    ]);
    assert.deepStrictEqual(result.fixable_candidates, []);
  });

  test("excludes findings with no evidence_code_ref", () => {
    const result = buildStaleDispatchHints([
      makeEntry({ id: "meta-stale-1", evidence_code_ref: undefined }),
    ]);
    assert.deepStrictEqual(result.fixable_candidates, []);
  });

  test("excludes findings that already have ledger_ref (already dispatched)", () => {
    const result = buildStaleDispatchHints([
      makeEntry({ id: "meta-stale-1", evidence_code_ref: "tools/x.js:1", ledger_ref: "dispatch-meta-stale-1" }),
    ]);
    assert.deepStrictEqual(result.fixable_candidates, []);
  });

  test("excludes non-stale findings (active, reported, terminal)", () => {
    const result = buildStaleDispatchHints([
      makeEntry({ id: "meta-active", status: "active", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-reported", status: "reported", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-resolved", status: "resolved", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-superseded", status: "superseded", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-auto-resolved", status: "auto-resolved", evidence_code_ref: "x.js:1" }),
    ]);
    assert.deepStrictEqual(result.fixable_candidates, []);
  });

  test("caps fixable_candidates at 5 (top-N)", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({
        id: `meta-stale-${i}`,
        evidence_code_ref: `tools/x${i}.js:1`,
        // Older first → newer last; sort by created_at descending, so the
        // top-5 should be the most-recently-created.
        created_at: new Date(Date.now() - (10 - i) * 1000).toISOString(),
      })
    );
    const result = buildStaleDispatchHints(entries);
    assert.strictEqual(result.fixable_candidates.length, 5);
    // The first candidate should be the most-recently-created (i=9).
    assert.strictEqual(result.fixable_candidates[0].id, "meta-stale-9");
    assert.strictEqual(result.fixable_candidates[4].id, "meta-stale-5");
  });

  test("dispatches integrate end-to-end: prepare + commit → ledger_ref set → no longer in candidates", async () => {
    const tempDir = setupTempRegistry();
    process.env.OPERATOR_MODE = "1";
    try {
      const id = await (async () => {
        const r = await metaStateReportTool.handler({
          category: "gate-logic-bug",
          severity: "warning",
          affected_system: "meta",
          description: "A stale finding for buildStaleDispatchHints end-to-end test",
          evidence_code_ref: "tools/x.js:1",
        });
        return JSON.parse(r.content[0].text).id;
      })();

      // Make it stale.
      const reg = readRegistry(tempDir);
      const entry = reg.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { status: "stale", expires_at: entry.expires_at });

      // Before dispatch: should be in fixable_candidates.
      const beforeEntries = readRegistry(tempDir);
      const before = buildStaleDispatchHints(beforeEntries);
      const beforeIds = before.fixable_candidates.map((c) => c.id);
      assert.ok(beforeIds.includes(id), `entry ${id} should be in fixable_candidates before dispatch`);

      // Dispatch.
      await metaStateDispatchFindingTool.handler({ id, stage: "commit",
        issue_number: 1, issue_url: "https://x/y/issues/1", repo: "x/y" });

      // After dispatch: should NOT be in fixable_candidates (ledger_ref set).
      const afterEntries = readRegistry(tempDir);
      const after = buildStaleDispatchHints(afterEntries);
      const afterIds = after.fixable_candidates.map((c) => c.id);
      assert.ok(!afterIds.includes(id), `entry ${id} should NOT be in fixable_candidates after dispatch`);
    } finally {
      delete process.env.OPERATOR_MODE;
      process.env.GATE_ROOT = process.env.GATE_ROOT ? undefined : process.env.GATE_ROOT;
    }
  });
});