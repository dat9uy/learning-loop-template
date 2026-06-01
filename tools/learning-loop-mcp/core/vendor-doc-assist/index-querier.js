/**
 * Query the existing index for duplicate or superseded assertions.
 */
import { searchIndex } from "#mcp/core/search-index.js";

export function queryExistingIndex(root, capability, dimension) {
  const results = searchIndex(root, { capability, dimension });
  return results.map((r) => ({
    id: r.id,
    capability: r.frontmatter?.capability || r.frontmatter?.capability || "",
    dimension: r.frontmatter?.dimension || "",
    topic_tag: r.frontmatter?.topic_tag || "",
    status: r.frontmatter?.status || "",
  }));
}
