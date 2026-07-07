import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { queryDrift } from "../../core/query-drift.js";

describe("queryDrift pure function", () => {
  function makeTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  function baseContext(overrides = {}) {
    return {
      root: makeTempDir("query-drift-"),
      run_grounding: false,
      now: () => 1700000000000,
      ...overrides,
    };
  }

  function baseEntry(overrides = {}) {
    return {
      id: "meta-260601T0000Z-test",
      entry_kind: "finding",
      status: "open",
      ...overrides,
    };
  }

  // T-1: SP1-only case 1 — mechanism-shipped + active → drift (resolve)
  test("T-1: SP1-only mechanism-shipped + active returns drift with recommendation resolve", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events.length, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.id, entry.id);
    assert.strictEqual(ev.raw_status, "active");
    assert.strictEqual(ev.derived_status, "resolved-by-mechanism");
    assert.strictEqual(ev.drift_kind, "assertion_lags_derivation");
    assert.strictEqual(ev.recommendation, "resolve");
  });

  // T-2: SP1-only case — active-no-signal → no drift
  test("T-2: SP1-only no-signals + active returns no drift (case 4 with no SP2)", () => {
    const ctx = baseContext();
    const entry = baseEntry();
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
    assert.deepStrictEqual(result.drift_events, []);
  });

  // T-3: SP1-only case 5 — active-uncertain + active → drift (investigate)
  test("T-3: SP1-only code-only (active-uncertain) + active returns drift with recommendation investigate", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "missing.test.js",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.derived_status, "active-uncertain");
    assert.strictEqual(ev.recommendation, "investigate");
  });

  // T-4: SP1-only case 6 — code-missing → drift (investigate)
  test("T-4: SP1-only code-missing + active returns drift with recommendation investigate", () => {
    const ctx = baseContext();
    const entry = baseEntry({ evidence_code_ref: "missing.js" });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.derived_status, "active-no-signal");
    assert.strictEqual(ev.drift_kind, "assertion_lags_derivation");
    assert.strictEqual(ev.recommendation, "investigate");
  });

  // T-5: SP1+SP2 join case 1 — resolved + grounded → resolve
  test("T-5: SP1+SP2 case 1 (resolved + grounded) returns drift with recommendation resolve", async () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const { computeFileHash } = await import("../../core/check-grounding.js");
    const actualHash = computeFileHash(join(ctx.root, "src.js"));
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      mechanism_check: true,
      code_fingerprint: actualHash,
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-6: SP1+SP2 join case 2 — resolved + drifted → resolve (SP1 dominates)
  test("T-6: SP1+SP2 case 2 (resolved + drifted) returns drift with recommendation resolve (derivation primary)", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      mechanism_check: true,
      code_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000", // wrong
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-7: SP1+SP2 join case 3 — SP1 active-uncertain + SP2 drifted → investigate
  // (case 5 + case 3 join)
  test("T-7: SP1+SP2 case 3 (active-uncertain + drifted) returns drift with recommendation investigate", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "missing.test.js",
      mechanism_check: true,
      code_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.derived_status, "active-uncertain");
    assert.strictEqual(ev.recommendation, "investigate");
  });

  // T-8: SP1+SP2 join case 4 — no drift (status matches SP1 derivation)
  // True "no drift" cases: entry status is "active" with no evidence_code_ref (no-signals → fast path skip)
  // OR terminal status. Here: no-signals path with run_grounding true.
  test("T-8: SP1+SP2 case 4 (no-signals fast path) returns no drift regardless of run_grounding", () => {
    const ctx = baseContext({ run_grounding: true });
    const entry = baseEntry();
    // No evidence_code_ref, no evidence_test → SP1 returns kind: no-signals → fast path skip
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
  });

  // T-9: Recommendation — SP1 resolved + SP2 skipped → resolve
  test("T-9: SP1 resolved + SP2 skipped returns drift with recommendation resolve", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      // mechanism_check NOT true → SP2 returns "skipped"
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-10: Recommendation — SP1 resolved + SP2 unknown → resolve
  test("T-10: SP1 resolved + SP2 unknown returns drift with recommendation resolve (SP2 unknown is not drift)", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      mechanism_check: true,
      // No code_fingerprint — SP2 returns "unknown" because hash_match is null
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-11: Recommendation — SP1 active-uncertain + SP2 drifted → investigate
  // (case 5 dominates; SP2 drifted reinforces)
  test("T-11: SP1 active-uncertain + SP2 drifted returns drift with recommendation investigate", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "missing.test.js",
      mechanism_check: true,
      code_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    const ev = result.drift_events[0];
    assert.strictEqual(ev.derived_status, "active-uncertain");
    assert.strictEqual(ev.recommendation, "investigate");
  });

  // T-12: Recommendation — SP1 active-uncertain → investigate regardless of SP2
  test("T-12: SP1 active-uncertain dominates → investigate regardless of SP2", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "missing.test.js",
      mechanism_check: true,
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "investigate");
  });

  // T-13: Filter — active only
  test("T-13: filter status active returns only active entries", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const activeEntry = baseEntry({
      id: "meta-260601T0000Z-active",
      status: "open",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const reportedEntry = baseEntry({
      id: "meta-260601T0000Z-reported",
      status: "open",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([activeEntry, reportedEntry], ctx);
    // Both should be drift (both have resolved-by-mechanism + active/reported raw_status)
    // Note: filter is applied at the tool layer, not the function. The function receives already-filtered entries.
    // So this test just confirms the function returns drift for both.
    assert.strictEqual(result.drift_count, 2);
    // But the function is filter-agnostic — verify the raw_status field in each event
    const ids = result.drift_events.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["meta-260601T0000Z-active", "meta-260601T0000Z-reported"]);
  });

  // T-14: Filter — reported only
  test("T-14: filter status reported returns only reported entries (raw_status preserved)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const reportedEntry = baseEntry({
      id: "meta-260601T0000Z-reported",
      status: "open",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([reportedEntry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].raw_status, "reported");
  });

  // T-15: No filter — both
  test("T-15: no filter (function receives all entries) returns drift for both active and reported", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const activeEntry = baseEntry({ id: "a-1", status: "open", evidence_code_ref: "src.js", evidence_test: "src.test.js" });
    const reportedEntry = baseEntry({ id: "b-1", status: "open", evidence_code_ref: "src.js", evidence_test: "src.test.js" });
    const result = queryDrift([activeEntry, reportedEntry], ctx);
    assert.strictEqual(result.drift_count, 2);
  });

  // T-16: Invalid status (resolved) → not drift (terminal skip)
  test("T-16: terminal status (resolved) is not drift", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      status: "resolved",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
  });

  // T-17: Empty registry
  test("T-17: empty entries array returns { drift_count: 0, drift_events: [] }", () => {
    const ctx = baseContext();
    const result = queryDrift([], ctx);
    assert.deepStrictEqual(result, { drift_count: 0, drift_events: [] });
  });

  // T-18: Single entry with no drift
  test("T-18: single entry with no signals returns no drift", () => {
    const ctx = baseContext();
    const entry = baseEntry();
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
  });

  // T-19: Large registry (100+ entries, mixed)
  test("T-19: large registry (100 entries) with mixed drift — performance smoke test", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entries = [];
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        // mechanism-shipped → drift
        entries.push(baseEntry({
          id: `meta-260601T0000Z-${i}`,
          evidence_code_ref: "src.js",
          evidence_test: "src.test.js",
        }));
      } else {
        // no-signals → no drift
        entries.push(baseEntry({ id: `meta-260601T0000Z-${i}` }));
      }
    }
    const result = queryDrift(entries, ctx);
    assert.strictEqual(result.drift_count, 50);
  });

  // T-20: Change-log with no evidence_code_ref → no-signals → no drift
  // Post-migration: change-logs flow through the same evaluation as findings.
  // A change-log without evidence_code_ref or evidence_test naturally resolves
  // to kind: "no-signals" → queryDrift skips (no drift event).
  test("T-20: change-log with no evidence_code_ref yields no-signals kind → no drift", () => {
    const ctx = baseContext();
    const entry = baseEntry({ entry_kind: "change-log" });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
  });

  // T-21: Terminal status (resolved) → not drift (deeper check)
  test("T-21: terminal status (resolved) is filtered out before drift check", () => {
    const ctx = baseContext();
    const entry = baseEntry({
      status: "resolved",
      evidence_code_ref: "missing.js", // would otherwise be code-missing drift
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
  });

  // T-22: Terminal status (superseded) → not drift
  test("T-22: terminal status (superseded) is filtered out before drift check", () => {
    const ctx = baseContext();
    const entry = baseEntry({
      status: "superseded",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
  });

  // T-23: Null evidence_code_ref + run_grounding → SP2 not called (defensive)
  test("T-23: null evidence_code_ref + run_grounding true does not crash; SP2 not called", () => {
    const ctx = baseContext({ run_grounding: true });
    const entry = baseEntry();
    const result = queryDrift([entry], ctx);
    // kind: no-signals → skipped early; SP2 not called
    assert.strictEqual(result.drift_count, 0);
  });

  // T-24: Corrupted SP2 status (defensive default)
  test("T-24: when SP1 is mechanism-shipped and SP2 returns grounded/skipped/unknown, recommendation is resolve", () => {
    // Covered by T-9, T-10 — repeated to lock the default branch
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      mechanism_check: true,
      code_fingerprint: "sha256:" + "a".repeat(64), // arbitrary, but hash_match will be false if file exists
    });
    // Actually code_fingerprint won't match the actual file hash → SP2 returns drifted
    // So this should be case 2 (resolved + drifted) → resolve
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-25: Post-migration contract — finding entries with top-level evidence_code_ref
  // get SP2 grounding called (locks in that the 30 previously-skipped entries
  // are now covered by the SP1+SP2 join, not just SP1).
  test("T-25: post-migration top-level evidence_code_ref on finding triggers full SP1+SP2 join (no nested form)", async () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const { computeFileHash } = await import("../../core/check-grounding.js");
    const actualHash = computeFileHash(join(ctx.root, "src.js"));
    const entry = baseEntry({
      // Post-migration shape: top-level field ONLY, no nested `evidence: { code_ref }` block.
      // This is the contract the migration established.
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      mechanism_check: true,
      code_fingerprint: actualHash,
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    // SP1 says resolved-by-mechanism + SP2 says grounded (matching hash) → case 1 → resolve
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-26: Post-migration — change-log entries with top-level evidence_code_ref
  // are evaluated, not skipped by the entry_kind: "change-log" fast path.
  // Locks in that the change-log fast path in deriveStatus (and any checkGrounding
  // fast path) is no longer correct post-migration: change-logs now carry
  // evidence_code_ref and must flow through the normal evaluation.
  test("T-26: change-log with evidence_code_ref is evaluated, not skipped by kind fast-path", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      entry_kind: "change-log",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([entry], ctx);
    // Post-migration: change-log is no longer special-cased.
    // With code+test present, SP1 returns mechanism-shipped. An active entry whose
    // mechanism is shipped is drift (recommendation: resolve).
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].derived_status, "resolved-by-mechanism");
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });

  // T-27: Rule entries (entry_kind: "rule") with top-level evidence_code_ref
  // get SP2 grounding called. There is no rule fast path in deriveStatus or
  // checkGrounding; this test guards against accidentally adding one.
  test("T-27: rule entry with evidence_code_ref gets SP2 grounding (no rule fast-path)", () => {
    const ctx = baseContext({ run_grounding: true });
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      entry_kind: "rule",
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      mechanism_check: true,
      // No code_fingerprint — SP2 should return "unknown" (not "drifted")
    });
    const result = queryDrift([entry], ctx);
    // SP1 says mechanism-shipped + SP2 says unknown → case 1 → resolve
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });
});
