---
title: "Central Skills Management"
description: "Unify external (mastra) + internal (learning-loop, coordination-gate) skill management across .claude/.factory/.mastracode behind one manifest, a canonical authoring source + fan-out materializer for internal skills (Decision 3 preserved), and a switch to the npx skills provider flow for mastra (Branch B). TDD-structured to preserve the contract + parity-test invariants."
status: in-progress
priority: P2
effort: "2-3d"
tags: [skills, manifest, materializer, write-gate, contract, runtime-agnostic, mastra, npx-skills]
created: 2026-07-19
---

# Central Skills Management

## Overview

Three runtimes (`.claude`, `.factory`, `.mastracode`) each carry a `skills/` surface with two coexisting skill classes:

- **External / provider-managed** — `mastra` (sourced from `mastra-ai/skills`). Today a *custom* mechanism: `skills-lock.json` (`sourceType:"github"`) + a central `.agents/skills/mastra` real copy + symlinks into `.claude` & `.factory`. `.mastracode` is **missing**. This bypasses the provider's intended `npx skills add/update` flow.
- **Internal / loop-maintained** — `learning-loop`, `coordination-gate` (both `maturity: state-2`). Today byte-identical real files duplicated ×3 surfaces, hand-synced; `skills-mirror-parity.test.js` is the drift backstop.

This plan manages both classes from **one central place** via a unified manifest, a canonical authoring source + idempotent fan-out materializer for internal skills, and a switch to the `npx skills` provider flow for mastra. Scope is **skills only**; hooks/coordination centralization + `ck:*` migration are deferred.

**Source:** `plans/reports/brainstorm-260719-1407-central-skills-management.md` (consensus Approach 1, operator-locked 2026-07-19). **Mode:** `--tdd` (composes on a focused hard-equivalent pass; the brainstorm is the research + adversarial input, so red-team/validate are offered as optional fresh passes at handoff rather than auto-run).

## Resolved open questions

| # | Question | Resolution | Evidence |
|---|----------|------------|----------|
| Q1 | Does `npx skills add` support a custom install target dir? | **No** → **Branch B** (per-runtime real files + manifest-driven exclusion + contract/parity-test updates). Branch A (central `.agents` + symlinks via npx) is **not achievable**: npx writes only to `./<agent>/skills/` (project) or `~/<agent>/skills/` (global), auto-detecting agents. | vercel-labs/skills issue #1481 (open feature request for `--output`/`skillsPath`); README confirms scope-only targeting, no `--dir`/`--target`/`--cwd`. `--copy` → real files; `--all` → all *detected* agents. |
| Q1b | Does `npx skills` auto-detect `.mastracode` / `.factory` (droid)? | **Unresolved — Phase 3 preflight probe.** Decides whether `.mastracode` closes via npx directly or via materializer fan-out from a detected runtime's copy. | Phase 3 verification gate. |
| Q2 | Gate the canonical source now or defer? | **Gate now, narrowly.** Add one rule to `WRITE_GATE_RULES` in `evaluate-write-gate.js` covering `tools/learning-loop-mastra/skills/**` only (NOT `tools/**`-wide; stays Rec 12 scope). Reuse `.loop-preflight-skills`. Do NOT touch `BOUND_ARTIFACTS` (order/contents pinned by `bound-artifacts.test.js`). | scout: evaluate-write-gate.js:74,102-108; bound-artifacts.test.js:48-56. |
| Q3 | Materializer trigger? | **`pnpm skills:sync` for v1** (manual operator step). Authoring path: edit canonical → `pnpm skills:sync` → `meta_state_log_change`. pre-commit hook deferred. | package.json `<noun>:<verb>` convention. |
| Q4 | Manifest filename? | **Keep `skills-lock.json` (extended).** Zero code consumers today; rename is cosmetic churn. `skills-manifest.json` noted as a future option. | scout: `grep skills-lock` in `.js` → 0 hits. |
| Q5 | `.agents` retirement? | **Retire `.agents/skills/mastra` as the source.** `npx skills add --copy` real files become source of truth (detected runtimes); materializer fans out to undetected. `.agents/` dir stays as the external-boundary concept but no longer holds the mastra central copy. | Q1 resolution. |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | One unified manifest (`skills-lock.json` extended) indexes all skills with State, provenance, targeting, delivery | P2 |
| 2 | Internal skills authored at a single canonical source and fan-out materialized byte-identically to all 3 runtimes via `writeToAllSkills` (Decision 3 preserved) | P2 |
| 3 | Narrow write-gate extension covering the canonical source dir only (materializer = only write path); **gating `skills-lock.json` too** (it becomes a trust anchor in Phase 3) | P2 |
| 4 | Mastra switched to `npx skills` (Branch B); `.mastracode` gap closed (test-enforced); manifest-driven external exclusion replaces `isSymbolicLink()` (with explicit `manifest-unreadable`/`skill-not-in-manifest` failure modes, no cache) | P2 |
| 5 | Escape-hatch inventory queryable in one grep (`maturity: state-1` via manifest) | P2 |

