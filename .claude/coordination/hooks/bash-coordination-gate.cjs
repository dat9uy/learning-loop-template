#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { matchConstraintPattern, readObservations, checkObservationStaleness, findProjectRoot } = require('./lib/gate-utils.cjs');

const PATH_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  /<<['"]?\w+['"]?\s*>\s*["']?\.?\/?records\//,
  /\btee\b.*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  /\btee\b.*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
];

function commandWritesToRecords(command) {
  if (!command || typeof command !== 'string') return false;
  for (const pattern of PATH_WRITE_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  return false;
}

function readBudgets(observationsDir) {
  try {
    const files = fs.readdirSync(observationsDir).filter(f => f.endsWith('-resource-budget.yaml'));
    const budgets = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(observationsDir, file), 'utf8');
        const parsed = yaml.parse(content, { uniqueKeys: false });
        if (parsed && typeof parsed === 'object') budgets.push(parsed);
      } catch (err) {
        console.error(`bash-gate: failed to parse budget ${file}: ${err.message}`);
      }
    }
    return budgets;
  } catch {
    return [];
  }
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }

  // Only gate Bash
  if (input.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = input.tool_input?.command;
  if (!command || typeof command !== 'string') {
    process.exit(0);
  }

  const coordDir = path.join(__dirname, '..');
  const root = findProjectRoot();
  const obsDir = path.join(root, 'records', 'observations');

  let constraintResult = null;
  let pathResult = null;

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(command);
  if (constraintMatch) {
    // Side-effect imports always block
    if (constraintMatch === 'side-effect-import') {
      constraintResult = {
        decision: 'block',
        reason: 'Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.',
        constraint_type: constraintMatch,
        hard_block: true,
        command,
      };
    } else {
      // Budget check
      const budgets = readBudgets(obsDir);
      for (const budget of budgets) {
        const current = budget.current ?? 0;
        const limit = budget.budget ?? 0;
        const exhausted = current >= limit;
        const windowActive = budget.validation_window?.active === true;
        if (exhausted || windowActive) {
          constraintResult = {
            decision: 'escalate',
            reason: exhausted
              ? `Budget exhausted for constraint "${constraintMatch}".`
              : `Validation window active for constraint "${constraintMatch}".`,
            constraint_type: constraintMatch,
          };
          break;
        }
      }

      if (!constraintResult) {
        // Observation check
        const observations = readObservations(obsDir);
        const hasObservation = observations.some(
          obs => obs.status === 'active' &&
            (obs.constraint_type === constraintMatch || obs.constraint === constraintMatch)
        );

        if (!hasObservation) {
          constraintResult = {
            decision: 'block',
            reason: `Constraint "${constraintMatch}" detected in command. No active observation found. Record an observation via the constraint-gate MCP tool before proceeding.`,
            observation_required: true,
            constraint_type: constraintMatch,
            command,
          };
        } else {
          // Staleness check
          const staleness = checkObservationStaleness(observations, coordDir);
          if (staleness.stale) {
            constraintResult = {
              decision: 'escalate',
              reason: staleness.reason,
              constraint_type: constraintMatch,
              observation_id: staleness.observation_id,
              inbound_gate: true,
            };
          }
        }
      }
    }
  }

  // --- Path-write detection: ALL records/** blocked, use MCP tools ---
  if (commandWritesToRecords(command)) {
    pathResult = {
      decision: 'block',
      reason: 'Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.',
      hard_block: true,
    };
  }

  // --- Combine results ---
  if (constraintResult?.hard_block || pathResult?.hard_block) {
    console.log(JSON.stringify(constraintResult?.hard_block ? constraintResult : pathResult));
    process.exit(2);
  }
  if (constraintResult) {
    console.log(JSON.stringify(constraintResult));
    process.exit(2);
  }
  if (pathResult) {
    console.log(JSON.stringify(pathResult));
    process.exit(2);
  }

  process.exit(0);
}

main();
