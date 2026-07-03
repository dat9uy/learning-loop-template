# Predict Report: Direction Gaps + Legacy Cleanup (post-Phase E)

**Verdict: CAUTION** — direction is sound and architecture supports it; gaps are real and well-scoped. But the request bundles two risk profiles, and the strategic phases (G + Phase 5) should be sequenced *after* the open hardening (Plan 5-Lite) and the cleanup, not before.

**Date:** 2026-07-03
**Proposal:** After Phase E closes, scan the repo for gaps in the direction "systematize agent memory (meta-state = one instance) + runtime-agnostic agentic workflows upon it," and flag legacy parts for cleanup.
**Evidence base:** master tracker (`productization-260612-1530-master-tracker.md`), `AGENTS.md` §1, `docs/philosophy.md`, `docs/trajectory.md`, `core/surfaces.js`, two repo-wide scouts (legacy inventory + gap analysis).

---

## Verdict: CAUTION

---

## Agreements (all personas align)

- **The 3-layer architecture is sound and the direction is coherent with the stated contract.** Core (`tools/learning-loop-mastra/core/`) is pure logic, zero `@mastra/*` imports; Mastra shell wraps; Runtime interface (`interface/contract.js`) is the runtime contract. "The record is the memory" (`philosophy.md:109`) is an explicit, repeated contract — not emergent.
- **`.mastracode` IS wired as the 3rd runtime** — `SURFACES = Object.freeze([".claude", ".factory", ".mastracode"])` (`core/surfaces.js:16`). Adding a 4th runtime is one line. The runtime-agnostic *substrate* is real, not aspirational.
- **The `legacy/` naming is a trap.** Many `legacy/`-named paths are **canonical live code** pinned by `tools/learning-loop-mastra/docs/legacy-pins.md`: `mastra/legacy-handler-adapter.js` (imported by `server.js:9,57`), `tools/legacy/` (the 44 MCP tool implementations), `scout/legacy/`, `hooks/legacy/`. A cleanup pass could delete canonical tool implementations by name alone. **Rename before any delete.**
- **Stale user-facing docs are fix-on-sight, low risk:** `CLAUDE.md`, `README.md`, `AGENTS.md:95` still reference the deleted `tools/learning-loop-mcp/` server; `docs/observation-vs-meta-state.md` + `docs/record-system-architecture.md` are superseded; `docs/operator-guide-vnstock-appendix.md` points at a nonexistent `generate-capabilities/adapters/` dir; `AGENTS.old.260612-1300.md` + `docs/trajectory.old.260612-1300.md` are explicit `.old.` backups.
- **LIM-4 (path traversal) + R2 write-gate (Plan 5-Lite) must ship before workflows auto-write the registry.** Expanding the memory surface expands the attack surface; shipping memory-on workflows before the security hardening widens blast radius.
- **Phase G (skill → MCP tool) + Phase 5 (per-agent memory) are both OPEN and unstarted; no plan dirs exist for either.** They are the two keystones for the stated ambition, but the loop *functions* today without them (skills + citation convention).
- **`workflow_intake_orient` reads the UNBOUND product surface, not the bound meta-surface** (`workflows/workflow-intake-orient.js:8-26` reads `records/<surface>/{index,capabilities,decisions,evidence}` — the dirs `AGENTS.md:65` declares "unbound, CRUD paused"). This is a direction-incoherence bug independent of the larger questions.

---

## Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX (operator) | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|----------------|------------------|------------|
| Should Mastra workflows read/write `meta-state.jsonl` (C1/C3)? | YES — otherwise "workflow-on-memory" is false advertising; the loop isn't closed. | Write path must stay authority-bounded — workflows auto-writing findings widens the `resolved_by:"operator"` controllable surface. | Reading the registry per workflow step = same linear scan as agents; fine at 243 entries, plan for index. | Workflows that orient from the registry give the operator coherent multi-step flows instead of stateless tool calls. | NO — keep workflows pure functions; memory lives in the *agent* layer. Coupling workflows to the registry risks breaking the 3-layer invariant and bypassing agent authority. | **Workflows READ meta-state (oriented by it); agents WRITE (authoritative).** Workflows propose, agents dispose. Fix C2 (intake_orient must read meta-state, not unbound product records) regardless. |
| Is Phase G a keystone or deferrable? | Keystone — without it, "agentic workflow" lives in session-scoped skill markdown (escape hatch), not loop-owned memory. | Neutral on timing; matters only if MCP goes network-accessible (then LIM-3 caller identity un-blocks it). | Phase G adds many `change-log` entries (each skill invocation cited) → accelerates registry growth. | Loop-owned `ck:plan`/`ck:cook`/`ck:journal` gives the operator cite-or-else semantics; today skill invocations are witnessed, not recorded. | DEFERRABLE — the loop already cites via `evidence_journal`; Phase G is mechanics, parallel, doesn't gate A-F. The "keystone" framing may inflate its importance. | **Keystone for the *ambition*, not for current *function*.** Sequence it after hardening + cleanup. Don't start it until the substrate has stabilized one release cycle. |
| Cleanup: batch-delete vs rename-first? | Rename-first; `legacy/` is a naming smell, `legacy-pins.md` is a band-aid. | N/A. | N/A. | A future cleanup agent WILL mis-delete canonical code on the `legacy/` name; the pin doc mitigates but is a footgun. | The cleanup pass is the *riskiest* part of this request — one wrong delete removes 44 tool implementations. | **Rename `tools/legacy/` → canonical (e.g. `tools/implementations/` or `tools/handlers/`); drop `legacy` from live code; reserve `legacy/` for actually-dead code. Then dead-code removal is trivial and safe.** |
| Sequencing: hardening vs direction vs cleanup | Cleanup is low-risk and parallelizable; do it now. | Ship Plan 5-Lite (LIM-4 + R2) BEFORE memory-on workflows; security gates the direction. | Compact change-logs before Phase G accelerates growth. | Fix stale docs now (operator onboarding reads wrong paths). | Right move may be to **declare victory at meta-surface-productized** — consolidate + harden one cycle before pushing Phase G/Phase 5. | **GO on the direction, but sequence: (1) Plan 5-Lite hardening + (2) cleanup/rename, THEN (3) Phase G + Phase 5.** Don't start the strategic phases on a substrate with an open CVE-shape gap. |

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cleanup deletes canonical code via the `legacy/` name trap | **Critical** | Rename `legacy/` live-code dirs → canonical names first; gate all deletes behind `legacy-pins.md`; never batch-delete on name match. |
| Workflows auto-write registry before LIM-4 + R2 ship | **High** | Ship Plan 5-Lite first; keep workflow write path in the agent layer, not the workflow layer. |
| `meta-state.jsonl` unbounded growth — change-logs never compact (`meta-state.js:581`), Phase G accelerates it | Medium | Add a change-log compaction/summary tier before Phase G; or accept growth with a hard cap + sweep. |
| Cold-start in `.mastracode` degraded — no discoverability injection (`hooks.json` SessionStart wires only `recurrence-check-on-start`) | Medium | Unify discoverability injection via `writeToAllSurfaces`; today Claude gets `session-start-inject`, Factory has a hand-maintained duplicate, Mastracode gets nothing. |
| Registry linear scan + full re-orientation on every agent call → hot path as entries grow | Medium | Persistent index or migrate hot read path to the LibSQL substrate (today `mastra-memory.db` holds only a test fixture). |
| Direction ambition outpaces substrate maturity | Medium | Consolidate + harden one release cycle before Phase G; don't start the strategic phases on an unstable base. |
| `workflow_intake_orient` reads unbound product surface (direction-incoherence) | Medium | Re-point it at `meta_state_list` / `loop_describe`; fix independent of larger sequencing. |

---

## Recommendations

1. **Treat the cleanup as two passes, not one — rename, then delete.** The `legacy/` naming trap makes a single delete pass dangerous. First rename the canonical live-code dirs out of the `legacy/` namespace (governed by `legacy-pins.md`); then dead-code removal (`AGENTS.old`, `trajectory.old`, 2 superseded docs, `generate-capabilities/` stranded fixture, one-shot migration scripts, the inner superseded `tools/legacy/agent-manifest.json`, orphan `.gitignore` rule, stale path comments) becomes trivial and safe. **Highest-value, lowest-risk first move.**

2. **Fix the fix-on-sight stale docs immediately** (independent of the rename): `CLAUDE.md`, `README.md`, `AGENTS.md:95`, `docs/operator-guide-vnstock-appendix.md`. These are user-facing onboarding paths pointing at a deleted server — an operator reading them trusts a non-existent boundary. ~30 min.

3. **Ship Plan 5-Lite (LIM-4 path containment + R2 write-gate) before any workflow→registry wiring or Phase G work.** The stated direction expands the memory surface; the security hardening must precede the surface expansion. Tracker says this is the recommended next move and is unblocked.

4. **Fix `workflow_intake_orient` (C2) as a standalone direction-coherence fix.** It reads archived/unbound product records instead of the bound meta-surface. This is incoherent with `AGENTS.md` §1 regardless of the larger Phase G/Phase 5 questions, and is a small, self-contained re-point.

5. **Sequence the strategic phases, don't start them yet.** Order: Plan 5-Lite hardening → cleanup/rename → one-release-cycle substrate stabilization → Phase G1 (`ck:plan` → `loop_plan_create`, smallest-first) → Phase 5 (per-agent memory). Track Phase 5 as an actual phase — today it's only referenced as a "consumer" of the OM deferral, with no tracker row.

6. **Decide the workflow-write authority boundary explicitly before wiring it.** The architectural resolution (workflows read, agents write) should be encoded as a contract note in `AGENTS.md` §1 or `interface/CONTRACT.md` before C1/C3 are closed — otherwise a future agent wires workflows to `meta_state_report` directly and recreates the LIM-3 caller-identity gap.

7. **Name the memory substrate.** Three stores are de facto canonical (`meta-state.jsonl` for findings/rules/change-logs, `runtime-state.jsonl` for mutable counters/budgets, `file-index.jsonl` for code hashes) but only `meta-state.jsonl` is declared canonical in `AGENTS.md:57`. A one-paragraph "Memory substrate" subsection naming all three + their canonicality class prevents the seam from widening.

---

## Unresolved questions

1. Is the workflow→registry **write** boundary acceptable in the workflow layer at all, or must it stay exclusively in the agent layer (Recommendation 6)? Needs an operator decision before C1/C3 work.
2. Should change-log entries ever compact, or is "immutable forever" a hard contract? (A3 — `meta-state.js:581` makes them immortal today; Phase G growth pressure will force this question.)
3. Is Phase G's `ck:cook` → `loop_cook` migration in-scope for the near-term, or is it parked behind Bridge 7 like the rest of the product surface? The tracker lists G1-G3 as OPEN but the dependency-balance convention's self-check (cold-session probe verifying `evidence_journal` citations land on real plan files) is not yet built.