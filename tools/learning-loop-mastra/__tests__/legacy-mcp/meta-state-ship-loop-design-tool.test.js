// Plan 260712-0724 follow-up — Fix A: meta_state_ship_loop_design RED→GREEN tests.
// Closes Implementation 3 Gap #1: loop-design status cannot be flipped via any
// other MCP tool. The 4 fixtures cover success, not_a_loop_design rejection,
// live_session_required gate, and CAS version_mismatch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { metaStateShipLoopDesignTool } from "../../tools/handlers/meta-state-ship-loop-design-tool.js";
import { metaStateProposeDesignTool } from "../../tools/handlers/meta-state-propose-design-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;
const originalLoopSessionMode = process.env.LOOP_SESSION_MODE;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "ship-loop-design-"));
  process.env.GATE_ROOT = tempDir;
  // Default to live for happy-path tests; specific tests flip to prompt-mode
  // to verify the session gate.
  process.env.LOOP_SESSION_MODE = "live";
  return tempDir;
}

function teardown() {
  if (originalEnv === undefined) delete process.env.GATE_ROOT;
  else process.env.GATE_ROOT = originalEnv;
  process.env.LOOP_SESSION_MODE = originalLoopSessionMode;
}

async function seedLoopDesign(tempDir, id) {
  await metaStateProposeDesignTool.handler({
    loop_design_id: id,
    title: "Test loop-design for ship fixture (must be 10+ chars)",
    proposed_design_for: ["rule-test-target"],
    addresses: [],
    description: "Test loop-design used to verify the ship_loop_design flip surface (min 20 chars)",
    affected_system: "meta-state-tools",
    severity_hint: "low",
    created_by: "test-runner",
  });
}

test("(success) live session ships an active loop-design: status:inactive + shipped_in_plan + shipped_at stamped", async () => {
  const tempDir = setup();
  try {
    const proposed = await seedLoopDesign(tempDir, "loop-design-ship-success");

    const shipResult = await metaStateShipLoopDesignTool.handler({
      id: "loop-design-ship-success",
      shipped_in_plan: "260712-0724-assertinvariant-universal-primitive",
    });
    const parsed = JSON.parse(shipResult.content[0].text);

    assert.equal(parsed.shipped, true, "ship must succeed");
    assert.equal(parsed.id, "loop-design-ship-success");
    assert.equal(parsed.status, "inactive", "status must flip to inactive");
    assert.equal(parsed.shipped_in_plan, "260712-0724-assertinvariant-universal-primitive");
    assert.match(parsed.shipped_at, /^\d{4}-\d{2}-\d{2}T/, "shipped_at must be ISO timestamp");
    assert.ok(parsed.version >= 1, "version must bump");

    // Registry re-read confirms persistence
    const persisted = readRegistry(tempDir).find((e) => e.id === "loop-design-ship-success");
    assert.equal(persisted.status, "inactive");
    assert.equal(persisted.shipped_in_plan, "260712-0724-assertinvariant-universal-primitive");
    assert.equal(persisted.shipped_at, parsed.shipped_at);
    assert.equal(persisted.version, parsed.version, "version must bump on ship");
  } finally { teardown(); }
});

test("(not_a_loop_design) rejects non-loop-design entry kinds (finding/rule/change-log)", async () => {
  const tempDir = setup();
  try {
    // Seed a finding (NOT a loop-design)
    await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "test-subtype",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Test finding for ship_loop_design rejection fixture (min 20 chars)",
    });

    const allEntries = readRegistry(tempDir);
    const findingId = allEntries.find((e) => e.entry_kind === "finding").id;

    const shipResult = await metaStateShipLoopDesignTool.handler({
      id: findingId,
      shipped_in_plan: "test-plan",
    });
    const parsed = JSON.parse(shipResult.content[0].text);

    assert.equal(parsed.shipped, false);
    assert.equal(parsed.reason, "not_a_loop_design");
    assert.equal(parsed.entry_kind, "finding");

    // Registry unchanged
    const persisted = readRegistry(tempDir).find((e) => e.id === findingId);
    assert.equal(persisted.status, "open", "finding status must NOT be flipped");
  } finally { teardown(); }
});

test("(live_session_required) rejects when LOOP_SESSION_MODE is not 'live'", async () => {
  const tempDir = setup();
  try {
    process.env.LOOP_SESSION_MODE = "prompt";
    await seedLoopDesign(tempDir, "loop-design-ship-prompt-rejected");

    const shipResult = await metaStateShipLoopDesignTool.handler({
      id: "loop-design-ship-prompt-rejected",
      shipped_in_plan: "test-plan",
    });
    const parsed = JSON.parse(shipResult.content[0].text);

    assert.equal(parsed.shipped, false);
    assert.equal(parsed.reason, "live_session_required");
    assert.equal(parsed.id, "loop-design-ship-prompt-rejected");

    // Registry unchanged
    const persisted = readRegistry(tempDir).find((e) => e.id === "loop-design-ship-prompt-rejected");
    assert.equal(persisted.status, "active", "loop-design must NOT be flipped in prompt mode");
  } finally { teardown(); }
});

test("(version_mismatch) CAS rejects when _expected_version does not match", async () => {
  const tempDir = setup();
  try {
    await seedLoopDesign(tempDir, "loop-design-ship-cas");

    const shipResult = await metaStateShipLoopDesignTool.handler({
      id: "loop-design-ship-cas",
      shipped_in_plan: "test-plan",
      _expected_version: 99, // wrong — actual is 0
    });
    const parsed = JSON.parse(shipResult.content[0].text);

    assert.equal(parsed.shipped, false);
    assert.equal(parsed.reason, "version_mismatch");
    assert.equal(parsed.current_version, 0);

    // Registry unchanged
    const persisted = readRegistry(tempDir).find((e) => e.id === "loop-design-ship-cas");
    assert.equal(persisted.status, "active", "status must NOT flip on CAS mismatch");
  } finally { teardown(); }
});