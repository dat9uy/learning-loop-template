# Next-Move + Findings Triage (post Rec 4/5/6 ship)

**Date:** 2026-07-09
**Trigger:** operator — "Rec 4/5/6 done in PRs #42/#43; update the 260704-0105 reframe report, decide next, take part in recent open findings."
**Skill:** problem-solving (Simplification Cascade + Meta-Pattern Recognition).
**Evidence base:** `meta-state.jsonl` open-findings scan (25 open), git log (#42 `09f7e8a`, #43 `89fb6f2`), `evaluate-inbound-gate.js`, `intake-agent.js`, plan `260708-2258-deprecate-intake-chain/plan.md` UQ1.

---

## What shipped (Rec 4/5/6) — verified

| Rec | PR | Verification |
|---|---|---|
| 4 — deprecate deterministic intake chain | #42 `09f7e8a` | `workflow_intake_orient`/`workflow_intake_plan` deleted; `loop_describe` retained as bound-surface orient; per-file change-logs in-PR |
| 5 — `legacy/` rename | #43 `89fb6f2` | `tools/legacy/`→`tools/handlers/`; `mastra/legacy-handler-adapter.js`→`mastra/handler-adapter.js` (`server.js:9` `import { adaptLegacyHandler } from "./handler-adapter.js"`); `hooks/legacy/`, `scout/legacy/` renamed. UQ4 resolved = `handlers/` |
| 6 — L1 memory-substrate paragraph | #43 `89fb6f2` | `loop-engine.md:40` now "three stores realize it: `meta-state.jsonl` … `runtime-state.jsonl` … `file-index.jsonl`" |

The 260704-0105 reframe report is updated in place (reconciliation section, Rec 4/5/6 markers, UQ4). Remaining report-level open items: Rec 9 (triage consult-gate, deferred), Rec 3 / UQ1-3 (promotion-candidate query shape, undesigned).

---

## Open findings scan (25 open)

By category: loop-anti-pattern 19, mcp-tool-missing 3, budget-check 2, schema-drift 1. By system: mcp-tools 10, meta 6, gate-logic 5, meta-state-tools 3, vnstock 1. All status=`open` (the reported/stale/active collapse from PR #38 landed — no legacy statuses).

### Meta-pattern (recurs 3+ times)

The same shape recurs across the recent findings: **a surface emits its full internal inventory inline into agent/operator context, when a scoped pointer would do.** Three instances:

| Instance | Surface | Inline dump | Pointer that collapses it |
|---|---|---|---|
| `meta-260708T2338Z` inbound-state-gate | `evaluate-inbound-gate.js` `buildContextMessage` | full stale-observation id list (with dupes, re-fires every msg) | one-line scoped, deduped, rate-limited, surface-scoped pointer |
| `meta-260704T1014Z` MCP tool defaults | `meta_state_list`/`runtime_state_read` | ~72KB verbose default on exploratory call | compact-by-default + narrow-query path |
| `meta-260709T0159Z` intake_agent | `intake-agent.js` step 1 | re-derives `loop_describe` orient inline | drop the redundant orient half; keep plan-synthesis |

**Universal principle:** *emit a pointer to where the data lives, not the data.* The loop already has the bound-surface read primitives (`loop_describe`, `meta_state_list`, `runtime_state_read`); surfaces that re-dump their output inline duplicate a query the caller can run themselves. This is the same recursion principle as the shipped `stale-ref` collapse (PR #38: don't record what you can derive) — now appearing at the *emission* layer, not the *recording* layer.

---

## Triage of the 6 most recent open findings

| id | cat/sys | class | next-move verdict |
|---|---|---|---|
| `meta-260709T0159Z` intake_agent redundancy | loop-anti-pattern/mcp-tools | **decision** (Rec 4 UQ1) | **Recommended next** — slim. Continuity with #42, lowest-risk, self-contained. See below. |
| `meta-260708T2338Z` inbound-state-gate re-fire + dump | loop-anti-pattern/gate-logic | **defect** (active context leak) | **Recommended parallel** — concrete simplification cascade, fix direction specified. See below. |
| `meta-260708T0355Z` M2 single-writer gate groups 3 heterogeneous files | loop-anti-pattern/gate-logic | **debate** | Defer — needs per-file gate-rule debate + post-merge regeneration design. Not a quick fix. |
| `meta-260704T1213Z` transport not promoted to L1 (close-flow cornered-agent) | loop-anti-pattern/meta | **architectural debate** | Defer — the unified plan; high-value high-scope. Resolves with `meta-260704T1010Z`. Do not start without explicit operator decision. |
| `meta-260704T1010Z` close-flow chat bullets ephemeral | loop-anti-pattern/meta | **mechanism choice** | Defer — pairs with the transport-L1 debate; mechanism (resolution-evidence-required rule vs consult-checklist vs SessionStart block) is a separate workstream. |
| `meta-260704T1014Z` MCP tool verbose defaults | loop-anti-pattern/mcp-tools | **mechanism choice** | Defer — three mechanism options (tool flip / promoted consult-rule / first-call advisory); evidence argument done, mechanism is a workstream. Same meta-pattern as the inbound-gate fix — if that fix lands, this one's mechanism is partly informed. |

Other older findings (`meta-260614T1236Z` unarchive path missing, `meta-260623T1126Z` relationships graph unidirectional on reopens, `meta-260626T1419Z` supersede silent-persistence-fail, `meta-260619T2233Z`/`2237Z` log_change/report silent-fail class, `meta-260615T1148Z` runtime-agnostic pattern not codified) are real but lower-recency and not the next-move candidates here.

---

## Recommended next move

### Primary: `intake_agent` slim (Rec 4 UQ1, `meta-260709T0159Z`)

**Why:** it is the explicit UQ1 of the just-shipped Rec 4 plan, filed today, with touch points already enumerated. It is a *decision* finding, not a defect — "taking part" means making the slim/delete/keep call.

**Decision: slim** (option (a) in the finding). Reasoning, via Simplification Cascade:
- `intake-agent.js:9` step 1 is literally `Call mastra_loop_describe({ tier: "warm" })`. The orient half is **fully redundant** with `loop_describe` — the bound-surface orient retained by the deprecate-intake-chain plan.
- The plan-synthesis half (rank drift findings, emit ordered verification steps, hand-off note) **adds value** `loop_describe` alone does not — `loop_describe` is a snapshot, not an LLM plan. So the redundancy is partial, not total → slim, not delete.
- One insight (loop_describe covers orient) eliminates the redundant framing + step 1 and the "orient an operator into the current meta-state" preamble, keeping the LLM plan-synthesis role. This is the same move the deprecate plan made for the deterministic pair, now applied to the agentic surface's redundant half.

**Touch points (from the finding):** `agents-manifest.json` (intake_agent entry), `mastra/agents/instructions/intake-agent.js`, `mastra-code-smoke.test.cjs:85` (namespacing example), `baselines/fallow/dead-code-baseline.json:61` (intake-agent.js entry). Plus per-file Rec 12 change-logs for the bound-artifact edits (the instruction file + manifest), in-PR.

**Scope guard:** slim ≠ delete. Keep `intake_agent` live in the MCP tool list; only drop the redundant orient framing. If the operator judges they reliably read `loop_describe` warm tier + `meta_state_list` themselves, **delete** becomes viable — but that is a stronger call and should be a separate operator decision, not assumed.

### Parallel candidate: inbound-state-gate context-leak fix (`meta-260708T2338Z`)

**Why:** it is a real, observed-this-session context leak (44-line `vnstock-device-slot-*` dump injected twice with dupes), not just a smell. The fix direction is already specified as a simplification cascade: emit a one-line scoped, deduped, rate-limited pointer ("N stale active observations detected (surfaces: vnstock); review via meta_state_list / runtime_state_read; inline list suppressed (already surfaced this session)") instead of the full inline dump.

**Mechanism:** `core/evaluate-inbound-gate.js:33-45` `buildContextMessage` — add dedup (`new Set(ids)`), a per-session once-token (suppress re-fire), and surface-scope (only list surfaces relevant to the current task, or just count + pointer). Line 64-66 fire path stays, but emission shrinks.

**Risk:** low — gate is `warn`-only (never blocks); shrinking emission cannot widen blast radius. The open sub-question (surface-relevance gating vs dedup+rate-limit only) is a design choice for the plan, not a blocker.

**Bundling:** independent of the intake_agent slim — different files, no shared edit. Could be one PR (two findings, both L3 hygiene, same meta-pattern) or two. Recommend **two PRs** for clean revert per the per-finding change-log practice.

### Why not the higher-scope findings now

- **transport-L1 (`meta-260704T1213Z`) + close-flow (`meta-260704T1010Z`)** — the unified architectural plan. High value, but it is a debate that spans both surfaces (is MCP the correct transport for the audit-trail state machine?) and ships a CLI adapter + resolution-evidence gate. Starting it is a real commitment with reversibility risk; it needs an explicit operator go, not an inference from "take part in findings."
- **M2 single-writer gate (`meta-260708T0355Z`)** — the finding itself says "debate carefully": per-file gate rules vs grouped; CI post-merge `seed-file-index` step vs keep `file-index.jsonl`+`runtime-state.jsonl` tracked. The current state (files tracked on main AND listed in `.gitignore`) is itself a smell to resolve in that plan. Not a quick fix.
- **MCP verbose defaults (`meta-260704T1014Z`)** — mechanism is a workstream; doing the inbound-gate fix first informs it (same emission-meta-pattern), so sequencing it after is natural.

---

## Unresolved questions

1. **intake_agent slim vs delete.** Recommended slim (keep plan-synthesis). Does the operator want delete on the table now, or defer that call until after slim lands and we observe whether anyone invokes `ask_intake_agent` for the plan-synthesis half?
2. **Bundle or split.** Two PRs (intake_agent slim; inbound-gate fix) vs one. Recommend split for clean per-finding revert — confirm.
3. **Inbound-gate surface-relevance gating.** Should the pointer gate on surface-relevance to the active task (harder — needs task→surface map), or just dedup + rate-limit + count (simpler, ships now)? Recommend the simpler now; surface-relevance as a follow-up if cross-surface noise persists.
4. **Does starting the transport-L1 / close-flow unified plan now make sense?** It is the highest-value remaining architectural move but the highest-scope. Defer until the operator explicitly scopes it — or carve the CLI-adapter unblock (close-flow runs in shell, survives MCP death) out as a near-term mitigation while the debate stays open? That carve is itself a scoped decision worth offering.

---

## Suggested next action

Cut two small plans (or one combined) for the primary + parallel candidates:
- `plans/260709-<time>-intake-agent-slim/` — Rec 4 UQ1; drop redundant orient framing from `intake-agent.js`, keep plan-synthesis; per-file change-logs in-PR.
- `plans/260709-<time>-inbound-gate-emission-collapse/` — `meta-260708T2338Z`; dedup + per-session rate-limit + pointer-instead-of-dump in `evaluate-inbound-gate.js`; change-log in-PR.

Both are L3 hygiene, lowest-risk, same meta-pattern (emit a pointer, not the data). The higher-scope findings (transport-L1, M2 gate) wait for an explicit operator scope decision.