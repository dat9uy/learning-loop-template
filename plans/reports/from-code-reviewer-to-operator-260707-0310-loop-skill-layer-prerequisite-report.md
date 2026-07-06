# Code Review: Loop-maintained skill layer prerequisite (last 6 commits)

**Scope:** `plans/260707-0114-loop-skill-layer-prerequisite/plan.md` vs commits `7254486..e5f707b` (6 commits).
**Mode:** Spec-compliance → code-quality → verification.
**Verdict:** **PASS with one Medium finding.** Implementation is faithful to the plan; all red-team findings were genuinely applied (not papered). One operator-facing text defect + minor doc/robustness notes.

## Stage 1 — Spec compliance: PASS

Every acceptance criterion in `plan.md` is met with evidence:

| Acceptance criterion | Evidence |
|---|---|
| `trajectory.md` terminus → state-3 + `deterministic-step` | commit `7254486` |
| `CONTRACT.md` Req #3 generalized (mirror + `maturity:` hard-require + threat-model) | `CONTRACT.md:38-44` |
| `contract.js::checkSkillSpec` enumerates only `maturity:`-declaring skills, hard-fails missing/invalid `maturity:`, error-isolates, 64KB cap, `schema:'core'` | `contract.js:169-330`; tests `contract.test.js` req 3 (multi-skill, hard-fail, error-isolate, oversized, mirror-gap) |
| `core/bound-artifacts.js` single source of truth; pinned-order test; existing write-gate tests green | `bound-artifacts.js` (frozen); `bound-artifacts.test.js` 7/7; `evaluate-write-gate.test.js` 31/31 |
| `surfaces.js` back-compat wrappers + per-surface results + `writeToAllSkills`; no caller changes | `surfaces.js:19-95`; `surfaces.test.js` 13/13 |
| `.mastracode/skills/{learning-loop,coordination-gate}` materialized byte-identical with `maturity:` | `diff -r` confirms `.claude≡.factory≡.mastracode` for both skills |
| Write-gate blocks `<surface>/skills/**` unless `.loop-preflight-skills`; explicit `surface="skills"` (no `inferSurface`) | `evaluate-write-gate.js:88-95,131-156`; Phase-5 tests lock block/ok/nested/product-independence |
| `gate_mark_preflight(surface:"skills")` unconstrained | `mark-preflight-complete-tool.js` schema `z.string()` |
| `loop-engine.md` recursion-bound + authoring subsection + `meta_state_log_change` | commit `e5f707b`; `meta-state.jsonl` tail entry `meta-260707T0215Z-docs-loop-engine-md` |
| `product/**` behavior unchanged; `docs/**`/`tools/**`/`core/**` stay ungated | Phase-5 regression test "Rec 12 boundary respected" |
| Contract passes AND parity passes | `node contract.js claude-code|droid|mastra-code` all exit 0; `skills-mirror-parity.test.js` 6/6 |

