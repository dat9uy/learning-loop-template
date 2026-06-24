#!/usr/bin/env node
/**
 * Universal SessionStart hook — checks the gate decision log for recurring
 * false-positive patterns and auto-files findings.
 *
 * Works with both Claude Code and Droid CLI.
 */

import { readFileSync } from "node:fs";
import { checkAndEmit } from "../core/recurrence-tracker.js";
import { resolveRoot } from "#lib/resolve-root.js";

function main() {
  // SessionStart payloads are surface metadata; we do not need them.
  // Consume stdin to keep the hook protocol clean (otherwise the next stdin
  // reader inherits the payload). Intentionally ignored.
  readFileSync(0, "utf8");

  const root = resolveRoot();
  const result = checkAndEmit(root);
  console.error(`recurrence-check: checked ${result.checked_groups} group(s), emitted ${result.findings_emitted} finding(s)`);
  process.exit(0);
}

main();
