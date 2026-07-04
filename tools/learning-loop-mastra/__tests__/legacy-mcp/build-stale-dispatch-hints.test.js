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
  // Save GATE_ROOT so the e2e test can restore it in finally (F8: the prior
  // implementation leaked GATE_ROOT or deleted it via a convoluted ternary).
  let prevGateRoot;
  function setupTempRegistry() {
    prevGateRoot = process.env.GATE_ROOT;
    const tempDir = mkdtempSync(join(tmpdir(), "build-stale-dispatch-"));
    process.env.GATE_ROOT = tempDir;
    return tempDir;
  }
  function restoreGateRoot() {
    if (prevGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = prevGateRoot;
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

  test("caps fixable_candidates at 5 (top-N), oldest first", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({
        id: `meta-stale-${i}`,
        evidence_code_ref: `tools/x${i}.js:1`,
        // i=0 → 10s ago (oldest); i=9 → 1s ago (newest). Ranking is oldest-first
        // (validation P3-W4), so the top-5 should be the OLDEST five.
        created_at: new Date(Date.now() - (10 - i) * 1000).toISOString(),
      })
    );
    const result = buildStaleDispatchHints(entries);
    assert.strictEqual(result.fixable_candidates.length, 5);
    // The first candidate should be the oldest (i=0); the fifth is i=4.
    assert.strictEqual(result.fixable_candidates[0].id, "meta-stale-0");
    assert.strictEqual(result.fixable_candidates[4].id, "meta-stale-4");
  });

  test("orphan_findings: a reported finding with a dispatch row but no ledger_ref is surfaced", () => {
    // meta-orphan-1 has a dispatch-<id> row (dispatchIds) but no ledger_ref.
    const entries = [
      makeEntry({ id: "meta-orphan-1", status: "reported", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-orphan-2", status: "active", evidence_code_ref: "x.js:1" }),
      // Not an orphan: stale (orphans are reported/active only).
      makeEntry({ id: "meta-not-orphan-stale", status: "stale", evidence_code_ref: "x.js:1" }),
      // Not an orphan: ledger_ref set (back-pointer exists).
      makeEntry({ id: "meta-not-orphan-patched", status: "reported", evidence_code_ref: "x.js:1", ledger_ref: "dispatch-meta-not-orphan-patched" }),
      // Not an orphan: no dispatch row for this id.
      makeEntry({ id: "meta-no-row", status: "reported", evidence_code_ref: "x.js:1" }),
    ];
    const dispatchIds = new Set(["meta-orphan-1", "meta-orphan-2", "meta-not-orphan-patched", "meta-not-orphan-stale"]);
    const result = buildStaleDispatchHints(entries, dispatchIds);
    const orphanIds = result.orphan_findings.map((o) => o.id);
    assert.deepStrictEqual(orphanIds.sort(), ["meta-orphan-1", "meta-orphan-2"]);
    // The prompt explains the heal action.
    assert.ok(result.dispatch_protocol_prompt.includes("orphan_findings"));
  });

  test("orphan_findings is empty when dispatchIds is empty (no prior dispatches)", () => {
    const entries = [
      makeEntry({ id: "meta-r-1", status: "reported", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-a-1", status: "active", evidence_code_ref: "x.js:1" }),
    ];
    const result = buildStaleDispatchHints(entries, new Set());
    assert.deepStrictEqual(result.orphan_findings, []);
  });

  test("orphan_findings caps at 5, oldest first", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({
        id: `meta-orphan-${i}`,
        status: "reported",
        evidence_code_ref: "x.js:1",
        created_at: new Date(Date.now() - (8 - i) * 1000).toISOString(),
      })
    );
    const dispatchIds = new Set(entries.map((e) => e.id));
    const result = buildStaleDispatchHints(entries, dispatchIds);
    assert.strictEqual(result.orphan_findings.length, 5);
    assert.strictEqual(result.orphan_findings[0].id, "meta-orphan-0");
    assert.strictEqual(result.orphan_findings[4].id, "meta-orphan-4");
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
      restoreGateRoot();
    }
  });
});