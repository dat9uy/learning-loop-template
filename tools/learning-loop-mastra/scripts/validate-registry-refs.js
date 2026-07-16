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
 * `meta-state-pr-body-advisory.yml` only WARNS on the PR's own diff (and now
 * FAILS on a new unresolved `consolidates`/`supersedes` ref as a backstop —
 * plan 260715-1608 Phase 1). Cross-PR refs self-heal on merge.
 *
 * Pure functions (`isTerminalSource`, `isStaleViewLike`, `outboundRefsOf`,
 * `computeDanglingRefs`) are exported so the test suite can cover them in-process;
 * the CLI block runs only when invoked directly.
 *
 * Usage:
 *   node tools/learning-loop-mastra/scripts/validate-registry-refs.js [--root=<path>]
 *
 * Exit codes:
 *   0 — no blocking orphans (historical + informational counts are non-blocking)
 *   1 — at least one blocking orphan (offending ids printed to stderr)
 *   2 — load/parse error
 *
 * Plan 260715-1608 Phase 1: 3-bucket classification.
 *   - `blocking`     — REAL ref corruption (active/open mutable source with
 *                      a missing target; OR any duplicate id across the union).
 *                      Drives the CLI exit code.
 *   - `historical`   — historical refs that cannot be cleaned (immutable
 *                      change-log source; OR terminal-status source). The
 *                      55 `consolidates` on immutable change-logs land here.
 *   - `informational` — refs whose target exists but is stale-view, superseded,
 *                      or resolved. Surfaced as a count, NOT blocking.
 *
 * Cross-tool divergence: the interactive `meta_state_relationships` tool's
 * `dangling_refs` retains the legacy flat reasons (missing/stale/superseded/
 * resolved) — its `computeDanglingRefs(refs, entries)` signature omits the
 * source entry, so adding `historical` would require a signature refactor
 * (YAGNI per Plan 260715-1608 Phase 1 red-team F2). The `historical` label
 * lives only in this post-merge validator.
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

// Deliberately uses a creation-age approximation instead of canonical
// `core/stale-view.js#isStaleView` (which prefers `last_verified_at‖created_at`).
// Post-merge on main the registry is the source of truth and runtime drift is
// handled by `meta_state_check_grounding`, not by this validator — coupling the
// validator to the canonical stale-view predicate would re-introduce drift
// coupling. See Plan 260715-1608 Phase 1 (red-team F3).
export function isStaleViewLike(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.status === "resolved" || entry.status === "superseded" || entry.status === "archived") return false;
  const created = entry.created_at;
  if (typeof created !== "string") return false;
  const ageMs = Date.now() - new Date(created).getTime();
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

