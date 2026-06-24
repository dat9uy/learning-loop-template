import { describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SENTINEL = resolve(import.meta.dirname, ".cold-session-sentinel.json");
const FRESHNESS_DAYS = 3;

describe("cold-session freshness sentinel", () => {
  test("sentinel exists and is < 3 days old", () => {
    assert.ok(existsSync(SENTINEL),
      "Cold-session test has never been run. Run: pnpm test:cold-session");
    const data = JSON.parse(readFileSync(SENTINEL, "utf8"));
    const ageMs = Date.now() - new Date(data.last_pass_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    assert.ok(ageDays < FRESHNESS_DAYS,
      `Cold-session test is stale (${ageDays.toFixed(1)} days). Run: pnpm test:cold-session`);
    assert.ok(["droid", "claude", "deterministic"].includes(data.cli),
      `sentinel.cli must be "droid", "claude", or "deterministic", got ${data.cli}`);
  });
});
