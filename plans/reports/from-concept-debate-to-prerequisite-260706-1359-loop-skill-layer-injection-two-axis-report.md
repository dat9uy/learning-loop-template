# Prerequisite: the loop-maintained skill layer — wiring skills from escape-hatch (state-1) to wired (state-2) before the lifecycle-redesign plan's P4 enforcement

**Date:** 2026-07-06 (consolidates three prior reports — see Lineage)
**Status:** design-agreed, **not implemented**. No plan dir exists for this prerequisite or for the lifecycle-redesign plan (`plans/260706-0958-...` not cut). The L1 framing this rests on ships via `plans/260706-1340-philosophy-agents-two-axis-injection-reframe/` (the docs-rewrite plan, cut). Recent commits (#33–#35) shipped dispatch/close-flow; the skill layer and lifecycle redesign are untouched in code.

**Trigger:** the P4 skill-route design in `brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md` is directionally correct but **external** — it builds a skill *beside* the loop, not *through* it, because the loop has not defined how it maintains skills as loop artifacts. This report names the gap + the decisions required before P4's enforcement can ship. It is a prerequisite for the lifecycle plan's P4, not part of that plan.

**Lineage:** consolidates `from-ck-predict-260706-1124-loop-skill-layer-prerequisite-report.md` (the gap + L1/L2/L3 decisions + chosen scope), `from-ck-predict-260706-1311-loop-encoded-vs-loop-maintained-l1-concept-report.md` (the machinery inventory + feasibility findings), and `from-problem-solving-260706-1340-injection-consumption-two-axis-l1-reframe-report.md` (the L1 two-axis framing that supersedes the prior "loop-maintained / loop-encoded" terminology). The three originals are deleted on merge. The *machinery* conclusions of all three stand; only the L1 *terminology* is replaced by the two-axis model below.

---

## The L1 framing (spine): instruction injection × consumption

The loop's telos (`loop-engine.md` invariant): grow the deterministic surface, shrink the agentic surface. Restated for skills: convert the *agentic* injection of a skill (the model opens its markdown ad hoc — unreliable timing) into *deterministic* injection (a hook/gate surfaces it at the right moment), while leaving the *consumption* agentic where the content genuinely needs model judgment.

**Two axes** (the refinement that resolves the reductio "even meta-state descriptions won't be deterministic enough"):

- **Injection** — *when/how the instruction reaches the runtime.* Agentic (model opens ad hoc) vs deterministic (a hook/gate surfaces it at a fixed moment).
- **Consumption** — *how the instruction is executed.* Agentic (model reads prose + decides) vs deterministic (a rule/gate fires without model judgment).

**Three states:**

| State | Injection | Consumption | What lives here | Examples |
|---|---|---|---|---|
| **1 — escape-hatch** | agentic (model opens ad hoc) | agentic (model reads prose) | An unwired instruction the model opens when it decides it needs it | A bare SKILL.md; an unwired doc citation |
| **2 — wired** | **deterministic** (hook/gate surfaces at the right moment) | **agentic** (model reads + decides) | **The loop's permanent home for judgment-bound content** (operator decision 2026-07-06) | Meta-state finding descriptions (SessionStart hook surfaces them; model interprets); the stale-queue surfacing; a triage procedure once wired |
| **3 — encoded (terminus)** | deterministic | **deterministic** (rule/gate fires, no model judgment) | Where judgment could be fully encoded | A promoted rule; a consult-gate that blocks an action; gate-monopoly enforcement |

The fourth cell (agentic injection + deterministic consumption) collapses — deterministic consumption implies the gate fires on its own trigger.

**Why the loop (not a deterministic program, not a pure-agentic system):** a deterministic program can do states 2-3 but cannot *consume* prose (state-1's job); a pure-agentic system does state-1 but cannot reliably *inject* (timing is the model's whim). **The loop couples deterministic injection to agentic consumption — it occupies state-2, which neither extreme can do alone.** That is the loop's reason to exist.

**Escape-hatch is a *state*, not a file format** (operator point): a `.md` is state-1 only while it is reached agenticly; once a deterministic step surfaces it, it is state-2. `philosophy.md:21` lists "the skill markdown" as a current escape-hatch — correct *for unwired skills*; the fix is wiring, not deleting the markdown. `philosophy.md:33`'s "internalize the skill into the loop as an MCP tool" is solution-centric (names an L3 mechanism as the L1 terminus); the L1 terminus is **"deterministic step"** (rule-enforced, registry-driven, no model judgment — `loop-engine.md:23-24`), of which an MCP tool / consult-gate / hook are L3 realizations.

**Records stay 4-kind** (finding / change-log / rule / loop-design). A skill is **not** a record kind under any framing; skill *edits* are change-log triggers (the self-maintaining recursion bound).

---

## The gap (verified current state, 2026-07-06)

The loop has **one** ad-hoc loop-maintained skill today (`learning-loop`) governed by a **single** L2 requirement (`CONTRACT.md` Req #3 `skill-spec`). There is no general framework for "a skill the loop maintains."

| Layer | Today (verified) | Gap |
|---|---|---|
| **L1** `loop-engine.md` | "skill" appears 2×, only as escape-hatch framing (#1, #8) + skill-migration ordering (#87). No "instruction injection" concept named. | No first-class framing of the injection × consumption axes; no statement that escape-hatch is a state, not a file format; no statement that state-2 is the loop's home. (Ships via the docs-rewrite plan `260706-1340`, not this prerequisite.) |
| **L2** `CONTRACT.md` | Req #3 governs the single `learning-loop` SKILL.md; note says "a structured `tools:` block is an upgrade target; prose references pass today." Lists `.mastracode/skills/learning-loop/SKILL.md` as a path — **which does not exist on disk.** | No generalized requirement for hosting loop-maintained skills across runtimes; no statement on detector-or-prose by maturity; no requirement that skill files are gated or that edits trigger change-logs. |
| **L3** `architecture.md` + `tools/learning-loop-mastra/` | Skills mirrored ad-hoc in `.claude/skills/`, `.factory/skills/` (2 of 3 runtimes); `.mastracode/skills/` **absent** (only `.mastracode/coordination/` exists). `core/surfaces.js::writeToAllSurfaces` hardcoded to the `coordination/` subdir. Write-gate covers `records/**`, `runtime-state.jsonl`, `meta-state.jsonl`, `file-index.jsonl`, `schemas/**`, `product/**` — **not** `skills/**`/`docs/**`/`tools/**`/`core/**`; skill files freely writable. Bound-artifact globs inlined as string literals in `evaluate-write-gate.js:79-125`; no `core/bound-artifacts.js` constant. No architecture section on skills as loop artifacts. No trigger channel beyond SessionStart. | No mirror mechanism for skills; no skill write-gating; no bound-artifacts shared constant; no detector in shared core; no SessionEnd/pre-commit channel. |

**Why the P4 skill route is external:** without the layer, the Rec 12 trigger skill would be a *second* ad-hoc skill beside the loop — a regular user skill the loop references but does not own. That contradicts Rec 9 ("procedure → loop-encoded, **not prose**"): the skill wouldn't be loop-encoded (deterministically injected), just a skill the loop mentions. The loop would be *consuming* a skill (state-1, agentic injection), not *maintaining* one (moving it to state-2).

---

## Rec 9 in this framing

Rec 9 = "procedural knowledge should be loop-encoded, not doc'd" = move procedural knowledge from state-1 (agentic injection) to at least state-2 (deterministic injection). Does it need agentic instruction, deterministic machinery, or both? **All three:**

- **Agentic content** (the procedure: "triage this finding → promote / resolve / re-verify") — model judgment per finding; cannot be state-3 without solving classification. Stays (state-2 consumption).
- **Deterministic injection** (when to surface the procedure) — session-start / on-trigger. The loop owns timing (state-2 injection).
- **Deterministic guardrails** (don't auto-promote; operator-judgment boundary) — consult-gates on the actions (state-3 for the guardrail; state-2 for the content).

The prerequisite's machinery (below) is the L3 realization of injection + guardrails; the agentic content is the SKILL.md that stays.

---

## What the prerequisite must decide

### L1 — concept (`loop-engine.md` `record` role + escape-hatch section; ships via the docs-rewrite plan)

1. **A skill is an agentic-injection artifact, not a concept role or a record kind.** The L1 role is "inject instruction" (realized as agentic-step / deterministic-step per `loop-engine.md`'s existing vocabulary). A "loop-maintained skill" is a skill whose migration the loop owns — moving it from state-1 toward state-2. Drop "loop-maintained / loop-encoded" as L1 nouns; place the machinery on the injection × consumption axes instead.
2. **Escape-hatch is a state (state-1), not a file format.** The skill markdown stays an escape-hatch (state-1) until a deterministic step injects it; state-2 (wired) is the **permanent home** for the agentic content; state-3 (encoded) is the terminus for the guardrails. (Operator decision: state-2 permanent, escape-hatch term kept.)
3. **Self-maintaining recursion bound.** Skill files ARE bound artifacts → editing a skill is a change-log trigger. The bound: a skill edit triggers a change-log; the change-log is a record write (MCP tool, already logged), NOT a bound-artifact edit → recursion stops. The actual self-maintenance is **gate-monopoly**: the write-gate rejects direct SKILL.md writes → all edits go through the authoring path, which emits a change-log into `meta-state.jsonl`. Buildable now; not Rec 12's deferred general auto-trigger.

> **TODO (prerequisite plan to pick up):** `docs/trajectory.md:20` still names the skill-migration gradient's terminus as *"loop-owned MCP tools"* — the old solution-centric framing this report supersedes. The docs-rewrite plan (`260706-1340`, complete) deferred the `trajectory.md` edit. When this prerequisite ships its L1 statements, reframe that gradient to the two-axis terminus: **state-3 (encoded)** (deterministic injection + deterministic consumption), realized by `deterministic-step`; "MCP tool" stays an L3 realization, not the L1 terminus.

### L2 — contract (`runtime-contract.md` / `CONTRACT.md`)

4. **Generalize Req #3.** From "the runtime MUST provide the `learning-loop` SKILL.md" to "the runtime MUST host loop-maintained skills at `<surface>/skills/<name>/SKILL.md`, mirrored across all participating runtimes." Resolve the discovery-path discrepancy (Req #3 lists a `.mastracode/skills/` path that does not exist on disk). State the mirror requirement as a contract invariant.
5. **Injection-determinism by maturity (was "detector-or-prose").** Tie to the state-1/2/3 path: citation-only = state-1 (agentic injection); citation-only-artifact = state-2 (deterministic injection via the registry citation); full-execution = state-3 (deterministic consumption via a tool/gate).
6. **Skill files as gated artifacts.** The contract requires skill files to be write-gated — the self-maintaining L2 statement. Skill edits are bound-artifact edits.

### L3 — mechanism (`architecture.md` + `tools/learning-loop-mastra/`)

7. **Skill mirror mechanism.** Extend `core/surfaces.js::writeToAllSurfaces` (hardcoded to `coordination/`) to mirror `<surface>/skills/` — generalize the existing function, do not invent a parallel surface list. Complete the missing `.mastracode/skills/` mirror for `learning-loop` + `coordination-gate` (currently 2-of-3 runtimes).
8. **Detector location.** The deterministic detector lives in shared core (`tools/learning-loop-mastra/core/`), runtime-agnostic (FCIS: zero `@mastra/*` imports — verified, holds today). The skill markdown is a thin adapter that calls it. The bound-artifact glob set is a shared-core constant (`core/bound-artifacts.js`), imported by the write-gate AND any future detector — one source of truth. Today globs are inlined in `evaluate-write-gate.js:79-125`; extracting them is justified.
9. **Trigger channel.** New hook surface (SessionEnd / pre-commit) or reuse existing? Today only SessionStart exists. A SessionEnd/pre-commit mirror is new L3 surface — **deferred** (manual invocation initially); see UQ.
10. **Gating skills.** Extend the write-gate to `<surface>/skills/**` — this IS the self-maintenance (gate-monopoly + authoring-path-emitted change-log). Scope this plan's gate extension to `<surface>/skills/**` ONLY; gating `docs/**`/`tools/**`/`core/**` is Rec 12's job (next plan).

---

## Machinery inventory (verified, 2026-07-06)

What the prerequisite's machinery claims vs. what actually exists (scout-verified — the evidence base for the chosen scope):

| Mechanism | Reality | Verdict |
|---|---|---|
| Skill mirror across runtimes | NO mirror mechanism. `.claude`+`.factory` byte-identical, hand-maintained, parity test-enforced. `.mastracode/skills/` **absent**. `writeToAllSurfaces` covers `coordination/` only. | NEW extension (generalize `writeToAllSurfaces` to `skills/`) |
| Change-log on every skill edit (self-maintaining) | `meta_state_log_change` is **manual-only**. No PostToolUse hook; no auto-trigger on file write. | NEW (gate-monopoly + authoring-path-emitted change-log; Rec 12's general auto-trigger is separate + deferred) |
| File-index fingerprint refresh | `meta_state_refresh_file_index` exists but **manual**; no write-trigger. | tool exists; auto-on-write is NEW (deferred) |
| Bound-artifact glob set | Globs are **inlined string literals** in `evaluate-write-gate.js:79-125`. No constant. | NEW extraction (justified) |
| Skill write-gating | Write-gate covers `records/**`, `runtime-state.jsonl`, `meta-state.jsonl`, `file-index.jsonl`, `schemas/**`, `product/**` — **NOT** `skills/**`. Skills freely writable. | NEW extension |
| `skill_manage` MCP tool | 33 tools in manifest; **none write markdown files**. All existing tools write JSONL registries or coordination JSON. `skill_manage` would be a **new category** (markdown CRUD) backed by a **third substrate**. | NEW category — deferred (no consumer this plan) |
| FCIS (core framework-agnostic) | `core/` has zero `@mastra/*` imports. | precondition holds ✓ |
| Operator-only graduation | `OPERATOR_MODE` env check pattern exists in `meta_state_promote_rule`/`supersede`/`sweep`. | reuse ✓ |

**Key feasibility findings:**
1. `skill_manage`'s only consumer (the Rec 12 trigger skill) ships in the *next* plan. Building it now = building before its consumer = YAGNI. The operator's reframe was "rewrite `learning-loop` as the skill-**manager** (a skill)," not a real MCP tool.
2. "Self-maintaining via Rec 12" is mislabeled. Rec 12 (general bound-artifact auto-trigger) is deferred; the auto-trigger does not exist. The actual self-maintenance is **gate-monopoly** — buildable now, not Rec 12.
3. A third substrate (`core/skill-manage.js` / `skill-state.jsonl`) contradicts the "skills are not records" decision. Skill *edits* are change-logs in the existing `meta-state.jsonl`, not a new substrate.

---

## Chosen scope

**Ship now (loop-native, buildable without a new tool or substrate):**
1. **L1/L2/L3 statements** (the spine — strongest contribution, independent of tool-vs-skill): L1 = skill is an agentic-injection artifact, not a record kind; escape-hatch is a state; state-2 is the permanent home; (ships via the docs-rewrite plan `260706-1340`). L2 = generalize Req #3 + injection-determinism by maturity + skill files gated. L3 = extend write-gate to `<surface>/skills/**` + extend mirror + extract `core/bound-artifacts.js`.
2. **`learning-loop` rewrite as an authoring *skill*** (not an MCP tool): house the standard, maturity levels, mirror steps, change-log step. Prompt-authoring content moves to `loop-prompt-authoring` (a second skill).
3. **Write-gate extension to `<surface>/skills/**`** — reject direct writes; force edits through the authoring path (this IS the self-maintenance: gate-monopoly + authoring-path-emitted change-log).
4. **Mirror helper** — extend `writeToAllSurfaces` to mirror `<surface>/skills/`. Complete the missing `.mastracode/skills/` mirror.
5. **`core/bound-artifacts.js` shared constant** — one source of truth, imported by write-gate (and any future detector).

**Defer to the next plan (Rec 12 trigger consumer):**
- `skill_manage` MCP tool — build when a non-operator agent needs to author/graduate a skill (when the Rec 12 autonomous consumer exists). Until then the operator authors skills via gated direct writes + manual `meta_state_log_change`, same as today.
- `core/skill-manage.js` third substrate — drop entirely; skill edits are change-logs in the existing `meta-state.jsonl`.
- SessionEnd/pre-commit hook (deferred per UQ).

**Drop:**
- The "self-maintaining via Rec 12" label → gate-monopoly + authoring-path-emitted change-log. Rec 12 stays a separate, deferred general trigger.
- "Loop-maintained / loop-encoded" as L1 nouns → place the machinery on the injection × consumption axes.

---

## Dependency direction

```
docs-rewrite plan 260706-1340 (L1 framing: injection × consumption into loop-engine.md / philosophy.md / AGENTS.md)
        └──►  lifecycle plan P4 (L1 trigger statement + symmetry)
                      └──►  this prerequisite (L1/L2/L3 statements + learning-loop rewrite + gate/mirror extensions + bound-artifacts constant)
                                    └──►  next plan (Rec 12 trigger skill + skill_manage tool, authored via the skill-manager)
```

The docs-rewrite plan ships the L1 framing; the lifecycle plan ships the concept rule (P4); this prerequisite ships the loop-owned skill-layer mechanism the tool will later sit on. The lifecycle plan is **not blocked** by this prerequisite — it ships the concept. This prerequisite is not blocked by the docs-rewrite plan — it can state its L1 decisions against the two-axis framing in parallel, and they ship together.

**What the lifecycle plan's P4 becomes (trim):** P4 ships only the L1 trigger statement in `loop-engine.md` `record` role (*an action becomes a change-log when it changes a bound artifact … or a rule/policy; not for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan*) + the symmetry statement (Q11: no operator exemption; `meta_state_log_change` is trigger-gated, not authority-gated; fires for operator + agent). It does NOT ship the skill, hook, detector, glob set, or consult-gate — those are this prerequisite's mechanism.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| P4 ships the L1 statement with no enforcement → actors forget to log bound edits | Medium | Acceptable transient: same exposure as today (manual `meta_state_log_change`). The L1 statement makes the rule *queryable* (Rec 12's goal) even before enforcement. Enforcement lands here. |
| Self-maintaining recursion (skill edit → change-log → skill update → …) is unbounded | Medium | L1 states the bound: change-log is a record write (MCP tool, already logged), not a bound-artifact edit → recursion stops. Gate-monopoly means the only path to edit a SKILL.md emits a change-log. |
| Scope creeps into a general skill-management framework (YAGNI) | Medium | Scope to "what the Rec 12 trigger needs" + the minimal L1/L2/L3 statements that generalize the existing `learning-loop` pattern. No skill registry unless the first instantiation demands it. |
| `skill_manage` built before its only consumer (YAGNI) | High → avoided | Deferred to next plan; skill-manager ships as a skill, not a tool. No non-operator agent needs to *create* a loop-maintained skill today. |
| New markdown-CRUD tool category + third substrate (no precedent, contradicts "skills are not records") | High → avoided | Dropped; skill edits use existing `meta-state.jsonl` change-logs. |
| Write-gate extension over-reaches into Rec 12's detection surface (`docs/**`/`tools/**`/`core/**`) | Medium | Scope this plan's gate extension to `<surface>/skills/**` ONLY. Gating `docs/**`/`tools/**`/`core/**` is Rec 12's job (next plan). |
| `.mastracode/skills/` mirror absent; existing skills are 2-of-3 runtimes | Low | First mirror action completes it; extend `writeToAllSurfaces` rather than a parallel list. |
| `loop-prompt-authoring` migration | Low | Content move; verify a sample prompt round-trips. |
| SessionEnd hook is new L3 surface; shipping it here bloats this plan | Low | Deferred (UQ) — accept manual invocation initially. |
| `philosophy.md` reframe shifts the framing every future session inherits | Medium | Ships via the docs-rewrite plan `260706-1340` with phases; the two-axis model is verified against the reductio. |

---

## Unresolved questions

1. **Skill vs consult-gate as the first instantiation.** This prerequisite defines the layer; the first enforcement surface could be either. The skill route is more general (procedural, user-invocable, carries the readable spec); the consult-gate is narrower (extends the existing write-gate to bound artifacts, no new skill surface). The consult-gate route extends an existing L3 mechanism, so it may ship earlier as a bridge. The layer definition is independent of which surface instantiates it. **In the two-axis framing:** a consult-gate is a *deterministic-consumption* surface (state-3 for the guardrail); a skill is a *deterministic-injection + agentic-consumption* surface (state-2 for the content). They occupy different cells — confirm whether the consult-gate is a maturity level of the skill's encoding or a different surface. Recommend: consult-gate = the state-3 guardrail that the state-2 skill's content calls; they compose, not compete.
2. **Does any non-operator agent need to *create* a loop-maintained skill today?** If no, `skill_manage` has no consumer this plan — confirm before building it (next plan).
3. **SKILL.md path + contract discovery paths.** `<surface>/skills/<name>/SKILL.md` (current) vs under `coordination/`. State explicitly; update Req #3 discovery paths (currently lists a `.mastracode/skills/` path that does not exist on disk).
4. **Gate-extension boundary.** This plan gates `<surface>/skills/**` only; `docs/**`/`tools/**`/`core/**` gating belongs to Rec 12 (next plan). Confirm so this prerequisite doesn't absorb Rec 12's detection surface.
5. **Is the SessionEnd/pre-commit hook channel in scope here, or a separate hardening plan?** New hook surface is non-trivial. Recommend scope this prerequisite to skill + detector + mirror + L1/L2/L3 statements, defer the hook — manual invocation initially. The hook is the reliable trigger for autonomous sessions but can land in a follow-up without blocking the layer.
6. **Maturity-declaration convention.** Where `maturity:` lives in a SKILL.md (frontmatter / header / prose) — a one-line convention in the prerequisite's L2 (Req #3 generalization) so all loop-maintained skills declare it the same way.
7. **Should this prerequisite generalize the existing `learning-loop` skill retroactively,** or leave it as the ad-hoc first instance and only govern new skills? Recommend generalize retroactively (it already satisfies Req #3; promoting it under the new layer costs little and avoids two skill regimes).