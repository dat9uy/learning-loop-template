---
title: "Skills manifest self-healing normalize step (npx clobber recovery)"
description: "Resolve meta-260720T1451Z — the npx skills CLI clobbers skills-lock.json on every add/update, dropping mastra's trust-anchor fields (external, delivery, targets, maturity, hash) and breaking the contract's manifest-driven exclusion (F10) + hash trust anchor (F6). Ship a self-healing `pnpm skills:normalize` step that restores the extended external entry from a fixed policy table + re-derives hash from the installed SKILL.md, and fold it into `pnpm skills:sync` so the existing post-npx workflow auto-heals. TDD-structured; builds on the completed Phase 3 of plans/260719-1428-central-skills-management (which tracks this as a follow-up)."
status: completed
priority: P2
effort: "1-1.5d"
tags: [skills, manifest, npx-skills, normalize, self-healing, trust-anchor, contract, tdd, meta-state]
created: 2026-07-20
blockedBy: []
---

# Skills manifest self-healing normalize step (npx clobber recovery)

## Overview

`npx skills` (the provider CLI for the external `mastra` skill) owns `skills-lock.json` and rewrites it on every `npx skills add` / `npx skills update`. It rewrites the `mastra` entry to its native schema (`sourceType:"github"`, `computedHash`, …) and **drops the loop's trust-anchor fields** (`external:true`, `delivery`, `targets`, `maturity`, `hash`). Two load-bearing invariants break the moment that happens:

- **F10** (`skills-mirror-parity.test.js:77-91`) — asserts `manifest.skills.mastra.external === true`. With `external` dropped, the contract's `listLoopMaintainedSkills` (`contract.js:275`) stops excluding `mastra` → mastra is enumerated as a loop-maintained skill → the parity test fails (mastra has no `maturity:` frontmatter).
- **F6** (`skills-mirror-parity.test.js:177-188`) — asserts `sha256(<surface>/skills/mastra/SKILL.md) === manifest.skills.mastra.hash` on all 3 surfaces. With `hash` dropped (replaced by npx's `computedHash`), the trust anchor is gone.

The operator workaround (documented in the shipped Phase 3 status note of `plans/260719-1428-central-skills-management/phase-03-…md`) is manual: after every `npx skills add/update mastra-ai/skills`, hand-restore the extended `mastra` entry (`hash = sha256(<detected>/skills/mastra/SKILL.md)`), then `pnpm skills:sync` to fan out. This is the tracked follow-up: **a self-healing `pnpm skills:normalize` step** that automates the restore-from-installed, folded into the existing `pnpm skills:sync` so the post-npx workflow heals without a new manual step.

**Finding:** `meta-260720T1451Z-npx-skills-cli-clobbers-skills-lock-json-on-every-npx-skills` (`loop-anti-pattern`, subtype `external-tool-clobbers-trust-anchor`, `affected_system:meta`, severity `warning`). Evidence: `tools/learning-loop-mastra/interface/contract.js:230` (`listLoopMaintainedSkills`). Empirically verified 2026-07-20 (see Phase 3 status note of the parent plan).

**Mode:** `--tdd` (tests-first per phase). The parent plan's Phase 3 already did the adversarial red-team pass on the manifest-driven exclusion contract this composes on; red-team/validate are offered as optional fresh passes at handoff rather than auto-run.

**Scope:** skills manifest recovery only. Does NOT change the contract's exclusion logic (`listLoopMaintainedSkills` is correct as-is — the bug is the manifest getting clobbered, not the contract reading it), does NOT change the fan-out engine (`writeToAllSkills`), does NOT retire or add skills. No new gate rules (the `skills-lock.json` write-gate from Phase 3 F4 stays; normalize is a sanctioned operator-run healing tool, see Phase 2 risk note).

## Resolved open questions

| # | Question | Resolution | Evidence |
|---|----------|------------|----------|
| Q1 | Does normalize need to re-derive `hash` from files, or can it copy npx's `computedHash`? | **Depends on the clobber shape — Phase 1 probe decides.** If npx's `computedHash` is `sha256` of the installed `SKILL.md`, normalize copies `computedHash → hash` (trivial, no file scan). If `computedHash` is a tree/other hash, normalize re-derives `hash = sha256(<detected surface>/skills/mastra/SKILL.md)`. Phase 1 locks the fixture shape from a real isolated `npx` run; Phase 2 tests encode the decided path. | Phase 3 status note lists `computedHash` as an npx field; semantics unverified. |
| Q2 | Which surface is "detected" (the new content) after `npx skills update`? | **Cannot use majority-rule.** `npx skills update mastra` detects Claude Code + Droid (`.claude` + `.factory`) per the Phase 3 note — 2 surfaces get new content, `.mastracode` stays stale. But `npx skills add -a claude-code` updates only `.claude` — 1 new, 2 stale. Majority-rule picks the wrong surface in one of the two flows. Therefore normalize MUST identify the detected content via npx's own signal (`computedHash` matching a surface's `SKILL.md` sha256), NOT via surface-count heuristics. | Phase 3 status note ("npx update detects Claude Code + Droid, `.mastracode` stays undetected"). |
| Q3 | Does npx preserve internal entries (`learning-loop`, `coordination-gate`) and the `version` field when it clobbers? | **Phase 1 probe confirms.** The finding says npx "rewrites the mastra entry" (per-entry, not wholesale), but this must be verified against the real clobbered file. If npx drops internal entries or `version`, normalize must restore them too (policy table covers `version:2`; internal entries are preserved from the pre-clobber manifest if available, else fail loudly). | Finding description ("rewriting the mastra entry"). |
| Q4 | Should normalize edit the parent plan's Phase 3 status note to mark the follow-up shipped? | **No — record via change-log only.** `plans/260720-1404-…` is a pending plan-edit to that same status note; editing it here creates a doc-conflict. The meta-state change-log is the durable record. | `plans/260720-1404-…` (pending plan-edit to phase-03-…md). |

