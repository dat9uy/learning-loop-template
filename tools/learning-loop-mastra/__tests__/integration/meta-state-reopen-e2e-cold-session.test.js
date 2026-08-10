import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, writeEntry, updateEntry } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";
import { metaStateRelationshipValidateTool } from "../../tools/handlers/meta-state-relationship-validate-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { metaStateResolveTool } from "../../tools/handlers/meta-state-resolve-tool.js";

// The canonical 'X is related to Y' script is now a direct path: lint ->
// report (no `reopens` arg — the writer was dropped) -> resolve orphan
// parents explicitly via `meta_state_resolve({ id })` (no `cascade_from`;
// the cascade writer was dropped). This E2E test exercises the operator's
// exact scenario: 2 stale parents surfaced by a new finding, then each
// parent resolved directly.
//
// Synthetic fixture ids (not the live `meta-260608T1522Z-...` and
// `meta-260608T1618Z-...` ids in the live registry). Ids follow the
// meta-YYMMDDTHHmmZ-slug format so the validator's FINDING_ID_REGEX matches.
const FIXTURE_IDS = [
  "meta-260611T0900Z-e2e-cascade-parent-one-stale-fixture",
  "meta-260611T0900Z-e2e-cascade-parent-two-stale-fixture",
];

test("e2e: cold-session 'X is related to Y' script (direct resolve, 2 stale parents)", async () => {
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

    // Write the 2 fixtures as stale findings in the temp registry. `stale`
    // is the modern past-TTL/non-terminal equivalent (the legacy 'expired'
    // status was removed). created_at is recent (<7 days) so the registry's
    // compaction invariant does not remove the resolved fixtures when the
    // second resolve fires updateEntry. The stale state is asserted via
    // last_verified_at, not created_at age.
    //
    // last_verified_at is NOT passed to writeEntry because the field is
    // removed from metaStateFindingEntrySchema (the freshness-stamp patch
    // backdoor is closed). writeEntry's schema is strip-mode, so passing it
    // here would silently drop it. We persist the backdated stamp via
    // updateEntry, whose patch schema is permissive passthrough and which
    // appends the merged entry verbatim via trueAppendAtomicRaw — the same
    // internal write path meta_state_touch and meta_state_re_verify use.
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

    // Step 2: report a new finding. The `reopens` arg was dropped from
    // `meta_state_report` — the new finding no longer carries a reopens edge
    // to the parents. The relationship is documented in the description;
    // the parents are closed explicitly in Steps 3-4.
    const reportResult = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "E2E new finding related to both cold-session fixtures (min 20 chars).",
    });
    const reportParsed = JSON.parse(reportResult.content[0].text);
    assert.equal(reportParsed.reported, true);
    const newId = reportParsed.id;

    // The new finding is written with status:"open" (the canonical post-
    // collapse status). No reopens edge is stamped (arg removed); the parents
    // are not re-opened as a side-effect of opening the child.

    // Step 3: resolve the first parent directly (no cascade_from — the arg
    // was removed; close a stale parent by calling meta_state_resolve on it).
    const resolveResult1 = await metaStateResolveTool.handler({
      id: FIXTURE_IDS[0],
    });
    const resolveParsed1 = JSON.parse(resolveResult1.content[0].text);
    assert.equal(resolveParsed1.resolved, true);
    assert.equal(resolveParsed1.status, "resolved");

    // Step 4: resolve the second parent directly.
    const resolveResult2 = await metaStateResolveTool.handler({
      id: FIXTURE_IDS[1],
    });
    const resolveParsed2 = JSON.parse(resolveResult2.content[0].text);
    assert.equal(resolveParsed2.resolved, true);
    assert.equal(resolveParsed2.status, "resolved");

    // Step 5: verify both parents are resolved in the registry.
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
