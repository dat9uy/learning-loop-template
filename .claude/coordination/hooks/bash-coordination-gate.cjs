#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { matchConstraintPattern, readCoordinationConfig, readObservations } = require('./lib/gate-utils.cjs');

function findProjectRoot() {
  // Walk up from coord dir to find project root (contains records/)
  let dir = path.join(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(dir, 'records'))) return dir;
  return path.join(__dirname, '..', '..', '..');
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

  // Check for active observation with matching constraint_type
  const root = findProjectRoot();
  const obsDir = path.join(root, 'records', 'observations');
  const observations = readObservations(obsDir);
  const hasObservation = observations.some(
    obs => obs.constraint_type === constraintMatch && obs.status === 'active'
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

  // Check budget if observation has external_system + resource
  const obs = observations.find(
    o => o.constraint_type === constraintMatch && o.status === 'active'
  );
  if (obs && obs.external_system && obs.resource) {
    const budgets = readBudgets(obsDir);
    const budget = budgets.find(
      b => b.external_system === obs.external_system && b.resource === obs.resource
    );
    if (budget && budget.current >= budget.budget) {
      const output = {
        decision: 'escalate',
        reason: `Budget exhausted for constraint "${constraintMatch}" (${obs.external_system}/${obs.resource}).`,
        constraint_type: constraintMatch,
        observation_id: obs.id,
      };
      console.log(JSON.stringify(output));
      process.exit(2);
    }
    if (budget && budget.validation_window?.active) {
      const output = {
        decision: 'escalate',
        reason: `Validation window active for constraint "${constraintMatch}".`,
        constraint_type: constraintMatch,
        observation_id: obs.id,
      };
      console.log(JSON.stringify(output));
      process.exit(2);
    }
  }

  process.exit(0);
}

main();
