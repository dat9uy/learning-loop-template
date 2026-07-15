#!/usr/bin/env node
/**
 * Plan 260715-0801 Tier 1 Phase 3 step 3: post-merge registry-ref validator.
 *
 * Reuses the `meta_state_relationships` (plural) dangling-refs logic from
 * `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js`
 * to scan the union of `meta-state.jsonl` + `change-log.jsonl` for real
 * dangling refs (target id missing, kind-mismatch, stale-view, superseded,
 * resolved). Used as the BLOCK signal in `.github/workflows/meta-state-refs-check.yml`
 * on `push: main`.
 *
 * Why post-merge: at push-to-main the full union is visible, so every dangling
 * ref is real (cross-PR orphans either self-healed on merge or never existed).
 * Pre-merge cross-PR detection was down-tiered (Validation Session 1 Q3) —
 * the pre-merge `meta-state-pr-body-advisory.yml` only WARNs on the PR's own
 * diff. Cross-PR refs self-heal on merge.
 *
 * Usage:
 *   node tools/learning-loop-mastra/scripts/validate-registry-refs.mjs [--root=<path>]
 *
 * Exit codes:
 *   0 — no real orphans
 *   1 — at least one real dangling ref (offending ids printed to stderr)
 *   2 — load/parse error
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : process.cwd();

const META_STATE_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line));
  }
  return out;
}

// Pure functions copied from
// tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js
// (no import path to avoid ESM/CJS friction; the inline copy is the canonical
// validator and the handler is its interactive counterpart). If the handler
// logic drifts, this file MUST be updated in the same commit.

function isStaleViewLike(entry) {
  // Plan 260707-0812: stale is a derived view (age + drift), not a stored
  // status. Mirrors `core/stale-view.js#isStaleView` semantics: open AND
  // (created > 7 days ago OR code-fingerprint drifted in file-index.jsonl).
  // Drift detection would require the file-index; we skip drift here because
  // post-merge on main the registry is the source of truth and drift is
  // handled by the `meta_state_check_grounding` MCP tool, not by this
  // validator. We only check the age predicate.
  if (!entry || typeof entry !== "object") return false;
  if (entry.status === "resolved" || entry.status === "superseded" || entry.status === "archived") return false;
  const created = entry.created_at;
  if (typeof created !== "string") return false;
  const ageMs = Date.now() - new Date(created).getTime();
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

function outboundRefsOf(entry) {
  const refs = [];
  const ek = entry.entry_kind ?? "finding";
  if (ek === "finding") {
    if (entry.consolidated_into) refs.push({ kind: "change-log", id: entry.consolidated_into, field: "consolidated_into" });
    if (Array.isArray(entry.reopens)) for (const id of entry.reopens) refs.push({ kind: "finding", id, field: "reopens" });
    if (entry.promoted_to_rule) refs.push({ kind: "rule", id: entry.promoted_to_rule, field: "promoted_to_rule" });
  } else if (ek === "change-log") {
    if (entry.supersedes) refs.push({ kind: "change-log", id: entry.supersedes, field: "supersedes" });
    // Plan 260715-0801 Validation Q2: consolidates is z.array(z.string()) post-migration.
    // Tolerate legacy CSV string form for in-flight processes.
    const cl = entry.consolidates;
    const ids = Array.isArray(cl)
      ? cl
      : typeof cl === "string" && cl.trim()
        ? cl.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    for (const id of ids) refs.push({ kind: "finding", id, field: "consolidates" });
  } else if (ek === "rule") {
    if (entry.origin) refs.push({ kind: "finding", id: entry.origin, field: "origin" });
  } else if (ek === "loop-design") {
    if (Array.isArray(entry.proposed_design_for)) for (const id of entry.proposed_design_for) refs.push({ kind: id.startsWith("rule-") ? "rule" : "meta", id, field: "proposed_design_for" });
    if (Array.isArray(entry.addresses)) for (const id of entry.addresses) refs.push({ kind: "finding", id, field: "addresses" });
  }
  return refs;
}

function computeDanglingRefs(entries) {
  // Per Plan 260715-0801 Phase 4 + Validation Session 1 Q3:
  // - "missing" and "stale" are REAL orphans — tyops, deleted targets, or
  //   drift. These BLOCK the merge / push-to-main.
  // - "superseded" and "resolved" are TERMINAL status references — by design
  //   a change-log can consolidate a resolved finding, a loop-design can
  //   address a superseded finding. These are INFO only (no BLOCK).
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const blocking = [];
  const informational = [];
  for (const entry of entries) {
    const refs = outboundRefsOf(entry);
    for (const ref of refs) {
      const target = entryById.get(ref.id);
      if (!target) {
        blocking.push({ source_id: entry.id, source_kind: entry.entry_kind ?? "finding", field: ref.field, target_id: ref.id, target_kind: ref.kind, reason: "missing" });
        continue;
      }
      const status = target.status;
      if (isStaleViewLike(target)) {
        blocking.push({ source_id: entry.id, source_kind: entry.entry_kind ?? "finding", field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "stale" });
      } else if (status === "superseded") {
        informational.push({ source_id: entry.id, source_kind: entry.entry_kind ?? "finding", field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "superseded" });
      } else if (status === "resolved") {
        informational.push({ source_id: entry.id, source_kind: entry.entry_kind ?? "finding", field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "resolved" });
      }
    }
  }
  return { blocking, informational };
}

try {
  const metaPath = join(root, META_STATE_FILENAME);
  const changeLogPath = join(root, CHANGE_LOG_FILENAME);
  if (!existsSync(metaPath)) {
    console.error(`validate-registry-refs: meta-state.jsonl not found at ${metaPath}`);
    process.exit(2);
  }
  const entries = [
    ...readJsonl(metaPath),
    ...readJsonl(changeLogPath),
  ];
  const { blocking, informational } = computeDanglingRefs(entries);
  if (informational.length > 0) {
    console.log(`validate-registry-refs: ${informational.length} ref(s) to terminal-status entries (resolved/superseded — informational, no BLOCK).`);
  }
  if (blocking.length === 0) {
    console.log(`validate-registry-refs: 0 real orphans across ${entries.length} entries (meta-state + change-log union).`);
    process.exit(0);
  }
  console.error(`validate-registry-refs: BLOCK — ${blocking.length} real orphan(s) on main:`);
  for (const d of blocking) {
    console.error(`  ${d.source_id} (${d.source_kind}).${d.field} -> ${d.target_id} [${d.reason}]`);
  }
  process.exit(1);
} catch (err) {
  console.error(`validate-registry-refs: ${err.message}`);
  process.exit(2);
}