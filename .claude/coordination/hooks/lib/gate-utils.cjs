#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

function findProjectRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = path.join(__dirname, '..', '..', '..', '..');
  while (!fs.existsSync(path.join(dir, 'records'))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

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

function extractFrontmatter(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return null;
  const end = trimmed.indexOf('---', 3);
  if (end === -1) return null;
  const yamlBlock = trimmed.slice(3, end).trim();
  if (!yamlBlock) return null;
  try {
    const parsed = yaml.parse(yamlBlock, { uniqueKeys: false });
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function hasProductBuildTag(frontmatter) {
  if (!frontmatter || !frontmatter.tags) return false;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
  return tags.includes('product-build');
}

function extractSurfaces(frontmatter) {
  if (!frontmatter || !frontmatter.surfaces) return [];
  return Array.isArray(frontmatter.surfaces) ? frontmatter.surfaces : [frontmatter.surfaces];
}

function checkDecisionRecords(surfaces, recordsDir) {
  const missing = [];
  const found = [];
  for (const surface of surfaces) {
    if (!surface || typeof surface !== 'string') continue;
    const surfaceFirstDir = path.join(recordsDir, surface, 'decisions');
    const flatDir = path.join(recordsDir, 'decisions');
    let hasDecision = false;
    // Try surface-first
    try {
      if (fs.existsSync(surfaceFirstDir)) {
        const files = fs.readdirSync(surfaceFirstDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
        if (files.length > 0) hasDecision = true;
      }
    } catch { /* ignore */ }
    // Fallback flat: match surface as a word boundary in filename
    if (!hasDecision) {
      try {
        if (fs.existsSync(flatDir)) {
          const pattern = new RegExp(`\\b${surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const files = fs.readdirSync(flatDir).filter(f =>
            (f.endsWith('.yaml') || f.endsWith('.yml')) && pattern.test(f)
          );
          if (files.length > 0) hasDecision = true;
        }
      } catch { /* ignore */ }
    }
    if (hasDecision) found.push(surface);
    else missing.push(surface);
  }
  return { missing, found };
}

function inferSurface(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const parts = filePath.split('/');

  // product/api/** and product/web/** → surface "product"
  if (parts[0] === 'product' && parts.length >= 2) {
    if (parts[1] === 'api' || parts[1] === 'web') return 'product';
    return parts[1];
  }

  // records/<segment>/** → return <segment> as surface
  if (parts[0] === 'records' && parts.length >= 2) {
    return parts[1];
  }

  // docs/journals/** → null (no enforcement, suggestions only)
  if (parts[0] === 'docs' && parts[1] === 'journals') {
    return null;
  }

  return null;
}

function hasDecisionRecords(surface, recordsDir) {
  if (!surface || typeof surface !== 'string') return true;
  const result = checkDecisionRecords([surface], recordsDir);
  return result.missing.length === 0;
}

module.exports = {
  CONSTRAINT_PATTERNS,
  matchConstraintPattern,
  readObservations,
  readLastOperatorMessage,
  checkObservationStaleness,
  globMatch,
  findProjectRoot,
  extractFrontmatter,
  hasProductBuildTag,
  extractSurfaces,
  checkDecisionRecords,
  inferSurface,
  hasDecisionRecords,
};
