---
title: "hint injection-policy + on-demand reclassification + gate-verb-allowance key"
description: "Collapse the hint triplication tax: add an injection-policy tier to HINT_REGISTRY (startup vs on-demand), reclassify 12 discoverability + 2 process hints on-demand, add the missing gate-verb-allowance key (finding meta-260808T1614Z), and dedup hint text against CLAUDE.md/AGENTS.md so no guidance is repeated and both stay minimal."
status: complete
priority: P1
effort: "1-2d"
tags: [discoverability, hints, gate-verb, dx, tdd]
created: 2026-08-08
---

# hint injection-policy + on-demand reclassification + gate-verb-allowance key

## Overview

The session-start stack is ~59kb: CLAUDE.md (4.0kb) + AGENTS.md (21.0kb) + `session-context.json` (10.6kb) + warm `loop_describe` (23.4kb). The hint payload alone is **triplicated** — the same guidance appears in warm `discoverability_hints`/`process_hints` (~8.3kb), `session-context.json` (re-injected **every turn**, ~5.9kb), and AGENTS.md/CLAUDE.md (the prose the hints are derived from). Every hint is always injected at full length regardless of whether the session ever uses it. This is the same class of per-session context tax the parent finding (`meta-260808T1217Z`) fought for gate-verb observation recording.

Two open findings converge here:
- `meta-260808T1614Z-loop-get-instruction-gate-verb-allowance-returns-unknown-hin` — `loop_get_instruction("gate-verb-allowance")` returns `Unknown hint key`. Split out as "B" from plan 260808-1222 / PR #121. Proposed fix: register a `gate-verb-allowance` key.
- The broader tax: 12 of 16 discoverability hints + 2 process hints are reference material the agent fetches when performing a specific later operation, not orientation it needs at second 0.

### The cascade (one mechanism, three wins)

The registry conflates two orthogonal concerns in the `kind` field: *what a hint is about* (`discoverability` vs `process`) and *when it is injected* (today: always, all of them). Decoupling with one **injection-policy field** (`tier: "startup" | "on-demand"`) is the single mechanism that:
1. places the new `gate-verb-allowance` key on-demand (the B finding);
2. reclassifies the 12 reference hints + 2 process hints on-demand; and
3. makes the dedup rule ("do not repeat; keep CLAUDE.md and AGENTS.md minimal") enforceable — a guidance claim lives in exactly one canonical surface.

**Startup-essential set (keep 4, trimmed to unique residue + pointer):** `loop-get-instruction` (the on-ramp/index to on-demand hints), `canonical-tool` (prevents first-action `node -e`/direct-file-IO mistakes), `surface-split` (the do-not-duplicate rule itself — must stay canonical), `phase-a-reframe` (the 4-kind mental model; worst triplication per audit, so trimmed hardest).

### Design decision: index always, full text on-demand

