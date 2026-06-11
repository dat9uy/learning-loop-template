# Red Team Review — Cold-session fail-to-finding plan

**Plan:** `plans/260611-1300-cold-session-fail-to-finding/`
**Reviewed:** 2026-06-11
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 lenses for 4-phase plan)
**Adjudication:** Evidence-verified against the actual codebase; some findings consolidated where reviewers flagged the same root cause.

## Findings (sorted by severity, capped at 15)

### Finding 1: Plan mischaracterizes current code as writing on every run; the refactor's gap-open branch is a no-op or TOCTOU regression
- **Severity:** Critical
- **Reviewer:** Failure Mode Analyst (F1) + Assumption Destroyer (F2, F6, F9)
- **Location:** Plan.md "Eight eliminations" bullet 1; Phase 1 "Architecture" comparison; Phase 1 Step 2 "Green"
- **Flaw:** The plan repeatedly claims the current probe "writes a `finding` on every gap-open run" and frames the refactor as introducing conditional emission. The current code (`cold-session-discoverability.test.cjs:410-440` for L1, `:580-600` for L2) already uses `tryClaimSessionId` (the atomic dedup helper at `core/meta-state.js:535-563`) which returns `{claimed: false, existing: match}` on subsequent runs. The 18-entry "pollution" is the dedup working correctly: 18 runs, 1 logical finding, 17 superseded duplicates. Phase 1's code example shows `readRegistry + early return + writeEntry` (TOCTOU-vulnerable), replacing the known-good atomic helper — a regression of the bug the predecessor plan `260610-1203` shipped `tryClaimSessionId` to fix.
- **Failure scenario:** Implementer follows the visible code shape, not the prose. The gap-open branch becomes a `readRegistry + writeEntry` race that produces duplicate findings under concurrent test runs.
- **Evidence:**
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:410-440` (current L1 probe uses `tryClaimSessionId`)
  - `tools/learning-loop-mcp/core/meta-state.js:535-563` (`tryClaimSessionId` returns `{claimed: false, existing: match}` on dedup)
  - `plans/260610-1203-cold-session-churn-and-cross-compat-fix/plan.md:49-50` (the predecessor plan that shipped the atomic helper)
  - `plans/260611-1300-cold-session-fail-to-finding/phase-01-test-first-refactor-of-l1-l2-probes.md` Step 2 (the TOCTOU code example)
- **Disposition:** Accept
- **Rationale:** The refactor's value (if any) is on the gap-close branch, not the gap-open branch. The plan's prose and code example contradict each other. This must be reconciled before implementation.

### Finding 2: Test infrastructure has no mock framework; the regression-guard test cannot stub the probe as the plan describes
- **Severity:** Critical
- **Reviewer:** Failure Mode Analyst (F1) + Assumption Destroyer (F1)
- **Location:** Phase 1 Step 1 "Red — write the regression-guard test"; Phase 3 Step 2
- **Flaw:** Phase 1 Step 1 says "Stubs the probe to return a synthetic gap-closed result" and Phase 3 Step 2 says the analogous claude-code test "uses a fresh `GATE_ROOT=tempRoot` and stubs the probe." The test file uses `node:test` (`cold-session-discoverability.test.cjs:32-33`); grep for `vi.mock|jest.mock|mockRequire|sinon|proxyquire` returns zero matches. The codebase has no mock framework. The regression-guard test cannot substitute the probe's return value without introducing a new dependency (forbidden by plan `260610-1203`: "No new dependencies").
- **Failure scenario:** Phase 1 cannot produce the promised "red" TDD test as written. The author must either introduce a mocking dep (forbidden) or refactor the probe branches into importable pure functions (an API change the plan does not describe).
- **Evidence:**
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:32-33` (test framework declaration)
  - grep result: zero matches for mock patterns in the test file
  - `plans/260610-1203-cold-session-churn-and-cross-compat-fix/plan.md:46` ("No new dependencies")
- **Disposition:** Accept
- **Rationale:** TDD discipline cannot execute as specified. The plan needs to redefine the regression-guard test as a static-import structural test (assert the source file no longer contains a write-on-pass branch) or extract pure probe functions.

