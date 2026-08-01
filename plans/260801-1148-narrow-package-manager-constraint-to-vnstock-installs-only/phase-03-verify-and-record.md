---
phase: 3
title: "Verify, docs, loop record, unblock fallow bump"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Verify, docs, loop record, unblock fallow bump

## Overview

Broaden verification, update docs that describe the constraint, record the gate-design change in the loop, resolve the leftover dep-bump report, and run the fallow 3.10.0 bump as the real-world regression proof — now unblocked because `pnpm add -D fallow` no longer matches `package-manager`.

## Requirements

- Functional: docs reflect vnstock-only matching; loop change-log entry exists; the fallow bump succeeds and both fallow scripts stay green on 3.10.0.
- Non-functional: no contract drift between docs and the actual regex.

## Architecture

This plan touches a gate contract, so per the loop's internalization rule it must be recorded via `meta_state_log_change` (writes go through the CLI/MCP, never direct file edits to `meta-state.jsonl`). The leftover `meta-260801T1118Z-observation-dep-bump-fallow-…` report described the bump as blocked by the gate; once the bump runs, that report is supersposed/resolved. The original `meta-260714T1248Z-…` byte-size finding stays open (its measurement step is out of scope here).

## Related Code Files

- Verify (read-only): `tools/learning-loop-mastra/core/patterns.json`, `core/file-readers.js`, `core/gate-logic.js`.
- Modify (docs): any doc under `docs/` that describes the `package-manager` constraint as a general install guard. Candidates found in scan: `docs/_archive-260703/observation-vs-meta-state.md`, `docs/journals/260518-phase04-capability-revalidation-session.md` (journal — historical, do not rewrite; at most note the change is forward-only). Prefer updating the authoritative `docs/runtime-contract.md` / `docs/architecture.md` if they enumerate constraint behavior; otherwise add a one-line note to the closest owning doc.
- Modify (package): `package.json` — bump `fallow` devDependency `3.3.0` → `3.10.0`.

## Implementation Steps

1. **Broaden tests.** Run `pnpm test` (or the repo's standard gate). If `runtime-agnostic` or boundary tests reference the constraint, confirm they still pass.
2. **Docs sweep.** Grep `docs/` for `package-manager` and `install` guard language. Update only docs that state the constraint matches all installs. Journals are historical records — leave them; do not retro-edit. Add a forward-looking note to the owning contract doc if it enumerates the constraint patterns.
3. **Loop change-log.** Record the gate-design change:
   ```
   loop.mjs meta_state_log_change '{"change_dimension":"gate-constraint","change_target":"patterns.json#package-manager","change_diff":"narrowed: package-manager now requires the vnstock token in the install command; non-vnstock installs no longer gated","reason":"package-manager had only a vnstock unlock path, so the broad pattern blocked all repo installs including routine devDependency bumps; user decision: gate only vnstock installs"}'
   ```
   Set `LOOP_SURFACE=.claude` before invoking. Cite this plan and the debug report in `source_refs` where the tool allows.
4. **Resolve leftover report.** `loop.mjs meta_state_resolve '{id:"meta-260801T1118Z-observation-dep-bump-fallow-devdependency-3-3-0-3-10-0-in-pa",resolution:"superseded by gate-design fix — package-manager narrowed to vnstock installs; fallow bump no longer requires a vnstock observation"}'` (verify the exact id via `meta_state_list` first).
5. **Run the fallow bump** (now unblocked):
   ```
   pnpm add -D fallow@3.10.0
   ```
   Confirm `package.json` shows `"fallow": "3.10.0"` and the lockfile updates.
6. **Re-green fallow.** Run `pnpm fallow:gate` and `pnpm fallow:brief`; confirm both exit 0 on fallow 3.10.0 (binary now matches the mise global 3.10.0).
7. **Pre-commit sanity.** `pnpm test` once more (the pre-commit hook is `pnpm test && pnpm fallow:gate`); confirm the gate no longer blocks routine commands.

## Success Criteria

- [ ] `pnpm test` (gate surface + boundary) passes.
- [ ] Docs that describe `package-manager` as a general install guard updated; journals left intact.
- [ ] `meta_state_log_change` entry recorded and re-grounded (cite `core/patterns.json`).
- [ ] `meta-260801T1118Z-observation-dep-bump-fallow-…` resolved.
- [ ] `package.json` has `"fallow": "3.10.0"`; lockfile updated.
- [ ] `pnpm fallow:gate` and `pnpm fallow:brief` exit 0.
- [ ] `pnpm add -D fallow@3.10.0` did not trigger a `package-manager` gate block (regression proof).

## Risk Assessment

**Doc drift.** If a doc still claims all installs are gated, future readers mis-model the gate. Mitigation: grep-driven sweep, update only the authoritative contract surface. **Stale loop record.** If `meta_state_log_change` is skipped, the gate change is invisible to the loop's self-model. Mitigation: it's a phase success criterion, not optional. **fallow 3.10.0 behavior change.** A new fallow major-ish version may flag differently; if `fallow:gate` goes red for a real new finding (not a baseline-inherited line), triage per the fallow-gate-triage hint rather than reverting the bump.