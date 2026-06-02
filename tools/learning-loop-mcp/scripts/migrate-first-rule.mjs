#!/usr/bin/env node
/**
 * One-time migration: convert all existing meta-state entries to loop-anti-pattern
 * with inferred subtypes. Promotes the escape-hatch entry as the first active rule.
 *
 * Usage: node tools/learning-loop-mcp/scripts/migrate-first-rule.mjs
 */

import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();
const entries = readRegistry(root);

const TARGET_ID = "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal";

const subtypeMap = {
  "gate-logic-bug": "gate-bug",
  "mcp-tool-missing": "tool-missing",
  "record-repair-gap": "record-repair",
  "schema-drift": "schema-drift",
  "stale-ref": "stale-ref",
  "budget-check": "budget-check",
};

let migrated = 0;
let skipped = 0;

for (const entry of entries) {
  const subtype = subtypeMap[entry.category];
  if (!subtype) {
    console.log("Skip (unknown category):", entry.id, entry.category);
    skipped++;
    continue;
  }

  // Idempotency: skip if already migrated
  if (entry.category === "loop-anti-pattern" && entry.subtype === subtype) {
    console.log("Skip (already migrated):", entry.id);
    skipped++;
    continue;
  }

  const patch = {
    category: "loop-anti-pattern",
    subtype,
  };

  // For the target entry, also promote to active rule
  if (entry.id === TARGET_ID) {
    patch.status = "active";
    patch.promoted_to_rule = {
      rule_id: "rule-no-new-artifact-types",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "propose|design|create|new\\s+(schema|artifact|directory|convention)",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    };
    console.log("Promote:", entry.id, "→ rule-no-new-artifact-types");
  }

  await updateEntry(root, entry.id, patch);
  console.log("Migrated:", entry.id, "→ subtype:", subtype);
  migrated++;
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${entries.length} total.`);
