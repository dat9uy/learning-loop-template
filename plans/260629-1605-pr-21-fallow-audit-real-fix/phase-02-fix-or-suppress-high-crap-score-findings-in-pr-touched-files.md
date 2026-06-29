---
phase: 2
title: "Fix or suppress high-crap-score findings in PR-touched files"
status: pending
effort: "2-3h"
---

# Phase 2: Fix or suppress high-crap-score findings in PR-touched files

## Overview

Addresses the 4 `fallow/high-crap-score` findings revealed by the diagnostic SARIF. Per YAGNI, refactoring is preferred over suppression — suppression hides real complexity. The 3 findings in PR-touched `core/evaluate-*.js` files are in scope for this PR (extracted from hooks in commit `09415f4`); the 1 finding in the pre-existing `hooks/legacy/bash-gate.js` requires a separate decision (refactor / delete / exclude) because the legacy directory has its own lifecycle.

## Requirements

**Functional:**
- `core/evaluate-write-gate.js:61` `evaluateWriteGate` (CRAP 272.0, cyclomatic 16) — refactor to reduce CC below threshold
- `core/evaluate-write-gate.js:25` `evaluatePreflight` (CRAP 42.0, cyclomatic 6) — refactor or suppress with justification
- `core/evaluate-inbound-gate.js:52` `evaluateInboundGate` (CRAP 90.0, cyclomatic 9) — refactor or suppress
- `hooks/legacy/bash-gate.js:23` `main` (CRAP 72.0, cyclomatic 8) — decide: refactor, delete, or exclude via `.fallowrc.json`

