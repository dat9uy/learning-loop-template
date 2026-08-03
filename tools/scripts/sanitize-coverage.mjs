#!/usr/bin/env node
/**
 * Sanitize Istanbul coverage for Fallow's `--coverage` input.
 *
 * Two negative-integer sources break Fallow's u32-strict parser
 * ("invalid value: integer `-N`, expected u32"):
 *
 *   1. Position fields: c8/V8 coverage sometimes lacks column data and emits
 *      `"column": -1` in `loc.start`/`loc.end` position objects.
 *   2. Hit counters: `@vitest/coverage-istanbul` emits negative branch hit
 *      counts (e.g. `"b":{"0":[-50,…]}`) for certain instrumented code shapes.
 *
 * This reads `coverage/coverage-final.json`, clamps every negative `line`/
 * `column` position field to `0`, then parses the JSON and clamps every
 * negative branch/statement/function hit counter (`b`/`s`/`f`) to `0`, and
 * writes the file back in place. Position fields are not consulted for CRAP
 * scoring; a hit counter of 0 means "not covered" — a conservative, parse-safe
 * interpretation of a bogus negative counter.
 *
 * Run after `vitest run` (see the `test` script in package.json).
 */
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../../coverage/coverage-final.json", import.meta.url);

let raw;
try {
  raw = readFileSync(PATH, "utf8");
} catch (err) {
  if (err.code === "ENOENT") {
    console.error("sanitize-coverage: coverage/coverage-final.json not found — run `pnpm test` first");
    process.exit(1);
  }
  throw err;
}

// Clamp negative position fields (case 1). These tokens are unambiguous in
// Istanbul JSON (position objects only ever appear as `"line":n`/`"column":n`).
const beforeCol = (raw.match(/"column":-\d+/g) || []).length;
const beforeLine = (raw.match(/"line":-\d+/g) || []).length;
raw = raw.replace(/"column":-\d+/g, '"column":0');
raw = raw.replace(/"line":-\d+/g, '"line":0');

// Clamp negative hit counters (case 2). Walks the parsed JSON and zeroes any
// negative number inside the `b` (branch), `s` (statement), and `f` (function)
// count maps. Hit-count maps are the only numeric arrays Istanbul emits besides
// position objects (already handled above), so this is targeted, not blanket.
const cov = JSON.parse(raw);
let negCounts = 0;
for (const fileData of Object.values(cov)) {
  for (const ctr of ["b", "s", "f"]) {
    const map = fileData[ctr];
    if (!map || typeof map !== "object") continue;
    for (const key of Object.keys(map)) {
      const val = map[key];
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          if (typeof val[i] === "number" && val[i] < 0) { val[i] = 0; negCounts++; }
        }
      } else if (typeof val === "number" && val < 0) {
        map[key] = 0; negCounts++;
      }
    }
  }
}

writeFileSync(PATH, JSON.stringify(cov));
console.log(`sanitize-coverage: clamped ${beforeCol} column(s) + ${beforeLine} line(s) + ${negCounts} negative hit-count(s) to 0`);