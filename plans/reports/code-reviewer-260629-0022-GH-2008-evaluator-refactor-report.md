---
title: "Phase E Evaluator Refactor — Code Review"
description: "Two-commit review (09415f4 refactor + 78fd2b6 journal). Verified: 1368 tests, 14 globs, all green. 1 Critical, 3 Important, 4 Minor findings."
type: code-review
date: 2026-06-29
commits:
  - 09415f4 refactor(gate): extract evaluators from hooks into core/
  - 78fd2b6 docs(journal): phase E evaluator refactor shipped
plan: plans/260628-2008-phase-e-evaluator-refactor/
---

# Phase E Evaluator Refactor — Code Review

**Scope:** `09415f4` (28 files, 1332+/-439) + `78fd2b6` (journal entry).
**Plan:** `plans/260628-2008-phase-e-evaluator-refactor/plan.md`
**Verification:** 1368 tests / 14 globs / all green (claim verified via `pnpm test`).

## Summary

The refactor delivers exactly what the plan specified: 3 pure evaluators extracted from 3 hooks, hook line counts collapsed (187→41, 148→50, 130→65), wire protocol locked by 7-fixture snapshot test, Path B layering resolution applied. **One real bug** (latent, not user-facing today), plus 3 important and 4 minor findings.

---

## CRITICAL (blocks merge)

### C1. `findProjectRoot` not imported in `evaluate-bash-gate.js:46`

**File:** `tools/learning-loop-mastra/core/evaluate-bash-gate.js:46`

```js
import {
  matchConstraintPattern, checkObservationExists, makeGateDecision,
  loadPromotedRules, applyPromotedRules,
} from "./gate-logic.js";
// ...
const resolvedRoot = root || findProjectRoot();   // line 46 — ReferenceError if root is undefined
```

`findProjectRoot` is used but not imported. Compare to `evaluate-write-gate.js:11` and `evaluate-inbound-gate.js:9`, which correctly import it.

**Reproducer:**
```bash
node -e "import('./tools/learning-loop-mastra/core/evaluate-bash-gate.js').then(m => m.evaluateBashGate({ command: 'ls' }))"
# → ReferenceError: findProjectRoot is not defined
```

**Why latent:** every current caller (`hooks/legacy/bash-gate.js:33`, `tools/legacy/gate-tool.js:16`) calls `resolveRoot()` and passes an explicit root. The 4-arg `applyPromotedRules(command, null, promotedRules, resolvedRoot)` on line 84 also passes root explicitly, dodging the default-time `findProjectRoot()` lookup.

**Contract violation:** JSDoc on line 4 says `root?: string` (optional). The function crashes if a caller follows the documented contract.

**Fix (1 line):** add `findProjectRoot` to the import list at lines 8–14.

---

## IMPORTANT (fix before next phase)

### I1. Dead `SURFACES` import in `evaluate-bash-gate.js:17`

```js
import { SURFACES } from "./surfaces.js"; // coordination path patterns below reference SURFACES dirs
```

`SURFACES` is never referenced in the file. The inline comment claims the patterns on lines 25–28 "reference SURFACES dirs" — but those patterns are hard-coded literal regex strings (e.g. `/\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+/`). The `SURFACES` import has no functional effect.

The journal entry (`docs/journals/260628-phase-e-evaluator-refactor-shipped.md:32`) claims the import "satisfies runtime-agnostic invariant (no hard-coded coordination paths)" — but `runtime-agnostic.test.js:85–95` only scans for `join(root, ".claude" | ".factory")` patterns. Regex literals are not in scope. So the test passes, but the invariant claim is misleading.

**Fix:** either remove the import + comment, OR generate the preflight regexes from `SURFACES.map(...)` at module load (consistent with `core/gate-logic.js:471` for other surface-derived patterns). Generation also removes the hard-coded surface list in literals — closes the **actual** runtime-agnostic violation.

### I2. Index-loop in `evaluate-write-gate.js:30` is necessary but undocumented

```js
for (let i = 0; i < SURFACES.length; i++) {
  const coordDir = `${resolvedRoot}/${SURFACES[i]}/coordination`;
  marker = readPreflightMarker(surface, coordDir);
  if (marker) break;
}
```

The journal claims this avoids `for...of SURFACES` to pass the runtime-agnostic test. **Confirmed:** `runtime-agnostic.test.js:80` rejects any `for (const x of SURFACES)` pattern in `core/`.

But the rationale is invisible to readers — easy for a future contributor to "clean up" with `for...of` and silently break the test.

**Fix:** add a one-line comment explaining the index-loop constraint. Same for any future evaluator needing cross-surface iteration.

### I3. `capture-gate-check-snapshot.mjs` is committed as a fixture

**File:** `tools/learning-loop-mastra/__tests__/legacy-mcp/fixtures/capture-gate-check-snapshot.mjs` (97 LOC)

Script's docstring says "Run this BEFORE Phase 3 hook refactor." Its purpose is one-time pre-refactor capture. After capture it has no ongoing role — no test references it. The repo has a `fallow` rule against dead code (Phase E Dead-Code Sweep).