Red-team findings 1–15 are present in the code, not just the plan: dedicated `skills` marker, `surface="skills"` literal (no `inferSurface`), per-surface write results, symlink exclusion via `isSymbolicLink()`, 64KB cap + `schema:'core'`, scoped tool-ref check (`name === "learning-loop"`), pinned rule order, `.mastracode/skills/` git-tracked (red-team #9).

## Stage 2 — Code quality findings

### 1. `gate_mark_preflight` operator copy not generalized for `surface:"skills"` — Medium

`tools/learning-loop-mastra/tools/legacy/mark-preflight-complete-tool.js`

- Description: *"Use when you are about to write to `product/**` paths and have walked through the 6-step preflight checklist. Not for record CRUD..."*
- Return `note`: *"Product writes for this surface are unlocked for 30 minutes."*

Decision 14 / Q3 verified the `surface` param is unconstrained (`z.string()`) — correct, no tool change required for the *mechanism*. But the tool's user-facing text was not updated for the second consumer. An operator following the phase-5/6 authoring path (`docs/loop-engine.md` "Authoring loop-maintained skills" step 1) calls `gate_mark_preflight(surface:"skills")` and receives a response whose `note` literally says **"Product writes for this surface are unlocked"** — wrong surface name, and the description tells them the tool is *only* for `product/**`.

Behavior is correct (the marker is created; the gate reads it). This is an operator-confusion / contract-staleness defect, not a correctness bug. Fix: generalize the description to name both `product` and `skills` surfaces, and template the return `note` with the actual `surface` value rather than the hard-coded word "Product".

### 2. `plan.md` body status contradicts frontmatter — Minor

`plans/260707-0114-loop-skill-layer-prerequisite/plan.md`

Frontmatter: `status: completed`, `completed: "2026-07-06T19:15:00Z"`, `completedBy: ck:cook`. Body line 20: *"Status: drafted, awaiting review."* Also frontmatter `branch: "docs/skill-layer-consensus-rec12-broadening"` ≠ actual branch `docs/loop-skill-layer-prerequisite`. The body wasn't reconciled when the plan moved to completed. Cosmetic, but "awaiting review" is now false.

### 3. Two-tier mirror check: contract `≥2` vs parity `===3` — Minor (design, not defect)

`contract.js::checkMirrorPresence` returns ok at `count >= 2`; `skills-mirror-parity.test.js` requires all 3 surfaces present + byte-identical. A skill in exactly 2 surfaces passes the contract (`ok:true`, no `skill-mirror-gap`) but fails parity. Documented ("parity test is the backstop") and acceptance requires both, so no test escapes. The `≥2` threshold yields a contract-layer green that parity then overturns — defensible as an onboarding-tolerance diagnostic, but slightly misleading. Could align to `=== 3` if the tolerance isn't load-bearing. Not blocking.

### 4. Frontmatter close-delimiter detection — Minor (inherited, pre-existing pattern)

`contract.js::extractSkillFrontmatter` uses `trimmed.indexOf("---", 3)`. A YAML block scalar containing a line beginning `---` would close early. Low risk for SKILL.md frontmatter (simple key:value pairs) and consistent with `gate-logic.js::extractFrontmatter`. Inherited pattern, not a new defect; noting for the record.

### 5. Mastra-code fallback name derivation — Low

`contract.js` fallback derives skill name via `absolute.split("/").slice(-2, -1)[0]`, assuming path ends `<name>/SKILL.md`. Read-only fallback, unexercised in the happy path (all 3 surfaces materialized after phase 4). Fragile but inert.

## Verification (fresh, this session)

```
bound-artifacts.test.js        7 pass / 0 fail
skills-mirror-parity.test.js   6 pass / 0 fail
evaluate-write-gate.test.js   31 pass / 0 fail
contract.test.js              61 pass / 0 fail
surfaces.test.js              13 pass / 0 fail
contract.js claude-code  → exit 0  (skill-spec ok: coordination-gate + learning-loop, maturity state-2)
contract.js droid        → exit 0
contract.js mastra-code  → exit 0  (.mastracode/skills/ materialized)
diff -r .claude/skills .factory/skills → identical
diff -r .claude/skills/{learning-loop,coordination-gate} .mastracode/skills/... → identical
```

Live enforcement confirmed: `hooks/legacy/write-gate.js:17,33` imports and calls `evaluateWriteGate`, so the skills rule is enforced at runtime (not just in unit tests).

**Pre-existing failures (NOT regressions):** `cold-tier-regression`, `gate-resolution-evidence`, `meta-state-patch-immutable-fields`, `meta-state-resolve-cascade[-stale]`, `path-containment-audit-sites` fail at HEAD. Verified by a clean `HEAD~6` worktree: all fail identically there. None were touched by these 6 commits. Out of scope for this review.

## Recommended actions

1. **(Medium)** Generalize `gate_mark_preflight` description + return `note` to cover `skills` (and template the surface name into the `note`).
2. **(Minor)** Reconcile `plan.md` body line 20 ("drafted, awaiting review") + frontmatter `branch` with completed state.

Findings 3–5 are notes — no action required to land.

## Unresolved questions

None.