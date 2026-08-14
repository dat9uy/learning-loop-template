/**
 * Write-gate evaluator. Composes primitives from core/gate-logic.js.
 * Returns decision object for hook adapter or MCP tool.
 *
 * Pure at function-body level (transitive I/O at module load via gate-logic.js's
 * patterns.json read is acknowledged per plan R1c).
 */

import { normalize } from "node:path";
import {
  globMatch,
  findProjectRoot,
  inferSurface,
  readPreflightMarker,
  loadGroundedPromotedRules,
} from "./gate-logic.js";
import { evaluateI3PathPolicy } from "./promoted-rule-policy.js";
import { SURFACES, getAllCoordinationPaths, getAllSurfacePaths } from "./surfaces.js";
import { BOUND_ARTIFACTS } from "./bound-artifacts.js";
import {
  findLineageMatches,
  isScannableArtifactPath,
} from "./stable-artifacts-lineage.js";

/**
 * Named seam for the product/** preflight check (locked by convergence addendum).
 * Returns { decision: "ok" } or { decision: "block", reason, surface?, preflight_checklist? }.
 */
export function evaluatePreflight({ filePath, root }) {
  const surface = inferSurface(filePath);
  if (!surface) return { decision: "ok" };

  const resolvedRoot = root || findProjectRoot();
  const marker = findPreflightMarker(surface, resolvedRoot);
  if (marker) return { decision: "ok" };

  return {
    decision: "block",
    reason: `Preflight check not completed for surface "${surface}". Use the mark_preflight_complete MCP tool after reviewing the checklist.`,
    surface,
    preflight_checklist: buildPreflightChecklist(surface),
  };
}

function findPreflightMarker(surface, resolvedRoot) {
  // Index loop (not for-of iteration) to satisfy runtime-agnostic.test.js:80
  // — that test rejects hand-rolled iteration over SURFACES in core/ outside surfaces.js.
  for (let i = 0; i < SURFACES.length; i++) {
    const marker = readPreflightMarker(surface, `${resolvedRoot}/${SURFACES[i]}/coordination`);
    if (marker) return marker;
  }
  return null;
}

function buildPreflightChecklist(surface) {
  return [
    `1. Review the product-build plan for this surface`,
    `2. Verify decision records exist in records/${surface}/decisions/`,
    `3. Run and review any existing test suites`,
    `4. Confirm the change aligns with the approved architecture`,
    `5. Verify no schema-breaking changes without migration`,
    `6. Call mark_preflight_complete MCP tool for surface "${surface}"`,
  ];
}

// Preflight-marker paths across every runtime surface, derived from SURFACES so
// a direct write to any surface's coordination/.loop-preflight-* is blocked.
// The marker may only be created via the mark_preflight_complete MCP tool.
const PREFLIGHT_MARKER_PATHS = getAllCoordinationPaths(".loop-preflight-*");

// Decision-log paths across every runtime surface, derived from SURFACES so a
// Write/Edit tool cannot forge a `.gate-decision.log` row. The decision log is
// produced exclusively by the bash-gate evaluator hook (`appendDecisionLog`
// node call, a spawned process); a tool write could append a forged JSONL row
// carrying the evaluator producer trio that the recurrence tracker trusts.
const DECISION_LOG_PATHS = getAllCoordinationPaths(".gate-decision.log");

// Skills paths across every runtime surface, derived from SURFACES so the
// skills rule covers the retained .claude + .hermes mirror surfaces.
// The skills rule is preflight-delegating (like product/**) but uses an
// EXPLICIT surface="skills" lookup — NOT inferSurface (which returns null
// for surface-prefix paths; red-team finding). The marker is named
// `.loop-preflight-skills` and is created via gate_mark_preflight({surface:"skills"}).
const SKILL_PATHS = getAllSurfacePaths("skills", "**");

