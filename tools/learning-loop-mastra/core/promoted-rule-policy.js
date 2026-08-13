// promoted-rule-policy.js — pure Promoted Rule Policy module.
//
// Owns I3 ordering, scope predicates, gate overrides, pattern safety, command
// (regex) and path (glob) matching, provenance, the deferred inert-data
// telemetry marker, the heredoc kill-switch guard, and enforcement result
// shaping. Consumes the compiled grounded I3 projection from `readRuleIndex`;
// Rule loading, history collapse, shared schema validation, evidence grounding,
// and I2 delivery live behind that projection and are not this module's concern.
// This is a gate/action-boundary policy, not a Rule authority, and it makes no
// lifecycle or registry mutations.
//
// Subject-level interfaces are narrow: a command policy evaluates an interpreted
// command against I3 regex Rules; a path policy evaluates a file path against
// I3 glob Rules. No caller may recreate the matching, precedence, or telemetry
// rules here.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { interpretCommand } from "./command-interpretation.js";
import { readGateOverride } from "./gate-override.js";
import { SURFACES } from "./surfaces.js";

const EVENT_SOURCE_BASH_GATE_EVALUATOR = "bash-gate-evaluator";

// Whitelist for I3 glob patterns to prevent path traversal. `<surface>` patterns
// are derived from the current Runtime surfaces so they cannot drift.
const GLOB_SCOPE_WHITELIST = [
  "product/",
  "docs/",
  "plans/",
  "tools/",
  "meta-state.jsonl",
  ...SURFACES.map((s) => `${s}/`),
];

function expandBraces(pattern) {
  const match = pattern.match(/^(.*?)\{([^}]+)\}(.*)$/);
  if (!match) return [pattern];
  const [, pre, options, post] = match;
  return options.split(",").flatMap((opt) => expandBraces(pre + opt.trim() + post));
}

/**
 * Deterministic glob match with brace expansion. Re-exported by gate-logic.js for
 * existing callers; owned here as a promoted-rule-policy primitive.
 */
export function globMatch(pattern, filePath) {
  const patterns = expandBraces(pattern);
  return patterns.some((p) => {
    const regexStr = p
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "⟨GLOBSTAR⟩")
      .replace(/\*/g, "[^/]*")
      .replace(/⟨GLOBSTAR⟩/g, ".*");
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(filePath);
  });
}

/**
 * Simple regex safety check to prevent ReDoS. Rejects patterns where a group
 * with an inner quantifier is itself quantified (star height > 1), the canonical
 * ReDoS pattern (`(a+)+`, `(a*)*`, `(a+)?`). Distinguishes top-level
 * quantifiers (allowed) from nested (rejected). Lightweight replacement for the
 * safe-regex package. Re-exported by gate-logic.js for existing callers.
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
      // Propagate: the group that just closed contained a quantifier, so the
      // parent (real group, depth > 0) now conceptually contains a quantified
      // subpattern. Propagation to depth 0 is a no-op (top-level quantifiers are
      // not "nested" — they are in different alternatives or separated by
      // non-group tokens).
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
      if (
        i > 0 &&
        pattern[i - 1] === ")" &&
        depth + 1 < groupHadQuantifier.length &&
        groupHadQuantifier[depth + 1]
      ) {
        return false;
      }
      for (let d = 1; d <= depth && d < groupHadQuantifier.length; d++) {
        if (groupHadQuantifier[d]) return false;
      }
      if (depth > 0 && depth < groupHadQuantifier.length) {
        groupHadQuantifier[depth] = true;
      }
    }
  }

  return true;
}

/**
 * Whether a glob pattern is confined to the known surface prefix whitelist.
 * Re-exported by gate-logic.js for existing callers.
 */
export function isGlobScopeWhitelisted(pattern) {
  if (!pattern || typeof pattern !== "string") return false;
  return GLOB_SCOPE_WHITELIST.some((prefix) => pattern.startsWith(prefix));
}

/**
 * Whether a project declares the loop MCP in its `.mcp.json` (scope predicate
 * truth source). Re-exported by gate-logic.js for existing callers.
 */
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
 * Build the enforcement result for a matched I3 Rule, preserving the exact
 * provenance and decision-shaping contract. A parser-proven inert-data match is
 * a non-permission telemetry event (`decision: "ok"` + `event:
 * "unexpected-match"`); a real executable / mixed / unknown match escalates.
 * Under the heredoc kill-switch, an un-blanked heredoc match always escalates
 * because the inert proof is unsound for heredoc-derived spans.
 */
