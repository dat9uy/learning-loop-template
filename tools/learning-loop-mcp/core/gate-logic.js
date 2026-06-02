const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
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

function expandBraces(pattern) {
  const match = pattern.match(/^(.*?)\{([^}]+)\}(.*)$/);
  if (!match) return [pattern];
  const [, pre, options, post] = match;
  return options.split(',').flatMap((opt) => expandBraces(pre + opt.trim() + post));
}

export function globMatch(pattern, filePath) {
  const patterns = expandBraces(pattern);
  return patterns.some((p) => {
    const regexStr = p
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '⟨GLOBSTAR⟩')
      .replace(/\*/g, '[^/]*')
      .replace(/⟨GLOBSTAR⟩/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(filePath);
  });
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

/** Split a command on ;, &, | separators. */
export function splitSegments(command) {
  if (!command || typeof command !== "string") return [];
  return command.split(SEGMENT_SEPARATORS).map((s) => s.trim()).filter(Boolean);
}

/**
 * Strip message flags and their values from a command segment.
 * Quoted multi-word values (e.g., "fix pnpm add issue") are skipped as a block.
 * Unquoted values are skipped as a single token.
 * This prevents false positives from commit messages, PR titles, etc.
 */
export function stripMessageFlags(segment) {
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

  for (const segment of splitSegments(command)) {
    const stripped = stripMessageFlags(segment);
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

// ─── Promoted Rules (meta-state as rule registry) ───

/** Whitelist for glob patterns to prevent path traversal. */
const GLOB_SCOPE_WHITELIST = ["product/", "docs/", "plans/", "tools/", ".factory/", "meta-state.jsonl"];

/**
 * Simple regex safety check to prevent ReDoS.
 * Rejects patterns with nested quantifiers (star height > 1).
 * This is a lightweight replacement for the safe-regex package.
 */
export function isSafeRegexPattern(pattern) {
  if (!pattern || typeof pattern !== "string") return false;
  if (pattern.length > 500) return false;

  let depth = 0;
  let groupHadQuantifier = new Array(50).fill(false);
  let inCharClass = false;
  let escaped = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inCharClass) {
      if (ch === "]") inCharClass = false;
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      continue;
    }
    if (ch === "(" && !inCharClass) {
      depth++;
      if (depth < groupHadQuantifier.length) {
        groupHadQuantifier[depth] = false;
      }
      continue;
    }
    if (ch === ")" && !inCharClass) {
      if (depth < groupHadQuantifier.length && groupHadQuantifier[depth]) {
        // Propagate: the group that just closed contained a quantifier,
        // so the parent group now conceptually contains a quantified subpattern.
        if (depth - 1 >= 0 && depth - 1 < groupHadQuantifier.length) {
          groupHadQuantifier[depth - 1] = true;
        }
      }
      depth--;
      continue;
    }

    const isQuantifier = ch === "*" || ch === "+" || ch === "?";
    const isRangeQuantifier = ch === "{" && /^{\d+(,\d*)?}/.test(pattern.slice(i));

    if ((isQuantifier || isRangeQuantifier) && !inCharClass) {
      // If any group at or above current depth already had a quantifier,
      // another quantifier here creates star height > 1.
      for (let d = 0; d <= depth && d < groupHadQuantifier.length; d++) {
        if (groupHadQuantifier[d]) {
          return false;
        }
      }
      if (depth >= 0 && depth < groupHadQuantifier.length) {
        groupHadQuantifier[depth] = true;
      }
    }
  }

  return true;
}

export function isGlobScopeWhitelisted(pattern) {
  if (!pattern || typeof pattern !== "string") return false;
  return GLOB_SCOPE_WHITELIST.some((prefix) => pattern.startsWith(prefix));
}

function projectHasLearningLoopMcp(root) {
  try {
    const cfgPath = join(root, ".mcp.json");
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return !!(cfg.mcpServers && cfg.mcpServers["learning-loop-mcp"]);
  } catch {
    return false;
  }
}

/** Cache for promoted rules: { root -> { rules, mtime, size } } */
const promotedRulesCache = new Map();

/**
 * Load active gate-enforced promoted rules from meta-state.jsonl.
 * Uses (mtime, size) tuple for cache invalidation (RT Finding 6).
 */
export function loadPromotedRules(root) {
  const path = join(root, "meta-state.jsonl");
  if (!existsSync(path)) return [];

  const stats = statSync(path);
  const mtime = stats.mtime.getTime();
  const size = stats.size;

  const cached = promotedRulesCache.get(root);
  if (cached && cached.mtime === mtime && cached.size === size) {
    return cached.rules;
  }

  let entries = [];
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    entries = lines.map((line) => JSON.parse(line));
  } catch {
    return [];
  }

  let rules = entries.filter(
    (e) =>
      e.status === "active" &&
      e.category === "loop-anti-pattern" &&
      e.promoted_to_rule?.enforcement === "gate"
  );

  rules = rules.filter((r) => {
    const predicate = r.promoted_to_rule?.scope_predicate;
    if (!predicate || predicate === "none") return true;
    if (predicate === "project_has_learning_loop_mcp") {
      return projectHasLearningLoopMcp(root);
    }
    console.warn(`Rule ${r.promoted_to_rule.rule_id}: unknown scope_predicate "${predicate}"`);
    return true;
  });

  promotedRulesCache.set(root, { rules, mtime, size });
  return rules;
}

/**
 * Apply promoted rules against a command (regex) or file path (glob).
 * Returns escalate with rule provenance on match, ok otherwise.
 */
export function applyPromotedRules(command, filePath, rules) {
  for (const rule of rules) {
    // Defense-in-depth: skip rules that should not have been loaded
    if (rule.status !== "active") continue;
    if (rule.category !== "loop-anti-pattern") continue;
    if (rule.promoted_to_rule?.enforcement !== "gate") continue;

    const { pattern_type, pattern, rule_id } = rule.promoted_to_rule;
    let matched = false;

    try {
      if (pattern_type === "regex" && command) {
        if (!isSafeRegexPattern(pattern)) {
          console.warn(`Rule ${rule_id}: regex pattern rejected by safety check`);
          continue;
        }
        for (const segment of splitSegments(command)) {
          const stripped = stripMessageFlags(segment);
          if (new RegExp(pattern).test(stripped)) {
            matched = true;
            break;
          }
        }
      } else if (pattern_type === "glob" && filePath) {
        if (!isGlobScopeWhitelisted(pattern)) {
          console.warn(`Rule ${rule_id}: glob pattern "${pattern}" rejected by scope whitelist`);
          continue;
        }
        matched = globMatch(pattern, filePath);
      }
    } catch (err) {
      console.warn(`Rule ${rule_id}: invalid pattern: ${err.message}`);
      continue;
    }

    if (matched) {
      return {
        decision: "escalate",
        reason: `Promoted rule "${rule_id}" matched: ${pattern}`,
        rule_id,
        meta_state_id: rule.id,
        pattern_type,
      };
    }
  }
  return { decision: "ok" };
}
