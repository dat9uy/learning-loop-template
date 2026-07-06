---
phase: 5
title: "skills write-gate"
status: pending
effort: "medium"
priority: P2
dependencies: [3, 4]
---

# Phase 5: Skills write-gate — `<surface>/skills/**` gate-monopoly

## Overview

Extend the write-gate to block direct writes to `.claude/skills/**`, `.factory/skills/**`, `.mastracode/skills/**`, using a **dedicated `skills` preflight marker** (`.loop-preflight-skills`) — separate from the `product` marker — unlocked via the existing `gate_mark_preflight(surface: "skills")` MCP tool. The gated authoring path is: `gate_mark_preflight(surface: "skills")` → write (fans out via phase 4) → `meta_state_log_change`. This IS the self-maintenance (gate-monopoly + authoring-path-emitted change-log). Scope: `<surface>/skills/**` ONLY — `docs/**`/`tools/**`/`core/**` stay ungated (Rec 12, next plan). Threat-model scope: the gate protects **loop-maintained** skills (those mirrored across runtimes); external symlinked content under `.agents/skills/**` is out of scope (not loop-maintained), documented.

## Requirements

- Functional: `evaluateWriteGate` blocks a direct Write/Edit/Create to any `<surface>/skills/**` path unless a `.loop-preflight-skills` marker exists (created via `gate_mark_preflight(surface: "skills")`). With the marker, the write is `ok`. The skills rule is a preflight-delegating rule (like `product/**`), kept in `evaluate-write-gate.js` (not in `core/bound-artifacts.js`, which is for simple globs).
- Non-functional: existing write-gate decisions unchanged for all other paths; the `product/**` preflight path unchanged (separate marker); `docs/**`/`tools/**`/`core/**`/`plans/**` stay `ok`. FCIS preserved.

## Architecture

`evaluate-write-gate.js` (76–128) walks WRITE_GATE_RULES first-match-wins, delegates `product/**` to `evaluatePreflight` (25–39), which calls `findPreflightMarker(surface, root)` reading `<surface>/coordination/.loop-preflight-<surface>` (gate-logic.js:374). `gate_mark_preflight(surface)` writes `.loop-preflight-<surface>` to every runtime's `coordination/` dir (mark-preflight-complete-tool.js:24–26 — one call writes all 3 runtimes; this is correct for skills, since the fan-out writes all 3 mirrors).

**Red-team-driven design (the critical fix):** a **dedicated `skills` marker**, NOT reuse of the `product` marker. The skills rule, on matching `<surface>/skills/**`, passes `surface = "skills"` (a fixed logical surface) to `findPreflightMarker` — NOT the path prefix (`.claude`/`.factory`/`.mastracode`) and NOT `"product"`. `gate_mark_preflight(surface: "skills")` writes `.loop-preflight-skills`. This decouples skills from product (no cross-surface coupling) and is internally consistent (the marker the gate reads matches the marker the operator creates). The earlier "reuse the product marker" framing is dropped — it was broken (`inferSurface` returns `null` for surface-prefix paths, and the marker names would not match).

`inferSurface` (gate-logic.js:401) returns `null` for `.claude/`/`.factory/`/`.mastracode/` prefixes (red-team confirmed). The skills rule does NOT rely on `inferSurface`; it derives the marker surface explicitly as the constant `"skills"`. The `match` function globs the explicit per-surface prefixes via `getAllSurfacePaths("skills", "**")` (phase 4 helper), like `PREFLIGHT_MARKER_PATHS` does for the marker rule.

