---
title: "Context size + delivery observability (pointer projection, JIT contracts, channel vocabulary)"
description: "Slim the loop's push surfaces (MCP wire 82.5kB → ≤45kB, SessionStart hints ~11.8k → ≤6k chars) and make steering delivery observable (classifier → runtime-state.jsonl + unconditional pull pointer); promote 'channel' to an L2 contract term."
status: pending
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

The loop's steering surfaces are push-sized and push-blind: ~27k loop-owned tokens of the ~60k post-`/clear` baseline, and SessionStart injection is silently undelivered on lean provider profiles (101KB recorded, 9,322 tokens delivered — transcript ≠ wire). This plan implements the agreed brainstorm design in two independently shippable halves plus docs: **size** (JIT tool contracts + shared field glossary; hint pointer projection) and **observability** (delivery classifier writing `delivery-<sessionId>` ledger rows + an unconditional one-line pull pointer in the inbound gate), closing with promotion of the vocabulary term **channel** to L2 and a hard-budget verification pass.

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
| 1 | MCP `tools/list` wire 82,516B → ≤45,000B (JIT branch contracts + field glossary; per-tool invocation contracts preserved) | P1 |
| 2 | SessionStart hint emission (loop-owned, both `.claude` hooks) ~11.8k → ≤6,000 chars via `slug — suggestion` pointer projection; sidecar full-text payload unchanged | P1 |
| 3 | Delivery classifier: `delivery-<sessionId>` ledger-event rows (full/lean/unknown) in repo-root `runtime-state.jsonl`, idempotent by id | P1 |
| 4 | Inbound gate always emits one steering pull-pointer line (~15–20 tok); triggered soft-warning behavior unchanged | P1 |
| 5 | "Channel" promoted to an L2 contract term (runtime-contract.md), L3 mapping in architecture.md, L1 cross-ref only | P2 |
| 6 | Hard budgets verified by re-running the debug report's measurement harness; full test suite green | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Start](./phase-01-start.md) | Pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|-------------|------|--------|------|
| Soft overlap | `260720-1112-runtime-state-read-path-consolidation-schemas-write-gate-repair` | pending | No hard block: classifier writes via core `appendLedgerEvent` (not the read path being consolidated) and today's change-log `meta-260720T1219Z` already landed the read-path consolidation this plan reads through. |
| Builds on | `260717-1826-unify-context-injection` | completed | Hint registry + builders + hook layout this plan projects into pointer form. |
| Builds on | `260719-2201-runtime-state-record-integrity` | completed | Fingerprint/verifyRow machinery the classifier rows rely on. |

## Doctrine (locked, from brainstorm R5)

- gates-not-prose; profile = runtime surface (shim-not-fork); end-to-end correctness at endpoints; steering **pull, not broadcast**; YAGNI/KISS/DRY.
- Per-tool invocation contracts are NEVER trimmed (`meta-260704T0959Z`): contract *location* moves for branch-union tools (always-on-wire → at-invocation via error payloads); stages, gating, field semantics, idempotency stay on-wire. Ship obligation: change-log entry + relationship note on the constraint finding.
- No profile-env tagging; delivery is measured at the endpoint (`usage.input_tokens` ground truth).

## Success Criteria

- [ ] Live `tools/list` wire ≤ 45,000B (measured per debug-report method against `tools/learning-loop-mastra/mastra/server.js`, `LOOP_SURFACE=.claude`)
- [ ] Combined SessionStart hook stdout (both `.claude` hooks) ≤ 6,000 chars; `.claude/session-context.json` full-text payload + `*_source` flags unchanged
- [ ] `delivery-<sessionId>` rows present for recent sessions; classifier re-run appends 0 duplicates; all rows pass `verifyRow` + `runtime-state-metadata-validation.test.js`
- [ ] Inbound gate emits pointer line on every prompt (warn payload still only on trigger); shim parity green
- [ ] Pointer visibility on a `syn`-profile session confirmed via transcript forensics, or documented-degradation fallback recorded
- [ ] `pnpm test:iter` green incl. new tests (pointer builders, JIT error payloads, classifier idempotency, inbound-gate always-emit)
- [ ] `check_runtime_agnostic` clean for all touched universal surfaces
- [ ] Ship-time loop bookkeeping: resolve `meta-260719T2120Z`, log change-log (contract relocation), relationship note on `meta-260704T0959Z`

## Open Questions

1. Factory-hook flip (`.factory/hooks/loop-surface-inject.cjs` pushes the same full paragraphs): plan includes it in Phase 3 for cross-surface doctrine consistency — confirm at validation.
2. Native-Claude (unproxied) baseline still unmeasured — first unproxied session should run the classifier (carried from brainstorm; no plan work).
3. Glossary pull surface: `loop_describe` cold tier confirmed viable by research (one-line slot, no cache entry) — no dedicated lookup tool.

<!-- slug: context-size-delivery-observability-pointer-projection-jit-contracts-channel-vocabulary -->
