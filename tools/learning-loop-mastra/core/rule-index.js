/**
 * Compiled, read-only projections of the active Rule registry.
 *
 * This is the single Core seam for consumers that need Rules. It owns the
 * registry's append-history collapse, Rule validation, deterministic ordering,
 * and I3 evidence grounding. It deliberately has no write or lifecycle API.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as pathResolve, sep } from "node:path";
import { computeFileHash, FileNotFoundError } from "./check-grounding.js";
import { metaStateRuleEntrySchema } from "./meta-state.js";
import { PathContainmentError, resolveSafePath } from "./path-containment.js";
import { stripEvidenceAnchor } from "./evidence-ref.js";

const REGISTRY_FILENAME = "meta-state.jsonl";

const EMPTY_INDEX = Object.freeze({
  i2: Object.freeze([]),
  i3: Object.freeze([]),
  diagnostics: Object.freeze([]),
});

// The index is read frequently by action-boundary gates. Keep the same
// mtime+size invalidation contract used by the existing registry reader.
const indexCache = new Map();

/**
 * Compile a collection of raw registry entries into validated I2/I3 views.
 *
 * This function is pure with respect to the registry: it does not read or
 * write files, resolve evidence paths, or change lifecycle state. Callers
 * that have a project root should use readRuleIndex so active I3 Rules are
 * grounded before they reach a consumer.
 *
 * @param {Array<unknown>} entries raw registry entries, including history
 * @returns {{ i2: Array<object>, i3: Array<object>, diagnostics: Array<object> }}
 */
// fallow-ignore-next-line unused-export -- public pure compiler seam; the current gate consumes readRuleIndex while future delivery consumers consume this direct projection
export function compileRuleIndex(entries) {
  const diagnostics = [];
  const latestRules = selectLatestRules(entries);
  const { rules, diagnostics: validationDiagnostics } = validateActiveRules(latestRules);
  diagnostics.push(...validationDiagnostics);
  const i2 = rules.filter((rule) => rule.internalization_level === "I2");
  const i3 = rules.filter((rule) => rule.internalization_level === "I3");
  const compareRules = compareRuleOrder;
  i2.sort(compareRules);
  i3.sort(compareRules);

  return { i2, i3, diagnostics };
}

// fallow-ignore-next-line complexity -- append-history collapse keeps version and created_at tie-breaking together at the projection boundary
function selectLatestRules(entries) {
  const latestById = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!isRuleEntry(entry)) continue;
    const prior = latestById.get(entry.id);
    if (!prior || isLaterRuleVersion(prior, entry)) latestById.set(entry.id, entry);
  }
  return [...latestById.values()];
}

function isRuleEntry(entry) {
  return Boolean(entry)
    && typeof entry === "object"
    && !Array.isArray(entry)
    && entry.entry_kind === "rule";
}

// fallow-ignore-next-line complexity -- ordered version/timestamp tie-break is the registry projection contract
function isLaterRuleVersion(prior, next) {
  const priorVersion = prior.version ?? 0;
  const nextVersion = next.version ?? 0;
  if (nextVersion !== priorVersion) return nextVersion > priorVersion;
  return (next.created_at ?? "") > (prior.created_at ?? "");
}

// fallow-ignore-next-line complexity -- validation diagnostics and exclusion stay adjacent so invalid Rules cannot enter a projection
function validateActiveRules(entries) {
  const rules = [];
  const diagnostics = [];
  for (const rule of entries) {
    const validation = metaStateRuleEntrySchema.safeParse(rule);
    if (!validation.success) {
      diagnostics.push({
        code: "invalid_rule",
        rule_id: rule.id ?? null,
        issues: validation.error.issues.map((issue) => ({
          path: [...issue.path],
          code: issue.code,
          message: issue.message,
        })),
      });
      continue;
    }
    if (rule.status !== "active") continue;
    // Zod intentionally strips registry metadata such as `version`. The
    // index returns the validated source record so consumers retain the
    // version selected by the append-history projection.
    rules.push(rule);
  }
  return { rules, diagnostics };
}

