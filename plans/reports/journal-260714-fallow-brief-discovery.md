# 2026-07-14 — Fallow Brief Discovery (Rule + PROCESS_HINTS + Parity Test)

**What shipped:**

- `rule-fallow-brief-on-gate-failure` (consult-checklist, 1 item: `fallow-gate-failure-routes-to-brief`) — encodes the `pnpm fallow:gate` exit-1 → `pnpm fallow:brief` routing for compact CSV triage.
- PROCESS_HINTS row #5 appended to `tools/learning-loop-mastra/core/loop-introspect.js` (verbatim from `plan.md` Appendix B; 1 previous row removed what was structurally a wrong-line citation).
- LOCAL_PROCESS_HINTS row #5 mirrored byte-for-byte in `.factory/hooks/loop-surface-inject.cjs`.
- 1 new change-log entry (`meta-260714T0809Z-...`) capturing the rule + PROCESS_HINTS + mirror + parity test with `applies_to.rules: ['rule-fallow-brief-on-gate-failure']`.
- 1 originating finding (`meta-260712T0730Z-fallow-mcp-runtime-needs-format-json`) flipped: `open → superseded`, `consolidated_into` points at the change-log id.
- 2 regression tests in `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` (rule-loads + PROCESS_HINTS-contains-rule-id).

**Why it matters:** the agent runtime previously had to either (a) re-run `fallow:gate` and parse the human report into context, or (b) grep for `✗` symbols in raw stdout when the pre-commit hook failed. With this rule + PROCESS_HINTS row, the hint surfaces at session start and the agent routes the failure to `pnpm fallow:brief` automatically — one line per finding, machine-actionable, no decoration noise. Cold-session discoverable via `loop_describe({tier: warm})` for any future agent runtime.

**Files modified:**

