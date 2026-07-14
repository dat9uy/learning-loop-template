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
grep -rn "consult-checklist\|resolution-evidence-required" tools/ .factory/ .claude/ 2>/dev/null \
  | grep -v node_modules \
  | grep -vE "(gate-decision\.log|gate-log\.jsonl|runtime-state\.jsonl)"
```

Allowed residual: `.claude/coordination/gate-log.jsonl` / `.factory/coordination/gate-decision.log`
historical lines (append-only audit logs — do not rewrite). Confirm any residual is only in those.

## 5.3 Registry state

```
grep -o '"pattern_type":"[^"]*"' meta-state.jsonl | sort | uniq -c
```

Expect: 4 `agent-checklist`, 2 `determinism-checklist`, 3 `regex`, 2 `glob`. Zero old values.

```
grep '"id":"rule-no-orphaned-evidence"' meta-state.jsonl | grep -o '"enforcement":"[^"]*"'
```

Expect `"enforcement":"gate"`.

## 5.4 Gate presence (the migration-safety check)

Confirm the renamed rules are NOT warn-and-skipped by `loadPromotedRules`. Easiest empirical check:
call `loop_describe({ tier: "warm" })` (or run the warm-tier test) and confirm:
- the warm tier `rule_count` includes all 11 rules (no drop from 11);
- H6 emits **no** "consult-checklist rule … has no corresponding PROCESS_HINTS row" warning for any
  of the 4 `agent-checklist` rules (the H6 check now matches `pattern_type === "agent-checklist"`
  and the PROCESS_HINTS rows cite the rule ids, which did not change).

And confirm `meta_state_resolve` consult-gate still fires `rule-no-orphaned-evidence`: the existing
`gate-resolution-evidence` test (renamed `gate-determinism-checklist.test.js`) covers this — its
pass in 5.1 is the proof.

## 5.5 Commit

One atomic commit covering phases 1–4. Conventional commit, no AI references, no plan/phase IDs in
the message. Suggested subject: `refactor(meta-state): rename rule pattern_type vocabulary to
state-axis names`. Body enumerates the enum rename + the `rule-no-orphaned-evidence` enforcement
relabel. Do not commit `meta-260714T1334Z`'s prospective fix (out of scope).

## Rollback

If 5.1/5.4 reveal a problem too large to fix in-commit, `git checkout -- .` (working tree was dirty;
nothing committed yet). The registry has no server-side state to roll back — `meta-state.jsonl` is a
tracked file restored by checkout.