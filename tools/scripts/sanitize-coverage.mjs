#!/usr/bin/env node
/**
 * Sanitize c8 Istanbul coverage for Fallow's `--coverage` input.
 *
 * c8 derives coverage from V8's native coverage, which sometimes lacks column
 * data and emits `"column": -1` in `loc.start`/`loc.end` position objects.
 * Fallow's Istanbul parser rejects negative integers (it expects u32), so a
 * raw c8 `coverage-final.json` fails with:
 *   "invalid value: integer `-1`, expected u32"
 *
 * This reads `coverage/coverage-final.json`, clamps every negative `line` or
 * `column` position field to `0`, and writes the file back in place. Position
 * fields are not consulted for CRAP scoring (only statement/function/branch
 * hit counts are), so clamping is safe and lossless for Fallow's purpose.
 *
 * Run after `c8 --reporter=json ...` (see the `test` script in package.json).
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

// Clamp negative position fields. c8 only emits -1 for `column`; `line` is
// matched too as a defensive belt-and-suspenders. These tokens are unambiguous
// in Istanbul JSON (position objects only ever appear as `"line":n`/`"column":n`).
const beforeCol = (raw.match(/"column":-\d+/g) || []).length;
const beforeLine = (raw.match(/"line":-\d+/g) || []).length;
raw = raw.replace(/"column":-\d+/g, '"column":0');
raw = raw.replace(/"line":-\d+/g, '"line":0');

writeFileSync(PATH, raw);
console.log(`sanitize-coverage: clamped ${beforeCol} column(s) + ${beforeLine} line(s) to 0`);