**Non-functional:**
- Threshold: CRAP < 30 (per fallow's `defaultConfiguration.level: "error"` for `high-crap-score`)
- Local verification: `pnpm exec fallow audit` reports 0 high-crap-score findings in `core/evaluate-*.js`
- All existing tests pass (no behavioral regression)

## Architecture

**Refactoring strategy for `evaluateWriteGate`** (CC 16, 7 numbered rule blocks L62-164):

The function is a vertical cascade of `globMatch(...) → return decision` blocks (rules 1, 1.5, 1.6, 2, 3, 4, 5, 6, 7). Two viable refactors:

**Option A: Rule registry pattern**

Replace the cascade with an array of `{ name, matcher, decision }` objects and a `for` loop. Each rule becomes declarative data, and `evaluateWriteGate` becomes a small loop that finds the first match.

```js
const WRITE_GATE_RULES = [
  { name: "records",         match: (p) => globMatch("records/**", p),                 reason: "..." },
  { name: "runtime-state",   match: (p) => globMatch("runtime-state.jsonl", p),       reason: "..." },
  { name: "meta-state",      match: (p) => globMatch("meta-state.jsonl", p),          reason: "..." },
  { name: "schemas",         match: (p) => globMatch("schemas/**", p),                 reason: "..." },
  { name: "build-artifacts", match: (p) => globMatch("{,**/}node_modules/**", p) || globMatch("{,**/}dist/**", p) || globMatch("{,**/}build/**", p), reason: "..." },
  { name: "preflight-marker",match: (p) => globMatch(".claude/coordination/.loop-preflight-*", p) || globMatch(".factory/coordination/.loop-preflight-*", p), reason: "..." },
  { name: "product",         match: (p) => globMatch("product/**", p),                 reason: "..." /* returns evaluatePreflight result */ },
];

export function evaluateWriteGate({ filePath, root }) {
  if (!filePath || typeof filePath !== "string") return { decision: "ok" };
  const resolvedRoot = root || findProjectRoot();
  const relPath = normalize(/* path normalization */);

  for (const rule of WRITE_GATE_RULES) {
    if (!rule.match(relPath)) continue;
    if (rule.name === "product") return evaluatePreflight({ filePath: relPath, root: resolvedRoot });
    return { decision: "block", reason: rule.reason, file_path: filePath, matched_rule: rule.matched_rule ?? rule.name };
  }

  // Promoted rules check (was rule 6, applied to non-matching files)
  const promotedRules = loadPromotedRules(resolvedRoot);
  const promotedCheck = applyPromotedRules(null, relPath, promotedRules);
  if (promotedCheck.decision === "escalate") return promotedCheck;

  return { decision: "ok" };
}
```

CC goes from 16 (7 branches + paths + promoted rules check) to ~5 (loop + 1 special-case branch for product rule).

**Option B: Extract each rule block into a helper function**

Less aggressive; preserves the cascade shape but moves each rule's body into a named function. CC stays around 8-10 (cascade still has branches) but readability improves.

**Recommendation:** Option A (rule registry). It's a bigger change but eliminates the root cause (the 7-branch cascade) rather than papering over it. Option B leaves the cascade in place.

**Refactoring strategy for `evaluatePreflight`** (CC 6, L25-53):

Simple: extract the `preflight_checklist` array (L44-51) into a `buildPreflightChecklist(surface)` helper, and extract the for-loop (L33-37) into a `findPreflightMarker(surface, resolvedRoot)` helper. CC drops to ~3.

**Refactoring strategy for `evaluateInboundGate`** (CC 9, L52-81):

Three early-return branches (L53-54, L56-57, L59-60) plus the `findStaleObservations` + `buildContextMessage` call sequence. Extract the stale-detection logic into `findStaleStateChangeContext(prompt, root)` and have `evaluateInboundGate` orchestrate: input validation → state-change detection → context fetch → decision. CC drops to ~4.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/core/evaluate-write-gate.js`
- **Modify:** `tools/learning-loop-mastra/core/evaluate-inbound-gate.js`
- **Modify (possible):** `tools/learning-loop-mastra/.fallowrc.json` — add `hooks/legacy/**` to `ignorePatterns` IF the legacy file is excluded rather than refactored/deleted
- **Modify (possible):** `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` — delete or refactor
- **Create (possible):** `tools/learning-loop-mastra/core/write-gate-rules.js` — if Option A is chosen

## Implementation Steps

### Step 2.1 — Decide on the legacy file

Before touching `core/`, decide what to do with `hooks/legacy/bash-gate.js:23`:

**Option A: Refactor** — reduce `main`'s CC to <8 to bring CRAP below 30.
**Option B: Delete** — if the file's exports are unused (after the `09415f4` refactor extracted evaluators to core/, much of `hooks/legacy/bash-gate.js` may be dead). Verify with `grep -r "from.*bash-gate" tools/learning-loop-mastra/core/ tools/learning-loop-mcp/ 2>/dev/null` (excluding `node_modules`).
**Option C: Exclude** — add `hooks/legacy/**` to `.fallowrc.json:ignorePatterns`. Justification: `boundary-violation: "off"` already excludes the legacy dir from boundary rules; adding to ignorePatterns extends the same policy to health/dead-code analyzers.

**Recommendation:** Option B (delete) IF the exports are truly unused. Otherwise Option C (exclude) — consistent with existing policy and zero behavioral change. Document the choice in a brief journal entry.

This decision gates the rest of Phase 2 — if Option B is chosen, the file's `main` is gone and only the 3 core/ findings remain. If Option C is chosen, the legacy file stays but the `ignorePatterns` change requires updating `.fallowrc.json`.

### Step 2.2 — Refactor `evaluateWriteGate` (Option A: rule registry)

Implement the registry pattern from the Architecture section above. Move the rule data into `core/write-gate-rules.js` (export `WRITE_GATE_RULES`) and reduce `evaluateWriteGate` to a small loop. Verify with `pnpm test` after the change.

If CC is still too high after Option A, fall back to Option B (extract helpers per rule block) before considering suppression.

### Step 2.3 — Refactor `evaluatePreflight`

Extract `buildPreflightChecklist(surface)` and `findPreflightMarker(surface, resolvedRoot)`. Replace the for-loop (L33-37) and the checklist array (L44-51) with calls to these helpers.

### Step 2.4 — Refactor `evaluateInboundGate`

Extract `findStaleStateChangeContext(prompt, root)` that combines the `detectStateChange` + `findStaleObservations` logic. Replace the function body's middle section (L59-79) with a single call. Keep the early-return guards (L53-60) — those are inherent complexity.

### Step 2.5 — Verify locally with fallow audit

```bash
cd /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra
pnpm exec fallow audit \
  --root . \
  --gate all \
  --format sarif \
  --output-file /tmp/audit-phase2.sarif

# Confirm 0 high-crap-score findings
jq '.runs[].results[] | select(.ruleId == "fallow/high-crap-score") | .message.text' /tmp/audit-phase2.sarif
```

Expect: empty output (no findings). If non-empty, identify which functions still exceed threshold and iterate on the refactor.

### Step 2.6 — Run the full test suite

```bash
pnpm test
```

Expect: 1369 tests pass (no behavioral regression from refactoring). Refactor should be 1:1 behaviorally; if tests fail, the refactor changed semantics — revert and try again.

### Step 2.7 — Commit

```bash
git add tools/learning-loop-mastra/core/ tools/learning-loop-mastra/.fallowrc.json tools/learning-loop-mastra/hooks/legacy/bash-gate.js
git commit -m "refactor(evaluators): reduce cyclomatic complexity to clear fallow gate

The evaluator extraction in commit 09415f4 introduced 3 high-crap-score
findings (evaluateWriteGate CC 16, evaluatePreflight CC 6,
evaluateInboundGate CC 9). Refactor each to bring CRAP below the
threshold of 30:

- evaluateWriteGate: replace the 7-rule cascade with a declarative rule
  registry in core/write-gate-rules.js. CC drops to ~5.
- evaluatePreflight: extract checklist builder + marker finder. CC drops
  to ~3.
- evaluateInboundGate: extract stale-context detector. CC drops to ~4.

For hooks/legacy/bash-gate.js: [decide at runtime — explain whether
refactored, deleted, or excluded via .fallowrc.json]"

git push
```

The commit message body MUST NOT contain literal finding IDs per the Stable Code Artifacts rule.

## Success Criteria

- [ ] `core/evaluate-write-gate.js:61` `evaluateWriteGate` no longer appears in `fallow/high-crap-score` SARIF results
- [ ] `core/evaluate-write-gate.js:25` `evaluatePreflight` no longer appears in `fallow/high-crap-score` SARIF results
- [ ] `core/evaluate-inbound-gate.js:52` `evaluateInboundGate` no longer appears in `fallow/high-crap-score` SARIF results
- [ ] `hooks/legacy/bash-gate.js:23` resolved (refactored, deleted, or excluded via `.fallowrc.json`)
- [ ] `pnpm test` passes (1369 tests, no regressions)
- [ ] `pnpm exec fallow audit --gate all` reports 0 high-crap-score findings
- [ ] Local sanity check: `/tmp/audit-phase2.sarif` has 0 high-crap-score entries

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Refactor changes evaluator semantics, breaking tests | Medium | Phase 2 fails; revert and try again | `pnpm test` is the safety net. If a test fails, the refactor changed behavior — fix or revert. |
| CC doesn't drop below threshold after first refactor pass | Medium | Phase 2 doesn't fully complete | Iterate: extract more helpers, further flatten. If still stuck after 2 iterations, fall back to `// fallow-disable-next-line high-crap-score` with a documented justification (not recommended). |
| Rule registry refactor breaks the `product/**` special case (rule 5 returns `evaluatePreflight` result instead of block) | Low | `product/**` writes incorrectly blocked or allowed | The special case is encoded as `if (rule.name === "product") return evaluatePreflight(...)` in the loop. Keep this branch explicit; cover with a test for `product/**` paths. |
| `hooks/legacy/bash-gate.js` deletion breaks the legacy bash-gate hook runtime | Low (if unused) | The legacy surface breaks | Verify no imports of the legacy file's exports before deleting. The `hooks/legacy/**` path is presumably deprecated per `.fallowrc.json:boundary-violation: "off"`. |
| `.fallowrc.json` `ignorePatterns` addition masks other latent findings in `hooks/legacy/**` | Medium | Future maintenance debt | Document the exclusion in `.fallowrc.json` with a comment citing the `boundary-violation: "off"` precedent. |
| Refactor scope balloons past 3h effort estimate | Medium | Phase 2 overruns | Stop and ask user: complete what works, suppress the rest with justification, or split into follow-up. |