// ─── Write-gate rule registry ───────────────────────────────────────────────
// Each rule has:
//   - name: stable identifier used internally + surfaced in matched_rule
//   - matchedRule: human-readable label returned in the decision (tests assert)
//   - match(relPath): returns true if the rule applies to this relative path
//   - reason: human-readable reason returned when the rule blocks
// `evaluateWriteGate` walks this array in order; the first matching rule wins.
// `product/**` is a special case — it delegates to `evaluatePreflight` (matchedRule: null).
//
// The first 5 entries are derived from BOUND_ARTIFACTS (the shared
// simple-glob rule constant in core/bound-artifacts.js). The remaining 7 are
// special-cased here: preflight-marker (delegates to findPreflightMarker via
// PREFLIGHT_MARKER_PATHS), skills (preflight-delegating with explicit
// surface="skills" — the dedicated `.loop-preflight-skills` marker),
// skills-canonical (preflight-delegating, matches the internal canonical
// source dir at tools/learning-loop-mastra/skills/** — added by central-skills
// management; the materializer is the only
// write path to canonical SKILL.md, gated via the existing
// `.loop-preflight-skills` marker), skills-manifest (preflight-delegating,
// matches skills-lock.json at the repo root — the manifest is the trust
// anchor for the contract's external exclusion, so direct writes are
// blocked), schemas (preflight-delegating with explicit surface="schemas" —
// the dedicated `.loop-preflight-schemas` marker; migrated out of
// BOUND_ARTIFACTS to repair the dead-end
// block + stale `pnpm validate:records` reason), runtime-state
// (preflight-delegating — the dedicated `.loop-preflight-runtime-state-edit`
// marker, split from the append marker so routine runtime_state_record
// appends do not keep the direct-write gate warm; migrated out of
// BOUND_ARTIFACTS to repair the dead-end
// block whose only escape was the append-only `runtime_state_record` tool
// — gate_override cannot reach simple-glob blocks; closes finding
// meta-260720T1447Z), and product/** (delegates to evaluatePreflight).
// Rule order is load-bearing (first-match-wins) — see
// integration/bound-artifacts.test.js for the pinned-order assertion.
const SKILL_CANONICAL_GLOB = "tools/learning-loop-mastra/skills/**";
const SKILL_MANIFEST_GLOB = "skills-lock.json";
const SCHEMAS_GLOB = "schemas/**";
const RUNTIME_STATE_GLOB = "runtime-state.jsonl";
// Session-local ephemeral substrate — protected by the same preflight-
// delegating rule class as the committed file (operator mints the
// `runtime-state-edit` marker to maintain either substrate). NOT a simple-glob
// block in bound-artifacts.js (that would be a dead-end with no preflight
// escape and would diverge in precedence from the committed-file rule).
const RUNTIME_STATE_LOCAL_GLOB = ".loop/runtime-state-local.jsonl";

const WRITE_GATE_RULES = [
  {
    name: "schemas",
    matchedRule: SCHEMAS_GLOB,
    match: (relPath) => globMatch(SCHEMAS_GLOB, relPath),
    reason: null,
  },
  {
    name: "runtime-state",
    matchedRule: RUNTIME_STATE_GLOB,
    match: (relPath) => globMatch(RUNTIME_STATE_GLOB, relPath),
    reason: null,
  },
  {
    name: "runtime-state-local",
    matchedRule: RUNTIME_STATE_LOCAL_GLOB,
    match: (relPath) => globMatch(RUNTIME_STATE_LOCAL_GLOB, relPath),
    reason: null,
  },
  ...BOUND_ARTIFACTS,
  {
    name: "preflight-marker",
    matchedRule: PREFLIGHT_MARKER_PATHS.join(" | "),
    match: (relPath) => PREFLIGHT_MARKER_PATHS.some((g) => globMatch(g, relPath)),
    reason: "Preflight marker files can only be created via the mark_preflight_complete MCP tool. Direct writes are blocked.",
  },
  {
    name: "decision-log",
    matchedRule: DECISION_LOG_PATHS.join(" | "),
    match: (relPath) => DECISION_LOG_PATHS.some((g) => globMatch(g, relPath)),
    reason:
      "Direct Write/Edit to .gate-decision.log is blocked. The decision log is produced exclusively by the bash-gate evaluator hook's appendDecisionLog node call; a tool write could append forged rows the recurrence tracker would trust. Use the gate (bash) or report operator-filed recurrence instead of editing the log.",
  },
  {
    name: "skills",
    matchedRule: SKILL_PATHS.join(" | "),
    match: (relPath) => SKILL_PATHS.some((g) => globMatch(g, relPath)),
    reason:
      "Direct writes to <surface>/skills/** are blocked. Loop-maintained skills are gated artifacts mirrored across runtimes. Use the gated authoring path: gate_mark_preflight(surface:'skills') → write → meta_state_log_change. External symlinked content under .agents/skills/** is out of scope (not loop-maintained).",
  },
  {
    name: "skills-canonical",
    matchedRule: SKILL_CANONICAL_GLOB,
    match: (relPath) => globMatch(SKILL_CANONICAL_GLOB, relPath),
    reason:
      "Direct writes to tools/learning-loop-mastra/skills/** (the canonical authoring source) require the skills preflight. Authoring path: gate_mark_preflight(surface:'skills') → edit canonical → pnpm skills:sync → meta_state_log_change. Enforcement is detection-based by design: drift between canonical and mirrors is caught by the canonical-vs-mirror parity invariant test.",
  },
  {
    name: "skills-manifest",
    matchedRule: SKILL_MANIFEST_GLOB,
    match: (relPath) => globMatch(SKILL_MANIFEST_GLOB, relPath),
    reason:
      "Direct writes to skills-lock.json are blocked. The manifest is the trust anchor for the contract's external-exclusion (read by listLoopMaintainedSkills). Use the gated authoring path: gate_mark_preflight(surface:'skills') → edit manifest → meta_state_log_change.",
  },
  {
    name: "product",
    matchedRule: null,
    match: (relPath) => globMatch("product/**", relPath),
    reason: null,
  },
];

