const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { readRegistry } from "./meta-state.js";
import { computeFileHash } from "./check-grounding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "..", "core", "patterns.json"), "utf8"));

const CONSTRAINT_PATTERNS = Object.fromEntries(
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

function pathMatchesObservation(observation, filePath) {
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
 * Split a command on `;`, `&`, `|` separators — quote-aware.
 *
 * A naive `command.split(/[;&|]+/)` would fragment a quoted message body
 * like `git commit -m "a;b" -m "c|d"` on the `;` and `|` inside the
 * quoted strings, causing downstream `stripMessageFlags` to miss the
 * message body and the regex to match tokens that should be inside the
 * body. This is the splitSegments-quote-unaware bug
 * (see finding meta-260606T0301Z-...).
 *
 * The state machine tracks:
 *  - single-quote state (POSIX shell: no escapes inside `'...'`)
 *  - double-quote state (POSIX shell: backslash escapes some chars inside `"..."`)
 *  - backslash escape (consumes the next char literally)
 *
 * Separators are only split on when NOT inside a quote and NOT escaped.
 * Each resulting segment is trimmed; empty segments are dropped (same
 * as the prior behavior).
 */
// fallow-ignore-next-line complexity
export function splitSegments(command) {
  if (!command || typeof command !== "string") return [];
  const segments = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      // Backslash escape: consume this char literally, regardless of quote state.
      // (POSIX: inside single quotes, backslash is literal — but our tokenizer
      // never enters single-quote via a backslash; it enters via `'`. So this
      // branch only fires outside single quotes, matching shell semantics.)
      buf += ch;
      escaped = false;
      continue;
    }

    if (inSingle) {
      buf += ch;
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      buf += ch;
      if (ch === "\\") {
        // Inside double quotes, backslash escapes the next char (POSIX).
        // We don't actually need to look at the next char to tokenize; we
        // just need to NOT treat the next char as a quote-close or escape.
        escaped = true;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    // Not in any quote.
    if (ch === "\\") {
      buf += ch;
      escaped = true;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      buf += ch;
      inDouble = true;
      continue;
    }
    if (ch === ";" || ch === "&" || ch === "|") {
      const trimmed = buf.trim();
      if (trimmed) segments.push(trimmed);
      buf = "";
      continue;
    }
    buf += ch;
  }

  const trimmed = buf.trim();
  if (trimmed) segments.push(trimmed);
  return segments;
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

function extractFrontmatter(content) {
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

function hasProductBuildTag(frontmatter) {
  if (!frontmatter || !frontmatter.tags) return false;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
  return tags.includes('product-build');
}

function extractSurfaces(frontmatter) {
  if (!frontmatter || !frontmatter.surfaces) return [];
  return Array.isArray(frontmatter.surfaces) ? frontmatter.surfaces : [frontmatter.surfaces];
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
 * Rejects patterns where a group with an inner quantifier is itself
 * quantified (star height > 1). This is the canonical ReDoS pattern
 * (e.g., `(a+)+`, `(a*)*`, `(a+)?`).
 *
 * The check distinguishes three cases:
 *  1. A quantifier on a group that previously contained a quantifier
 *     (e.g., `(a+)+`) — REJECT.
 *  2. A quantifier at the top level (depth 0) on a non-group token
 *     (e.g., `\s+` in `(verb)\s+(noun)`) — ALLOW. Multiple top-level
 *     quantifiers in different alternatives are not nested.
 *  3. A quantifier inside a group that previously had a quantifier
 *     (e.g., `(a+)+` with the `+` inside the group) — REJECT.
 *
 * This is a lightweight replacement for the safe-regex package.
 */
// fallow-ignore-next-line complexity
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
      // Propagate: the group that just closed contained a quantifier,
      // so the parent (real group, depth > 0) now conceptually contains
      // a quantified subpattern. Propagation to depth 0 is a no-op
      // (top-level quantifiers are not "nested" — they're in different
      // alternatives or separated by non-group tokens).
      if (depth < groupHadQuantifier.length && groupHadQuantifier[depth]) {
        if (depth - 1 > 0 && depth - 1 < groupHadQuantifier.length) {
          groupHadQuantifier[depth - 1] = true;
        }
      }
      depth--;
      continue;
    }

    const isQuantifier = ch === "*" || ch === "+" || ch === "?";
    const isRangeQuantifier = ch === "{" && /^{\d+(,\d*)?}/.test(pattern.slice(i));

    if ((isQuantifier || isRangeQuantifier) && !inCharClass) {
      // Case 1: this quantifier quantifies a group (preceded by `)`)
      // AND that group had a quantifier inside.
      if (
        i > 0 &&
        pattern[i - 1] === ")" &&
        depth + 1 < groupHadQuantifier.length &&
        groupHadQuantifier[depth + 1]
      ) {
        return false;
      }
      // Case 3: this quantifier is inside a group at depth > 0, AND
      // an enclosing group already had a quantifier. (Top-level
      // quantifiers — depth 0 — are not checked here, per case 2.)
      for (let d = 1; d <= depth && d < groupHadQuantifier.length; d++) {
        if (groupHadQuantifier[d]) {
          return false;
        }
      }
      // Track the quantifier at the current depth (only for real groups).
      if (depth > 0 && depth < groupHadQuantifier.length) {
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

  // Only first-class entry_kind="rule" entries are accepted.
  // Legacy finding entries with promoted_to_rule were removed after the
  // Phase 2 migration (all promoted rules are now standalone rule entries).
  let rules = entries.filter((e) => {
    return e.entry_kind === "rule" && e.status === "active";
  });

  rules = rules.filter((r) => {
    const predicate = r.scope_predicate;
    if (!predicate || predicate === "none") return true;
    if (predicate === "project_has_learning_loop_mcp") {
      return projectHasLearningLoopMcp(root);
    }
    console.warn(`Rule ${r.id}: unknown scope_predicate "${predicate}"`);
    return true;
  });

  promotedRulesCache.set(root, { rules, mtime, size });
  return rules;
}

/**
 * Apply promoted rules against a command (regex) or file path (glob).
 * Returns escalate with rule provenance on match, ok otherwise.
 */
/**
 * Check if a resolution-evidence-required rule is satisfied.
 * Reads the registry and asserts absence of any active/reported finding
 * with the matching subtype and session_id.
 * Returns { satisfied: true } or { satisfied: false, blocking_id, rule_id, applies_to_resolution }.
 */

/**
 * Strip the two documented suffix forms from an evidence_code_ref:
 *   - `:line` (canonical per meta-state.js#metaStateFindingEntrySchema
 *     and loop-introspect.js discoverability hint)
 *   - `#anchor` (function/symbol identifier)
 * Returns the bare file path. Both regexes are anchored to the end of the
 * string and only match the documented syntax, so paths with no suffix
 * (e.g., "tools/foo.js") are returned unchanged. See finding
 * meta-260607T1625Z-gate-line-suffix-not-stripped-from-evidence-code-ref
 * for the gate-bug this helper closes.
 */
export function stripEvidenceAnchor(codeRef) {
  if (typeof codeRef !== "string") return codeRef;
  // Strip :line suffix (digits only — keeps Windows drive letters safe)
  let stripped = codeRef.replace(/:\d+$/, "");
  // Strip #anchor suffix (identifier chars: word, dot, dollar, dash, underscore)
  stripped = stripped.replace(/#[\w$.-]+$/, "");
  return stripped;
}

// fallow-ignore-next-line complexity
export function checkResolutionEvidence(rule, root) {
  const rule_id = rule.id;

  // Branch 1: global orphan-evidence rule
  if (rule_id === "rule-no-orphaned-evidence") {
    const entries = readRegistry(root);
    const activeGrounded = entries.filter(
      (e) => e.entry_kind === "finding" && (e.status === "active" || e.status === "reported") && e.mechanism_check === true
    );
    const orphans = [];
    for (const entry of activeGrounded) {
      const codeRef = entry.evidence_code_ref;
      if (!codeRef) {
        orphans.push({ id: entry.id, reason: "no_evidence_code_ref" });
        continue;
      }
      // Strip both `:line` (canonical per meta-state.js#metaStateFindingEntrySchema
      // and loop-introspect.js discoverability hint) and `#anchor` suffixes before
      // resolving the file path. Without the `:line` strip, the gate treated
      // `path/to/file.js:37` as a literal file path and flagged it as
      // code_ref_missing even when the file existed. See finding
      // meta-260607T1625Z-gate-line-suffix-not-stripped-from-evidence-code-ref.
      const absPath = isAbsolute(codeRef) ? codeRef : join(root, stripEvidenceAnchor(codeRef));
      let currentHash;
      try {
        currentHash = computeFileHash(absPath);
      } catch {
        orphans.push({ id: entry.id, reason: "code_ref_missing" });
        continue;
      }
      if (entry.code_fingerprint && entry.code_fingerprint !== currentHash) {
        orphans.push({ id: entry.id, reason: "fingerprint_mismatch", expected: entry.code_fingerprint, actual: currentHash });
      }
    }
    if (orphans.length > 0) {
      return { satisfied: false, rule_id: "rule-no-orphaned-evidence", blocking_id: orphans[0]?.id, applies_to_resolution: rule.applies_to_resolution, orphans };
    }
    return { satisfied: true, rule_id: "rule-no-orphaned-evidence" };
  }

  // Branch 2: existing per-finding resolution-evidence-required rules
  const { pattern, applies_to_resolution } = rule;
  const entries = readRegistry(root);
  const blocking = entries.find((e) =>
    e.entry_kind === "finding"
    && e.subtype === "mcp-client-loading"
    && e.session_id === pattern
    && (e.status === "active" || e.status === "reported"),
  );
  if (blocking) {
    return {
      satisfied: false,
      blocking_id: blocking.id,
      rule_id,
      applies_to_resolution,
    };
  }
  return { satisfied: true, rule_id };
}

// fallow-ignore-next-line complexity
export function applyPromotedRules(command, filePath, rules) {
  for (const rule of rules) {
    // Defense-in-depth: skip rules that should not have been loaded.
    // loadPromotedRules already filters to entry_kind="rule" + status="active",
    // but we double-check status here for safety.
    if (rule.status !== "active") continue;
    if (rule.enforcement !== "gate") continue;

    const { pattern_type, pattern, id: rule_id } = rule;
    let matched = false;

    try {
      if (pattern_type === "resolution-evidence-required") {
        // This pattern type is not a command-path match. The check happens in
        // meta_state_resolve (the per-tool gate). Skip here silently — the
        // bash gate always has `command` set, so a defensive warning would
        // fire on every single Execute invocation (regression caught by
        // gate-resolution-evidence.test.js#does NOT warn when...).
        continue;
      } else if (pattern_type === "regex" && command) {
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
