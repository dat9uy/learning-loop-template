# Red Team Consolidated Report — meta_state_patch + wire-format coercion fix

**Plan:** `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/`
**Date:** 2026-06-08
**Verification tier:** Standard (3 phases) — Fact Checker + Contract Verifier
**Reviewers:** 3 parallel hostile lenses
  - Security Adversary (10 findings)
  - Failure Mode Analyst (10 findings)
  - Assumption Destroyer (14 findings)

After dedup: **15 unique findings** (4 Critical, 7 High, 4 Medium). Capped at 15 per workflow.

All findings below include `file:line` evidence verified by grep/glob against the codebase. No evidence-free findings.

---

## Summary by severity

| Severity | Count | IDs |
|----------|-------|-----|
| Critical | 4     | F1, F2, F3, F4 |
| High     | 7     | F5, F6, F7, F8, F9, F10, F11 |
| Medium   | 4     | F12, F13, F14, F15 |
| **Total** | **15** | |

## Cross-reviewer consensus

| Theme | Security | Failure | Assumption | Count |
|-------|----------|---------|------------|-------|
| Test 4 (no-op identity) is impossible | — | — | F1 | 1 |
| Test 4 (change-log) unreachable | F2 | — | F2 | 2 |
| Phase 3.1 uses `node -e` escape hatch | F6 | F2 | F9 | 3 |
| `passthrough()` + no auth / no field guards | F1 | — | F6 | 2 |
| Wire-format fix is global / indiscriminate | F3, F4 | F1 | — | 3 |
| `coerceParamsToSchema` introspection fragile / mock schemas | F9 | F10 | F14 | 3 |
| Wire-format fix doesn't descend into patch tool's passthrough | F10 | F7 | — | 2 |
| `updateEntry` return-value switch silent fall-through | — | F4 | — | 1 |
| Two-script version race / `_expected_version` optional footgun | F5 | F3, F5 | F10 | 4 |
| `rule-no-orphaned-evidence` will block Phase 3.3 resolve | F7 | F6 | — | 2 |
| Lineage claim FALSE: 2102Z/2202Z/2106Z already expired | F5 | — | F4 | 2 |
| Test 1's "version: 0" misleading — only change-log has version | — | F8 | — | 1 |
| Lineage narrative + test count overstated | F5 | F8 | F3, F5 | 4 |
| `coerceParamsToSchema` doesn't unwrap ZodDefault | — | — | F7 | 1 |
| Architectural debt + missing test coverage | F8 | F9 | F8, F11, F12, F13 | 6 |

---

## Critical Findings

### Finding F1: Test 4 (no-op identity) is mathematically impossible — Phase 2 will never go green
- **Severity:** Critical
- **Reviewer(s):** Assumption Destroyer
- **Location:** Phase 1.3 Test 4 vs Phase 2.1 implementation
- **Flaw:** Test 4 asserts `assert.equal(result, args)` (identity preserved). Phase 2.1 does `const coerced = { ...args }` which always allocates a new object. No code path returns the original `args` reference.
- **Failure scenario:** Phase 1 test fails, Phase 2 implements as designed, Test 4 still fails. Phase 2 never goes green. Plan cannot ship.
- **Evidence:** `phase-01-red-tdd-tests-first.md:162` (`assert.equal(result, args)`) vs `phase-02-green-implementation.md:74` (`const coerced = { ...args };`)
- **Disposition:** **Accept** — blocker, must fix before Phase 1

### Finding F2: Test 4 (change-log immutability) is unreachable via the Zod enum
- **Severity:** Critical
- **Reviewer(s):** Security Adversary, Assumption Destroyer
- **Location:** Phase 1.2 Test 4, Phase 2.4 schema/handler
- **Flaw:** Schema declares `entry_kind: z.enum(["finding", "rule", "loop-design"])` which excludes `"change-log"`. Zod validation rejects `entry_kind: "change-log"` before the handler runs. The handler's `if (entry.entry_kind === "change-log")` check (line 205) is unreachable for that input. Phase 1 Test 4 cannot pass.
- **Failure scenario:** Test 4 fails because the test never reaches the handler. Plan claims to test immutability; test cannot exercise it.
- **Evidence:** `phase-02-green-implementation.md:166-168` (schema) vs `:205` (handler check) vs `phase-01-red-tdd-tests-first.md:108-114` (Test 4 spec)
- **Disposition:** **Accept** — Test 4 must be rewritten, OR `change-log` removed from handler and tested via direct entry write

