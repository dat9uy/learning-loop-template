---
phase: 7
title: "6 — New consult-gate rule (rule-no-orphaned-evidence)"
status: completed
priority: P2
effort: "1.5h"
dependencies: ["5"]
---

# Phase 6: New consult-gate rule (rule-no-orphaned-evidence)

## Overview

Create `rule-no-orphaned-evidence` (resolution-evidence-required). Wire it into `core/gate-logic.js#checkResolutionEvidence` so `meta_state_resolve` consults the rule. An agent cannot resolve a finding without `mechanism_check: true` AND a `code_fingerprint` that matches the current SHA-256 of `evidence_code_ref`. Pattern reused from `plans/260606-cold-session-test-rule-promotion/`. **GREEN:** 2 new tests pass; consult-gate blocks resolution on ungrounded findings.

## Requirements

- **Functional:**
  - New rule entry in `meta-state.jsonl`:
    - `id: "rule-no-orphaned-evidence"`
    - `entry_kind: "rule"`
    - `origin: "meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden"`
    - `enforcement: "agent"`
    - `pattern_type: "resolution-evidence-required"`
    - `pattern: "*"` (wildcard — the rule applies to all resolutions; see `applies_to_resolution` handling below)
    - `applies_to_resolution: "*"` (sentinel value for global rules; `meta_state_resolve` must be modified to consult rules where `applies_to_resolution` is `"*"` for every resolution)
    - `description: "All active findings with mechanism_check=true must have an evidence_code_ref whose current hash matches the stored code_fingerprint."`
    - `status: "active"`
    - `promoted_at`, `promoted_by`
  - Modify `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js`:
    - Add a second consult loop: after the per-finding `applies_to_resolution` check, also consult all rules where `applies_to_resolution === "*"` (global rules). Global rules run for every resolution.
  - Modify `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence`:
    - **Restructure first:** the current function unconditionally destructures `rule.promoted_to_rule` and then searches for `mcp-client-loading` subtype. The new branch must be added BEFORE this existing logic (branch on `rule.id` or `rule.promoted_to_rule.rule_id` first).
    - New branch for `rule-no-orphaned-evidence`: read all active findings with `mechanism_check === true`; for each, resolve `evidence_code_ref` path (strip `#` fragment), compute current SHA-256; if any doesn't match the stored `code_fingerprint`, return `{ satisfied: false, rule_id: "rule-no-orphaned-evidence", blocking_id: orphans[0]?.id, applies_to_resolution, orphans }`.
- **Non-functional:** the rule's check reads the registry and the file system. The 30 previously-orphaned entries (now flattened) all have valid `evidence_code_ref` and many have `code_fingerprint` (set by `backfill-mechanism-check.mjs`). The rule's first run may surface findings that were resolved with the old mechanism but whose `code_fingerprint` is stale (file changed since the fingerprint was taken); those are correctly flagged for re-review.

## Architecture

The consult-gate pattern is established by `rule-cold-session-test-must-pass-before-resolution` (from `plans/260606-cold-session-test-rule-promotion/`). The mechanism:
1. A rule entry with `pattern_type: "resolution-evidence-required"` is registered in the registry.
2. `checkResolutionEvidence(rule, root)` is called by `meta_state_resolve` before applying the resolution.
3. The function reads the registry, finds the rule, runs the check, returns pass/fail.
4. If fail, `meta_state_resolve` returns `{ resolved: false, reason: "...", orphans: [...] }` and does NOT apply the transition.

For this rule, the check is: for each active finding with `mechanism_check === true`, verify `code_fingerprint` matches the current SHA-256 of `evidence_code_ref`.

## Related Code Files

