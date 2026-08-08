---
phase: 3
title: "Dedup hint text + minimal CLAUDE.md and AGENTS.md"
status: done
priority: P1
effort: "3-4h"
dependencies: [1, 2]
---

# Phase 3: Dedup hint text + minimal CLAUDE.md and AGENTS.md

## Overview

Implement the dedup audit's per-hint canonical-home assignments so no guidance is repeated across the hint registry, CLAUDE.md, and AGENTS.md. Each claim lives in exactly one canonical surface; the others carry at most a one-line pointer. This is text + docs only — no `tier`, slug, or order changes. CLAUDE.md and AGENTS.md are trimmed to minimal (quick-reference pointers for CLAUDE.md; steering shape for AGENTS.md), with the hint registry as the on-demand canonical for operational recipes.

## Requirements

- Functional: per the audit (`plans/reports/dedup-audit-260808-2011-hints-vs-agents-claude.md`), apply these canonical-home assignments:
  - **Trim hint → pointer to AGENTS.md/CLAUDE.md:** `internalization-rule` (→ AGENTS.md §2), `source-refs` (general → AGENTS.md §2; sentinel → keep, CLAUDE.md trims), `status-lifecycle` (vocabulary → AGENTS.md §1 table; keep only re_verify/touch operational residue), `phase-a-reframe` (bound/unbound → AGENTS.md §1; records-via-tools → CLAUDE.md; keep only a one-line startup orientation pointer — it is a startup hint), `loop-get-instruction` (keep the tool pointer + the on-demand index framing; drop the meta-state/product/substrate framing → AGENTS.md §1).
  - **Keep hint canonical; trim AGENTS.md/CLAUDE.md:** `mechanism-check` (trim AGENTS.md §2 step-3 aside to a pointer), `derive-refresh` (trim AGENTS.md §2 step-3 tool-name restatement), `surface-split` (no trim — canonical, the do-not-duplicate rule), `canonical-tool` (no trim — canonical 4-question framework), `pnpm-test-discipline` (no trim — hint owns test-runner discipline; AGENTS.md §3 gate table + CLAUDE.md gate-verb paragraph keep their distinct facets), `file-edit-drift-and-fingerprints` (no trim — hint owns general drift; AGENTS.md §3 keeps fallow-specific).
  - **Keep as-is (unique content, no counterpart):** `designs-no-code`, `reopens`, `reopens-script`, `rule-lifecycle`, `narrow-query`, `session-id-query`, `runtime-agnostic-features`.
