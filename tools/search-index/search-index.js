import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

/**
 * Search index entries by capability, dimension, and status.
 * @param {string} root — repo root
 * @param {{ capability?: string, dimension?: string, status?: string }} filters
 * @returns {Array<{id: string, frontmatter: object}>}
 */
export function searchIndex(root, filters = {}) {
  const indexDir = join(root, "records", "index");
  const results = [];

  let files;
  try {
    files = readdirSync(indexDir).filter((n) => n.endsWith(".yaml"));
  } catch {
    return results;
  }

  for (const file of files) {
    const id = file.replace(/\.yaml$/, "");
    let frontmatter;
    try {
      frontmatter = YAML.parse(readFileSync(join(indexDir, file), "utf8"));
    } catch {
      continue;
    }

    if (filters.capability) {
      const capField = frontmatter.capability || "";
      const fileDerived = id.split("-").slice(1, 4).join("-"); // heuristic: assertion-{cap}-{dim}
      const match = capField === filters.capability || id.includes(filters.capability) || fileDerived === filters.capability;
      if (!match) continue;
    }

    if (filters.dimension) {
      const dims = frontmatter.verification || {};
      if (!dims[filters.dimension]) continue;
    }

    if (filters.status && filters.dimension) {
      const dimData = (frontmatter.verification || {})[filters.dimension];
      if (!dimData || dimData.status !== filters.status) continue;
    } else if (filters.status) {
      let found = false;
      for (const dim of Object.values(frontmatter.verification || {})) {
        if (dim.status === filters.status) {
          found = true;
          break;
        }
      }
      if (!found) continue;
    }

    results.push({ id, frontmatter });
  }

  return results;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const capability = getArg("--capability");
  const dimension = getArg("--dimension");
  const status = getArg("--status");
  const json = args.includes("--json");
  const root = process.cwd();

  const results = searchIndex(root, { capability, dimension, status });

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(r.id);
    }
  }
}
