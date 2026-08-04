---
phase: 1
title: "Gate-Enforced Bypass Rule"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Gate-Enforced Bypass Rule

## Overview

TDD: write the hook-level regression test first (seeded-registry spawn pattern), then promote the gate-enforced regex rule into the live registry so `git commit --no-verify` / `core.hooksPath` bypasses are denied in all three runtimes.

## Requirements

- Functional: bash-gate denies `git commit --no-verify`, `git commit -n`, `git -c core.hooksPath=/dev/null commit ...`, and `git config core.hooksPath /dev/null`-style mutations aimed at disabling hooks; denial names the rule_id.
- Functional: clean `git commit -m ...`, snapshot refresh (`pnpm test:one -u`), and all loop CLI invocations pass silently.
- Non-functional: regex passes `isSafeRegexPattern` (no nested quantifiers); no core/hook code edits; override via `gate_override` remains available.

## Architecture

Registry-data-only. The rule entry (`entry_kind:"rule"`, `status:"active"`, `enforcement:"gate"`, `pattern_type:"regex"`) is read live by `loadPromotedRules` (`core/gate-logic.js:739`) on the next hook process and matched in `applyPromotedRules` per command segment (after `stripMessageFlags`, so commit-message bodies cannot false-positive) plus a full-command second pass (`core/gate-logic.js:947-1045`). Match → `decision:"escalate"` → `permissionDecision:"deny"` JSON (`hooks/universal/lib/protocol-adapter.js:97`). All three runtimes reach this via byte-identical shims / direct universal-hook wiring — no per-runtime change.

**Candidate pattern** (post-red-team refinement; finalize via preview mode — every branch must pass `isSafeRegexPattern`, no nested quantifiers):

```
git\s[^|;&]*\b(commit|push|cherry-pick|revert|merge)\b[^|;&]*--no-verify|git\s[^|;&]*\bcommit\b[^|;&]*\s-n(\s|$)|[cC][oO][rR][eE]\.[hH][oO][oO][kK][sS][pP][aA][tT][hH]\s*=\s*(/dev/null|NUL)|GIT_CONFIG_KEY_[0-9]+=[cC][oO][rR][eE]\.[hH][oO][oO][kK][sS][pP][aA][tT][hH]
```

Branch rationale (each maps to a red-team finding):
1. `git … <mutation-verb> … --no-verify` — verb-scoped so read-only `git log --grep="--no-verify"` passes.
2. `git … commit … -n` — whitespace-delimited short form (closes the plan-level acceptance criterion; combined `-an` is a documented residual).
3. Case-tolerant `core.hooksPath=` restricted to destructive values (`/dev/null`, `NUL`) — git config keys are case-insensitive; value scoping keeps `git config core.hooksPath .husky` (hook-ENABLING) and `--get`/`--unset` remediation allowed. Unscoped to git so `git -c …` and `git config …` forms both hit.
4. `GIT_CONFIG_KEY_n=core.hooksPath` env-injection form (case-tolerant).

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/bash-gate-no-verify.test.js`
- Modify: `meta-state.jsonl` (via `loop.mjs meta_state_promote_rule` only — never direct edit)
- Reference (no edits): `core/gate-logic.js`, `core/evaluate-bash-gate.js`, `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js` (pattern source), `tools/handlers/meta-state-promote-rule-tool.js` (preview mode, guards)

## Implementation Steps

1. **RED — write the test.** Model on `bash-gate-decision-visibility.test.js:64-91,129-189`: mkdtemp root, seed the candidate rule JSON line into `{tmpRoot}/meta-state.jsonl`, spawn `hooks/universal/bash-gate.js` with stdin `{tool_name:"Bash",tool_input:{command}}`, env `GATE_ROOT`. **Seed contract** (under-specified seeds are silently dropped by `loadPromotedRules` with only a stderr warn — `core/gate-logic.js:793-803`): the seed must satisfy `metaStateRuleEntrySchema` — `id` matching `/^rule-[a-z0-9-]+$/`, `entry_kind:"rule"`, `status:"active"`, `enforcement`, `pattern_type`, `pattern`, `description` ≥20 chars, `promoted_at`, `promoted_by`. Optionally assert hook stderr carries no "skipping" warn as a guard rail. Assert:
   - DENY: `git commit --no-verify -m x`; `git commit -n -m x`; `git push --no-verify`; `git -c core.hooksPath=/dev/null commit -m x`; `git -c Core.HooksPath=/dev/null commit -m x` (case evasion); `git config core.hooksPath /dev/null`; `GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x` (env injection) — each: exit 0, envelope `permissionDecision:"deny"`, additionalContext decision has `decision:"escalate"` + `rule_id`
   - ALLOW: `git commit -m "mentions --no-verify in prose"` (message stripping); `git commit -m x`; `git push origin main`; `git config --get core.hooksPath` (read-only); `git config --unset core.hooksPath` (remediation); `git config core.hooksPath .husky` (hook-enabling); `git log --all --grep="no-verify"` (investigation); `pnpm test:one -u path`
   - DOCUMENTED-DENY (assert current behavior, do not fix): `git commit -F - <<EOF … message containing literal --no-verify … EOF` → deny (heredoc/`-F` bodies are not stripped — `core/patterns.json:7`); ship commits must use `-m` and avoid literal tokens (Phase 3)
   - OVERRIDE: with a valid `.gate-override` marker at the REAL path `{tmpRoot}/.claude/coordination/.gate-override` (`core/gate-override.js:56-57`: `{root}/{surface}/coordination/`, shape per `validateMarker`: `rule_ids` array, ISO `created_at`, numeric `ttl_seconds`) → allow; with an EXPIRED marker (old `created_at`) → deny
2. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/bash-gate-no-verify.test.js` — the test seeds its own registry, so use it to iterate the regex until all allow/deny cases are exact.
3. **Footgun grep:** `grep -rn "no-verify\|hooksPath" tools/ package.json .claude .factory .mastracode -l` — enumerate and classify every hit. Known-benign expected hits: `interface/contract.js` (`hooksPath` variable names), `.claude/coordination/gate-log.jsonl` (history), and `hooks/commit-msg-stable-artifacts.js` — the last is NOT benign: lines 14 + 60 document and print `(bypass with --no-verify only if intentional)`, a standing instruction to run a command the new rule denies.
4. **Update the commit-msg advice string** in `tools/learning-loop-mastra/hooks/commit-msg-stable-artifacts.js:60` (and doc comment at :14): replace the `--no-verify` bypass advice with a pointer to `gate_override` (docs-level string edit, explicitly permitted by the amended constraint; no gate-mechanics code changes).
5. **Preview promotion:** `loop.mjs meta_state_promote_rule` with `preview:true` + `sample_commands` covering the full deny/allow matrix from step 1; iterate regex until exact. Guards to satisfy: category `loop-anti-pattern` (finding qualifies), `isSafeRegexPattern`, CLI self-footgun guard.
6. **Activate:** promote for real from finding `meta-260804T1600Z-an-agent-runtime-committed-the-cross-session-slow-burn-recur`, rule_id `rule-no-verify-bypass-denied` (matches `/^rule-[a-z0-9-]+$/`).
7. **Post-promotion verification (compensates the non-transactional 3-write sequence — rule row, citation row, finding status):** `loop.mjs meta_state_list '{"id":["rule-no-verify-bypass-denied"],"include_all_versions":true}'` shows the active rule; confirm the `origin` citation row exists (query citations for the rule→finding edge); confirm the origin finding status. If the rule landed without its citation, compensate with the rollback path below and re-promote.
8. **Live verify:** attempt a deny-case through the real gate and confirm denial **and** confirm the decision actually matched — check the gate decision log entry carries `rule-no-verify-bypass-denied` (guards against crash fail-open / silently-skipped regex). Confirm a normal git command passes. Then exercise the REAL override write path once: `loop.mjs gate_override '{"rule_id":"rule-no-verify-bypass-denied","ttl_seconds":120,"operator_note":"post-promotion verification"}'` → deny-case now allowed → confirm audit row in `runtime-state.jsonl` → let TTL expire naturally (120s) or proceed.
9. Run `pnpm test:unit` — green, no bypass.

