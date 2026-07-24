import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, writeEntry, updateEntry } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";
import { metaStateRelationshipValidateTool } from "../../tools/handlers/meta-state-relationship-validate-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { metaStateRelationshipsTool } from "../../tools/handlers/meta-state-relationships-tool.js";
import { metaStateResolveTool } from "../../tools/handlers/meta-state-resolve-tool.js";

// Plan 260611-1000 retargeted the cascade to a 1-step path. The legacy
// 'expired' status was removed; the migrate tool (used by the old 2-step
// path) was deleted in phase 2. This E2E test exercises the operator's
// exact scenario: 2 stale parents reopens'd by a single new finding, then
// each parent cascade-resolved in 1 step. Phase 5 un-skips this test.
//
// Synthetic fixture ids (not the live `meta-260608T1522Z-...` and
// `meta-260608T1618Z-...` ids in the live registry). The live ids are
// covered by the unit tests in meta-state-resolve-cascade-stale.test.js.
// Ids follow the meta-YYMMDDTHHmmZ-slug format so the validator's
// FINDING_ID_REGEX matches them.
const FIXTURE_IDS = [
  "meta-260611T0900Z-e2e-cascade-parent-one-stale-fixture",
  "meta-260611T0900Z-e2e-cascade-parent-two-stale-fixture",
];

test("e2e: cold-session 'X is related to Y' script (1-step cascade, 2 stale parents)", async () => {
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

    // Write the 2 fixtures as stale findings in the temp registry.
    // (Plan 260611-1000: 'expired' was removed; 'stale' is the modern
    // past-TTL/non-terminal equivalent.)
    // Note: created_at is recent (<7 days) so the registry's compaction
    // invariant does not remove the resolved fixtures when cascade 2 fires
    // updateEntry. The 'stale' state is asserted via last_verified_at, not
    // created_at age.
    //
    // last_verified_at is NOT passed to writeEntry because the field is
    // removed from metaStateFindingEntrySchema (Plan 260724-1931 phase 3
    // closes the freshness-stamp patch backdoor). writeEntry's schema is
    // strip-mode, so passing it here would silently drop it. We persist the
    // backdated stamp via updateEntry, whose patch schema is permissive
    // passthrough and which appends the merged entry verbatim via
    // trueAppendAtomicRaw — the same internal write path meta_state_touch
    // and meta_state_re_verify use. The user-facing patch tool is still
    // deny-listed via IMMUTABLE_PATCH_FIELDS.
    const now = Date.now();
    for (const fid of FIXTURE_IDS) {
      await writeEntry(tempRoot, {
        id: fid,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `E2E fixture for ${fid} (min 20 chars)`,
        status: "open",
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        version: 0,
      });
      await updateEntry(tempRoot, fid, {
        last_verified_at: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Step 1: validate description referencing both fixtures.
    const validateResult = await metaStateRelationshipValidateTool.handler({
      description: `New finding is related to ${FIXTURE_IDS[0]} and ${FIXTURE_IDS[1]} (min 20 chars).`,
    });
    const validateParsed = JSON.parse(validateResult.content[0].text);
    assert.equal(validateParsed.warned, true);
    assert.ok(validateParsed.orphans.length >= 1);

    // Step 2: report a new finding with reopens referencing both parents.
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

    // Ack the new finding so it becomes `active` (the cascade child validator
    // requires `active` or `resolved`; the canonical reported -> active flow
    // uses meta_state_ack but we update directly here to keep the test
    // hermetic — the cascade_child_unresolved gate is the focus).
    await updateEntry(tempRoot, newId, {
      status: "open",
    });

    // Step 3: relationships inbound shows reopened_by on the first parent.
    const relResult = await metaStateRelationshipsTool.handler({
      id: FIXTURE_IDS[0],
      direction: "inbound",
    });
    const relParsed = JSON.parse(relResult.content[0].text);
    assert.ok(relParsed.inbound.reopened_by.includes(newId));

    // Step 4: cascade-resolve the first parent in 1 step (1-step path;
    // the legacy 2-step migrate-then-resolve path was removed).
    const cascadeResult1 = await metaStateResolveTool.handler({
      id: FIXTURE_IDS[0],
      cascade_from: [newId],
    });
    const cascadeParsed1 = JSON.parse(cascadeResult1.content[0].text);
    assert.equal(cascadeParsed1.resolved, true);
    assert.equal(cascadeParsed1.status, "resolved");

    // Step 5: cascade-resolve the second parent in 1 step.
    const cascadeResult2 = await metaStateResolveTool.handler({
      id: FIXTURE_IDS[1],
      cascade_from: [newId],
    });
    const cascadeParsed2 = JSON.parse(cascadeResult2.content[0].text);
    assert.equal(cascadeParsed2.resolved, true);
    assert.equal(cascadeParsed2.status, "resolved");

    // Step 6: verify both parents are resolved in the registry.
    invalidateCache(tempRoot);
    const finalEntries = readRegistry(tempRoot);
    for (const fid of FIXTURE_IDS) {
      const parent = finalEntries.find((e) => e.id === fid);
      assert.ok(parent);
      assert.equal(parent.status, "resolved");
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  }
});