- **Create (registry entry):** `meta-state.jsonl` line for `rule-no-orphaned-evidence`
- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` (add the rule branch)
- **Create:** `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` extension (2 new tests)
- **Reference pattern:** `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` (existing implementation for `rule-cold-session-test-must-pass-before-resolution`)

## Implementation Steps

1. **Read existing `checkResolutionEvidence`.** Understand the pattern. The function takes `(rule, root)` and returns `{ satisfied: true/false, rule_id, blocking_id, applies_to_resolution }`. The current implementation unconditionally destructures `rule.promoted_to_rule` and then searches for `mcp-client-loading` subtype. The new branch must be added BEFORE this logic.
2. **Modify `meta_state_resolve` to consult global rules.** In `meta-state-resolve-tool.js`, add a second loop after the per-finding `applies_to_resolution` check: for all rules where `applies_to_resolution === "*"`, call `checkResolutionEvidence(rule, root)` regardless of the target finding id.
3. **Create the rule entry.** Use `record_create_experiment` or `meta_state_log_change` MCP tools to log the design, then `meta_state_promote_rule` MCP tool to create the rule entry. (Or use direct file I/O via a small one-shot script, following the same pattern as `migrate-rule-entry-kind.mjs`.) The rule entry's fields are listed in the Requirements section.
4. **Modify `checkResolutionEvidence`.** Restructure the function to branch on `rule.id` BEFORE the existing destructuring:
   ```js
   export function checkResolutionEvidence(rule, root) {
     const { rule_id } = rule.promoted_to_rule;

     // Branch 1: global orphan-evidence rule
     if (rule_id === "rule-no-orphaned-evidence") {
       const entries = readRegistry(root);
       const activeGrounded = entries.filter(
         (e) => e.entry_kind === "finding" && (e.status === "active" || e.status === "reported") && e.mechanism_check === true
       );
       const orphans = [];
       for (const entry of activeGrounded) {
         const codeRef = entry.evidence_code_ref;
         if (!codeRef) {
           orphans.push({ id: entry.id, reason: "no_evidence_code_ref" });
           continue;
         }
         const absPath = isAbsolute(codeRef) ? codeRef : join(root, codeRef.split("#")[0]);
         let currentHash;
         try {
           currentHash = computeFileHash(absPath);
         } catch {
           orphans.push({ id: entry.id, reason: "code_ref_missing" });
           continue;
         }
         if (entry.code_fingerprint && entry.code_fingerprint !== currentHash) {
           orphans.push({ id: entry.id, reason: "fingerprint_mismatch", expected: entry.code_fingerprint, actual: currentHash });
         }
       }
       if (orphans.length > 0) {
         return { satisfied: false, rule_id: "rule-no-orphaned-evidence", blocking_id: orphans[0]?.id, applies_to_resolution: rule.promoted_to_rule?.applies_to_resolution, orphans };
       }
       return { satisfied: true, rule_id: "rule-no-orphaned-evidence" };
     }

     // Branch 2: existing per-finding resolution-evidence-required rules
     const { pattern, applies_to_resolution } = rule.promoted_to_rule;
     const entries = readRegistry(root);
     const blocking = entries.find((e) =>
       e.entry_kind === "finding"
       && e.subtype === "mcp-client-loading"
       && e.session_id === pattern
       && (e.status === "active" || e.status === "reported"),
     );
     if (blocking) {
       return {
         satisfied: false,
         blocking_id: blocking.id,
         rule_id,
         applies_to_resolution,
       };
     }
     return { satisfied: true, rule_id };
   }
   ```
5. **Write 3 new tests in `__tests__/gate-resolution-evidence.test.js`:**
   - **T-A:** "rule-no-orphaned-evidence blocks resolution when an active finding has mechanism_check=true and code_fingerprint mismatch". Construct a registry with 1 active finding with `mechanism_check=true` and a stale `code_fingerprint`. Call `checkResolutionEvidence(rule, root)`. Expect `{ satisfied: false, rule_id: "rule-no-orphaned-evidence", orphans: [...] }`.
   - **T-B:** "rule-no-orphaned-evidence allows resolution when all active findings are grounded (fingerprint matches)". Construct a registry with 1 active finding with `mechanism_check=true` and matching `code_fingerprint`. Call `checkResolutionEvidence`. Expect `{ satisfied: true }`.
   - **T-C:** "rule-no-orphaned-evidence allows resolution when active finding has mechanism_check=true but no code_fingerprint". Construct a registry with 1 active finding with `mechanism_check=true` and no `code_fingerprint`. Call `checkResolutionEvidence`. Expect `{ satisfied: true }`. (Regression guard for the missing-fingerprint case.)
5. **Run the test suite.** `pnpm test`. All 2 new tests pass; the existing `gate-resolution-evidence.test.js` (for `rule-cold-session-test-must-pass-before-resolution`) continues to pass.

## Success Criteria

- [ ] Rule entry `rule-no-orphaned-evidence` exists in `meta-state.jsonl` with status: `active`
- [ ] `checkResolutionEvidence` restructured to branch on `rule_id` before existing destructuring
- [ ] `meta_state_resolve` has a second consult loop for global rules (`applies_to_resolution === "*"`)
- [ ] T-A, T-B, and T-C pass in `gate-resolution-evidence.test.js`
- [ ] `pnpm test` passes (0 failures expected)
- [ ] `meta_state_resolve` consults the new rule for every resolution (not just the finding in `applies_to_resolution`)

## Risk Assessment

- **Risk:** The rule fires on legitimate findings whose `code_fingerprint` is stale (file changed since fingerprint was taken). **Mitigation:** this is the CORRECT behavior — the rule surfaces drift. The operator can either `meta_state_refresh_fingerprint` to update the fingerprint (if the change is legitimate) or `meta_state_resolve` with operator mode (if the finding is closed anyway).
- **Risk:** A finding has `mechanism_check=true` but no `code_fingerprint` (e.g., the finding was reported with `mechanism_check=true` but the file was never hashed). **Mitigation:** the orphan check accepts a missing `code_fingerprint` (the `entry.code_fingerprint && ...` short-circuits). The finding is exempt from the orphan check. T-C explicitly tests this case.
- **Risk:** The 30 flattened entries don't all have `code_fingerprint`. The rule's first run may surface a wave of findings that need re-fingerprinting. **Mitigation:** acceptable; this is the rule's purpose. The operator runs `meta_state_refresh_fingerprint` to update them. The registry's `meta_state_sweep` doesn't compact non-terminal entries; the wave is observable but not destructive.
- **Risk:** `evidence_code_ref` contains a `#` fragment (e.g., `file.js#functionName`). The path resolution must strip the fragment before computing the hash. **Mitigation:** the pseudocode uses `codeRef.split("#")[0]` (same pattern as `backfill-mechanism-check.mjs:58`). Ensure `checkGrounding` in `check-grounding.js` also strips fragments (or align the two paths).
- **Risk:** Performance regression — `checkResolutionEvidence` reads the entire registry and computes SHA-256 for every grounded active finding. **Mitigation:** the active finding set is small (currently ~10). The SHA-256 is microseconds. Acceptable for a consult-gate that runs once per `meta_state_resolve` call (not on every command).