// Terminal status for a SOURCE entry. Historical refs.
// - `superseded` / `resolved` / `archived` apply to all kinds.
// - `inactive` is a terminal status for `rule` and `loop-design` (their
//   schemas use `status: z.enum(["active","inactive"]`); findings never
//   carry `inactive`, so it does NOT classify findings as terminal.
// - A legacy entry with no `entry_kind` AND no `status` is treated as
//   active/open (mutable source) — historical exemption requires an
//   explicit terminal status.
// Mirrors `core/constants.js#isOpen`'s superset/tolerance intent only where
// the legacy `active`/`reported`/`stale` enum-collapse tolerance does not
// apply — this validator deliberately keeps terminal detection native to
// avoid coupling to the open-equivalence surface.
export function isTerminalSource(entry) {
  if (!entry || typeof entry !== "object") return false;
  const status = entry.status;
  if (status === "superseded" || status === "resolved" || status === "archived") return true;
  const kind = entry.entry_kind ?? "finding";
  if ((kind === "rule" || kind === "loop-design") && status === "inactive") return true;
  return false;
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

// Classify one outbound ref into a bucket. Returns `{ bucket, record }`, or
// `null` when the target exists and is neither stale-view nor terminal (a
// healthy ref — nothing to report). Extracted from `computeDanglingRefs` so
// the per-ref 3-bucket + target-status decision chain lives in its own
// function; the inline version pushed `computeDanglingRefs` to cyclomatic 19.
function classifyRef(entry, sourceKind, ref, target) {
  if (!target) {
    // Immutable change-log sources and terminal-status sources cannot be
    // patched, so their missing refs are history, not corruption. Any other
    // (active/open mutable) source with a missing target is real corruption.
    const bucket = sourceKind === "change-log" || isTerminalSource(entry) ? "historical" : "blocking";
    return { bucket, record: { source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: ref.kind, reason: "missing" } };
  }
  // Target exists: only stale-view / superseded / resolved targets are
  // surfaced, as informational. stale-view is a freshness signal handled by
  // `meta_state_check_grounding`, not this ref-corruption gate.
  if (isStaleViewLike(target)) {
    return { bucket: "informational", record: { source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "stale" } };
  }
  if (target.status === "superseded") {
    return { bucket: "informational", record: { source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "superseded" } };
  }
  if (target.status === "resolved") {
    return { bucket: "informational", record: { source_id: entry.id, source_kind: sourceKind, field: ref.field, target_id: ref.id, target_kind: target.entry_kind ?? "finding", reason: "resolved" } };
  }
  return null;
}

// 3-bucket classification. `blocking` drives the CLI exit; `historical` and
// `informational` are counted but never block.
//
// Duplicate-id guard: block only CROSS-KIND id collisions. The masking
// vector (Plan 260715-1608 Phase 1 red-team F8) is a line that reuses an
// existing id but carries a DIFFERENT entry_kind — e.g. a change-log
// reusing a finding's id — which the `entryById` last-write-wins Map
// below would silently resolve to one branch, masking the other. That
// is corruption and stays blocking.
//
// A SAME-KIND multi-row id is NOT corruption. Under the versioned-append
// write-path (Tier 2 Phase B), every patch/refinement appends a new line
// with the same id + same entry_kind, and the read projection
// (core/meta-state.js#_readAndParseRegistry) dedupes by max-version (tie-
// break on created_at). A same-version same-kind pair is a parallel-merge
// collision the projection resolves the same way — "no data loss, just
// audit ambiguity" (WARNING-only, never BLOCK). Block only when an id is
// shared across more than one entry_kind.
export function computeDanglingRefs(entries) {
  const blocking = [];
  const historical = [];
  const informational = [];
  const buckets = { blocking, historical, informational };

  // Group rows by id; block only when an id is shared across >1 entry_kind
  // (cross-kind masking). Same-kind multi-row ids — versioned append or a
  // same-version merge collision — are legitimate; the projection resolves
  // them at read time.
  const rowsById = new Map();
  for (const e of entries) {
    if (!e || typeof e.id !== "string") continue;
    const arr = rowsById.get(e.id);
    if (arr) arr.push(e);
    else rowsById.set(e.id, [e]);
  }
  for (const [id, rows] of rowsById) {
    if (rows.length < 2) continue;
    const kinds = new Set(rows.map((r) => r.entry_kind ?? "finding"));
    if (kinds.size > 1) {
      blocking.push({
        source_id: id,
        source_kind: "any",
        field: "(id)",
        target_id: id,
        target_kind: "any",
        reason: "duplicate_id",
        duplicate_count: rows.length,
      });
    }
  }

  const entryById = new Map(entries.map((e) => [e.id, e]));
  for (const entry of entries) {
    const sourceKind = entry.entry_kind ?? "finding";
    for (const ref of outboundRefsOf(entry)) {
      const classified = classifyRef(entry, sourceKind, ref, entryById.get(ref.id));
      if (classified) buckets[classified.bucket].push(classified.record);
    }
  }
  return { blocking, historical, informational };
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
    const { blocking, historical, informational } = computeDanglingRefs(entries);
    if (historical.length > 0) {
      console.log(`validate-registry-refs: ${historical.length} ref(s) classified historical (immutable + terminal-source missing; no BLOCK).`);
    }
    if (informational.length > 0) {
      console.log(`validate-registry-refs: ${informational.length} ref(s) to terminal-status/stale entries (informational, no BLOCK).`);
    }
    if (blocking.length === 0) {
      console.log(`validate-registry-refs: 0 blocking orphan(s) across ${entries.length} entries (meta-state + change-log union).`);
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