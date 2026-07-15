/**
 * In-process unit tests for the SessionStart discoverability hook's pure
 * helpers (`computeDegradedSources`, `formatSessionSummary`).
 *
 * The existing `session-start-inject-discoverability.test.cjs` drives the hook
 * via `spawn("node", [HOOK_PATH])`, which exercises behavior end-to-end but
 * cannot attribute coverage into the child process. These tests `require` the
 * module directly (the `require.main === module` guard keeps `main` from
 * running on import) so the degraded-source classification and summary
 * formatting are pinned by assertions. The extraction also drops `main`'s
 * cyclomatic complexity below the point where 0-coverage CRAP trips fallow's
 * threshold.
 */

const assert = require("node:assert/strict");
// `test` / `describe` come from vitest globals (config: globals: true) — CJS
// tests cannot `require("vitest")`.
const {
  computeDegradedSources,
  formatSessionSummary,
  buildContextPayload,
} = require("../../hooks/universal/session-start-inject-discoverability.cjs");

const CORE_OK = {
  discoverability_hints_source: "core",
  process_hints_source: "core",
  discoverability_hints: ["h1"],
  process_hints: ["p1"],
};
const REGISTRY_OK = { registry_source: "core" };

describe("computeDegradedSources", () => {
  test("no degraded loaders -> empty", () => {
    assert.deepEqual(computeDegradedSources(CORE_OK, REGISTRY_OK), []);
  });
  test("discoverability fallback surfaced", () => {
    assert.deepEqual(
      computeDegradedSources({ ...CORE_OK, discoverability_hints_source: "fallback" }, REGISTRY_OK),
      ["discoverability_hints"],
    );
  });
  test("process fallback surfaced", () => {
    assert.deepEqual(
      computeDegradedSources({ ...CORE_OK, process_hints_source: "fallback" }, REGISTRY_OK),
      ["process_hints"],
    );
  });
  test("registry fallback surfaced", () => {
    assert.deepEqual(computeDegradedSources(CORE_OK, { registry_source: "fallback" }), ["registry"]);
  });
  test("all three degraded -> ordered list", () => {
    assert.deepEqual(
      computeDegradedSources(
        { ...CORE_OK, discoverability_hints_source: "fallback", process_hints_source: "fallback" },
        { registry_source: "fallback" },
      ),
      ["discoverability_hints", "process_hints", "registry"],
    );
  });
});

describe("formatSessionSummary", () => {
  test("includes per-loader counts and sidecar path", () => {
    const stale = { fixable_candidates: [1, 2, 3] };
    const gap = { gap_candidates: [1] };
    const line = formatSessionSummary(CORE_OK, stale, gap, "/tmp/ctx.json");
    assert.equal(
      line,
      "[session-start] wrote 1 discoverability + 1 process + 3 stale-dispatch + 1 change-log-gap hints to /tmp/ctx.json",
    );
  });
});

describe("buildContextPayload", () => {
  const stale = { fixable_candidates: [] };
  const gap = { gap_candidates: [] };

  test("happy-path loader results carry *_source=core and null errors", () => {
    const payload = buildContextPayload(CORE_OK, REGISTRY_OK, stale, gap, "2026-07-15T00:00:00.000Z");
    assert.equal(payload.discoverability_hints_source, "core");
    assert.equal(payload.process_hints_source, "core");
    assert.equal(payload.registry_source, "core");
    assert.equal(payload.discoverability_hints_error, null);
    assert.equal(payload.process_hints_error, null);
    assert.equal(payload.registry_error, null);
    assert.equal(payload.injected_at, "2026-07-15T00:00:00.000Z");
    assert.equal(payload.stale_dispatch_hints, stale);
    assert.equal(payload.change_log_gap_hints, gap);
  });
  test("degraded loader results carry the error message through", () => {
    const core = { ...CORE_OK, discoverability_hints_source: "fallback", discoverability_hints_error: "boom" };
    const registry = { registry_source: "fallback", registry_error: "reg-boom" };
    const payload = buildContextPayload(core, registry, stale, gap, "t");
    assert.equal(payload.discoverability_hints_error, "boom");
    assert.equal(payload.registry_error, "reg-boom");
  });
});