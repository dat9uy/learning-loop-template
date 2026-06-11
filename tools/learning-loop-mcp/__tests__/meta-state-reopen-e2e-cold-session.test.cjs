import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, writeEntry } from "../core/meta-state.js";
import { metaStateRelationshipValidateTool } from "../tools/meta-state-relationship-validate-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateMigrateExpiredToStaleTool } from "../tools/meta-state-migrate-expired-to-stale-tool.js";
import { metaStateRelationshipsTool } from "../tools/meta-state-relationships-tool.js";
import { metaStateResolveTool } from "../tools/meta-state-resolve-tool.js";

const FIXTURE_IDS = [
  "meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env",
  "meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio",
];

// Real-registry test — gated. The operator runs this AFTER implementing the
// new tools (Phase 2 + 3) and rewiring the cascade (Phase 4).
test.skip("e2e: cold-session 'X is related to Y' script", async () => {
  if (process.env.META_STATE_E2E !== "1") return;

  // Use a temp GATE_ROOT to isolate the test from the live registry.
  const tempRoot = mkdtempSync(join(tmpdir(), "e2e-cold-session-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    // Pre-flight: assert fixture IDs do not already exist in live registry.
    const liveRoot = process.cwd();
    const liveEntries = readRegistry(liveRoot);
    for (const fid of FIXTURE_IDS) {
      if (liveEntries.some((e) => e.id === fid)) {
        throw new Error(`Live registry already contains fixture id ${fid}; aborting to prevent mutation.`);
      }
    }

    // Write the 2 fixtures as expired findings in the temp registry.
    const now = Date.now();
    for (const fid of FIXTURE_IDS) {
      await writeEntry(tempRoot, {
        id: fid,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `E2E fixture for ${fid} (min 20 chars)`,
        status: "expired",
        created_at: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        version: 0,
      });
    }

    // Step 1: validate description referencing both fixtures.
    const validateResult = await metaStateRelationshipValidateTool.handler({
      description: `New finding is related to ${FIXTURE_IDS[0]} and ${FIXTURE_IDS[1]} (min 20 chars).`,
    });
    const validateParsed = JSON.parse(validateResult.content[0].text);
    assert.equal(validateParsed.warned, true);
    assert.ok(validateParsed.orphans.length >= 1);

    // Step 2: report a new finding with reopens.
    const reportResult = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "E2E new finding that reopens both cold-session fixtures (min 20 chars).",
      reopens: FIXTURE_IDS,
    });
    const reportParsed = JSON.parse(reportResult.content[0].text);
    assert.equal(reportParsed.reported, true);
    const newId = reportParsed.id;

    // Step 3: migrate each expired fixture to stale.
    for (const fid of FIXTURE_IDS) {
      const migrateResult = await metaStateMigrateExpiredToStaleTool.handler({ id: fid });
      const migrateParsed = JSON.parse(migrateResult.content[0].text);
      assert.equal(migrateParsed.migrated, true);
      assert.equal(migrateParsed.status, "stale");
    }

    // Step 4: relationships inbound shows reopened_by.
    const relResult = await metaStateRelationshipsTool.handler({
      id: FIXTURE_IDS[0],
      direction: "inbound",
    });
    const relParsed = JSON.parse(relResult.content[0].text);
    assert.ok(relParsed.inbound.reopened_by.includes(newId));

    // Step 5: cascade-resolve the first fixture (migrates to stale via cascade).
    const cascadeResult = await metaStateResolveTool.handler({
      id: FIXTURE_IDS[0],
      cascade_from: [newId],
    });
    const cascadeParsed = JSON.parse(cascadeResult.content[0].text);
    assert.equal(cascadeParsed.migrated_via_cascade, true);
    assert.equal(cascadeParsed.status, "stale");

    // Step 6: second resolve (no cascade_from) closes the fixture.
    const closeResult = await metaStateResolveTool.handler({
      id: FIXTURE_IDS[0],
      resolution: "E2E test close",
    });
    const closeParsed = JSON.parse(closeResult.content[0].text);
    assert.equal(closeParsed.resolved, true);
    assert.equal(closeParsed.status, "resolved");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  }
});
