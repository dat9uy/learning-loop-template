#!/usr/bin/env node
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import {
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateRuleEntrySchema,
  metaStateLoopDesignSchema,
} from "#mcp/core/meta-state.js";

/**
 * Migrate entries in meta-state.jsonl from nested evidence block to top-level fields.
 *
 * Phase 3 of plan 260607-dual-field-schema-unification.
 * Idempotent: a second run produces no changes.
 * CAS-safe: uses _expected_version per entry.
 * Aborts on first validation failure (no partial migration).
 */

function parseRootArg() {
  const arg = process.argv.find((a) => a.startsWith("--root="));
  if (arg) {
    return arg.replace("--root=", "");
  }
  return process.cwd();
}

const root = resolveRoot(parseRootArg());
const entries = readRegistry(root);

let processed = 0;
let skipped = 0;
let casSkipped = 0;

const SCHEMA_BY_KIND = {
  finding: metaStateFindingEntrySchema,
  "change-log": metaStateChangeEntrySchema,
  rule: metaStateRuleEntrySchema,
  "loop-design": metaStateLoopDesignSchema,
};

function needsFlatten(entry) {
  const hasNestedCodeRef = entry.evidence?.code_ref !== undefined;
  const hasNestedJournal = entry.evidence?.journal !== undefined;
  const hasNestedTest = entry.evidence?.test !== undefined;

  const hasTopLevelCodeRef = entry.evidence_code_ref !== undefined;
  const hasTopLevelJournal = entry.evidence_journal !== undefined;
  const hasTopLevelTest = entry.evidence_test !== undefined;

  const hasAnyNested = hasNestedCodeRef || hasNestedJournal || hasNestedTest;
  const hasAnyTopLevel = hasTopLevelCodeRef || hasTopLevelJournal || hasTopLevelTest;

  // Empty evidence block (e.g. evidence: {}) should also be cleaned up
  const hasEmptyEvidence = entry.evidence !== undefined && !hasAnyNested;

  if (!hasAnyNested && !hasEmptyEvidence) return false;

  // If top-level is already set AND nested is absent or empty, skip
  if (hasAnyTopLevel && !hasAnyNested && !hasEmptyEvidence) return false;

  // Dual-form: top-level set AND nested still present — must process
  return true;
}

function buildPatch(entry) {
  const patch = {};
  const evidence = entry.evidence || {};
  let changed = false;

  if (evidence.code_ref !== undefined && entry.evidence_code_ref === undefined) {
    patch.evidence_code_ref = evidence.code_ref;
    changed = true;
    console.log(`[flatten] ${entry.id}: evidence.code_ref → evidence_code_ref`);
  }

  if (evidence.journal !== undefined && entry.evidence_journal === undefined) {
    patch.evidence_journal = evidence.journal;
    changed = true;
    console.log(`[flatten] ${entry.id}: evidence.journal → evidence_journal`);
  }

  if (evidence.test !== undefined && entry.evidence_test === undefined) {
    patch.evidence_test = evidence.test;
    changed = true;
    console.log(`[flatten] ${entry.id}: evidence.test → evidence_test`);
  }

  // Check if evidence still has any remaining fields after copying.
  // For dual-form entries (top-level already set), the remaining nested
  // fields are already represented top-level, so we can safely remove the block.
  const remainingFields = Object.keys(evidence).filter(
    (k) => !(k === "code_ref" && entry.evidence_code_ref === undefined) &&
           !(k === "journal" && entry.evidence_journal === undefined) &&
           !(k === "test" && entry.evidence_test === undefined)
  );

  const allRemainingHaveTopLevel = remainingFields.every(
    (k) =>
      (k === "code_ref" && entry.evidence_code_ref !== undefined) ||
      (k === "journal" && entry.evidence_journal !== undefined) ||
      (k === "test" && entry.evidence_test !== undefined)
  );

  if (remainingFields.length === 0 || allRemainingHaveTopLevel) {
    patch.evidence = undefined;
    changed = true;
    console.log(`[flatten] ${entry.id}: evidence → removed (empty)`);
  } else {
    console.warn(`[flatten] ${entry.id}: evidence still has fields: ${remainingFields.join(", ")}`);
  }

  return changed ? patch : null;
}

function validateEntry(entry, patch) {
  const kind = entry.entry_kind || "finding";
  const schema = SCHEMA_BY_KIND[kind];
  if (!schema) {
    console.error(`[flatten] ${entry.id}: unknown entry_kind "${kind}"`);
    process.exit(1);
  }

  const patched = { ...entry, ...patch };
  delete patched._expected_version;

  const result = schema.safeParse(patched);
  if (!result.success) {
    console.error(`[flatten] ${entry.id}: validation failed`);
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
}

// First pass: validate all pending changes before writing any
const pending = [];

for (const entry of entries) {
  if (!needsFlatten(entry)) {
    skipped++;
    continue;
  }

  const patch = buildPatch(entry);
  if (!patch) {
    skipped++;
    continue;
  }

  validateEntry(entry, patch);
  pending.push({ entry, patch });
}

// Second pass: write all validated entries
for (const { entry, patch } of pending) {
  const expectedVersion = entry.version ?? 0;
  const r = await updateEntry(root, entry.id, {
    ...patch,
    _expected_version: expectedVersion,
  });

  if (r === "version_mismatch") {
    console.warn(
      `[flatten] ${entry.id}: CAS version mismatch (expected ${expectedVersion}); skipping`
    );
    casSkipped++;
    continue;
  }

  if (r !== true) {
    console.warn(`[flatten] ${entry.id}: update failed (r=${r}); skipping`);
    casSkipped++;
    continue;
  }

  processed++;
}

console.log(`\nFlattened: ${processed}`);
console.log(`Skipped: ${skipped}`);
if (casSkipped > 0) {
  console.log(`CAS skipped: ${casSkipped}`);
}
console.log("Done.");
