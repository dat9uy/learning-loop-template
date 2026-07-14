/**
 * Cold-source coverage test: every active consult-checklist rule must have a
 * matching PROCESS_HINTS row.
 *
 * The H6 ordering gate (loop-describe-tool.js:94-106) performs the same check
 * at `loop_describe({tier: warm})` time, but (1) it only emits a transient
 * warning and (2) the running MCP server caches `loop-introspect.js` at
 * startup, so a row appended mid-session does not surface until restart. A
 * contributor who promotes a consult-checklist rule and forgets the
 * PROCESS_HINTS row would see the H6 warning only intermittently.
 *
 * This test reads the source-of-truth state directly (the registry file +
 * `buildProcessHints()`), bypassing the runtime module cache, so the
 * invariant is enforced on every test run. It is the durable cold-session
 * counterpart to the H6 runtime gate.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "vitest";
import { loadPromotedRules } from "../../core/gate-logic.js";
import { buildProcessHints } from "../../core/loop-introspect.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

test("every active consult-checklist rule has a matching PROCESS_HINTS row (H6 cold-source guard)", () => {
  const rules = loadPromotedRules(PROJECT_ROOT);
  const consultChecklistRules = rules.filter(
    (r) => r.pattern_type === "consult-checklist",
  );

  // Sanity: the registry has at least one consult-checklist rule, otherwise
  // this test would pass vacuously and stop guarding the invariant.
  assert.ok(
    consultChecklistRules.length > 0,
    "Registry must have at least one active consult-checklist rule for this test to be meaningful.",
  );

  const processHints = buildProcessHints();
  assert.ok(processHints.length > 0, "PROCESS_HINTS must be non-empty.");

  // H6 uses substring match: processHints.some((h) => h.includes(rule.id)).
  // Mirror that exactly so the test fails iff the runtime gate would fire.
  const missing = consultChecklistRules.filter(
    (r) => !processHints.some((row) => row.includes(r.id)),
  );

  assert.deepStrictEqual(
    missing,
    [],
    `Each consult-checklist rule must appear as a substring in some PROCESS_HINTS row. ` +
      `Rules without a row (would trigger H6): ${missing.map((r) => r.id).join(", ")}.`,
  );
});