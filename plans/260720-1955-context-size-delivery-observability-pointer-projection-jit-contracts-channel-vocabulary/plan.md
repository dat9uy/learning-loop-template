---
title: "Context size + delivery observability (pointer projection, JIT contracts, channel vocabulary)"
description: "Slim the loop's push surfaces (MCP manifest-tool wire 67.3kB → ≤40kB this plan [total ≤45kB deferred to a follow-on phase], SessionStart hints ~11.8k → ≤6k chars) and make steering delivery observable (classifier → runtime-state.jsonl + once-per-session pull pointer); merge the 'channel' term into the existing architecture.md table."
status: in-progress
priority: P1
effort: 22h
branch: meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent
tags: [refactor, infra, tech-debt]
blockedBy: []
blocks: []
created: 2026-07-20
---

# Context size + delivery observability (pointer projection, JIT contracts, channel vocabulary)

## Overview

The loop's steering surfaces are push-sized and push-blind: ~27k loop-owned tokens of the ~60k post-`/clear` baseline, and SessionStart injection is silently undelivered on lean provider profiles (101KB recorded, 9,322 tokens delivered — transcript ≠ wire). This plan implements the agreed brainstorm design in two independently shippable halves plus docs: **size** (JIT tool contracts + shared field glossary; hint pointer projection — manifest-tool wire ≤40kB this plan; total ≤45kB deferred to a follow-on workflow/agent-slimming phase per Validation V1) and **observability** (delivery classifier writing `delivery-<sessionId>` ledger rows + a once-per-session pull pointer in the inbound gate per V2; content-hash re-classify per V5), closing with merging the vocabulary term **channel** into the existing architecture.md table (V3) and a hard-budget verification pass.

## Source Material

- Brainstorm (agreed design, R1–R5): `plans/reports/brainstorm-260720-1905-context-size-delivery-observability.md`
- Research — MCP schema JIT surface: `plans/reports/research-260720-1921-mcp-schema-jit-surface.md`
- Research — hint-injection pointer surface: `plans/reports/research-260720-1921-hint-injection-pointer-surface.md`
- Research — runtime-state + inbound-gate surface: `plans/reports/research-260720-1921-runtime-state-inbound-gate-surface.md`
- Source finding: `meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent` (open)
- Constraint finding (per-tool invocation contracts NEVER trimmed): `meta-260704T0959Z-orchestrator-session-read-the-full-326-line-source-of-tools` (open)
- Measurement-harness precedent: `plans/reports/debug-260719-1524-ak-cook-context-attribution.md`

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | MCP `tools/list` wire: **manifest-tool portion ≤40,000B** this plan (JIT branch contracts + field glossary; per-tool invocation contracts preserved). The **total ≤45,000B** line is deferred to a separate workflow/agent-slimming follow-on phase (Validation C1 split — non-manifest ~15.26kB unslimmed here) | P1 |
| 2 | SessionStart hint emission (loop-owned, both `.claude` hooks) ~11.8k → ≤6,000 chars via `slug — suggestion` pointer projection; sidecar full-text payload unchanged | P1 |
| 3 | Delivery classifier: `delivery-<sessionId>` ledger-event rows (full/lean/unknown) in repo-root `runtime-state.jsonl`, idempotent by id + content-hash re-classification (Validation H3) | P1 |
| 4 | Inbound gate emits one steering pull-pointer line **once per session** (first UserPromptSubmit, via the existing suppress-token store); triggered soft-warning behavior unchanged (Validation H13 — dropped per-prompt always-emit) | P1 |
| 5 | "Channel" term merged into the **existing** architecture.md push/pull table (channel name + fidelity-class column) — NO new L2 runtime-contract.md section; L1 cross-ref only (Validation S1) | P2 |
| 6 | Hard budgets verified by re-running the debug report's measurement harness; full test suite green | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Baseline measurement + Tests-Before scaffolding](./phase-01-start.md) | Pending |
| 2 | [Phase 2: MCP wire slimming — JIT branch contracts + shared field glossary](./phase-02-mcp-wire-slimming-jit-branch-contracts-shared-field-glossary.md) | Pending |
| 3 | [Phase 3: SessionStart hint pointer projection](./phase-03-sessionstart-hint-pointer-projection.md) | Pending |
| 4 | [Phase 4: Delivery classifier + inbound-gate pull pointer](./phase-04-delivery-classifier-inbound-gate-pull-pointer.md) | Pending |
| 5 | [Phase 5: Docs — channel vocabulary promotion (L2) + schema-architecture update](./phase-05-docs-channel-vocabulary-promotion-l2-schema-architecture-update.md) | Pending |
| 6 | [Phase 6: Verification — measurement harness re-run + hard budgets](./phase-06-verification-measurement-harness-re-run-hard-budgets.md) | Pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|-------------|------|--------|------|
| Soft overlap | `260720-1112-runtime-state-read-path-consolidation-schemas-write-gate-repair` | pending | No hard block: classifier writes via core `appendLedgerEvent` (not the read path being consolidated) and today's change-log `meta-260720T1219Z` already landed the read-path consolidation this plan reads through. |
| Builds on | `260717-1826-unify-context-injection` | completed | Hint registry + builders + hook layout this plan projects into pointer form. |
| Builds on | `260719-2201-runtime-state-record-integrity` | completed | Fingerprint/verifyRow machinery the classifier rows rely on. |
| Spawns (Validation V1) | _(to be created)_ workflow/agent-slimming | not started | This plan delivers manifest-tool wire ≤40kB. The **total ≤45,000B** line (non-manifest ~15.26kB: 8 workflows + `update_r2_allowlist` + 3 `ask_*` agents) is deferred to a separate follow-on phase. Not a hard block — this plan's Success Criterion is manifest ≤40kB. |
| Spawns (Validation V4) | _(to be created)_ factory-hook cross-surface pointer | not started | Phase 3 deferred the `.factory/hooks/loop-surface-inject.cjs` pointer flip; Phase 5 records the deferral. Separate cross-surface alignment plan owns the flip + `factory-hook-single-source.test.cjs:118,127` rewrite. |

