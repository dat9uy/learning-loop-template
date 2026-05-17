#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Constraint patterns — same as gate-logic.js (CJS single source of truth)
const CONSTRAINT_PATTERNS = {
  docker: /\bdocker\b(?!-)/,
  sudo: /\bsudo\b/,
  'package-manager': /\b(pip|npm|yarn|pnpm)\s+(install|add)\b/,
  'vendor-api': /\bcurl\b.*api/,
};

const SEGMENT_SEPARATORS = /[;&|]+/;

/**
 * Match command against constraint patterns.
 * Splits on ;, &, | and checks each segment.
 * Returns first matching constraint type, or null.
 */
function matchConstraintPattern(command) {
  if (!command || typeof command !== 'string') return null;
  const segments = command.split(SEGMENT_SEPARATORS);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(trimmed)) return type;
    }
  }
  return null;
}

/**
 * Read coordination-config.json. Fail-open: returns {} on error.
 */
function readCoordinationConfig(coordDir) {
  const configPath = path.join(coordDir, 'coordination-config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`gate-utils: failed to read coordination config: ${err.message}`);
    return {};
  }
}

/**
 * Read active profile from .active-profile file.
 * Defaults to 'code-generation' (most restrictive).
 */
function readActiveProfile(coordDir) {
  const profilePath = path.join(coordDir, '.active-profile');
  try {
    const name = fs.readFileSync(profilePath, 'utf8').trim();
    return name || 'code-generation';
  } catch {
    return 'code-generation';
  }
}

/**
 * Get profile config by name. Falls back to code-generation.
 */
function getProfile(config, profileName) {
  return config?.profiles?.[profileName] || config?.profiles?.['code-generation'] || {};
}

/**
 * Read observation YAML files from observations dir.
 * Fail-open: returns [] on error.
 */
function readObservations(observationsDir) {
  try {
    const files = fs.readdirSync(observationsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const observations = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(observationsDir, file), 'utf8');
        const parsed = yaml.parse(content, { uniqueKeys: false });
        if (parsed && typeof parsed === 'object') observations.push(parsed);
      } catch (err) {
        console.error(`gate-utils: failed to parse observation ${file}: ${err.message}`);
      }
    }
    return observations;
  } catch (err) {
    console.error(`gate-utils: failed to read observations dir: ${err.message}`);
    return [];
  }
}

/**
 * Simple glob matching for forbidlist patterns.
 * Supports ** for directory trees and * for single segments.
 */
function globMatch(pattern, filePath) {
  // Convert glob to regex — escape dots first, then handle globs
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Check if a path matches any pattern in a glob list.
 */
function matchesAnyGlob(patterns, filePath) {
  return patterns.some(p => globMatch(p, filePath));
}

module.exports = {
  CONSTRAINT_PATTERNS,
  matchConstraintPattern,
  readCoordinationConfig,
  readActiveProfile,
  getProfile,
  readObservations,
  globMatch,
  matchesAnyGlob,
};
