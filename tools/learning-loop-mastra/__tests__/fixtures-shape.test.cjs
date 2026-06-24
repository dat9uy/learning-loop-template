// Shape-diff test: catches drift between the production agents-manifest.json
// and the test fixture agents-manifest.test.json. The fixture is a hand-
// maintained clone of production with only the `model` field replaced with
// the `__MOCK_LLM__` marker. This test fails if a new field is added to
// production but the fixture is not updated in lockstep.
//
// Both files are read from disk on every run — no caching — so this test
// always reflects the current state of the repo.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const PROD = resolve(__dirname, "..", "agents-manifest.json");
const FIXTURE = resolve(__dirname, "fixtures", "agents-manifest.test.json");

// Per-agent entries: ignore `model` (replaced with __MOCK_LLM__ in the fixture).
const PER_AGENT_IGNORED_KEYS = new Set(["model"]);

function normalizeKeys(obj, ignoredKeys) {
  if (Array.isArray(obj)) return obj.map((o) => normalizeKeys(o, ignoredKeys));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj).sort()) {
      if (ignoredKeys.has(k)) continue;
      out[k] = normalizeKeys(obj[k], ignoredKeys);
    }
    return out;
  }
  return obj;
}

describe("agents-manifest fixture shape parity", () => {
  test("per-agent entries have the same shape (ignoring model field)", () => {
    const prod = JSON.parse(readFileSync(PROD, "utf8"));
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    // Compare only the .agents objects — the top-level description and
    // version are intentionally different (fixture is test-only).
    const a = JSON.stringify(normalizeKeys(prod.agents, PER_AGENT_IGNORED_KEYS));
    const b = JSON.stringify(normalizeKeys(fixture.agents, PER_AGENT_IGNORED_KEYS));
    assert.equal(
      a,
      b,
      `agents-manifest.test.json drifted from agents-manifest.json. ` +
        `Add the new field to the test fixture (with model: "__MOCK_LLM__" if it's a per-agent field) ` +
        `and update the source-of-truth note in the fixture header.`,
    );
  });

  test("test fixture has the same agent keys as production", () => {
    const prod = JSON.parse(readFileSync(PROD, "utf8"));
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const prodKeys = Object.keys(prod.agents).sort();
    const fixtureKeys = Object.keys(fixture.agents).sort();
    assert.deepEqual(
      fixtureKeys,
      prodKeys,
      `fixture agent keys differ from production. prod=${prodKeys.join(",")} fixture=${fixtureKeys.join(",")}`,
    );
  });

  test("test fixture uses __MOCK_LLM__ marker for all agents", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    for (const [key, entry] of Object.entries(fixture.agents)) {
      assert.equal(
        entry.model,
        "__MOCK_LLM__",
        `fixture agent "${key}" must use __MOCK_LLM__ marker; got ${entry.model}`,
      );
    }
  });
});