## Doctrine (locked, from brainstorm R5)

- gates-not-prose; profile = runtime surface (shim-not-fork); end-to-end correctness at endpoints; steering **pull, not broadcast**; YAGNI/KISS/DRY.
- Per-tool invocation contracts are NEVER trimmed (`meta-260704T0959Z`): contract *location* moves for branch-union tools (always-on-wire → at-invocation via error payloads); stages, gating, field semantics, idempotency stay on-wire. Ship obligation: change-log entry + relationship note on the constraint finding.
- No profile-env tagging; delivery is measured at the endpoint (`usage.input_tokens` ground truth).

## Success Criteria

- [ ] Live `tools/list` **manifest-tool portion ≤ 40,000B** (measured per debug-report method against `tools/learning-loop-mastra/mastra/server.js`, `LOOP_SURFACE=.claude`). Total ≤45,000B is a separate follow-on phase (Validation C1 split).
- [ ] Combined SessionStart hook stdout (both `.claude` hooks) ≤ 6,000 chars; `.claude/session-context.json` full-text payload + `*_source` flags unchanged
- [ ] `delivery-<sessionId>` rows present for recent sessions; classifier re-run appends 0 duplicates for unchanged transcripts AND re-classifies when transcript_content_hash changes (Validation H3); all rows pass `verifyRow` + `runtime-state-metadata-validation.test.js`
- [ ] Inbound gate emits pointer line **once per session** (first prompt, via suppress-token store); warn payload still only on trigger; shim parity green (Validation H13)
- [ ] Pointer visibility on a `syn`-profile session confirmed via transcript forensics, or documented-degradation fallback recorded
- [ ] `pnpm test:iter` green incl. new tests (pointer builders, JIT error payloads, classifier idempotency + content-hash re-classify, inbound-gate once-per-session)
- [ ] `check_runtime_agnostic` clean for all touched universal surfaces
- [ ] Ship-time loop bookkeeping: resolve `meta-260719T2120Z`, log change-log (contract relocation), relationship note on `meta-260704T0959Z`

## Open Questions

1. Factory-hook flip (`.factory/hooks/loop-surface-inject.cjs` pushes the same full paragraphs): plan includes it in Phase 3 for cross-surface doctrine consistency — confirm at validation.
2. Native-Claude (unproxied) baseline still unmeasured — first unproxied session should run the classifier (carried from brainstorm; no plan work).
3. Glossary pull surface: `loop_describe` cold tier confirmed viable by research (one-line slot, no cache entry) — no dedicated lookup tool.

## Red Team Review