### Finding 3: Probe hardcodes `projectRoot`, not `tempRoot` — regression-guard test as designed will not catch unconditional writes in the real probe
- **Severity:** Critical
- **Reviewer:** Security Adversary (F1)
- **Location:** Phase 1, section "Step 1: Red — write the regression-guard test" (and Step 2 "Gap-closed branch")
- **Flaw:** The plan claims the regression-guard test will use a fresh `GATE_ROOT=tempRoot` and stub the probe to assert the registry is empty on pass. But the actual L1/L2 probe branches hard-code `projectRoot` for `tryClaimSessionId` and `updateEntry`. A regression in the real production probe will not be caught because the test never invokes the real probe against a tempRoot.
- **Failure scenario:** A future contributor re-introduces `await tryClaimSessionId(projectRoot, ...)` inside the L1 gap-open branch. The regression-guard test still passes (it stubs the probe). On every CI run with a real gap, `meta-state.jsonl` grows by 1 entry. The pollution pattern returns.
- **Evidence:**
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:709,723,738,902,916,934` — all use `projectRoot`
  - `plans/260611-1300-cold-session-fail-to-finding/phase-01-test-first-refactor-of-l1-l2-probes.md` Step 1 — claims `GATE_ROOT=tempRoot` without addressing the projectRoot hardcode
- **Disposition:** Accept
- **Rationale:** Even if the mock framework existed, the test would exercise a synthetic probe, not the production code path. The plan must refactor the probe to accept a `root` parameter.

### Finding 4: `meta_state_log_change` is NOT idempotent — re-running the migration script creates a duplicate change-log
- **Severity:** Critical
- **Reviewer:** Security Adversary (F2) + Assumption Destroyer (multiple)
- **Location:** Phase 2, section "Step 2: Write the change-log entry" (idempotency claim)
- **Flaw:** The plan claims "The change-log entry is idempotent (same `change_target` + `change_dimension` returns the existing entry id)." This is FALSE. `meta_state_log_change` always generates a fresh timestamp-based id via `generateId(slugify(change_target))` and calls `writeEntry` unconditionally. There is no lookup of existing change-log entries. Re-running the script creates a duplicate audit-trail entry.
- **Failure scenario:** A contributor runs the migration script twice (e.g., on a rebase). Two change-logs claim the same code change. The 18 supersede calls stamp entries with `consolidated_into: <second-change-log-id>`. Operators querying lineage get 2 candidate change-logs.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js:38` — `const id = generateId(slugify(change_target));`
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js:70` — `await writeEntry(root, entry);` (unconditional)
- **Disposition:** Accept
- **Rationale:** Direct evidence in the tool source. The plan's idempotency claim is a fabrication. The migration script must implement idempotency manually: read the registry, check for an existing change-log with matching `change_target+change_dimension+change_diff.removed`, skip if found.

### Finding 5: Migration script will corrupt 8 `archived` + 1 `resolved` entries by stamping `superseded_at` on them
- **Severity:** High
- **Reviewer:** Security Adversary (F3) + Assumption Destroyer (F3)
- **Location:** Phase 2, section "Step 3: Supersede the 18 historical entries" + Risk row 4
- **Flaw:** The plan claims "All 18 entries are `status: "stale"` per the `260610-1203` churn fix." This is FALSE. Verified count: 8 entries are `archived`, 1 is `resolved` (`meta-260608T1410Z-...`), 1 is `stale` (claude-code, line 43), and 8 are `stale` (cold-session L2). The plan's filter `status !== "active"` would match archived/resolved. The `meta_state_supersede` tool unconditionally sets `status: "superseded"` via patch, stamping `superseded_at` on top of existing `archived_at`/`resolved_at`. The 9 already-terminal entries get a second terminal status, corrupting the compaction invariant (`TERMINAL_STATUSES` check in `core/meta-state.js:328`).
- **Failure scenario:** After migration, 8 entries have BOTH `archived_at` AND `superseded_at`. The compaction logic in `core/meta-state.js:328` (`TERMINAL_STATUSES.has(entry.status) && age > COMPACTION_AGE_MS`) still works for `superseded` entries, but the `archived_at` timestamp now misrepresents the entry's true lifecycle end. Audit queries that compute "how long was this archived" return the supersede delta, not the archive delta.
- **Evidence:**
  - `meta-state.jsonl:18,60,61,487,488,501,502,506` — `status: "archived"` (8 entries)
  - `meta-state.jsonl:58` — `status: "resolved"` (1 entry)
  - `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js:42-50` — unconditional `status: "superseded"`
  - `tools/learning-loop-mcp/core/meta-state.js:6` — `TERMINAL_STATUSES = ["auto-resolved", "resolved", "superseded"]` (does not include `archived`; but the 7-day compaction in `updateEntry` is keyed on `TERMINAL_STATUSES.has`)
  - `plans/260611-1300-cold-session-fail-to-finding/phase-02-migrate-18-historical-entries.md` Risk row 4 — "all 18 are stale" claim
- **Disposition:** Accept
- **Rationale:** The "mostly stale" claim is factually wrong (only 9 of 18 are stale; 8 are archived; 1 is resolved). Superseding already-terminal entries creates double-terminal state. The plan must filter for `status === "stale"` only (or `status === "stale" || status === "reported"`), and skip archived/resolved.

### Finding 6: Migration script requires `OPERATOR_MODE=1` but the plan does not document the env-var requirement or the role-system gap
- **Severity:** High
- **Reviewer:** Security Adversary (F4)
- **Location:** Phase 2, section "Step 3: Supersede the 18 historical entries" (entire phase 2)
- **Flaw:** `meta_state_supersede` (line 17 of `meta-state-supersede-tool.js`) gates on `process.env.OPERATOR_MODE === "1"`. The plan never specifies that the migration script must be run with `OPERATOR_MODE=1`, and AI agents cannot set this env var (it's the operator's role). The plan's "one-shot" framing assumes the agent runs the script.
- **Failure scenario:** An AI agent runs `node scripts/migrate-cold-session-pollution.mjs` without `OPERATOR_MODE=1`. The `meta_state_log_change` call succeeds (no operator gate). The 18 `meta_state_supersede` calls all return `{superseded: false, reason: "operator_role_required"}`. The change-log is written but no entries are superseded. Subsequent operator runs find an orphan change-log pointing at non-superseded entries.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js:17-21` — `if (process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true")` returns operator_role_required
  - `plans/reports/brainstorm-260602-meta-state-lifecycle-tidy.md:181` — operator-mode role system "explicitly deferred"
  - `plans/260611-1300-cold-session-fail-to-finding/phase-02-migrate-18-historical-entries.md` — no mention of `OPERATOR_MODE`
