// Regression guard: every core-logic mutation operation that owns an
// agent-relevant invariant MUST reach an `assertinvariant(...)` call before
// it mutates the registry.
//
// This is the automated boundary-coverage check for the
// `rule-assertinvariant-at-boundary` agent-checklist rule. The rule is
// agent-enforced; this test pins the static invariant the agent relies on —
// that none of the five mutation surfaces drifts to an unwrapped state.
//
// The test reads `meta-state.js` source (not behavior). Static source read
// is intentional: the wrapper is a pre-state boundary check, so a behavioral
// test would need to reproduce a violation per op. The static guard is the
// honest, load-bearing assertion that the wrapping exists at all.
//
// Delegation: an op may call `assertinvariant` directly OR through a
// module-private `assertXxx` helper that itself wraps `assertinvariant`
// (e.g. `archiveEntry` → `assertNotArchived`). Both paths satisfy the rule
// because the pre-condition fires before the mutation. The test discovers
// those helpers dynamically and grounds each helper body too, so a helper
// losing its wrapper would also fail this guard.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "meta-state.js"), "utf8");

// The five mutation surfaces named by rule-assertinvariant-at-boundary.
// `acceptEntry` is added as a sixth — it owns an agent-relevant invariant
// (status flip open → accepted, with the "not already terminal"
// pre-condition).
const MUTATION_OPS = [
  "writeEntry",
  "updateEntry",
  "archiveEntry",
  "deleteEntry",
  "acceptEntry",
  "metaStateBatch",
];

/**
 * Extract a top-level function body by name. Captures from its declaration
 * line up to (but not including) the next top-level `export` or end of file.
 * Throws if the function is not found — a missing op is a stronger
 * regression than an unwrapped one and should fail loudly.
 *
 * Works for exported ops (`export function name`) and module-private helpers
 * (`async function name`).
 */
function functionBody(name) {
  const startRe = new RegExp(
    `^(?:export )?(?:async )?function\\*? ${name}\\b`,
    "m",
  );
  const startMatch = source.match(startRe);
  if (!startMatch) {
    throw new Error(`${name} not found in meta-state.js`);
  }
  const start = startMatch.index;
  const after = source.slice(start + startMatch[0].length);
  const nextExport = after.match(/\n(?:export |async function )/);
  const end = nextExport
    ? start + startMatch[0].length + nextExport.index
    : source.length;
  return source.slice(start, end);
}

// Discover module-private invariant helpers: any top-level `async function
// assertXxx` whose own body contains `assertinvariant(`. These are the
// delegation targets an op may use instead of calling assertinvariant
// directly.
const INVARIANT_HELPERS = [...source.matchAll(/^async function (\w+)\b/gm)]
  .map((m) => m[1])
  .filter((name) => /\bassertinvariant\(/.test(functionBody(name)));

describe("assertinvariant boundary coverage", () => {
  test("at least one module-private invariant helper is wired", () => {
    assert.ok(
      INVARIANT_HELPERS.length > 0,
      "expected module-private `async function assertXxx` helpers that wrap " +
        "assertinvariant; found none. Either an op must call assertinvariant " +
        "directly or via such a helper.",
    );
  });

  test("every discovered invariant helper wraps assertinvariant", () => {
    for (const helper of INVARIANT_HELPERS) {
      assert.match(
        functionBody(helper),
        /\bassertinvariant\(/,
        `helper ${helper} is referenced as an invariant wrapper but its body ` +
          "does not call assertinvariant(...).",
      );
    }
  });

  for (const op of MUTATION_OPS) {
    test(`${op} reaches an assertinvariant(...) check before mutating`, () => {
      const body = functionBody(op);
      const reachesDirect = /\bassertinvariant\(/.test(body);
      const reachesViaHelper = INVARIANT_HELPERS.some((helper) =>
        new RegExp(`\\b${helper}\\(`).test(body),
      );
      assert.ok(
        reachesDirect || reachesViaHelper,
        `${op} in core/meta-state.js must reach an assertinvariant(...) call ` +
          "(directly or via a module-private `assertXxx` helper) before " +
          "mutating — rule-assertinvariant-at-boundary requires every core " +
          "mutation op that owns an agent-relevant invariant to be wrapped.",
      );
    });
  }
});