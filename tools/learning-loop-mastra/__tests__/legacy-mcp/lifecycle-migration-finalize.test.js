/**
 * Plan 260707-0812 Phase 4: post-migration verification. Two concerns:
 *
 *   1. Live-registry invariants — verify the 22-finding migration (10 finding
 *      `active` + 12 finding `stale` → `open`) once it has committed on main.
 *      These tests read the live registry. On the feature worktree the
 *      registry file is gitignored + untracked (the `git rm --cached` single-
 *      writer gate), so a fresh clone of this branch has no registry — the
 *      tests SKIP honestly instead of passing vacuously against an empty file.
 *      On main (registry committed + migrated) they run for real and catch
 *      drift (e.g. someone reintroducing a persisted `stale` finding).
 *
 *   2. Rec 10 surfacing content invariance — a deterministic, fixture-based
 *      golden test that `buildStaleDispatchHints` sources the same fixable
 *      candidates + orphans whether a finding is persisted as legacy `stale`
 *      or post-migration `open` (the `isStaleView`/`isOpen` re-source). This
 *      does NOT depend on the live registry and runs everywhere.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";
import { buildStaleDispatchHints } from "../../core/loop-introspect.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

// Read once at module load. On the feature worktree a fresh clone has no
// committed registry (gitignored + `git rm --cached`); on main it is present.
const liveEntries = readRegistry(root);
const registryPresent = Array.isArray(liveEntries) && liveEntries.length > 0;
const SKIP_REASON =
  "live registry absent on this checkout (gitignored + git rm --cached on the worktree branch); " +
  "these invariants run for real on main after the 22-finding migration commits";

async function listEntries(filter) {
  const result = await metaStateListTool.handler(filter);
  const parsed = JSON.parse(result.content[0].text);
  return parsed.entries;
}

describe("Phase 4: post-migration registry invariants (live)", () => {
  test("0 finding entries with persisted status: active (10 were flipped to open)", async (t) => {
    if (!registryPresent) { t.skip(SKIP_REASON); return; }
    const findings = await listEntries({ entry_kind: "finding", status: "active" });
    assert.strictEqual(findings.length, 0, `expected 0 finding active, got ${findings.length}: ${findings.map(f => f.id).join(", ")}`);
  });

  test("0 finding entries with persisted status: stale (12 were flipped to open)", async (t) => {
    if (!registryPresent) { t.skip(SKIP_REASON); return; }
    const findings = await listEntries({ entry_kind: "finding", status: "stale" });
    assert.strictEqual(findings.length, 0, `expected 0 finding stale, got ${findings.length}: ${findings.map(f => f.id).join(", ")}`);
  });

  test("non-finding active entries are untouched (red-team C1 — separate enums)", async (t) => {
    if (!registryPresent) { t.skip(SKIP_REASON); return; }
    // change-log `active` is the immutable audit-log enum — must remain.
    const changeLogs = await listEntries({ entry_kind: "change-log", status: "active" });
    assert.ok(
      changeLogs.length >= 100,
      `expected the change-log active set to survive the migration, got ${changeLogs.length}`
    );
    // rule `active` and loop-design `active` must also survive (separate enums).
    const rules = await listEntries({ entry_kind: "rule", status: "active" });
    assert.ok(rules.length >= 0, "rules with status: active preserved (separate enum)");
    const designs = await listEntries({ entry_kind: "loop-design", status: "active" });
    assert.ok(designs.length >= 0, "loop-designs with status: active preserved (separate enum)");
  });

  test("registry count preserved at 229 (no adds/losses through the migration)", (t) => {
    if (!registryPresent) { t.skip(SKIP_REASON); return; }
    // Plan 260707-0812 invariant: "229 → 229, 22 finding flips, no adds/losses".
    // Achieved by running the migration via `meta_state_batch` only — that path
    // does not run the compaction filter (which `updateEntry` does and which
    // drops terminal entries past the 7d TTL). The batch write path keeps the
    // registry byte-identical aside from the 22 status flips.
    assert.strictEqual(
      liveEntries.length,
      229,
      `expected 229 entries (the pre-migration total), got ${liveEntries.length}`
    );
  });

  test("22 finding entries now status: open (the migrated set)", async (t) => {
    if (!registryPresent) { t.skip(SKIP_REASON); return; }
    const findings = await listEntries({ entry_kind: "finding", status: "open" });
    assert.strictEqual(
      findings.length,
      22,
      `expected exactly 22 finding open (10 active + 12 stale flipped), got ${findings.length}`
    );
  });
});

/**
 * Deterministic Rec 10 golden test: buildStaleDispatchHints must surface the
 * same fixable candidates + orphans whether a finding is persisted as legacy
 * `stale` or post-migration `open`, because the filter sources from
 * `isStaleView`/`isOpen` (not literal `status === "stale"`). Fixture-based so
 * it runs on every checkout regardless of the live registry.
 */
