/**
 * Parse a change-log `consolidates` field into a list of finding ids.
 *
 * Canonical form (post-migration) is `z.array(z.string())`. The legacy
 * CSV-string form is tolerated for in-flight processes that read
 * pre-migration data. Single source of truth shared by
 * `core/entry/change-log.js` (interactive entry) and
 * `scripts/validate-registry-refs.js` (post-merge CI validator) so the two
 * cannot drift.
 *
 * @param {unknown} cl - the `consolidates` field value
 * @returns {string[]} finding ids (empty when absent or unparseable)
 */
export function parseConsolidates(cl) {
  if (Array.isArray(cl)) return cl;
  if (typeof cl === "string" && cl.trim()) {
    return cl.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}