const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 *
 * Strip functions (`splitSegments`, `stripMessageFlags`, `stripNodeEvalBody`)
 * form a layered pipeline: a command is split into segments, then each
 * segment is stripped of message-flag bodies and (for `node -e` wrappers) the
 * eval body. The regex matching constraint patterns sees only the command verb.
 * The `node -e` strip is asymmetric by user-stated design (see
 * `stripNodeEvalBody` JSDoc and finding
 * `meta-260615T1915Z-node-e-strip-bypass-risk`).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { SURFACES } from "./surfaces.js";
import { classifyPolicyTokens, resolveVerbIndex } from "./shell-parse.js";
import { classifyCommand } from "./command-classification.js";
import { readRegistry, metaStateRuleEntrySchema, readFileIndex } from "./meta-state.js";
import { computeFileHash, TERMINAL_HASH_REGEX } from "./check-grounding.js";
import { readGateOverride } from "./gate-override.js";
import { resolveSafePath, PathContainmentError } from "./path-containment.js";
import { isOpen } from "./stale-view.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));

const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);

// Gate-verbs: structured list of executor verbs (direct + indirection) that
// become observation-gated constraints. Loaded from patterns.json — NOT a
// hardcoded list. Each entry is either a bare string ("bash") for verb-only
// match, or an object {verb, flags} for verb+flag match (e.g. node -e), or
// {verb, indirection: true} for verbs that only count when followed by an
// executor (env bash, xargs bash).
// Verb matching uses basename normalization so PATH-qualified /bin/bash
// matches the bash entry.
const GATE_VERBS = (() => {
  const raw = PATTERNS_RAW["gate-verbs"];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) =>
    typeof entry === "string"
      ? { verb: entry, flags: null, indirection: false }
      : {
          verb: entry.verb,
          flags: Array.isArray(entry.flags) ? entry.flags : null,
          indirection: entry.indirection === true,
        },
  );
})();

// Indirection verbs (env, xargs) ONLY count as gate-verbs when followed by
// an executor. Derived from the same patterns.json config as GATE_VERBS so
// the match path and the observation path (file-readers.js, also config-
// derived) can never drift: removing a verb from config removes it from
// both. `find` is a verb+flag entry (-exec/-execdir/-ok), not indirection.
const INDIRECTION_VERBS = new Set(
  GATE_VERBS.filter((e) => e.indirection).map((e) => e.verb),
);

// `records-evidence` was the only observation-based unlock for `records/evidence/**`.
// It was migrated to meta-state (the meta-surface reframe) and the unlock removed.
// Direct writes to `records/**` are now blocked unconditionally by write-gate.js.
const WRITE_PATH_PATTERNS = {
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
  const patterns = WRITE_PATH_PATTERNS[observation.constraint];
  if (!patterns) return false;
  return patterns.some((p) => globMatch(p, filePath));
}


// ─── Pure blanking primitives (extracted to blanking.js) ─────────────────────
//
// The strip family (quote-state machine, splitSegments, stripMessageFlags,
// stripNodeEvalBody, data-command/echo/cli-argv/heredoc/inert-sink blanking)
// lives in blanking.js so the shared command-classification substrate can
// consume it WITHOUT importing gate-logic (breaking the circular dependency
// command-classification ↔ gate-logic). Re-exported here so existing callers
// and tests importing from gate-logic keep working unchanged.
export {
  splitSegments,
  stripMessageFlags,
  stripNodeEvalBody,
  stripDataCommandQuotes,
  stripEchoProse,
  BLANKABLE_HEREDOC_VERBS_PROMOTED,
  stripHeredocBodies,
  safeStripHeredocBodies,
  stripCliArgvPayload,
  applyInertSinkBlanking,
} from "./blanking.js";

// Local bindings for the constraint functions below (matchConstraintPattern /
// matchGateVerb / matchVerbAgainstGateList) and applyPromotedRules that
// consume the blanking primitives at call time. `export { … } from` does
// not create a local binding, so the plain import is required in addition
// to the re-export.
import {
  splitSegments,
  stripMessageFlags,
  stripNodeEvalBody,
  stripDataCommandQuotes,
  stripEchoProse,
  stripCliArgvPayload,
  applyInertSinkBlanking,
  safeStripHeredocBodies,
  BLANKABLE_HEREDOC_VERBS_PROMOTED,
  BLANKABLE_HEREDOC_VERBS_CONSTRAINT,
  BLANKABLE_HEREDOC_VERBS_GATEVERB,
} from "./blanking.js";