## Phases

| # | Phase | Status | Risk |
|---|-------|--------|------|
| 1 | [Unified manifest schema](./phase-01-start.md) | Completed (9216b2a) | Low (indexing only; `skills-lock.json` has zero code consumers) |
| 2 | [Internal canonical source and fan-out materializer](./phase-02-internal-canonical-source-and-fan-out-materializer.md) | Completed (c2fa24e + review fixes) | Medium (first consumer of `writeToAllSkills`; narrow gate; canonical dir) |
| 3 | [Mastra npx provider switch and manifest-driven exclusion](./phase-03-mastra-npx-provider-switch-and-manifest-driven-exclusion.md) | In progress — contract side shipped (c2fa24e + review fixes); npx round-trip remainder gated on ledger-event `npx-skills-mastra-roundtrip-2026-07-19` (Q4) | High (load-bearing contract + parity edits; npx behavior probes; `.agents` retirement; trust-anchor gating) |

## Dependencies

- **Satisfied (completed):** `plans/260707-0114-loop-skill-layer-prerequisite/` — shipped the skill contract (Req #3 + `maturity` frontmatter), the `<surface>/skills/**` write-gate + `.loop-preflight-skills` marker, `bound-artifacts.js` extraction, and `writeToAllSkills` (reserved, unused until this plan). This plan is its first materializer consumer.
- **Satisfied (completed):** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/` — **SHIPPED** (verified on disk; red-team F1 corrected an earlier "pending" premise). Phase E Plan 4's `contract.js` amendments are live: `RUNTIMES["mastra-code"]` (contract.js:8,30-42), `hook-declarative-config`/`settings-no-bypass` reqs (L81-82, ~495-569), the `skill_discovery_paths` fallback (L280-288), and the `.mastracode/{mcp,hooks,settings,database}.json` config set. **Phase 3 builds on this** — no concurrent `contract.js` edit, no "merge both in one PR" option. The two edits target separate functions (`listLoopMaintainedSkills:215-237` vs the hook check `~495-569`); Phase 3's only coordination check is that mastra stays excluded by manifest `external:true` even when the `skill_discovery_paths` fallback adds it (Regression Gate step 23).
- **Related, non-blocking:** `plans/260520-2133-meta-process-skill-template-fix/` (completed) edits skill *content*/templates/prompts, not skill *location*/manifest. Orthogonal: it can edit content at whatever the canonical path is when it ships.

## Success Criteria

- [ ] `skills-lock.json` extended to the unified manifest shape; entries for `learning-loop`, `coordination-gate`, `mastra` backfilled; schema + manifest↔frontmatter drift tests green; **`hash` load-bearing** (manifest.hash === sha256(canonical), F6).
- [ ] `tools/learning-loop-mastra/skills/{learning-loop,coordination-gate}/SKILL.md` exist as the canonical authoring source.
- [ ] `tools/scripts/sync-skills.mjs` (+ `pnpm skills:sync`) reuses `writeToAllSkills`; idempotent (re-run = no diff); **post-fan-out runtime parity check** fails loudly on partial-fan-out (F5); **canonical-vs-mirror parity invariant** detects direct canonical tamper (F3).
- [ ] One edit in canonical → after `pnpm skills:sync`, all 3 mirrors byte-identical AND == canonical; `skills-mirror-parity.test.js` green.
- [ ] Narrow write-gate rule blocks direct writes to `tools/learning-loop-mastra/skills/**` without `.loop-preflight-skills`; `BOUND_ARTIFACTS` unchanged. **`skills-lock.json` gated** (F4) — it becomes a trust anchor in Phase 3.
- [ ] `node tools/learning-loop-mastra/interface/contract.js claude-code|droid|mastra-code` all exit 0 (every phase).
- [ ] Mastra: `npx skills add mastra-ai/skills --copy` round-trip (add→update) keeps all 3 surfaces + parity/contract green; **`.mastracode/skills/mastra` present (test-enforced, F11)**; `.agents/skills/mastra` retired as source.
- [ ] `listLoopMaintainedSkills` excludes by manifest `external:true` (not `isSymbolicLink()`); **no module-level cache (F7)**; `manifest-unreadable` (F8) + `skill-not-in-manifest` (F9) explicit failure modes + tests; `contract.test.js:962` fixture updated (F2); parity test L90-128 replaced with a load-bearing manifest-external assertion (F10).
- [ ] **Mastra cross-surface byte-identity parity test (F12)** green (separate from `LOOP_MAINTAINED_SKILLS`).
- [ ] Manifest query `maturity: state-1` returns the escape-hatch inventory in one grep.
- [ ] No new MCP tool (Decision 4 honored); no Decision-3 reversal; no `tools/**`-wide gating (Decision 5 honored).

## Out of scope (deferred)

- `ck:*` skill migration.
- Hooks/coordination-shim centralization; L3-interface + runtime-impl centralization (this plan is its foundation — manifest = L3 interface, materialized copies = runtime implementations).
- `tools/**`-wide write-gate (stays Rec 12 scope; this plan adds only the narrow `tools/learning-loop-mastra/skills/**` rule).
- pre-commit-hook materializer trigger (Q3; pnpm script for v1).
- `skills-lock.json` → `skills-manifest.json` rename (Q4; keep for v1).

## Red Team Review

### Session — 2026-07-19
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor) — 3 hostile reviewers in parallel.
**Findings:** 24 raw → 15 accepted after dedup/evidence-filter (4 Critical, 9 High, 2 Medium-bundled), 0 rejected. All accepted findings carry `file:line` evidence.
**Severity breakdown:** 4 Critical, 9 High, 2 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | 260630 premise false — it's shipped, not pending; "coordination/sequencing" was fabricated | Critical | Accept | plan.md Deps + Phase 3 |
| 2 | `contract.test.js:962` omitted — symlink-exclusion test breaks after manifest swap (fixture has no manifest) | Critical | Accept | Phase 3 |
| 3 | Shared preflight marker → cross-runtime escalation; parity test (L48-68) only compares mirrors, never canonical | Critical | Accept | Phase 2 |
| 4 | `skills-lock.json` is the new trust anchor but ungated | Critical | Accept | Phase 3 |
| 5 | Partial-fan-out no rollback; `checkMirrorPresence` ≥2 masks single-surface divergence | High | Accept | Phase 2 |
| 6 | Hash cosmetic — zero code consumers; never verified (supply-chain + drift) | High | Accept | Phase 1 + 3 |
| 7 | Manifest cache gold-plating — `contract.js` has zero module-level mutable state | High | Accept | Phase 3 |
| 8 | Manifest-missing → false-positive `maturity-not-declared` (misleading, no fallback) | High | Accept | Phase 3 |
| 9 | Exclusion-bypass via unlisted real-dir skill | High | Accept | Phase 3 |
| 10 | Parity test L90-128 "update" vacuous — L108 `assert.ok(true)`, L120 dies post-Phase-3 | High | Accept | Phase 3 |
| 11 | `.mastracode/skills/mastra` presence unenforced by any test | High | Accept | Phase 3 |
| 12 | Mastra cross-surface drift silently allowed (out of `LOOP_MAINTAINED_SKILLS`; `npx update` per-runtime) | High | Accept | Phase 3 |
| 13 | `.agents` retirement TOCTOU + npx output unprobed (symlink-replacement + `--copy` structure) | High | Accept | Phase 3 |
| 14 | Phase 3 steps 6-10 non-atomic — reverting just the contract change while symlinks gone breaks contract | High | Accept | Phase 3 |
| 15 | `surfaces.js` temp-path race + leak — fixed `${realPath}.tmp` (L66) + no cleanup (L72-74); shared core | High (Med bundled) | Accept | Phase 2 |

**Folded in (not separately counted):** Phase 2 single-file → Phase 3 tree-walk (AD#6, simplifies Phase 2 per YAGNI); Phase 3 external-path tests (AD#7 → #13); npx env-non-determinism (Fail#7 → #12); `surface` enum constraint (Sec#7 → optional hardening in Phase 2).

**Key risks addressed:**
- **Cross-runtime trust boundary** (F1+F3+F4): the canonical source, the manifest, and the contract exclusion now form a coherent trust chain — canonical-vs-mirror parity (detection), manifest gating (anchor), `skill-not-in-manifest` (unlisted-plant defense).
- **Contract integrity** (F2+F7+F8+F9+F10): the manifest-driven exclusion is robust (explicit failure modes, no misleading fallback, no cache, real test fixtures) instead of a shape-swap that would have broken `contract.test.js:962` and left a vacuous parity test.
- **Atomicity** (F14): Phase 3's coupled contract+delivery+retirement steps land as one commit; the revert hazard is documented.
- **Runtime drift** (F5+F11+F12): partial-fan-out, `.mastracode` gap, and cross-surface mastra drift are all now test-enforced, not contract-masked.

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-start.md, phase-02-internal-canonical-source-and-fan-out-materializer.md, phase-03-mastra-npx-provider-switch-and-manifest-driven-exclusion.md (all four after red-team edits).
- **Decision deltas checked:** (a) 260630 status `pending`→`completed` (shipped) — swept plan.md Deps, phase-03 Overview/Architecture/Steps/Gates/Risks; removed "merge in one PR" option + "concurrent edit" framing everywhere. (b) `skills-lock.json` gating added (F4) — swept plan.md goals 3/4, success criteria; phase-03 Architecture/Related-Files/Steps/Risks. (c) `hash` load-bearing (F6) — swept phase-01 Architecture/Tests, phase-03 delivery, plan.md success criteria. (d) canonical-vs-mirror parity (F3) + partial-fan-out (F5) + surfaces.js fix (F15) — swept phase-02 Architecture/Tests/Success/Risks, plan.md success criteria. (e) vacuous L90-128 → load-bearing (F10), presence test (F11), cross-surface parity (F12), manifest-unreadable/skill-not-in-manifest (F8/F9), no-cache (F7), contract.test.js (F2), npx probes (F13), atomic commit (F14) — swept phase-03 only (all Phase-3 findings). (f) single-file Phase 2 / tree Phase 3 (AD#6) — swept phase-02 Overview/Architecture/Steps + phase-03 Architecture/Steps for consistency.
- **Reconciled stale references:** 6 (260630 "pending"/"concurrent"/"merge in one PR" across plan.md + phase-03; "hash cosmetic" framing in phase-01; the original "materializer is the only write path — enforced by the gate" claim in phase-02 → corrected to enforceable-via-canonical-parity-invariant; the vacuous-parity "update" in phase-03 → load-bearing).
- **Unresolved contradictions:** 0.

## Validation Log

### Session 1 — 2026-07-19
**Trigger:** Post-red-team critical-questions interview (validation mode=prompt, questions 3-8). Step 2.5 verification pass skipped — `## Red Team Review` already carries file:line verification evidence; no `[UNVERIFIED]` tags.
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** Red-team F3 found a direct canonical tamper (during the 30-min preflight window) would fan out undetected — the parity test only compares mirrors. The plan adds a canonical-vs-mirror parity *invariant test* (detection). How strong should the *prevention* be on top of detection?
   - Options: Detection only | Distinct marker | Hard gate (canonical MCP-only)
   - **Answer:** Detection only (Recommended)
   - **Rationale:** Matches the existing mirror-authoring pattern (gated-Edit-per-mirror + parity backstop); lowest friction for legitimate edits. The canonical-vs-mirror parity invariant test catches tamper at test time; the gate (preflight) is the only write prevention. Confirms Phase 2 as written — no phase edit.

2. **[Assumptions]** Red-team F8: if `skills-lock.json` is missing/corrupt, the new manifest-driven exclusion would fail mastra with a misleading `maturity-not-declared`. Should there be a silent fallback to the old `isSymbolicLink()` exclusion on manifest failure?
   - Options: Hard fail, no fallback | Symlink fallback + note
   - **Answer:** Hard fail, no fallback (Recommended)
   - **Rationale:** A corrupt/missing trust anchor must not silently degrade to a weaker exclusion — that hides manifest corruption. Pairs with the F4 gate. Confirms Phase 3 as written — no phase edit.

3. **[Tradeoffs]** Red-team F13 probe 3 verifies `npx skills add --copy` preserves the `SKILL.md + references/ + scripts/` tree before retiring `.agents`. What should happen if npx produces a DIFFERENT structure?
   - Options: Fail + document | Adapt materializer | Defer Phase 3
   - **Answer:** Fail + document (Recommended)
   - **Rationale:** Probe asserts structure match; on mismatch Phase 3 fails loudly with the diff documented, `.agents` NOT retired. Never silently ship a restructured skill. Confirms Phase 3 probe 3 as written — no phase edit.

4. **[Risks]** Phase 3 needs to run `npx skills add/update` in the sandbox (operator-gated preflight). If npx is fully unavailable or blocked in this sandbox, what's the Phase 3 fallback?
   - Options: Defer Phase 3 | Manual round-trip | Keep .agents symlink
   - **Answer:** (custom) Use the runtime-state mechanism — run the sandbox, record the npx round-trip as a `ledger-event` in `runtime-state.jsonl` via `runtime_state_record`, report back to it; no deferral.
   - **Custom input:** "We have the mechanism to ship Phase 3, which is runtime-state, you could run the sandbox, then report back to it, no need to defer"
   - **Rationale:** `runtime_state_record` (tools/learning-loop-mastra/tools/runtime-state-record-tool.js) + `runtime-state.jsonl` (repo root) + the `ledger-event` kind are an established mechanism (verified in-session). Phase 3 does NOT defer if npx is blocked in the current sandbox; instead the npx round-trip is recorded as a ledger-event when a sandbox that can run npx executes it, and the plan reads runtime-state back to confirm. Keeps Phase 3 shippable without re-bypassing the provider flow. **Changes Phase 3** — see Action Items.

#### Confirmed Decisions
- Parity enforcement: detection-only (canonical-vs-mirror invariant test + gate). No distinct marker / no new MCP tool.
- Manifest failure: hard-fail `manifest-unreadable`, no silent `isSymbolicLink()` fallback.
- npx structure mismatch: fail + document; `.agents` not retired.
- npx sandbox fallback: runtime-state `ledger-event` (NOT defer / NOT old-symlink).

#### Action Items
- [ ] Phase 3: replace the "If npx is fully unavailable in the sandbox, **defer this phase**" fallback with "record the npx round-trip as a `ledger-event` in `runtime-state.jsonl` via `runtime_state_record`; report back from whichever sandbox can run npx."

#### Impact on Phases
- Phase 3: the npx-unavailable fallback (Risk Assessment) becomes a runtime-state ledger-event flow, not a deferral. One targeted edit.

### Validation Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01, phase-02, phase-03 (after the Phase 3 validation edit below).
- **Decision deltas checked:** (a) Phase 3 npx-unavailable fallback: "defer" → "runtime-state ledger-event" — swept phase-03 Risk Assessment + Steps; plan.md Success Criteria (the npx round-trip criterion now reads from runtime-state, not a sandbox-bound run). (b) Q1-Q3 confirmed-existing — no deltas (detection-only / hard-fail / fail+document already in the plan); verified no stale "defer"/"fallback"/"distinct marker" claims contradict the confirmations.
- **Reconciled stale references:** 1 (the phase-03 "defer this phase" fallback).
- **Unresolved contradictions:** 0.

<!-- slug: central-skills-management -->
