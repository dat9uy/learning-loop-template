#!/usr/bin/env node
/**
 * Universal Write Gate — PreToolUse hook for Edit/Write/Create/ApplyPatch.
 *
 * Works with both Claude Code and Droid CLI.
 * Imports all logic from coordination-gate/core (single source of truth).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, normalize as normalizePath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  normalizeToolName,
  extractFilePath,
  formatOutput,
  exitCode,
} from "./lib/protocol-adapter.js";
import {
  globMatch,
  findProjectRoot,
  extractFrontmatter,
  hasProductBuildTag,
  extractSurfaces,
  checkDecisionRecords,
  inferSurface,
  readPreflightMarker,
  writePreflightMarker,
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

  // All records/** writes go through MCP tools — block direct Edit/Write
  if (globMatch("records/**", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      file_path: filePath,
      matched_rule: "records/**",
    }));
    process.exit(2);
  }

  // Unconditional block for schemas
  if (globMatch("schemas/**", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Schema changes require validation. Run pnpm validate:records first, then approve.",
      file_path: filePath,
      matched_rule: "schemas/**",
    }));
    process.exit(2);
  }

  // Unconditional blocks for build artifacts
  if (globMatch("**/node_modules/**", relPath) || globMatch("**/dist/**", relPath) || globMatch("**/build/**", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Build artifacts are not git-tracked",
      file_path: filePath,
      matched_rule: "**/node_modules/**",
    }));
    process.exit(2);
  }

  // Artifact-aware gate: plan content scanning
  if (globMatch("plans/**/plan.md", relPath)) {
    const fullPath = join(root, relPath);
    if (existsSync(fullPath)) {
      process.exit(0);
    }

    const content = (input.tool_input?.content || "").slice(0, 2048);
    const frontmatter = extractFrontmatter(content);
    if (frontmatter && hasProductBuildTag(frontmatter)) {
      const surfaces = extractSurfaces(frontmatter);
      const recordsDir = join(root, "records");
      const { missing } = checkDecisionRecords(surfaces, recordsDir);
      if (missing.length > 0) {
        console.log(formatOutput({
          decision: "block",
          reason: `Missing decision records for surfaces: ${missing.join(", ")}. Create records/<surface>/decisions/*.yaml before product-build plans.`,
          file_path: filePath,
          matched_rule: "plans/**/plan.md",
          missing_surfaces: missing,
        }));
        process.exit(2);
      }
    }
    process.exit(0);
  }

  // Preflight marker write protection
  if (globMatch(".claude/coordination/.loop-preflight-*", relPath) || globMatch(".factory/coordination/.loop-preflight-*", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Preflight marker files can only be created via the mark_preflight_complete MCP tool. Direct writes are blocked.",
      file_path: filePath,
      matched_rule: ".claude/coordination/.loop-preflight-*",
    }));
    process.exit(2);
  }

  // Artifact-aware gate: product code preflight check
  if (globMatch("product/**", relPath)) {
    const surface = inferSurface(relPath);
    if (surface) {
      const coordDir = join(root, ".claude", "coordination");
      const marker = readPreflightMarker(surface, coordDir);
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

  if (globMatch("docs/journals/**", relPath)) {
    process.exit(0);
  }

  // Allowed domains
  if (globMatch("docs/**", relPath) || globMatch("plans/**", relPath) || globMatch(".claude/**", relPath) || globMatch(".factory/**", relPath) || globMatch("product/**", relPath) || globMatch("tools/**", relPath)) {
    process.exit(0);
  }

  // Single-segment unknown files -> allow
  if (globMatch("*", relPath)) {
    process.exit(0);
  }

  // Multi-segment catch-all -> block
  if (globMatch("**", relPath)) {
    console.log(formatOutput({
      decision: "block",
      reason: "Unknown path. Only write to known domains.",
      file_path: filePath,
      matched_rule: "**",
    }));
    process.exit(2);
  }

  process.exit(0);
}

main();