### Session — 2026-07-21
**Findings:** 15 (15 accepted, 0 rejected) — 4 reviewers (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic), Full tier.
**Severity breakdown:** 2 Critical, 13 High. All 15 carry file:line codebase evidence (evidence filter passed).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | Budget arithmetic does not close to ≤45kB (non-manifest ~15.26kB unslimmed; Phase 2 lands ~50–52kB) | Critical | Accept | Phase 2 (Overview, Success Criteria), Phase 6 (step 1, Risk) |
| C2 | Classifier appends to shared `runtime-state.jsonl` with no lock (TOCTOU) and no atomicity (half-write → metadata-validation test red repo-wide) | Critical | Accept | Phase 4 (Key Insights, Idempotency, Risk, Test Matrix), Phase 6 (step 4) |
| H1 | Cold-tier cache keyed on 3 SHAs; static glossary doesn't change them → stale hit returns no `field_glossary` | High | Accept | Phase 2 (Requirements) |
| H2 | No production-code row validation; `id ^[a-z0-9-]+$` is plan-invented (not in `runtime-state-record-tool.js:25` schema nor any test) | High | Accept | Phase 4 (Key Insights, Idempotency) |
| H3 | Idempotency-by-id sticky forever — partial transcript → `unknown` frozen; `verifyRow` mismatch → un-reclassifiable; no operator-strike path | High | Accept | Phase 4 (Idempotency, Risk, Test Matrix) |
| H4 | Floor recompute spawns server at classify time — partial-write before loud failure AND over-engineered | High | Accept | Phase 4 (Floors bullet, Risk), Phase 6 (step 4) |
| H5 | `buildSteeringPointer` throw → gate exits non-zero, no stdout, warn side-effects may have run ("always exit 0" needs try/catch) | High | Accept | Phase 4 (inbound-gate Requirements) |
| H6 | Phase 1 measure script omits `MASTRA_STORAGE_DRIVER=memory` + temp `GATE_ROOT` from proven spawn pattern → flakiness cascades into Phase 6 budget gate | High | Accept | Phase 1 (Architecture, Risk) |
| H7 | `first_call_input_tokens` excludes cache-read tokens → cached sessions misclassified `lean` (the exact false-undercount the plan fixes) | High | Accept | Phase 4 (Class rule, Key Insights, Test Matrix) |
| H8 | `contextWasInjected` helper (additionalContext != null) breaks for all invocations once always-emit lands → 4 `!contextWasInjected` assertions + warn-content checks fail; ~20-30 LOC not "+~10 lines" | High | Accept | Phase 4 (Key Insights, Related Code Files) |
| H9 | D3.1 factory-hook test scope understated (`factory-hook-single-source.test.cjs:118,127` are full-text content assertions, not "alignment checks"); deferral fallback not wired into any Phase 5 step | High | Accept | Phase 3 (D3.1, Related Code Files), Phase 5 (step 6) |
| H10 | Free-form patch schema: new zod shape unspecified; `deepStripEnvelope` fate unclear; envelope round-trip behavior unspecified | High | Accept | Phase 2 (Requirements) |
| H11 | Phase 2 line 420-439 is the `operation_envelope` zod SCHEMA (regex constraints), NOT describe prose — "shorten describe prose" risks dropping validation | High | Accept | Phase 2 (Related Code Files table, Key Insights) |
| H12 | Phase 3 pointer builders duplicate existing builders' iteration + skip semantics — one `projectToPointers(hints)` formatter composes (DRY) | High | Accept | Phase 3 (Requirements, Related Code Files) |
| H13 | Always-emit per-prompt pointer: "KISS no staleness" rationale unfounded (gate already stateful via `SUPPRESS_WINDOW_MS`); AND pointer inflates classifier's own `recorded_attachment_bytes` | High | Accept | Phase 4 (inbound-gate Requirements, Risk) |

**Additional low-blast-radius fixes folded during the consistency sweep** (stale citations / structural, not separate findings):
- S3: `plan.md` Phases table now lists all 6 phases (previously only Phase 1).
- D2: `server.js:251` string — live registration is 33 tools + 8 workflows + 3 agents (not "32+8"); derive from `Object.keys(...)` to prevent re-drift (Phase 2).
- D8: `parityJsonSchemaHints` entry is at `meta-state-patch-tool.js:32-34` (not "lines 26-28") (Phase 2).
- A1/D5: `seed-file-index.mjs` precedent is at `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (not `tools/scripts/`) (Phase 4).

**Open scope decisions deferred to validation (not applied as defects — judgment calls):**
- S1: Phase 5 "channel" L2 promotion is arguably gold-plating (`CHANNELS` already named/exported at `hint-renderer.js:198`, already referenced in `architecture.md:514`) — confirm the L2 docs surface earns its keep.
- S8: Phase 5 `meta_state_ack` stale-line fix is unrelated scope creep — consider a standalone commit.
- D3: SessionStart baseline is ~13.1k chars (measured), not ~11.8k (code-comment carry-over) — Phase 1 records actuals, so self-correcting; no edit needed.
- S7: Phase 3 effort (3h) under-scoped if D3.1 ships (4 source + 4-5 test files) — consider 5h.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 through phase-06 (all).
- Decision deltas checked: budget reconciliation (C1), classifier append safety (C2/H2/H3/H4/H7), inbound-gate always-emit (H5/H13), pointer-builder DRY (H12), D3.1 factory-hook scope (H9), free-form patch shape (H10), 420-439 schema-vs-prose (H11), cold-tier cache (H1), contextWasInjected (H8), measure-script env (H6), stale citations (S3/D2/D8/A1).
- Reconciled stale references: 6 (Phases table, server.js count, parityJsonSchemaHints line, seed-file-index path, budget framing across plan.md/Phase 2/Phase 6, factory-hook test characterization).
- Unresolved contradictions: 1 — the ≤45,000B total budget (plan.md Goal #1, Success Criteria) vs Phase 2's ~50–52kB reality. This is **not auto-resolvable**: it requires an operator decision (enumerate more savings / split budget / raise to ~52kB). Flagged in Phase 2 Overview + Success Criteria and Phase 6 step 1 + Risk. **Recommend `/ak:plan validate` to resolve before `/ak:cook`.** → **Resolved in the Validation session below.**

## Validation Log

### Session — 2026-07-21
Verification pass skipped (red-team `## Red Team Review` already carries Full-tier evidence; Step 2.5 guard). 6 critical-questions asked, all answered.