## Rollback (kill switch — rehearse mentally before promoting)

`meta_state_patch` CANNOT flip rule `status` (omitted from the rule patch schema, `core/meta-state.js:896`); `meta_state_archive` rejects rules (`not_a_finding`). The only deactivation path:

```
loop.mjs meta_state_batch '{"operations":[{"op":"delete","id":"rule-no-verify-bypass-denied"}]}'
```

This appends an `archived` tombstone; `loadPromotedRules` filters non-active entries, so the deny stops on the next Bash call in every runtime (fresh hook processes — no session restart). Restorable via `meta_state_unarchive`. `gate_override` is a per-invocation work-around (TTL ≤86400s, cross-rule TTL clobber on re-arm — `core/gate-override.js:121-141`), NOT a kill switch.

## Todo

- [ ] Test file created, full deny/allow/documented-deny/override matrix green
- [ ] Footgun grep classified (known-benign vs actionable)
- [ ] commit-msg hook advice string points at `gate_override`
- [ ] Preview-mode sample matrix exact
- [ ] Rule promoted active in live registry
- [ ] Post-promotion verification (rule row + citation row + finding status)
- [ ] Live deny + decision-log rule_id + real `gate_override` write path verified
- [ ] `pnpm test:unit` green

## Success Criteria

- [ ] Test asserts deny (with rule_id) for all bypass forms incl. mixed-case hooksPath, `-n`, env injection; allow for clean commit / `--get`/`--unset`/hook-enabling config / `git log --grep=` / snapshot refresh; documented-deny for `-F`/heredoc literal tokens; expired override denies
- [ ] `rule-no-verify-bypass-denied` active in `meta-state.jsonl`; rollback path (batch-delete tombstone) documented above
- [ ] Gate-mechanics code untouched (changes: new test file + hook advice string + registry entry only)

## Risk Assessment

- Combined short flags (`git commit -an`) and indirection (aliases, `$VARS`, wrapper scripts) evade any literal regex → documented residual; checklist rule (Phase 2) + recurrence tracking are the countermeasure.
- Crash fail-open (hook crash or regex rejected at match time silently allows) → mitigated by step 8's decision-log verification; platform residual documented in plan.md.
- Pattern too broad → preview matrix + verb/value scoping + override hatch; rollback path above is the kill switch.
