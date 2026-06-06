#!/usr/bin/env node
/**
 * Migration: extract 4 promoted rules from findings into entry_kind="rule"
 * entries; re-emit 2 active design-note-in-disguise findings as entry_kind="loop-design"
 * entries; mutate source findings' promoted_to_rule (object -> string id) and
 * consolidated_into (placeholder -> real id).
 *
 * Idempotent: re-running produces the same registry state.
 *
 * Phase 2 of plan 260606-rule-loop-design-first-class.
 */

import {
  readRegistry,
  writeEntry,
  updateEntry,
  metaStateRuleEntrySchema,
  metaStateLoopDesignSchema,
} from "../core/meta-state.js";
import { resolveRoot } from "../../lib/resolve-root.js";

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : resolveRoot();

const PROMOTED_TO_RULE_SOURCES = [
  {
    findingId: "meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug",
    ruleId: "rule-short-slug-for-risk-records",
  },
  {
    findingId: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
    ruleId: "rule-no-new-artifact-types",
  },
  {
    findingId: "meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u",
    ruleId: "rule-project-skill-boundary",
  },
  {
    findingId: "meta-260606T1656Z-cold-session-test-must-pass-before-resolution",
    ruleId: "rule-cold-session-test-must-pass-before-resolution",
  },
];

const DESIGN_NOTE_SOURCES = [
  {
    findingId: "meta-260606T0421Z-instruction-layer-for-agents-tbd",
    loopDesignId: "loop-design-instruction-layer",
    title: "Instruction layer for agents — on-demand rule lookup",
    proposed_design_for: ["loop_get_instruction", "loop_describe"],
    addresses: [],
  },
  {
    findingId: "meta-260606T1543Z-meta-state-cross-reference-field-design",
    loopDesignId: "loop-design-cross-reference-fields",
    title: "Meta-state cross-reference fields — typed fields on rule and loop-design schemas",
    proposed_design_for: ["metaStateRuleEntrySchema", "metaStateLoopDesignSchema"],
    addresses: [],
  },
];

const PLACEHOLDER = "PENDING-PHASE-2-LOOP-DESIGN-ID";

function buildRuleEntry(finding, ruleId) {
  const ptr = finding.promoted_to_rule;
  return {
    id: ruleId,
    entry_kind: "rule",
    origin: finding.id,
    enforcement: ptr.enforcement,
    pattern_type: ptr.pattern_type,
    pattern: ptr.pattern,
    ...(ptr.scope_predicate && { scope_predicate: ptr.scope_predicate }),
    ...(ptr.applies_to_resolution && { applies_to_resolution: ptr.applies_to_resolution }),
    description: `Gate-enforced rule: ${ruleId}. Pattern type=${ptr.pattern_type}; pattern=${ptr.pattern}. Originated from ${finding.id} (description: ${finding.description.slice(0, 60)}...).`,
    status: "active",
    promoted_at: ptr.promoted_at,
    promoted_by: ptr.promoted_by,
    ...(ptr.refined_at && { refined_at: ptr.refined_at }),
    ...(ptr.refined_by && { refined_by: ptr.refined_by }),
    ...(ptr.refinement_reason && { refinement_reason: ptr.refinement_reason }),
  };
}

function buildLoopDesignEntry(finding, config) {
  return {
    id: config.loopDesignId,
    entry_kind: "loop-design",
    title: config.title,
    status: "active",
    proposed_design_for: config.proposed_design_for,
    addresses: config.addresses,
    description: finding.description,
    affected_system: finding.affected_system,
    created_at: finding.created_at,
    created_by: finding.created_by || "operator",
  };
}

async function main() {
  const entries = readRegistry(root);

  const newRules = [];
  for (const src of PROMOTED_TO_RULE_SOURCES) {
    const finding = entries.find((e) => e.id === src.findingId);
    if (!finding) {
      console.warn(`[skip] source finding ${src.findingId} not found`);
      continue;
    }
    if (!finding.promoted_to_rule || typeof finding.promoted_to_rule === "string") {
      console.log(`[skip] source finding ${src.findingId} already migrated (promoted_to_rule is a string)`);
      continue;
    }
    if (entries.find((e) => e.id === src.ruleId && e.entry_kind === "rule")) {
      console.log(`[skip] rule entry ${src.ruleId} already exists`);
      continue;
    }
    const ruleEntry = buildRuleEntry(finding, src.ruleId);
    const validation = metaStateRuleEntrySchema.safeParse(ruleEntry);
    if (!validation.success) {
      console.error(`[fail] rule entry ${src.ruleId} failed validation:`, validation.error.format());
      process.exit(1);
    }
    newRules.push({ src, ruleEntry });
  }

  const newDesigns = [];
  for (const src of DESIGN_NOTE_SOURCES) {
    const finding = entries.find((e) => e.id === src.findingId);
    if (!finding) {
      console.warn(`[skip] source finding ${src.findingId} not found`);
      continue;
    }
    if (finding.consolidated_into && finding.consolidated_into !== PLACEHOLDER) {
      console.log(`[skip] source finding ${src.findingId} already backfilled (consolidated_into=${finding.consolidated_into})`);
      continue;
    }
    if (entries.find((e) => e.id === src.loopDesignId && e.entry_kind === "loop-design")) {
      console.log(`[skip] loop-design entry ${src.loopDesignId} already exists`);
      continue;
    }
    const designEntry = buildLoopDesignEntry(finding, src);
    const validation = metaStateLoopDesignSchema.safeParse(designEntry);
    if (!validation.success) {
      console.error(`[fail] loop-design entry ${src.loopDesignId} failed validation:`, validation.error.format());
      process.exit(1);
    }
    newDesigns.push({ src, designEntry });
  }

  for (const { src, ruleEntry } of newRules) {
    await writeEntry(root, ruleEntry);
    console.log(`[rule-extract] ${src.findingId} -> ${src.ruleId}`);
  }

  for (const { src } of newRules) {
    await updateEntry(root, src.findingId, { promoted_to_rule: src.ruleId });
    console.log(`[mutate-finding] ${src.findingId}.promoted_to_rule = "${src.ruleId}"`);
  }

  for (const { src, designEntry } of newDesigns) {
    await writeEntry(root, designEntry);
    console.log(`[loop-design-emit] ${src.findingId} -> ${src.loopDesignId}`);
  }

  for (const { src } of newDesigns) {
    await updateEntry(root, src.findingId, { consolidated_into: src.loopDesignId });
    console.log(`[consolidated-into-backfill] ${src.findingId} -> ${src.loopDesignId}`);
  }

  console.log(`\nMigration complete: ${newRules.length} rules extracted, ${newDesigns.length} loop-designs emitted, ${newRules.length + newDesigns.length} source findings mutated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
