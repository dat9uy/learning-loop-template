#!/usr/bin/env node
import { readRegistry, writeEntry, updateEntry } from "../../core/legacy/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Fix broken proposed_design_for refs on loop-design entries.
 * The 2 entries shipped in 260606-rule-loop-design-first-class wrote
 * code symbols as proposed_design_for values instead of entry ids.
 *
 * This script walks loop-design entries, resolves each proposed_design_for
 * value against the registry, and strips non-resolvable refs. It is idempotent:
 * a second run produces no changes.
 */

const root = resolveRoot();
const entries = readRegistry(root);

const entryIds = new Set(entries.map((e) => e.id));
const ruleIds = new Set(
  entries.filter((e) => e.entry_kind === "rule").map((e) => e.id)
);
const loopDesignIds = new Set(
  entries.filter((e) => e.entry_kind === "loop-design").map((e) => e.id)
);

let changes = 0;
const fixLog = [];

for (const entry of entries) {
  if (entry.entry_kind !== "loop-design") continue;
  // proposed_design_for is a flat string array (wire-format wrap fix in Phase B)
  const refs = entry.proposed_design_for;
  if (!refs || refs.length === 0) continue;

  const cleaned = [];
  const stripped = [];

  for (const ref of refs) {
    if (entryIds.has(ref) || ruleIds.has(ref) || loopDesignIds.has(ref)) {
      cleaned.push(ref);
    } else {
      stripped.push(ref);
    }
  }

  if (stripped.length > 0) {
    const expectedVersion = entry.version ?? 0;
    const r = await updateEntry(root, entry.id, {
      proposed_design_for: cleaned,
      _expected_version: expectedVersion,
    });
    if (r === "version_mismatch") {
      console.warn(
        `CAS: version mismatch for ${entry.id} (expected ${expectedVersion}); skipping`
      );
      continue;
    }
    if (r !== true) {
      console.warn(
        `CAS: entry ${entry.id} update failed (r=${r}); skipping`
      );
      continue;
    }
    changes++;
    fixLog.push({
      id: entry.id,
      stripped,
      kept: cleaned,
      before: entry.proposed_design_for,
    });
  }
}

if (changes > 0) {
  const now = new Date().toISOString();
  const changeLogEntry = {
    // m2: include seconds (slice 14 instead of 12) so two runs in the same
    // minute produce distinct ids. The script is data-idempotent (gated on
    // changes > 0), but rapid re-runs could still race on id collision.
    id: `meta-${now.replace(/[-:T.Z]/g, "").slice(0, 14)}Z-fix-loop-design-refs`,
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: "meta-state.jsonl#loop-design.proposed_design_for",
    change_diff: {
      added: [],
      removed: fixLog.flatMap((l) => l.stripped),
      changed: [],
    },
    reason: `Fixed ${fixLog.length} loop-design entries with broken proposed_design_for refs. Stripped ${fixLog.flatMap((l) => l.stripped).length} non-resolvable refs (code symbols, not entry ids). Idempotent: re-run produces no changes.`,
    status: "active",
    created_at: now,
    version: 0,
  };
  await writeEntry(root, changeLogEntry);
  console.log(`Fixed ${changes} loop-design entries. Stripped refs: ${JSON.stringify(fixLog.flatMap((l) => l.stripped))}`);
  console.log(`Logged change-log: ${changeLogEntry.id}`);
} else {
  console.log("No changes needed (idempotent).");
}

console.log("Done.");
