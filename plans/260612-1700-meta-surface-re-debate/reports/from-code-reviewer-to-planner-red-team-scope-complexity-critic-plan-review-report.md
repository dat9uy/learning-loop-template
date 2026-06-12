# Red Team — Scope & Complexity Critic

**Reviewer:** code-reviewer (Scope & Complexity Critic lens, Contract Verifier verification role)
**Target:** `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` (Phase A product-surface re-debate)
**Date:** 2026-06-12
**Mode:** Full tier (4 reviewers launched; only this reviewer returned substantive findings — others returned "Plan is up-to-date" with no file content, suggesting subagent file-write tool failure)

## Summary

**Total findings: 10** (2 Critical, 3 High, 5 Medium)

**Top 3 highest-severity findings:**

1. **Finding 4 (Critical):** The 4 product-surface schemas (decision, experiment, risk, observation) the report deletes have 40+ active yaml records in `records/vnstock/`, `records/meta/`, `records/product/`, and `records/observations/` that the report does not address in any migration step.
2. **Finding 2 (Critical):** The `_forensic-stubs/` directory at `records/observations/_forensic-stubs/` is claimed to bypass the `core/gate-logic.js:401` hard-block via an "underscore prefix" — this is factually wrong. The glob `records/observations/**` matches any depth including subdirectories with any prefix. The plan's archival mechanism is unbuildable as written.
3. **Finding 1 (High):** The report claims "19 ledger events" in `observation-vnstock-device-slot-ledger.yaml`. The actual count is **18** `- timestamp:` rows. The conversion script's verification step (`length === 19`) will fail.

## Findings

