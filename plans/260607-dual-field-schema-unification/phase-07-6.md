---
phase: 7
title: "6 — New consult-gate rule (rule-no-orphaned-evidence)"
status: pending
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
    - `pattern: "meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden"` (the rule's own check id; `checkResolutionEvidence` reads this)
    - `description: "All active findings with mechanism_check=true must have an evidence_code_ref whose current hash matches the stored code_fingerprint."`
    - `status: "active"`
    - `promoted_at`, `promoted_by`
  - Modify `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence`:
    - Add a new branch: when `rule.pattern_type === "resolution-evidence-required"` AND the pattern matches `rule-no-orphaned-evidence`, read all active findings with `mechanism_check === true`; for each, compute the current SHA-256 of `evidence_code_ref`; if any doesn't match the stored `code_fingerprint`, return `{ resolved: false, reason: "orphaned_evidence", orphans: [...] }`.
- **Non-functional:** the rule's check reads the registry and the file system. The 30 previously-orphaned entries (now flattened) all have valid `evidence_code_ref` and many have `code_fingerprint` (set by `backfill-mechanism-check.mjs`). The rule's first run may surface findings that were resolved with the old mechanism but whose `code_fingerprint` is stale (file changed since the fingerprint was taken); those are correctly flagged for re-review.

## Architecture

The consult-gate pattern is established by `rule-cold-session-test-must-pass-before-resolution` (from `plans/260606-cold-session-test-rule-promotion/`). The mechanism:
1. A rule entry with `pattern_type: "resolution-evidence-required"` is registered in the registry.
2. `checkResolutionEvidence(rule, root)` is called by `meta_state_resolve` before applying the resolution.
3. The function reads the registry, finds the rule, runs the check, returns pass/fail.
4. If fail, `meta_state_resolve` returns `{ resolved: false, reason: "..." }` and does NOT apply the transition.

For this rule, the check is: for each active finding with `mechanism_check === true`, verify `code_fingerprint` matches the current SHA-256 of `evidence_code_ref`.

## Related Code Files

- **Create (registry entry):** `meta-state.jsonl` line for `rule-no-orphaned-evidence`
- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` (add the rule branch)
- **Create:** `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` extension (2 new tests)
- **Reference pattern:** `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` (existing implementation for `rule-cold-session-test-must-pass-before-resolution`)

## Implementation Steps

1. **Read existing `checkResolutionEvidence`.** Understand the pattern. The function takes `(rule, root)` and returns `{ resolved: true/false, reason: "..." }`. The current implementation handles `rule-cold-session-test-must-pass-before-resolution` (a single rule). Extend it to handle the new `rule-no-orphaned-evidence` rule.
2. **Create the rule entry.** Use `record_create_experiment` or `meta_state_log_change` MCP tools to log the design, then `meta_state_promote_rule` MCP tool to create the rule entry. (Or use direct file I/O via a small one-shot script, following the same pattern as `migrate-rule-entry-kind.mjs`.) The rule entry's fields are listed in the Requirements section.
3. **Modify `checkResolutionEvidence`.** Add a new branch:
   ```js
   if (rule.id === "rule-no-orphaned-evidence") {
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
       return { resolved: false, reason: "orphaned_evidence", orphans };
     }
     return { resolved: true };
   }
   ```
4. **Write 2 new tests in `__tests__/gate-resolution-evidence.test.js`:**
   - **T-A:** "rule-no-orphaned-evidence blocks resolution when an active finding has mechanism_check=true and code_fingerprint mismatch". Construct a registry with 1 active finding with `mechanism_check=true` and a stale `code_fingerprint` (any hash that doesn't match the file). Call `checkResolutionEvidence(rule, root)`. Expect `{ resolved: false, reason: "orphaned_evidence", orphans: [...] }`.
   - **T-B:** "rule-no-orphaned-evidence allows resolution when all active findings are grounded (fingerprint matches or mechanism_check is not true)". Construct a registry with 2 findings: 1 active with `mechanism_check=true` and matching `code_fingerprint`; 1 active with `mechanism_check` not set. Call `checkResolutionEvidence`. Expect `{ resolved: true }`.
5. **Run the test suite.** `pnpm test`. All 2 new tests pass; the existing `gate-resolution-evidence.test.js` (for `rule-cold-session-test-must-pass-before-resolution`) continues to pass.

## Success Criteria

- [ ] Rule entry `rule-no-orphaned-evidence` exists in `meta-state.jsonl` with status: `active`
- [ ] `checkResolutionEvidence` handles the new rule
- [ ] T-A and T-B pass in `gate-resolution-evidence.test.js`
- [ ] `pnpm test` passes (allow 1 pre-existing failure)
- [ ] `meta_state_resolve` consults the new rule (verified by reading the tool handler; the rule's `pattern_type: "resolution-evidence-required"` triggers the consult automatically)

## Risk Assessment

- **Risk:** The rule fires on legitimate findings whose `code_fingerprint` is stale (file changed since fingerprint was taken). **Mitigation:** this is the CORRECT behavior — the rule surfaces drift. The operator can either `meta_state_refresh_fingerprint` to update the fingerprint (if the change is legitimate) or `meta_state_resolve` with operator mode (if the finding is closed anyway).
- **Risk:** A finding has `mechanism_check=true` but no `code_fingerprint` (e.g., the finding was reported with `mechanism_check=true` but the file was never hashed). **Mitigation:** the orphan check accepts a missing `code_fingerprint` (the `entry.code_fingerprint && ...` short-circuits). The finding is exempt from the orphan check. A future iteration may require both.
- **Risk:** The 30 flattened entries don't all have `code_fingerprint`. The rule's first run may surface a wave of findings that need re-fingerprinting. **Mitigation:** acceptable; this is the rule's purpose. The operator runs `meta_state_refresh_fingerprint` to update them. The registry's `meta_state_sweep` doesn't compact non-terminal entries; the wave is observable but not destructive.
- **Risk:** Performance regression — `checkResolutionEvidence` reads the entire registry and computes SHA-256 for every grounded active finding. **Mitigation:** the active finding set is small (currently ~10). The SHA-256 is microseconds. Acceptable for a consult-gate that runs once per `meta_state_resolve` call (not on every command).
