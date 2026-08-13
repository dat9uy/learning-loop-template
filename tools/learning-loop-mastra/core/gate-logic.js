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

import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { SURFACES } from "./surfaces.js";
import { classifyPolicyTokens, resolveVerbIndex } from "./shell-parse.js";
import { interpretCommand } from "./command-interpretation.js";
import { readRegistry, readFileIndex, toLegacyRuleView } from "./meta-state.js";
import { computeFileHash, TERMINAL_HASH_REGEX } from "./check-grounding.js";
import { readGateOverride } from "./gate-override.js";
import { resolveSafePath, PathContainmentError } from "./path-containment.js";
import { isOpen } from "./stale-view.js";
import { CONSTRAINT_PATTERNS, GATE_VERBS, INDIRECTION_VERBS } from "./pattern-config.js";
import { readRuleIndex } from "./rule-index.js";
import { stripEvidenceAnchor } from "./evidence-ref.js";

// fallow-ignore-next-line unused-export -- preserve the long-standing named export for existing Core consumers
export { stripEvidenceAnchor };

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  normalizeQuoteConcatenation,
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
  normalizeQuoteConcatenation,
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
  // Quote-concatenation normalization: fold adjacent-quote splits (`s''udo` →
  // `sudo`) so the first-class constraint regexes (docker/sudo/package-manager/
  // vendor-api) see the joined form, not the raw split text. The verb layer is
  // already immune; this closes the same gap for the raw-text regex surface.
  const quoteSafe = normalizeQuoteConcatenation(heredocSafe);

  for (const segment of splitSegments(quoteSafe)) {
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
// fallow-ignore-next-line complexity -- single-pass character state machine (depth/groupHadQuantifier/inCharClass/escaped); the 3 documented nested-quantifier cases are load-bearing
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

/**
 * One-way compatibility adapter for callers that still consume the old
 * `enforcement` field. The Rule index owns reading, history collapse,
 * validation, and I3 grounding; this adapter only applies the existing
 * project-scope predicate and creates the legacy view.
 */
const promotedRulesCache = new Map();
const groundedPromotedRulesCache = new Map();

/**
 * Temporary compatibility adapter for callers that still consume the old
 * loader. Action-boundary and delivery consumers must use the grounded
 * adapter below while callers migrate.
 */
// fallow-ignore-next-line unused-export -- temporary one-way compatibility seam while legacy callers migrate
export function loadPromotedRules(root) {
  const index = readRuleIndex(root, { includeUnresolvedI3: true });
  return loadPromotedRulesView(root, index, promotedRulesCache);
}

/** Read the validated, grounded Rule projection for action and delivery use. */
export function loadGroundedPromotedRules(root) {
  const index = readRuleIndex(root);
  return loadPromotedRulesView(root, index, groundedPromotedRulesCache);
}

function loadPromotedRulesView(root, index, cache) {
  const cached = cache.get(root);
  if (cached && cached.index === index) return cached.rules;

  for (const diagnostic of index.diagnostics) {
    if (diagnostic.code === "malformed_registry_line") {
      console.warn(
        `Rule registry line ${diagnostic.line}: malformed JSON, skipping. ${diagnostic.message}`,
      );
    } else if (diagnostic.code === "invalid_rule") {
      console.warn(
        `Rule ${diagnostic.rule_id ?? "<unknown>"}: schema validation failed, skipping. ` +
          `Errors: ${diagnostic.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
      );
    } else if (diagnostic.code === "grounding_unresolved") {
      console.warn(
        `Rule ${diagnostic.rule_id ?? "<unknown>"}: I3 evidence grounding unresolved ` +
          `(${diagnostic.grounding.reason ?? "unknown"}).`,
      );
    }
  }

  const rules = [...index.i2, ...index.i3].filter((r) => {
    const predicate = r.scope_predicate;
    if (!predicate || predicate === "none") return true;
    if (predicate === "project_has_learning_loop_mcp") {
      return projectHasLearningLoopMcp(root);
    }
    console.warn(`Rule ${r.id}: unknown scope_predicate "${predicate}"`);
    return true;
  });
  const legacyRules = rules.map(toLegacyRuleView);
  cache.set(root, { index, rules: legacyRules });
  return legacyRules;
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
// Build the machine-readable `recovery` list for an orphan-evidence rejection.
// Each step names the tool + args the agent should run next and why — the
// remediation that the structured rejection otherwise hides (finding
// meta-260801T2348Z-structured-rejections-name-the-blocking-rule-and-orphans-but).
// Per orphan reason:
//   - fingerprint_mismatch  → refresh_file_index with the cited path (re-grounds
//     the drifted baseline), then the freshness step the finding supports:
//     re_verify when verification.steps is set, else touch (attestation).
//   - code_ref_missing      → re-anchor guidance (the path is operator judgment:
//     restore the file, or patch the finding to a live evidence path)
//   - no_evidence_code_ref  → attach-evidence guidance via patch
function buildOrphanRecovery(orphans) {
  const recovery = [];
  for (const orphan of orphans) {
    const { id, reason, evidence_code_ref, verification_mode = "attestation" } = orphan;
    if (reason === "fingerprint_mismatch" && evidence_code_ref) {
      recovery.push({
        tool: "meta_state_refresh_file_index",
        args: { path: evidence_code_ref },
        why: `cited fingerprint drifted — refresh the file-index baseline to the live hash`,
      });
      const reGroundTool = verification_mode === "steps" ? "meta_state_re_verify" : "meta_state_touch";
      const reGroundArgs = { id };
      recovery.push({
        tool: reGroundTool,
        args: reGroundArgs,
        why: verification_mode === "steps"
          ? `re-run the finding's verification steps against the refreshed evidence`
          : `re-ground the finding against the refreshed baseline (operator attestation)`,
      });
    } else if (reason === "code_ref_missing") {
      recovery.push({
        tool: "meta_state_patch",
        args: { id, patch: { evidence_code_ref: "<restored-or-new-path>" } },
        why: "cited evidence file is missing — restore the file or patch the finding to a live evidence path",
      });
    } else if (reason === "no_evidence_code_ref") {
      recovery.push({
        tool: "meta_state_patch",
        args: { id, patch: { evidence_code_ref: "<evidence-path>" } },
        why: "finding opted into mechanism_check without evidence — attach an evidence_code_ref",
      });
    }
  }
  return recovery;
}