### Finding F3: Phase 3.1 uses `node -e` — the exact escape-hatch pattern the plan claims to retire
- **Severity:** Critical
- **Reviewer(s):** Security Adversary, Failure Mode Analyst, Assumption Destroyer (all 3)
- **Location:** Phase 3.1 lines 67-94 (two `node -e` scripts)
- **Flaw:** The "recursive proof" uses `node -e "import('./tools/learning-loop-mcp/core/meta-state.js').then(...)"` — precisely the `meta-260606T2102Z` escape-hatch abuse. Plan's own narrative (`plan.md:33`) says the recursion is breaking the system. AGENTS.md rule (Step 3.4) tells future agents NOT to use this pattern, but the very plan violates it.
- **Failure scenario:** Auditor reads diff, opens Phase 3.1, files a red-team finding: "The plan that closes the escape hatch demonstrates the escape hatch." The new AGENTS.md rule loses authority.
- **Evidence:** `phase-03-refactor-and-closeout.md:66-94` (two `node -e` blocks); `plan.md:33`; `meta-state.jsonl:49` (2102Z documents the abuse)
- **Disposition:** **Accept** — restructure to use a named script or E2E test

### Finding F4: Plan ships `metaStateEntryPatchSchema = z.object({}).passthrough()` with no auth and no field-level guards
- **Severity:** Critical
- **Reviewer(s):** Security Adversary, Assumption Destroyer
- **Location:** Phase 2.4 (handler); Plan §Out of Scope line 84
- **Flaw:** Schema accepts any top-level key. `updateEntry` does `Object.assign(entry, cleanPatch)` (`core/meta-state.js:316`) — no allowlist, no per-branch revalidation. Auth/role is in Out of Scope. An attacker can overwrite `id`, `version`, `created_at`, `code_fingerprint`, `promoted_to_rule`, `consolidated_into` — the audit trail. The patch tool can rewrite history.
- **Failure scenario:** Attacker calls `meta_state_patch({ id: "rule-no-orphaned-evidence", entry_kind: "rule", patch: { pattern: "..." } })` to rewrite the regex gating every resolve. Or patches `code_fingerprint` to an arbitrary SHA-256, defeating `checkResolutionEvidence` (`core/gate-logic.js:678-715`).
- **Evidence:** `core/meta-state.js:191` (passthrough); `core/meta-state.js:312-318` (Object.assign with no allowlist); `core/gate-logic.js:678-715` (fingerprint check); `plan.md:84` (auth in Out of Scope); `phase-02-green-implementation.md:169-170` (passthrough in patch tool)
- **Disposition:** **Accept** — must add deny-list for `id`, `version`, `created_at`, `created_by`, `code_fingerprint`, `promoted_to_rule`, `consolidated_into`, `resolved_*`, `acked_at`, `status`; OR add per-branch revalidation against `metaStateEntrySchema`

---

## High Findings

### Finding F5: `coerceParamsToSchema` is a global indiscriminate hammer that runs on all 50+ tools
- **Severity:** High
- **Reviewer(s):** Security Adversary (F3, F4), Failure Mode Analyst (F1)
- **Location:** Phase 2.1 (helper), Phase 2.2 (wire-in), Phase 1.3 (tests)
- **Flaw:** Helper wired into `tool-registry.js#wrappedHandler` (`tool-registry.js:32-50`) runs for every tool call across all 53 tools. Bonus bug: `coerced = { ...args }` always creates a new object, so `coerced !== args` is ALWAYS true → `wire_format_coerced` log fires on EVERY tool call regardless of whether coercion happened. Plan's Risk Assessment says "leave as-is" on bad JSON, but Zod's schema then fails with no diagnostic.
- **Failure scenario:** (1) Future tool declares `z.string()` for a field that the user sends as a JSON array; helper tries `JSON.parse("a,b,c")`, throws, falls through, validation fails silently. (2) Every tool call logs `wire_format_coerced` → 10MB gate-log.jsonl fills in minutes, evicting forensic entries.
- **Evidence:** `tool-registry.js:32-50` (wrappedHandler); `tools/manifest.json` (53 tools funnel through this); `plan/phase-01-red-tdd-tests-first.md:135-163` (Test 4 schema is synthetic)
- **Disposition:** **Accept** — fix `coerced !== args` to compare only actually-changed fields; make helper opt-in per tool

