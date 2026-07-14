// core/manifest-loader.js — single source of truth for resolving manifest entries.
//
// tools/manifest.json uses a stable, hand-curated canonical form: every
// `file` field is "tools/<name>-tool.js". At runtime, each consumer
// resolves the canonical form to the actual implementation under
// tools/handlers/<name>-tool.js (the "legacy MCP wrapper" implementation).
//
// Historically this rewrite was open-coded at every call site. That drift
// surface was the root cause of finding
// meta-260714T1630Z-after-the-mcp-server-restart-triggered-by-plan-260714-1358-r
// (listAllTools in core/loop-introspect.js forgot to apply the rewrite, so
// the warm tier reported `degraded: true` + "32 tool module imports failed;
// using manifest fallback" while tools kept working through the
// correctly-rewritten server path).
//
// All consumers MUST go through resolveToolImportUrl() (or resolveToolFile()
// when a filesystem path is needed without dynamic import). Direct
// `import("...tools/handlers/...")` or `join(MCP_ROOT, mod.file)` is
// forbidden by this single-source-of-truth contract.

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is .../tools/learning-loop-mastra/core/ — walking up one lands
// at the mastra package root, where tools/handlers/ lives.
const HANDLERS_DIR = join(__dirname, "..", "tools", "handlers");

/**
 * Resolve a manifest entry's `file` field to the absolute filesystem path
 * of the implementation under tools/handlers/.
 *
 * @param {string} manifestFile — the manifest entry's `file` field, e.g.
 *   "tools/gate-tool.js".
 * @returns {string} — absolute filesystem path, e.g.
 *   ".../tools/learning-loop-mastra/tools/handlers/gate-tool.js".
 */
export function resolveToolFile(manifestFile) {
  if (typeof manifestFile !== "string" || !manifestFile.startsWith("tools/")) {
    throw new TypeError(
      `resolveToolFile: manifestFile must start with "tools/" (got ${JSON.stringify(manifestFile)})`,
    );
  }
  return join(HANDLERS_DIR, manifestFile.slice("tools/".length));
}

/**
 * Resolve a manifest entry's `file` field to the file:// URL form expected
 * by Node.js dynamic import(). Use this from every server-side loader that
 * invokes `await import(...)`.
 *
 * @param {string} manifestFile — same as resolveToolFile().
 * @returns {string} — a file:// URL suitable for dynamic import().
 */
export function resolveToolImportUrl(manifestFile) {
  return pathToFileURL(resolveToolFile(manifestFile)).href;
}