// fallow-ignore-next-line complexity -- provenance shaping covers kill-switch, inert-data telemetry, and executable escalation; each branch is a preserved decision shape
function buildMatchResult(command, rule, facts = null) {
  const base = {
    decision: "escalate",
    reason: `Promoted rule "${rule.id}" matched: ${rule.pattern}`,
    rule_id: rule.id,
    meta_state_id: rule.id,
    pattern_type: rule.pattern_type,
  };

  const match_origin = facts?.match_origin ?? "unknown";
  const candidate_kind = facts?.candidate_kind ?? "unclassified";

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

  if (command == null) return base;
  return {
    ...base,
    event_source: EVENT_SOURCE_BASH_GATE_EVALUATOR,
    match_origin,
    candidate_kind,
  };
}

/**
 * Filter the compiled I3 projection to active Rules matching the project scope
 * predicate. Unknown scope predicates warn and default to included (current
 * behavior). Returns them in the index's deterministic ordering.
 */
// fallow-ignore-next-line complexity -- scope predicate dispatch over a known enum plus an unknown-predicate default; the mapping is the policy
function scopeFilteredI3(i3Rules, root) {
  const scoped = [];
  for (const rule of i3Rules ?? []) {
    const predicate = rule.scope_predicate;
    if (!predicate || predicate === "none") {
      scoped.push(rule);
      continue;
    }
    if (predicate === "project_has_learning_loop_mcp") {
      if (projectHasLearningLoopMcp(root)) scoped.push(rule);
      continue;
    }
    console.warn(`Rule ${rule.id}: unknown scope_predicate "${predicate}"`);
    scoped.push(rule);
  }
  return scoped;
}

// Shared enforcement loop over the scoped I3 projection. Any matched Rule
// short-circuits the loop. Proven inert-data telemetry is deferred to after the
// loop and only surfaces if no real violation matched.
// fallow-ignore-next-line complexity -- per-rule match loop with override, safety, and provenance accounting; the precedence, override, and telemetry ordering are the preserved contract
function evaluateI3({ command, filePath, root, i3Rules }) {
  const scopedRules = scopeFilteredI3(i3Rules, root);
  const override = readGateOverride(root);
  const overrideSet = override ? new Set(override.rule_ids) : new Set();
  const interpretation = command != null ? interpretCommand(command) : null;

  let pendingTelemetry = null;

  for (const rule of scopedRules) {
    if (rule.status !== "active") continue;
    if (rule.internalization_level !== "I3") continue;
    if (rule.pattern_type === "agent-checklist" || rule.pattern_type === "determinism-checklist") continue;
    if (overrideSet.has(rule.id)) {
      console.warn(`Rule ${rule.id}: skipped via gate override (${override.operator_note ?? "no note"})`);
      continue;
    }

    const { pattern_type, pattern, id: rule_id } = rule;
    let matched = false;
    let matchFacts = null;
    try {
      if (pattern_type === "regex" && command) {
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
          const prov = buildMatchResult(command, rule, matchFacts);
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
      return buildMatchResult(command, rule, matchFacts);
    }
  }

  if (pendingTelemetry) return pendingTelemetry;
  return { decision: "ok" };
}

/**
 * Subject-level command interface. Evaluate the compiled I3 projection against an
 * interpreted command, applying scope, override, safety, provenance, and telemetry
 * policy. `i3Rules` must be the compiled I3 projection (`readRuleIndex(root).i3`
 * or the I3 slice of `loadGroundedPromotedRules(root)`); Rule loading, history
 * collapse, schema validation, and evidence grounding stay at that loader. Returns the
 * enforcement result object.
 *
 * @param {{ command: string|null|undefined, root: string, i3Rules: Array<object> }} params
 * @returns {{ decision: string, reason?: string, rule_id?: string, meta_state_id?: string, pattern_type?: string, event?: string, event_source?: string, match_origin?: string, candidate_kind?: string }}
 */
export function evaluateI3CommandPolicy({ command, root, i3Rules = [] }) {
  return evaluateI3({ command, filePath: null, root, i3Rules });
}

/**
 * Subject-level path interface. Evaluate the compiled I3 projection against a file
 * path, applying the same scope, override, safety, and result policy for glob
 * Rules. Returns the enforcement result object.
 *
 * @param {{ filePath: string, root: string, i3Rules: Array<object> }} params
 * @returns {{ decision: string, reason?: string, rule_id?: string, meta_state_id?: string, pattern_type?: string, event?: string, event_source?: string, match_origin?: string, candidate_kind?: string }}
 */
export function evaluateI3PathPolicy({ filePath, root, i3Rules = [] }) {
  return evaluateI3({ command: null, filePath, root, i3Rules });
}