On-demand hints must stay **discoverable** — an agent that does not know a hint exists will never ask for it. So warm `loop_describe` keeps a `hint_index` (slug + one-line `suggestion` for **all** hints) while the full-text `discoverability_hints` array carries only the 4 startup-set hints. `loop_get_instruction({key})` returns the full text of any hint (startup or on-demand), unchanged. This makes the index the discovery surface and the registry the single source of full text.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `loop_get_instruction({key:"gate-verb-allowance"})` returns the 2-call incantation + `id==affected_system` rule + sentinel `source_ref` + the "promoted-rule denylist still applies during the allowance window" constraint (resolves the B finding; preserves the security constraint CLAUDE.md carries today) | P1 |
| 2 | An injection-policy `tier` field on `HINT_REGISTRY` entries, filtered at warm-injection sites only (loop-introspect warm, `.claude` universal hook, `.factory` forked hook); default `"startup"` so the mechanism ships inert. `listHints` `tier` param defaults to undefined (no-filter) — never `startup` | P1 |
| 3 | Warm `loop_describe` emits a `hint_index` (all slugs + suggestions) + full-text `discoverability_hints` for the 4 startup hints only. Cold `loop_describe` stays UNFILTERED (full history). The 12+2 on-demand hints are fetchable via `loop_get_instruction` but not auto-injected at warm | P1 |
| 4 | Reclassify 12 discoverability + 2 process hints on-demand; keep 4 startup (`internalization-rule` stays on-demand per keep-4 decision — its discoverability rides on `hint_index` + the `loop-get-instruction` startup pointer; promote back to startup if citation regression appears) | P1 |
| 5 | Dedup: trim each hint to unique residue + pointer to canonical doc; trim CLAUDE.md/AGENTS.md where the hint is canonical. No guidance repeated across surfaces. CLAUDE.md gate-verb paragraph → pointer (block message is the common-case entry point; proactive pre-block recording requires a `loop_get_instruction` call — accepted tradeoff for minimal CLAUDE.md) | P1 |
| 6 | `session-context.json` per-turn re-injection + the `.factory` stdout block carry startup pointers + `hint_index`, not on-demand full texts | P2 |
| 7 | Resolve finding `meta-260808T1614Z-...` strictly post-merge (branch on main); full suite green; runtime-agnostic audit + manual `.factory` verification (the audit has a `.factory/hooks/` blind spot) | P1 |
| 8 | `hint-renderer.js` (inspection tooling) stays UNFILTERED — operators can still preview all 17 hints | P2 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: Injection-policy mechanism + gate-verb-allowance key](./phase-01-start.md) | Done | — |
| 2 | [Phase 2: Reclassify existing hints on-demand](./phase-02-reclassify-existing-hints-on-demand.md) | Done | 1 |
| 3 | [Phase 3: Dedup hint text + minimal CLAUDE.md and AGENTS.md](./phase-03-dedup-hint-text-minimal-claudemd-and-agentsmd.md) | Done | 1, 2 |
| 4 | [Phase 4: Resolve finding, docs, runtime-agnostic audit, ship](./phase-04-resolve-finding-docs-runtime-agnostic-audit-ship.md) | In progress (merge + post-merge resolve) | 1, 2, 3 |

Phase 1 ships the mechanism inert (default `startup` → no behavior change) plus the first on-demand entry (the key). Phase 2 flips the 12+2 switches. Phase 3 is text/docs dedup (independent of tier logic). Phase 4 closes the loop. Phases must land in order on one branch.

## Invariants (load-bearing across all phases)

- **Slug + order are frozen.** `HINT_REGISTRY` order = injection order = numeric-index back-compat for `loop_get_instruction`. No rename, no reorder, no removal. All changes are **append-only** (`gate-verb-allowance` at index 16) + **tier-flipping** + **text-trimming**. Existing discoverability numeric indices 0–15 are unchanged (pinned by `loop-get-instruction.test.js`: `internalization-rule`→0, `reopens-script`→10, `narrow-query`→12). Adding the 17th discoverability row shifts the **process** numeric offset 16→17 (i.e. `loop_get_instruction({key:16})` resolves to `gate-verb-allowance`, not the first process row); this is allowed by the tool's "session-ephemeral" numeric contract — document it and update the stale `k - 16` comment at `loop-get-instruction.test.js:141` to use the dynamic `discoverabilityLen`.
- **`listHints` filter default is no-filter.** `loop_get_instruction`'s numeric resolution depends on `listHints({kind:"discoverability"})` (no `tier`) returning ALL discoverability entries (`loop-get-instruction-tool.js:87,61-67`). The new `tier` param MUST default to `undefined` (no filter), never `"startup"` — defaulting it to `"startup"` would silently shrink the list and break indices 4–15. Pin with a test: `listHints({kind:"discoverability"}).length === listHints({kind:"discoverability", tier:undefined}).length`.
- **Filter at warm-injection sites only — never the renderer, never the cold tier.** The `tier` filter is applied ONLY where startup vs on-demand injection matters: `loop-introspect`'s warm `buildDiscoverabilityHints`/`buildProcessHints`, the `.claude` universal session-start hook, and the `.factory` forked hook. The `hint-renderer.js` channels (inspection tooling — `:6-9`) stay UNFILTERED so operators can preview all 17 hints. The `loop_describe` cold tier ("full history" — `loop-describe-tool.js:44`) stays UNFILTERED — pass a `{tier}` arg into `buildHintBlocks` so warm filters and cold (`loop-describe-tool.js:274`) does not. `findHintBySlug`/`lookupBySlug` never filter.
- **Single source of full text.** `loop_get_instruction` resolves against the full unfiltered registry; warm injection + `session-context.json` + the `.factory` stdout block carry the filtered (startup) view + the `hint_index`.
- **`.factory` is a forked hook, not a universal hook.** `.factory/hooks.json:8` wires `.factory/hooks/loop-surface-inject.cjs` (calls `buildDiscoverabilityHints()`/`buildProcessHints()` at `:134,:143`, emits via `formatBlock`, writes no `session-context.json`). `.mastracode/hooks.json` wires no hint injection at all. The "universal hooks cover all runtimes" claim is FALSE for hint injection — `.factory` must be modified in lockstep, and `.mastracode` relies on `loop_describe` for discovery.
- **Sentinel is non-resolving.** `local:meta-state:gate-verb-allowance` is the sanctioned sentinel for gate-verb budget-state rows (plan 260808-1222 / D). The new hint names it; it stays intentionally non-resolving.
- **All `meta-state.jsonl` writes via loop tools.** Finding resolution goes through `meta_state_resolve` (CLI), never direct file edits.

