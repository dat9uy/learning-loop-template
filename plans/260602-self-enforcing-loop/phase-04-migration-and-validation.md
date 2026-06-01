---
phase: 4
title: "Migration and Validation"
status: completed
priority: P2
effort: 4h
dependencies: [1, 2, 3]
---

# Phase 4: Migration and Validation

## Overview

Migrate `meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal` to the new schema (`category: "loop-anti-pattern"`, `subtype: "new-artifact-type"`, `promoted_to_rule` set). Verify the rule is enforced end-to-end. Run full validation: gate escalation, `loop_describe` return, `meta_state_list` return, manual test.

## Requirements

**Functional:**
- Existing entry migrated atomically
- `category: "loop-anti-pattern"`, `subtype: "new-artifact-type"`
- `promoted_to_rule` set with `rule_id: "rule-no-new-artifact-types"`, regex pattern for new schema/convention proposals
- `status: "active"`
- Gate escalates on test command matching the pattern
- `loop_describe({tier: "hot"})` returns the rule
- `meta_state_list({status: "active", category: "loop-anti-pattern"})` returns the rule
- Both prior reports' frontmatter verified (status: rejected / superseded)

**Non-functional:**
- Migration is atomic (no partial state)
- Idempotent: running migration script twice produces same state
- Existing meta-state entries without `promoted_to_rule` unaffected

## Architecture

**Migration approach:**
- Use `updateEntry` from `core/meta-state.js` (already atomic via `enqueue`)
- Set new fields; preserve existing `evidence`, `auto_resolve`, etc.
- Verify with `readRegistry` after update

**Validation layers:**
1. **Unit:** gate escalates on test command
2. **Integration:** full flow (record → promote → gate enforcement)
3. **Tooling:** `loop_describe` returns the rule
4. **Manual:** write a test file containing "new schema" → gate escalates

## Related Code Files

**Modify (one-time):**
- `meta-state.jsonl` (atomic update via `updateEntry`)

**Create:**
- `tools/learning-loop-mcp/scripts/migrate-first-rule.mjs` (one-time migration)
- `tools/learning-loop-mcp/__tests__/integration-promoted-rule.test.js`

**Verify (already done):**
- `plans/reports/brainstorm-260601-meta-taxonomy-redesign.md` (status: rejected)
- `plans/reports/brainstorm-260602-agent-docs-plans-default-pattern.md` (status: superseded)

## TDD Structure

### Tests Before (regression — current state preserved)

