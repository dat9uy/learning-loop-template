/**
 * Bash-gate evaluator. Combines constraint-pattern, path-write, and promoted-rules checks.
 *
 * @param {{ command: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, hard_block?: boolean, constraint_type?: string, rule_id?: string, pattern_type?: string }}
 */

import {
  matchConstraintPattern,
  matchGateVerb,
  checkObservationExists,
  makeGateDecision,
  loadPromotedRules,
  applyPromotedRules,
  findProjectRoot,
} from "./gate-logic.js";
import { readRuntimeObservations } from "./file-readers.js";
import { checkObservationStaleness } from "./inbound-state.js";
import { isObservationStaleByAge } from "./observation-staleness.js";
import { hasSurfacePreflightMarker } from "./runtime-tracking.js";
import { SURFACES } from "./surfaces.js";

// Escape regex metacharacters in a literal path segment. Surface names start
// with ".", which is a regex metachar, so it must be escaped to match literally.
function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Preflight-marker path-write patterns, derived from SURFACES so every runtime
// surface's coordination/.loop-preflight-* redirect is detected without
// hand-rolling per-surface regex literals. Two forms per surface: shell redirect
// (`>`/`>>`) and `tee`. Built once at module load.
function preflightMarkerPatterns() {
  return SURFACES.flatMap((surface) => {
    const seg = escapeForRegex(surface);
    return [
      new RegExp(`>{1,2}\\s*["']?\\.?\\/?${seg}\\/coordination\\/\\.loop-preflight-[^\\s"';&|]+["']?`),
      new RegExp(`\\btee\\b.*["']?\\.?\\/?${seg}\\/coordination\\/\\.loop-preflight-[^\\s"';&|]+["']?`),
    ];
  });
}

// Runtime-state path-write patterns (shell redirect + tee to
// runtime-state.jsonl). Split out of the shared records block so the bash
// gate can exempt these matches when an active
// `.loop-preflight-runtime-state-edit` marker is present (mirrors the
// write-gate preflight delegation in evaluate-write-gate.js).
// fallow-ignore-next-line unused-export
export const RUNTIME_STATE_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?runtime-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?runtime-state\.jsonl["']?/,
];

