#!/usr/bin/env node
/**
 * Universal Bash Gate — PreToolUse hook for Bash/Execute commands.
 *
 * Works with both Claude Code and Droid CLI.
 * Imports all logic from learning-loop-mcp/core (single source of truth).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  normalizeToolName,
  extractCommand,
  formatOutput,
  exitCode,
} from "./lib/protocol-adapter.js";
import {
  matchConstraintPattern,
  checkObservationExists,
  makeGateDecision,
  loadPromotedRules,
  applyPromotedRules,
} from "#mcp/core/gate-logic.js";
import { readRuntimeObservations } from "#mcp/core/file-readers.js";
import { checkObservationStaleness } from "#mcp/core/inbound-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path-write detection patterns (bash-specific)
const PATH_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  /<<['"]?\w+['"]?\s*>\s*["']?\.?\/?records\//,
  /\btee\b.*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?\.factory\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  /\btee\b.*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  /\btee\b.*["']?\.?\/?\.factory\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?meta-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?meta-state\.jsonl["']?/,
  />{1,2}\s*["']?\.?\/?runtime-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?runtime-state\.jsonl["']?/,
];

function commandWritesToRecords(command) {
  if (!command || typeof command !== "string") return false;
  return PATH_WRITE_PATTERNS.some((p) => p.test(command));
}

// fallow-ignore-next-line complexity
function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);

  // Only gate bash/execute commands
  const normalizedTool = normalizeToolName(input.tool_name);
  if (normalizedTool !== "bash") {
    process.exit(0);
  }

  const command = extractCommand(input.tool_input);
  if (!command) {
    process.exit(0);
  }

  const root = resolveRoot();

  let constraintResult = null;
  let pathResult = null;

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(command);
  if (constraintMatch) {
    const observations = readRuntimeObservations(root);
    const observationStatus = checkObservationExists(constraintMatch, observations);

    constraintResult = makeGateDecision(constraintMatch, observationStatus);

    // Staleness check for non-hard-block decisions
    if (!constraintResult.hard_block) {
      const staleness = checkObservationStaleness(observations, root);
      if (staleness.stale) {
        constraintResult.inbound_gate = true;
        if (constraintResult.decision === "ok") {
          constraintResult.decision = "escalate";
          constraintResult.reason = staleness.reason;
          constraintResult.observation_id = staleness.observation_id;
        }
      }
    }
  }

  // --- Path-write detection: ALL records/** blocked ---
  if (commandWritesToRecords(command)) {
    pathResult = {
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      hard_block: true,
    };
  }

  // --- Promoted rules check (meta-state as rule registry) ---
  const promotedRules = loadPromotedRules(root);
  const promotedCheck = applyPromotedRules(command, null, promotedRules);
  if (promotedCheck.decision === "escalate") {
    console.log(formatOutput(promotedCheck));
    process.exit(exitCode(promotedCheck));
  }

  // --- Combine results ---
  let decision;
  if (constraintResult?.hard_block || pathResult?.hard_block) {
    decision = constraintResult?.hard_block ? constraintResult : pathResult;
  } else if (constraintResult && constraintResult.decision !== "ok") {
    decision = constraintResult;
  } else if (pathResult) {
    decision = pathResult;
  } else {
    process.exit(0);
  }

  console.log(formatOutput(decision));
  process.exit(exitCode(decision));
}

main();
