---
date: 2026-05-20
type: process-bug
tags: [coordination, learning-loop, gate-misfire, docs, cook]
severity: medium
status: blocked-pending-fix
---

# 260520 — Coordination Gate Misfire on Docs-Only Plan Execution

## What Happened

Invoked `/ck:cook --auto plans/260519-2326-docs-canonicalization-machine-extracted-index` to execute Plan 4 (docs canonicalization for machine-extracted index). The `cook` skill is registered in `.claude/coordination/skill-registry.json` with profile `plan-execution` (`skill-registry.json:8`). The coordination hook `.claude/coordination/hooks/skill-coordination-gate.cjs` intercepted the call and blocked it because any registered skill requires coordination (`skill-coordination-gate.cjs:48-71`).

The hook returned:

```json
{
  "decision": "block",
  "reason": "Skill \"cook\" requires coordination. Invoke /ck:learning-loop with target=cook and your original intent.",
  "coordinator": "learning-loop",
  "target_skill": "cook",
  "profile": "plan-execution"
}
```

Plan 4 is purely editorial work: rewrite `philosophy.md`, `operator-guide.md`, `artifact-reference.md` to canonicalize index-first conventions. No runtime changes. No schema changes. No external systems. All changes are git-tracked markdown. The `plan-execution` profile's `gate_signals: ["validation_window"]` (`coordination-config.json:16`) is designed for state-changing work, not reversible docs edits.

## Why It Matters

The gate misfire forces either:

1. **Coordination overhead** — invoke `/ck:learning-loop`, wait for constraint prompt, re-invoke `cook`. Adds 2-3 extra round trips for work that carries zero irreversible risk.
2. **Bypass abuse** — touch `.bypass-next` to skip the gate, which trains the operator to bypass the very system meant to protect them.

The user explicitly rejected the `.bypass-next` workaround. This is not a one-off inconvenience; it signals the gate logic is wrong for this class of work.

The frustrating part is that the plan itself declares its risk level clearly (`plan.md:22`): "All changes are documentation-only. No runtime behavior changes. No record schema changes." The gate does not read plans. It gates by skill name alone.

## Root Cause

Three design flaws compound into the misfire:

1. **Skill-name gating is too coarse.** `skill-coordination-gate.cjs` looks up the skill name in `registered_skills`, finds `cook`, and blocks. It never inspects what the skill is being asked to do. A docs-only plan and a production-deploy plan hit the same gate.

2. **Profile `plan-execution` assumes all plans are state-changing.** `coordination-config.json` defines `plan-execution` with `write_allowlist: ["product/**", "tools/**", "records/**", "evidence/**"]` and `gate_signals: ["validation_window"]`. There is no profile for "plans that only edit docs and plans artifacts."

3. **No signal for docs-only work in plan metadata.** Plans already carry `tags`, `status`, `blockedBy`, `blocks` in frontmatter. None of these feed into the gate. The gate has zero plan-awareness.

The result: a safety mechanism designed for runtime-risky operations (budget checks, validation windows) fires on a git-reversible markdown edit. This is the coordination equivalent of a smoke alarm that triggers when you boil water.

## Proposed Fix

Option A — **Add a `docs-only` profile and a plan-tag dispatch rule:**
- Register `cook --auto plans/*-docs-*` or plans with `tags: [docs]` under a `docs-only` profile.
- `docs-only` profile: `write_allowlist: ["docs/**", "plans/**"]`, `gate_signals: []` (no gates, git is the safety net).
- Keep `plan-execution` for state-changing plans (runtime, schema, external system).

Option B — **Make the gate plan-aware (lightweight):**
- Before blocking, if the skill invocation includes a plan path, read the plan's frontmatter `tags`.
- If `docs` is in tags and no `product/**`, `tools/**`, `records/**`, `evidence/**` paths are in the plan's modified-files list, allow.
- Trade-off: gate hook gets more complex; needs file-read access.

Option C — **Operator opt-out at invocation time:**
- `/ck:cook --auto plans/... --no-gate` or `--profile=docs-only`.
- Explicit signal that operator has assessed the plan as low-risk.
- Trade-off: relies on operator judgment; could be abused.

**Recommendation:** Option A. It is mechanical (skill + tag → profile), requires no runtime file inspection in the gate, and keeps the existing hook simple. The plan naming convention (`docs-canonicalization`) and tags already encode the intent; we just need the registry to respect it.

## Decision

**Do not bypass. Fix the gate.**

Before any further Plan 4 work, update `.claude/coordination/skill-registry.json` and `.claude/coordination/coordination-config.json` to distinguish docs-only plan execution from state-changing plan execution. The user rejected `.bypass-next`; using it now would violate the stated principle from memory rule "No Memory as Enforcement" — don't use memory/bypass to compensate for missing mechanical hooks.

The mechanical hook is the profile system. It just needs a new profile.

## Unresolved Questions

1. Should `docs-only` also cover `plans/**` cleanup (deleting old plan artifacts)? Plan 4 Phase 4 does this.
2. Should the gate read plan frontmatter as a fallback when no tag matches, or should tags be the single source of truth?
3. Does `ck:fix` with a docs-only scope deserve the same `docs-only` profile, or is `fix` inherently riskier because it may touch code?
4. Should the `code-generation` profile's `write_forbidlist: ["records/**", "evidence/**", "docs/**", "plans/**", "schemas/**"]` be relaxed for docs-only `cook` invocations, or does `docs-only` supersede `plan-execution` entirely?