- **Disposition:** Accept
- **Rationale:** The plan's "agent runs the script" framing is a role-confusion vulnerability. The script must either (a) require `OPERATOR_MODE=1` and abort with a clear error if unset, or (b) be reframed as a two-step operator workflow (operator creates change-log via tool, runs script for supersede).

### Finding 7: Removing the soft-delete branch on gap-close leaves active findings unmanaged in the live registry, blocking the rule
- **Severity:** High
- **Reviewer:** Security Adversary (F6) + Failure Mode Analyst (multiple)
- **Location:** Phase 1, section "Step 2: Green — refactor the probe" (Gap-closed branch deletion)
- **Flaw:** The current code's gap-close branch does two things: (1) looks up the L1/L2 finding matching the runtime+layer, (2) soft-deletes it. The plan deletes this entire branch and replaces with `return`. After the refactor, if the L1 probe detects a gap-open on run N (writes a `reported` finding) and then the gap closes on run N+1, the new code returns silently. The active finding is never cleaned up. The active finding blocks `meta_state_resolve` of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` via the rule. The "no new writes" goal conflicts with the rule's "no active findings" invariant.
- **Failure scenario:** A test run detects an L1 gap. The probe writes a `reported` finding to projectRoot. The test passes (the gap-open branch is still reached). Next run: the L1 catalog is populated. The gap-closed branch fires. Per Phase 1 Step 2, the new code returns silently. The active finding from run N is orphaned: the test no longer manages it, and `checkResolutionEvidence` blocks `meta_state_resolve` of the parent finding. The registry is "cleaner" (no new writes) but has stale active findings that block the rule.
- **Evidence:**
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:705-732` — current L1 gap-closed branch with soft-delete
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:893-927` — current L2 gap-closed branch with soft-delete
  - `tools/learning-loop-mcp/core/gate-logic.js:678-720` — `checkResolutionEvidence` Branch 2 blocks resolution on any active finding with `subtype === "mcp-client-loading"` + matching session_id
  - `plans/260611-1300-cold-session-fail-to-finding/plan.md` Goals row 1 — "Soft-delete branch removed" listed as a feature
