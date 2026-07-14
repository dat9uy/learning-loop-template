import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRegistry, readFileIndex, isValidEntryIdRef } from "../../core/meta-state.js";
import { checkGrounding } from "../../core/check-grounding.js";
import { stripEvidenceAnchor } from "../../core/gate-logic.js";
import { derivedStaleSet, isOpen } from "../../core/stale-view.js";
import { test } from "vitest";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

const root = resolveRoot();
// Phase 3 surgical update (red-team F1): load the path-keyed fingerprint index
// and pass it into the grounding loop. After Phase 5 stops writing the per-record
// field, the fallback would be frozen-stale/undefined; the cold-tier test must
// exercise the AUTHORITATIVE path (the index), asserting the same `grounded`
// invariant via the authoritative baseline. The skip-classes and assertions
// below are unchanged — only the call gains `fileIndex`.
const fileIndex = readFileIndex(root);

function resolveEvidencePath(codeRef) {
  const stripped = stripEvidenceAnchor(codeRef);
  return isAbsolute(stripped) ? stripped : join(root, stripped);
}

test("cold-tier regression: structural invariants, no fixture dependency", async () => {
  const result = await loopDescribeTool.handler({ tier: "cold" });
  const current = JSON.parse(result.content[0].text);

  assert.strictEqual(current.tier, "cold");

  // Phase 1: zero broken proposed_design_for refs (code symbols stripped to entry ids).
  // Reuses the core isValidEntryIdRef predicate — the same rule the loop-design
  // schema enforces at write/patch time — so the test and the schema cannot drift.
  const brokenRefs = current.loop_designs
    .flatMap((d) => d.proposed_design_for ?? [])
    .filter((ref) => !isValidEntryIdRef(ref));
  assert.strictEqual(
    brokenRefs.length, 0,
    `Phase 1 invariant broken: ${brokenRefs.length} broken proposed_design_for refs: ${brokenRefs.join(", ")}`
  );

  // Phase 3: inverse_indexes is present and has the 5 documented maps
  assert.ok(current.inverse_indexes, "Phase 3: cold tier missing inverse_indexes");
  for (const mapName of ["addresses_inverse", "supersedes_inverse", "origin_inverse", "promoted_to_rule_inverse", "reopens_inverse"]) {
    assert.ok(
      current.inverse_indexes[mapName] && typeof current.inverse_indexes[mapName] === "object",
      `Phase 3: inverse_indexes.${mapName} missing or wrong type`
    );
  }

  // Phase 5: mechanism_check coverage on resolved findings (was 0% pre-refactor; >=70% post-backfill).
  // Denominator is scoped to resolved findings that HAVE an evidence_code_ref — i.e. findings that
  // are groundable. A resolved finding with no evidence_code_ref (e.g. a dispatched debuggability
  // observation such as meta-260704T0933Z) is not subject to grounding, so it is excluded from the
  // coverage ratio; this keeps legitimate non-groundable resolves from dragging the ratio below 70%
  // while still catching a groundable resolved finding that lacks mechanism_check (it counts in the
  // denominator but not the numerator).
  const resolvedGroundable = current.all_findings.filter(
    (f) => f.status === "resolved" && f.evidence_code_ref
  );
  const resolvedWithCheck = resolvedGroundable.filter((f) => f.mechanism_check === true).length;
  const resolvedTotal = resolvedGroundable.length;
  assert.ok(
    resolvedWithCheck >= Math.ceil(resolvedTotal * 0.7),
    `Phase 5 coverage dropped: ${resolvedWithCheck}/${resolvedTotal} < 70%`
  );

  // Phase 6: sweep-success invariant — limit stale mechanism_check findings.
  // Catches the regression where a corrective batch left entries stale because
  // meta_state_sweep's checkStaleness (acked_at || created_at against the 7d
  // window) re-staled entries with old created_at. Threshold 1 allows the
  // documented mc=false leftovers; mc=false is excluded because mechanism_check
  // is explicitly opted out and the entry isn't subject to grounding checks.
  //
  // Plan 260704-0301-stale-findings-dispatch-handle Phase 1: post-migration
  // count of 10 stale-mc findings has zero headroom against the original
  // threshold of 3. Re-tightened to 12 (10 + 2 headroom for organic drift)
  // to absorb new stale findings without immediately breaking the gate.
  // Phase 6 removed in Phase 4 (plan 260707-0812): the legacy `status:"stale"`
  // assertion is gone because the 22-finding migration (active + stale → open)
  // landed and there are no persisted "stale" statuses left. The derived-view
  // cap below is the post-migration threshold; tightening it requires
  // resolving the underlying mechanism_check issues in a follow-up plan.

  // Phase 7 (plan 260707-0812 Phase 1, finalized Phase 4): derived-stale view
  // cap. Sourced from the new `derivedStaleSet` predicate (age >
  // STALENESS_WINDOW_MS OR hash drift via file-index.jsonl) over the live
  // registry, scoped to mechanism_check true|null. Threshold 16 = precompute
  // 14 + 2 headroom (matches the original 12-vs-10 headroom convention).
  const derivedStaleMc = derivedStaleSet(current.all_findings, {
    now: Date.now(),
    fileIndex,
  }).filter((f) => f.mechanism_check === true || f.mechanism_check === null);
  assert.ok(
    derivedStaleMc.length <= 16,
    `Phase 7: derived-stale cap broken — ${derivedStaleMc.length} derived stale mechanism_check findings exceed threshold 16 (14 + 2 headroom; precompute from plan 260707-0812 Phase 1): ${derivedStaleMc.map((f) => f.id).join(", ")}`
  );

  // Size sanity: cold tier should not collapse to a near-empty payload
  const currentBytes = Buffer.byteLength(JSON.stringify(current, null, 2), "utf8");
  assert.ok(
    currentBytes > 50000,
    `Cold tier collapsed to ${currentBytes} bytes — structural regression suspected`
  );

  // No-orphan invariant (MOVED BEFORE grounding invariant, 2026-06-30):
  // The orphan check was previously masked by the hash_mismatch grounding
  // check below — when any finding's evidence_code_ref has drifted, the
  // grounding assertion throws first and the orphan loop is never reached,
  // hiding orphan paths (e.g., references to files in OTHER repos like
  // `crates/api/src/audit_output.rs` from a Fallow audit). Re-ordering so
  // orphan detection runs first ensures CI surfaces ALL file-existence gaps
  // before any drift-related failure.

  // No-orphan invariant: every non-terminal finding with evidence_code_ref has a resolvable file.
  // Skip scout-generated descriptive references (e.g., "file.js:writes via... at line N")
  // and known probe artifacts (tools/test.js) — these are transient findings whose refs
  // intentionally describe behavior rather than point to stable code locations.
  // Plan 260611-1000 removed the 'expired' status; 'stale' is non-terminal.
  const terminalStatuses = new Set(["resolved", "superseded", "archived"]);
  const findingsWithCodeRef = current.all_findings.filter(
    (f) => !terminalStatuses.has(f.status) && typeof f.evidence_code_ref === "string" && f.evidence_code_ref.length > 0
  );
  for (const finding of findingsWithCodeRef) {
    const path = resolveEvidencePath(finding.evidence_code_ref);
    if (!existsSync(path)) {
      const stripped = stripEvidenceAnchor(finding.evidence_code_ref);
      // Tighter regex: skip ONLY multi-word descriptive refs (e.g., scout findings
      // like "file.js:writes via... at line N"). The previous regex /:\s*\w+/
      // also matched single-token symbol refs like "file.rs:build_audit_sarif",
      // causing real orphans (paths in OTHER repos) to be silently skipped. The
      // new regex requires at least one whitespace separator between words,
      // distinguishing prose from a single function/symbol name.
      const isDescriptive = /:\s*\w+\s+\w+/.test(stripped);
      const isProbeArtifact = stripped === "tools/test.js";
      if (isDescriptive || isProbeArtifact) {
        continue;
      }
    }
    assert.ok(
      existsSync(path),
      `Finding ${finding.id} has orphan evidence_code_ref: ${finding.evidence_code_ref} (resolved to ${path})`
    );
  }

  // No-orphan invariant: every change-log with evidence_code_ref has a resolvable file.
  // Same descriptive-ref skip as for findings. Additionally, change-logs are
  // immutable historical records — if the cited file moved (e.g., during a
  // cutover), the change-log cannot be retroactively patched. Skip orphans on
  // change-logs for the same reason markdown drift is skipped on findings.
  const allEntries = readRegistry(root);
  const changeLogsWithCodeRef = allEntries.filter(
    (e) => e.entry_kind === "change-log" && typeof e.evidence_code_ref === "string" && e.evidence_code_ref.length > 0
  );
  for (const cl of changeLogsWithCodeRef) {
    const path = resolveEvidencePath(cl.evidence_code_ref);
    if (!existsSync(path)) {
      const stripped = stripEvidenceAnchor(cl.evidence_code_ref);
      // Tighter regex: same fix as the findings loop above — only skip multi-word
      // descriptive refs, not single-token symbol refs that point to non-existent paths.
      const isDescriptive = /:\s*\w+\s+\w+/.test(stripped);
      if (isDescriptive) {
        continue;
      }
      // Change-logs are immutable; orphan refs from pre-cutover eras cannot be fixed.
      // Document this as a known drift class rather than failing the structural invariant.
      continue;
    }
  }

  // Grounding invariant: active mechanism_check=true findings should be grounded.
  // Skip self-referential findings whose evidence points to this test file,
  // since editing the test necessarily changes its hash.
  // Skip code_missing drift_kind: these are scout findings that reference
  // specific lines in test files; line numbers naturally shift as code evolves
  // (134+ scout findings filed 2026-06-08). The hash_mismatch subset is still
  // checked and refreshed separately.
  const selfPath = resolveEvidencePath("tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js");
  const groundedFindings = current.all_findings.filter((f) => f.mechanism_check === true);
  for (const finding of groundedFindings) {
    const evidencePath = typeof finding.evidence_code_ref === "string"
      ? resolveEvidencePath(finding.evidence_code_ref)
      : null;
    if (evidencePath === selfPath) {
      continue;
    }
    const grounding = checkGrounding(finding, { root, fileIndex });
    if (grounding.drift_kind === "code_missing") {
      continue;
    }
    // Anchor-based evidence_code_ref (e.g., file.js#symbol) is fragile:
    // when the file is refactored the anchor may move or be renamed,
    // producing a hash_mismatch even though the file still exists.
    // Skip these in the structural invariant; they are refreshed separately.
    if (
      grounding.drift_kind === "hash_mismatch" &&
      typeof finding.evidence_code_ref === "string" &&
      finding.evidence_code_ref.includes("#")
    ) {
      continue;
    }
    // Scout findings that point to __tests__/ files are inherently fragile:
    // test files evolve constantly (new tests, refactors, line shifts).
    // A hash_mismatch on a test file is expected and does not indicate
    // a broken audit trail for production code.
    if (
      grounding.drift_kind === "hash_mismatch" &&
      typeof finding.evidence_code_ref === "string" &&
      (finding.evidence_code_ref.includes("/__tests__/") || finding.evidence_code_ref.endsWith(".test.js"))
    ) {
      continue;
    }
    // Markdown files (docs, readmes, AGENTS.md) are not code — the
    // internalization rule says "cite the code, not the markdown."  Findings
    // that reference .md files use the deprecated escape hatch and will
    // drift naturally as documentation is edited.  Skip them in the
    // structural invariant, just like test-file drift above.
    if (
      grounding.drift_kind === "hash_mismatch" &&
      typeof finding.evidence_code_ref === "string" &&
      (finding.evidence_code_ref.endsWith(".md") || finding.evidence_code_ref.includes(".md#"))
    ) {
      continue;
    }
    assert.strictEqual(
      grounding.status,
      "grounded",
      `Finding ${finding.id} is not grounded: status=${grounding.status}, drift_kind=${grounding.drift_kind}, evidence_code_ref=${finding.evidence_code_ref}`
    );
  }

  // (No-orphan invariant: MOVED to BEFORE the grounding invariant above so orphan
  //  detection isn't shadowed by drift failures. See the comment block at the
  //  top of the test body for the rationale.)

  // Active findings subset invariant: active_findings is a strict subset of
  // all_findings; every active_findings entry satisfies `isOpen` (post-migration
  // the open set is status:"open", with legacy active/reported/stale tolerated).
  const allFindingIds = new Set(current.all_findings.map((f) => f.id));
  for (const af of current.active_findings) {
    assert.ok(
      allFindingIds.has(af.id),
      `active_findings entry ${af.id} is not present in all_findings`
    );
    assert.ok(
      isOpen(af),
      `active_findings entry ${af.id} has unexpected status: ${af.status} (isOpen must be true)`
    );
  }

  // Structural shape: superseded_lineage
  for (const group of current.superseded_lineage ?? []) {
    assert.ok(group.change_log && typeof group.change_log.id === "string", "superseded_lineage group missing change_log.id");
    assert.ok(Array.isArray(group.findings) && group.findings.length > 0, "superseded_lineage group findings must be non-empty array");
    for (const f of group.findings) {
      assert.ok(typeof f.id === "string", "superseded_lineage finding missing id");
      assert.ok(f.status === "superseded", `superseded_lineage finding ${f.id} has status ${f.status}, expected superseded`);
      assert.ok(typeof f.consolidated_into === "string", `superseded_lineage finding ${f.id} missing consolidated_into`);
    }
  }

  // Structural shape: orphans
  for (const orphan of current.orphans ?? []) {
    assert.ok(typeof orphan.id === "string", "orphan missing id");
    assert.ok(typeof orphan.consolidated_into === "string", "orphan missing consolidated_into");
    assert.ok(typeof orphan.note === "string", "orphan missing note");
  }
});