| # | Decision point | Choice | Propagated to |
|---|---------------|--------|---------------|
| V1 (C1) | Total ≤45kB budget unreachable from Phase 2 alone (~50-52kB; non-manifest ~15.26kB unslimmed) | **Split budget**: manifest-tool ≤40,000B this plan; total ≤45,000B deferred to a separate workflow/agent-slimming follow-on phase | plan.md Goals #1 + Success Criteria; Phase 2 (Overview, Success Criteria, Risk); Phase 6 (step 1, Risk) |
| V2 (H13) | Inbound-gate always-emit per-prompt tax + classifier self-inflation | **Emit once per session** (first UserPromptSubmit via the existing suppress-token store); drop always-emit | plan.md Goal #4 + Success Criteria; Phase 4 (inbound-gate Requirements, Risk) |
| V3 (S1) | Phase 5 "channel" L2 promotion — gold-plating? | **Merge into the existing architecture.md push/pull table only** — NO new L2 runtime-contract.md Channels section | plan.md Goal #5; Phase 5 (Overview, Requirements, Related Code Files, Implementation Steps, Success Criteria) |
| V4 (D3.1) | Factory hook pointer flip — ship now or defer? | **Defer to a separate cross-surface alignment plan**; Phase 3 ships the two `.claude` hooks only | Phase 3 (D3.1, Related Code Files, Implementation Steps, Test Matrix); Phase 5 (step 6 — deferral note now mandatory) |
| V5 (H3) | Classifier idempotency freezes first classification (partial transcript → `unknown` forever) | **Content-hash re-classify**: store `transcript_content_hash` in row metadata; re-classify when it changes (skip only on hash match) | Phase 4 (Idempotency, row shape, Test Matrix); plan.md Goal #3 + Success Criteria |
| V6 (S8) | Phase 5 `meta_state_ack` stale-line fix — scope creep? | **Drop it** from Phase 5; ship as a standalone one-line docs commit | Phase 5 (step 5) |

### Verification Results (Step 2.5 — skipped)
- Tier: Full (6 phases) — but the red-team `## Red Team Review` already ran all 4 verification roles with file:line evidence across the plan. Per the Step 2.5 guard, the verification pass was limited to resolving `[UNVERIFIED]` tags; none were present.
- Claims checked: 0 (deferred to red-team evidence); Failed: 0.

### Whole-Plan Consistency Sweep (post-validation)
- Files reread: plan.md, phase-01 through phase-06 (all).
- Decision deltas applied: V1 (split budget — manifest ≤40kB now, total ≤45kB deferred), V2 (once-per-session emit), V3 (channel merged into existing table, no L2 section), V4 (factory hook deferred → Phase 3 slimmed, Phase 5 deferral note mandatory), V5 (content-hash re-classify), V6 (meta_state_ack dropped).
- Reconciled stale references introduced/removed by validation:
  - Phase 3 S7 (effort 3h) — now accurate (factory hook removed; Phase 3 is two `.claude` hooks only, ~3h holds).
  - Phase 3 "exactly 2 tests assert emitted hint text" — restored to accurate (factory-hook tests removed from scope).
  - Phase 5 L2 `runtime-contract.md` Channels section — removed; channel now lives only in the merged architecture.md table.
  - Phase 6 budget gate — now checks manifest ≤40,000B, not total ≤45,000B.
- Previously-unresolved contradiction (≤45kB total budget) — **RESOLVED** by V1 (split). The total ≤45,000B is now a separate follow-on phase's deliverable, not this plan's Success Criterion.
- Residual stale references caught in the final sweep and reconciled: Phase 1 Risk (≤45kB → manifest ≤40kB), Phase 2 A4 test / Regression gate / Test Matrix (≤45kB → manifest ≤40kB), Phase 4 Related Code Files + Success Criteria + Test Matrix ("always-emit / on every prompt" → once-per-session V2). Historical terms retained inside the `## Red Team Review` record itself (finding rows, sweep notes) are correct as-is.
- Unresolved contradictions: **0**. Plan is eligible for implementation.

<!-- slug: context-size-delivery-observability-pointer-projection-jit-contracts-channel-vocabulary -->
