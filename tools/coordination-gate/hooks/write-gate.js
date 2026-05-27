#!/usr/bin/env node
/**
 * Universal Write Gate — PreToolUse hook for Edit/Write/Create/ApplyPatch.
 *
 * Simplified: only protects records/ and product/. All other paths are allowed
 * (plans/, docs/, .claude/, .factory/, tools/, unknown paths).
 *
 * Works with both Claude Code and Droid CLI.
 * Imports all logic from coordination-gate/core (single source of truth).
 */

import { readFileSync } from "node:fs";
import { join, dirname, normalize as normalizePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  normalizeToolName,
  extractFilePath,
  formatOutput,
} from "./lib/protocol-adapter.js";
import {
  globMatch,
  findProjectRoot,
  inferSurface,
  readPreflightMarker,
} from "../core/gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function toRelative(filePath) {
  if (!filePath || typeof filePath !== "string") return filePath;
  const root = findProjectRoot();
  if (filePath.startsWith(root)) {
    return filePath.slice(root.length + 1);
  }
  return filePath.replace(/^\.\//, "");
}

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);

  // Only gate write operations
  const normalizedTool = normalizeToolName(input.tool_name);
  if (normalizedTool !== "write") {
    process.exit(0);
  }

  const filePath = extractFilePath(input.tool_input);
  if (!filePath) {
    process.exit(0);
  }

  const relPath = normalizePath(toRelative(filePath).replace(/^\.\//, ""));
  const root = findProjectRoot();

  // --- 1. records/** — always block (use MCP tools) ---
  if (globMatch("records/**", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      file_path: filePath,
      matched_rule: "records/**",
    }));
    process.exit(2);
  }

  // --- 2. schemas/** — always block (needs validation) ---
  if (globMatch("schemas/**", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Schema changes require validation. Run pnpm validate:records first, then approve.",
      file_path: filePath,
      matched_rule: "schemas/**",
    }));
    process.exit(2);
  }

  // --- 3. Build artifacts — always block ---
  if (
    globMatch("**/node_modules/**", relPath) ||
    globMatch("**/dist/**", relPath) ||
    globMatch("**/build/**", relPath)
  ) {
    console.log(formatOutput({
      decision: "block",
      reason: "Build artifacts are not git-tracked",
      file_path: filePath,
      matched_rule: "**/node_modules/**",
    }));
    process.exit(2);
  }

  // --- 4. Preflight markers — always block (only via MCP) ---
  if (
    globMatch(".claude/coordination/.loop-preflight-*", relPath) ||
    globMatch(".factory/coordination/.loop-preflight-*", relPath)
  ) {
    console.log(formatOutput({
      decision: "block",
      reason: "Preflight marker files can only be created via the mark_preflight_complete MCP tool. Direct writes are blocked.",
      file_path: filePath,
      matched_rule: ".claude/coordination/.loop-preflight-*",
    }));
    process.exit(2);
  }

  // --- 5. product/** — preflight check ---
  if (globMatch("product/**", relPath)) {
    const surface = inferSurface(relPath);
    if (surface) {
      let marker = null;
      for (const dir of [".claude", ".factory"]) {
        const coordDir = join(root, dir, "coordination");
        marker = readPreflightMarker(surface, coordDir);
        if (marker) break;
      }
      if (!marker) {
        console.log(formatOutput({
          decision: "block",
          reason: `Preflight check not completed for surface "${surface}". Use the mark_preflight_complete MCP tool after reviewing the checklist.`,
          file_path: filePath,
          matched_rule: "product/**",
          surface,
          preflight_checklist: [
            `1. Review the product-build plan for this surface`,
            `2. Verify decision records exist in records/${surface}/decisions/`,
            `3. Run and review any existing test suites`,
            `4. Confirm the change aligns with the approved architecture`,
            `5. Verify no schema-breaking changes without migration`,
            `6. Call mark_preflight_complete MCP tool for surface "${surface}"`,
          ],
        }));
        process.exit(2);
      }
    }
    process.exit(0);
  }

  // --- 6. Everything else (plans/, docs/, .claude/, .factory/, tools/, unknown) → allow ---
  process.exit(0);
}

main();
