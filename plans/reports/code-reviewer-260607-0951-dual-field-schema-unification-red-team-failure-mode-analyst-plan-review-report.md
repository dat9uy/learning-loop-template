# Red Team Plan Review — Dual-Field Schema Unification

**Role:** Flow Tracer (Failure Mode Analyst)
**Plan:** plans/260607-dual-field-schema-unification/
**Status:** DONE_WITH_CONCERNS

---

## Finding 1: Phase 6 consult-gate rule is wired to a dead circuit

- **Severity:** Critical
- **Location:** Phase 6, "Implementation Steps" step 3, and Requirements section
- **Flaw:** `meta_state_resolve` only calls `checkResolutionEvidence` for rules where `rule.promoted_to_rule.applies_to_resolution === id` (the id being resolved). The plan does NOT set `applies_to_resolution` on the new `rule-no-orphaned-evidence` entry. The existing rule `rule-cold-session-test-must-pass-before-resolution` sets `applies_to_resolution: "meta-260606T0443Z-..."` (a specific finding id). The new rule is supposed to be a global check (all active findings), but `meta_state_resolve` has no wildcard/resolution-of-any-finding path. The rule will never be consulted.
- **Failure scenario:** The rule is created in `meta-state.jsonl`, `checkResolutionEvidence` is extended, but `meta_state_resolve` skips it on every resolution because `applies_to_resolution` is undefined/missing. The consult-gate is a no-op. Ungrounded findings continue to be resolved silently.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:66-71` — the loop is `if (rule.promoted_to_rule?.applies_to_resolution !== id) continue;`. The plan's rule Requirements section lists `pattern` but omits `applies_to_resolution`. `gate-logic.js:656-674` — `checkResolutionEvidence` returns `{ satisfied }`; `meta-state-resolve-tool.js:72` checks `!evidence.satisfied`.
- **Suggested fix:** Either (a) add `applies_to_resolution: "*"` support in `meta_state_resolve` (wildcard means "consult for every resolution"), or (b) change the rule's scope: make it a `gate` enforcement with a `regex`/`glob` pattern that matches the resolution command itself, or (c) redesign as a `meta_state_sweep` check rather than a resolution consult-gate.

---

## Finding 2: Phase 6 misstates `checkResolutionEvidence` return shape

- **Severity:** Critical
- **Location:** Phase 6, "Overview" and "Implementation Steps" step 3
- **Flaw:** The plan says `checkResolutionEvidence` returns `{ resolved: true/false, reason: "..." }`. The actual function returns `{ satisfied: true/false, blocking_id?, rule_id, applies_to_resolution }`. The plan's pseudocode and test expectations (T-A, T-B) are written against the wrong contract.
- **Failure scenario:** The new tests in `gate-resolution-evidence.test.js` will fail because they assert `result.resolved` (undefined) instead of `result.satisfied`. The implementation pseudocode returns `{ resolved: false, reason: "orphaned_evidence", orphans }` which will be rejected by `meta_state_resolve` (expects `.satisfied`).
- **Evidence:** `tools/learning-loop-mcp/core/gate-logic.js:656-674` — returns `{ satisfied: true, rule_id }` and `{ satisfied: false, blocking_id, rule_id, applies_to_resolution }`. `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:71-72` — checks `evidence.satisfied`.
- **Suggested fix:** Rewrite the pseudocode to return `{ satisfied: false, ... }` and update test assertions to check `.satisfied`.

---

## Finding 3: Phase 3 success criteria contradicts `metaStateLoopDesignSchema` exemption

- **Severity:** High
- **Location:** Phase 3, "Requirements" and "Success Criteria"
- **Flaw:** The plan says `metaStateLoopDesignSchema: no change (loop-designs don't have evidence)` and then says success criteria is "4 schema definitions updated; all expose `evidence_code_ref` as top-level optional." These are mutually exclusive. Zod strips unknown keys by default, so `safeParse` with an extra `evidence_code_ref` key succeeds, but the schema does NOT "expose" the field.
- **Failure scenario:** Phase 1 T-3 passes (Zod strips unknown), but the success criteria is misleading. The test named "all 4 union branches expose `evidence_code_ref` top-level" actually tests acceptance, not exposure. Loop-design still cannot store `evidence_code_ref` in a real entry.
- **Evidence:** `tools/learning-loop-mcp/core/meta-state.js:123-146` — `metaStateLoopDesignSchema` has no `evidence_code_ref` field.
- **Suggested fix:** Change success criteria to "3 of 4 schemas expose `evidence_code_ref` (finding, change-log, rule); loop-design accepts but strips it." Or add `evidence_code_ref` to loop-design if the intent is true uniformity.

---

## Finding 4: Phase 4 migration forward-compat branch conflicts with Phase 3 clean break

- **Severity:** High
- **Location:** Phase 4, "Requirements" bullet 4 and 5
- **Flaw:** The migration script says: "If `entry.evidence` has any other fields: keep (forward-compat)." But Phase 3 removes the `evidence` block from `metaStateChangeEntrySchema` entirely. After Phase 3, any entry that still has an `evidence` key (even with only `journal`) will fail `metaStateChangeEntrySchema.safeParse` because the schema no longer knows the key.
- **Failure scenario:** A change-log entry with `evidence: { journal: "..." }` (no `code_ref`) is migrated. The script keeps `evidence` because `journal` is still present. The patched entry fails kind-specific validation. The migration aborts.
- **Evidence:** `tools/learning-loop-mcp/core/meta-state.js:55-86` — `metaStateChangeEntrySchema` has `evidence: z.object(...).optional()` currently. Phase 3 removes it. After removal, any object with `evidence` property fails validation.
- **Suggested fix:** The migration script must ALWAYS delete the `evidence` key after extracting its fields, regardless of whether other sub-fields remain. Or the schema must allow `evidence` as a passthrough (`z.object(...).passthrough().optional()`) during migration.

---

## Finding 5: Phase 5 falsely claims `metaStatePromoteRuleTool` already writes top-level evidence

- **Severity:** High
- **Location:** Phase 5, "Requirements" and "Implementation Steps" step 4
- **Flaw:** The plan says "`metaStateProposeDesignTool` and `metaStatePromoteRuleTool`: verify (no code change). Both already use top-level fields." `metaStatePromoteRuleTool` does NOT write any evidence fields. The rule entry it creates (`ruleEntry` at line 163-177 of `meta-state-promote-rule-tool.js`) has no `evidence_code_ref`, `evidence_journal`, or `evidence_test`.
- **Failure scenario:** The tool is verified as "no change needed" but it never writes `evidence_code_ref`. Rule entries created after the plan will lack the field, causing the new Phase 6 rule to flag them as orphaned (no `evidence_code_ref` → orphan). The tool needs to be updated to propagate the source finding's `evidence_code_ref` to the rule entry.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js:163-177` — no evidence fields in the constructed entry.
- **Suggested fix:** Update `metaStatePromoteRuleTool` to copy `evidence_code_ref` (and `evidence_journal`/`evidence_test`) from the source finding into the rule entry.

---

## Finding 6: 7 dual-form entries will retain nested `evidence` after migration

- **Severity:** Medium
- **Location:** Phase 4, "Requirements" idempotency clause
- **Flaw:** The plan says 30 entries have only nested form. The actual count is 30 nested-only + 7 entries that have BOTH top-level and nested (`evidence_code_ref` + `evidence.code_ref`). The migration script's idempotency guard says "skip if `evidence_code_ref` is already set." Those 7 entries will be skipped, leaving their nested `evidence` blocks intact.
- **Failure scenario:** After Phase 4, 7 entries still carry `evidence.code_ref`. Phase 1's T-1 test ("0 entries carry nested `evidence.code_ref`") fails. The plan's success criteria "0 entries with nested `evidence.code_ref`" is unachievable with the stated idempotency rule.
- **Evidence:** `node` count script: `both: 7` entries have `evidence_code_ref` AND `evidence.code_ref`. `meta-state.jsonl` examples: `meta-2200Z-deferred-design-concrete-adoption...` has both `"evidence_code_ref":"..."` and `"evidence":{"code_ref":"..."}`.
- **Suggested fix:** Change the idempotency guard to: "skip only if `evidence_code_ref` is already set AND `evidence` is absent/empty." For the 7 dual-form entries, overwrite the nested form and delete `evidence`.

---

## Finding 7: Plan miscounts legacy-fallback consumers

- **Severity:** Medium
- **Location:** Plan.md, "Problem Statement" and Phase 5 "Requirements"
- **Flaw:** The plan says "5 of 6 consumers use a legacy fallback chain." The actual count is 4 of 6. The consumers are: `query-drift` (NO fallback — the bug), `derive-status` (fallback), `check-grounding` (fallback), `refresh-fingerprint` (fallback), `backfill-mechanism-check` (fallback), `summarize` (NO fallback — doesn't read the field at all). `summarize` is not a consumer of the evidence field; it omits it entirely.
- **Failure scenario:** The plan's Phase 5 "5 consumers all read top-level only after this phase" is wrong. `summarize` never reads it, so removing the fallback from the other 4 won't help `summarize`. `query-drift` already reads top-level only (the root cause of the bug).
- **Evidence:** `tools/learning-loop-mcp/core/loop-introspect.js:357-415` — `summarize` does not include `evidence_code_ref` in its compact output. `tools/learning-loop-mcp/core/query-drift.js:37` — checks `entry.evidence_code_ref` directly.
- **Suggested fix:** Correct the count to "4 of 5 actual consumers use legacy fallback; `query-drift` does not (the bug); `summarize` does not read the field." Add a step to include `evidence_code_ref` in `summarize` output.

---

## Finding 8: Phase 3 `summarize()` does not include `evidence_code_ref`

- **Severity:** Medium
- **Location:** Phase 3, "Implementation Steps" step 4
- **Flaw:** The plan says "verify `summarize()` reads `entry.evidence_code_ref` directly (not `entry.evidence?.code_ref`). The existing 24+ field whitelist should already be top-level." But `summarize()` does NOT include `evidence_code_ref` in its whitelist at all. It omits the field entirely.
- **Failure scenario:** Any downstream consumer that uses `summarize` (e.g., `loop_describe` compact tier, `meta-state-list-compact`) will lose `evidence_code_ref` from the output. After the migration, the field exists on the entry but is invisible through the summary path.
- **Evidence:** `tools/learning-loop-mcp/core/loop-introspect.js:357-415` — the `summarize` function checks ~40 fields but never reads `entry.evidence_code_ref`, `entry.evidence_journal`, or `entry.evidence_test`.
- **Suggested fix:** Add `evidence_code_ref`, `evidence_journal`, and `evidence_test` to the `summarize` whitelist. Add a regression test in `loop-introspect.test.js`.

---

## Finding 9: Phase 6 orphan check logic is fragile for missing `code_fingerprint`

- **Severity:** Medium
- **Location:** Phase 6, "Risk Assessment" second bullet
- **Flaw:** The plan says "the orphan check accepts a missing `code_fingerprint` (the `entry.code_fingerprint && ...` short-circuits)." But the pseudocode shows `if (entry.code_fingerprint && entry.code_fingerprint !== currentHash) { orphans.push(...) }`. This means a finding with `mechanism_check=true` and `evidence_code_ref` set but NO `code_fingerprint` is silently accepted. The test T-B says "1 active with `mechanism_check=true` and matching `code_fingerprint`" is the pass case, but the REAL pass case should test "1 active with `mechanism_check=true` and NO `code_fingerprint`" to verify the short-circuit. The current test doesn't cover the risk.
- **Failure scenario:** A finding is promoted to rule with `mechanism_check=true` but no `code_fingerprint`. The rule allows resolution. The finding is effectively ungrounded (no fingerprint to verify). The short-circuit is intentional per the plan, but the test doesn't verify it.
- **Evidence:** Phase 6 Implementation Steps step 4, T-B test description.
- **Suggested fix:** Change T-B to explicitly test the missing-fingerprint case: "1 active with `mechanism_check=true` and no `code_fingerprint`" (should pass) and "1 active with `mechanism_check=true` and stale fingerprint" (should fail).

---

## Finding 10: Phase 6 `computeFileHash` call on `evidence_code_ref` with `#` fragment

- **Severity:** Medium
- **Location:** Phase 6, "Implementation Steps" step 3
- **Flaw:** The pseudocode computes `absPath` from `codeRef` using `codeRef.split("#")[0]` — wait, no, the pseudocode shows `join(root, codeRef.split("#")[0])`. Actually looking at the pseudocode: `const absPath = isAbsolute(codeRef) ? codeRef : join(root, codeRef.split("#")[0]);` — this correctly strips the fragment. But the existing `checkGrounding` function (`check-grounding.js:144`) does NOT strip the fragment. The `computeFileHash` throws `FileNotFoundError` on a path like `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence`. The backfill script (`backfill-mechanism-check.mjs:58`) does strip the fragment. The plan's Phase 6 pseudocode correctly strips it, but the plan doesn't verify that `checkGrounding` also needs this fix.
- **Failure scenario:** The new rule checks fingerprints using `computeFileHash(absPath)`. If the `evidence_code_ref` includes a `#fragment` (common in the registry), `computeFileHash` throws because the file path includes the fragment. The rule marks it as "code_ref_missing" and blocks resolution incorrectly.
- **Evidence:** `tools/learning-loop-mcp/core/check-grounding.js:144` — `const absPath = isAbsolute(codeRef) ? codeRef : join(root, codeRef);` — no fragment stripping. `tools/learning-loop-mcp/core/gate-logic.js:656-674` — the new rule's pseudocode shows `join(root, codeRef.split("#")[0])`, which is correct. But the plan should note that `checkGrounding` has the same bug for entries with fragments.
- **Suggested fix:** Add a note that `checkGrounding` also needs fragment stripping, or align the new rule's path logic with the backfill script's proven pattern.

---

## Summary

- **Critical:** 2 findings (Phase 6 dead circuit + return shape mismatch)
- **High:** 3 findings (Phase 3 loop-design contradiction + Phase 4 forward-compat + Phase 5 promote-rule tool)
- **Medium:** 5 findings (dual-form entries miscount + consumer count + summarize whitelist + fingerprint test gap + fragment path)
- **Total:** 10 findings

The plan's TDD structure is sound, but Phase 6 has a fundamental architectural mismatch with the existing consult-gate mechanism (which is per-finding, not global). The migration script's idempotency rule leaves 7 entries with nested evidence. The writer-tool verification steps are based on false assumptions about `metaStatePromoteRuleTool`. The `summarize` whitelist omission is a data-loss bug that will surface after the migration.

**Recommended next step:** Fix the Phase 6 rule scope (global vs per-finding) before implementation. Re-verify all 4 writer tools against actual code. Update the migration idempotency rule to handle the 7 dual-form entries.
