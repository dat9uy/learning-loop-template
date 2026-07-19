# Work Journal: Central Skills Management plan + red-team launch

**Date:** 2026-07-19 **Session:** ak:plan --tdd on brainstorm-260719-1407-central-skills-management.md
**Plan dir:** plans/260719-1428-central-skills-management/

## What shipped this session
- Created 3-phase TDD plan via `ak plan create` + `ak plan add-phase`.
- Resolved the load-bearing fork **Q1** empirically: `npx skills add` has NO custom-target flag (vercel-labs/skills issue #1481 + README) → commits to **Branch B** (per-runtime real files + manifest-driven exclusion), killing Branch A.
- Scout (Explore agent) mapped exact surfaces: `core/surfaces.js#writeToAllSkills` (unused, fallow-ignored), `contract.js#listLoopMaintainedSkills:215-237` (isSymbolicLink exclusion), `skills-mirror-parity.test.js:90-128`, `evaluate-write-gate.js:74,102-108`, `skills-lock.json` (zero code consumers), 3 runtime skill layouts.
- Surfaced 3 under-stated risks the brainstorm missed: hardcoded `LOOP_MAINTAINED_SKILLS` (L19); canonical gate must go in `WRITE_GATE_RULES` not `BOUND_ARTIFACTS` (order pinned); `writeToAllSkills` fallow-ignore removal.
- Cross-plan: foundational `260707-0114` completed (satisfied dep); `260630-2012` is a Phase-3-only coordination on shared `contract.js` (not a hard block); `260520-2133` orthogonal (skill content vs location).

## Red-team (in flight)
- 3 hostile reviewers spawned in parallel: Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor).
- Probes: write-gate bypass / cross-runtime injection via materializer; npx trust model + hash enforcement; partial-fan-out failure + rollback; npx probe determinism; 260630 overlap quantification; "zero consumers" re-verification; writeToAllSkills single-file vs tree-walk; manifest-driven exclusion false-positive on corrupt manifest.

## Next
- Await 3 reviewer results → dedupe → evidence-filter (reject no file:line) → adjudicate → present to user → apply accepted → whole-plan consistency sweep.
