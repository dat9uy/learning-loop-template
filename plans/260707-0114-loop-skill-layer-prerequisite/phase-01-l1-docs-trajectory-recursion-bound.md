---
phase: 1
title: "L1 docs: trajectory terminus reframe"
status: pending
effort: "low"
priority: P2
dependencies: []
---

# Phase 1: L1 docs — trajectory terminus reframe

## Overview

Ship the one L1 doc statement the prerequisite owns that is mechanism-independent: reframe `docs/trajectory.md`'s skill-migration terminus from the solution-centric "loop-owned MCP tools" to the two-axis terminus "state-3 (encoded)" with `deterministic-step` as the realizing concept role. The self-maintaining recursion-bound statement is **deferred to phase 6** (it lands after the gate ships, so the L1 invariant is true on disk when it is written — see red-team finding: an invariant stated before its mechanism exists is a false claim). Docs-only; no code, no contract. `docs/philosophy.md` untouched (already fixed by 260706-1340).

## Requirements

- Functional: `trajectory.md` states the skill-migration terminus in two-axis terms (state-3 encoded, realized by `deterministic-step`); the "loop-owned MCP tools" framing is gone from the skill-migration sections.
- Non-functional: no vocabulary change to `deterministic-step`/`agentic-step`/`record`/`rule`/`promotion`; `philosophy.md` untouched; `loop-engine.md` untouched this phase (the recursion-bound statement lands in phase 6); file stays under `docs.maxLoc` (800).

## Architecture

`trajectory.md` is L0 (concept, aspirational); `loop-engine.md` is L1 (the engine invariant). The two-axis anchor already lives in `loop-engine.md` (the "instruction injection" note) + `philosophy.md` (the full state-1/2/3 + axes table), both shipped by 260706-1340. This phase closes the one deferred edge: the *terminus* label in trajectory. The recursion-bound statement is a mechanism invariant (skill files become bound artifacts only when the phase-5 gate ships) — per red-team finding, it lands in phase 6, not here.

## Related Code Files

- Modify: `docs/trajectory.md` — the skill-migration sentences carrying "loop-owned MCP tools" / "MCP tools become authoritative executors" (in §1 "Destination" and §4.7 "skill-migration track"; locate by content, not line number — the file shifts).
- No code changes. `docs/philosophy.md` and `docs/loop-engine.md` are explicitly NOT modified this phase.

## Implementation Steps

1. **Tests-first (grep invariants as the test):** define the post-state greps:
   - `grep -c "loop-owned MCP tools" docs/trajectory.md` → target 0. (Red-team finding: 4 occurrences exist today across §1 + §4.7; reframe ALL of them, not just one. Scope the reframe to every occurrence in the skill-migration context.)
   - `grep -c "state-3 (encoded)" docs/trajectory.md` → target ≥1 in the skill-migration section.
   - `docs/loop-engine.md` + `docs/philosophy.md` unchanged from HEAD (`git diff --name-only` shows neither).
   - Record pre-edit vocabulary counts in `loop-engine.md` (`deterministic-step`, `agentic-step`, `record`, `rule`, `promotion`) as the baseline phase 6 will preserve.
2. Read `docs/trajectory.md` fully; locate every "loop-owned MCP tools" / "MCP tools become authoritative executors" / "The escape hatch becomes a tool" occurrence in the skill-migration context (§1 Destination + §4.7).
3. Rewrite each occurrence to the two-axis terminus: skills migrate state-1 → state-2 → state-3, where state-3 (encoded) is deterministic injection + deterministic consumption, realized by `deterministic-step` (the `loop-engine.md` concept role); "an executable tool / consult-gate / hook" is one L3 realization, not the L1 terminus. Preserve §4.7's "smallest-first, lowest-risk-first" ordering rationale.
4. Run the post-state greps; confirm they pass. Run `wc -l docs/trajectory.md`; confirm < 800. Confirm `git diff --name-only docs/` lists only `trajectory.md`.

## Success Criteria

- [ ] `grep -c "loop-owned MCP tools" docs/trajectory.md` = 0 (all occurrences reframed, not just one).
- [ ] `docs/trajectory.md` skill-migration section names "state-3 (encoded)" + `deterministic-step` as the terminus.
- [ ] `docs/loop-engine.md` + `docs/philosophy.md` byte-identical to HEAD (not touched this phase).
- [ ] `docs/trajectory.md` < 800 lines.
- [ ] (Phase 6 will land the recursion-bound statement in `loop-engine.md` after the gate ships.)

## Risk Assessment

Low. Docs-only; no code, no contract, no invariant pre-shipping (the recursion-bound statement moved to phase 6 per red-team). The reframe *aligns* trajectory.md with the framing `philosophy.md` already carries, reducing cross-doc contradiction. Rollback: `git checkout docs/trajectory.md`.