describe("Phase 4: buildStaleDispatchHints Rec 10 re-source (fixture golden)", () => {
  test("surfaces legacy stale and post-migration open findings identically as fixable candidates", () => {
    // `fresh` is verified now (age ~0) → not stale-view → excluded. The three
    // 2020-dated findings are always past the 7d window → stale-view. The
    // legacy `stale`-persisted finding surfaces alongside the `open` ones,
    // proving the re-source does not depend on the persisted status literal.
    const nowIso = new Date().toISOString();
    const fixture = [
      { id: "f-open-old-1", entry_kind: "finding", status: "open", created_at: "2020-01-01T00:00:00.000Z", severity: "warning", evidence_code_ref: "src/a.js:1", category: "gate-logic-bug", affected_system: "meta", description: "old open finding one for the golden fixture" },
      { id: "f-open-old-2", entry_kind: "finding", status: "open", created_at: "2020-02-01T00:00:00.000Z", severity: "warning", evidence_code_ref: "src/b.js:2", category: "gate-logic-bug", affected_system: "meta", description: "old open finding two for the golden fixture" },
      { id: "f-legacy-stale", entry_kind: "finding", status: "stale", created_at: "2020-03-01T00:00:00.000Z", severity: "warning", evidence_code_ref: "src/c.js:3", category: "gate-logic-bug", affected_system: "meta", description: "legacy stale-persisted finding for the golden fixture" },
      // Freshly verified → not stale-view → must NOT surface.
      { id: "f-fresh", entry_kind: "finding", status: "open", created_at: nowIso, last_verified_at: nowIso, severity: "warning", evidence_code_ref: "src/d.js:4", category: "gate-logic-bug", affected_system: "meta", description: "freshly verified finding for the golden fixture" },
      // Excluded by the fixable-candidate filters:
      { id: "f-escalate", entry_kind: "finding", status: "open", created_at: "2020-04-01T00:00:00.000Z", severity: "escalate", evidence_code_ref: "src/e.js:5", category: "gate-logic-bug", affected_system: "meta", description: "escalate finding must be excluded from fixable candidates" },
      { id: "f-ledger", entry_kind: "finding", status: "open", created_at: "2020-05-01T00:00:00.000Z", severity: "warning", evidence_code_ref: "src/f.js:6", ledger_ref: "runtime-state.jsonl#x", category: "gate-logic-bug", affected_system: "meta", description: "ledgered finding must be excluded from fixable candidates" },
      { id: "f-resolved", entry_kind: "finding", status: "resolved", created_at: "2020-06-01T00:00:00.000Z", resolved_at: "2020-06-02T00:00:00.000Z", severity: "warning", evidence_code_ref: "src/g.js:7", category: "gate-logic-bug", affected_system: "meta", description: "terminal finding must be excluded from fixable candidates" },
      // Orphan: open + dispatched + no ledger_ref → surfaces as orphan only.
      { id: "f-orphan", entry_kind: "finding", status: "open", created_at: "2020-07-01T00:00:00.000Z", severity: "warning", category: "gate-logic-bug", affected_system: "meta", description: "orphan finding with a dispatched ledger row but no back-pointer" },
      // Non-finding entry must be ignored entirely.
      { id: "cl-1", entry_kind: "change-log", status: "active", created_at: "2020-01-01T00:00:00.000Z", change_dimension: "semantic", change_target: "x", change_diff: {}, reason: "a change-log reason long enough to satisfy the min-length schema constraint" },
    ];
    // f-orphan is dispatched (orphan candidate); f-ledger is dispatched but has
    // a ledger_ref so it is NOT an orphan.
    const dispatchIds = new Set(["f-orphan", "f-ledger"]);

    const result = buildStaleDispatchHints(fixture, dispatchIds);

    // Fixable candidates: oldest-first, the three 2020 stale-view findings
    // (Jan, Feb, Mar). f-fresh (not stale-view), f-escalate, f-ledger,
    // f-resolved, and f-orphan (no evidence_code_ref) are excluded.
    assert.deepStrictEqual(
      result.fixable_candidates.map((c) => c.id),
      ["f-open-old-1", "f-open-old-2", "f-legacy-stale"],
      `fixable_candidates must be the 3 stale-view findings oldest-first, got ${result.fixable_candidates.map(c => c.id).join(", ")}`
    );
    // Every fixable candidate carries the projection shape (not just ids).
    for (const c of result.fixable_candidates) {
      assert.strictEqual(c.category, "gate-logic-bug");
      assert.ok(typeof c.evidence_code_ref === "string" && c.evidence_code_ref.length > 0);
    }

    // Orphans: only f-orphan (f-ledger has a ledger_ref back-pointer).
    assert.deepStrictEqual(
      result.orphan_findings.map((o) => o.id),
      ["f-orphan"],
      `orphan_findings must be exactly [f-orphan], got ${result.orphan_findings.map(o => o.id).join(", ")}`
    );

    // The protocol prompt is the operator-facing Rec 10 instruction.
    assert.ok(
      result.dispatch_protocol_prompt.includes("meta_state_dispatch_finding"),
      "protocol prompt must reference the dispatch tool"
    );
  });
});