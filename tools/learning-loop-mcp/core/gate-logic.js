const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "..", "core", "patterns.json"), "utf8"));

export const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);

const WRITE_PATH_PATTERNS = {
  'records-evidence': ['records/evidence/**', 'records/*/evidence/**'],
  'records-index': ['records/index/**', 'records/*/index/**'],
  'records-capabilities': ['records/capabilities/**', 'records/*/capabilities/**'],
};

export function globMatch(pattern, filePath) {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

export function pathMatchesObservation(observation, filePath) {
  if (observation.constraint_type !== 'write-path') return false;
  if (observation.status !== 'active') return false;
  if (globMatch('records/observations/**', filePath)) return false;
  const patterns = WRITE_PATH_PATTERNS[observation.constraint];
  if (!patterns) return false;
  return patterns.some((p) => globMatch(p, filePath));
}

const SEGMENT_SEPARATORS = /[;&|]+/;

const MESSAGE_FLAGS = new Set(PATTERNS_RAW.message_flags || []);

/**
 * Strip message flags and their values from a command segment.
 * Quoted multi-word values (e.g., "fix pnpm add issue") are skipped as a block.
 * Unquoted values are skipped as a single token.
 * This prevents false positives from commit messages, PR titles, etc.
 */
function stripMessageFlags(segment) {
  const tokens = segment.split(/\s+/);
  const result = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (MESSAGE_FLAGS.has(token)) {
      i++;
      if (i < tokens.length) {
        const next = tokens[i];
        if (next.startsWith('"') || next.startsWith("'")) {
          const quote = next[0];
          // Skip until we find the token ending the quoted block
          while (i < tokens.length && !tokens[i].endsWith(quote)) {
            i++;
          }
          i++; // Skip the closing token (or the single self-closed token)
        } else {
          // Unquoted value: skip exactly one token
          i++;
        }
      }
      continue;
    }
    result.push(token);
    i++;
  }
  return result.join(" ");
}

/**
 * Match a command against constraint patterns.
 * Splits on ;, &, | and checks each segment independently.
 * Strips message flags before matching to avoid false positives.
 * Returns the first matching constraint type, or null.
 */
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  const segments = command.split(SEGMENT_SEPARATORS);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const stripped = stripMessageFlags(trimmed);
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(stripped)) return type;
    }
  }
  return null;
}

/**
 * Check if an active observation exists for the given constraint type.
 * Matches by `constraint_type` field. Archived observations are ignored.
 */
export function checkObservationExists(constraintType, observations) {
  if (!observations || !Array.isArray(observations)) {
    return { found: false };
  }
  const match = observations.find(
    (obs) =>
      obs.status === "active" &&
      (obs.constraint_type === constraintType || obs.constraint === constraintType)
  );
  return match ? { found: true, observation: match } : { found: false };
}

/**
 * Evaluate budget state. Returns { exhausted, windowActive, remaining }.
 * Fail-open: null/missing budget → not exhausted.
 */
export function evaluateBudget(budgetData) {
  if (!budgetData || typeof budgetData !== "object") {
    return { exhausted: false, windowActive: false, constraint_type: null, external_system: null, resource: null };
  }
  const remaining = (budgetData.budget ?? 0) - (budgetData.current ?? 0);
  return {
    exhausted: (budgetData.current ?? 0) >= (budgetData.budget ?? 0),
    windowActive: budgetData.validation_window?.active === true,
    remaining,
    constraint_type: budgetData.constraint_type || null,
    external_system: budgetData.external_system || null,
    resource: budgetData.resource || null,
  };
}

/**
 * Make the final gate decision.
 * Returns { decision: "ok" | "block" | "escalate", ... }
 */
export function makeGateDecision(constraintMatch, observationStatus) {
  // Side-effect imports always block — importing triggers vendor auth which
  // reactivates cleared devices. No observation or budget state can override.
  if (constraintMatch === "side-effect-import") {
    return {
      decision: "block",
      reason: `Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.`,
      constraint_type: constraintMatch,
      hard_block: true,
    };
  }

  // No constraint matched → ok
  if (!constraintMatch) {
    return { decision: "ok" };
  }

  // Constraint matched but no active observation → block
  if (!observationStatus?.found) {
    return {
      decision: "block",
      reason: `Constraint "${constraintMatch}" detected. No active observation found. Record an observation before proceeding.`,
      observation_required: true,
      constraint_type: constraintMatch,
    };
  }

  return { decision: "ok" };
}