### Implementation outcome (post-probe, supersedes Q1/Q2's decision-tree)

The Phase 1 probe (`plans/reports/probe-260720-npx-skills-clobber-shape.md`) resolved both open questions empirically:

- **Q1 → scan+derive (the copy branch was never used).** `computedHash` is opaque — NOT `sha256(SKILL.md)` (it is likely a GitHub blob SHA or npx internal tree digest). Phase 2 therefore re-derives `hash = sha256(<detected surface>/skills/mastra/SKILL.md)`.
- **Q2 → mtime-max, NOT a `computedHash`-match signal and NOT majority-rule.** The Q2 resolution above hypothesized using `computedHash` matching a surface's `SKILL.md` sha256 as the detection signal; that signal is unavailable because `computedHash` is opaque. The implemented heuristic picks the surface with the highest `mtimeMs` across the 3 real-dir copies (`detectExternalHash` in `tools/scripts/skills-lib.mjs`). This holds empirically because npx writes detected runtimes with wall-clock mtime (probe-verified), and it handles both flows without the majority-rule failure mode: `npx update` writes `.claude` + `.factory` (~same mtime, same new content — either wins); `npx add -a claude-code` writes only `.claude` (fresh mtime beats the stale `.factory` + `.mastracode`). The originally-spec'd "largest byte-equal cluster" was replaced by this simpler mtime-max; the change-log (`meta-260720T1909Z`) records the switch. If npx ever preserves upstream timestamps, mtime-max would pick a stale surface — a content-cluster approach is the documented robust fallback.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `pnpm skills:normalize` restores a clobbered `skills-lock.json` to the loop's v2 extended schema (external entry: `external:true`, `delivery`, `targets`, `maturity:null`, `source`, `sourceType:"npx-skills-cli"`, `hash` re-derived) — idempotent. | P1 |
| 2 | `pnpm skills:sync` auto-normalizes before fan-out (self-healing: the existing post-npx workflow needs no new manual step). | P1 |
| 3 | F10 + F6 pass after `npx skills add/update` → `pnpm skills:sync` (the documented recovery sequence), with no hand-edit of `skills-lock.json`. | P1 |
| 4 | The meta-state finding is resolved with a change-log recording the new capability. | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Probe clobber shape + write failing normalize tests](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Implement normalize + self-healing sync integration](./phase-02-implement-normalize-self-healing-sync-integration.md) | Completed |
| 3 | [Phase 3: Resolve finding + change-log + workflow docs](./phase-03-resolve-finding-change-log-workflow-docs.md) | Completed |

## Success Criteria

- [x] `pnpm skills:normalize` exists, is idempotent, and turns a fixture clobbered manifest back into the v2 extended schema (tests green in `normalize-skills.test.js`).
- [x] `pnpm skills:sync` calls `normalizeManifest` in-process before fan-out (self-heal); existing `sync-skills.test.js` stays green after the DRY refactor of `sha256`/`SURFACES` into `skills-lib.mjs`.
- [x] End-to-end recovery verified (fixture or real): clobbered manifest → `pnpm skills:sync` → F10 (`external:true`) + F6 (`hash` matches all 3 surfaces) pass.
- [x] `pnpm test:iter` green (no regressions in contract, parity, manifest, or sync suites).
- [x] Meta-state finding `meta-260720T1451Z-…` resolved; change-log records the `skills:normalize` capability.
- [x] Workflow documented: post-`npx skills add/update` sequence is `pnpm skills:sync` (auto-normalizes + fans out).

## Risk Assessment

