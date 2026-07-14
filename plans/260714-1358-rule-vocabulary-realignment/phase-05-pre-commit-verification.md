---
phase: 5
title: "pre-commit-verification"
status: pending
effort: ""
dependencies: [1, 2, 3, 4, 6]
---

# Phase 05 — verify

Gate before the atomic commit. All of phases 1–4 must be done (working tree dirty with all changes)
before running this.

## 5.1 Test suite (use the structured endpoint, not raw stdout)

Per the procedure `meta-260714T1334Z` describes (which this session is now dogfooding, even though
the formal PROCESS_HINTS row is deferred): after `pnpm test`, read
`.test-logs/vitest-results.json`. If `numFailedTests > 0`, iterate
`testResults[].assertionResults[]` where `status === "failed"` and read only `{name, fullName,
location, failureMessages}`. Do NOT grep raw vitest stdout or re-read passing tests.

Run:

```
pnpm test
```

Then inspect `.test-logs/vitest-results.json`: expect `numFailedTests === 0`. If > 0, the failing
assertions are almost certainly a missed string reference (a test or source file still using the old
enum) — fix it, re-run. Do not weaken tests.

## 5.2 Grep guard for residual old vocabulary

Must return **zero source hits** (historical logs and plans/journals excluded):

```
grep -rn "consult-checklist\|resolution-evidence-required" tools/ .factory/ .claude/ meta-state.jsonl 2>/dev/null \
  | grep -v node_modules \
  | grep -vE "(gate-decision\.log|gate-log\.jsonl|runtime-state\.jsonl)"
```

**`meta-state.jsonl` is INCLUDED in the grep scope** (red-team Finding 1). The 6 records' `description`
field also carries the old `Pattern type=...` literal that `meta_state_promote_rule` baked in at line 172.
Phase 2's "How to edit" §"Description field rewrite" is responsible for rewriting those literals; §5.2
catches any missed line.

Allowed residual: `.claude/coordination/gate-log.jsonl` / `.factory/coordination/.gate-decision.log`
historical lines (append-only audit logs — do not rewrite). Confirm any residual is only in those.

## 5.3 Registry state

```
grep -o '"pattern_type":"[^"]*"' meta-state.jsonl | sort | uniq -c
```

Expect: **7 `agent-checklist`** (4 original + 3 reclassified advisory per validation Q3),
**2 `determinism-checklist`**, **2 `regex`** (gate-enforced only: `rule-no-new-artifact-types`,
`rule-project-skill-boundary`), **0 `glob`**. Zero old values (`consult-checklist`,
`resolution-evidence-required`, and any `glob` keys).

```
grep '"id":"rule-no-orphaned-evidence"' meta-state.jsonl | grep -o '"enforcement":"[^"]*"'
```

Expect `"enforcement":"gate"`.

## 5.4 Gate presence (the migration-safety check)

Confirm the renamed rules are NOT warn-and-skipped by `loadPromotedRules`. Two empirical checks
must BOTH pass (red-team Finding 8: stale-warning window is undetectable by the warm-tier check
alone, so 5.3 + 5.4 are joined):

**5.4a Registry state (from §5.3, repeated here for atomicity):**
- `grep -o '"pattern_type":"[^"]*"' meta-state.jsonl | sort | uniq -c` shows 7 `agent-checklist`,
  2 `determinism-checklist`, 2 `regex` (gate-enforced), 0 `glob`. Zero old values.
- `rule-no-orphaned-evidence` shows `enforcement:"gate"`.

**5.4b Warm tier check:**
- `loop_describe({ tier: "warm" })` returns:
  - `rule_count === 9` (NOT 11 — `loop-introspect.js:477` filters `resolution-evidence-required`,
    which is now `determinism-checklist` and still filtered. The 2 determinism-checklist records
    are not in warm tier by design — they live in the resolve consult-gate instead.
    Post-validation Q3 distribution: 7 `agent-checklist` + 2 `regex` (gate-enforced) = 9 returned).
  - `warnings: []` — H6 emits no "agent-checklist rule … has no PROCESS_HINTS row" warning for any
    of the **7** `agent-checklist` rules (4 original + 3 reclassified per validation Q3 — H6
    substring check on `rule.id` references unchanged rule ids like
    `rule-runtime-agnostic-features`, `rule-short-slug-for-risk-records`, etc.).

If 5.4a passes but 5.4b fails, the registry was edited but the running code is stale. See §5.5b.
If 5.4b passes but 5.4a fails, the running code is fresh but the registry is stale. Phase 2 was
incomplete; do not commit.

And confirm `meta_state_resolve` consult-gate still fires `rule-no-orphaned-evidence`: the existing
`gate-resolution-evidence` test (renamed `gate-determinism-checklist.test.js`) covers this — its
pass in 5.1 is the proof.

## 5.5 Commit

One atomic commit covering phases 1–4. Conventional commit, no AI references, no plan/phase IDs in
the message. Suggested subject: `refactor(meta-state): rename rule pattern_type vocabulary to
state-axis names`. Body enumerates the enum rename + the `rule-no-orphaned-evidence` enforcement
relabel. Do not commit `meta-260714T1334Z`'s prospective fix (out of scope).

## 5.5b MCP-server restart gate (post-commit, red-team Finding 13)

Atomic git commit alone is **insufficient**. The per-process `promotedRulesCache`
(`tools/learning-loop-mastra/core/gate-logic.js:546`, keyed on `mtime + size`) holds the OLD
`gate-logic.js` literal compares (`=== "consult-checklist"`) in memory until the MCP server
restarts. Live sessions calling `meta_state_resolve` continue to run the OLD code, which falls
through silently against the NEW registry values.

**Required post-commit deploy step:**

1. Restart the MCP server (kill existing process + restart, or `pkill -f mastra/server.js` then
   `pnpm mastra:dev` per the local runbook).
2. Alternatively, if the runtime exposes `invalidateCache(root)`, call it.
3. Verify: `loop_describe({ tier: "warm" })` returns `rule_count === 9` AND `warnings: []` from a
   fresh session. The 5.4b check covers this — repeat it across the restart boundary.

If the MCP server is NOT restarted, the rename appears to land but the 6 renamed rules are
silently skipped in gate enforcement.

## Rollback

If 5.1/5.4 reveal a problem too large to fix in-commit, `git checkout -- .` (working tree was dirty;
nothing committed yet). The registry has no server-side state to roll back — `meta-state.jsonl` is a
tracked file restored by checkout.