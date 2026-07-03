---
phase: 5
title: "Rewrite AGENTS.md thin + citations + trajectory.md compaction"
status: pending
effort: "1d"
priority: P1
dependencies: [2, 3, 4]
---

# Phase 5: Rewrite AGENTS.md thin + citations + trajectory.md compaction

## Overview
Rewrite `AGENTS.md` as a thin root entry doc that keeps the load-bearing §1/§1.1 phrases verbatim (so the 2 structural tests pass) + the 4-kind union, and points into `docs/` for depth. Then update every citation of archived AGENTS sections (agent-instruction files, `loop-introspect.js`, `loop-get-instruction-tool.js`, `CLAUDE.md` inbound-gate, `trajectory.md` Bridges table, README doc-table, docs citing `AGENTS.md §N`). Finally, **compact `docs/trajectory.md`** — drop its self-contradicting changelog sections, strip date-stamped status snapshots, and de-duplicate against `loop-engine.md` (L1) so it stays a compact L0 destination doc.

## Requirements
- Functional: `AGENTS.md` rewritten thin — §1 ("Core", "Mastra shell", "Runtime interface") + §1.1 shell path (`tools/learning-loop-mastra/mastra/`) + path-invariant sentence verbatim; lowercase `meta-surface` / `4-kind` / `product surface` present; 4-kind union; pointers to `docs/loop-engine.md`, `docs/runtime-contract.md`, `docs/architecture.md`, `docs/meta-state-lifecycle.md`, `docs/trajectory.md`. All citations of archived sections repointed.
- Non-functional: the 2 structural tests + agent-instruction refs resolve. Old AGENTS body archived as `docs/_archive-260703/AGENTS.md.pre-260703`.

## Architecture
Thin AGENTS.md keeps: §1 (3-layer names, verbatim), §1.1 (shell path + invariant, verbatim), 4-kind union (one line each), §6 internalization rule (brief statement + pointer to `loop-engine.md`), §10 trajectory (one-line pointer to `docs/trajectory.md` — the Bridges table moves to `docs/trajectory.md`, see H1), §11 R2 ownership (brief statement). Strips: §2/§3/§4/§7/§8/§9/§12 (procedural — archived; the hot procedures become `loop_get_instruction` hints in a follow-up pass, not this plan).

**Retained-phrase requirement (H3):** `agents-section-1-layers.test.js` asserts (case-sensitive, anywhere in the file) `content.includes("meta-surface")`, `content.includes("4-kind")`, `content.includes("product surface")`. §1's capitalized heading "Meta-Surface" does NOT satisfy `includes("meta-surface")`. Thin AGENTS must retain at least one lowercase occurrence of each: `meta-surface`, `4-kind`, `product surface`.

**Bridges-table ownership (H1):** `docs/trajectory.md` currently says "See `AGENTS.md §10` for the gate-truth Bridges table" (3 places). Phase 5 strips §10's Bridges table. Resolution: MOVE the gate-truth Bridges table into `docs/trajectory.md` itself (it's the trajectory/destination doc); repoint `trajectory.md`'s 3 "See AGENTS.md §10" lines to the local section; thin AGENTS §10 becomes a one-line pointer to `docs/trajectory.md`.

