/**
 * Shared per-kind inbound-ref extractor: returns the loop-design refs that
 * point at the parsed entry. Used by the `inboundRefs` dispatchers in
 * `finding.js` and `rule.js`. Phase 4 dedup extraction (fallow `dup:48814d6e`).
 *
 * Returns refs in two flavors:
 *   - `addresses` — a loop-design's `addresses: [...]` field pointing at the entry
 *   - `proposed_design_for` — a loop-design's `proposed_design_for: [...]` field
 *
 * Both are multi-valued on the loop-design side. We emit one ref per match;
 * the dispatcher's outer loop flattens via `refs.push(...inboundFromLoopDesign(...))`.
 *
 * @param {object} entry — the candidate loop-design (kind check is the caller's job)
 * @param {object} parsed — the parsed entry whose inbound refs we are computing
 * @returns {Array<{kind: "loop-design", id: string, field: "addresses" | "proposed_design_for"}>}
 */
export function inboundFromLoopDesign(entry, parsed) {
  const refs = [];
  if (Array.isArray(entry.addresses) && entry.addresses.includes(parsed.id)) {
    refs.push({ kind: "loop-design", id: entry.id, field: "addresses" });
  }
  if (Array.isArray(entry.proposed_design_for) && entry.proposed_design_for.includes(parsed.id)) {
    refs.push({ kind: "loop-design", id: entry.id, field: "proposed_design_for" });
  }
  return refs;
}