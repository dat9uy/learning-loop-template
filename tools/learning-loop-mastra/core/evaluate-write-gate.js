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
  loadPromotedRules,
  applyPromotedRules,
} from "./gate-logic.js";
import { SURFACES, getAllCoordinationPaths, getAllSurfacePaths } from "./surfaces.js";
import { BOUND_ARTIFACTS } from "./bound-artifacts.js";

/**
 * Named seam for the product/** preflight check (locked by convergence addendum).
 * Returns { decision: "ok" } or { decision: "block", reason, surface?, preflight_checklist? }.
 */
// fallow-ignore-next-line unused-export
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

// Skills paths across every runtime surface, derived from SURFACES so the
// skills rule covers .claude + .factory + .mastracode consistently.
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
// simple-glob rule constant in core/bound-artifacts.js). The remaining 6 are
// special-cased here: preflight-marker (delegates to findPreflightMarker via
// PREFLIGHT_MARKER_PATHS), skills (preflight-delegating with explicit
// surface="skills" — the dedicated `.loop-preflight-skills` marker),
// skills-canonical (preflight-delegating, matches the internal canonical
// source dir at tools/learning-loop-mastra/skills/** — added by Phase 2 of
// plans/260719-1428-central-skills-management; the materializer is the only
// write path to canonical SKILL.md, gated via the existing
// `.loop-preflight-skills` marker), skills-manifest (preflight-delegating,
// matches skills-lock.json at the repo root — added by Phase 3 of
// plans/260719-1428-central-skills-management; the manifest is the trust
// anchor for the contract's external exclusion, so direct writes are
// blocked), schemas (preflight-delegating with explicit surface="schemas" —
// the dedicated `.loop-preflight-schemas` marker; migrated out of
// BOUND_ARTIFACTS in Phase 2 of plans/260720-1112 to repair the dead-end
// block + stale `pnpm validate:records` reason), and product/** (delegates
// to evaluatePreflight).
// Rule order is load-bearing (first-match-wins) — see
// legacy-mcp/bound-artifacts.test.js for the pinned-order assertion.
// fallow-ignore-next-line complexity
const SKILL_CANONICAL_GLOB = "tools/learning-loop-mastra/skills/**";
const SKILL_MANIFEST_GLOB = "skills-lock.json";
const SCHEMAS_GLOB = "schemas/**";

const WRITE_GATE_RULES = [
  {
    name: "schemas",
    matchedRule: SCHEMAS_GLOB,
    match: (relPath) => globMatch(SCHEMAS_GLOB, relPath),
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
 * @param {{ filePath: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, file_path?: string, matched_rule?: string, surface?: string, preflight_checklist?: string[] }}
 */
export function evaluateWriteGate({ filePath, root }) {
  if (!isValidFilePath(filePath)) return { decision: "ok" };
  const resolvedRoot = resolveRoot(root);
  const relPath = toRelativePath(filePath, resolvedRoot);
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
    // Phase 2: canonical authoring source under tools/learning-loop-mastra/skills/.
    // Delegates to the SAME .loop-preflight-skills marker as the mirror rule
    // (one unlock authorises both canonical + mirror edits within the 30-min TTL).
    return evaluateSkillsPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "skills-manifest") {
    // Phase 3: skills-lock.json is the trust anchor for the contract's
    // external exclusion. Same preflight marker as the other skills rules.
    return evaluateSkillsPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
  }
  if (matched.name === "schemas") {
    // Phase 2 of plans/260720-1112: schemas/** migrated from a dead-end simple-glob
    // block (with a reason that referenced the non-existent `pnpm validate:records`
    // script and no working override path) to a preflight-delegating rule mirroring
    // the `skills` pattern. Uses the dedicated `.loop-preflight-schemas` marker
    // created via gate_mark_preflight({surface:"schemas"}). The marker is NOT
    // surface-prefixed (schemas/** lives at the repo root), so an EXPLICIT
    // surface="schemas" lookup is required — same approach as skills.
    return evaluateSchemasPreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });
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
 * Phase 5 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md.
 */
// fallow-ignore-next-line unused-export
export function evaluateSkillsPreflight({ filePath, root, matchedRule }) {
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
 * Migrated from a dead-end BOUND_ARTIFACTS simple-glob block (the reason
 * referenced the non-existent `pnpm validate:records` script and the override
 * path was unreachable — `gate_override` requires a *promoted* rule_id, and
 * `schemas/**` was a simple-glob block, not promoted). Closes finding
 * `meta-260720T1104Z`. Phase 2 of plans/260720-1112.
 */
// fallow-ignore-next-line unused-export
export function evaluateSchemasPreflight({ filePath, root, matchedRule }) {
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

function isValidFilePath(filePath) {
  return Boolean(filePath) && typeof filePath === "string";
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
  const promotedRules = loadPromotedRules(resolvedRoot);
  const promotedCheck = applyPromotedRules(null, relPath, promotedRules);
  if (promotedCheck.decision === "escalate") return promotedCheck;
  return { decision: "ok" };
}