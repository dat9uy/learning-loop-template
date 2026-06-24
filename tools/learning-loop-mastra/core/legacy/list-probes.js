import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * List runtime probe files under product/<stack>/capabilities/.
 * @param {string} root — repo root
 * @param {{ stack: string }} opts
 * @returns {Array<{path: string, stack: string, domain: string}>}
 */
export function listProbes(root, opts) {
  const stack = opts.stack;
  const baseDir = join(root, "product", stack, "capabilities");
  const results = [];

  function scan(dir) {
    try {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scan(fullPath);
        } else if (entry.endsWith(".py")) {
          const rel = relative(root, fullPath);
          const parts = rel.split("/");
          const domain = parts.length >= 5 ? parts[3] : "";
          results.push({ path: rel, stack, domain });
        }
      }
    } catch {
      // directory may not exist
    }
  }

  scan(baseDir);
  return results;
}
