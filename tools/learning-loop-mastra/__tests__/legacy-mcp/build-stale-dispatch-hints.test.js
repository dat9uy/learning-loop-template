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
    // Plan 260707-0812 Phase 2: `status: "stale"` is no longer a status. The
    // derived stale predicate (`isStaleView`) needs a `created_at` past the
    // 7d window. We backdate by default so the fixture continues to surface
    // in stale-view as the tests intend.
    return {
      id: opts.id ?? `meta-test-${Math.random().toString(36).slice(2, 10)}`,
      entry_kind: "finding",
      created_at: opts.created_at ?? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      category: opts.category ?? "gate-logic-bug",
      severity: opts.severity ?? "warning",
      affected_system: opts.affected_system ?? "meta",
      description: opts.description ?? "Build-stale-dispatch-hints test fixture",
      status: opts.status ?? "open",
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

  test("excludes non-stale findings (open + fresh, terminal)", () => {
    // Plan 260707-0812 Phase 2: legacy `active`/`reported`/`stale`/`auto-resolved`
    // statuses are gone. The remaining non-stale states are: open (with fresh
    // created_at — below the 7d window) and terminal (resolved/superseded).
    const RECENT = new Date().toISOString();
    const result = buildStaleDispatchHints([
      makeEntry({ id: "meta-fresh-open", status: "open", created_at: RECENT, evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-resolved", status: "resolved", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-superseded", status: "superseded", evidence_code_ref: "x.js:1" }),
    ]);
    assert.deepStrictEqual(result.fixable_candidates, []);
  });

  test("caps fixable_candidates at 5 (top-N), oldest first", () => {
    // Plan 260707-0812 Phase 2: `isStaleView` checks age + drift. Each entry
    // is backdated past the 7d window so all 10 surface in the derived view.
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({
        id: `meta-stale-${i}`,
        evidence_code_ref: `tools/x${i}.js:1`,
        // i=0 → 10 days ago (oldest); i=9 → 9 days ago (newest in the set).
        // All backdated past the 7d window so they surface in stale-view.
        created_at: new Date(Date.now() - (10 - i + 7) * 24 * 60 * 60 * 1000).toISOString(),
      })
    );
    const result = buildStaleDispatchHints(entries);
    assert.strictEqual(result.fixable_candidates.length, 5);
    // The first candidate should be the oldest (i=0); the fifth is i=4.
    assert.strictEqual(result.fixable_candidates[0].id, "meta-stale-0");
    assert.strictEqual(result.fixable_candidates[4].id, "meta-stale-4");
  });

  test("orphan_findings: an open finding with a dispatch row but no ledger_ref is surfaced", () => {
    // Plan 260707-0812 Phase 2: orphans are `isOpen` (the canonical open set,
    // including legacy `active`/`reported`/`stale`). meta-orphan-1/2 have a
    // dispatch-<id> row but no ledger_ref — they surface as orphans.
    const entries = [
      makeEntry({ id: "meta-orphan-1", status: "open", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-orphan-2", status: "open", evidence_code_ref: "x.js:1" }),
      // Not an orphan: terminal (orphan filter is `isOpen(e) && !ledger_ref`).
      makeEntry({ id: "meta-not-orphan-terminal", status: "resolved", evidence_code_ref: "x.js:1" }),
      // Not an orphan: ledger_ref set (back-pointer exists).
      makeEntry({ id: "meta-not-orphan-patched", status: "open", evidence_code_ref: "x.js:1", ledger_ref: "dispatch-meta-not-orphan-patched" }),
      // Not an orphan: no dispatch row for this id.
      makeEntry({ id: "meta-no-row", status: "open", evidence_code_ref: "x.js:1" }),
    ];
    const dispatchIds = new Set(["meta-orphan-1", "meta-orphan-2", "meta-not-orphan-patched", "meta-not-orphan-terminal"]);
    const result = buildStaleDispatchHints(entries, dispatchIds);
    const orphanIds = result.orphan_findings.map((o) => o.id);
    assert.deepStrictEqual(orphanIds.sort(), ["meta-orphan-1", "meta-orphan-2"]);
    // The prompt explains the heal action.
    assert.ok(result.dispatch_protocol_prompt.includes("orphan_findings"));
  });

  test("orphan_findings is empty when dispatchIds is empty (no prior dispatches)", () => {
    const entries = [
      makeEntry({ id: "meta-r-1", status: "open", evidence_code_ref: "x.js:1" }),
      makeEntry({ id: "meta-a-1", status: "open", evidence_code_ref: "x.js:1" }),
    ];
    const result = buildStaleDispatchHints(entries, new Set());
    assert.deepStrictEqual(result.orphan_findings, []);
  });

  test("orphan_findings caps at 5, oldest first", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({
        id: `meta-orphan-${i}`,
        status: "open",
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
    process.env.LOOP_SESSION_MODE = "live";
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

      // Make it stale-view by backdating created_at past the 7d window.
      // Plan 260707-0812 Phase 2: `expires_at` no longer drives staleness.
      const reg = readRegistry(tempDir);
      const entry = reg.find((e) => e.id === id);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

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
      delete process.env.LOOP_SESSION_MODE;
      restoreGateRoot();
    }
  });
});