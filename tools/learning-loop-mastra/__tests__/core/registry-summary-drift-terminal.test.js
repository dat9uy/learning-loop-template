/**
 * Regression-prevention test: `registry_summary.drift` must exclude terminal
 * findings (resolved, superseded, accepted, archived).
 *
 * Prior behavior: `computeDriftEntries` (core/loop-introspect.js) filtered
 * only `e.status !== "resolved"`, so an `archived` (or `superseded`/`accepted`)
 * finding still surfaced in the warm-tier drift summary. Since the summary is
 * capped at the 5 most-recent entries, a freshly archived finding occupied a
 * top-5 slot and read as an active drift candidate to warm/cold-session
 * consumers, even though the finding is terminal.
 *
 * Invariant under test: `registry_summary.drift` contains only open (isOpen)
 * mechanism_check findings. The `isOpen` predicate is the canonical open-set
 * source (core/stale-view.js → core/constants.js), covering the post-collapse
 * enum {open, resolved, accepted, archived} plus legacy tolerance — the same
 * predicate the rest of loop-introspect uses for active/terminal bucketing.
 */

import { test } from "vitest";
import assert from "node:assert";
import { buildRegistrySummary } from "../../core/loop-introspect.js";

function makeFinding(id, overrides = {}) {
  return {
    id,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "meta",
    description: "registry-summary drift terminal-status regression fixture.",
    mechanism_check: true,
    ...overrides,
  };
}

test("registry_summary.drift excludes archived findings", () => {
  const entries = [
    makeFinding("meta-archived", { status: "archived", created_at: "2026-08-10T00:00:00.000Z" }),
    makeFinding("meta-open", { status: "open", created_at: "2026-08-09T00:00:00.000Z" }),
  ];
  const summary = buildRegistrySummary(entries, undefined);
  const driftIds = summary.drift.map((d) => d.id);
  assert.ok(driftIds.includes("meta-open"), "open finding must appear in drift");
  assert.ok(!driftIds.includes("meta-archived"), "archived finding must NOT appear in drift");
});

test("registry_summary.drift excludes resolved, superseded, and accepted findings", () => {
  const entries = [
    makeFinding("meta-resolved", { status: "resolved", created_at: "2026-08-10T00:00:00.000Z" }),
    makeFinding("meta-superseded", { status: "superseded", created_at: "2026-08-09T00:00:00.000Z" }),
    makeFinding("meta-accepted", { status: "accepted", created_at: "2026-08-08T00:00:00.000Z" }),
    makeFinding("meta-open", { status: "open", created_at: "2026-08-07T00:00:00.000Z" }),
  ];
  const summary = buildRegistrySummary(entries, undefined);
  const driftIds = summary.drift.map((d) => d.id);
  assert.deepStrictEqual(driftIds, ["meta-open"], "only the open finding should drift");
});

test("registry_summary.drift excludes mechanism_check false findings", () => {
  const entries = [
    makeFinding("meta-no-mc", { status: "open", mechanism_check: false, created_at: "2026-08-10T00:00:00.000Z" }),
  ];
  const summary = buildRegistrySummary(entries, undefined);
  assert.strictEqual(summary.drift.length, 0, "mechanism_check=false must not drift");
});