// fallow-ignore-next-line complexity -- Branch-1 orphan loop delegates to evaluateOrphanCandidate; Branch-2 determinism-checklist is a 3-condition find. Splitting per-branch keeps the global vs per-finding contract distinct
export function checkResolutionEvidence(rule, root) {
  const rule_id = rule.id;

  // Branch 1: global orphan-evidence rule
  if (rule_id === "rule-no-orphaned-evidence") {
    const entries = readRegistry(root);
    const orphans = entries
      .filter((e) => e.entry_kind === "finding" && isOpen(e) && e.mechanism_check === true)
      .map((entry) => evaluateOrphanCandidate(entry, root))
      .filter(Boolean);
    if (orphans.length > 0) {
      return { satisfied: false, rule_id: "rule-no-orphaned-evidence", blocking_id: orphans[0]?.id, applies_to_resolution: rule.applies_to_resolution, orphans, recovery: buildOrphanRecovery(orphans) };
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

/**
 * Evaluate one active mechanism-checked finding for orphan-evidence drift.
 * Returns an orphan record
 * `{ id, reason, evidence_code_ref?, verification_mode?, expected?, actual? }`
 * when the entry is orphaned (no evidence code ref, code ref missing, or
 * fingerprint mismatch), or null when the entry grounds cleanly. The canonical
 * `evidence_code_ref` (anchor-stripped) rides the record so the consuming
 * rejection can name the exact path the agent must refresh / re-anchor — the
 * remediation the structured rejection otherwise hides (see finding
 * meta-260801T2348Z-structured-rejections-name-the-blocking-rule-and-orphans-but).
 * `verification_mode` tells the recovery builder which freshness re-ground step
 * the finding supports: "steps" (re_verify) when verification.steps is set,
 * else "attestation" (touch).
 *
 * Baseline resolution (red-team F2): the file-index sidecar is the
 * authoritative baseline, with the per-record field as the vestigial fallback.
 * Both baselines are compared to the live hash; a mismatch against the
 * authoritative baseline is fingerprint_mismatch.
 */
// fallow-ignore-next-line complexity -- extracted Branch-1 orphan evaluation: LIM-4 path resolution + hash guard + dual-baseline comparison; the guard chain is the canonical shape
function evaluateOrphanCandidate(entry, root) {
  const codeRef = entry.evidence_code_ref;
  const verificationMode = Array.isArray(entry.verification?.steps) && entry.verification.steps.length > 0
    ? "steps" : "attestation";
  if (!codeRef) {
    return { id: entry.id, reason: "no_evidence_code_ref", verification_mode: verificationMode };
  }
  const canonical = stripEvidenceAnchor(codeRef);
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
      return { id: entry.id, reason: "code_ref_missing", evidence_code_ref: canonical, verification_mode: verificationMode };
    }
    throw err;
  }
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
    return { id: entry.id, reason: "fingerprint_mismatch", evidence_code_ref: canonical, verification_mode: verificationMode, expected, actual: currentHash };
  }
  return null;
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
// The interpretation interface never throws and keeps unknown provenance
// visible. The caller adds the gate decision and telemetry envelope here; the
// interpretation itself remains policy-neutral.
function buildPromotedMatchResult(command, rule, facts = null) {
  const base = {
    decision: "escalate",
    reason: `Promoted rule "${rule.id}" matched: ${rule.pattern}`,
    rule_id: rule.id,
    meta_state_id: rule.id,
    pattern_type: rule.pattern_type,
  };

  const match_origin = facts?.match_origin ?? "unknown";
  const candidate_kind = facts?.candidate_kind ?? "unclassified";

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

// fallow-ignore-next-line complexity -- per-rule match loop with strip helpers (heredoc/sinks/segments/message-flags/node-eval/data-quotes/cli-argv) + two-pass segment/full matching; extraction would scatter the match surface
export function applyPromotedRules(command, filePath, rules, root = findProjectRoot()) {
  const override = readGateOverride(root);
  const overrideSet = override ? new Set(override.rule_ids) : new Set();
  const interpretation = command != null ? interpretCommand(command) : null;

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

    if (rule.internalization_level !== "I3") continue;
    if (overrideSet.has(rule.id)) {
      console.warn(`Rule ${rule.id}: skipped via gate override (${override.operator_note ?? "no note"})`);
      continue;
    }

    const { pattern_type, pattern, id: rule_id } = rule;
    let matched = false;
    let matchFacts = null;

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
        matchFacts = interpretation?.matchRule(rule) ?? {
          matched: false,
          supported: false,
          match_origin: "unknown",
          candidate_kind: "unclassified",
          raw_match: null,
        };
        matched = matchFacts.matched;
        if (!matched && process.env.GATE_HEREDOC_BLANKER !== "0" && matchFacts.candidate_kind === "unexpected-match") {
          const prov = buildPromotedMatchResult(command, rule, matchFacts);
          if (!pendingTelemetry) pendingTelemetry = prov;
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
      return buildPromotedMatchResult(command, rule, matchFacts);
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
