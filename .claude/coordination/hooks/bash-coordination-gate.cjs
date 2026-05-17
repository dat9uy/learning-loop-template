#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { matchConstraintPattern, readCoordinationConfig, readObservations, checkObservationStaleness } = require('./lib/gate-utils.cjs');

function findProjectRoot() {
  // Walk up from coord dir to find project root (contains records/)
  // Override via GATE_ROOT env var for testing.
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = path.join(__dirname, '..', '..', '..');
  while (!fs.existsSync(path.join(dir, 'records'))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
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
  const config = readCoordinationConfig(coordDir);
  if (!config || !config.profiles) {
    process.exit(0);
  }

  const constraintMatch = matchConstraintPattern(command);
  if (!constraintMatch) {
    process.exit(0);
  }

  // Side-effect imports always block — importing vnstock_data triggers vendor
  // auth which reactivates cleared devices. No observation or budget can override.
  if (constraintMatch === 'side-effect-import') {
    const output = {
      decision: 'block',
      reason: 'Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.',
      constraint_type: constraintMatch,
      hard_block: true,
      command,
    };
    console.log(JSON.stringify(output));
    process.exit(2);
  }

  const root = findProjectRoot();
  const obsDir = path.join(root, 'records', 'observations');

  // Global budget check — iterate ALL budgets, find first exhausted
  const budgets = readBudgets(obsDir);
  for (const budget of budgets) {
    const current = budget.current ?? 0;
    const limit = budget.budget ?? 0;
    const exhausted = current >= limit;
    const windowActive = budget.validation_window?.active === true;
    if (exhausted || windowActive) {
      const output = {
        decision: 'escalate',
        reason: exhausted
          ? `Budget exhausted for constraint "${constraintMatch}".`
          : `Validation window active for constraint "${constraintMatch}".`,
        constraint_type: constraintMatch,
      };
      console.log(JSON.stringify(output));
      process.exit(2);
    }
  }

  // Check for active observation with matching constraint_type or constraint
  const observations = readObservations(obsDir);
  const hasObservation = observations.some(
    obs => obs.status === 'active' &&
      (obs.constraint_type === constraintMatch || obs.constraint === constraintMatch)
  );

  if (!hasObservation) {
    const output = {
      decision: 'block',
      reason: `Constraint "${constraintMatch}" detected in command. No active observation found. Record an observation via the constraint-gate MCP tool before proceeding.`,
      observation_required: true,
      constraint_type: constraintMatch,
      command,
    };
    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Inbound gate integration: check if operator sent state-change message
  // after the observation was last updated. If so, escalate.
  const staleness = checkObservationStaleness(observations, coordDir);
  if (staleness.stale) {
    const output = {
      decision: 'escalate',
      reason: staleness.reason,
      constraint_type: constraintMatch,
      observation_id: staleness.observation_id,
      inbound_gate: true,
    };
    console.log(JSON.stringify(output));
    process.exit(2);
  }

  process.exit(0);
}

main();