1. Migration script is idempotent (running twice doesn't double-apply)
2. Other meta-state entries unchanged after migration
3. `index_validate` passes after migration
4. `pnpm test` passes after migration

### Refactor (migration + integration)

1. **Migration script** (`scripts/migrate-first-rule.mjs`):
   ```js
   import { readRegistry, updateEntry, generateId } from "#mcp/core/meta-state.js";
   import { resolveRoot } from "#lib/resolve-root.js";

   const root = resolveRoot();
   const TARGET_ID = "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal";

   const entries = readRegistry(root);
   const target = entries.find(e => e.id === TARGET_ID);
   if (!target) { console.error("Entry not found"); process.exit(1); }
   if (target.promoted_to_rule) { console.log("Already migrated; skipping"); process.exit(0); }

   const patch = {
     category: "loop-anti-pattern",
     subtype: "new-artifact-type",
     status: "active",
     promoted_to_rule: {
       rule_id: "rule-no-new-artifact-types",
       enforcement: "gate",
       pattern_type: "regex",
       pattern: "propose|design|create|new\\s+(schema|artifact|directory|convention)",
       promoted_at: new Date().toISOString(),
       promoted_by: "operator",
     },
   };
   await updateEntry(root, TARGET_ID, patch);
   console.log("Migrated:", TARGET_ID);
   ```

2. **Integration test** (`__tests__/integration-promoted-rule.test.js`):
   - Set up: temp `meta-state.jsonl` with the migrated entry
   - Test: gate escalates on command matching pattern
   - Test: gate returns `ok` for non-matching command
   - Test: `meta_state_list` returns the rule
   - Test: `loop_describe({tier: "hot"})` returns the rule
   - Cleanup: remove temp files

### Tests After (validation)

1. **Test: migration idempotency** — running the script twice produces same state
2. **Test: existing entries preserved** — other entries in `meta-state.jsonl` unchanged
3. **Test: gate enforcement** — command containing "new schema" → `escalate` with `rule_id: "rule-no-new-artifact-types"`
4. **Test: gate non-match** — command without pattern → `ok`
5. **Test: `meta_state_list`** — filter `status: "active", category: "loop-anti-pattern"` returns the rule
6. **Test: `loop_describe` hot tier** — returns the rule
7. **Test: end-to-end manual** — write file with "new schema" in content, attempt write, verify gate escalation
8. **Test: frontmatter of prior reports** — verify `status: rejected` and `status: superseded` present

### Regression Gate

```bash
cd tools/learning-loop-mcp && pnpm test
node tools/learning-loop-mcp/scripts/migrate-first-rule.mjs
pnpm validate:records
```

## Implementation Steps

1. Backup current `meta-state.jsonl` (git history preserves it)
2. Write integration test stubs (Tests After) — first run should fail (no migrated entry)
3. Create migration script
4. Run migration script (in dry-run mode first to verify)
5. Run migration script (real run)
6. Verify with `meta_state_list`
7. Run integration test — should pass
8. Run full test suite: `pnpm test`
9. Run `pnpm validate:records`
10. Manual test: attempt to write a `plans/reports/foo.md` with "new schema" in content → gate escalates
11. Verify `loop_describe({tier: "hot"})` returns the rule
12. Verify both prior reports' frontmatter
13. Commit changes

## Success Criteria

- [ ] Migration script runs successfully and idempotently
- [ ] Gate escalates on `propose|design|create|new\s+(schema|artifact|directory|convention)`
- [ ] `meta_state_list` returns the migrated rule
- [ ] `loop_describe({tier: "hot"})` returns the rule
- [ ] `pnpm test` passes
- [ ] `pnpm validate:records` passes
- [ ] Manual gate escalation test succeeds
- [ ] Both prior reports' frontmatter verified
- [ ] All 8 validation tests pass

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Migration corrupts `meta-state.jsonl` | Backup via git; `updateEntry` is atomic via `enqueue`; temp file + rename |
| Migrated rule blocks legitimate work | Pattern is specific; manual test verifies; operator can `resolve` if false positive |
| Idempotency failure | Script checks `if (target.promoted_to_rule) skip`; logs and exits cleanly |
| Test environment mismatch | Use temp dir for integration test; cleanup on teardown |
| Pattern false positives on existing plans/reports | The first scan is informational; gate escalates on writes, not reads |
| Operator impersonation in migration script (RT Finding 1) | Migration uses `meta_state_promote_rule` tool, not direct status write |
| Migration atomicity race (RT Finding 8) | Add `version` field for CAS; refuse write if version changed |
| Test pollutes real `meta-state.jsonl` (RT Finding 9) | Assert `GATE_ROOT === tempDir` in `beforeEach`; restore in `afterEach` |
| Existing entries invisible to new tool (RT Finding 12) | Migrate ALL 10 entries, not just one |
| Auto-resolve fires on migrated entry (RT Finding 13) | Reset `auto_resolve: null` for all migrated entries |
| No recovery flow for runaway rule (RT Finding 7) | Document `status: "disabled"` recovery in success criteria |
| Operator promotes without pattern review (RT Finding 15) | `meta_state_promote_rule` supports `preview: true`; use before promoting |

## Red Team Findings Applied

**RT Finding 1 (Operator Impersonation) — High:** The migration script does NOT set `status: "active"` directly. It uses the new `meta_state_promote_rule` tool (added in Phase 2), which requires operator role. The tool call is `meta_state_promote_rule({id, rule_id, enforcement, pattern_type, pattern})`; the tool then sets `status: "active"` after operator authorization.

**RT Finding 2 (meta-state.jsonl Not Protected) — High:** The migration script uses `updateEntry` (the MCP-core function), not direct file writes. The bash gate blocks direct writes to `meta-state.jsonl` (added in Phase 2 per RT Finding 2). All meta-state writes go through the registry's atomic-write path.

**RT Finding 7 (No Circuit Breaker) — High:** Document the recovery flow: if a rule is runaway, operator sets `status: "disabled"` (per RT Finding 7 in Phase 2). The migration script's success criteria include a test that demonstrates the recovery: `meta_state_update_entry({id, status: "disabled"})` followed by gate check that the rule is no longer enforced.

**RT Finding 8 (Migration Atomicity) — High:** Add a `version` field to all meta-state entries. `updateEntry` checks the current version and refuses to write if it changed (compare-and-swap). The migration script reads version, computes new version, and calls `updateEntry` with the expected version. If the version changed, the migration script logs and re-reads. This makes the migration idempotent under concurrent modification.

**RT Finding 9 (Test Environment Pollution) — Medium:** Test setup MUST set `GATE_ROOT` to a temp dir. Add a `beforeEach` assertion: `assert.strictEqual(resolveRoot(), tempDir)`. Add an `afterEach` to backup and restore the real `meta-state.jsonl` (defense in depth). All migration tests run with `GATE_ROOT=tempDir`.

**RT Finding 12 (Backward Compat) — High:** Migrate ALL 10 existing entries, not just the one. The migration script iterates all entries, determines if each is an anti-pattern (based on legacy category: `gate-logic-bug`, `mcp-tool-missing`, `record-repair-gap`, `schema-drift`, `stale-ref`, `budget-check`), and migrates with appropriate `subtype` (e.g., `gate-bug`, `tool-missing`, `record-repair`, etc.). Each migrated entry is promoted via `meta_state_promote_rule`.

**RT Finding 13 (Auto-Resolve Interacts) — Medium:** Migration resets `auto_resolve: null` for all migrated entries. The migrated entries are now actively managed (operator-promoted rules), not auto-resolved. The migration script includes `auto_resolve: null` in the update.

**RT Finding 15 (Operator Review Workflow) — Medium:** Before promoting each migrated entry, the script calls `meta_state_promote_rule({id, preview: true, sample_commands: ["propose new schema", "design new artifact"]})` and logs the matches. The operator reviews the matches before approving the actual promotion.

**Updated Implementation Steps:**

1. Backup current `meta-state.jsonl` (git history preserves it)
2. Write integration test stubs (Tests After) — first run should fail (no migrated entry)
3. Create migration script that:
   - Sets `GATE_ROOT` to a temp dir (test mode) (RT Finding 9)
   - Iterates all 10 existing entries (RT Finding 12)
   - For each, calls `meta_state_preview_rule({id, preview: true, sample_commands})` (RT Finding 15)
   - For each, calls `meta_state_promote_rule({id, ...})` (RT Finding 1)
   - Uses `version` field for CAS (RT Finding 8)
   - Sets `auto_resolve: null` on migrated entries (RT Finding 13)
4. Run integration test — should pass
5. Run full test suite: `pnpm test`
6. Run `pnpm validate:records`
7. Manual test: attempt to write a `plans/reports/foo.md` with "new schema" in content → gate escalates
8. Verify `loop_describe({tier: "hot"})` returns ALL promoted rules (not just one)
9. Verify `loop_describe({tier: "warm"})` legacy fallback returns empty (all entries migrated)
10. Document recovery flow: `meta_state_update_entry({id, status: "disabled"})` (RT Finding 7)
11. Verify both prior reports' frontmatter
12. Commit changes

**Updated Success Criteria:**

- [ ] Migration script runs successfully and idempotently (CAS via `version` field, RT Finding 8)
- [ ] All 10 existing entries migrated, not just one (RT Finding 12)
- [ ] **`status: "active"` set via `meta_state_promote_rule` tool, not direct write** (RT Finding 1)
- [ ] **`auto_resolve: null` on all migrated entries** (RT Finding 13)
- [ ] **Test setup asserts `GATE_ROOT === tempDir`** (RT Finding 9)
- [ ] **`meta-state.jsonl` direct writes blocked by bash gate** (RT Finding 2)
- [ ] **Operator review via `preview: true` logged before each promotion** (RT Finding 15)
- [ ] **Recovery flow documented: `status: "disabled"` short-circuits the rule** (RT Finding 7)
- [ ] Gate escalates on `propose|design|create|new\s+(schema|artifact|directory|convention)`
- [ ] `meta_state_list` returns the migrated rules
- [ ] `loop_describe({tier: "hot"})` returns ALL promoted rules
- [ ] `loop_describe({tier: "warm"})` legacy fallback returns empty (migration complete)
- [ ] `pnpm test` passes
- [ ] `pnpm validate:records` passes
- [ ] Manual gate escalation test succeeds
- [ ] Both prior reports' frontmatter verified
- [ ] All 8 validation tests pass
