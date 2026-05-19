#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const PATTERNS_RAW = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../../tools/constraint-gate/patterns.json'), 'utf8')
);

const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);

const SEGMENT_SEPARATORS = /[;&|]+/;

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

function globMatch(pattern, filePath) {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

const MARKER_TTL_MS = 30 * 60 * 1000;

function readLastOperatorMessage(coordDir) {
  const markerPath = process.env.GATE_MARKER_PATH || path.join(coordDir, '.last-operator-message');
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (!marker || !marker.timestamp) return null;
    const markerTime = new Date(marker.timestamp).getTime();
    if (isNaN(markerTime)) return null;
    if ((Date.now() - markerTime) > MARKER_TTL_MS) return null;
    return marker;
  } catch {
    return null;
  }
}

function checkObservationStaleness(observations, coordDir) {
  const marker = readLastOperatorMessage(coordDir);
  if (!marker || !marker.timestamp) return { stale: false };

  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return { stale: false };

  for (const obs of observations) {
    if (obs.status !== 'active') continue;
    if (!obs.updated_at) {
      return {
        stale: true,
        reason: `Observation "${obs.id || obs.constraint}" has no updated_at. Operator sent state-change at ${marker.timestamp}. Update the observation before proceeding.`,
        observation_id: obs.id || obs.constraint,
      };
    }
    const obsTime = new Date(obs.updated_at).getTime();
    if (isNaN(obsTime) || markerTime > obsTime) {
      return {
        stale: true,
        reason: `Observation "${obs.id || obs.constraint}" updated at ${obs.updated_at}, but operator sent state-change at ${marker.timestamp}. Observation may be stale. Update before proceeding.`,
        observation_id: obs.id || obs.constraint,
      };
    }
  }
  return { stale: false };
}

module.exports = {
  CONSTRAINT_PATTERNS,
  matchConstraintPattern,
  readObservations,
  readLastOperatorMessage,
  checkObservationStaleness,
  globMatch,
};