## Success Criteria

- [ ] `loop_get_instruction({key:"gate-verb-allowance"})` returns a hint whose `text` contains `gate_mark_preflight({surface:"runtime-state"})`, a `runtime_state_record` call with a `<verb>` placeholder, `id` MUST equal `affected_system`, `source_ref:"local:meta-state:gate-verb-allowance"`, AND "the promoted-rule denylist still applies during the allowance window" — pinned by a new test.
- [ ] `gate-verb-allowance` is **not** in warm `discoverability_hints`; it **is** in `hint_index`.
- [ ] Warm `discoverability_hints` contains exactly the 4 startup slugs (`loop-get-instruction`, `canonical-tool`, `surface-split`, `phase-a-reframe`); warm `process_hints` is empty (both moved on-demand); `hint_index` lists all 19 registry slugs (16 original discoverability + `gate-verb-allowance` + 2 process standalone) — rule-derived process hints are discoverable via `process_hints`/the index merge.
- [ ] Cold `loop_describe` `discoverability_hints` stays at 16 (unfiltered — full history); `hint-renderer` provenance stays unfiltered (all 17 discoverability + process).
- [ ] `listHints({kind:"discoverability"})` (no `tier`) returns all 17; `listHints({kind:"discoverability", tier:"startup"})` returns 4. Pinned: `listHints({kind:"discoverability"}).length === listHints({kind:"discoverability", tier:undefined}).length`.
- [ ] `loop_get_instruction` numeric indices 0–15 unchanged; `gate-verb-allowance` at 16; process offset shifts 16→17 (documented; stale `k - 16` comment updated).
- [ ] `.factory/hooks/loop-surface-inject.cjs` emits `hint_index` (or writes the sidecar) — verified by a `.factory` test, not just `check_runtime_agnostic` (which has a `.factory/hooks/` blind spot).
- [ ] No hint's full `text` is a verbatim duplicate of a CLAUDE.md/AGENTS.md prose passage beyond a pointer line — pinned by a dedup-invariant test (operational tool-call substrings allowlisted; scoped to prose, not any 60-char run).
- [ ] CLAUDE.md gate-verb paragraph trimmed to a pointer to the hint + the block message; AGENTS.md §1/§2/§3 trimmed where the hint is canonical. The pre-block discovery tradeoff is documented.
- [ ] Finding `meta-260808T1614Z-...` is `resolved` strictly post-merge (branch on main).
- [ ] `pnpm test` green; `check_runtime_agnostic` 6/6 on changed `core/` + universal-hook files PLUS a manual `.factory` verification (the audit's `.factory/hooks/` blind spot is noted).

## Risk Assessment

- **Risk: `.factory` runtime silently loses on-demand discoverability.** `.factory/hooks/loop-surface-inject.cjs` is a forked hook (not universal) and emits via `formatBlock` with no `hint_index`. *Signal:* a `.factory` session blocked on a gate-verb cannot discover `gate-verb-allowance` (the very finding this plan resolves). *Response:* Phase 1 modifies the `.factory` hook to emit `hint_index` (or write the sidecar); Phase 4 verifies it manually since `check_runtime_agnostic` has a `.factory/hooks/` blind spot.
- **Risk: the cold tier and the renderer get filtered by mistake.** The `tier` filter must apply ONLY to warm injection. *Signal:* cold `loop_describe` `discoverability_hints` shrinks 16→4, or the renderer's provenance drops on-demand rows. *Response:* the Invariants pin "warm-only filter"; `buildHintBlocks` takes a `{tier}` arg (warm filters, cold doesn't); the renderer stays unfiltered. Tests pin cold-stays-16 + renderer-stays-17.
- **Risk: `listHints` `tier` param defaults to `"startup"`** (by analogy with the field default), silently shrinking `loop_get_instruction`'s discoverability list and breaking numeric indices 4–15. *Signal:* `loop_get_instruction({key:12})` returns the wrong hint. *Response:* the Invariants pin "default = undefined (no-filter)"; a test asserts `listHints({kind:"discoverability"}).length === listHints({kind:"discoverability", tier:undefined}).length`.
- **Risk: the promoted-rule denylist constraint is lost when CLAUDE.md trims.** *Signal:* an agent records a gate-verb allowance then attempts a denylisted command, confused it's still blocked. *Response:* the `gate-verb-allowance` hint text spec explicitly carries "the promoted-rule denylist still applies during the allowance window" (Phase 1).
- **Risk: `internalization-rule` on-demand causes citation regression.** It's the `evidence_code_ref` pattern used by every `meta_state_report`. *Signal:* post-merge `meta_state_report` calls omit `evidence_code_ref`. *Response:* keep-4 decision stands (per user); `internalization-rule` rides on `hint_index` + the `loop-get-instruction` startup pointer. If citation regression appears post-merge, promote `internalization-rule` back to `tier:"startup"` (one field flip). The tradeoff is documented in Phase 2.
- **Risk: trimming AGENTS.md/CLAUDE.md removes guidance the agent relies on (high blast radius — steering prompt).** *Signal:* a post-merge session makes a wrong first meta-state action. *Response:* Phase 3 trims **only** the dedup-audit-flagged passages (canonical-home assignments in `plans/reports/dedup-audit-260808-2011-hints-vs-agents-claude.md`); every trim moves content to its named canonical home, never deletes it.
- **Risk: CLAUDE.md gate-verb trim re-introduces a (smaller) discovery tax for proactive pre-block recording** (the parent finding fought this). *Signal:* an operator pre-recording an allowance must make a `loop_get_instruction` call instead of reading CLAUDE.md. *Response:* accepted tradeoff for minimal CLAUDE.md; the block message remains the common-case (blocked) entry point. Documented in Phase 3.
- **Risk: many count/shape assertions across ~7 test files.** *Signal:* test failures referencing `=== 16`, `=== 18`, destructure crashes, inclusion loops. *Response:* Phase 1 + Phase 2 update these structurally (not just count bumps) — `loop-describe-warm-tier.test.js:32-98` (16-element destructure → rewrite to 4 + on-demand via `loop_get_instruction`), `hint-registry.test.cjs:154-157` (inclusion loop → startup-tier only), `claude-code-mcp-loading.test.cjs:49-50` (`evidence_code_ref` → via `loop_get_instruction`), `hint-registry.test.cjs:176` + `hint-renderer.test.cjs:106` (18→19). Broaden the grep to `=== 16|18|12|17|19`.
- **Risk: resolving the finding before merge (the 260808-1222 lesson).** *Signal:* finding `resolved` but the branch reverts. *Response:* Phase 4's `meta_state_resolve` is a hard post-merge step (precondition: branch on main), not a risk-note fallback.

