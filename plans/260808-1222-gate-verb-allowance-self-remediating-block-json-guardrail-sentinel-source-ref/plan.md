---
title: "gate-verb allowance self-remediating block + JSON guardrail + sentinel source_ref"
description: "Collapse the 15-call gate-verb observation discovery tax to 2 calls: self-remediating block message (A), CLI bare-key JSON guardrail (C), sentinel source_ref (D). B (loop_get_instruction key) is deferred via a new finding in Phase 4."
status: complete
priority: P1
effort: "1-2d"
tags: [gate-logic, gate-verb, dx, tdd]
created: 2026-08-08
---

# gate-verb allowance self-remediating block + JSON guardrail + sentinel source_ref

## Overview

Session `126e391e` (ak-ship of PR 120) spent **15 bash calls / ~2 min / ~0.9M uncached input tokens** recording a single `gate-verb:bash` observation. Root cause: the bash gate emits a block reason that names the disease ("Record an observation") but not the cure — no incantation, no `id==affected_system` rule, no `source_ref` format — so the agent reverse-engineers the fix from CLAUDE.md prose + `--schema` lookups + `meta-state.jsonl` greps every session. Finding `meta-260808T1217Z-gate-verb-allowance-discovery-tax-...` captures the friction.

This plan ships the three highest-leverage fixes (A, C, D) that turn the 15-call dance into 2 copy-paste calls. B (a `loop_get_instruction` key) is **not implemented here** — Phase 4 resolves the discovery-tax finding (its root causes are now addressed) and files a new finding so B is picked up next session.

### Scope decision (explicit assumption)

User instruction: "do A+C+D, the B need to be at the final step of the plan (resolve the finding and write a new one)." Read as: implement A+C+D now; the final step's deliverable is to **resolve** the discovery-tax finding and **write a new finding** for the remaining B gap. B itself is deferred. If the intent was to also implement B, add a Phase 5 before the resolve/re-file step.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A gate-verb block emits the exact 2-call incantation (verb substituted, fresh ISO timestamp, sentinel source_ref) | P1 |
| 2 | C CLI emits a quoted-keys hint when bare-key JSON is rejected | P2 |
| 3 | D `local:meta-state:gate-verb-allowance` is the sanctioned sentinel source_ref (documented + tested); no finding-id grep needed | P1 |
| 4 | Resolve the discovery-tax finding; file a new finding for B (missing `loop_get_instruction` key) | P1 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: Self-remediating gate-verb block message (A)](./phase-01-start.md) | Complete | — |
| 2 | [Phase 2: CLI bare-key JSON guardrail (C)](./phase-02-cli-bare-key-json-guardrail.md) | Complete | — |
| 3 | [Phase 3: Sentinel source_ref for gate-verb observations (D)](./phase-03-sentinel-source-ref-for-gate-verb-observations.md) | Complete | 1 |
| 4 | [Phase 4: Resolve discovery-tax finding + file B finding](./phase-04-resolve-discovery-tax-finding-file-b-finding.md) | Complete | 1, 2, 3 |

Phase 3 depends on Phase 1 (the block-message incantation uses the sentinel). Phases 1 and 2 are independent and may be done in parallel.

## Success Criteria

- [x] A blocked `gate-verb:<verb>` command returns a reason containing both `gate_mark_preflight({surface:"runtime-state"})` and a `runtime_state_record(...)` call with the substituted `<verb>`, a valid ISO timestamp, and `source_ref:"local:meta-state:gate-verb-allowance"`, plus the `id==affected_system` rule.
- [x] `loop.mjs <tool> '{surface:"x"}'` (bare keys) exits 2 with a message naming quoted keys as the fix; `{"surface":"x"}` parses unchanged.
- [x] `runtime_state_record` accepts `source_ref:"local:meta-state:gate-verb-allowance"`; the sentinel is named in field-glossary, hint-registry, and CLAUDE.md.
- [x] Finding `meta-260808T1217Z-...` is resolved; a new finding for the missing `loop_get_instruction` key B is open.
- [x] `pnpm test:one` green; no regression in existing gate-verb / CLI / runtime-state suites.
- [x] `check_runtime_agnostic` passes for the changed feature (shim-not-fork, cross-surface).

## Risk Assessment

- **Risk:** Enriched block reason bloats the agent's context on every block. **Mitigation:** keep the incantation to 2 lines + 1 rule line; only emitted on the `gate-verb:*` path (not docker/sudo), which is the rare path.
- **Risk:** Sentinel `source_ref` later breaks if a grounding check adds existence validation. **Mitigation:** Phase 3 test pins the sentinel's acceptance; add a note in field-glossary that the sentinel is intentionally non-resolving.
- **Risk:** Bare-key detection regex mis-fires on valid JSON containing `:` (e.g. URLs). **Mitigation:** only trigger on the SyntaxError path, and match the specific `{,]\s*[A-Za-z_]\w*\s*:` unquoted-key shape; test negative cases.

## Validation Log

### Validation Session 1 (2026-08-08)

**Interview decisions:**
1. **B scope** — Defer B; implement A+C+D only. Phase 4 resolves the discovery-tax finding and files a new finding for B (missing `loop_get_instruction` key) for next session. Confirms plan as written.
2. **D approach** — D1: non-resolving sentinel `local:meta-state:gate-verb-allowance`. D2 rejected: a real backing entry would either reintroduce the finding-id grep (timestamp ids) or require an out-of-scope reserved-stable-id schema change. D1 is lighter and preserves the friction-elimination goal; the acceptance test pins the sentinel as a contract.
3. **Resolve timing** — Phase 4 runs **post-merge**: resolve the discovery-tax finding only after Phases 1-3 are merged to main and green there. Avoids the finding being "resolved" while the code could still revert. Propagated to Phase 4.

### Verification Results
- Claims checked: 12
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Key verifications:
  - `gate-logic.js:1055` generic "No active observation" reason; `evaluate-bash-gate.js:156` expired-branch override ✓
  - `runtime-state-record-tool.js:65` source_ref regex `/^local:meta-state:.+$/` accepts the sentinel; `:115` `canonical_id_required` on `id!=affected_system` ✓
  - **`AFFECTED_SYSTEM_ENUM_RUNTIME` is dynamic** — built from `patterns.json["gate-verbs"]` → `gate-verb:<verb>` for every gate-verb (bash, node, zsh, python, …). Phase 1 verb-substituted incantation produces a recordable row for any blocked verb, not just bash ✓
  - runtime-state `source_ref` is NOT grounded against meta-state existence (`appendLedgerEvent` fingerprints only; `checkObservationExists` checks `affected_system`) — D1 is safe today ✓
  - `bin/loop.mjs:82` `parseJsonArg` + `:281` exit-2 catch path; `:191` `loadArgsFile` ✓
  - All test files exist: `evaluate-bash-gate.test.js`, `cli-bash-gate-guard.test.js`, `gate-verb-observation.test.js`, `runtime-tracking.test.js`, `cli-stderr-format.test.js` ✓

### Whole-Plan Consistency Sweep
- Re-read `plan.md` + all 4 `phase-*.md`. No stale terms, renamed APIs, or contradictions found.
- D1 decision consistent across plan.md (Risk), Phase 1 (incantation uses sentinel), Phase 3 (D1 is the approach), Phase 4 (resolution cites A+C+D).
- Post-merge decision propagated to Phase 4 (Overview + Implementation Steps + Risk). Phase 4 Overview updated to state resolve happens after merge to main.
- Zero unresolved contradictions. Plan is eligible for implementation.