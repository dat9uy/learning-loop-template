/**
 * Group adapter entries by (stack, domain) and produce capability record objects.
 * @param {string} stack
 * @param {string} surface
 * @param {Array<{source: string, domain: string}>} entries
 * @param {string} schemaVersion
 * @returns {Array<{id: string, type: string, schema_version: string, stack: string, surface: string, maps: Array<{source: string}>}>}
 */
export function normalizeEntries(stack, surface, entries, schemaVersion = "2.0") {
  const byDomain = new Map();
  for (const entry of entries) {
    if (!byDomain.has(entry.domain)) {
      byDomain.set(entry.domain, []);
    }
    byDomain.get(entry.domain).push(entry);
  }

  const surfaceSlugMap = {
    "HTTP/REST": "rest",
    "TanStack Start route": "render",
  };
  const surfaceSlug = surfaceSlugMap[surface] || surface.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stackSlugMap = {
    api: "fastapi",
    web: "tanstack",
  };
  const stackSlug = stackSlugMap[stack] || stack;
  const records = [];
  for (const [domain, domainEntries] of byDomain) {
    const id = `capability-${stackSlug}-${domain}-${surfaceSlug}`;
    records.push({
      id,
      type: "capability",
      schema_version: schemaVersion,
      stack,
      surface,
      maps: domainEntries.map((e) => ({ source: e.source })),
    });
  }

  return records;
}
