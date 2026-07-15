#!/usr/bin/env node
/**
 * Post-merge registry-ref validator.
 *
 * Scans the union of `meta-state.jsonl` + `change-log.jsonl` for real
 * dangling refs (target id missing, stale-view, superseded, resolved).
 * Used as the BLOCK signal in `.github/workflows/meta-state-refs-check.yml`
 * on `push: main`.
 *
 * Why post-merge: at push-to-main the full union is visible, so every dangling
 * ref is real (cross-PR orphans either self-healed on merge or never existed).
 * Pre-merge cross-PR detection was down-tiered — the pre-merge
 * `meta-state-pr-body-advisory.yml` only WARNs on the PR's own diff. Cross-PR
 * refs self-heal on merge.
 *
 * The pure functions (`isStaleViewLike`, `outboundRefsOf`, `computeDanglingRefs`)
 * are exported so the test suite can cover them in-process; the CLI block runs
 * only when invoked directly.
 *
 * Usage:
 *   node tools/learning-loop-mastra/scripts/validate-registry-refs.js [--root=<path>]
 *
 * Exit codes:
 *   0 — no real orphans
 *   1 — at least one real dangling ref (offending ids printed to stderr)
 *   2 — load/parse error
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConsolidates } from "../core/entry/consolidates-refs.js";

const META_STATE_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

export function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line));
  }
  return out;
}

// Mirrors `core/stale-view.js#isStaleView` semantics: open AND created > 7 days
// ago. Drift detection is skipped here — post-merge on main the registry is the
// source of truth and drift is handled by `meta_state_check_grounding`, not by
// this validator.
export function isStaleViewLike(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.status === "resolved" || entry.status === "superseded" || entry.status === "archived") return false;
  const created = entry.created_at;
  if (typeof created !== "string") return false;
  const ageMs = Date.now() - new Date(created).getTime();
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

// Per-kind forward-ref extractors. Splitting the branch table into one small
// function per `entry_kind` keeps each function's cyclomatic complexity low
// (the single-chain `if/else if` version measured 18). Mirrors the interactive
// counterpart in `tools/handlers/meta-state-relationships-tool.js`; if that
// handler's logic drifts, this file MUST be updated in the same commit.
const OUTBOUND_EXTRACTORS = {
  finding(entry) {
    const refs = [];
    if (entry.consolidated_into) refs.push({ kind: "change-log", id: entry.consolidated_into, field: "consolidated_into" });
    if (Array.isArray(entry.reopens)) for (const id of entry.reopens) refs.push({ kind: "finding", id, field: "reopens" });
    if (entry.promoted_to_rule) refs.push({ kind: "rule", id: entry.promoted_to_rule, field: "promoted_to_rule" });
    return refs;
  },
  "change-log"(entry) {
    const refs = [];
    if (entry.supersedes) refs.push({ kind: "change-log", id: entry.supersedes, field: "supersedes" });
    for (const id of parseConsolidates(entry.consolidates)) refs.push({ kind: "finding", id, field: "consolidates" });
    return refs;
  },
  rule(entry) {
    return entry.origin ? [{ kind: "finding", id: entry.origin, field: "origin" }] : [];
  },
  "loop-design"(entry) {
    const refs = [];
    if (Array.isArray(entry.proposed_design_for)) for (const id of entry.proposed_design_for) refs.push({ kind: id.startsWith("rule-") ? "rule" : "meta", id, field: "proposed_design_for" });
    if (Array.isArray(entry.addresses)) for (const id of entry.addresses) refs.push({ kind: "finding", id, field: "addresses" });
    return refs;
  },
};

// Extract forward cross-references from a single entry by dispatching to the
// per-kind extractor. Unknown kinds (and the implicit "finding" default when
// `entry_kind` is absent) yield no refs.
export function outboundRefsOf(entry) {
  const ek = entry.entry_kind ?? "finding";
  const extract = OUTBOUND_EXTRACTORS[ek];
  return extract ? extract(entry) : [];
}

// "missing" and "stale" are REAL orphans (typos, deleted targets, drift) and
// BLOCK the push-to-main. "superseded" and "resolved" are TERMINAL-status
// references — by design a change-log can consolidate a resolved finding, a
// loop-design can address a superseded finding — so they are INFO only.
export function computeDanglingRefs(entries) {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const blocking = [];
  const informational = [];
  for (const entry of entries) {
    const sourceKind = entry.entry_kind ?? "finding";
    for (const ref of outboundRefsOf(entry)) {
      const target = entryById.get(ref.id);
      if (!target) {
        blocking.push({ source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: ref.kind, reason: "missing" });
        continue;
      }
      if (isStaleViewLike(target)) {
        blocking.push({ source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "stale" });
      } else if (target.status === "superseded") {
        informational.push({ source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "superseded" });
      } else if (target.status === "resolved") {
        informational.push({ source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "resolved" });
      }
    }
  }
  return { blocking, informational };
}

// CLI entry — runs only when invoked directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootArg = args.find((a) => a.startsWith("--root="));
  const root = rootArg ? rootArg.slice("--root=".length) : process.cwd();
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
}