### Finding F6: `coerceParamsToSchema` corruption cases: `Number("") === 0` and "leave as-is" on bad JSON
- **Severity:** High
- **Reviewer(s):** Security Adversary
- **Location:** Phase 2.1, lines 82-89
- **Flaw:** (1) For numbers, `Number("") === 0` (not NaN), so `""` becomes 0 — silent data corruption. (2) `try { coerced[key] = JSON.parse(value); } catch { /* leave as-is */ }` — if parsing fails, the string passes to handler. Zod never re-validates. (3) For booleans, only `"true"`/`"false"` mapped (rejects `"True"`, `"yes"`, `"1"`).
- **Failure scenario:** Attacker calls with `_expected_version: ""` → silently becomes 0, may cause `version_mismatch` for what should have been "no CAS" → infinite loop. Or sends `addresses: "}"` (broken JSON) → leaves as `"}"`, setsEqual misroutes idempotency check.
- **Evidence:** `phase-02-green-implementation.md:82-83, 85-86, 88-89` (try/catch + Number check)
- **Disposition:** **Accept** — use `parseFloat` + check original string matches `^-?\d+(\.\d+)?$`; reject invalid coercion explicitly

### Finding F7: `coerceParamsToSchema` introspection fragile; tests use mock schemas, not real Zod 4.4.3
- **Severity:** High
- **Reviewer(s):** Security Adversary, Failure Mode Analyst, Assumption Destroyer
- **Location:** Phase 2.1; Plan §"Risk Assessment" item 1
- **Flaw:** Helper uses `fieldSchema._def.typeName` and `fieldSchema._def.innerType._def.typeName` — private Zod internals. Plan claims "stable in Zod 3.x → 4.x" but risk section admits introspection might fail. Tests construct mock schemas with the same internals the helper expects, so 4 unit tests pass; production on different Zod build fails open silently. `coercion_introspection_failed` log mentioned in plan but never implemented.
- **Failure scenario:** Future `pnpm install` upgrades zod. Helper silently no-ops. 4 unit tests still pass (mock schemas). Operator doesn't notice until a new finding is filed.
- **Evidence:** `phase-02-green-implementation.md:78-80` (private API); `phase-01-red-tdd-tests-first.md:135-163` (mock schemas); `plan.md:105` ("stable" claim)
- **Disposition:** **Accept** — add regression test using real `metaStateProposeDesignTool.schema`; implement `coercion_introspection_failed` log; use `fieldSchema.constructor.name` as a backup

### Finding F8: Wire-format fix does NOT descend into patch tool's nested `z.object({}).passthrough()` patch field
- **Severity:** High
- **Reviewer(s):** Security Adversary, Failure Mode Analyst
- **Location:** Phase 2.1, Phase 2.4; `core/meta-state.js:191`
- **Flaw:** Helper walks `schema.shape` only at the top level. `metaStateEntryPatchSchema` is `z.object({}).passthrough()` with EMPTY shape — helper finds no fields, does nothing for the `patch` parameter's contents. If caller sends `patch: { proposed_design_for: '["meta_state_patch"]' }` (JSON string per the wire-format bug class), the helper does not re-hydrate it, `updateEntry` writes the string into the entry, registry corrupts.
- **Failure scenario:** The very bug class the fix addresses persists in the new tool. Recursive: shipping a patch tool that has the same bug it was meant to fix.
- **Evidence:** `core/meta-state.js:191` (empty shape); `phase-02-green-implementation.md:70-93` (top-level only); `phase-02-green-implementation.md:165-172` (patch is passthrough)
- **Disposition:** **Accept** — either recursive walk with depth limit, or document that user must pre-parse arrays in patch

### Finding F9: `updateEntry` return-value switch silently falls through to "patched: true" for any unrecognized string
- **Severity:** High
- **Reviewer(s):** Failure Mode Analyst
- **Location:** Phase 2.4 lines 222-250
- **Flaw:** Handler checks `=== "version_mismatch"` and `=== "validation_failed"`, then falls through to `patched: true`. A future maintainer adding a new return value (e.g., `"rate_limited"`, `"schema_evolution_required"`) will silently make the patch tool report success — the OPPOSITE of fail-safe.
- **Failure scenario:** Silent data loss. "The patch says it succeeded but the file is unchanged."
- **Evidence:** `core/meta-state.js:269-327` (return values); `phase-02-green-implementation.md:220-273` (switch checks only two strings)
- **Disposition:** **Accept** — add `else { throw new Error("Unexpected updateEntry result: " + updateResult); }`