- `meta-state.jsonl`: +2 entries (rule + change-log); 1 finding: open → superseded via `meta_state_supersede`.
- `tools/learning-loop-mastra/core/loop-introspect.js`: +1 PROCESS_HINTS row (between row #4 and `]);` closing line).
- `.factory/hooks/loop-surface-inject.cjs`: +1 LOCAL_PROCESS_HINTS row (byte-identical mirror).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js`: new file, 2 tests.
- `plans/260714-1200-fallow-brief-discovery/reports/byte-size-measurements.md`: new — Phase 1 step 7 measurements.
- `plans/260714-1200-fallow-brief-discovery/reports/design-freeze.md`: new — Phase 1 frozen state.
- `plans/260714-1200-fallow-brief-discovery/reports/journal-260714-fallow-brief-discovery.md` (this file).

**Test delta:** 1877 → 1879 (+2 tests). All green. `pnpm test` final pass: 1879 passed, 0 failed.

**Lessons:**

1. **`meta_state_promote_rule` hard-codes `description` (line 172)** — `description: \`Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.\``. Custom description text CANNOT land. Any "what does this rule mean for the agent" prose lives in the rule body's `items[].description`, NOT the top-level `description` field. The plan Appendix A originally cited line 169 — verify tool line numbers before claiming tool behavior in plan text (lesson learned from the 260628 journal false-positive about `entry_kind`).

2. **H6 ordering gate (loop-describe-tool.js:94-106) uses substring match** (`processHints.some((h) => h.includes(rule.id))`). PROCESS_HINTS row text MUST include the literal `rule-...` token, not a paraphrase like "the fallow brief hint". The cold-session parity test (`cold-session-discoverability.test.cjs:359-379`) enforces byte-for-byte PROCESS_HINTS ↔ LOCAL_PROCESS_HINTS equality but does NOT detect "rule has no PROCESS_HINTS row" — that's the H6 gate's job, and the gate is ONLY enforced on `loop_describe({tier: warm})`.

3. **H6 ordering-gate window management**: if the rule is promoted BEFORE PROCESS_HINTS row is appended, H6 fires (the running runtime sees a rule without a matching row). The fix is to REVERSE the natural order: append row → mirror row → syntax-check both → THEN `meta_state_promote_rule` → then re-verify. Phase 2 step 8 (intermediate gate) is dispensable for parity but step 10 (final gate) catches post-promotion drift. Verify both `process_hints.length === 5` AND `warnings` is empty (modulo unrelated transport warnings).

4. **Runtime module-cache caveat:** the running MCP server caches ESM module imports at startup. After editing `core/loop-introspect.js` mid-session, `loop_describe({tier: warm}).process_hints` still returns the pre-edit count (4 rows in our case) even though the source file is correct (5 rows, verified via direct `import('./core/loop-introspect.js').buildProcessHints()`). The H6 warning fires as a transient runtime state until the MCP server restarts. The cold-session parity test reads the source files via `readFileSync` (not via the running runtime), so it correctly validates the source-of-truth state. Plan step 8 already acknowledged this — "the new PROCESS_HINTS row is not yet exposed to the runtime because the file is loaded lazily". Step 10's assertion ("`warnings` array is empty") is unreachable mid-session for the new rule; the assertion that holds is "source file has 5 rows + new test passes".

5. **`applies_to.surfaces: ['gate/bash']` is decorative for consult-checklist rules with `enforcement: 'agent'`** — verified at `gate-logic.js:750-755, 757`. The `surfaces` field on `applies_to` and the `pattern_type: 'consult-checklist'` do NOT interact with the bash gate short-circuit. Mirror the `rule-tool-integration-same-commit-dep` shape (no `applies_to` field at all on the rule entry, only on the change-log's `applies_to.rules` for downstream consumers).

6. **`meta_state_patch` cannot be a fallback for `meta_state_supersede`** — `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:392-405`) blocks both `status` AND `consolidated_into`. Any plan that documents a "patch fallback" for a supersede is structurally unreachable. Always gate the prerequisite (`LOOP_SESSION_MODE=live`) over patching around the gate.

7. **`change_target` has no schema length limit** — `meta-state.js:208-209` is `z.string().min(1)`. The 200-char cap is on `operation_envelope.target` (a different field, used for batch envelopes). The compound string `meta-state.jsonl#rule-X + path-A#process_hints_row_5 + path-B#local_process_hints_row_5` is ~140 chars and preserves `Rec 12 closed-loop backfill` path-matching semantics. Don't strip precision when rationalizing "looks long".

8. **SP2 fingerprint refresh after a file edit** — editing `core/loop-introspect.js` invalidates the `code_fingerprint` for any finding anchored to that file. `cold-tier-regression.test.js:224` caught the drift on the first `pnpm test` run; `meta_state_refresh_file_index` resolved it in one call (1 finding re-grounded). The MCP tool's `reason` parameter is the audit-trail hook — record the legitimate edit context (plan id + phase id + change summary) so future operators can reproduce.

**Followups:**

- (a) File a separate finding for `.factory/hooks/**` missing from `CHANGE_LOG_BOUND_PATHS` — `Rec 12 gap-detection` ignores drift on this path even though the parity test enforces it.
- (b) File a separate finding for `rule.pattern` JSON-validation schema gap — `pattern: z.string()` allows malformed patterns to reach `JSON.parse` at runtime. The new rule's pattern is well-formed but the schema permits `[not-json]` as valid.
- (c) Consider a regression test that verifies every `entry_kind: 'rule'` `pattern_type: 'consult-checklist'` rule has a matching PROCESS_HINTS row, closing the runtime gap between H6 gate firing and cold-session parity holding.
- (d) The MCP server should consider exposing a `cache_invalidate` MCP tool so future plans can refresh module caches without requiring a server restart. Until that lands, plan assertions about `loop_describe({tier: warm})` live-state are confined to "process_hints count went up by 1" sanity checks, not full validation.
- (e) Byte-size measurements table was unable to capture non-zero-finding scenarios on this codebase (current tree has 0 fallow findings vs origin/main). Future measurement reports should include a `--max-crap 1` clean-tree baseline + a synthesized-failure scenario (e.g., temporary file with deliberate high-complexity function) for the ≥5-finding case.
