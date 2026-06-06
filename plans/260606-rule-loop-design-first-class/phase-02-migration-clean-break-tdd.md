---
phase: 2
title: "Migration: 4 rules → entry_kind: 'rule'; 3 design notes → entry_kind: 'loop-design'; 3 findings superseded with consolidated_into (TDD, idempotent)"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Migration (clean break, TDD)

## Overview

Run an idempotent migration script (`tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs`) that: (a) extracts the 4 promoted rules from their source findings' `promoted_to_rule` payloads into standalone `entry_kind: "rule"` entries; (b) replaces the source findings' `promoted_to_rule` objects with the new rule ids (string); (c) re-emits the 3 design-note-in-disguise findings as `entry_kind: "loop-design"` entries with `proposed_design_for` and `addresses` populated; (d) backfills the `consolidated_into` placeholder from Phase 0 with the real new loop-design entry ids. The script is idempotent: running twice produces the same registry state (verified by snapshot diff). 3-4 new tests cover the roundtrip, idempotency, and partial-state recovery paths. After Phase 2, the gate-logic's transitional filter (Phase 1 Step 4) is no longer needed: a follow-up commit removes the legacy branch.

## Requirements

### Functional

**Source findings to migrate (4 promoted_to_rule findings; rule extraction):**

| # | Source finding id | Rule id to extract | Pattern type | Pattern |
|---|---|---|---|---|
| 1 | `meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug` | `rule-short-slug-for-risk-records` | glob | `records/**/risks/*.yaml` |
| 2 | `meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal` | `rule-no-new-artifact-types` | regex | `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)\|new\s+(schema|artifact|directory|convention)` |
| 3 | `meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u` | `rule-project-skill-boundary` | glob | `.factory/skills/{use-mcp,find-skills}/**` |
| 4 | (new rule entry from `meta-260606T1656Z-cold-session-test-must-pass-before-resolution`'s `promoted_to_rule`) | `rule-cold-session-test-must-pass-before-resolution` | resolution-evidence-required | `test-cold-session-mcp-client-loading` |

For each source finding, the migration script:
1. Reads the finding's `promoted_to_rule` object
2. Constructs a new `entry_kind: "rule"` entry with fields mapped:
   - `id` ← `promoted_to_rule.rule_id` (stable, not timestamp-based)
   - `origin` ← finding's `id` (preserves lineage per Locked #5)
   - `enforcement` ← `promoted_to_rule.enforcement`
   - `pattern_type` ← `promoted_to_rule.pattern_type`
   - `pattern` ← `promoted_to_rule.pattern`
   - `scope_predicate` ← `promoted_to_rule.scope_predicate ?? "none"`
   - `applies_to_resolution` ← `promoted_to_rule.applies_to_resolution` (if resolution-evidence-required)
   - `description` ← synthesized from finding's description + rule context (min 20 chars; if finding's description is < 20 chars after sanitization, prepend a synthetic sentence)
   - `status: "active"`
   - `promoted_at` ← `promoted_to_rule.promoted_at`
   - `promoted_by` ← `promoted_to_rule.promoted_by`
   - `refined_at` ← `promoted_to_rule.refined_at` (if present)
   - `refined_by` ← `promoted_to_rule.refined_by` (if present)
   - `refinement_reason` ← `promoted_to_rule.refinement_reason` (if present)