**trajectory.md compaction (5 moves):** `trajectory.md` (230 LOC, L0) is clean on the staleness axis but contaminated with changelog + DRY overlap. It violates its own stated principle (line 220: "changelogs belong in journals, not the trajectory — the trajectory is the destination, not the route") via §8 ("What changed in this rewrite") + §9 ("What changed in the skill-migration addendum"). Compact:
1. **Drop §8 + §9** — rewrite-changelog of the doc itself; relocate the record to `meta_state_log_change` / journals.
2. **Trim the line-3 rewrite-header** (~180-word recount of dropped/reorganized content) → one line: "trajectory of the meta-surface, not any substrate" + pointer to the consistency report.
3. **Strip date-stamped "As of 2026-06-12" / "as of 2026-06-10" snapshots** from §4 + §6.5 → present-tense current-status statements.
4. **De-dup vs `docs/loop-engine.md` (L1):** §4.1 (engine/instance inversion), §4.5 (loss-function question), §4.6 (operator-capture guard) → one-line pointers to `loop-engine.md` (those are 3 of the 13 escape-hatch items Phase 2 assigns there). `trajectory.md` keeps the L0 destination framing; `loop-engine.md` owns the L1 concept.
5. **Clean the Bridges-table cells** (now gate-truth home): strip changelog detail like "Coerce-layer debt cleared 2026-06-18 (GH-0029)" → current contract status only. **Watch-item:** after stripping date stamps, refresh the status cells to *accurate current* status (not undated stale) — compaction includes a refresh pass, not a blind date-strip.

## Related Code Files
- Rewrite: `AGENTS.md` (thin)
- Archive: `git mv` current `AGENTS.md` → `docs/_archive-260703/AGENTS.md.pre-260703` (BEFORE writing the new thin one)
- Edit (citation repoint): `tools/learning-loop-mastra/mastra/agents/instructions/{intake,scout,self-improvement}-agent.js` (cite §1/§5/§9 + "line 215" → `docs/loop-engine.md` + `docs/architecture.md`)
- Edit: `tools/learning-loop-mastra/core/loop-introspect.js` (priority-1 prompt hint cites AGENTS.md — repoint)
- Edit: `tools/learning-loop-mastra/tools/legacy/loop-get-instruction-tool.js` (AGENTS.md ref — repoint)
- Edit (path fix + citation repoint): `README.md`, `CLAUDE.md` — fix stale `tools/learning-loop-mcp/` paths AND repoint: CLAUDE.md's `§ Inbound State Gate — Meta-State First` citation (C2) → `docs/architecture.md` gate-flow section (or retain a 2-line "Inbound State Gate" stub in thin AGENTS pointing there); README.md's doc-reference table (M2) — `docs/system-architecture.md` → `docs/architecture.md`; `docs/operator-guide.md` row → removed (procedural, loop-encoded) or replaced with a `loop_get_instruction` pointer.
- Edit: docs that cited `AGENTS.md §N` — `docs/security/plan-5-hardening.md`, `docs/meta-state-lifecycle.md`, AND `docs/trajectory.md` (H1: 3 "See AGENTS.md §10" lines → local Bridges section), `interface/RUNTIME_ONBOARDING.md` (M1: `AGENTS.md §2` → `docs/architecture.md` gate-flow)
- Edit (compaction): `docs/trajectory.md` — drop §8/§9, trim line-3 header, strip date-stamps, de-dup §4.1/4.5/4.6 → `loop-engine.md`, clean + refresh Bridges-table cells

## Implementation Steps
1. Back up: `git mv AGENTS.md docs/_archive-260703/AGENTS.md.pre-260703`.
2. **Read the 2 structural tests FIRST** (`agents-section-1-layers.test.js`, `agents-md-layer-locations.test.js`) and copy every asserted string into the new §1/§1.1 verbatim — including lowercase `meta-surface`, `4-kind`, `product surface`.
3. Write the new thin `AGENTS.md` (root, NOT in docs/) per the architecture above.
4. **Move the Bridges table** from archived AGENTS §10 into `docs/trajectory.md`; repoint `trajectory.md`'s 3 "See AGENTS.md §10" lines to the local section (H1). Then compact `trajectory.md` (5 moves, all in this step since they're the same file):
   - 4a. Drop §8 + §9 (rewrite-changelog); file a `meta_state_log_change` entry recording the compaction so the audit trail retains what §8/§9 said.
   - 4b. Trim the line-3 rewrite-header to one line + consistency-report pointer.
   - 4c. Strip "As of 2026-06-12" / "as of 2026-06-10" date-stamps from §4 + §6.5 → present-tense status.
   - 4d. De-dup §4.1 / §4.5 / §4.6 → one-line pointers to `docs/loop-engine.md` (L1 owns those concepts).
   - 4e. Clean the Bridges-table cells: strip "Coerce-layer debt cleared 2026-06-18 (GH-0029)"-style changelog → current contract status; **refresh** the status cells to accurate current status (not undated stale).