## Validation Log

_Validation pending (run `/ak:plan validate` after review)._

## Dedup audit reference

Per-hint canonical-home assignments live in `plans/reports/dedup-audit-260808-2011-hints-vs-agents-claude.md` (produced by the scouting audit). Phase 3 implements those assignments; do not re-derive them.

## Red Team Review

### Session — 2026-08-08
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier). All findings carried `file:line` evidence; none auto-rejected.
**Findings:** 17 (17 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 9 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `.factory/hooks/loop-surface-inject.cjs` forked hook missed; "no per-runtime fork" claim false | Critical | Accept | Phase 1, plan.md Invariants |
| 2 | `loop-describe-tool.js` cold-tier path unaddressed; `buildHintBlocks` shared warm+cold | Critical | Accept | Phase 1 |
| 3 | Renderer filter-vs-provenance contradiction; renderer is inspection tooling | High | Accept | Phase 1, plan.md Invariants |
| 4 | Promoted-rule denylist constraint dropped by CLAUDE.md trim; not in hint spec or block message | High | Accept | Phase 1 (hint spec) |
| 5 | Missed test `claude-code-mcp-loading.test.cjs:49-50` (`evidence_code_ref` in warm) | High | Accept | Phase 2 |
| 6 | `loop-describe-warm-tier.test.js:32-98` 16-element destructure crashes (not a count bump) | High | Accept | Phase 2 |
| 7 | `hint-registry.test.cjs:154-157` inclusion loop breaks (structural) | High | Accept | Phase 2 |
| 8 | Missed `=== 18` assertions (`hint-registry.test.cjs:176`, `hint-renderer.test.cjs:106`) — Phase 1, 18→19 | High | Accept | Phase 1 |
| 9 | `check_runtime_agnostic` blind spot at `.factory/hooks/` | High | Accept | Phase 4 |
| 10 | `listHints` `tier` param default unpinned — footgun for numeric indices | High | Accept | Phase 1, plan.md Invariants |
| 11 | `hint_index` excludes rule-derived process hints | Medium | Accept | Phase 1 |
| 12 | Process numeric index shift 16→17 undocumented; stale `k - 16` comment | Medium | Accept | Phase 1, plan.md Invariants |
| 13 | `buildHintIndex` duplicates existing `buildDiscoverabilityPointers` | Medium | Accept | Phase 1 |
| 14 | Dedup-invariant 60-char threshold false-positives on tool-call recipes | Medium | Accept | Phase 3 |
| 15 | Post-merge resolve timing a note, not enforced | Medium | Accept | Phase 4 |
| 16 | `internalization-rule` on-demand citation-regression risk (keep-4 tradeoff) | High | Accept (documented tradeoff) | Phase 2, plan.md Risks |
| 17 | CLAUDE.md gate-verb trim re-introduces pre-block discovery tax (minimal-CLAUDE.md tradeoff) | Medium | Accept (documented tradeoff) | Phase 3, plan.md Risks |

**Key risks addressed:** the two Criticals were both scope omissions — the `.factory` forked hook and the cold-tier `loop_describe` path — both silently shrink hint injection across a whole runtime/tier. The Highs close the renderer contradiction, a dropped security constraint, four missed test files/assertions, and a numeric-index footgun. The two tradeoffs (findings 16, 17) respect explicit user decisions (keep-4, minimal CLAUDE.md) and are documented rather than silently applied.

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-start.md, phase-02-reclassify-existing-hints-on-demand.md, phase-03-dedup-hint-text-minimal-claudemd-and-agentsmd.md, phase-04-resolve-finding-docs-runtime-agnostic-audit-ship.md
- **Decision deltas checked:** 12 (renderer-unfiltered, cold-unfiltered, `.factory` fork scope, `listHints` no-filter default, process offset 16→17, denylist in hint spec, structural test rewrites, dedup prose-scope + allowlist, post-merge resolve precondition, `buildHintIndex` reuse, `hint_index` rule-derived merge, keep-4/internalization-rule tradeoff, CLAUDE.md trim tradeoff)
- **Reconciled stale references:** 0 (the only matches for "no per-runtime fork" / "no logic changes" are the Red Team table + the Phase 2 risk that explicitly negate them — intentional)
- **Unresolved contradictions:** 0
- **Count reconciliation:** hint_index = 19 (17 discoverability [4 startup + 13 on-demand] + 2 process standalone); warm `discoverability_hints` = 4; cold + renderer = unfiltered (17 + process). Consistent across plan.md goals/success-criteria and all 4 phases.