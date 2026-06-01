import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

/**
 * Search index entries by capability, dimension, and status.
 * @param {string} root — repo root
 * @param {{ capability?: string, dimension?: string, status?: string }} filters
 * @param {boolean} excludeCandidates — when true (default), skip entries with status: candidate
 * @returns {Array<{id: string, frontmatter: object}>}
 */
export const SURFACES = ["meta", "vnstock", "fastapi", "tanstack", "product"];

function collectIndexFiles(root) {
  const files = [];
  const collect = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir).filter((n) => n.endsWith(".yaml"));
    } catch {
      return;
    }
    for (const name of entries) {
      files.push({ dir, name });
    }
  };
  collect(join(root, "records", "index"));
  for (const surface of SURFACES) {
    collect(join(root, "records", surface, "index"));
  }
  return files;
}

export function searchIndex(root, filters = {}, excludeCandidates = true) {
  const results = [];
  const files = collectIndexFiles(root);

  for (const { dir, name } of files) {
    const id = name.replace(/\.yaml$/, "");
    let frontmatter;
    try {
      frontmatter = YAML.parse(readFileSync(join(dir, name), "utf8"));
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
      // Check old-style verification dimension status
      let found = false;
      for (const dim of Object.values(frontmatter.verification || {})) {
        if (dim.status === filters.status) {
          found = true;
          break;
        }
      }
      // Also check top-level status for extracted-assertions
      if (frontmatter.status === filters.status) {
        found = true;
      }
      if (!found) continue;
    }

    // Candidate exclusion: when no explicit status filter is set, exclude candidate entries
    if (excludeCandidates && !filters.status && frontmatter.status === "candidate") {
      continue;
    }

    results.push({ id, frontmatter });
  }

  return results;
}
