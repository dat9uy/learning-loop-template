# Brainstorm: Context Size + Context Observability (Delivery Fidelity)

**Date:** 2026-07-20 19:05 | **Status:** Agreed — ready for plan handoff
**Sources:** finding `meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent` (open, warning); report `plans/reports/debug-260719-1524-ak-cook-context-attribution.md`; constraint finding `meta-260704T0959Z-orchestrator-session-read-the-full-326-line-source-of-tools` (open)
**Worktree:** `/home/datguy/codingProjects/worktrees/learning-loop-template-meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent` (branch = finding id, base `main`)

## 1. Problem Statement

Two intertwined problems, one root property: the loop's steering surfaces are **push-sized and push-blind**.

1. **Context size.** Post-`/clear` first-turn baseline ≈ 60k tokens before user content (measured, full-surface path). Loop-owned share ≈ 27k: MCP tool defs 20.6k (44 tools; `meta_state_patch` alone 20,789B from an inlined 4-branch zod union) + SessionStart hint injection ~6k (26 long-paragraph hints).
2. **Context observability.** Injection is push-dependent and silently undelivered on lean provider profiles (`syn` profile, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`): 101KB recorded in transcript, 9,322 tokens reached the model. Transcript ≠ wire. Consequences: hint-dependent behaviors silently skip; "model ignored hint" vs "hint never sent" are behaviorally indistinguishable (measurement corruption); profile switches invisible to the loop.

## 2. Requirements (locked via discovery)

| # | Decision | Answer |
|---|----------|--------|
| R1 | Structure | Single design, two phases (Phase 1 size, Phase 2 observability), independently shippable |
| R2 | Size scope | Loop-owned surfaces only: MCP schemas + SessionStart hints. Upstream ak-family listings out of scope |
| R3 | Observability scope | Delivery classifier (endpoint measurement, not profile-env tagging) + unconditional pull pointer; classifier writes to `runtime-state.jsonl` |
| R4 | Acceptance | Hard budgets, verified by re-running the report's measurement harness |
| R5 | Doctrine | gates-not-prose; profile = runtime surface (shim-not-fork); end-to-end (correctness at endpoints; steering pull, not broadcast); YAGNI/KISS/DRY; per-tool invocation contracts NEVER trimmed (`meta-260704T0959Z` constraint) |

Operator refinements during debate:
- **No profile-env tagging.** Observe delivery at the endpoint (wire size in transcript `usage.input_tokens` — the ground truth the report itself used), not via env proxies. Profile tagging was rec 3 of the source report; rejected as proxy-of-a-proxy.
- **Classifier output → `runtime-state.jsonl`** (operator): the loop should "know" the situation through its own queryable substrate, matching the runtime-state design (external state, like vnstock).
- **JIT contract pattern generalized** beyond `meta_state_patch` (operator: "helpful for others too") — applied per-tool by shape, not uniformly (§4.1).
- **Architecture doc gap** (operator): the hint/renderer/state-1-2-3 surfaces need proper doc anchoring; promote "channel" as a vocabulary term (layer choice delegated to brainstorm — §5).

## 3. Evaluated Approaches

### Fork A — slimming `meta_state_patch` (20.8k = 25% of MCP wire)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A1 JIT contract** (chosen) | Wire: `patch` = free-form object + `minProperties:1` + schema-derived mutable-field CSV in description; full per-kind JSON schema rides `invalid_field`/`empty_patch` error payloads. ~20.8k→~1k. Error channel re-delivers at invocation on EVERY profile (report-proven). Handler already branch-validates (`meta-state-patch-tool.js:142-157`) — no validation change | First-call error rate rises; one extra round-trip per unfamiliar kind | **Chosen** — max savings, zero new surfaces, delivery-independent contract |
| A2 Per-kind lookup tool | Contract complete upfront-but-pulled | New surface to maintain; model must know to call it before patching | Rejected — new surface for a problem the error channel already solves |
| A3 Flattened single schema | Keeps constrained decoding; dedupes shared fields | Finding-branch prose stays on-wire; medium savings (~20.8k→6-8k) | Rejected — pays most of the cost for half the win |

### Fork B — hint compression (~6k → ~1.5k)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **B1 Pointer projection** (chosen) | New compact builders in `loop-introspect.js` (`slug — suggestion` one-liners; fields already exist in `hint-registry.js`); hooks flip builder call only. Full text stays pull (sidecar + `loop_get_instruction`). Minimal diff | Less guidance in-channel — but that IS the design (pull) | **Chosen** |
| B2 Renderer channel | Budget partitioning (unneeded at ~1.5k) | Reverses 2026-07-17 operator decision ("renderer = inspection tooling, not injection path") for no capability gain | Rejected |

### Fork D — pull pointer placement

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **D1 Extend `inbound-gate.js`** (chosen) | No new artifacts; hook already universal with synced shims; currently emits only when triggered → restructure to always emit one pointer line | Couples gate + steering in one file (both are prompt-time inbound surface; acceptable) | **Chosen** |
| D2 New micro-hook | Single-purpose, fails independently | New universal artifact × 3 surfaces + runtime-agnostic checklist | Rejected — artifact count beats purity here |

### Fork C — delivery observability (operator-shaped)

Profile-env tagging (source-report rec 3) **rejected in discovery**: endpoint measurement is ground truth; env is a proxy. Wire capture (rec 1) stays a documented manual probe — out of scope.

## 4. Final Design

### Phase 1 — Context Size

**4.1 JIT contract generalization (per-tool placement, NOT uniform).** Principle: *wire carries invocation-minimal contract; rich/duplicated reference lives in one pull surface; error paths re-deliver specifics just-in-time.*

| Tool shape | Tools (wire size) | Treatment |
|---|---|---|
| Branch-union | `meta_state_patch` (20.8k), `meta_state_batch` (3.1k) | Full JIT: branch schemas off-wire; per-kind/op shape returned in validation-error payloads (new `shape` field). Description keeps schema-derived field-name CSV (`listMutableFieldsCsv` already exists, shared with batch) |
| Big flat | `meta_state_report` (7.6k), `log_change` (5.2k), `promote_rule` (2.4k), `list` (3.6k) | Dedupe cross-tool repeated prose (id format, status enums, evidence fields, operation_envelope block) into a **shared field glossary** (`core/field-glossary.js`); on-wire descriptions go short-form; glossary served via `loop_describe` cold tier; zod validation errors JIT-enriched with the failed field's glossary entry |
| Small scalar | remaining ~38 tools | Light dedupe only; leave invocation-critical fields intact |

Never trimmed (constraint `meta-260704T0959Z`): per-tool stages, gating, field semantics, idempotency. Contract *location* moves for branch shapes (always-on-wire → at-invocation); record as change-log entry + relationship note on `meta-260704T0959Z`.

Projected: patch −19.8k, batch −2k, big-flat dedupe −9-11k, long-tail dedupe −4-6k ⇒ **82.5kB → ~45-47kB**.

**4.2 Hint pointer projection.** New builders `buildDiscoverabilityPointers()` / `buildProcessPointers()` in `core/loop-introspect.js` (same registry, same rule-derived skip semantics as `buildProcessHints`). Output: header line naming pull path + 26 `slug — suggestion` lines (~1.6-2k chars). Flip `session-start-inject-discoverability.cjs` + `session-start-inject-process-hints.cjs` to the new builders. Sidecar `session-context.json` keeps FULL text (pull payload unchanged; `*_source` degrade flags unchanged). Two-hook split retained (YAGNI: re-merge not needed at ~2k).

### Phase 2 — Context Observability

**4.3 Delivery classifier → runtime-state.jsonl.** New offline script `tools/scripts/delivery-classify.mjs`:
- Input: session transcripts (`~/.claude/projects/<slug>/*.jsonl`); per-call `usage.input_tokens` + recorded attachment inventory.
- Classify first-call delivery: `full` / `lean` / `unknown` (usage absent) against measured surface floors (hint payload ≈ 25KB rendered; MCP defs 82.5KB — recompute floors at run time from live `tools/list`).
- Write: `delivery-<sessionId>` **ledger-event** rows via core `appendLedgerEvent` (fingerprinted, same path dispatch-commit uses; NOT the preflight-gated MCP tool — mechanical recompute posture like `seed-file-index.mjs`). Fields: `source_ref: local:meta-state:meta-260719T2120Z-...`, `value` 1/0/null (full/lean/unknown), metadata `{first_call_input_tokens, recorded_attachment_bytes, model, classified_at}` (flat scalars per schema).
- **Idempotent by id**: skip existing `delivery-<sessionId>` rows (lesson from bc39002 same-id corruption; `verifyRow` on read).
- Read side: existing `runtime_state_read` — no new tooling. Post-hoc only (can never feed the session it classifies) — "loop knows" = *queryable*, not pushed. Fits pull doctrine.

**4.4 Unconditional pull pointer (D1).** Restructure `hooks/universal/inbound-gate.js`: always emit one line (~15-20 tokens) — `Loop steering (pull): loop_describe({tier:'warm'}) | hints: .claude/session-context.json | one: loop_get_instruction({key})` — then existing triggered soft-warning behavior unchanged. Every-prompt uniform emission (no state, no staleness).
- **Honesty flag:** the report VERIFIED the global UPS hook survives `syn`; project-level UPS (inbound-gate) rides the same channel but is strictly unverified → Phase 2 verification must confirm pointer visibility in a `syn`-profile session (transcript forensics). Fallback if stripped: document as known-degradation, no corrective loop (report rec 4).

### Phase 3 — Docs (operator addition, §5)

## 5. Vocabulary Promotion: "channel" → L2 (brainstorm's choice)

**Choice: L2 (contract surface), not L1.** Rationale:
- L1 (`docs/loop-engine.md`) holds mechanism-free engine roles/invariants (lowercase common nouns: agentic-step, deterministic-step, consult-gate, the two state axes). "Channel" is not an engine role — it names a *projection contract* between canonical content and a runtime surface.
- L2 (`docs/runtime-contract.md`) is where transport-agnostic boundary contracts live. A channel is exactly that: **a named projection of canonical content onto a runtime surface, with declared shape, char budget, provenance, and delivery-fidelity class (`full`/`lean`/`unknown`).** Gives `rule-runtime-agnostic-features` its vocabulary anchor: "every injected surface has a declared channel; fidelity is attested (classifier), not assumed."
- L3 realizes channels: `hint-renderer.js` CHANNELS map, hook emit paths, MCP `tools/list`.
- State-axis link (documented, not moved): state-2 = deterministic injection ⇒ *injection lands on a declared channel*; the finding's lesson = channel delivery fidelity varies per provider profile and must be measured at the endpoint.

Doc edits:
1. `docs/runtime-contract.md` (L2): new "Channels" section — term definition, the 4 current channels (SessionStart additionalContext ×2, UserPromptSubmit, MCP tools/list, session-context.json sidecar pull), fidelity classes + attestation path (classifier rows).
2. `docs/architecture.md` (L3): injection/delivery architecture section mapping channels to state axes; pointer + classifier mechanism.
3. `docs/mcp-tool-schema-architecture.md`: update zod→wire flow for JIT off-wiring + glossary.
4. `docs/loop-engine.md` (L1): one cross-ref line only (axes → L2 channel term). L1 otherwise untouched.

## 6. Success Metrics (hard budgets, R4)

| Metric | From | To | Measured by |
|---|---|---|---|
| MCP `tools/list` wire | 82,516B | **≤ 45,000B** | live `tools/list` (report's method) |
| SessionStart hint emission (loop-owned, both hooks) | ~11.8k chars | **≤ 6,000 chars** | hook stdout capture |
| `session-context.json` full-text payload | intact | intact (unchanged) | shape + `*_source` flag diff |
| Classifier rows | none | `delivery-<id>` for all recent sessions; re-run adds 0 duplicates | `runtime_state_read` + `verifyRow` |
| Pointer on lean path | n/a | visible in `syn`-profile session | transcript forensics |
| First-call `meta_state_patch` error rate | baseline (gate-log) | no sustained regression post-JIT | gate-log `invalid_field` frequency |
| Tests | green | green + new tests (pointer builders, JIT error payloads, classifier idempotency, inbound-gate always-emit) | `pnpm test:iter` |

## 7. Risks

1. **First-call error rate** on patch/batch rises without upfront field list — mitigated by field-name CSV + actionable error payloads; monitored via gate-log (metric above).
2. **Contract relocation vs `meta-260704T0959Z`** — schema description is the canonical contract; JIT keeps it invocation-complete at the boundary. Obligation: change-log entry + relationship note on the finding.
3. **Project-level UPS unverified on `syn`** — Phase 2 verification step; documented-degradation fallback.
4. **Classifier depends on provider `usage` fields** — `unknown` class is expected; sessions without usage also lack compliance metrics, so nothing to disambiguate.
5. **Runtime-state id uniqueness** — classifier skips existing ids (bc39002 lesson).
6. **Runtime-agnostic checklist** — JIT/glossary/pointer/inbound-gate changes touch universal surfaces; run `check_runtime_agnostic` at plan time (rule-runtime-agnostic-features).

## 8. Next Steps

1. Hand off to plan skill (TDD recommended — modifies tool schemas + hooks with heavy existing coverage).
2. Plan phases: P1 MCP JIT+glossary → P2 hint pointer projection → P3 classifier+inbound-gate pointer → P4 docs (L2 channel term) → P5 verification (measurement harness re-run, hard budgets).
3. On ship: resolve `meta-260719T2120Z` (remediation direction realized), log change-log for contract relocation, relationship-note `meta-260704T0959Z`.

## 9. Unresolved Questions

1. Native-Claude (unproxied) baseline still unmeasured — first unproxied session should run the classifier + wire measurement.
2. Exact strip point (harness flag vs proxy transform) — manual wire-capture probe, out of scope.
3. Glossary pull surface: `loop_describe` cold tier assumed; dedicated lookup tool is the fallback if cold-tier shape fights the content — decide at plan time.
