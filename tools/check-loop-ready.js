#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'records'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function hasYamlFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  const entries = fs.readdirSync(dir);
  return entries.some(e => e.endsWith('.yaml') || e.endsWith('.yml'));
}

function listExperiments(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(e => e.endsWith('.yaml') || e.endsWith('.yml'));
}

function main() {
  const surface = process.argv[2];
  if (!surface) {
    console.error('Usage: node tools/check-loop-ready.js <surface>');
    process.exit(1);
  }

  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error('Could not find project root (no records/ directory found).');
    process.exit(1);
  }

  const surfaceFirstDir = path.join(root, 'records', surface, 'decisions');
  const flatDir = path.join(root, 'records', 'decisions');

  const ready = hasYamlFiles(surfaceFirstDir) || hasYamlFiles(flatDir);

  if (ready) {
    console.log(`Surface "${surface}" is loop-ready.`);
    process.exit(0);
  }

  console.error(`Surface "${surface}" is not loop-ready.`);
  console.error(`Missing: records/${surface}/decisions/*.yaml (or records/decisions/*${surface}*.yaml)`);

  const experiments = listExperiments(path.join(root, 'records', surface, 'experiments'));
  if (experiments.length > 0) {
    console.error(`\nExisting experiments for "${surface}":`);
    experiments.forEach(e => console.error(`  - ${e}`));
  }

  console.error(`\nCreate decision records before writing product code or product-build plans.`);
  process.exit(1);
}

main();
