// Per-worktree L2 version declaration.
//
// Plan 260711-0030 Phase 4. The .loop-version file at <root>/.loop-version is
// the schema-version-skew safeguard: writes referencing an entry_kind branch
// not in the current worktree's metaStateEntrySchema discriminator union are
// rejected with SchemaVersionSkewError. The file is gitignored (same pattern
// as .last-operator-message): per-worktree runtime state must not be committed
// (committing it would conflate "this branch's loop code" with "this branch's
// loop version").
//
// File format (line-oriented key:value, one per line):
//   loop:<semver-or-version-string>
//   node:<node-version>
//   schema_branches:<comma-separated 4-kind union>
//
// Discovery path (Finding 7 corrected from plan): derivation source is the
// agent-manifest.json at tools/learning-loop-mastra/agent-manifest.json
// (server.version + tool count). The canonical sources/ are:
//   - tools/learning-loop-mastra/agent-manifest.json (primary)
//   - tools/learning-loop-mastra/package.json (fallback if absent)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const VERSION_FILE = ".loop-version";

// 4-kind union (source of truth: meta-state.js#metaStateEntrySchema).
const DEFAULT_SCHEMA_BRANCHES = ["finding", "change-log", "rule", "loop-design"];

/**
 * Read the per-worktree .loop-version file. If absent, lazy-create it with
 * the current agent-manifest version + schema_branches derived from the
 * metaStateEntrySchema enum.
 *
 * @param {string} root — project root
 * @returns {{
 *   loop: string,
 *   node: string,
 *   schema_branches: string[],
 * }}
 */
export function readLoopVersion(root) {
  const path = join(root, VERSION_FILE);
  if (!existsSync(path)) {
    const initial = deriveInitialVersion(root);
    writeFileSync(path, initial, "utf8");
    return parseVersion(initial);
  }
  return parseVersion(readFileSync(path, "utf8"));
}

function deriveInitialVersion(root) {
  const serverVersion = readServerVersion(root);
  return [
    `loop:${serverVersion}`,
    `node:${readNodeEngine(root)}`,
    `schema_branches:${DEFAULT_SCHEMA_BRANCHES.join(",")}`,
    "",
  ].join("\n");
}

/**
 * Read the server version from tools/learning-loop-mastra/agent-manifest.json
 * (canonical source per Finding 7). Returns "unknown" on missing/corrupt.
 */
function readServerVersion(root) {
  const paths = [
    join(root, "tools", "learning-loop-mastra", "agent-manifest.json"),
    join(root, "tools", "learning-loop-mastra", "package.json"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && typeof parsed.version === "string") {
      return parsed.version;
    }
  }
  return "unknown";
}

function readNodeEngine(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return "unknown";
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return "unknown";
  }
  if (parsed && typeof parsed === "object" && parsed.engines && typeof parsed.engines.node === "string") {
    return parsed.engines.node;
  }
  return "unknown";
}

function parseVersion(content) {
  const lines = content.split("\n").filter(Boolean);
  const out = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const k = line.slice(0, colon).trim();
    const v = line.slice(colon + 1).trim();
    out[k] = v;
  }
  if (typeof out.schema_branches === "string") {
    out.schema_branches = out.schema_branches.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (!Array.isArray(out.schema_branches)) {
    out.schema_branches = DEFAULT_SCHEMA_BRANCHES;
  }
  return out;
}

/**
 * Returns true iff `branch` is in the current worktree's schema_branches.
 * Used by writeEntry to reject schema-version-skew writes.
 */
export function isSchemaBranchSupported(root, branch) {
  if (!branch) return true; // omit-branch writers get current branch accepted
  const version = readLoopVersion(root);
  return Array.isArray(version.schema_branches) && version.schema_branches.includes(branch);
}

/**
 * Hash the .loop-version file content for cross-process invalidation. The
 * file is tiny; a sha256 prefix is enough to detect drift.
 */
export function hashLoopVersion(root) {
  const path = join(root, VERSION_FILE);
  if (!existsSync(path)) return "missing";
  return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex").slice(0, 16);
}