// Local verb basename normalization (PATH-qualified /bin/bash -> bash).
function basename(p) {
  if (typeof p !== "string") return p;
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/**
 * Match a command against constraint patterns.
 * Splits on ;, &, | and checks each segment independently.
 * Strips message flags, node-eval bodies, and pure-data-command pattern args
 * before matching to avoid false positives. Returns the first matching
 * constraint type, or null.
 *
 * Deliberately strips NO echo/printf prose, unlike both promoted-rule passes.
 * These are the first-class boundaries (docker, sudo, package-manager,
 * vendor-api, side-effect-import) and stay maximally conservative: `echo
 * "docker run" | bash` is caught here regardless of pipe target. Note the
 * converse — promoted rules such as rule-no-raw-stdout-vitest have no entry in
 * CONSTRAINT_PATTERNS, so this function is not a backstop for them. That is why
 * the per-segment blanking has to be non-bypassable on its own.
 */
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  // Heredoc pre-pass: blank quoted-delimiter heredoc bodies for inert verbs
  // (DATA_COMMANDS ∪ {cat, tee}) so `cat <<'EOF' … docker run … EOF` doesn't
  // false-fire on the first-class docker/sudo/package-manager constraints.
  // Executor verbs (bash/sh/python3) and node-family are NOT in this allowlist
  // — their heredoc bodies execute, so they must stay visible.
  const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_CONSTRAINT);

  for (const segment of splitSegments(heredocSafe)) {
    const stripped = stripMessageFlags(segment);
    const nodeStripped = stripNodeEvalBody(stripped);
    const dataStripped = stripDataCommandQuotes(nodeStripped);
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(dataStripped)) return type;
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
 * Gate-verb constraint match. Walks the policy view (from
 * classifyPolicyTokens) and returns the FIRST gate-verb constraint_type
 * hit as a string (e.g. "gate-verb:bash") or null. Checks BOTH each
 * segment's verb AND each pipe-target verb, so `printf evil | bash` is
 * caught even though `bash` is the second verb.
 *
 * Indirection verbs (env, xargs) only match when followed by a gate-verb
 * arg; `env FOO=bar` alone is not indirection.
 *
 * Verb matching uses basename normalization so PATH-qualified `/bin/bash`
 * matches the `bash` entry. Command-prefixes (sudo/time/nice/nohup/command)
 * are skipped by classifyPolicyTokens, so `sudo bash` resolves verb=bash.
 */
export function matchGateVerb(command) {
  if (!command || typeof command !== "string") return null;
  // Heredoc pre-pass BEFORE classifyPolicyTokens: a heredoc body line
  // containing `| bash` must not fracture into a gate-verb block (a heredoc
  // body is data, not a pipe to an executor). Node-family is INCLUDED here
  // (mirrors the promoted-rule accepted bypass; node stdin-script data is
  // data to the gate-verb layer).
  const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_GATEVERB);
  const view = classifyPolicyTokens(heredocSafe);

  for (const seg of view.segments) {
    // Indirection verbs (env, xargs) only match via the indirection
    // predicate below — they must NOT match as direct gate-verbs. A bare
    // `env FOO=bar` is just env-assignment plumbing, not indirection.
    const isIndirection = INDIRECTION_VERBS.has(seg.verb);

    if (!isIndirection) {
      const match = matchVerbAgainstGateList(seg.verb, seg.args);
      if (match) return `gate-verb:${match}`;
    }

    // Indirection predicate: env/xargs ONLY match when a following arg is
    // itself a gate-verb. Scan ALL args — env-assignments (`FOO=bar`,
    // lowercase included) and flag tokens (`-i`, `--`, `-0`, `-I{}`) may be
    // interposed before the wrapped command, so checking only args[0]
    // misses `env FOO=bar bash -c …` and `xargs -0 bash`.
    if (isIndirection) {
      for (const arg of seg.args) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue; // env-assignment
        if (arg.startsWith("-")) continue; // flag (incl. `--`)
        const argMatch = matchVerbAgainstGateList(basename(arg), []);
        if (argMatch) {
          return `gate-verb:${seg.verb}`;
        }
      }
    }
  }
  return null;
}

