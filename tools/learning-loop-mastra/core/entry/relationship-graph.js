/**
 * Single source of truth for the meta-state relationship model.
 *
 * Cross-ref field table per kind + forward/inverse resolution; folded from
 * existing narrow modules (parseConsolidates, inboundFromLoopDesign). The
 * retrieval wire shape (groupOutbound, groupInbound, INBOUND_KEY_MAP,
 * computeDanglingRefs) lives in the relationships tool because it needs
 * stale-view machinery and is presentation logic.
 *
 * Owns (a) the cross-ref field table per kind, (b) forward + inverse resolution,
 * (c) write-time structural RI validation, and (d) the two leaf helpers
 * (`parseConsolidates`, `inboundFromLoopDesign`) folded from existing narrow
 * modules. The retrieval wire shape (`groupOutbound` / `groupInbound` /
 * `INBOUND_KEY_MAP`) and `computeDanglingRefs` STAY in the relationships tool
 * because they need `stale-view` and are presentation logic (red-team R10).
 *
 * Pure — no `fs`, no `gate-logic`, no `stale-view`, no `core/meta-state.js`
 * imports. Keeps the post-merge CI validator (`scripts/validate-registry-refs.js`)
 * decoupled from runtime drift logic and avoids an import cycle with the
 * schema owner. The cross-ref table is plain DATA, not imported schemas.
 */

/**
 * The `parseConsolidates` body was previously in
 * `core/entry/consolidates-refs.js`; folded here as the central
 * single source of truth. The original file is now a thin re-export (see
 * `core/entry/consolidates-refs.js`) for rollback safety (red-team R10).
 */
