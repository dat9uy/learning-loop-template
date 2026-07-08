import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const originalRoot = process.env.GATE_ROOT;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "session-id-roundtrip-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  if (originalRoot === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalRoot;
  }
}

test("meta_state_report persists session_id when provided", async () => {
  const root = setup();
  try {
    const result = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "session-id-roundtrip-probe",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "session_id roundtrip probe (min 20 chars) " + Date.now(),
      evidence_code_ref: "tools/test.js:1",
      mechanism_check: false,
      session_id: "probe-session-xyz-123",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.reported, true);

    const entries = readRegistry(root);
    const e = entries.find((x) => x.id === parsed.id);
    assert.ok(e, "entry should be in registry");
    assert.equal(e.session_id, "probe-session-xyz-123", "session_id should be persisted");
  } finally {
    teardown();
  }
});

test("meta_state_report omits session_id when not provided (no spurious field)", async () => {
  const root = setup();
  try {
    const result = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "no session_id probe (min 20 chars) " + Date.now(),
    });
    const parsed = JSON.parse(result.content[0].text);

    const entries = readRegistry(root);
    const e = entries.find((x) => x.id === parsed.id);
    assert.ok(e, "entry should be in registry");
    assert.equal(e.session_id, undefined, "session_id should be undefined when not provided");
  } finally {
    teardown();
  }
});

test("meta_state_list filters by session_id (exact match)", async () => {
  const root = setup();
  try {
    // File 3 findings: 2 with the same session_id, 1 with a different one
    const sessionA = "session-A-" + Date.now();
    const sessionB = "session-B-" + Date.now();

    for (let i = 0; i < 2; i++) {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `session A finding #${i} (min 20 chars) ${Date.now()}-${i}`,
        evidence_code_ref: "tools/test.js:1",
        session_id: sessionA,
      });
    }
    await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: `session B finding (min 20 chars) ${Date.now()}-B`,
      evidence_code_ref: "tools/test.js:1",
      session_id: sessionB,
    });

    // Filter by sessionA
    const listResult = await metaStateListTool.handler({ session_id: sessionA });
    const list = JSON.parse(listResult.content[0].text);
    assert.equal(list.count, 2, `expected 2 entries for sessionA, got ${list.count}`);
    for (const e of list.entries) {
      assert.equal(e.session_id, sessionA, "all returned entries should match sessionA");
    }

    // Compact output should still surface session_id
    const compactResult = await metaStateListTool.handler({ session_id: sessionA, compact: true });
    const compactList = JSON.parse(compactResult.content[0].text);
    assert.equal(compactList.count, 2, "compact filter by session_id should return same count");
    for (const e of compactList.entries) {
      assert.equal(e.session_id, sessionA, "compact output should include session_id");
    }

    assert.deepEqual(list.filters_applied, { session_id: sessionA });

    // Filter by sessionB
    const listB = await metaStateListTool.handler({ session_id: sessionB });
    const parsedB = JSON.parse(listB.content[0].text);
    assert.equal(parsedB.count, 1);
    assert.equal(parsedB.entries[0].session_id, sessionB);

    // Filter by unknown session
    const listUnknown = await metaStateListTool.handler({ session_id: "nonexistent" });
    const parsedUnknown = JSON.parse(listUnknown.content[0].text);
    assert.equal(parsedUnknown.count, 0);
  } finally {
    teardown();
  }
});

test("meta_state_list combines session_id with other filters (AND logic)", async () => {
  const root = setup();
  try {
    const sessionC = "session-C-" + Date.now();
    // 2 findings with sessionC: one is gate-logic-bug, one is loop-anti-pattern
    await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: `session C loop-anti-pattern finding (min 20 chars) ${Date.now()}`,
      session_id: sessionC,
    });
    await metaStateReportTool.handler({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: `session C gate-logic-bug finding (min 20 chars) ${Date.now()}`,
      session_id: sessionC,
    });

    // AND filter: sessionC + category=loop-anti-pattern → 1 entry
    const result = await metaStateListTool.handler({
      session_id: sessionC,
      category: "loop-anti-pattern",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.entries[0].category, "loop-anti-pattern");
    assert.equal(parsed.entries[0].session_id, sessionC);

    // AND filter: sessionC + category=mcp-tool-missing → 0 entries
    const none = await metaStateListTool.handler({
      session_id: sessionC,
      category: "mcp-tool-missing",
    });
    const parsedNone = JSON.parse(none.content[0].text);
    assert.equal(parsedNone.count, 0);
  } finally {
    teardown();
  }
});