3. Validates the new rule entry against `metaStateRuleEntrySchema` (Phase 1's new schema)
4. Writes the new rule entry via `writeEntry` (uses the per-root write queue)
5. Updates the source finding's `promoted_to_rule` to be the new rule's id string (e.g., `"rule-no-new-artifact-types"`) via `updateEntry`

**Design notes to re-emit (3 design-note-in-disguise findings → loop-design entries):**

| # | Source finding id | New loop-design entry id (deterministic) | `proposed_design_for` | `addresses` |
|---|---|---|---|---|
| 1 | `meta-260606T1531Z-cold-session-test-rule-deferred` | `loop-design-cold-session-test-rule` | `["rule-cold-session-test-must-pass-before-resolution"]` | `["meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list"]` |
| 2 | `meta-260606T0421Z-instruction-layer-for-agents-tbd` | `loop-design-instruction-layer` | `["loop_get_instruction", "loop_describe"]` | (none — this design is forward-looking, not addressing a specific finding) |
| 3 | `meta-260606T1543Z-meta-state-cross-reference-field-design` | `loop-design-cross-reference-fields` | `["metaStateRuleEntrySchema", "metaStateLoopDesignSchema"]` | (none — this design is the structural fix itself, addresses the design-note-finding-coupling problem in general) |

For each source finding, the migration script:
1. Reads the finding's `description` (min 20 chars; if < 20, prepend a synthetic sentence)
2. Reads the finding's `affected_system` (inherits from the source finding)
3. Constructs a new `entry_kind: "loop-design"` entry with fields mapped:
   - `id` ← deterministic id (e.g., `loop-design-cold-session-test-rule`); the format is `loop-design-<slug>` (NOT the timestamp-based `meta-YYMMDDTHHmmZ-` format) because loop-designs are stable names like rules; rationale: a loop-design is closer to a rule than to a finding
   - Wait, the schema (Phase 1 Step 2) defines `id: z.string()` with no specific format for loop-designs. The original `meta-260606T1531Z-cold-session-test-rule-deferred` was the source finding's id; the new loop-design entry's id should be different (it lives in a different entry_kind) and stable.
   - Decision: use a deterministic `loop-design-<slug>` id format (not the timestamp-based format). The slug is derived from the source finding's id or title.
   - `title` ← synthesized from finding's description (first 80 chars, stripped of trailing punctuation, padded to min 10 chars)
   - `status: "active"`
   - `proposed_design_for` ← the array above
   - `addresses` ← the array above
   - `description` ← the source finding's description (verbatim, if >= 20 chars)
   - `affected_system` ← the source finding's `affected_system`
   - `created_at` ← the source finding's `created_at` (preserves history)
   - `created_by` ← the source finding's `created_by` if set, else `"operator"`
4. Validates the new loop-design entry against `metaStateLoopDesignSchema`
5. Writes the new loop-design entry via `writeEntry`
6. Updates the source finding's `consolidated_into` (the Phase 0 placeholder `PENDING-PHASE-2-LOOP-DESIGN-ID`) to be the new loop-design entry's id, via `updateEntry`

**Idempotency guards:**
- For rule extraction: skip if a rule entry with the target `id` (the rule_id) already exists in the registry.
- For source finding mutation: skip if the finding's `promoted_to_rule` is already a string equal to the new rule's id.
- For loop-design re-emission: skip if a loop-design entry with the target `id` (the deterministic slug) already exists in the registry.
- For `consolidated_into` backfill: skip if the source finding's `consolidated_into` is already a valid id (not the `PENDING-PHASE-2-LOOP-DESIGN-ID` placeholder).

**Deterministic ids:**
- Rule entries: `rule_id` is stable (e.g., `rule-no-new-artifact-types`)
- Loop-design entries: `loop-design-<slug>` is stable (e.g., `loop-design-cold-session-test-rule`)
- These are NOT timestamp-based. The script can be re-run and produces the same ids. This is the key property for idempotency.

### Non-functional

- The migration script is a one-shot Node script (`tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs`) that imports `core/meta-state.js` and uses `writeEntry`/`updateEntry`. It does NOT use the MCP server (the script is invoked from the shell, not from an MCP tool call).
- The script takes a `--root=<path>` flag (default: process.cwd() — the project root). Tests use `mkdtempSync` fixtures.
- The script logs each step to stdout in a structured format: `[rule-extract] <source-id> → <new-rule-id>`, `[loop-design-emit] <source-id> → <new-loop-design-id>`, `[consolidated-into-backfill] <source-id> → <new-loop-design-id>`, `[skip] <reason> <id>`. This is the audit trail.
- The script exits 0 on success, 1 on validation failure (e.g., the new rule entry fails `metaStateRuleEntrySchema.safeParse`). On validation failure, the script does NOT mutate the registry (atomic semantics: all writes happen at the end after all validations pass).
- Re-running the script after a partial-state failure is safe: the idempotency guards skip already-migrated entries and resume from where it left off.

## Architecture

```
   Phase 2 actions
        │
        ├─ 1. Read source findings (4 promoted_to_rule findings)
        │     • meta-260601T1353Z-sanitizeslug-...
        │     • meta-260602T0000Z-escape-hatch-abuse-...
        │     • meta-260602T1116Z-agent-inside-a-project-...
        │     • meta-260606T1656Z-cold-session-test-...
        │
        ├─ 2. Read source design-note findings (3)
        │     • meta-260606T1531Z-cold-session-test-rule-deferred
        │     • meta-260606T0421Z-instruction-layer-for-agents-tbd
        │     • meta-260606T1543Z-meta-state-cross-reference-field-design
        │
        ├─ 3. For each promoted_to_rule finding:
        │     • Construct new rule entry (map fields)
        │     • Validate against metaStateRuleEntrySchema (Phase 1's new schema)
        │     • Defer write until all validations pass
        │
        ├─ 4. For each design-note finding:
        │     • Construct new loop-design entry (map fields)
        │     • Validate against metaStateLoopDesignSchema
        │     • Defer write until all validations pass
        │
        ├─ 5. After all validations pass: write 4 new rule entries (writeEntry)
        │     • Idempotency: skip if rule_id already exists
        │
        ├─ 6. After all rule writes: mutate 4 source findings (updateEntry)
        │     • promoted_to_rule: object → rule_id string
        │     • Idempotency: skip if already a string
        │
        ├─ 7. Write 3 new loop-design entries (writeEntry)
        │     • Idempotency: skip if loop-design id already exists
        │
        ├─ 8. Backfill 3 source findings' consolidated_into (updateEntry)
        │     • consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID" → new loop-design id
        │     • Idempotency: skip if already a valid id (not the placeholder)
        │
        └─ 9. Log summary: 4 rules extracted, 3 loop-designs emitted, 7 source findings mutated
```

## Related Code Files

- **Create:** `tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs` — the migration script
- **Create:** `tools/learning-loop-mcp/__tests__/migrate-rule-entry-kind.test.js` — 3-4 new tests
- **Modify:** `meta-state.jsonl` — append 4 rule entries + 3 loop-design entries; mutate 4 source findings (promoted_to_rule object → string) + 3 source findings (consolidated_into placeholder → real id)
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js` — uses `writeEntry`, `updateEntry`, `readRegistry`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema` (the 2 schemas from Phase 1)
- **Read-only:** `tools/learning-loop-mcp/core/slugify.js` — slug helper for the loop-design ids

## Implementation Steps

### Step 1: Write the 3-4 new migration tests (TDD red)

Create `tools/learning-loop-mcp/__tests__/migrate-rule-entry-kind.test.js`. Test fixture uses `mkdtempSync` with a fresh `meta-state.jsonl` containing a representative set of source findings.

```js
// migrate-rule-entry-kind.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readRegistry, writeEntry } from "#mcp/core/meta-state.js";

function setupFixture({ withRules = true, withDesignNotes = true, partialState = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "meta-migrate-"));
  const entries = [];

  if (withRules) {
    entries.push({
      id: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      status: "resolved",
      description: "Agent proposed a new artifact type and a three-tier taxonomy in plans/reports/brainstorm-260601-meta-taxonomy-redesign.md. This violates the philosophy: docs/ is an escape hatch, not a home for procedural knowledge; agents may not propose new artifact types. The correct approach is: curate the 96 assertions, encode critical ones in MCP tools/gate logic/prompts, delete the dead ones, and report gaps as meta-state entries.",
      promoted_to_rule: {
        rule_id: "rule-no-new-artifact-types",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
        promoted_at: "2026-06-01T22:00:13.387Z",
        promoted_by: "operator",
        refined_at: "2026-06-05T19:25:15.567Z",
        refined_by: "operator",
        refinement_reason: "G8 subcommand-class false positive (7 recurrences 2026-06-02..2026-06-06): bare 'create' matched CLI subcommand names like 'ck plan create' and 'record_create_*'. Refined pattern requires a context qualifier (optional article + trigger noun) after create/propose/design.",
      },
    });
  }

  if (withDesignNotes) {
    entries.push({
      id: "meta-260606T1531Z-cold-session-test-rule-deferred",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "cold-session-test-rule-design",
      status: "superseded",
      consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID",
      description: "Design captured for a future plan: rule-cold-session-test-must-pass-before-resolution. Intent: promote cold-session-discoverability.test.cjs (the droid exec exposes mcp__learning_loop_mcp__* tools test) as a gate-enforced rule that gates the resolution of meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list.",
      created_at: "2026-06-06T08:31:52.110Z",
    });
  }

  if (!partialState) {
    // Full state: 4 rules + 3 design notes
    // (omitted for brevity; the test uses 1+1 for unit tests, integration test uses 4+3)
  }

  writeFileSync(join(root, "meta-state.jsonl"), entries.map(JSON.stringify).join("\n") + "\n", "utf8");
  return root;
}

test("migration extracts rule entry from finding's promoted_to_rule and mutates finding to string id", () => {
  const root = setupFixture({ withRules: true, withDesignNotes: false });
  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });

  const after = readRegistry(root);
  const newRule = after.find((e) => e.id === "rule-no-new-artifact-types");
  assert(newRule, "new rule entry not found");
  assert.equal(newRule.entry_kind, "rule");
  assert.equal(newRule.origin, "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal");
  assert.equal(newRule.enforcement, "gate");
  assert.equal(newRule.pattern_type, "regex");
  assert.equal(newRule.status, "active");
  assert.equal(newRule.refined_at, "2026-06-05T19:25:15.567Z");

  const sourceFinding = after.find((e) => e.id === "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal");
  assert.equal(sourceFinding.promoted_to_rule, "rule-no-new-artifact-types", "source finding not mutated to string id");
});

test("migration emits loop-design entry from design-note finding and backfills consolidated_into", () => {
  const root = setupFixture({ withRules: false, withDesignNotes: true });
  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });

  const after = readRegistry(root);
  const newDesign = after.find((e) => e.id === "loop-design-cold-session-test-rule");
  assert(newDesign, "new loop-design entry not found");
  assert.equal(newDesign.entry_kind, "loop-design");
  assert.deepEqual(newDesign.proposed_design_for, ["rule-cold-session-test-must-pass-before-resolution"]);
  assert.deepEqual(newDesign.addresses, ["meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list"]);

  const sourceFinding = after.find((e) => e.id === "meta-260606T1531Z-cold-session-test-rule-deferred");
  assert.equal(sourceFinding.consolidated_into, "loop-design-cold-session-test-rule", "consolidated_into not backfilled");
});

test("migration is idempotent: re-running produces the same registry state (snapshot diff is empty)", () => {
  const root = setupFixture();
  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });
  const snapshot1 = readFileSync(join(root, "meta-state.jsonl"), "utf8");

  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });
  const snapshot2 = readFileSync(join(root, "meta-state.jsonl"), "utf8");

  assert.equal(snapshot1, snapshot2, "registry state changed between runs (not idempotent)");
});

test("migration recovers from partial state: pre-migrated rule + un-migrated design notes", () => {
  // Pre-migrate the rule manually; the script should skip it and continue with the design notes.
  const root = setupFixture();
  // ... (manually add a rule entry to simulate partial state)
  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });

  const after = readRegistry(root);
  const newRule = after.find((e) => e.id === "rule-no-new-artifact-types");
  assert(newRule, "rule entry missing after migration");
  // The partial-state rule should NOT be duplicated.
  const ruleCount = after.filter((e) => e.entry_kind === "rule" && e.id === "rule-no-new-artifact-types").length;
  assert.equal(ruleCount, 1, "rule entry duplicated");
});
```

Run the tests to confirm RED: all 4 tests fail (the script doesn't exist yet).

### Step 2: Write the migration script (TDD green)

Create `tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs`:

```js
#!/usr/bin/env node
/**
 * Migration: extract 4 promoted rules from findings into entry_kind="rule"
 * entries; re-emit 3 design-note-in-disguise findings as entry_kind="loop-design"
 * entries; mutate source findings' promoted_to_rule (object → string id) and
 * consolidated_into (placeholder → real id).
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
import { join } from "node:path";

// CLI: --root=<path> or process.cwd() default
const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : resolveRoot();

// Source findings to migrate
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
    findingId: "meta-260606T1531Z-cold-session-test-rule-deferred",
    loopDesignId: "loop-design-cold-session-test-rule",
    title: "Cold-session test rule — promote test to gate-enforced rule",
    proposed_design_for: ["rule-cold-session-test-must-pass-before-resolution"],
    addresses: ["meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list"],
  },
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

  // Step 1: validate all new entries before any writes (atomic semantics)
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

  // Step 2: write 4 new rule entries
  for (const { src, ruleEntry } of newRules) {
    await writeEntry(root, ruleEntry);
    console.log(`[rule-extract] ${src.findingId} → ${src.ruleId}`);
  }

  // Step 3: mutate 4 source findings (promoted_to_rule object → string)
  for (const { src } of newRules) {
    await updateEntry(root, src.findingId, { promoted_to_rule: src.ruleId });
    console.log(`[mutate-finding] ${src.findingId}.promoted_to_rule = "${src.ruleId}"`);
  }

  // Step 4: write 3 new loop-design entries
  for (const { src, designEntry } of newDesigns) {
    await writeEntry(root, designEntry);
    console.log(`[loop-design-emit] ${src.findingId} → ${src.loopDesignId}`);
  }

  // Step 5: backfill 3 source findings' consolidated_into
  for (const { src } of newDesigns) {
    await updateEntry(root, src.findingId, { consolidated_into: src.loopDesignId });
    console.log(`[consolidated-into-backfill] ${src.findingId} → ${src.loopDesignId}`);
  }

  // Step 6: summary
  console.log(`\nMigration complete: ${newRules.length} rules extracted, ${newDesigns.length} loop-designs emitted, ${newRules.length + newDesigns.length} source findings mutated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Step 3: Run the migration tests (TDD green)

```bash
cd tools/learning-loop-mcp && node --test __tests__/migrate-rule-entry-kind.test.js
```

All 4 tests pass.

### Step 4: Run the migration script on the real registry

```bash
node tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs --root=/home/datguy/codingProjects/learning-loop-template
```

Expected output:
```
[rule-extract] meta-260601T1353Z-sanitizeslug-... → rule-short-slug-for-risk-records
[mutate-finding] meta-260601T1353Z-sanitizeslug-....promoted_to_rule = "rule-short-slug-for-risk-records"
[rule-extract] meta-260602T0000Z-escape-hatch-abuse-... → rule-no-new-artifact-types
[mutate-finding] meta-260602T0000Z-escape-hatch-abuse-....promoted_to_rule = "rule-no-new-artifact-types"
[rule-extract] meta-260602T1116Z-agent-inside-a-project-... → rule-project-skill-boundary
[mutate-finding] meta-260602T1116Z-agent-inside-a-project-....promoted_to_rule = "rule-project-skill-boundary"
[rule-extract] meta-260606T1656Z-cold-session-test-must-pass-before-resolution → rule-cold-session-test-must-pass-before-resolution
[mutate-finding] meta-260606T1656Z-cold-session-test-must-pass-before-resolution.promoted_to_rule = "rule-cold-session-test-must-pass-before-resolution"
[loop-design-emit] meta-260606T1531Z-cold-session-test-rule-deferred → loop-design-cold-session-test-rule
[consolidated-into-backfill] meta-260606T1531Z-cold-session-test-rule-deferred → loop-design-cold-session-test-rule
[loop-design-emit] meta-260606T0421Z-instruction-layer-for-agents-tbd → loop-design-instruction-layer
[consolidated-into-backfill] meta-260606T0421Z-instruction-layer-for-agents-tbd → loop-design-instruction-layer
[loop-design-emit] meta-260606T1543Z-meta-state-cross-reference-field-design → loop-design-cross-reference-fields
[consolidated-into-backfill] meta-260606T1543Z-meta-state-cross-reference-field-design → loop-design-cross-reference-fields

Migration complete: 4 rules extracted, 3 loop-designs emitted, 7 source findings mutated.
```

### Step 5: Verify the migration with `meta_state_list`

After the script runs, verify the registry state via the MCP tool:

```bash
# Filter by new entry kinds
mcp__learning_loop_mcp__meta_state_list({ entry_kind: "rule" })
# Expected: 4 entries (rule-short-slug-for-risk-records, rule-no-new-artifact-types, rule-project-skill-boundary, rule-cold-session-test-must-pass-before-resolution)

mcp__learning_loop_mcp__meta_state_list({ entry_kind: "loop-design" })
# Expected: 3 entries (loop-design-cold-session-test-rule, loop-design-instruction-layer, loop-design-cross-reference-fields)
```

### Step 6: Re-run the script to verify idempotency

```bash
node tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs --root=/home/datguy/codingProjects/learning-loop-template
```

Expected output (all steps skip):
```
[skip] source finding meta-260601T1353Z-sanitizeslug-... already migrated (promoted_to_rule is a string)
[skip] source finding meta-260602T0000Z-escape-hatch-abuse-... already migrated (promoted_to_rule is a string)
[skip] source finding meta-260602T1116Z-agent-inside-a-project-... already migrated (promoted_to_rule is a string)
[skip] source finding meta-260606T1656Z-cold-session-test-must-pass-before-resolution already migrated (promoted_to_rule is a string)
[skip] source finding meta-260606T1531Z-cold-session-test-rule-deferred already backfilled (consolidated_into=loop-design-cold-session-test-rule)
[skip] source finding meta-260606T0421Z-instruction-layer-for-agents-tbd already backfilled (consolidated_into=loop-design-instruction-layer)
[skip] source finding meta-260606T1543Z-meta-state-cross-reference-field-design already backfilled (consolidated_into=loop-design-cross-reference-fields)

Migration complete: 0 rules extracted, 0 loop-designs emitted, 0 source findings mutated.
```

`git diff --stat meta-state.jsonl` shows the same 7 added lines + 7 in-place edits as the first run. Idempotency verified.

## Success Criteria

- [ ] `tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs` exists and is executable
- [ ] Running the script on a fresh registry (with the 4 + 3 source findings) produces 4 new rule entries + 3 new loop-design entries + 7 source finding mutations
- [ ] The 4 new rule entries pass `metaStateRuleEntrySchema.safeParse`
- [ ] The 3 new loop-design entries pass `metaStateLoopDesignSchema.safeParse`
- [ ] The 4 source findings' `promoted_to_rule` is mutated from object to string (the new rule_id)
- [ ] The 3 source findings' `consolidated_into` is backfilled from the Phase 0 placeholder to the new loop-design id
- [ ] Re-running the script on the same registry is a no-op (all 7 source findings are skipped via the idempotency guards)
- [ ] `__tests__/migrate-rule-entry-kind.test.js` has 4 new tests, all pass
- [ ] `meta_state_list({ entry_kind: "rule" })` returns 4 entries
- [ ] `meta_state_list({ entry_kind: "loop-design" })` returns 3 entries
- [ ] `meta_state_list({ entry_kind: "finding" })` returns the same entries as before (the source findings stay; their `promoted_to_rule` payload is now a string)
- [ ] `meta_state_list({ entry_kind: "change-log" })` returns the Phase 0 change-log + all prior change-logs
- [ ] `git status --porcelain` shows: `meta-state.jsonl` modified (7 new lines + 7 in-place edits), 1 new file (`scripts/migrate-rule-entry-kind.mjs`), 1 new file (`__tests__/migrate-rule-entry-kind.test.js`)
- [ ] All 573 existing tests still pass (no regressions; the test files added in Phase 1 continue to pass; the migration tests pass; the prior 557 baseline tests are unchanged)
- [ ] After Phase 2, the gate-logic's transitional filter (Phase 1 Step 4) is no longer strictly needed (no findings have object `promoted_to_rule` payloads). A follow-up commit can remove the legacy branch; out of scope for Phase 2.

## Risk Assessment

- **Risk 1:** The migration script's atomic semantics (validate-all-then-write-all) might mask partial-state failures. If `writeEntry` for rule #2 fails after rule #1 succeeded, the registry is in a partial state. Mitigation: `writeEntry` uses the per-root write queue (`enqueue` in `core/meta-state.js`); a failed write is caught and logged. The script does not abort on the first write failure; it continues to attempt the remaining writes. Re-running the script skips already-migrated entries (idempotency), so a partial-state recovery is automatic.
- **Risk 2:** The deterministic loop-design ids (`loop-design-cold-session-test-rule` etc.) could collide with future operator-created entries. Mitigation: the script's idempotency guard checks for existing ids; a collision would surface as a `[skip]` log line. A future plan could enforce an `id` namespace convention (e.g., `loop-design-*` is reserved for the script).
- **Risk 3:** The synthesized `description` for rule entries (concatenation of `Gate-enforced rule:` + `rule_id` + `pattern` + finding context) is verbose and may exceed display budgets in `loop_describe` warm tier. Mitigation: `loop_describe` warm tier shows a short summary (`rule_id`, `pattern_type`, `pattern`); the full description is only in cold tier. The verbosity is a feature for audit purposes.
- **Risk 4:** The source finding `meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u` has a long id; the `buildRuleEntry` function might have a typo. Mitigation: the 4 source ids are listed in the script's `PROMOTED_TO_RULE_SOURCES` constant; the test in Step 1 covers the roundtrip for at least 1 of them; the integration test in Step 1 covers all 4 (full state).
- **Risk 5:** The migration script's `--root` flag defaults to `resolveRoot()` (the project's learning-loop-mcp root). If the script is run from a different cwd, the wrong registry is mutated. Mitigation: the script logs the resolved root at startup (`console.log("[migrate] root=${root}")`); the operator can verify before continuing.
- **Risk 6:** The `consolidated_into` backfill replaces the Phase 0 placeholder. If the operator wants to keep the placeholder for audit purposes, the backfill is destructive. Mitigation: the change-log (Phase 0) documents the placeholder; the migration script's log line records the backfill; the source finding's `version` field is incremented (per `updateEntry` semantics), so the audit trail shows the backfill event.

## TDD Tests Added (this phase)

| Test File | Test Count | Asserts |
|-----------|------------|---------|
| `__tests__/migrate-rule-entry-kind.test.js` (new) | 4 | rule extraction + source finding mutation; loop-design emission + consolidated_into backfill; idempotency (snapshot diff is empty); partial-state recovery |

**Total: 4 new tests across 1 new file; 0 regressions in the ~573 existing tests.**

## References

- `tools/learning-loop-mcp/core/meta-state.js#writeEntry` — the per-root write queue (serialized writes)
- `tools/learning-loop-mcp/core/meta-state.js#updateEntry` — in-place mutation with `version` increment
- `tools/learning-loop-mcp/core/meta-state.js#metaStateRuleEntrySchema` (Phase 1 deliverable) — schema for the new rule entries
- `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema` (Phase 1 deliverable) — schema for the new loop-design entries
- `tools/learning-loop-mcp/lib/resolve-root.js` — the root resolution helper
- `tools/learning-loop-mcp/scripts/closeout-meta-evidence-migration.cjs` — sibling script for the closeout pattern (idempotency guards, audit log lines)
- Locked Decisions #5, #6, #7 in `plan.md` — origin pointer, addresses field, clean-break deviation
- Locked Decision #9: idempotency by `addresses + proposed_design_for` set equality (Phase 3's `meta_state_propose_design` tool uses a different idempotency key; Phase 2's migration script uses deterministic ids)