// Returns the matched verb key (e.g. "zsh", "node") if the verb matches a
// gate-verb entry; null otherwise. `args` is the segment's arg list (after
// the verb) — used for verb+flag entries (e.g. node -e, python -c).
// Indirection entries never match here directly; they only match via the
// indirection predicate in matchGateVerb.
// Flag matching covers three real forms: detached (`node -e`), attached
// value (`node --eval=…`), and single-char clusters (`perl -ne`, `node -pe`).
function matchVerbAgainstGateList(verb, args) {
  if (!verb) return null;
  const key = basename(verb);
  for (const entry of GATE_VERBS) {
    if (entry.verb !== key) continue;
    if (entry.indirection) continue; // matched via indirection predicate only
    if (entry.flags === null) return key; // verb-only entry
    const hasFlag = entry.flags.some((f) =>
      args.some(
        (a) =>
          a === f ||
          a.startsWith(f + "=") ||
          // single-char short flag inside a cluster (`-e` in `-ne`, `-pe`)
          (f.length === 2 &&
            f[0] === "-" &&
            a.length > 2 &&
            a[0] === "-" &&
            a[1] !== "-" &&
            a.slice(1).includes(f[1])),
      ),
    );
    if (hasFlag) return key;
  }
  return null;
}

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

// ─── Promoted Rules (meta-state as rule registry) ───

/** Whitelist for glob patterns to prevent path traversal. */
const GLOB_SCOPE_WHITELIST = [
  "product/",
  "docs/",
  "plans/",
  "tools/",
  "meta-state.jsonl",
  ...SURFACES.map((s) => `${s}/`),
];

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

