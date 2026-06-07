import { loopDescribeTool } from "#mcp/tools/loop-describe-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert";

const root = resolveRoot();
const fixturePath = new URL("./fixtures/cold-tier-pre-refactor.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("cold-tier regression: structure matches fixture", async () => {
  const result = await loopDescribeTool.handler({ tier: "cold" });
  const current = JSON.parse(result.content[0].text);

  // Top-level structural assertions
  assert.strictEqual(current.tier, "cold");
  assert.strictEqual(current.tools.length, fixture.tools.length, "tools count mismatch");
  assert.strictEqual(current.all_findings.length, fixture.all_findings.length, "all_findings count mismatch");
  assert.strictEqual(current.loop_designs.length, fixture.loop_designs.length, "loop_designs count mismatch");
  assert.strictEqual(current.superseded_lineage.length, fixture.superseded_lineage.length, "superseded_lineage count mismatch");
  assert.strictEqual(current.orphans?.length ?? 0, fixture.orphans?.length ?? 0, "orphans count mismatch");
  assert.strictEqual(current.discoverability_hints.length, fixture.discoverability_hints.length, "discoverability_hints count mismatch");
  assert.strictEqual(current.record_types.length, fixture.record_types.length, "record_types count mismatch");
  assert.strictEqual(current.gate_patterns.length, fixture.gate_patterns.length, "gate_patterns count mismatch");
  assert.strictEqual(current.rules.length, fixture.rules.length, "rules count mismatch");
  assert.strictEqual(current.active_findings.length, fixture.active_findings.length, "active_findings count mismatch");
  assert.strictEqual(current.anti_patterns.length, fixture.anti_patterns.length, "anti_patterns count mismatch");

  // Check for broken proposed_design_for refs (Phase 1 post-fix: 0 broken)
  const brokenRefs = current.loop_designs
    .flatMap((d) => d.proposed_design_for ?? [])
    .filter((ref) => !ref.startsWith("meta-") && !ref.startsWith("rule-") && !ref.startsWith("loop-design-"));
  assert.ok(brokenRefs.length === 0, `Expected 0 broken refs after Phase 1 fix, got ${brokenRefs.length}: ${brokenRefs.join(", ")}`);

  // Check mechanism_check coverage (Phase 5 post-fix: 12/16 resolved findings)
  const allFindings = current.all_findings;
  const resolvedWithCheck = allFindings.filter(
    (f) => f.status === "resolved" && f.mechanism_check === true
  ).length;
  const resolvedTotal = allFindings.filter((f) => f.status === "resolved").length;
  assert.strictEqual(resolvedTotal, 16, `Expected 16 resolved findings at baseline, got ${resolvedTotal}`);
  assert.ok(resolvedWithCheck >= 12, `Expected >=12 resolved findings with mechanism_check after backfill, got ${resolvedWithCheck}`);

  // Check orphan rate (Phase 3 baseline)
  const orphanCount = allFindings.filter(
    (f) =>
      !f.consolidated_into &&
      !f.promoted_to_rule &&
      !current.loop_designs.some((d) => d.addresses?.includes(f.id))
  ).length;
  assert.ok(orphanCount >= 20, `Expected >=20 orphan findings at baseline, got ${orphanCount}`);

  // Size check (Phase 6 baseline: 30K+ tokens)
  const currentBytes = Buffer.byteLength(JSON.stringify(current, null, 2), "utf8");
  assert.ok(currentBytes > 100000, `Expected cold-tier >100KB at baseline, got ${currentBytes}`);
});
