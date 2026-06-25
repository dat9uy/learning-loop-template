/**
 * Shared agents-manifest loader. Used by server.js + each agent wrapper so the
 * manifest is read and parsed exactly once per server start, and so the
 * MASTRA_AGENTS_MANIFEST path-containment check is centralized (single source
 * of truth for the "test-only env var" contract).
 *
 * MASTRA_AGENTS_MANIFEST is test-only (used by agent-parity.test.cjs to swap
 * in __MOCK_LLM__ agents). Never set this in production; the production
 * agents-manifest.json is loaded by default.
 */

import { readFileSync, realpathSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The mastra shell root. Path containment requires the manifest to live
// here or under the package root's __tests__/fixtures/ (the parity test
// fixture path). After Phase E Plan 6, MASTRA_ROOT is mastra/ (Layer 2);
// test fixtures live under the package root (Layer 0), so we allow both.
const MASTRA_ROOT = resolve(__dirname, "..");
const PACKAGE_ROOT = resolve(__dirname, "..", "..");

let _cached = null;

function isWithinRoot(absPath, root) {
  // Tight containment: exact match OR descendant via separator.
  // Defends against sibling-prefix bypass (e.g., learning-loop-evil/...).
  return absPath === root || absPath.startsWith(root + sep);
}

export function loadAgentsManifest() {
  if (_cached) return _cached;

  const requested =
    process.env.MASTRA_AGENTS_MANIFEST ?? join(MASTRA_ROOT, "agents-manifest.json");
  const resolved = resolve(requested);

  if (!existsSync(resolved)) {
    throw new Error(
      `MASTRA_AGENTS_MANIFEST path "${resolved}" does not exist. ` +
        `Default is agents-manifest.json at the mastra package root.`,
    );
  }

  // Defense in depth: realpath containment defeats symlink-based bypass.
  let real;
  try {
    real = realpathSync(resolved);
  } catch {
    real = resolved;
  }
  if (!isWithinRoot(real, MASTRA_ROOT) && !isWithinRoot(real, join(PACKAGE_ROOT, "__tests__", "fixtures"))) {
    throw new Error(
      `MASTRA_AGENTS_MANIFEST path "${resolved}" (real: "${real}") ` +
        `resolves outside the mastra package root. Refusing to load.`,
    );
  }

  const parsed = JSON.parse(readFileSync(resolved, "utf8"));
  if (!parsed?.agents || typeof parsed.agents !== "object") {
    throw new Error(
      `agents-manifest at "${resolved}" is missing the required "agents" object.`,
    );
  }
  _cached = parsed;
  return parsed;
}

// Test-only seam: clear the cache so tests can swap the env var between runs.
export function _resetAgentsManifestCacheForTest() {
  _cached = null;
}