- Functional: CLAUDE.md gate-verb paragraph trimmed to a minimal pointer — the incantation now lives canonically in the `gate-verb-allowance` hint (on-demand) and the block message (dynamic, at block-time). CLAUDE.md points to both: "to record a gate-verb allowance, call `loop_get_instruction({key:'gate-verb-allowance'})` or copy the block message."
- Non-functional (documented tradeoff, red-team #17): trimming CLAUDE.md re-introduces a smaller discovery tax for **proactive pre-block** recording — an operator who pre-records an allowance before any block fires must make a `loop_get_instruction` call instead of reading CLAUDE.md. This is the accepted tradeoff for minimal CLAUDE.md (per user decision); the block message remains the common-case (blocked) entry point, so the blocked path — the path the parent finding fought — stays zero-discovery. State this tradeoff explicitly in the trimmed CLAUDE.md paragraph or a docs note.
- Functional: AGENTS.md §1/§2/§3 trimmed only where the audit named the hint canonical (mechanism-check, derive-refresh asides). No wholesale rewrite — only the flagged passages move.
- Non-functional: every dedup trim **moves** content to its named canonical home; nothing is deleted outright. A reader of any one surface still has the full picture via the pointers.
- Non-functional: no slug/order/`tier` changes. `surface-split` (the do-not-duplicate rule) stays canonical — removing it would delete the rule that mandates this phase.

## Architecture

Two surfaces, one canonical home per claim:
- **AGENTS.md** — steering shape: the 4-kind union, the internalization rule, the gate table, the surfaces. Trimmed of operational recipes the hints own.
- **Hint registry** — operational recipes (mechanism-check, derive-refresh, pnpm-test-discipline, file-edit-drift, the unique-content set) + the `gate-verb-allowance` incantation. On-demand (Phase 2) except the 4 startup pointers.
- **CLAUDE.md** — minimal quick-reference pointers (records-via-tools, budget, gate-verb pointer, tool-surface, audit-trail). Trimmed of the gate-verb incantation prose.

The `gate-verb-allowance` hint's `text` is the canonical static incantation; `evaluate-bash-gate.js`'s block message is the canonical dynamic emitter (fresh timestamp + substituted verb). These two are not duplicates — one is a static reference, one is a dynamic gate output. CLAUDE.md is the redundant third copy → trimmed to a pointer.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (`text`/`suggestion` trims on the named rows; no slug/order/`tier` edits)
- Modify: `AGENTS.md` (trim §2 step-3 mechanism-check + derive-refresh asides to pointers; no other §1/§3 changes unless the audit named them)
- Modify: `CLAUDE.md` (trim the gate-verb paragraph to a pointer; keep the other quick-reference bullets)
- Reference: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (the dynamic block message — no change; a test asserts the shared incantation substring with the hint)
- Reference: `plans/reports/dedup-audit-260808-2011-hints-vs-agents-claude.md` (the canonical-home assignments)

## Implementation Steps (TDD — tests first)

1. **Write a dedup-invariant test** in `__tests__/hint-registry.test.cjs`: for each trimmed hint, assert its `text` no longer contains the verbatim duplicated passage (e.g. `phase-a-reframe.text` does not contain `"The meta-surface is the only bound surface"` verbatim; `loop-get-instruction.text` does not contain the meta-state/product/substrate framing). Assert each trimmed `text` still contains its unique-residue pointer (e.g. `phase-a-reframe.text` contains a pointer to `AGENTS.md §1`).
2. **Write a cross-surface dedup test** (new file `__tests__/hint-dedup-invariant.test.cjs`): load `AGENTS.md` + `CLAUDE.md` + `HINT_REGISTRY`; for each hint, assert no hint's full `text` is a substring of AGENTS.md or CLAUDE.md **prose passage** (full sentences) beyond a configurable threshold, except the 4 startup pointers whose pointer line references the docs by name. **(red-team #14)** Do NOT use a raw 60-char run — it false-positives on shared tool-call recipes (e.g. `meta_state_re_verify({ id, refresh: true })` appears in both `status-lifecycle`'s residue and AGENTS.md §1, which is intended). Scope the check to PROSE passages (sentence boundaries), and allowlist specific operational substrings (`meta_state_re_verify({ id, refresh: true })`, `meta_state_touch({ id })`, `loop_get_instruction`, `meta_state_list`) that are tool-call recipes, not prose duplication. This is the durable invariant that prevents re-duplication.
3. **Write a test** asserting the `gate-verb-allowance` hint `text` and the `evaluate-bash-gate.js` block message share the canonical substring (`gate_mark_preflight({surface:"runtime-state"})` + `runtime_state_record` + `local:meta-state:gate-verb-allowance`), and that CLAUDE.md no longer contains the full incantation (only the pointer line).
4. Update existing tests that assert the old (pre-trim) hint substrings: `loop-describe-warm-tier.test.js` destructures + checks substrings of the 4 startup hints — update the expected substrings to the trimmed text. `hint-registry.test.cjs` content checks — update.
5. Run → red. Implement: trim the named hint `text`/`suggestion` fields per the audit; trim CLAUDE.md's gate-verb paragraph; trim the AGENTS.md §2 asides.
6. Run `pnpm test:one` on the affected suites → green. Then `pnpm exec vitest --changed`.
7. Re-ground: `meta_state_refresh_file_index({ path: "AGENTS.md" })` + `({ path: "CLAUDE.md" })` if any finding cites those paths (the loop fingerprints them). `check_runtime_agnostic` on `hint-registry.js` (text trims are data, runtime-agnostic).

## Success Criteria

- [ ] No hint's full `text` duplicates an AGENTS.md/CLAUDE.md passage beyond the pointer threshold — pinned by `hint-dedup-invariant.test.cjs`.
- [ ] CLAUDE.md gate-verb paragraph is a pointer; the incantation lives in the `gate-verb-allowance` hint + the block message.
- [ ] AGENTS.md §2 trims only the mechanism-check + derive-refresh asides; §1/§3 unchanged except audit-named moves.
- [ ] Every trimmed claim moved to its canonical home (no content deleted); the 4 startup hints are short orientation pointers.
- [ ] `gate-verb-allowance` hint and block message share the canonical substring; CLAUDE.md does not contain the full incantation.
- [ ] `pnpm test:one` green; `vitest --changed` green.

## Risk Assessment

- **Risk: trimming AGENTS.md/CLAUDE.md breaks the steering the agent relies on (highest blast radius — these are the priority-1 prompt).** *Signal:* a post-merge session makes a wrong first meta-state action attributable to missing steering. *Response:* trim **only** the audit-flagged passages; every trim moves content to a named canonical home (a pointer in the other surface), never deletes. If a trim removes load-bearing steering, restore that passage and mark the hint as the redundant copy instead. Prefer under-trimming over over-trimming in this phase; the dedup-invariant test catches residual duplication without forcing aggressive cuts.
- **Risk: the dedup-invariant test's substring threshold is too strict (false positives on common phrases like "meta-state").** *Signal:* the test fails on passages that are not real duplication. *Response:* tune the threshold (60-char run) and allowlist the pointer-line exceptions; the test targets verbatim passage duplication, not vocabulary overlap.
- **Risk: trimming a hint's `text` removes content a test asserts verbatim.** *Signal:* `loop-describe-warm-tier.test.js` / `hint-registry.test.cjs` substring assertions fail. *Response:* update those assertions to the trimmed unique-residue text in the same commit; the test is asserting the new canonical content.
- **Risk: `reopens`/`reopens-script` merge (audit's open question) drifts into this phase.** *Signal:* scope creep into slug merging. *Response:* out of scope — merging slugs changes `loop_get_instruction` index semantics and is a separate finding. Leave both slugs as-is (unique content) for this plan.