**Fix:** move to `plans/260628-2008-phase-e-evaluator-refactor/` as a phase artifact, or add a header comment noting it is intentionally retained for future snapshot regeneration.

---

## MINOR (nice-to-fix)

### M1. Heredoc-to-meta-state bypasses bash gate

`PATH_WRITE_PATTERNS` includes pipe/semicolon-safe patterns for `>` and `tee`, but heredoc (`<<EOF > meta-state.jsonl`) is only covered for `records/`, not for `meta-state.jsonl` / `runtime-state.jsonl`. Matches the OLD bash gate's behavior (same 11 patterns moved verbatim). Not a regression — flag for future tightening.

### M2. `prompt.length === 10` boundary untested

`evaluate-inbound-gate.js:52` uses `< 10`, so a 10-char prompt is NOT short-circuited. Adjacent tests use 2-char (`"hi"`) and 20-char prompts. No explicit test for the exact boundary.

### M3. Double `findProjectRoot()` lookup when `root` undefined

If a caller omits `root`, `findProjectRoot()` runs at function entry in the evaluator AND at default-time inside `applyPromotedRules`. Tiny perf concern; trivial refactor to hoist into a const at function top.

### M4. Journal claim "behavioral fix" could cite the bug source

The journal says `node_modules/**`, `dist/**`, `build/**` "now correctly blocked (pre-refactor `**/` prefix bug)." Accurate — verified by flipped tests at `write-coordination-gate-minimal.test.cjs:211,222,233`. But the journal doesn't link the pre-refactor hook line that had the bug. Could be tighter by citing `tools/learning-loop-mastra/hooks/legacy/write-gate.js` (pre-refactor) line 137 (the `**/node_modules/**` pattern that didn't match top-level `node_modules/foo`).

---

## VERIFIED CORRECT (no action)

- **All 8 plan acceptance criteria met.** 50 evaluator tests (22+17+11); 7 snapshot fixtures; `placement.yaml` has 3 evaluator rows; `placement-manifest.test.js:101` refined to `["primitive", "facade"]`; `docs/placement.md` table matches `placement.yaml`; `AGENTS.md §1.1` carries the boundary-adapter clarification; wire protocol byte-identical via snapshot; 1368 tests = 1311 baseline + 57 new.
- **FCIS invariant holds.** No `@mastra/*` imports in any `core/evaluate-*.js` (verified via grep).
- **No `entry/` coupling.** Evaluators take raw `{filePath, root}` / `{command, root}` / `{prompt, root}` inputs.
- **Inbound marker ordering.** Old hook wrote marker after detecting state-change+stale-obs in its own main(); new hook writes marker inside `if (decision.decision === "warn")` block. Logically equivalent. Journal claim "evaluate BEFORE marker write" is accurate.
- **Behavioral fix for build artifacts** is intentional and test-locked (3 flipped tests).
- **`AGENTS.md §1.1` update** accurately reflects the boundary-adapter model.
- **`applyPromotedRules(command, null, promotedRules, resolvedRoot)` 4-arg call** in `evaluate-bash-gate.js:84` is consistent with the 3-arg form in `evaluate-write-gate.js:154` (default would yield the same root once C1 is fixed).
- **`evaluatePreflight` collapses `product/api/**` and `product/web/**` to surface="product"** — `inferSurface` returns `"product"` for any `product/<sub>/...` path; the preflight marker is keyed on `"product"`. Matches the preflight design (single surface).
- **`STATE_CHANGE_PATTERNS` has 11 entries** — verified by test assertion at `evaluate-inbound-gate.test.js:108`.
- **`PATH_WRITE_PATTERNS` has 11 entries** — verified by snapshot test.
- **`findStaleObservations`** correctly extracted to `core/gate-logic.js:832` as a shared primitive; both bash and inbound evaluators use it.
- **`checkObservationStaleness`** stays in `inbound-state.js` (facade), imported by bash evaluator — allowed by Path B's `evaluator: ["primitive", "facade"]` invariant loosening.

---

## Recommended Action Order

1. **Fix C1** (one-line import add) → re-run reproducer to confirm clean.
2. **Fix I1** (remove dead `SURFACES` import OR generate patterns from `SURFACES`) — recommend generation, closes the real runtime-agnostic violation in regex literals.
3. **Fix I3** (move `capture-gate-check-snapshot.mjs` to plan dir or document retention).
4. Add inline comment for **I2** (index-loop rationale).
5. Optional: add **M2** boundary test for `prompt.length === 10`.

## Unresolved Questions

- None blocking merge. C1 is a latent contract violation — fix is 1 line.

## Verification Commands Used

```bash
pnpm test                                          # 1368 tests / 14 globs / all green
node -e "import('./.../evaluate-bash-gate.js').then(m => m.evaluateBashGate({command:'ls'}))"
# → ReferenceError: findProjectRoot is not defined (C1 confirmed)
grep -rn "@mastra" tools/learning-loop-mastra/core/evaluate-*.js   # 0 matches (FCIS verified)
git diff 09415f4^..09415f4 --stat | wc -l         # 28 files changed (matches journal)
```