export function projectHasLearningLoopMcp(root) {
  try {
    const cfgPath = join(root, ".mcp.json");
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return !!(
      cfg.mcpServers &&
      (cfg.mcpServers["learning-loop"] ||
        cfg.mcpServers["learning-loop-mcp"] ||
        cfg.mcpServers["learning-loop-mastra"])
    );
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
  // Legacy finding entries with promoted_to_rule were removed; all promoted
  // rules are now standalone rule entries.
  //
  // dedupe to max-version per id BEFORE
  // filtering by status. Without this dedupe, a rule that has been
  // deactivated (status: inactive on the new max-version line) would ALSO
  // show its prior active v0 line in the filter result, falsely reporting
  // the rule as active. The projection in core/read-registry-cache.js is
  // the canonical dedupe path; loadPromotedRules reads the raw file and
  // must mirror the projection locally (same algorithm, no full-rewrite).
  const seen = new Map();
  for (const entry of entries) {
    if (entry.entry_kind !== "rule") continue;
    const prior = seen.get(entry.id);
    if (!prior) { seen.set(entry.id, entry); continue; }
    const priorV = prior.version ?? 0;
    const nextV = entry.version ?? 0;
    if (nextV > priorV) { seen.set(entry.id, entry); continue; }
    if (nextV === priorV) {
      const priorT = prior.created_at ?? "";
      const nextT = entry.created_at ?? "";
      if (nextT > priorT) seen.set(entry.id, entry);
    }
  }
  let rules = Array.from(seen.values()).filter((e) => e.status === "active");

  // Schema validation: a malformed rule entry (typo, missing field,
  // invalid pattern_type) would crash applyPromotedRules. Validate
  // each entry and warn-and-skip on invalid. This closes the gap that
  // direct file appends (bypassing writeEntry's safeParse) would otherwise
  // create (review finding F-3).
  rules = rules.filter((r) => {
    const validation = metaStateRuleEntrySchema.safeParse(r);
    if (!validation.success) {
      console.warn(
        `Rule ${r.id ?? "<unknown>"}: schema validation failed, skipping. ` +
          `Errors: ${validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      return false;
    }
    return true;
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
 * Check if a determinism-checklist rule is satisfied.
 * Reads the registry and asserts absence of any active/reported finding
 * with the matching subtype and session_id.
 * Returns { satisfied: true } or { satisfied: false, blocking_id, rule_id, applies_to_resolution }.
 */

/**
 * Strip the documented suffix forms from an evidence_code_ref:
 *   - `:line` (single line, e.g. `tools/foo.js:12`)
 *   - `:start-end` (line range, e.g. `tools/foo.js:12-34`)
 *   - `#anchor` (function/symbol identifier)
 * Returns the bare file path. Anchor is stripped first so a compound
 * `path:start-end#anchor` (e.g. `tools/foo.js:12-34#methodName`) collapses
 * to the bare file, matching the documented syntax. Both regexes only
 * match the documented syntax, so paths with no suffix (e.g., "tools/foo.js")
 * are returned unchanged. See finding
 * meta-260607T1625Z-gate-line-suffix-not-stripped-from-evidence-code-ref
 * for the gate-bug this helper closes.
 */
export function stripEvidenceAnchor(codeRef) {
  if (typeof codeRef !== "string") return codeRef;
  // Strip #anchor suffix first (identifier chars: word, dot, dollar, dash, underscore, space)
  // so a compound `path:start-end#anchor` reduces to `path:start-end` before the next step.
  let stripped = codeRef.replace(/#[\w$.\s-]+$/, "");
  // Strip :line or :start-end range suffix (digits only — keeps Windows drive letters safe)
  stripped = stripped.replace(/:\d+(?:-\d+)?$/, "");
  // Strip dotted JSON key-path suffix (e.g., `package.json:simple-git-hooks.pre-commit`).
  // Requires at least one dot to distinguish a key-path from a single token; version-like
  // suffixes (`:1.0.0`) also match (digits are word chars) but collapsing them to the bare
  // file path is benign — version literals carry no grounding meaning.
  stripped = stripped.replace(/:[\w-]+(?:\.[\w-]+)+$/, "");
  return stripped;
}

// fallow-ignore-next-line complexity
export function checkResolutionEvidence(rule, root) {
  const rule_id = rule.id;

  // Branch 1: global orphan-evidence rule
  if (rule_id === "rule-no-orphaned-evidence") {
    const entries = readRegistry(root);
    const activeGrounded = entries.filter(
      (e) => e.entry_kind === "finding" && isOpen(e) && e.mechanism_check === true
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
      // LIM-4: realpath containment — rejects traversal/symlink/hardlink escape.
      // See core/path-containment.js. A missing file inside root (ENOENT,
      // resolvedPath === null) or a read-race FileNotFoundError is preserved as
      // code_ref_missing; security rejections (escape, hardlink, realpath_failed)
      // propagate. Invoked at moment of use per NF3.
      let currentHash;
      try {
        const absPath = resolveSafePath(root, stripEvidenceAnchor(codeRef));
        currentHash = computeFileHash(absPath);
      } catch (err) {
        const isMissing = err instanceof PathContainmentError
          ? (err.reason === "outside_root" && err.resolvedPath === null)
          : err.name === "FileNotFoundError";
        if (isMissing) {
          orphans.push({ id: entry.id, reason: "code_ref_missing" });
          continue;
        }
        throw err;
      }
      // Baseline resolution (red-team F2): the file-index
      // sidecar is the authoritative baseline, with the per-record field as the
      // vestigial fallback. Without repointing this gate, every edited source
      // file fails CI post-migration because the live hash no longer matches the
      // frozen per-record value. Both baselines are compared to the live hash;
      // a mismatch against the authoritative baseline is fingerprint_mismatch.
      const canonical = stripEvidenceAnchor(codeRef);
      const fileIndex = readFileIndex(root);
      const indexBaseline = fileIndex.has(canonical) ? fileIndex.get(canonical) : null;
      // Validate the per-record fallback against TERMINAL_HASH_REGEX (mirrors
      // checkGrounding's per-record branch): a corrupt stored value must never
      // be compared as a baseline — it's dropped to null so a malformed value
      // can't surface as a false fingerprint_mismatch.
      const perRecord = typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
        ? entry.code_fingerprint : null;
      const expected = indexBaseline ?? perRecord;
      if (expected && expected !== currentHash) {
        orphans.push({ id: entry.id, reason: "fingerprint_mismatch", expected, actual: currentHash });
      }
    }
    if (orphans.length > 0) {
      return { satisfied: false, rule_id: "rule-no-orphaned-evidence", blocking_id: orphans[0]?.id, applies_to_resolution: rule.applies_to_resolution, orphans };
    }
    return { satisfied: true, rule_id: "rule-no-orphaned-evidence" };
  }

  // Branch 2: existing per-finding determinism-checklist rules
  const { pattern, applies_to_resolution } = rule;
  const entries = readRegistry(root);
  const blocking = entries.find((e) =>
    e.entry_kind === "finding"
    && e.subtype === "mcp-client-loading"
    && e.session_id === pattern
    && isOpen(e),
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

// ─── Promoted-rule provenance helpers ────────────────────────────────────────
//
// Event-source markers (frozen vocabulary). The evaluator is the ONLY
// automatic-candidate producer; toolchain-failure capture is a separate explicit
// source (its own branch in the recurrence tracker). `event_source` is a producer
// marker, never user-supplied classification.
const EVENT_SOURCE_BASH_GATE_EVALUATOR = "bash-gate-evaluator";

// Provenance for a matched rule. Decision stays fail-closed:
//   - a real executable match keeps `decision: "escalate"` with the classifier
//     provenance filled (ordinary-rule-fire / executable);
//   - a parser-proven inert-data match (the raw text carries a banned-looking
//     shape but the whole match lies inside an inert region the gate blanked)
//     is a SEPARATE non-permission telemetry event: `decision: "ok"` plus
//     `event: "unexpected-match"`, never an allow override.
// The classifier never throws; the try/catch is belt-and-suspenders so a future
// classifier throw can never reach applyPromotedRules' catch/continue and turn a
// matched command into `{decision:"ok"}`.
function buildPromotedMatchResult(command, rule) {
  const base = {
    decision: "escalate",
    reason: `Promoted rule "${rule.id}" matched: ${rule.pattern}`,
    rule_id: rule.id,
    meta_state_id: rule.id,
    pattern_type: rule.pattern_type,
  };

  // The gate already proved the regex matched; classify for provenance only.
  let event;
  try {
    event = command != null
      ? classifyCommand(command, { mode: "event", rulePattern: rule.pattern })
      : null;
  } catch {
    event = null;
  }

  const match_origin = event?.match_origin ?? "unknown";
  const candidate_kind = event?.candidate_kind ?? "unclassified";

  // Kill-switch guard: GATE_HEREDOC_BLANKER=0 short-circuits the heredoc
  // blanker, so the gate evaluated the command un-blanked and the classifier's
  // inert proof is UNSOUND for heredoc-derived spans. A match under the
  // kill-switch must escalate as a visible command (a real executor shape is
  // not inert data just because the kill-switch turned the blanker off).
  if (process.env.GATE_HEREDOC_BLANKER === "0") {
    if (command == null) return base;
    return {
      ...base,
      event_source: EVENT_SOURCE_BASH_GATE_EVALUATOR,
      match_origin,
      candidate_kind,
    };
  }

  if (match_origin === "inert-data" && candidate_kind === "unexpected-match") {
    // Proven inert-data: the raw text does not actually violate (it is data),
    // so the permission decision stays ok while a separate unexpected-match
    // telemetry event is emitted. Never weakens a real executable match —
    // `bash -c "vitest ..." | tail` classifies executable and escalates.
    return {
      decision: "ok",
      reason: "inert-data match (unexpected-match telemetry)",
      rule_id: rule.id,
      meta_state_id: rule.id,
      pattern_type: rule.pattern_type,
      event: "unexpected-match",
      event_source: EVENT_SOURCE_BASH_GATE_EVALUATOR,
      match_origin,
      candidate_kind,
    };
  }

  // Real executable / mixed / unknown match: keep the escalate decision with the
  // provenance filled. A rule that matched via a glob path (command == null)
  // has no command provenance — omit the fields (absent, not guessed).
  if (command == null) return base;
  return {
    ...base,
    event_source: EVENT_SOURCE_BASH_GATE_EVALUATOR,
    match_origin,
    candidate_kind,
  };
}

// fallow-ignore-next-line complexity
export function applyPromotedRules(command, filePath, rules, root = findProjectRoot()) {
  const override = readGateOverride(root);
  const overrideSet = override ? new Set(override.rule_ids) : new Set();

  // Proven inert-data telemetry is deferred to AFTER the full rule loop: an
  // `event: "unexpected-match"` marker is a non-permission telemetry event, so
  // it must never short-circuit evaluation of later rules. If any LATER rule
  // matches a real violation, that escalate wins and this pending marker is
  // discarded. Only when the whole loop finds no real violation is the single
  // (first) inert marker returned as `{decision:"ok", event:"unexpected-match"}`.
  let pendingTelemetry = null;

  for (const rule of rules) {
    // Defense-in-depth: skip rules that should not have been loaded.
    // loadPromotedRules already filters to entry_kind="rule" + status="active",
    // but we double-check status here for safety.
    if (rule.status !== "active") continue;

    if (rule.pattern_type === "agent-checklist") {
      // Design-time rule; no command/path matching. The audit lives in the
      // check_runtime_agnostic MCP tool and the runtime-agnostic regression test.
      // The rule loads; the gate ignores it.
      continue;
    }

    if (rule.enforcement !== "gate") continue;
    if (overrideSet.has(rule.id)) {
      console.warn(`Rule ${rule.id}: skipped via gate override (${override.operator_note ?? "no note"})`);
      continue;
    }

    const { pattern_type, pattern, id: rule_id } = rule;
    let matched = false;

    try {
      if (pattern_type === "determinism-checklist") {
        // This pattern type is not a command-path match. The check happens in
        // meta_state_resolve (the per-tool gate). Skip here silently — the
        // bash gate always has `command` set, so a defensive warning would
        // fire on every single Execute invocation (regression caught by
        // gate-determinism-checklist.test.js#does NOT warn when...).
        continue;
      } else if (pattern_type === "regex" && command) {
        if (!isSafeRegexPattern(pattern)) {
          console.warn(`Rule ${rule_id}: regex pattern rejected by safety check`);
          continue;
        }
        const re = new RegExp(pattern);
        // Heredoc pre-pass at the top of the regex branch: blank quoted-
        // delimiter heredoc bodies for the promoted-rule allowlist
        // (DATA_COMMANDS ∪ {cat, tee} ∪ node-family). Node-family is an
        // accepted bypass here (JS source is data to the shell gate, sibling
        // of the documented stripNodeEvalBody limitation). The pass runs ONCE
        // over the whole command so both the per-segment pass below and the
        // fullStripped chain share the blanked form. Null-guard: applyPromotedRules
        // is called with command=null by evaluate-write-gate.js — the regex
        // branch already null-guards, and the pre-pass must too.
        const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_PROMOTED);
        // Per-segment: a forbidden token in any leg of a compound command
        // (splitSegments splits on ; & |, honoring quotes). This remains the
        // primary match surface so substring rules behave exactly as before.
        // applyInertSinkBlanking runs once over the whole command first, because
        // deciding whether an echo segment's prose is inert needs the sibling
        // pipe target that splitSegments discards. It blanks echo/printf quoted
        // args where the segment has no real pipe at all (bare `echo "x"` —
        // the common case) or where the printed output routes to a configured
        // inert sink; a redirect, an exec segment, or a pipe to anything else
        // preserves the prose, so the bypass shapes still match here.
        const echoSafe = applyInertSinkBlanking(heredocSafe);
        for (const segment of splitSegments(echoSafe)) {
          const stripped = stripMessageFlags(segment);
          const nodeStripped = stripNodeEvalBody(stripped);
          const dataStripped = stripDataCommandQuotes(nodeStripped);
          const cliStripped = stripCliArgvPayload(dataStripped);
          if (re.test(cliStripped)) {
            matched = true;
            break;
          }
        }
        // Full-command: patterns that span a delimiter splitSegments removes
        // (e.g. a literal pipe: `vitest run ... | tail`) are unreachable
        // per-segment, because no segment retains the delimiter. Test the
        // full command as a second pass. This is a strict superset: a pattern
        // that matches the full command either matches a segment already
        // (substring/alternation rules — the matched text lives in some
        // segment) or spans a removed delimiter (newly reachable). The data-
        // command strip is applied here too so a banned token living only in a
        // grep/jq pattern on one side of a real pipe cannot pair with the pipe
        // to false-positive. stripEchoProse extends the same reasoning to
        // echo/printf: a banned token living only in an echo label on one side
        // of a real read-only pipe (grep/tail/head) cannot pair with it to
        // false-escalate. stripCliArgvPayload extends it to the loop CLI
        // inline-JSON argv (canonical `node .../bin/loop.mjs <tool> <quoted>`):
        // a banned token living only in that JSON data cannot run, so it cannot
        // pair with a real pipe to false-escalate. The blanking is quote-kind-
        // aware — a double-quoted `$(...)` argv is real execution and stays
        // visible (see stripCliArgvPayload). Executed-body verbs (bash -c, sh -c,
        // python -c, awk, sed) are deliberately NOT stripped here — their quoted
        // bodies run, so a banned token in `bash -c "vitest run" | tail` is a
        // real violation. stripDataCommandQuotes/stripEchoProse/stripCliArgvPayload
        // preserve ; & | (quote-aware split) so spanning patterns still match
        // real violations.
        if (!matched) {
          const fullStripped = stripEchoProse(stripDataCommandQuotes(stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(heredocSafe)))));
          if (re.test(fullStripped)) {
            matched = true;
          }
        }
        // Dual-view inert-data telemetry: the gate blanked the raw match (so
        // `matched` stayed false), but the RAW command still carries the
        // banned-looking shape. If the classifier proves the raw match lies
        // ENTIRELY inside an inert region the gate blanked (quoted heredoc
        // body, node -e body, echo prose, data-command quote), emit the
        // separate `event: "unexpected-match"` telemetry marker with decision
        // staying ok. Cheap pre-filter: the raw command must contain the raw
        // pattern before we spend a classify. A non-inert (executable) raw
        // match is NOT emitted here — only the discrimated inert-data pair.
        // `buildPromotedMatchResult` returns `event: "unexpected-match"` only
        // for that pair; anything else is discarded so a non-matched command
        // can never be flipped to escalate.
        //
        // Deferred, never returned inline: the inert marker is recorded and
        // the loop CONTINUES, because a real violation from a LATER rule in
        // the same compound command must still escalate. Returning here would
        // mask e.g. a `rule-no-raw-stdout-vitest` violation chained behind an
        // inert `rule-no-new-artifact-types` heredoc. `if (!pendingTelemetry)`
        // keeps the FIRST inert marker (deterministic) while a real escalate
        // on any rule returns from inside the loop and discards it.
        //
        // Kill-switch guard: when GATE_HEREDOC_BLANKER=0 the blanker returns
        // the command unchanged, so the inert classification is UNSOUND — the
        // body was never proven inert by the gate and a real executor shape
        // must escalate. Skip the telemetry path entirely so the raw match
        // reaches the normal escalate branch.
        if (!matched && command != null && process.env.GATE_HEREDOC_BLANKER !== "0" && re.test(command)) {
          const prov = buildPromotedMatchResult(command, rule);
          if (prov.event === "unexpected-match") {
            if (!pendingTelemetry) pendingTelemetry = prov;
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
      return buildPromotedMatchResult(command, rule);
    }
  }
  // No rule produced a real violation. If the loop recorded a proven inert-data
  // unexpected-match marker, surface it now (decision stays ok — it is a
  // non-permission telemetry event). An ordinary no-match still returns ok.
  if (pendingTelemetry) return pendingTelemetry;
  return { decision: "ok" };
}

// ─── Staleness helpers ───
// the inbound + bash gates share a unified
// observation-staleness primitive now (`core/observation-staleness.js` +
// `OBSERVATION_STALENESS_WINDOW_MS` in `core/constants.js`). The previous
// gate-local `findStaleObservations` + `STALENESS_THRESHOLD_MS` are gone.
