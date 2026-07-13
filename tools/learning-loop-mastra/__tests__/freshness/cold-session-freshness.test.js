// Cold-session freshness gate.
//
// This is a TIME-BASED maintenance check, NOT a code-regression test: it fails
// when `pnpm test:cold-session` hasn't run in the last 3 days. It deliberately
// lives outside the regression suite (`pnpm test`) so a calendar-age failure
// is not mistaken for a code regression — and so `git restore` cannot re-stale
// the committed sentinel (the sentinel is gitignored local state, re-created by
// `pnpm test:cold-session`). Run explicitly via `pnpm check:freshness`.
//
// Failure modes (neither implies a code regression):
//   - "never been run"  — no sentinel file; run `pnpm test:cold-session`.
//   - "stale (>3 days)" — sentinel exists but is old; run `pnpm test:cold-session`.

import { describe, test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Written by cold-session-discoverability.test.cjs in legacy-mcp/.
const SENTINEL = resolve(import.meta.dirname, "../legacy-mcp/.cold-session-sentinel.json");
const FRESHNESS_DAYS = 3;

describe("cold-session freshness sentinel", () => {
  test("sentinel exists and is < 3 days old", () => {
    assert.ok(existsSync(SENTINEL),
      "Cold-session probe has never been run in this checkout. Run: pnpm test:cold-session (freshness gate, not a regression failure).");
    const data = JSON.parse(readFileSync(SENTINEL, "utf8"));
    const ageMs = Date.now() - new Date(data.last_pass_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    assert.ok(ageDays < FRESHNESS_DAYS,
      `Cold-session probe is stale (${ageDays.toFixed(1)} days since last run). Run: pnpm test:cold-session (freshness gate, not a regression failure).`);
    assert.ok(["droid", "claude", "deterministic"].includes(data.cli),
      `sentinel.cli must be "droid", "claude", or "deterministic", got ${data.cli}`);
  });
});