5. Update agent-instruction files: replace `AGENTS.md §1/§5/§9` + "line 215" citations with `docs/loop-engine.md` + `docs/architecture.md` references.
6. Update `core/loop-introspect.js` + `loop-get-instruction-tool.js` AGENTS.md refs → `docs/` paths.
7. Fix `README.md` + `CLAUDE.md`: stale `learning-loop-mcp` paths → `learning-loop-mastra/mastra/server.js`; CLAUDE.md `§ Inbound State Gate` → `docs/architecture.md` gate-flow (C2); README.md doc-table rows repointed (M2).
8. Repoint remaining `AGENTS.md §N` citations in live docs: `docs/security/plan-5-hardening.md`, `docs/meta-state-lifecycle.md`, `interface/RUNTIME_ONBOARDING.md` (§2 → `docs/architecture.md`, M1).
9. Run the 2 structural tests + the full suite.

## Success Criteria
- [ ] `AGENTS.md` rewritten thin; old archived at `docs/_archive-260703/AGENTS.md.pre-260703`.
- [ ] `agents-section-1-layers.test.js` passes (§1 names verbatim + lowercase `meta-surface`/`4-kind`/`product surface` present).
- [ ] `agents-md-layer-locations.test.js` passes (§1.1 shell path + invariant verbatim).
- [ ] `grep -rn "AGENTS.md §2\|AGENTS.md §5\|AGENTS.md §9\|AGENTS.md §12\|AGENTS.md.*line 215\|Inbound State Gate" tools/ README.md CLAUDE.md interface/` returns 0 dangling hits (archived-section + inbound-gate citations repointed).
- [ ] `grep -rn "learning-loop-mcp" AGENTS.md README.md CLAUDE.md` returns 0 hits.
- [ ] `docs/trajectory.md` owns the Bridges table; its 3 "See AGENTS.md §10" lines point local.
- [ ] `docs/trajectory.md` compacted: §8 + §9 gone; line-3 header trimmed; no "As of 2026-0" date-stamps in §4/§6.5; §4.1/4.5/4.6 are one-line pointers to `loop-engine.md`; Bridges-table cells carry current status (no changelog detail like "cleared 2026-06-18"). `meta_state_log_change` entry filed recording what §8/§9 said.
- [ ] `grep -niE "as of 2026|what changed in this rewrite|what changed in the.*addendum" docs/trajectory.md` returns 0 hits.
- [ ] `pnpm test` — all 10 namespaces pass.

## Risk Assessment
- **Risk:** thin AGENTS drops a phrase the structural tests pin (esp. lowercase `meta-surface`/`product surface` — the capitalized heading doesn't satisfy the `includes` assertion). **Mitigation:** step 2 reads the tests first; copy every asserted string verbatim. The tests are the spec.
- **Risk:** agent-instruction "line 215" citation breaks agent behavior. **Mitigation:** repoint to `docs/loop-engine.md` (the engine invariant is what §10 line 215 was about); the agent instructions get a cleaner pointer.
- **Risk:** trajectory↔AGENTS §10 circular reference (H1). **Mitigation:** move the Bridges table into `trajectory.md`; thin AGENTS §10 is a one-line pointer. Single ownership, no cycle.
- **Risk:** CLAUDE.md inbound-gate citation dangles (C2) — the most-triggered gate. **Mitigation:** step 7 repoints it to `docs/architecture.md` gate-flow; the success grep covers `Inbound State Gate`.