- **Probe needs a real `npx` run in an isolated fixture.** `npx skills` is an external/provider command → operator-gated per the loop's runtime-probe discipline (`mastra_gate_check` + `workflow_runtime_probe` before execution). The probe copies `skills-lock.json` into a tmp root and runs `npx skills add mastra-ai/skills --copy` / `npx skills update mastra` there so the live manifest is never clobbered by the probe itself. Mitigation: Phase 1 step 1 runs the gate check; the probe writes only to a tmp dir.
- **`computedHash` semantics unknown.** If Phase 1 finds `computedHash` is NOT `sha256(SKILL.md)`, Phase 2's hash derivation falls back to scanning surfaces and matching `computedHash` against each surface's `SKILL.md` sha256 to find the detected copy (Q2). The fallback is specified in Phase 2 so the plan does not block on the ideal case.
- **Write-gate interaction.** `skills-lock.json` is gated (Phase 3 F4). normalize writes it. Running `pnpm skills:normalize` (or `pnpm skills:sync`, which now normalizes) via Bash must not be blocked by the bash gate for the operator's healing workflow. Phase 2 verifies `mastra_gate_check("pnpm skills:normalize")` / `("pnpm skills:sync")`; if blocked, add a preflight-delegating exception or document the operator-run path. normalize is idempotent and only restores the loop's own extended fields, so bypassing the gate for this sanctioned tool is safe-by-construction (the gate's purpose — prevent ad-hoc clobbering — is preserved; normalize IS the sanctioned anti-clobber).
- **DRY refactor of sync-skills.** Extracting `sha256`/`SURFACES`/`findDetectedSurface` into `skills-lib.mjs` and importing them in `sync-skills.mjs` touches a shipped, tested script. Mitigation: `sync-skills.test.js` (the existing fixture suite) guards the refactor; run it first after the extract.
- **No cross-plan blocking.** `plans/260719-1428-central-skills-management` is completed; `plans/260720-1404-…` is a pending plan-edit to the Phase 3 status note (docs only, no code). This plan implements code the parent's Phase 3 tracked as a follow-up and deliberately does NOT edit the parent's status note (Q4), so no doc-conflict.

## Validation Log

### Validation Session 1 (2026-07-20, /ak:plan validate)

**Verification Results** — Standard tier (3 phases, ~16 claims checked):
- Claims checked: 16 | Verified: 16 | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Failures: none

Verified claims (file:line evidence):
- `tools/learning-loop-mastra/interface/contract.js:230` (`listLoopMaintainedSkills`) + `:275` (`manifestEntry.external === true` exclusion)
- F10: `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js:77-91`; F6: `:177-188`
- `tools/scripts/sync-skills.mjs:38-40` (positional root arg), `:60-72` (fail-closed guards), `:93-112` (`findDetectedSurface`), `:28` (imports `SURFACES`+`writeToAllSkills` from `core/surfaces.js`)
- `tools/learning-loop-mastra/core/surfaces.js:16` (`SURFACES` frozen array export) + `:139` (`writeToAllSkills` export)
- `tools/learning-loop-mastra/core/evaluate-write-gate.js:107` (`SKILL_MANIFEST_GLOB="skills-lock.json"`) + `:143` (preflight-delegates to `surface:'skills'`) — confirms the Phase 3 F4 write-gate rule + its preflight path exist
- mastra tree = `references/` + `scripts/` + `SKILL.md` (confirms recursive fan-out + F12 ">1 file" assertion)
- `package.json`: `skills:sync` exists; `skills:normalize` absent (correct — Phase 2 adds it)

### Critical Questions Interview (4 questions, all answered)

| # | Question | Decision | Effect on plan |
|---|----------|----------|----------------|
| 1 | Hash derivation: probe-first vs. assume-copy vs. always-scan? | **Probe-first** | No change — plan already branches Phase 2 on the Phase 1 probe (Q1). Confirmed. |
| 2 | External entry: full-replace-from-policy vs. merge? | **Full replace from policy** | No change — Phase 2 Architecture already specifies full replacement; `EXTERNAL_POLICY` is canonical for externals. Confirmed. |
| 3 | Self-heal: fold into sync vs. standalone only? | **Fold into sync** | No change — Phase 2 already folds `normalizeManifest` into `sync-skills.mjs` after `readManifest()`. Confirmed. |
| 4 | Probe fallback: documented-shape fixture vs. block? | **Documented-shape fixture** | No change — Phase 1 Risk Assessment already specifies this fallback. Confirmed. |

**Propagation:** none — all four decisions confirm existing plan choices. No `<!-- Updated -->` markers needed.

### Whole-Plan Consistency Sweep

- Re-read `plan.md` + all 3 `phase-*.md`. No stale terms, renamed fields/APIs/files, rejected assumptions, or duplicate embedded drafts found.
- No contradictions between overview, phases, implementation steps, success criteria, and risk notes.
- `EXTERNAL_POLICY` shape in Phase 2 matches the `skills-lock.json` v2 mastra entry (verified against the live file).
- Q1/Q2/Q3/Q4 references are consistent across plan.md (Resolved open questions) and the phases that act on them.
- Unresolved contradictions: 0.

**Recommendation:** proceed — plan is eligible for implementation (Failed: 0, no unresolved contradictions).

## Out of Scope

- Changing `listLoopMaintainedSkills` or the manifest-driven exclusion contract (correct as-is).
- Changing the fan-out engine (`writeToAllSkills`) or surface set.
- Adding/retiring skills or changing `source`/`delivery` policy for mastra.
- A git hook / CI check that auto-runs normalize (YAGNI — the operator runs `pnpm skills:sync` post-npx already; auto-normalize-in-sync covers the self-healing need). Flag as a possible future hardening.
- Editing the parent plan's Phase 3 status note (Q4 — change-log is the durable record).