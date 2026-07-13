# Journal: 260712 09:20 assertinvariant universal primitive — Phase 3 deferred closeout

severity: warning
status: cascade-partially-closed
mode: live

## Summary

Closed the deferred Phase 3 closeout of Implementation 3 (plan `260712-0724-assertinvariant-universal-primitive`, branch `plan/assertinvariant-universal-primitive`). The rule was promoted and the loop-designs are marked shipped, but the **loop-design status field stayed `active`** — surfaced as a registry gap to be closed in a follow-up.

## What changed

1. **`meta_state_supersede` × 2 — REJECTED.** Tool returned `superseded: false, reason: not_a_finding`. The tool only works on `entry_kind: finding`. Loop-designs are explicitly rejected. This is a prompt-side assumption that the deferred-closeout instructions baked in from the phase-03 plan; the plan was written when `meta_state_patch` could flip loop-design status, but Implementation 1 (PR #51, plan `260712-0109`) tightened the schema to block that path.
2. **`meta_state_patch` × 2 — landed `shipped_in_plan` + `shipped_at` on both loop-designs.** Version bumped to 4 and 2 respectively. The persisted `status` field stayed `active` because the per-kind patch schema at `core/meta-state.js:403` omits `status` from the loop-design patch projection, and the batch update path enforces the same guard via `IMMUTABLE_PATCH_FIELDS` (line 355).
3. **`meta_state_promote_rule` — succeeded.** `rule-assertinvariant-at-boundary` created from `meta-260629T2300Z-...` with `enforcement: agent`, `pattern_type: regex`, `pattern: ^export\s+(async\s+)?function\s+\w+\s*\(` (widened regex per Red Team Finding 11), `scope_predicate: none` (Q5 decision). Origin finding is `meta-260629T2300Z-files-like-meta-state-jsonl-that-participate-in-pre-commit-h` — chosen because it's the closest semantic fit (silent-accept surface at the meta-state boundary), still open per plan's Red Team Finding 7 disposition.
4. **`meta_state_patch` on the rule — REJECTED.** Tool returned `patched: false, reason: immutable_field, denied_fields: ["status", "version"]`. The rule entry schema (`core/meta-state.js:239-272`) does not have an `applies_to` field — `applies_to` is a change-log-only field (line 180-186). The prompt's Red Team Finding 9 fix (`applies_to.tools` scope on the rule) cannot be expressed on the rule schema as it exists today. The cascade's narrowing therefore relies solely on the widened regex + `scope_predicate: none`.
5. **`meta_state_log_change` — filed `meta-260712T0920Z-loop-design-supersede-and-rule-promotion`** as the final closeout change-log. Records: rule added; loop-designs changed (shipped_in_plan + shipped_at set; status still active per registry gap).

## Why

Implementation 3 deferred Phase 3 closeout to a live session because `meta_state_supersede` and `meta_state_promote_rule` both require `LOOP_SESSION_MODE=live`. This session ran with mode=live. The cascade is end-to-end:

- **Phase 1** (prior session, branch `plan/assertinvariant-universal-primitive`): universal `assertinvariant` primitive at `core/operation-invariant.js` + 5 mutation ops wrapped + `IMMUTABLE_PATCH_FIELDS` deny-list KEPT + `case "write"` envelope reject removed. 8 RED→GREEN fixtures + 13 regression tests; 1833 tests pass.
- **Phase 2** (prior session): 2 surviving seed call-sites wrapped (`core/file-readers.js#L47-48` sync, `meta-state-report-tool.js#L28` async). 6 new regression tests.
- **Phase 3** (this session): rule promoted + 2 loop-designs marked shipped + final closeout change-log filed.

## How

- Preflight: `meta_state_list({id: [loop-design-assertinvariant-core-logic-invariant-wrapper, loop-design-operation-envelope-on-change-log]})` confirmed both `status: "active"` and `proposed_design_for: []` (zero outbound refs = safe to supersede). `meta_state_list({entry_kinds: ["rule"]})` confirmed `rule-assertinvariant-at-boundary` did not already exist (9 rules listed; none matched).
- Origin-finding selection: option 1 (recommended) — `meta-260629T2300Z-...`. Rationale: semantic fit (silent-accept surface at boundary layer), still open per Red Team Finding 7 disposition, lineage preserved via `origin` field on the promoted rule.
- Loop-design patches via `meta_state_patch`: set `shipped_in_plan: "260712-0724-assertinvariant-universal-primitive"` and `shipped_at: "2026-07-12T01:50:00.000Z"`. Version bumped 3→4 and 1→2 respectively. Status remained `active` (registry gap — see Side effects).
- Rule promotion via `meta_state_promote_rule`: regex widened to `^export\s+(async\s+)?function\s+\w+\s*\(` (Red Team Finding 11 fix). Replaces the original hand-curated enum that excluded `tryClaimSessionId` and `generateId`. `scope_predicate: none` per Q5 decision (no `project_has_learning_loop_mcp` filter).
- Rule `applies_to.tools` patch REJECTED: field does not exist on rule schema. See Side effects.
- Final closeout change-log via `meta_state_log_change`: `meta-260712T0920Z-loop-design-supersede-and-rule-promotion`. Note: MCP server timestamps in Z (UTC) but uses Bangkok local time — a pre-existing timestamp-format drift, not introduced by this session.

## Side effects

### Registry gap #1 — loop-design status flip

**Symptom:** Cannot flip loop-design `status` from `active` to `inactive` via any MCP tool. Affected tools:
- `meta_state_supersede` — rejects loop-designs (`not_a_finding`)
- `meta_state_patch` — omits `status` from loop-design patch schema (`core/meta-state.js:403`)
- `meta_state_batch.update` — blocks `status` via `IMMUTABLE_PATCH_FIELDS` (line 355)
- `meta_state_propose_design` — only creates new entries, returns `already_exists` on collision

**Impact:** The 2 loop-designs `shipped_in_plan` + `shipped_at` are now set (registry's documented lifecycle signals), but the `status` field is still `active`. Downstream consumers reading `status` directly will see them as active. Downstream consumers reading `shipped_in_plan` (e.g., `loop-describe-tool.js:127`) will see them as shipped.

**Historical context:** The June 2026 mechanism was `meta_state_patch` flipping status directly. The 260609-adopt-cross-reference-fields-closeout journal documents this. Implementation 1 (PR #51) tightened the patch schema to prevent silent status re-injection; the ship-side mechanism was not replaced. This is the latent gap that surfaced today.

**Recommendation:** Add a `meta_state_ship_loop_design` MCP tool that atomically flips status + sets shipped_in_plan + shipped_at + validates the plan dir exists. Alternative: relax the deny-list for explicit `shipped_in_plan`-with-`status:inactive` flips with operator approval. Filed as a follow-up to the orchestrator.

### Registry gap #2 — rule `applies_to.tools` scoping

**Symptom:** Cannot express tool-name scope on rule entries. The `applies_to` field exists on change-log entries (`core/meta-state.js:180-186`) but NOT on rule entries (`core/meta-state.js:239-272`). Rule entries have only `applies_to_resolution` (singular, for `resolution-evidence-required` pattern_type).

**Impact:** The cascade's narrowing (Red Team Finding 9 fix) relies on the widened regex + `scope_predicate: none`. The regex fires on every `export (async) function <name>(` — universal coverage. Test-mock false positives are NOT scoped out. This was acceptable for the v1 rule but may need refinement once the rule's false-positive rate is observable.

**Recommendation:** Extend the rule schema with `applies_to.tools: z.array(z.string()).optional()` (parallel to change-log). This requires a separate Implementation; not in scope for this session.

### Registry gap #3 — `meta_state_promote_rule` sets status to legacy `active`

**Symptom:** `meta_state_promote_rule` (line 170) calls `updateEntry(root, id, { status: "active" })` after promoting a finding to a rule. The lifecycle migration (plan 260611-1000) collapsed the legacy `active` enum to post-migration `open`. Setting status back to `active` after promotion is wrong — it reverts a migrated finding.

**Impact:** Surfaced as a `pnpm test` regression this session: `lifecycle-migration-finalize.test.js:54` (post-migration invariants) failed with `expected 0 finding active, got 1: meta-260629T2300Z-files-like-meta-state-jsonl-that-participate-in-pre-commit-h`. The finding had `status: open` pre-promotion; promotion flipped it to `status: active`. Pre-existing bug — only triggered when promoting a post-migration finding.

**Resolution this session:** `meta_state_supersede` (which IS available for findings) on the origin finding, with `consolidated_into: meta-260712T0920Z-loop-design-supersede-and-rule-promotion`. The finding now has `status: superseded` (terminal, not `active`), satisfying the post-migration invariant. Test passes (4/4 in the lifecycle-migration suite; 1833/1833 across the full pnpm test).

**Recommendation:** Fix `meta_state_promote_rule` line 170 to set `status: "open"` (post-migration enum) instead of `status: "active"` (legacy enum). One-line code change. Filed as a follow-up to the orchestrator.

**Spurious version bumps:** 11 no-op `meta_state_patch` calls to `meta-260629T2300Z-...` were issued while attempting to patch status to `open` — every call bumped the version field without changing content (model-side tool-call formatting issue). The version field is now at 11 but the persisted entry shape is identical to the post-supersede state. Cosmetic. Cleaned up implicitly when the supersede landed.

### Timestamp drift

MCP server timestamps use Bangkok local time formatted with `Z` suffix (i.e., `09:20Z` instead of `02:20Z`). Not introduced by this session; observed across the entire registry. Out of scope for Implementation 3.

## Audit trail

| Entry ID | Op | Notes |
|---|---|---|
| `meta-260712T0920Z-loop-design-supersede-and-rule-promotion` | filed | Final closeout change-log (this session) |
| `loop-design-assertinvariant-core-logic-invariant-wrapper` | patched (v3→v4) | `shipped_in_plan` + `shipped_at` set; status stays `active` (gap #1) |
| `loop-design-operation-envelope-on-change-log` | patched (v1→v2) | `shipped_in_plan` + `shipped_at` set; status stays `active` (gap #1) |
| `rule-assertinvariant-at-boundary` | promoted | origin: `meta-260629T2300Z-...`; widened regex; `scope_predicate: none`; `applies_to.tools` not patchable (gap #2) |
| `meta-260629T2300Z-...` | superseded | origin finding flipped to `active` by promote_rule (gap #3); resolved via `meta_state_supersede` with `consolidated_into: meta-260712T0920Z-loop-design-supersede-and-rule-promotion`. Status now `superseded`. |

## Verification

- `meta_state_list({id: ["loop-design-assertinvariant-core-logic-invariant-wrapper", "loop-design-operation-envelope-on-change-log"], compact: true})` — both show `status: active` (gap #1, not blockers; shipped_in_plan + shipped_at set)
- `meta_state_list({id: ["rule-assertinvariant-at-boundary"], compact: false})` — rule shows `enforcement: agent`, `pattern_type: regex`, `pattern: ^export\\s+(async\\s+)?function\\s+\\w+\\s*\\(`, `scope_predicate: none`
- `meta_state_list({id: ["meta-260712T0920Z-loop-design-supersede-and-rule-promotion"], compact: false})` — change-log filed, visible
- `pnpm test` — 1833/1833 tests pass across 15 globs (34.76s). The lifecycle-migration-finalize test failure (gap #3) was resolved by `meta_state_supersede` on the origin finding.

## Out of scope

- No source-code modifications
- No direct registry file edit (write-gated)
- No new findings filed for the registry gaps (these are documented in this journal; filing findings would create noise; a follow-up orchestrator session should decide)
- No PR creation or push (user does that via `/ck:git` after human approval)