### Finding F10: Optional `_expected_version` is a race footgun + two-script version race in Phase 3.1
- **Severity:** High
- **Reviewer(s):** Security Adversary, Failure Mode Analyst, Assumption Destroyer
- **Location:** Phase 2.4 `_expected_version: z.number().optional()`; Phase 3.1 lines 67-94
- **Flaw:** (1) `_expected_version` is optional. If omitted, no CAS, no race protection. Two agents reading version=3 and patching different fields both succeed; second overwrites first silently. (2) Phase 3.1 reads version in script 1, calls patch in script 2 — separate Node processes. Any concurrent writeEntry bumps the version between scripts; patch fails with `version_mismatch`. No retry loop.
- **Failure scenario:** Lost updates with no audit log warning. Phase 3.1 fails on a busy system.
- **Evidence:** `phase-02-green-implementation.md:171-172, 215-218` (optional); `core/meta-state.js:291-295` (CAS only fires if present); `phase-03-refactor-and-closeout.md:67-94` (two separate processes)
- **Disposition:** **Accept (partial)** — make `_expected_version` required for high-risk fields; or auto-capture in pre-read; single process for Phase 3.1

### Finding F11: `rule-no-orphaned-evidence` will block Phase 3.3 resolve; plan dismisses as "advisory"
- **Severity:** High
- **Reviewer(s):** Security Adversary, Failure Mode Analyst
- **Location:** Plan §"Success Criteria" line 97; Phase 3.3 Risk
- **Flaw:** CRUD finding has `mechanism_check: true` with `code_fingerprint: sha256:5a43ec6b...` (`meta-state.jsonl:67`). Consult-gate blocks resolution when fingerprint is stale. Plan's mitigation is informal: "run `meta_state_refresh_fingerprint` first." Even with refresh, plan doesn't sequence `meta_state_ack` (CRUD is `reported`, not `active`).
- **Failure scenario:** Phase 3.3 hits `resolution_evidence_required` (same pattern as `meta-260607T1517Z`, `meta-state.jsonl:63`). Plan doesn't sequence `meta_state_ack` → `meta_state_refresh_fingerprint` → `meta_state_resolve`.
- **Evidence:** `meta-state.jsonl:67` (CRUD finding reported, mechanism_check=true); `core/gate-logic.js:678-715` (checkResolutionEvidence); `meta-state.jsonl:61` (rule active); `phase-03-refactor-and-closeout.md:218-223` (informal mitigation)
- **Disposition:** **Accept** — Phase 3.3 must explicitly sequence: `meta_state_ack` → `meta_state_check_grounding` → `meta_state_refresh_fingerprint` (if stale) → `meta_state_resolve`

---

## Medium Findings

### Finding F12: Lineage claim FALSE: 2102Z/2202Z/2106Z are already `expired` / `auto-resolved`
- **Severity:** Medium
- **Reviewer(s):** Security Adversary, Assumption Destroyer
- **Location:** Plan frontmatter lines 13-19; Phase 3.3 lines 138-152
- **Flaw:** All 3 findings are `status: "expired"`, `resolved_by: "auto-resolve"`, `resolved_at: "2026-06-08T01:11:42.524Z"` (9 hours before plan creation at 10:15 UTC). The "closed transitively" narrative is post-hoc. Plan creates a false lineage trail.
- **Failure scenario:** Future audit reads "lineage preserved" and tries to retrace the chain; finds nothing to trace.
- **Evidence:** `meta-state.jsonl:49, 50, 53` (all 3 expired before plan creation)
- **Disposition:** **Accept** — rewrite frontmatter to state facts; this plan addresses the STRUCTURAL gap, not the findings themselves

### Finding F13: Test count "840+" is overstated; actual is ~487 across 73 test files
- **Severity:** Medium
- **Reviewer(s):** Assumption Destroyer
- **Location:** `plan.md:62, 89`; `phase-02-green-implementation.md:326`
- **Flaw:** Actual `test(` calls in `__tests__/` sum to 487. Plan claim of 840+ is off by ~1.7x. (Not 2.5x as reviewer estimated — verified.)
- **Evidence:** `grep -c "test(" tools/learning-loop-mcp/__tests__/*.test.js` → 487 total; 73 .test.js files
- **Disposition:** **Accept** — drop precise number or use "480+"