**Threat-model scope (red-team finding):** the gate matches the path the Write/Edit tool receives, not the realpath. A write to `.agents/skills/mastra/SKILL.md` (the `mastra` symlink's realpath target) does NOT match any `<surface>/skills/**` glob → falls through to `ok`. This is **accepted and documented**: the gate protects loop-maintained skills (mirrored, `maturity:`-declaring). `.agents/skills/**` is external symlinked content (not loop-maintained, not mirrored); editing it directly is editing external content, out of the gate's threat model. Document this boundary in the gate reason + `CONTRACT.md` (phase 2 already scopes Req #3 to `maturity:`-declaring skills).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/evaluate-write-gate.js` (add the skills rule before `product`; delegate to `findPreflightMarker("skills", root)`; build per-surface globs via `getAllSurfacePaths("skills", "**")`).
- Modify: `core/bound-artifacts.js` (pointer comment: skills is gated via the preflight-delegating rule in `evaluate-write-gate.js` — the constant is for simple globs).
- Test: `tools/learning-loop-mastra/core/evaluate-write-gate.test.js` (skills block + skills-marker unlock + regression).

## Implementation Steps

1. **Tests-first (red):** add to `evaluate-write-gate.test.js`:
   - `.claude/skills/learning-loop/SKILL.md` (no `.loop-preflight-skills` marker) → `decision: "block"`, `matched_rule` includes `skills`.
   - `.factory/skills/coordination-gate/SKILL.md` (no marker) → block.
   - `.mastracode/skills/learning-loop/SKILL.md` (no marker) → block.
   - `.claude/skills/learning-loop/SKILL.md` (with `.loop-preflight-skills` marker present in `.claude/coordination/`) → `decision: "ok"` (skills-marker unlock).
   - `.claude/skills/learning-loop/references/foo.md` (nested, no marker) → block (`**` covers nested).
   - `docs/foo.md`, `tools/x.js`, `core/y.js`, `plans/z.md` → `ok` (regression: still ungated).
   - `.claude/product/x` (no `.loop-preflight-product` marker) → block via the PRODUCT rule (regression: the skills rule does not change product behavior; separate markers).
   - Every existing test stays green.
2. Read `evaluate-write-gate.js` (62–146) + `gate-logic.js` `readPreflightMarker`/`findPreflightMarker` + `mark-preflight-complete-tool.js` + the `gate_mark_preflight` MCP tool wrapper. **Verify `gate_mark_preflight` accepts `surface: "skills"`** (validation decision 2026-07-07): red-team confirmed the tool writes `.loop-preflight-<arg>` for any string, but confirm the tool's surface param is NOT validated against a fixed set (e.g. `["product"]`). If it IS constrained, extend the allowed surface set to include `"skills"` in this phase (a small tool-wrapper change, not a new tool). If unconstrained, proceed.
3. Add the skills rule to `WRITE_GATE_RULES` before the `product` rule:
   - `SKILL_PATHS = getAllSurfacePaths("skills", "**")`.
   - `{ name: "skills", matchedRule: SKILL_PATHS.join(" | "), match: (relPath) => SKILL_PATHS.some(g => globMatch(g, relPath)), reason: <"Direct writes to <surface>/skills/** are blocked. Loop-maintained skills are gated artifacts mirrored across runtimes. Use the gated authoring path: gate_mark_preflight(surface:'skills') → write → meta_state_log_change. External symlinked content under .agents/skills/** is out of scope (not loop-maintained)."> }`.
   - In `evaluateWriteGate`, when `matched.name === "skills"`, delegate to a preflight check with `surface = "skills"` explicitly: call `findPreflightMarker("skills", resolvedRoot)` (or a small `evaluatePreflightForSurface(relPath, "skills", resolvedRoot)` that reads the `skills` marker directly — do NOT call `inferSurface`, which returns `null` for surface-prefix paths). Return `ok` if the marker exists, else `block` with the skills reason + the preflight checklist pointing to `gate_mark_preflight(surface: "skills")`.
4. Verify the `product` rule path is untouched (still uses `evaluatePreflight` + `inferSurface` for `product/`). The skills rule's explicit-surface path is separate.
5. Add the pointer comment in `core/bound-artifacts.js` (skills gated via the preflight-delegating rule in `evaluate-write-gate.js`).
6. Run `pnpm test` on `core/evaluate-write-gate.test.js` + `legacy-mcp/bound-artifacts.test.js` + the full write-gate suite. Confirm the regression set stays `ok`.

## Success Criteria

- [ ] Direct writes to `.claude/skills/**`, `.factory/skills/**`, `.mastracode/skills/**` block without a `.loop-preflight-skills` marker (all 3 surfaces + a nested `references/` path tested).
- [ ] With a `.loop-preflight-skills` marker, a `<surface>/skills/**` write is `ok` (dedicated skills marker; `gate_mark_preflight(surface: "skills")`; no coupling to the product marker).
- [ ] `product/**` behavior unchanged (separate `.loop-preflight-product` marker; product tests green).
- [ ] `docs/**`, `tools/**`, `core/**`, `plans/**` remain `ok` (regression) — Rec 12 boundary respected.
- [ ] The `.agents/skills/**` threat-model boundary is documented (gate reason + CONTRACT.md scope) — external symlinked content out of scope.
- [ ] All pre-existing `evaluate-write-gate.test.js` cases green; `core/bound-artifacts.js` pointer comment present; FCIS preserved.

## Risk Assessment

Medium. This is the enforcement surface. Mitigations: (a) tests-first covers block + unlock + product-regression + docs/tools/core regression; (b) a dedicated `skills` marker (red-team critical fix) — decoupled from product, internally consistent (gate reads what the operator creates); (c) explicit `surface = "skills"` passed to the marker lookup, not relying on the broken `inferSurface`; (d) the `.agents/skills/**` bypass is accepted + documented as a threat-model boundary (loop-maintained skills only). Rollback: `git checkout core/evaluate-write-gate.js core/bound-artifacts.js`.