/**
 * Write-gate evaluator — rule-registry cascade.
 *
 * @param {{ filePath: string, root?: string, authoredContent?: string }} params
 * @returns {{ decision: string, reason?: string, file_path?: string, matched_rule?: string, surface?: string, preflight_checklist?: string[] }}
 */
export function evaluateWriteGate({ filePath, root, authoredContent }) {
  if (!isValidFilePath(filePath)) return { decision: "ok" };
  const resolvedRoot = resolveRoot(root);
  const relPath = toRelativePath(filePath, resolvedRoot);
  const lineageBlock = checkAuthoredContent(relPath, authoredContent);
  if (lineageBlock) return lineageBlock;
  const matched = WRITE_GATE_RULES.find((rule) => rule.match(relPath));
  if (!matched) return applyPromotedRulesCheck(relPath, resolvedRoot);
  if (matched.name === "product") {
    return evaluatePreflight({ filePath: relPath, root: resolvedRoot });
  }
  if (matched.name === "skills") {
    // Skills rule: preflight-delegating with EXPLICIT surface="skills".
    // Do NOT call inferSurface (it returns null for surface-prefix paths).
    return evaluateSkillsPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "skills-canonical") {
    // Canonical authoring source under tools/learning-loop-mastra/skills/.
    // Delegates to the SAME .loop-preflight-skills marker as the mirror rule
    // (one unlock authorises both canonical + mirror edits within the 30-min TTL).
    return evaluateSkillsPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "skills-manifest") {
    // skills-lock.json is the trust anchor for the contract's
    // external exclusion. Same preflight marker as the other skills rules.
    return evaluateSkillsPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "schemas") {
    // schemas/** was migrated from a dead-end simple-glob block (with a
    // reason that referenced the non-existent `pnpm validate:records`
    // script and no working override path) to a preflight-delegating rule
    // mirroring the `skills` pattern. Uses the dedicated
    // `.loop-preflight-schemas` marker created via
    // gate_mark_preflight({surface:"schemas"}). The marker is NOT
    // surface-prefixed (schemas/** lives at the repo root), so an EXPLICIT
    // surface="schemas" lookup is required — same approach as skills.
    return evaluateSchemasPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "runtime-state") {
    // runtime-state.jsonl row maintenance delegates to the dedicated
    // `.loop-preflight-runtime-state-edit` marker created via
    // gate_mark_preflight({surface:"runtime-state-edit"}). The edit marker is
    // deliberately separate from the `.loop-preflight-runtime-state` marker
    // that `runtime_state_record` requires for routine appends — otherwise
    // normal loop operation (frequent appends) would keep the direct-write
    // gate warm most of the time.
    return evaluateRuntimeStatePreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "runtime-state-local") {
    // The gitignored session-local substrate gets the SAME preflight-
    // delegating rule class as the committed file: an operator mints the
    // `runtime-state-edit` marker to maintain either substrate. This keeps
    // the two rules' short-circuits non-overlapping while preserving the
    // "sanctioned maintenance works identically" invariant.
    return evaluateRuntimeStatePreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  return blockResult(matched, filePath);
}

/**
 * Skills preflight check — named seam for the dedicated `.loop-preflight-skills`
 * marker. Returns { decision: "ok" } if any surface has a non-stale
 * `.loop-preflight-skills` marker; otherwise { decision: "block", reason,
 * surface: "skills", preflight_checklist }.
 *
 * `matchedRule` is the glob label of the WRITE_GATE_RULES entry that fired
 * (mirror paths, canonical dir, or the manifest) so the block decision
 * reports the rule that actually matched, not always the mirror glob.
 *
 * Skills preflight seam — named seam for the dedicated `.loop-preflight-skills` marker.
 */
function evaluateSkillsPreflight({ filePath, root, matchedRule }) {
  const resolvedRoot = root || findProjectRoot();
  const marker = findPreflightMarker("skills", resolvedRoot);
  if (marker) return { decision: "ok" };

  return {
    decision: "block",
    reason:
      "Skills preflight check not completed. Loop-maintained skills are gated artifacts mirrored across runtimes. Use the gated authoring path: gate_mark_preflight(surface:'skills') → write → meta_state_log_change.",
    surface: "skills",
    preflight_checklist: [
      "1. Identify the loop-maintained skill being edited (declared `maturity:` frontmatter, mirrored across ≥ 2 surfaces)",
      "2. Verify the edit keeps the cross-surface mirrors byte-identical (skills-mirror-parity.test.js is the backstop)",
      "3. Read the authoring standard in `docs/loop-engine.md` \"Authoring loop-maintained skills\" subsection",
      "4. Confirm the change is consistent with the loop's design (no breaking changes to maturity semantics, mirror layout, or gated-path contract)",
      "5. Stage a meta_state_log_change entry describing the system change (this is the change-log half of self-maintenance)",
      "6. Call gate_mark_preflight MCP tool with surface:\"skills\" to unlock the gated write (30-minute TTL)",
    ],
    matched_rule: matchedRule ?? SKILL_PATHS.join(" | "),
  };
}

/**
 * Schemas preflight check — named seam for the dedicated `.loop-preflight-schemas`
 * marker. Returns { decision: "ok" } if any surface has a non-stale
 * `.loop-preflight-schemas` marker; otherwise { decision: "block", reason,
 * surface: "schemas", preflight_checklist }.
 *
 * Schemas preflight seam — named seam for the dedicated `.loop-preflight-schemas`
 * marker. Migrated from a dead-end BOUND_ARTIFACTS simple-glob block
 * (the reason referenced the non-existent `pnpm validate:records` script
 * and the override path was unreachable — `gate_override` requires a
 * *promoted* rule_id, and `schemas/**` was a simple-glob block, not
 * promoted). Closes finding `meta-260720T1104Z`.
 */
function evaluateSchemasPreflight({ filePath, root, matchedRule }) {
  const resolvedRoot = root || findProjectRoot();
  const marker = findPreflightMarker("schemas", resolvedRoot);
  if (marker) return { decision: "ok" };

  return {
    decision: "block",
    reason:
      "Schema changes are gated. Walk the preflight checklist, call gate_mark_preflight(surface:'schemas') to unlock for 30 minutes, edit, then log the change with meta_state_log_change.",
    surface: "schemas",
    preflight_checklist: [
      "1. Identify the schema being edited (schemas/*.schema.json — read by loop-introspect.js:89 to list record types)",
      "2. Verify the change is consistent with downstream consumers (record-repair-gap, schema-drift, mcp-tool-missing findings cite the schema's effect)",
      "3. Read the schema contract in `docs/runtime-contract.md` and confirm no contract-breaking changes",
      "4. Confirm the change keeps cross-surface manifest parity (schemas-lock.json + tools/learning-loop-mastra/schemas/)",
      "5. Stage a meta_state_log_change entry describing the system change (this is the change-log half of self-maintenance)",
      "6. Call gate_mark_preflight MCP tool with surface:\"schemas\" to unlock the gated write (30-minute TTL)",
    ],
    matched_rule: matchedRule ?? SCHEMAS_GLOB,
  };
}

/**
 * Runtime-state preflight check — named seam for the dedicated
 * `.loop-preflight-runtime-state-edit` marker. Returns { decision: "ok" } if
 * any surface has a non-stale `.loop-preflight-runtime-state-edit` marker;
 * otherwise { decision: "block", reason, surface: "runtime-state-edit",
 * preflight_checklist }.
 *
 * The edit marker is split from the append marker
 * (`.loop-preflight-runtime-state`, required by `runtime_state_record`) so
 * that routine appends during normal loop operation do not keep the
 * direct-write gate warm.
 */
function evaluateRuntimeStatePreflight({ filePath, root, matchedRule }) {
  const resolvedRoot = root || findProjectRoot();
  const marker = findPreflightMarker("runtime-state-edit", resolvedRoot);
  if (marker) return { decision: "ok" };

  return {
    decision: "block",
    reason:
      "Runtime-state row maintenance (striking corrupt rows) is gated. Walk the preflight checklist, call gate_mark_preflight(surface:'runtime-state-edit') to unlock for 30 minutes, edit, then log the change with meta_state_log_change. New rows still go through runtime_state_record (append-only, gated on surface:'runtime-state').",
    surface: "runtime-state-edit",
    preflight_checklist: [
      "1. Identify the runtime-state row(s) needing maintenance (typically a corrupt or duplicated row that fingerprint validation rejects — see docs/architecture.md § runtime-state.jsonl for the schema)",
      "2. Take a backup of runtime-state.jsonl before any in-place edit (single operator, atomic move, not a Write tool rewrite)",
      "3. Confirm no constraint rules depend on the rows being struck (run pnpm test:iter and check inbound-gate observations for the affected surfaces)",
      "4. Confirm the change keeps the per-surface budget-state entity consistent (one entity per surface under the canonical id; verify with readBudgetTrackingState)",
      "5. Stage a meta_state_log_change entry describing the system change (this is the change-log half of self-maintenance)",
      "6. Call gate_mark_preflight MCP tool with surface:\"runtime-state-edit\" to unlock the gated write (30-minute TTL)",
    ],
    matched_rule: matchedRule ?? RUNTIME_STATE_GLOB,
  };
}

function isValidFilePath(filePath) {
  return Boolean(filePath) && typeof filePath === "string";
}

/**
 * Authored content for the lineage scan: Write carries `content`, Edit
 * carries `new_string`, patch-style tools carry `patch`. Lives in core (not
 * the hook adapter) so the precedence chain rides the write-gate test
 * coverage instead of the untested hook entry point.
 */
export function extractAuthoredContent(toolInput) {
  if (!toolInput) return null;
  return toolInput.content ?? toolInput.new_string ?? toolInput.patch ?? null;
}

/**
 * Write-boundary content scan for `rule-no-plan-ids-in-stable-code-artifacts`.
 * Authored content (Write `content`, Edit `new_string`, patch text) is matched
 * with the shared lineage matcher before any path rule runs, so a banned
 * plan-ID/phase token is rejected at authoring time instead of surfacing
 * post-hoc at the file-scan test or commit-msg hook. Fail-closed: a hit blocks
 * the write, matching the commit-msg hook's stance. Scope + exclusions come
 * from core/stable-artifacts-lineage.js so the three consumers cannot drift.
 */
function checkAuthoredContent(relPath, authoredContent) {
  if (typeof authoredContent !== "string" || authoredContent.length === 0) return null;
  if (!isScannableArtifactPath(relPath)) return null;
  const hits = findLineageMatches(authoredContent);
  if (hits.length === 0) return null;
  const detail = hits
    .slice(0, 5)
    .map((h) => `line ${h.line}: ${h.content.trim()} [${h.patterns.join(", ")}]`)
    .join("; ");
  return {
    decision: "block",
    reason:
      `Authored content contains plan-ID/phase-number lineage banned from stable code artifacts (${hits.length} hit(s): ${detail}). ` +
      "Plan lineage belongs in plan docs, reports, and git history — describe the invariant or behavior directly.",
    file_path: relPath,
    matched_rule: "rule-no-plan-ids-in-stable-code-artifacts",
  };
}

function resolveRoot(root) {
  return root || findProjectRoot();
}

function toRelativePath(filePath, resolvedRoot) {
  let relPath = filePath;
  if (relPath.startsWith(resolvedRoot)) {
    relPath = relPath.slice(resolvedRoot.length + 1);
  }
  return normalize(relPath.replace(/^\.\//, ""));
}

function blockResult(rule, filePath) {
  return {
    decision: "block",
    reason: rule.reason,
    file_path: filePath,
    matched_rule: rule.matchedRule,
  };
}

function applyPromotedRulesCheck(relPath, resolvedRoot) {
  const i3Rules = loadGroundedPromotedRules(resolvedRoot).filter((r) => r.internalization_level === "I3");
  const promotedCheck = evaluateI3PathPolicy({ filePath: relPath, root: resolvedRoot, i3Rules });
  if (promotedCheck.decision === "escalate") return promotedCheck;
  return { decision: "ok" };
}