### Finding F14: Test 1's "version: 0" is misleading — only change-log schema has `version` field
- **Severity:** Medium
- **Reviewer(s):** Failure Mode Analyst
- **Location:** Phase 1.2 Test 1; `core/meta-state.js:21-65, 115-145, 151-174`
- **Flaw:** Only `metaStateChangeEntrySchema` has `version: z.number().default(0)` (line 106). Finding/Rule/LoopDesign schemas do NOT have a `version` field. CAS comparison at line 279 reads `entry.version ?? 0` — so Test 1's `_expected_version: 0` passes by coincidence (default 0). The test isn't testing what the plan narrative says it tests.
- **Failure scenario:** Future operator expects CAS to bump a finding's `version` after a patch. It doesn't — only change-logs get version bumps. Patch on a finding has no version history.
- **Evidence:** `core/meta-state.js:21-65, 115-145, 151-174` (no version field); `core/meta-state.js:106` (only change-log has version); `core/meta-state.js:317` (only change-logs get version bumped)
- **Disposition:** **Accept** — document the implicit versioning, or add `version: z.number().default(0)` to all 4 schemas with migration

### Finding F15: `coerceParamsToSchema` doesn't unwrap `ZodDefault`; misses real fields
- **Severity:** Medium
- **Reviewer(s):** Assumption Destroyer
- **Location:** Phase 2.1 lines 79-81
- **Flaw:** Helper only unwraps `ZodOptional` and `ZodNullable`. Doesn't handle `ZodDefault`, `ZodEffects`, `ZodTransform`, `ZodLazy`. `meta-state-propose-design-tool.js:29` uses `addresses: z.array(z.string()).default([])` — `.default()` returns `ZodDefault`, which the helper does not unwrap. The wire-format fix is a no-op for this field.
- **Failure scenario:** Future tool uses `.default()` on a top-level field that the bug class affects; the fix silently fails to help.
- **Evidence:** `phase-02-green-implementation.md:79-81` (only 2 wrappers); `meta-state-propose-design-tool.js:29` (uses `.default([])`)
- **Disposition:** **Accept** — implement recursive unwrapping for ZodDefault (or document the gap and submit a follow-up finding)

---

## Rejected Findings (below cap; not adjudicated)

These findings emerged but were either (a) duplicates already in the 15 above, or (b) dropped for cap:
- Assumption F3: "3 tools" claim overstated
- Assumption F8: validation_failed untested
- Assumption F11: "4 use cases" not enumerated in plan body
- Assumption F12: "supersede" verb misuse (status enum is `resolved`, not `superseded`)
- Assumption F13: Architectural debt — coercion at wrong layer
- Security F8: `registeredNames` collision check is process-local
- Failure F9: Change-log immutability note for Phase 3.2

These are addressable in a follow-up plan revision but are not blockers.

---

## Adjudication Summary

| ID | Disposition | Severity | Reason |
|----|-------------|----------|--------|
| F1 | Accept | Critical | Test 4 cannot pass as written — blocker |
| F2 | Accept | Critical | Test 4 schema rejects test input — blocker |
| F3 | Accept | Critical | Ironic violation of the rule the plan ships |
| F4 | Accept | Critical | No auth + no field guards = audit-trail rewrite |
| F5 | Accept | High | Global hammer + log-flood bug |
| F6 | Accept | High | Silent data corruption on edge inputs |
| F7 | Accept | High | Tests pass against mock, fail in production |
| F8 | Accept | High | Bug persists in the very tool that fixes it |
| F9 | Accept | High | Silent fail-through = data loss |
| F10 | Accept (partial) | High | Optional CAS is a footgun; auto-capture or require |
| F11 | Accept | High | Plan must sequence ack → refresh → resolve |
| F12 | Accept | Medium | Lineage claim factually wrong |
| F13 | Accept | Medium | Test count off by 1.7x |
| F14 | Accept | Medium | Test 1 passes by coincidence, not by design |
| F15 | Accept | Medium | `.default()` field missed by helper |

**15 Accept, 0 Reject, 0 Modified.** All findings accepted with strong codebase evidence.

---

## Files to modify after user approval

1. `plan.md` — fix lineage claim, drop "840+", add "Critical Files" note about `_expected_version`
2. `phase-01-red-tdd-tests-first.md` — fix Test 4 (no-op + change-log), add regression test using real schema
3. `phase-02-green-implementation.md` — add deny-list, fix `coerced !== args` bug, recursive walk into patch passthrough, add `ZodDefault` unwrapping, throw on unknown return value
4. `phase-03-refactor-and-closeout.md` — restructure Step 3.1 to use a named script (or E2E test), sequence Step 3.3 as `ack → check_grounding → refresh_fingerprint → resolve`, change "supersede" → "Resolved"

---

## Next Steps

Awaiting user decision. Options:
- **A. Apply all 15 accepted findings to the plan** (modify plan.md + 3 phase files)
- **B. Review each finding one-by-one** before applying
- **C. Reject all, ship plan as-is**
