import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

function main() {
  const stackIndex = process.argv.indexOf("--stack");
  const stack = stackIndex >= 0 ? process.argv[stackIndex + 1] : null;
  const json = process.argv.includes("--json");
  const root = process.cwd();

  if (!stack) {
    console.error("Usage: node list-probes.js --stack <api|web> [--json]");
    process.exit(1);
  }

  const results = listProbes(root, { stack });

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(r.path);
    }
  }
}

const isMain = import.meta.url.startsWith("file:") && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