- **Disposition:** Accept
- **Rationale:** The "no new writes" goal and the rule's "no active findings" invariant are in direct conflict. The plan's "passive lifecycle" claim is not backed by any mechanism that cleans up active findings when the gap closes. The plan must either (a) keep a gap-close cleanup (e.g., a single `meta_state_resolve` or `meta_state_sweep` call) or (b) reframe the goal: passive lifecycle means the registry auto-cleans via TTL/operator action, not that the test stops managing its own findings.

### Finding 8: `claude-code-mcp-loading.test.cjs` does NOT use `tryClaimSessionId`; the cross-CLI parity claim is false
- **Severity:** High
- **Reviewer:** Assumption Destroyer (F10)
- **Location:** Plan.md "Cross-CLI parity" goal; Phase 3 Step 2
- **Flaw:** Plan.md says: "Cross-CLI parity: the same refactor applies to `claude-code-mcp-loading.test.cjs`; both probes share the same evidence contract via `tryClaimSessionId`." But `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:198-244` uses `writeEntry` + `readRegistry.find` (the TOCTOU pattern the predecessor plan fixed for the cold-session test only). The parity claim is FALSE.
- **Failure scenario:** Phase 3 Step 2 applies the "refactor" to the claude-code test, which means porting it to `tryClaimSessionId` (a behavior change the plan does not call out as a primary deliverable). The "Phase 3, 1h effort" estimate does not include this scope.
- **Evidence:**
  - `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:198-244` — uses `writeEntry` + `readRegistry.find`, NOT `tryClaimSessionId`
  - `plans/260610-1203-cold-session-churn-and-cross-compat-fix/plan.md:15-17` — the predecessor plan that fixed this for cold-session only
- **Disposition:** Accept
- **Rationale:** The cross-CLI parity claim is factually wrong. Either the plan must expand Phase 3's scope (and update the effort estimate) or defer the parity refactor to a follow-up plan.