// fallow-ignore-next-line complexity -- chronological ordering with an id tie-break is the deterministic projection contract
function compareRuleOrder(left, right) {
  const leftCreatedAt = left.created_at ?? "";
  const rightCreatedAt = right.created_at ?? "";
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt < rightCreatedAt ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Read and compile the canonical meta-state registry for a project root.
 * Malformed sibling lines become structured diagnostics; they do not prevent
 * valid Rules from entering either projection. `includeUnresolvedI3` exists
 * only for the one-way legacy loader while existing callers migrate; the
 * default projection is always grounded.
 */
// fallow-ignore-next-line complexity -- cache lookup, parse, grounding, and compatibility projection form one replaceable read seam
export function readRuleIndex(root, { includeUnresolvedI3 = false } = {}) {
  const registryPath = join(root, REGISTRY_FILENAME);
  const stats = readRegistryStats(registryPath);
  if (!stats) {
    // A missing registry is a legitimate empty input for read-only callers;
    // an existing path that cannot be stat'ed is an operational failure and
    // must remain visible to delivery instead of becoming a clean empty index.
    if (!existsSync(registryPath)) return EMPTY_INDEX;
    return {
      ...EMPTY_INDEX,
      diagnostics: [{
        code: "registry_read_failed",
        rule_id: null,
        message: "meta-state.jsonl could not be inspected",
      }],
    };
  }

  const cached = indexCache.get(root);
  if (
    cached
    && cached.mtimeMs === stats.mtimeMs
    && cached.size === stats.size
    && groundingSnapshotMatches(root, cached.compatibilityIndex.i3, cached.groundingSnapshot)
  ) {
    return includeUnresolvedI3 ? cached.compatibilityIndex : cached.index;
  }

  const parsed = parseRegistry(registryPath);
  if (!parsed) {
    return {
      ...EMPTY_INDEX,
      diagnostics: [{
        code: "registry_read_failed",
        rule_id: null,
        message: "meta-state.jsonl could not be read",
      }],
    };
  }
  const compiled = compileRuleIndex(parsed.entries);
  const { groundedI3, groundingDiagnostics, groundingSnapshot } = groundI3Rules(root, compiled.i3);
  const diagnostics = [...parsed.diagnostics, ...groundingDiagnostics, ...compiled.diagnostics];

  const index = {
    i2: compiled.i2,
    i3: groundedI3,
    diagnostics,
  };
  const compatibilityIndex = {
    i2: compiled.i2,
    i3: compiled.i3,
    diagnostics: index.diagnostics,
  };
  indexCache.set(root, {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    index,
    compatibilityIndex,
    groundingSnapshot,
  });
  return includeUnresolvedI3 ? compatibilityIndex : index;
}

function readRegistryStats(registryPath) {
  try {
    const stats = statSync(registryPath);
    return { mtimeMs: stats.mtimeMs, size: stats.size };
  } catch {
    return null;
  }
}

// fallow-ignore-next-line complexity -- fail-open JSONL parsing reports each malformed line while retaining valid siblings
function parseRegistry(registryPath) {
  let raw;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch (error) {
    return {
      entries: [],
      diagnostics: [{
        code: "registry_read_failed",
        line: null,
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const entries = [];
  const diagnostics = [];
  for (const [index, line] of raw.split("\n").entries()) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("registry line must contain a JSON object");
      }
      entries.push(parsed);
    } catch (error) {
      diagnostics.push({
        code: "malformed_registry_line",
        line: index + 1,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { entries, diagnostics };
}

function groundI3Rules(root, rules) {
  const groundedI3 = [];
  const diagnostics = [];
  const groundingSnapshot = [];
  for (const rule of rules) {
    const grounding = resolveEvidence(root, rule.evidence_code_ref);
    groundingSnapshot.push(groundingSignature(rule, grounding));
    if (grounding.status === "grounded") {
      groundedI3.push(rule);
      continue;
    }
    diagnostics.push({ code: "grounding_unresolved", rule_id: rule.id, grounding });
  }
  return { groundedI3, groundingDiagnostics: diagnostics, groundingSnapshot };
}

function groundingSnapshotMatches(root, rules, expected) {
  if (!Array.isArray(expected) || expected.length !== rules.length) return false;
  return rules.every((rule, index) => {
    const grounding = resolveEvidence(root, rule.evidence_code_ref);
    return groundingSignature(rule, grounding) === expected[index];
  });
}

function groundingSignature(rule, grounding) {
  return JSON.stringify({
    id: rule.id,
    status: grounding.status,
    evidence_code_ref: grounding.evidence_code_ref,
    code_ref_exists: grounding.code_ref_exists,
    content_fingerprint: grounding.content_fingerprint ?? null,
    reason: grounding.reason ?? null,
  });
}

/**
 * Resolve an I3 evidence reference without importing the gate evaluator.
 * Evidence refs may carry the same line/range, JSON-key, or symbol suffixes
 * accepted by the existing grounding contract.
 */
// fallow-ignore-next-line complexity -- path normalization and grounding result map each allowed/missing reference outcome
function resolveEvidence(root, evidenceCodeRef) {
  const canonicalRef = stripEvidenceAnchor(evidenceCodeRef);
  try {
    const resolvedPath = resolveSafePath(root, canonicalRef);
    const stats = statSync(resolvedPath);
    if (!stats.isFile()) {
      return {
        status: "drifted",
        evidence_code_ref: canonicalRef,
        code_ref_exists: false,
        reason: "not_a_file",
      };
    }
    const contentFingerprint = computeFileHash(resolvedPath);
    return {
      status: "grounded",
      evidence_code_ref: resolvedPath,
      code_ref_exists: true,
      content_fingerprint: contentFingerprint,
    };
  } catch (error) {
    if (error instanceof PathContainmentError) {
      // A missing path inside the project is a normal unresolved-evidence
      // diagnostic. All other containment failures are security signals and
      // must remain visible to the caller instead of becoming a skippable Rule.
      if (
        error.reason !== "outside_root"
        || error.resolvedPath !== null
        || !isMissingPathInsideRoot(root, canonicalRef)
      ) {
        throw error;
      }
    }
    return {
      status: "drifted",
      evidence_code_ref: canonicalRef,
      code_ref_exists: false,
      reason: error instanceof FileNotFoundError ? "unreadable" : error?.reason ?? "unresolved",
    };
  }
}

// fallow-ignore-next-line complexity -- walk to the nearest existing ancestor to distinguish an in-root missing file from a containment failure
function isMissingPathInsideRoot(root, userPath) {
  try {
    const candidate = isAbsolute(userPath) ? userPath : pathResolve(root, userPath);
    let ancestor = candidate;
    while (!existsSync(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) return false;
      ancestor = parent;
    }
    const realRoot = realpathSync(root);
    const realAncestor = realpathSync(ancestor);
    return realAncestor === realRoot || realAncestor.startsWith(realRoot + sep);
  } catch {
    return false;
  }
}