/**
 * Evaluate a file path against write-path observations.
 * Returns { decision: "ok" | "block" | "escalate", ... }.
 */
export function findProjectRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = join(__dirname, '..', '..', '..');
  while (!existsSync(join(dir, 'records'))) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

export function extractFrontmatter(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return null;
  const end = trimmed.indexOf('---', 3);
  if (end === -1) return null;
  const yamlBlock = trimmed.slice(3, end).trim();
  if (!yamlBlock) return null;
  try {
    const parsed = parseYaml(yamlBlock, { uniqueKeys: false });
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function hasProductBuildTag(frontmatter) {
  if (!frontmatter || !frontmatter.tags) return false;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
  return tags.includes('product-build');
}

export function extractSurfaces(frontmatter) {
  if (!frontmatter || !frontmatter.surfaces) return [];
  return Array.isArray(frontmatter.surfaces) ? frontmatter.surfaces : [frontmatter.surfaces];
}

export function checkDecisionRecords(surfaces, recordsDir) {
  const missing = [];
  const found = [];
  for (const surface of surfaces) {
    if (!surface || typeof surface !== 'string') continue;
    const surfaceFirstDir = join(recordsDir, surface, 'decisions');
    const flatDir = join(recordsDir, 'decisions');
    let hasDecision = false;
    try {
      if (existsSync(surfaceFirstDir)) {
        const files = readdirSync(surfaceFirstDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
        if (files.length > 0) hasDecision = true;
      }
    } catch { /* ignore */ }
    if (!hasDecision) {
      try {
        if (existsSync(flatDir)) {
          const pattern = new RegExp(`\\b${surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const files = readdirSync(flatDir).filter(f =>
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

export function readPreflightMarker(surface, coordDir) {
  const markerPath = join(coordDir, `.loop-preflight-${surface}`);
  try {
    const raw = readFileSync(markerPath, 'utf8');
    const marker = JSON.parse(raw);
    if (!marker.completed_at) return null;
    const ts = new Date(marker.completed_at);
    if (isNaN(ts.getTime())) return null;
    if (Date.now() - ts.getTime() > MARKER_TTL_MS) return null;
    return marker;
  } catch {
    return null;
  }
}

export function writePreflightMarker(surface, coordDir) {
  const markerPath = join(coordDir, `.loop-preflight-${surface}`);
  const content = JSON.stringify({
    surface,
    completed_at: new Date().toISOString(),
  }, null, 2);
  mkdirSync(dirname(markerPath), { recursive: true });
  const tmpPath = markerPath + '.tmp';
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, markerPath);
}

export function inferSurface(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const parts = filePath.split('/');
  if (parts[0] === 'product' && parts.length >= 2) {
    return 'product';
  }
  if (parts[0] === 'records' && parts.length >= 2) {
    return parts[1];
  }
  if (parts[0] === 'docs' && parts[1] === 'journals') {
    return null;
  }
  return null;
}

export function hasDecisionRecords(surface, recordsDir) {
  if (!surface || typeof surface !== 'string') return true;
  const result = checkDecisionRecords([surface], recordsDir);
  return result.missing.length === 0;
}

export function evaluateWritePath(filePath, observations, checkStalenessFn) {
  if (!filePath || typeof filePath !== "string") {
    return { decision: "ok" };
  }
  const normalized = normalize(filePath.replace(/^\.\//, ""));

  if (globMatch("records/observations/**", normalized)) {
    return {
      decision: "block",
      reason: "records/observations/** is blocked unconditionally",
      hard_block: true,
    };
  }

  // Check all write-path patterns (evidence, index, capabilities) via observations
  const matchingObs = observations.find((obs) => pathMatchesObservation(obs, normalized));
  if (matchingObs) {
    const staleness = checkStalenessFn ? checkStalenessFn([matchingObs]) : { stale: false };
    if (staleness.stale) {
      return {
        decision: "escalate",
        reason: staleness.reason,
        observation_id: staleness.observation_id,
        inbound_gate: true,
      };
    }
    return { decision: "ok" };
  }

  // If the path matches a known write-path pattern but has no observation → block
  const knownWritePatterns = Object.values(WRITE_PATH_PATTERNS).flat();
  for (const pattern of knownWritePatterns) {
    if (globMatch(pattern, normalized)) {
      return {
        decision: "block",
        observation_required: true,
        constraint_type: "write-path",
      };
    }
  }

  // Other paths (records/claims/**, docs/**, etc.) → ok
  return { decision: "ok" };
}