### Finding 9: 18-entry count includes 1 claude-code entry (line 43) and 1 `meta-260608T1410Z-...` (line 58, no session_id) that the plan's filter would mis-handle
- **Severity:** Medium
- **Reviewer:** Security Adversary (F7)
- **Location:** Plan.md Overview paragraph "18 historical entries" and Phase 2 risk assessment
- **Flaw:** Line 43 has `session_id: "test-claude-code-mcp-client-loading"` (the only entry from the claude-code probe). Line 58 (`meta-260608T1410Z-...`) has NO session_id (it's a `loop-anti-pattern` finding, not a test-emitted finding; the plan should not migrate it). The plan's Risk row 4 filter `subtype === "mcp-client-loading" && session_id === "test-cold-session-mcp-client-loading" && status !== "active"` excludes line 43 (claude-code) but includes line 58 (no session_id, but matches `subtype`). The filter is inconsistent with the plan's narrative.
- **Failure scenario:** The script's filter excludes line 43 (claude-code). 18 becomes 17. The plan's success criterion "all 18 (or current count) historical entries superseded" fails. Operator runs a second pass for the claude-code entry, fragmenting the lineage.
- **Evidence:**
  - `meta-state.jsonl:43` — `session_id: "test-claude-code-mcp-client-loading"`
  - `meta-state.jsonl:58` — `meta-260608T1410Z-...` (no session_id, status: `resolved`, subtype: `mcp-client-loading`)
  - `plans/260611-1300-cold-session-fail-to-finding/phase-02-migrate-18-historical-entries.md` Risk row 4 — filter excludes claude-code
- **Disposition:** Accept
- **Rationale:** The plan must explicitly decide: (a) migrate all 18 (including line 58) with a permissive filter, (b) migrate 17 cold-session + 1 claude-code with separate filter logic, or (c) migrate only 8 stale entries (skip 8 archived + 1 resolved). The current plan's filter is inconsistent with the "18 entries" narrative.

### Finding 10: `applies_to.schemas: ['core/gate-logic.js#checkResolutionEvidence']` uses `#anchor` suffix inconsistent with the 6 prior change-logs
- **Severity:** Medium
- **Reviewer:** Assumption Destroyer (F5)
- **Location:** Phase 2, Step 2 "Write the change-log entry"
- **Flaw:** The plan's change-log input uses `applies_to.schemas: ['core/gate-logic.js#checkResolutionEvidence']` (with `#anchor`). The `metaStateChangeEntrySchema` does not strip `#anchor` from `applies_to.schemas` values; `stripEvidenceAnchor` is only called inside `checkResolutionEvidence`. All 6 prior change-logs with `applies_to.schemas` use plain paths without `#anchor`.
- **Failure scenario:** Future drift queries that use the schemas field for path resolution will treat `core/gate-logic.js#checkResolutionEvidence` as a literal file path. The file does not exist (the actual file is `tools/learning-loop-mcp/core/gate-logic.js`). The grounding check returns `code_ref_missing`, which trips `rule-no-orphaned-evidence` (pattern `*`).
- **Evidence:**
  - `meta-state.jsonl:1,2,3,22,24,50` — all 6 prior `applies_to.schemas` use plain paths
  - `tools/learning-loop-mcp/core/gate-logic.js:681` — `stripEvidenceAnchor` is only used in `checkResolutionEvidence`
- **Disposition:** Accept
- **Rationale:** Direct evidence: convention is plain paths. `#anchor` is for `evidence_code_ref`, not for `applies_to.schemas`. Trivial fix.

### Finding 11: Loop-design patch via `meta_state_patch` will silently fail if return value is not checked
- **Severity:** Medium
- **Reviewer:** Security Adversary (F8) + Assumption Destroyer (F8)
- **Location:** Phase 4, section "Step 2: Patch the loop-design"
- **Flaw:** The plan calls `meta_state_patch` with CAS via `_expected_version`. The handler returns `{patched: false, reason: "version_mismatch"}` on CAS failure (no exception). The plan's pseudocode does not show a return-value check. The plan also does not specify how to read the current version (the loop-design entry at `meta-state.jsonl:533` has no `version` field).
- **Failure scenario:** An agent runs `meta_state_patch` and gets `version_mismatch`. The agent continues to verification. `loop_describe` shows the design with `status: "active"`. The plan's success criteria are silently unmet. The agent reports success because the tool "succeeded" (no exception).
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:60-65` — handler returns `version_mismatch` (no exception)
  - `meta-state.jsonl:533` — loop-design entry has no `version` field
- **Disposition:** Accept
- **Rationale:** The plan must add (a) an explicit assertion on the return value, and (b) a "fetch current version" sub-step (or use `meta_state_list` to read the version before patching).

### Finding 12: Migration script's "checkpoint" in `migrated-ids.txt` is a data-integrity hazard
- **Severity:** Medium
- **Reviewer:** Security Adversary (F9)
- **Location:** Phase 2, Risk Assessment row 2
- **Flaw:** The plan proposes a checkpoint file `migrated-ids.txt` in the script's tempdir. The tempdir may be cleaned by the OS (e.g., `/tmp` on reboot), losing migration progress. The checkpoint is not git-tracked, so an operator cannot audit progress. The checkpoint is local to the script; re-running on a different machine loses state. `meta_state_supersede` always re-stamps `superseded_at`, so re-running produces new timestamps and the audit trail is no longer chronologically correct.
- **Failure scenario:** CI job processes 12 of 18 entries, then is preempted. Tempdir destroyed. Next run reads registry, sees 12 already-superseded, but checkpoint is empty, so re-attempts all 18. 6 entries get a second `superseded_at` timestamp; the audit trail is inconsistent.
- **Evidence:**
  - `plans/260611-1300-cold-session-fail-to-finding/phase-02-migrate-18-historical-entries.md` Risk row 2 — proposes "migrated-ids.txt file in the script's tempdir" with no git-tracked alternative
  - `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js:40-50` — patch always sets `superseded_at: now`
- **Disposition:** Accept
- **Rationale:** The checkpoint must be registry-resident (e.g., a marker field on the entry) or use `meta_state_batch` for atomic-claim semantics, not a tempdir file.

### Finding 13: Migration script at `scripts/migrate-cold-session-pollution.mjs` bypasses all preflight, write, and records gates
- **Severity:** Medium
- **Reviewer:** Security Adversary (F5)
- **Location:** Phase 2, "Related Code Files" (Create)
- **Flaw:** The plan creates a one-shot script at `scripts/migrate-cold-session-pollution.mjs` that mutates `meta-state.jsonl` via the MCP server. Neither the write-gate (line 53-156 of `write-gate.js`) nor the bash-gate (line 19-30 of `bash-gate.js`) protects `scripts/**` paths. The script can be created, modified, or run without any gate scrutiny.
- **Failure scenario:** An attacker (or careless contributor) modifies the script to call `meta_state_resolve` on an arbitrary finding id (e.g., the target the rule gates). The script runs in a normal agent session; the bash gate does not block. The 18 supersede calls run alongside the malicious resolve. The attacker's modification is silent because the script is "one-shot, deleted after use."
- **Evidence:**
  - `tools/learning-loop-mcp/hooks/write-gate.js:60-148` — protected paths are `records/**`, `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, `.claude/coordination/.loop-preflight-*`, `.factory/coordination/.loop-preflight-*`; explicitly allows "plans/, docs/, .claude/, .factory/, tools/, unknown" — `scripts/` falls into "everything else"
  - `tools/learning-loop-mcp/hooks/bash-gate.js:19-30` — `PATH_WRITE_PATTERNS` does not include `scripts/**`
- **Disposition:** Accept
- **Rationale:** A one-shot script that mutates the audit-trail-critical registry should be either operator-only (with explicit `OPERATOR_MODE=1` guard per Finding 6) or protected by a new gate pattern. The plan should add a script-level guard that aborts if `OPERATOR_MODE !== "1"`.

### Finding 14: Plan omits the operator-capture annotation that AGENTS.md documents as a forward decision
- **Severity:** Medium
- **Reviewer:** Security Adversary (F10)
- **Location:** Phase 2, section "Step 2: Write the change-log entry"
- **Flaw:** AGENTS.md § Open Forward Decisions #3 describes a `loop_discovered` vs `operator_ack` annotation on change-log entries as an open schema decision. The change-log schema has no such field. The plan's change-log payload does not include either field. If the operator-capture guard later lands, this plan's change-log will be a backfill case — but `meta_state_patch` rejects change-log patches (immutable).
- **Failure scenario:** Six months from now, the operator-capture guard is added. A query of "all operator_ack change-logs related to test refactors" returns nothing for this plan's change-log. The annotation can never be backfilled (change-logs are immutable).
- **Evidence:**
  - `AGENTS.md` "Open Forward Decisions" #3
  - `tools/learning-loop-mcp/core/meta-state.js:89-130` — `metaStateChangeEntrySchema` has no `loop_discovered`/`operator_ack` field
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:19-20` — change-log entries are immutable
- **Disposition:** Reject
- **Rationale:** The annotation is an open forward decision, not a current requirement. The plan cannot be faulted for not implementing a schema field that has not shipped. Acknowledge in the journal as a known gap, but not a plan defect.

### Finding 15: Test 4 rewrite creates a verification ordering coupling between Phase 1 and Phase 2
- **Severity:** Medium
- **Reviewer:** Failure Mode Analyst (F7) + Assumption Destroyer (F7)
- **Location:** Phase 1 Step 3 + Phase 2 Step 4
- **Flaw:** Phase 1 Step 3 rewrites test 4 to assert "finding is still `status: 'active'`" (the no-op invariant). Phase 2 Step 4 verifies the migration by running `pnpm test`. If `pnpm test` is run between Phase 1 and Phase 2's migration (e.g., as a CI step), test 4 still passes (the rewrite is in place). But if test 4 is run BEFORE Phase 1 lands (during Phase 1's pre-rewrite red-green cycle), it asserts `status === "stale"` (the old behavior) and fails. The plan does not specify the "do not run `pnpm test` between Phase 1 commit and Phase 2 commit" constraint.
- **Failure scenario:** A CI job runs `pnpm test` after Phase 1's test 4 rewrite but before Phase 2's migration. Test 4 passes (the rewrite is in). The job then runs Phase 2's migration. The migration marks 18 entries as `superseded`. The next `pnpm test` (in Phase 3) runs the regression-guard test in Phase 3 Step 2, which is hermetic and unaffected. But the plan does not document this ordering invariant.
- **Evidence:**
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:530-560` — current test 4 asserts `status === "stale"`
  - `plans/260611-1300-cold-session-fail-to-finding/phase-01-test-first-refactor-of-l1-l2-probes.md` Step 3 (rewrites test 4)
  - `plans/260611-1300-cold-session-fail-to-finding/phase-02-migrate-18-historical-entries.md` Step 4 (verifies via `pnpm test`)
- **Disposition:** Accept
- **Rationale:** Minor. The plan should add an explicit "do not run `pnpm test` between Phase 1 commit and Phase 2 commit — test 4's assertion is shape-locked to the no-op invariant once Phase 1 lands." This is a doc fix, not a code fix.

## Rejected (evidence-free or out-of-scope)

- **Assumption Destroyer returned "Plan is up-to-date"** with no findings; the empty result was treated as a no-op. The two effective reviewer reports (Security Adversary + Failure Mode Analyst) yielded 20 raw findings, deduplicated to 15.

## Whole-Plan Consistency Sweep

After reviewing all 5 plan files, the following contradictions are unresolved:

1. **Phase 1 Architecture code example vs prose**: The code example shows `readRegistry + early return + writeEntry`; the prose says "uses `tryClaimSessionId`." These are mutually exclusive implementations. **Resolved by Finding 1 (Accept).**

2. **Plan claims "all 18 are stale" but actual count is 8 archived + 1 resolved + 9 stale**: The Risk row 4 in Phase 2 contradicts the verified state of `meta-state.jsonl`. **Resolved by Finding 5 (Accept).**

3. **"Pass path: write nothing" + "soft-delete branch removed" + "rule still gates resolution on active findings"**: These three claims are mutually exclusive. Either the test must still manage the lifecycle (resolving active findings on gap-close) or the rule's evidence contract must change. The plan does not address this. **Resolved by Finding 7 (Accept).**

4. **`applies_to.schemas` convention**: The plan uses `#anchor` suffix; 6 prior change-logs do not. **Resolved by Finding 10 (Accept).**

5. **"Cross-CLI parity" claim**: The plan claims `claude-code-mcp-loading.test.cjs` uses `tryClaimSessionId`; the test file uses `writeEntry + readRegistry.find` instead. **Resolved by Finding 8 (Accept).**

No additional contradictions found beyond the 15 findings above.

## Summary

- **Total findings:** 15 (cap reached)
- **Accepted:** 14
- **Rejected:** 1 (Finding 14, operator-capture guard is an open decision)
- **Severity breakdown:** 4 Critical, 4 High, 6 Medium, 0 Low
- **Files reviewed:** 5 (plan.md + 4 phase-*.md)
- **Files read for evidence:** `meta-state.jsonl` (18 relevant lines), `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js`, `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js`, `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`, `tools/learning-loop-mcp/core/meta-state.js`, `tools/learning-loop-mcp/core/gate-logic.js`, `tools/learning-loop-mcp/hooks/bash-gate.js`, `tools/learning-loop-mcp/hooks/write-gate.js`, `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`, `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`

## Key Risks Addressed

1. The refactor's code example introduces a TOCTOU race that the predecessor plan specifically fixed.
2. The regression-guard test cannot be written as specified (no mock framework).
3. The migration script's idempotency claim is factually false.
4. The migration script will corrupt 9 already-terminal entries.
5. The role system gap (`OPERATOR_MODE=1`) is undocumented in the plan.
6. The "no new writes" goal conflicts with the rule's "no active findings" invariant.
7. The cross-CLI parity claim is factually wrong.