function parseConsolidates(cl) {
  if (Array.isArray(cl)) return cl;
  if (typeof cl === "string" && cl.trim()) {
    return cl.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Declarative cross-ref-per-kind table.
 *
 * `cascade_from` is NOT declared — it is not persisted (transient input to
 * `meta_state_resolve`).
 *
 * Flags:
 *   `legacy`           — dual-field other half; preserved on disk, not used as
 *                        an inverse source (see `promoted_to_rule`).
 *   `canonicalPromotion` — `rule.origin` is the canonical promotion ref; the
 *                        inverse `promoted_to_rule_inverse` is derived from
 *                        this field alone (1 ref per finding, deduped).
 *   `forwardOnly`      — no inverse map (the field is not the source of any
 *                        inverse index; e.g. `applies_to_resolution` is a
 *                        gating hint, not a lifecycle edge).
 *   `riExempt`         — never validated by `resolveStructuralRI` (the field
 *                        is `z.string()`, not an entry-id ref; e.g. a
 *                        determinism-checklist pattern like `test-session-123`
 *                        is valid, not dangling — red-team R4).
 */
const CROSS_REFS = {
  finding: [
    { field: "consolidated_into",  targetKind: "change-log", multi: false },
    { field: "reopens",            targetKind: "finding",    multi: true  },
    { field: "promoted_to_rule",   targetKind: "rule",       multi: false, legacy: true },
  ],
  "change-log": [
    { field: "supersedes",         targetKind: "change-log", multi: false },
    { field: "consolidates",       targetKind: "finding",    multi: true  },
  ],
  rule: [
    { field: "origin",             targetKind: "finding",    multi: false, canonicalPromotion: true },
    { field: "supersedes",         targetKind: "rule",       multi: false },
    // red-team R4/R10: `applies_to_resolution` is `z.string()` (not
    // `entryIdRefArray`); its real contract is "finding id OR a determinism-
    // checklist pattern". RI-EXEMPT; forwardOnly (no inverse map). The
    // generic `"*"` skip in `forwardRefs` makes a `wildcardOk` flag redundant.
    { field: "applies_to_resolution", targetKind: "finding", multi: false, forwardOnly: true, riExempt: true },
  ],
  "loop-design": [
    { field: "proposed_design_for", targetKind: "any",       multi: true  },
    { field: "addresses",           targetKind: "finding",   multi: true  },
  ],
};

/**
 * Resolve the entry_kind for an id. Lookup-first (canonical) when `entries`
 * is provided; otherwise fall back to the schema-typed `hintKind` from the
 * cross-ref table (e.g. `supersedes` is always `change-log` →
 * `change-log`); finally, when no hint is available (loop-design
 * `proposed_design_for`, which targets either `rule` or `finding`), fall
 * back to a prefix heuristic (`rule-` → `rule`, else `finding`).
 *
 * Fixes the validator's kind-"meta" bug at
 * `scripts/validate-registry-refs.js:126` (the legacy fallback returned
 * the literal string "meta" for non-`rule-` prefixes; the canonical
 * finding prefix is `meta-…` and the kind is `finding`).
 */
function kindForId(id, entries, hintKind) {
  if (entries) {
    const found = entries.find((e) => e.id === id);
    if (found) return found.entry_kind ?? "finding";
  }
  if (hintKind && hintKind !== "any") return hintKind;
  return typeof id === "string" && id.startsWith("rule-") ? "rule" : "finding";
}

/**
 * Single forward resolver covering all 4 kinds. Mirrors the union of the 4
 * factories' `outboundRefs` (including `applies_to_resolution`, which the
 * validator currently omits; the graph emits it). Empty / null / [] / "*"
 * values are skipped. `targetKind: "any"` (loop-design `proposed_design_for`)
 * is resolved via `kindForId`.
 *
 * `consolidates` (change-log) tolerates the legacy CSV-string form via
 * `parseConsolidates` — the post-migration canonical is `z.array(z.string())`
 * but in-flight processes may read pre-migration data.
 */
// Normalize a cross-ref field value to a list of id strings, or `null` when
// the field is absent/empty/wildcard and should be skipped. Handles the
// legacy CSV-string `consolidates` form and per-id wildcard/empty filtering.
function fieldIdValues(spec, value) {
  if (value === undefined || value === null || value === "" || value === "*") return null;
  if (spec.field === "consolidates" && typeof value === "string") {
    const parsed = parseConsolidates(value);
    return parsed.length > 0 ? parsed : null;
  }
  if (Array.isArray(value)) {
    const ids = value.filter((id) => id !== undefined && id !== null && id !== "" && id !== "*");
    return ids.length > 0 ? ids : null;
  }
  if (typeof value === "string") return [value];
  return null;
}

export function forwardRefs(entry, entries) {
  const refs = [];
  const table = CROSS_REFS[entry.entry_kind ?? "finding"];
  if (!table) return refs;
  for (const spec of table) {
    const ids = fieldIdValues(spec, entry[spec.field]);
    if (!ids) continue;
    for (const id of ids) {
      refs.push({ kind: kindForId(id, entries, spec.targetKind), id, field: spec.field });
    }
  }
  return refs;
}

/**
 * Single inverse resolver. Returns refs FROM entries whose forward edges
 * point at `targetId`. Each ref describes the SOURCE entry (the entry that
 * emits the edge) — `id` = source entry id, `kind` = source entry kind —
 * because the caller (`factory.inboundRefs`) is asking "who points at me?".
 *
 * Includes the legacy `finding.promoted_to_rule` as an inbound source (it
 * IS an outbound ref to a rule); the dedup of the dual-field 2-ref artifact
 * is handled in `buildInverseIndexes` (which restricts the
 * `promoted_to_rule_inverse` map to the canonical `rule.origin` source).
 *
 * Wire-shape normalization: when a change-log's `consolidates` is the
 * inbound source, re-label the field to `consolidated_into` (the
 * finding-side field name) so the relationships tool's INBOUND_KEY_MAP
 * keys it as `consolidated_by` — matches the legacy wire shape.
 */
export function inverseRefs(targetId, entries) {
  const refs = [];
  for (const entry of entries) {
    const entryKind = entry.entry_kind ?? "finding";
    for (const r of forwardRefs(entry, entries)) {
      if (r.id !== targetId) continue;
      const field = r.field === "consolidates" ? "consolidated_into" : r.field;
      refs.push({ kind: entryKind, id: entry.id, field });
    }
  }
  return refs;
}

/**
 * Mirror of `core/loop-introspect.js#buildInverseIndexes`' 6 named maps.
 * The public export shape is preserved (`addresses_inverse`,
 * `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`,
 * `reopens_inverse`, `consolidated_into_inverse`).
 *
 * Each map is `Map<targetId, sourceId[]>` — values are entry IDs (the entry
 * whose forward ref points at the key), not kinds. Special case:
 * `consolidated_into_inverse` is keyed by the change-log id (the target of
 * `consolidated_into` AND the source of `consolidates`); values are finding
 * ids either way. This asymmetry matches the legacy contract locked by
 * `core/loop-introspect.test.js`. Dedup is applied so a finding appearing
 * in both a change-log's `consolidates` AND its own `consolidated_into`
 * counts once.
 *
 * Population changes from the legacy implementation:
 *   - `promoted_to_rule_inverse` is sourced from `rule.origin` alone (1 ref,
 *     deduped) — fixes the dual-source 2-ref artifact. The legacy
 *     `finding.promoted_to_rule` field is preserved on disk but no longer
 *     contributes to the inverse.
 *   - `consolidated_into_inverse` is now populated from BOTH sides: a
 *     change-log's `consolidates` (the legacy `indexConsolidatedInto` source)
 *     AND a finding's `consolidated_into`. The legacy implementation indexed
 *     only the change-log side, so a finding with `consolidated_into` whose
 *     change-log lacked a matching `consolidates` was invisible. The dual-side
 *     population is intentionally more complete; dedup (above) keeps a
 *     reciprocal pair counting once. No existing test asserted the one-sided
 *     absence, so no test regresses.
 *   - Forward `reopens` resolution (the index layer's gap) is supplied by
 *     `forwardRefs` reading `entry.reopens` directly (bug #1 regression-
 *     prevention invariant).
 */
// Ensure `map[key]` exists as a list, then append `val` if not already
// present. Used for both `consolidated_into_inverse` population paths, which
// dedup reciprocal pairs so a finding in both a change-log's `consolidates`
// and its own `consolidated_into` counts once.
function upsertList(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  const arr = map.get(key);
  if (!arr.includes(val)) arr.push(val);
}

// Route one forward ref into the appropriate inverse map(s). `origin` feeds
// two maps (canonical `promoted_to_rule_inverse` dedup); `consolidates` and
// `consolidated_into` populate `consolidated_into_inverse` from both sides;
// the legacy `promoted_to_rule` source is skipped (canonical is `rule.origin`);
// forwardOnly fields (`applies_to_resolution`) have no inverse map.
function indexRef(indexes, ref, entry) {
  if (ref.field === "promoted_to_rule") return;
  if (ref.field === "origin") {
    pushToIndexUnique(indexes.origin_inverse, ref.id, entry.id);
    pushToIndexUnique(indexes.promoted_to_rule_inverse, entry.id, ref.id);
    return;
  }
  if (ref.field === "consolidates") {
    upsertList(indexes.consolidated_into_inverse, entry.id, ref.id);
    return;
  }
  if (ref.field === "consolidated_into") {
    upsertList(indexes.consolidated_into_inverse, ref.id, entry.id);
    return;
  }
  const mapName = fieldToInverseMap(ref.field);
  if (mapName) pushToIndex(indexes[mapName], ref.id, entry.id);
}

export function buildInverseIndexes(entries) {
  const indexes = newIndexState();
  // Pre-populate `consolidated_into_inverse` keys for change-logs with an
  // empty `consolidates` array — matches the legacy `indexConsolidatedInto`
  // contract (`loop-introspect.test.js:146-166`). forwardRefs returns []
  // for empty fields, so without this pre-population the key would not be
  // created and consumers expect `[]` for the empty case.
  for (const entry of entries) {
    if (entry.entry_kind === "change-log" && Array.isArray(entry.consolidates) && entry.consolidates.length === 0) {
      indexes.consolidated_into_inverse.set(entry.id, []);
    }
  }
  for (const entry of entries) {
    for (const ref of forwardRefs(entry, entries)) {
      indexRef(indexes, ref, entry);
    }
  }
  return indexes;
}

function pushToIndex(map, key, sourceId) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(sourceId);
}

function pushToIndexUnique(map, key, sourceId) {
  if (!map.has(key)) map.set(key, []);
  const arr = map.get(key);
  if (!arr.includes(sourceId)) arr.push(sourceId);
}

function fieldToInverseMap(field) {
  switch (field) {
    case "addresses":         return "addresses_inverse";
    case "supersedes":        return "supersedes_inverse";
    case "reopens":           return "reopens_inverse";
    default:                  return null;
  }
}

function newIndexState() {
  return {
    addresses_inverse: new Map(),
    supersedes_inverse: new Map(),
    origin_inverse: new Map(),
    promoted_to_rule_inverse: new Map(),
    reopens_inverse: new Map(),
    consolidated_into_inverse: new Map(),
  };
}

// Re-export the parseConsolidates leaf helper (folded from consolidates-refs.js).
export { parseConsolidates };

// Folded from inbound-from-loop-design.js.
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

/**
 * Write-time structural referential-integrity check (id-existence ONLY).
 *
 * `existenceSet` is a `Set<string>` of ids the caller injected from the
 * projected registry. The check rejects refs whose target id is
 * **never-existent**. It does NOT kind-match (the Set carries no kind — red-
 * team R3) and does NOT exclude tombstones (a deleted id remains in the
 * projection — red-team R8); the derived `dangling_refs` view surfaces
 * deleted/wrong-kind refs post-hoc.
 *
 * `applies_to_resolution` is RI-EXEMPT (red-team R4 — the field is
 * `z.string().optional()`, not `entryIdRefArray`; a determinism-checklist
 * pattern like `test-session-123` is valid). `forwardRefs` skips the
 * generic `"*"` wildcard already.
 */
export function resolveStructuralRI(entry, existenceSet) {
  const dangling = [];
  for (const ref of forwardRefs(entry)) {
    if (ref.field === "applies_to_resolution") continue; // RI-EXEMPT
    if (!existenceSet.has(ref.id)) {
      dangling.push({ field: ref.field, id: ref.id });
    }
  }
  return { ok: dangling.length === 0, dangling };
}

/**
 * Return only the (field,id) pairs in `newRefs` not present in `oldRefs` —
 * the refs a patch introduces or repoints. Used by `updateEntry`'s changed-
 * only RI gate so an inherited historical `reopens` is NOT re-validated
 * (the load-bearing case: a description edit on a finding with a stale
 * `reopens` must not block).
 *
 * `applies_to_resolution` is excluded (RI-exempt — red-team R4).
 */
export function diffChangedRefs(newRefs, oldRefs) {
  const oldSet = new Set(
    oldRefs
      .filter((r) => r.field !== "applies_to_resolution")
      .map((r) => `${r.field}::${r.id}`)
  );
  return newRefs
    .filter((r) => r.field !== "applies_to_resolution")
    .filter((r) => !oldSet.has(`${r.field}::${r.id}`));
}

// Internal — exposed for tests + the legacy `loop-introspect.buildInverseIndexes` consumers.
export const _internal = { CROSS_REFS, kindForId, newIndexState };