// Path-write detection patterns (bash-specific).
// Preflight-marker patterns are derived from SURFACES (all runtime surfaces).
// runtime-state patterns are named so evaluateBashGate can exempt them when
// the `.loop-preflight-runtime-state-edit` marker is active.
// fallow-ignore-next-line unused-export
export const PATH_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  /<<['"]?\w+['"]?\s*>\s*["']?\.?\/?records\//,
  /\btee\b.*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  ...preflightMarkerPatterns(),
  />{1,2}\s*["']?\.?\/?meta-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?meta-state\.jsonl["']?/,
  ...RUNTIME_STATE_WRITE_PATTERNS,
  />{1,2}\s*["']?\.?\/?\.loop\/runtime-tracking\.json["']?/,
  /\btee\b.*["']?\.?\/?\.loop\/runtime-tracking\.json["']?/,
];

// Every gated path-write EXCEPT runtime-state.jsonl. Evaluated independently
// of the runtime-state branch below so that a runtime-state match covered by
// an active preflight marker cannot mask a records/**, meta-state.jsonl,
// preflight-marker, or runtime-tracking write chained into the same command
// (`echo ok > runtime-state.jsonl && echo evil > records/x.md`).
const NON_RUNTIME_STATE_PATH_WRITE_PATTERNS = PATH_WRITE_PATTERNS.filter(
  (p) => !RUNTIME_STATE_WRITE_PATTERNS.includes(p),
);

function commandWritesToGatedPath(command) {
  if (!command || typeof command !== "string") return false;
  return NON_RUNTIME_STATE_PATH_WRITE_PATTERNS.some((p) => p.test(command));
}

// True when a runtime-state path-write pattern matches the command (redirect
// or tee to runtime-state.jsonl). Used by evaluateBashGate to gate the
// preflight exemption on a runtime-state-specific match — so an active marker
// does NOT bleed into records/**, meta-state.jsonl, or runtime-tracking.json.
function commandWritesToRuntimeState(command) {
  if (!command || typeof command !== "string") return false;
  return RUNTIME_STATE_WRITE_PATTERNS.some((p) => p.test(command));
}

// fallow-ignore-next-line complexity
export function evaluateBashGate({ command, root }) {
  if (!command || typeof command !== "string") {
    return { decision: "ok" };
  }

  const resolvedRoot = root || findProjectRoot();

  let constraintResult = null;
  let pathResult = null;

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(command);
  if (constraintMatch) {
    const observations = readRuntimeObservations(resolvedRoot);
    const observationStatus = checkObservationExists(constraintMatch, observations);

    constraintResult = makeGateDecision(constraintMatch, observationStatus);

    // Staleness check for non-hard-block decisions
    if (!constraintResult.hard_block) {
      const staleness = checkObservationStaleness(observations, resolvedRoot);
      if (staleness.stale) {
        constraintResult.inbound_gate = true;
        if (constraintResult.decision === "ok") {
          constraintResult.decision = "escalate";
          constraintResult.reason = staleness.reason;
          constraintResult.observation_id = staleness.observation_id;
        }
      }
    }
  }

  // --- Gate-verb constraint check (executor + indirection verbs) ---
  // Observation-gated, same decision shape as docker/sudo. Runs alongside
  // matchConstraintPattern — either match escalates; the more severe wins
  // (hard_block dominates).
  const gateVerbMatch = matchGateVerb(command);
  if (gateVerbMatch) {
    const observations = readRuntimeObservations(resolvedRoot);
    let observationStatus = checkObservationExists(gateVerbMatch, observations);
    // Gate-verb observations are age-bounded: unlike the marker-mode
    // staleness below (which only flips when a fresh operator marker
    // post-dates the observation), a `gate-verb:<verb>` observation expires
    // on age alone after OBSERVATION_STALENESS_WINDOW_MS (30 min). This is
    // what makes the recorded allowance a bounded window rather than an
    // indefinite one. Scoped to gate-verb constraints; the vnstock
    // constraint path keeps marker-mode semantics.
    if (
      observationStatus.found &&
      isObservationStaleByAge(observationStatus.observation, Date.now())
    ) {
      observationStatus = { found: false };
    }
    const gateVerbResult = makeGateDecision(gateVerbMatch, observationStatus);
    // Staleness check, mirroring the constraint path — a stale observation
    // must not yield a plain `ok` for gate-verbs any more than for
    // docker/sudo constraints.
    if (!gateVerbResult.hard_block) {
      const staleness = checkObservationStaleness(observations, resolvedRoot);
      if (staleness.stale) {
        gateVerbResult.inbound_gate = true;
        if (gateVerbResult.decision === "ok") {
          gateVerbResult.decision = "escalate";
          gateVerbResult.reason = staleness.reason;
          gateVerbResult.observation_id = staleness.observation_id;
        }
      }
    }
    // Gate-verb result replaces the existing constraint result if it's
    // stricter (hard_block) or if no constraint result exists yet.
    if (!constraintResult || gateVerbResult.hard_block) {
      constraintResult = gateVerbResult;
    } else if (
      constraintResult.decision === "ok" &&
      gateVerbResult.decision !== "ok"
    ) {
      constraintResult = gateVerbResult;
    }
  }

  // --- Path-write detection: ALL records/** blocked ---
  // Runtime-state path-writes get a dedicated reason + preflight-marker
  // exemption (mirrors the write-gate preflight delegation in
  // evaluate-write-gate.js). An active `.loop-preflight-runtime-state-edit`
  // marker unlocks row maintenance (e.g. striking a corrupt row via
  // `grep -v … > runtime-state.jsonl`) for 30 minutes; new rows still go
  // through runtime_state_record (append-only, gated on the separate
  // `.loop-preflight-runtime-state` marker so routine appends do not keep
  // this direct-write gate warm).
  // The two checks below are independent (NOT if/else-if): a compound
  // command matching both must still produce the records-class block even
  // when the runtime-state half is exempted by an active marker.
  if (commandWritesToRuntimeState(command)) {
    if (!hasSurfacePreflightMarker(resolvedRoot, ".loop-preflight-runtime-state-edit")) {
      pathResult = {
        decision: "block",
        reason:
          "Direct shell writes to runtime-state.jsonl are gated. Use gate_mark_preflight(surface:'runtime-state-edit') to unlock row maintenance for 30 minutes, then log the change with meta_state_log_change. New rows still go through runtime_state_record (append-only).",
        hard_block: true,
      };
    }
  }
  if (!pathResult && commandWritesToGatedPath(command)) {
    pathResult = {
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      hard_block: true,
    };
  }

  // --- Promoted rules check (meta-state as rule registry) ---
  const promotedRules = loadPromotedRules(resolvedRoot);
  const promotedCheck = applyPromotedRules(command, null, promotedRules, resolvedRoot);
  if (promotedCheck.decision === "escalate") {
    return promotedCheck;
  }

  // --- Combine results: hard_block wins, then non-ok constraint, then path, else ok ---
  if (constraintResult?.hard_block || pathResult?.hard_block) {
    return constraintResult?.hard_block ? constraintResult : pathResult;
  } else if (constraintResult && constraintResult.decision !== "ok") {
    return constraintResult;
  } else if (pathResult) {
    return pathResult;
  }

  return { decision: "ok" };
}
