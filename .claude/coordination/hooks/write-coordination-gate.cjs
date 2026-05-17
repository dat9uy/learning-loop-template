#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readCoordinationConfig, readActiveProfile, getProfile, matchesAnyGlob } = require('./lib/gate-utils.cjs');

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }

  // Only gate Edit and Write
  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath || typeof filePath !== 'string') {
    process.exit(0);
  }

  const coordDir = path.join(__dirname, '..');
  const config = readCoordinationConfig(coordDir);
  if (!config || !config.profiles) {
    process.exit(0);
  }

  const profileName = readActiveProfile(coordDir);
  const profile = getProfile(config, profileName);
  const forbidlist = profile.write_forbidlist || [];

  if (matchesAnyGlob(forbidlist, filePath)) {
    const output = {
      decision: 'block',
      reason: `Write to "${filePath}" is forbidden by profile "${profileName}". Matched forbidlist pattern.`,
      profile: profileName,
      file_path: filePath,
    };
    console.log(JSON.stringify(output));
    process.exit(2);
  }

  process.exit(0);
}

main();