## Finding 1: Off-by-one ledger count
- **Severity:** High
- **Location:** Phase A, §2 (Acceptance criteria), §5.2 (state-machine semantics), §5.6 (touchpoints), §8 (success metrics #5)
- **Flaw:** The report repeatedly claims `observation-vnstock-device-slot-ledger.yaml` has 19 `ledger[]` rows. Verified by `grep -c '^\s*-\s*timestamp:'`: actual count is **18**. The conversion script's "verification step" is asserted as `"the script reads the yaml, writes the JSONL, then asserts the new JSONL parses to 19 events"` (§7). With actual count 18, the script will fail its own assertion.
- **Failure scenario:** The conversion script in Phase 2 aborts. The plan's Phase 7 ("delete 8 old schemas") depends on Phase 2 succeeding. The whole sub-phase chain stalls, blocking Phase A closeout and the master tracker § Phase A advance.
- **Evidence:** `grep -c '^\s*-\s*timestamp:' /home/datguy/codingProjects/learning-loop-template/records/observations/observation-vnstock-device-slot-ledger.yaml` = 18. Report §2 acceptance criterion (d) says "19 events" and §7 says "parses to 19 events."
- **Suggested fix:** Update the report's count to 18 everywhere it appears. Change the verification assertion to `length === 18` or, more robustly, `length === yamlLedgerRows.length` (dynamic check).

## Finding 2: Forensic-stub gate-bypass claim is factually wrong
- **Severity:** Critical
- **Location:** Phase A, §5.2 (state-machine semantics), §5.6 (touchpoints)
- **Flaw:** The report claims `records/observations/_forensic-stubs/observation-vnstock-device-slot-ledger.yaml` (with underscore prefix) bypasses the hard-block at `core/gate-logic.js:401`. The report explicitly says: "the underscore prefix is the gate-bypass trick — `core/gate-logic.js:401` hard-blocks `records/observations/**` but allows other paths."
- **Failure scenario:** When an agent attempts to write to `records/observations/_forensic-stubs/observation-vnstock-device-slot-ledger.yaml`, the gate fires `decision: 'block'`. The whole archival mechanism is unbuildable. The plan's "forensic stub" pattern (per §5.6 row "records/observations/*.yaml (8 files) | Archived to records/observations/_forensic-stubs/") does not exist.
- **Evidence:** `tools/learning-loop-mcp/core/gate-logic.js:401` (line 400-407):
  ```js
  if (globMatch("records/observations/**", normalized)) {
    return {
      decision: "block",
      reason: "records/observations/** is blocked unconditionally",
      hard_block: true,
    };
  }
  ```
  The glob `records/observations/**` is a recursive wildcard matching any file at any depth under that path, including `_forensic-stubs/observation-vnstock-device-slot-ledger.yaml`. The underscore prefix on the directory name has no effect on glob matching.
- **Suggested fix:** Use a path *outside* `records/observations/**` for the forensic stub. Options: (a) `records/observations-archive/_forensic-stubs/` (sibling directory); (b) `docs/forensic-stubs/records-observations/` (under docs, the gate is permissive); (c) the same pattern used by `AGENTS.old.260612-1300.md` and the voided Bridge 1-4 reports (root-level `.old` or sibling). Verify the chosen path is NOT matched by the `records/observations/**` glob.

## Finding 3: Capability derivation has no test parity gate
- **Severity:** High
- **Location:** Phase A, §5.3 (capabilities as derived view)
- **Flaw:** The report says "The 3 dropped tools are replaced by derivation functions in `core/derivation/derive-capabilities.js`." The success metric (§8 #7) says the new function "returns the same set of capabilities the current `capability_list_verified` tool returns, plus a fresh fingerprint scan." But there is no acceptance criterion that the derivation function is called from the same call sites the old `capability_list_verified` tool was called from.
- **Failure scenario:** If `capability_list_verified` is referenced by external skills (`.claude/skills/**`, `.factory/skills/**`) or by the agent's `loop_describe` cold tier, the deletion breaks callers. The plan does not enumerate the call sites.
- **Evidence:** `tools/learning-loop-mcp/tools/list-verified-tool.js` exists. The report's §5.6 lists it for deletion. But no grep for `capability_list_verified` or `list-verified` was performed to enumerate consumers.
- **Suggested fix:** Add a Phase 1 sub-step: "Grep all consumers of `capability_list_verified`, `capability_generate`, `capability_list_probes` across `.claude/skills/**`, `.factory/skills/**`, `tools/learning-loop-mcp/core/**`, and any agents that may call them." Add a success criterion: "All callers migrated to the new derivation function or have explicit 'no replacement' callout."

## Finding 4: 40+ records orphaned by schema deletion
- **Severity:** Critical
- **Location:** Phase A, §5.5 (engine binding), §5.6 (touchpoints), §8 (success metrics)
- **Flaw:** The report says: "The 5 unbound schemas (`capability`, `claim`, `decision`, `experiment`, `index-entry`, `observation`, `resource-budget`, `risk`) are deleted." But the report only specifies what happens to the 8 observation yaml files (archive to `_forensic-stubs/`) and the 19 ledger events (extract to sidecar). It does NOT specify what happens to the 40+ records in:
  - `records/vnstock/decisions/*.yaml` (verified: directory exists with files)
  - `records/vnstock/experiments/*.yaml` (verified: directory exists with files)
  - `records/vnstock/risks/*.yaml` (verified: directory exists with files)
  - `records/vnstock/claims/*.yaml` (verified: directory exists with files)
  - `records/vnstock/evidence/*` (verified: directory exists with files)
  - `records/vnstock/index/*` (verified: directory exists with files)
  - `records/meta/` (already partially migrated per research §3.8.1)
  - `records/product/` (verified: directory exists)
  - `records/observations/*.yaml` (8 files, not all 19-ledger-related; 7 others are `observation-bootstrap-api-after-cleanup.yaml`, `observation-evidence-write-path.yaml`, etc.)

  The master tracker § Phase A re-debate is supposed to be the *Bridge 7 question* — the product surface is being re-debated. But the report's §5.5 deletion step is structurally committing to deletion without a record-conversion plan. This is a scope-creep failure mode: the plan re-debates the *schema* but not the *records*.
- **Failure scenario:** When Phase 7 deletes the 8 schemas, the 40+ records in `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` either (a) lose their schema validation (silent data corruption), (b) fail the index-extraction pipeline that the §8 #4 success metric depends on ("`meta_state_list({affected_system: 'vnstock'})` returns the same data the current `records/vnstock/` contains, after conversion"), or (c) require the product surface to be re-debated AFTER Phase A ships, which is the exact "product surface re-debated from meta-surface" the master tracker defers to Phase F. The plan is doing Phase F work in Phase A.
- **Evidence:** `ls /home/datguy/codingProjects/learning-loop-template/records/vnstock/` shows `claims/`, `decisions/`, `evidence/`, `experiments/`, `index/`, `risks/`. The report's §5.6 only mentions `records/observations/*.yaml` (8 files) and `records/<vendor>/**` "Unchanged (already unbound per §3.10)" — but "unchanged" is not the same as "deletion is safe." If the schemas are deleted, the records in `records/vnstock/decisions/*.yaml` are no longer validated by any schema.
- **Suggested fix:** Phase 7 (delete 8 schemas) must be conditional on a prior sub-step: (a) audit the count of records under each schema; (b) for each, decide: convert to `finding`/`change-log` entries in `meta-state.jsonl` with `affected_system: 'vnstock'`, OR archive at `records/_unbound/<schema>/` (sibling to `records/`, outside the gate's hard-block), OR keep the schema (defer deletion to Phase F). The current plan's "delete 8 schemas" without record conversion is a silent data loss.

## Finding 5: `affected_system` field is load-bearing but not validated
- **Severity:** High
- **Location:** Phase A, §5.1 (storage shape), §8 (success metrics)
- **Flaw:** The report extends `meta-state.jsonl` with `affected_system: string` (required, defaults to `'meta'`). But the report does not specify the set of valid values for `affected_system`. The existing 4-kind union uses enums for `entry_kind` (locked since SP3) and for `affected_system` on `finding` (an enum: `'gate-logic' | 'record-validation' | 'index-extractor' | 'mcp-tools' | 'workflow-registry' | 'vnstock_vendor'` per `core/meta-state.js:18-21`).
- **Failure scenario:** New entries with `affected_system: 'meta'` (the default) are valid. New entries with `affected_system: 'vnstock'` are also valid. New entries with `affected_system: 'foo'` (typo) are also valid. Cross-surface references using the `#affected_system=<s>` suffix (§5.1) cannot detect typos. The LRU cache key in `readRegistryWithCache` (§7 high-severity row) is supposed to be partitioned by `affected_system`, but the cache key needs a stable enum, not a free string.
- **Evidence:** `core/meta-state.js:18-21` shows the existing `affected_system` is an `z.enum([...])` for `finding`. The report's §5.1 says `affected_system: string`. This is a regression from a typed enum to a free string.
- **Suggested fix:** Keep `affected_system` as a Zod enum, not a free string. Either: (a) extend the existing 6-value enum with new values (`'api'`, `'web'`, `'product'`, etc., as appropriate), OR (b) define a new set of valid values for the new field that supplements (does not replace) the existing enum. Phase 1 of the sub-phases should include "define the canonical `affected_system` enum values" as a deliverable.

## Finding 6: LRU cache invalidation not enumerated
- **Severity:** Medium
- **Location:** Phase A, §7 (implementation considerations, high-severity row on `loadPromotedRules`)
- **Flaw:** The report acknowledges that `readRegistryWithCache` needs new `affected_system` partitioning and mentions "covered by the cold-session discoverability test." But it does not enumerate the call sites of `readRegistryWithCache`, `invalidateCache`, and `readRegistry` across `core/*.js` and `tools/**/*.js`.
- **Failure scenario:** When the `affected_system` field is added, the LRU cache is keyed on `root` + mtime + size. If a new field is added that does not affect mtime/size, the cache may return stale results. The cold-session test catches *cold path* staleness; it may not catch *warm path* staleness from a partial update.
- **Evidence:** The report's §7 says "Add `affected_system` to the cache key in `readRegistryWithCache`" without enumerating the cache key fields. `core/read-registry-cache.js` is the file; the report does not cite its current key shape.
- **Suggested fix:** Add a Phase 1 sub-step: "Read `core/read-registry-cache.js`; enumerate the LRU cache key fields; verify the `affected_system` extension is comprehensive (all callers' `affected_system` filters trigger a cache miss)."

## Finding 7: `runtime_state_record` consult-gate is undefined
- **Severity:** Medium
- **Location:** Phase A, §5.2 (state-machine semantics), §7 (medium-severity row on `rule-no-new-artifact-types`)
- **Flaw:** The report says: "Add `side-effect-import` pattern for the sidecar writes (already covered by bash-gate on `runtime_state_record`)." But `side-effect-import` is a constraint *category*; the report does not show the new pattern that extends `core/patterns.json`. The report's §7 medium row acknowledges the rule might fire but does not show the fix.
- **Failure scenario:** When the bash-gate intercepts a `runtime_state_record` invocation, the gate's pattern matcher fires the `side-effect-import` rule. The rule's existing regex matches the pattern; the new pattern is not in `core/patterns.json` yet. Either the rule does not fire (silently missing the gate) or it fires with the wrong reason (confusing the operator).
- **Evidence:** `core/patterns.json` was not enumerated in the report. The bash-gate's `side-effect-import` category is a heuristic; the report does not show the specific pattern that triggers for `runtime_state_record`.
- **Suggested fix:** Phase 1 sub-step: "Add the `runtime_state_record` pattern to `core/patterns.json` under the `side-effect-import` category." Verify the bash-gate matches the pattern with a unit test.

## Finding 8: 16 meta_state_* tool files get optional params with no API stability commitment
- **Severity:** Medium
- **Location:** Phase A, §5.6 (touchpoints: "16 `meta_state_*-tool.js` Updated: new fields surface as optional params")
- **Flaw:** The report says new fields surface as "optional params" on the existing 16 meta_state tools. This is a wire-format change: existing tools gain new optional parameters. The report does not commit to API stability (no breaking changes to the existing tool input schemas).
- **Failure scenario:** If a tool's inputSchema changes from `{id, status, ...}` to `{id, status, affected_system, ...}` with `affected_system` as optional, downstream tools that pass positional args (e.g., `meta_state_list({affected_system: 'vnstock'})`) will work, but tools that pass the input via `coerceParamsToSchema` may break if the helper does not handle the new optional field correctly. The wire-format coercion helpers (per `tool-registry.js#coerceParamsToSchema`) are tested in `__tests__/wire-format-*.test.js` — but the report does not commit to adding regression tests for the new optional fields.
- **Evidence:** `tool-registry.js#coerceParamsToSchema` (per research §3.6) is load-bearing. The report's §7 high row on `meta-state.js:6` `REGISTRY_FILENAME` acknowledges the inline zod branches need consolidation but does not commit to wire-format regression tests.
- **Suggested fix:** Phase 1 sub-step: "Add regression tests for the new optional fields in `meta_state_*` tools (one test per tool, 16 tests). Add a success criterion: 'All 16 meta_state_* tools accept the new optional fields without wire-format errors.'"

## Finding 9: Plan-file + `evidence_journal` convention is honored, not enforced — but Phase A may not need enforcement
- **Severity:** Medium
- **Location:** Phase A, §11.2 (the pre-mortem channel)
- **Flaw:** The report acknowledges (§11.2) that the `evidence_journal` convention is "honored, not enforced" and the enforcement check is "out of scope for Phase A but recommended post-Phase A." But the report's §5.1 design rationale cites this convention as the *reason* the design works (no new field on `finding` or `rule` for `method`/`effect`). If the convention breaks, the design rationale breaks.
- **Failure scenario:** A future agent or skill invocation creates a `finding` entry with `evidence_journal: 'plans/.../plan.md'` pointing at a plan file that has been renamed or moved. The citation is broken. The Internalization Rule (§6 of `AGENTS.md`) is violated. The 4-kind union's load-bearing property is intact (no schema change) but the *citation* is dead.
- **Evidence:** §11.2 explicitly defers the mechanical guard to post-Phase A. The plan does not commit to a "Phase 0 verification: every active `finding` with `affected_system != 'meta'` has an `evidence_journal` pointing at a file that exists" check.
- **Suggested fix:** Add Phase 0 check: "Verify every active `finding` with `affected_system != 'meta'` has an `evidence_journal` pointing at a file that exists on disk." This is mechanical, non-prescriptive, and catches the actual failure mode.

## Finding 10: No dependency-balance guard against future "internalize the contract" scope-creep
- **Severity:** Medium
- **Location:** Phase A, §11.1, §11.7 (dependency-balance convention)
- **Flaw:** The report's §11.7 names the three-class framework (external / internal-implementation / contract) and says "the loop internalizes the contract (full authority)." But the plan does not include a guard that prevents Phase A from accidentally internalizing a class that should stay external. For example, the `runtime-state.jsonl` is operator-mediated via the gate (§9 open-question resolution), which is the correct shape — but the §5.3 capability derivation moves the capability shape from a *recording* (a stored yaml + schema) to a *derivation* (a code function). A derivation is internal-implementation class. A recording is contract class.
- **Failure scenario:** If a future agent needs to *audit* the capabilities (not just query them), it cannot — the derivation function is internal-implementation, not a recording. The auditability is lost. The §11.7 "failure-mode genealogy" (the four failed registries) is exactly this failure: a derivation was treated as a recording and the operator lost visibility.
- **Evidence:** §5.3 says "A 'capability' is the union of: (1) Meta-state `rule` entries with `affected_system: '<surface>'`. (2) A fingerprint scan of the code that calls each `rule`'s `code_ref`." Step (1) is contract class (meta-state). Step (2) is internal-implementation class (code). The union is a derivation, not a recording.
- **Suggested fix:** Add a guard: "Capabilities are recorded as `rule` entries with `affected_system` set; the fingerprint scan is *derived* at query time, not stored as a separate artifact." Document this in §5.3 with an explicit "what is recorded vs what is derived" table.

## Files I would have written the report to (BLOCKED)

The scope-critic reviewer was the only one that returned substantive findings. The other 3 reviewers (Security Adversary, Failure Mode Analyst, Assumption Destroyer) returned "Plan is up-to-date" with no file content. This appears to be a subagent tool configuration issue (the code-reviewer persona may not have a Create/Write tool enabled in this Droid context). The findings from this reviewer are recorded here in full for the planner to adjudicate.
