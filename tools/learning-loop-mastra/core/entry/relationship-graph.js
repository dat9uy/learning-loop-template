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
    // `consolidated_into` collapsed into a citation row. The
    // field stays `.optional()` on the schema (inert-historical; old
    // version lines still parse) but is de-routed from `CROSS_REFS` so
    // `forwardRefs`/`buildInverseIndexes` stop indexing it. The canonical
    // consolidated edge now lives in `citations_inverse` (sourced from
    // `meta_state_supersede` citation emissions, target=change-log,
    // source=finding).
    //
    // `promoted_to_rule` (the legacy dual-field ghost-ref that
    // mirrored `rule.origin`) is also retired. The canonical promotion
    // edge is now the origin citation row emitted by
    // `meta_state_promote_rule`. The field stays `.optional()` on the
    // schema (inert-historical) but is no longer indexed.
    { field: "reopens",            targetKind: "finding",    multi: true  },
  ],
  "change-log": [
    // `supersedes` was de-routed from `CROSS_REFS`; the
    // canonical change-log→change-log / change-log→rule supersession
    // edge is now a citation row emitted by `meta_state_log_change`
    // (and `meta_state_patch` for rule→rule). The field stays
    // `.optional()` on the schema (inert-historical) but is no longer
    // indexed. `consolidates` (the symmetric
    // counterpart of `consolidated_into`) is also retired — both fields are
    // inert-historical; the edge is sourced from `citations_inverse`.
  ],
  // Citation kind: the asserted-relationship carrier that replaces the
  // bespoke on-record fields consolidated_into/origin/supersedes/
  // promoted_to_rule. `source` and `target` are both forward refs into the
  // union — the citation's own id is NOT a ref target, so it stays out of
  // the inverse map population (the source/target field values carry the
  // edges). targetKind:"any" so source can point at any kind (rule,
  // change-log, finding) and target likewise (finding origin source, rule
  // target; change-log supersedes rule target; etc.). The verb stays prose
  // in `rationale` and is NEVER a runtime branch — see the state-3 L1.
  citation: [
    { field: "source",             targetKind: "any",        multi: false },
    { field: "target",             targetKind: "any",        multi: false },
  ],
  rule: [
    // `origin` + `supersedes` de-routed from `CROSS_REFS`. The
    // canonical promotion / supersession edges are now citation rows
    // (`source:rule, target:finding, rationale:"origin"` /
    // `source:rule, target:prior-rule, rationale:"supersedes"`). The
    // fields stay `.optional()` on the schema (inert-historical; old
    // version lines still parse) but are no longer indexed by the
    // inverse maps. The promoted_to_rule ghost-ref retired with origin
    // (the same de-routing).
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
 * back to a prefix heuristic.
 *
 * Canonical id prefixes: `meta-` (finding), `rule-` (rule),
 * `change-…` (change-log), `loop-design-` (loop-design), and `citation-`
 * (citation). The `citation-` prefix is the only citation kind marker;
 * lookup-first always wins for entries that exist on disk.
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
  if (typeof id === "string") {
    if (id.startsWith("rule-")) return "rule";
    if (id.startsWith("loop-design-")) return "loop-design";
    if (id.startsWith("citation-")) return "citation";
  }
  return "finding";
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
// the field is absent/empty/wildcard and should be skipped. Per-id
// wildcard/empty filtering.
function fieldIdValues(spec, value) {
  if (value === undefined || value === null || value === "" || value === "*") return null;
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
 * After the de-routing: `consolidates` was de-routed from `CROSS_REFS`; the
 * consolidated edge is sourced from `citations_inverse` (citation
 * `source:finding, target:change-log, rationale:"consolidated into…"`).
 *
 * Citation-source substitution: when a citation's `target` field points
 * at `targetId`, the inbound source is the citation's `source` value
 * (the finding that emitted the edge), NOT the citation's own id —
 * callers surface `cited_by` as the citing finding, not as the audit
 * row. This makes the wire shape symmetric with the non-citation case
 * (the source endpoint is what the user-facing tool wants to know).
 */
export function inverseRefs(targetId, entries) {
  const refs = [];
  for (const entry of entries) {
    const entryKind = entry.entry_kind ?? "finding";
    for (const r of forwardRefs(entry, entries)) {
      if (r.id !== targetId) continue;
      // Citation: report the citation's source as the inbound source id.
      // The source kind is resolved via `kindForId` (rule/finding/change-log);
      // for origin citations the source is a rule; for consolidated
      // citations the source is a finding. The `entries` parameter
      // enables lookup-first resolution (canonical id-prefix fallback
      // handles entries that are not on disk).
      if (entryKind === "citation" && r.field === "target") {
        const sourceKind = kindForId(entry.source, entries, "any");
        refs.push({ kind: sourceKind, id: entry.source, field: "target" });
        continue;
      }
      refs.push({ kind: entryKind, id: entry.id, field: r.field });
    }
  }
  return refs;
}

/**
 * Mirror of `core/loop-introspect.js#buildInverseIndexes`' named maps.
 * The public export shape is preserved (`addresses_inverse`,
 * `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`,
 * `reopens_inverse`, `consolidated_into_inverse`) AND gains a 7th map:
 * `citations_inverse`.
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
 * `citations_inverse` is sourced from citation entries. `forwardRefs` on a
 * citation emits two refs (one for `source`, one for `target`); both are
 * routed into `citations_inverse` keyed by the CITATION'S `target` value
 * with the CITATION'S `source` value as the emitted id — NOT `entry.id`
 * (the citation id itself is not the source — the source is the side that
 * "cites" me). The citation id is the audit record (it carries
 * `rationale`/`recorded_at`); the source/target field values are the
 * relationship endpoints. This map starts empty (no writers use citations
 * yet); subsequent work routes writes through it and empties the
 * corresponding named maps.
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

// Route one forward ref into the appropriate inverse map(s). The legacy
// `promoted_to_rule` source is skipped (canonical edge is now a citation);
// forwardOnly fields (`applies_to_resolution`) have no inverse map.
//
// `consolidated_into`/`consolidates` and `origin`/`supersedes`
// were de-routed from `CROSS_REFS`; the canonical edges
// (consolidated, origin, supersedes) now live in `citations_inverse`
// (sourced from citation emissions by `meta_state_supersede` /
// `meta_state_promote_rule` / `meta_state_log_change` / `meta_state_patch`).
// `consolidated_into_inverse` / `origin_inverse` / `supersedes_inverse` /
// `promoted_to_rule_inverse` remain in the named-maps shape for backward
// compat with legacy readers (kept empty; the wire shape collapses into
// `cited_by`).
//
// Citation route: a citation's `source` and `target` field values
// are the two relationship endpoints. The inverse map is keyed by the
// CITATION'S `target` value, with the CITATION'S `source` value as the
// emitted id (NOT the citation id — that would conflate the audit record
// with the source's relationship). The `target` field's ref is the
// load-bearing one; the `source` field is just for symmetry.
function indexRef(indexes, ref, entry) {
  if (ref.field === "promoted_to_rule") return;
  // Citation fields route into the generic citations_inverse. Captured
  // from the entry directly because the citation's relationship endpoints
  // (source/target) are field values, not entry.id.
  if (entry.entry_kind === "citation") {
    if (ref.field === "target") {
      // Citations are written by entries; the "source" of a citation is the
      // entry that emits the edge. The inverse "who cites me?" query keys
      // on the citation's TARGET id; the value is the citation's SOURCE
      // (NOT the citation id — that would conflate the audit row with the
      // relationship's source endpoint).
      pushToIndexUnique(indexes.citations_inverse, entry.target, entry.source);
      return;
    }
    if (ref.field === "source") {
      // The source side of a citation is the emitter; queryable via the
      // inverse by asking "which target does this source cite?" — but the
      // primary citations_inverse map is target→source. Source→target is
      // a derived form (the same citation row, read backwards). NOT
      // populating a second map keeps the surface single; callers iterate
      // forwardRefs on the citation entry for source→target resolution.
      return;
    }
    return;
  }
  const mapName = fieldToInverseMap(ref.field);
  if (mapName) pushToIndex(indexes[mapName], ref.id, entry.id);
}

export function buildInverseIndexes(entries) {
  const indexes = newIndexState();
  // `consolidated_into` and `consolidates` were de-routed from
  // `CROSS_REFS`. The legacy `consolidated_into_inverse` pre-population
  // (for change-logs with an empty `consolidates` array) is dropped; the
  // consolidated edge is sourced from `citations_inverse` going forward.
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
    citations_inverse: new Map(),
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
export const _internal = { CROSS_REFS, newIndexState };

export { kindForId };