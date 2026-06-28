# Code Review Report — Phase E Mechanism A+B Implementation

**Branch:** `260627-1304-phase-e-mechanism-a-b-plan`
**Commits:** `1ea9bb3` (Mechanism A), `a4cf422` (Mechanism B), `dcff9ef` (chore)
**Plan:** `plans/260627-1304-phase-e-topology-mechanism-a-b/plan.md`
**Date:** 2026-06-27T19:22Z
**Reviewer:** code-reviewer subagent (full audit, 10 concerns)

---

## Verdict: **CONCERNS**

The implementation faithfully executes the plan. Public wire shape is preserved (`meta_state_relationships` returns identical output for matching inputs — snapshot test confirms). FCIS invariant holds. **All 14 test globs pass (1336 tests, 26.69s).** No regressions, no behavior break.

But the review surfaced **2 factual errors in commit messages / plan doc** and **4 latent issues** that should be addressed before merge. None are P0 in the sense of "the code is broken in production."

---

## Critical (block merge)

### C1. Commit messages report 1335 tests; actual count is 1336

**Evidence:**

- Commit `1ea9bb3` body: "All 1335 tests pass."
- Commit `a4cf422` body: "All 1335 tests pass. FCIS invariant holds."
- Per-namespace counts from `pnpm test` output:
  `mcp-tests=909, mcp-core-tests=25, mcp-core=40, mcp-entry=39, mcp-lib=24, mcp-tools=11, mastra-js=70, mastra-cjs=69, claude-coord-cjs=61, factory-cjs=13, phase-e-foundation=18, interface-regression-guards=21, interface-contract-tests=25, phase-e-shell-restructure=11` → **sum = 1336**.
- The namespaced runner (`run-pnpm-test-namespaced.mjs`) emits only `pass (14 globs, 26.69s)` — **no total test count line**. A reader cannot verify the number from output alone.

**Recommended fix:**

Either amend the commit messages, or — better — modify `run-pnpm-test-namespaced.mjs` to emit `tests NNNN / pass NNNN / fail 0` aggregate. The current silent aggregation is the actual root cause; every future claim will drift.

---

### C2. Plan §Acceptance Criteria says "27 production files"; manifest has 29

**Evidence:**

- `find tools/learning-loop-mastra/core -type f \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \) -not -path '*/__tests__/*' -not -path '*/lib/*' -not -name '*.test.js' | wc -l` → **29**.
- `grep -c "^  - path:" tools/learning-loop-mastra/core/placement.yaml` → **29**.
- Plan.md line 25: "Baseline count ... = **27** (NOT 28 as the brainstorm estimated)". Plan line 105: "every production `.js`/`.cjs`/`.mjs` file under `core/` ... verified baseline = 27 files".
- Pre-Mechanism-B baseline (commits before `a4cf422`) was 23 files. Plan's "27" appears to count 23 + 4 colocated `*.test.js` files that the manifest test correctly excludes.
- The placement-manifest test (`placement-manifest.test.js:50-72`) self-checks and passes — the invariant is intact at HEAD. Only the plan doc is stale.

**Recommended fix:**

Update `plans/260627-1304-phase-e-topology-mechanism-a-b/plan.md` to:

> "enumerates every production `.js`/`.cjs`/`.mjs` file under `core/` (excluding `__tests__/`, `lib/`, `node_modules/`, and `*.test.js` at any depth — verified baseline = **29 files**: 23 pre-entry/ + 6 `entry/*.js` added by Mechanism B)"

The mechanism is sound; the doc needs to match reality.

---

## Important (fix before merge)

### I1. Layering test regex misses `../` imports (silent invariant gap)

**Evidence:**

- `__tests__/phase-e-foundation/placement-manifest.test.js:109`: `importRe = /from\s+["']\.\/([\w.-]+\.m?js)["']/g;` — captures only `./X.js`.
- All 5 factory files in `core/entry/` import from `../meta-state.js` (facade) and one imports `../gate-logic.js` (facade). These `../` imports are **never** checked.
- Currently safe because every `core/entry/` file is `role: helper` (unrestricted per `ALLOWED` map), and the FCIS test catches the dangerous case. But the test's docstring implies full coverage.

**Recommended fix:**

Extend the regex to also capture parent-dir imports:

```js
const importRe = /from\s+["'](?:\.\/|\.\.\/)([\w./-]+\.m?js)["']/g;
```

Update the role-map lookup to strip the `../` prefix before `roleMap.get(importedFile)`.

---

### I2. Factory `outboundRefs()` does not implement dual-field `promoted_to_rule` fallback (abstraction drift)

**Evidence:**

- Plan §Acceptance Criterion line 113 explicitly requires: "the dual-field `promoted_to_rule` migration logic ... legacy findings without `promoted_to_rule` still resolve to their origin rule via `origin_inverse`".
- `core/entry/finding.js:15-29`: `outboundRefs()` only emits `promoted_to_rule` if `parsed.promoted_to_rule` is set. **No fallback.**
- `tools/legacy/meta-state-relationships-tool.js:96-105`: handler patches the ref post-hoc via `buildInverseIndexes`. This logic lives only in the tool.
- `rule.inboundRefs()` correctly handles the inverse side (rule.origin → finding.promoted_to_rule), but `finding.outboundRefs()` does not.
- Net effect: `factoryFor(LEGACY_FINDING).outboundRefs()` returns `[consolidated_into, reopens]` only; `metaStateRelationshipsTool.handler({id: LEGACY_FINDING, direction: "outbound"})` returns `outbound.promoted_to_rule = "rule-legacy-origin"` via the post-hoc patch.
- No production caller of `factoryFor().outboundRefs()` exists outside tests today, so the impact is latent. But Phase 3 evaluators will inherit the surprise.

**Recommended fix:**

Either:

1. Move the dual-field fallback INTO `createFinding.outboundRefs(entries)` (pass entries as arg), OR
2. Document in `core/README.md` §Soft inversion that "factory returns its own refs; the tool composes with `buildInverseIndexes` for legacy compatibility."

Recommend option 1 — keeps the abstraction honest and the plan's AC literally satisfied.

---

### I3. `loop-design.kindForId` uses string-prefix heuristic

**Evidence:**

- `core/entry/loop-design.js:9-11`: `kindForId(id) = id.startsWith("rule-") ? "rule" : "finding"`.
- Rule ids start with `rule-` by convention; finding ids start with `meta-`. The convention is not enforced anywhere. A future schema change or a misclassified entry would silently produce wrong-kind refs.
- `validateCrossRefs` would still flag orphans, but with the wrong target entry.

**Recommended fix:**

Lookup-first, fallback-second:

```js
function kindForId(id, entries) {
  const found = entries.find((e) => e.id === id);
  if (found) return found.entry_kind ?? "finding";
  return id.startsWith("rule-") ? "rule" : "finding";
}
```

Pass `entries` (already available at `outboundRefs()` call sites in `validateCrossRefs`/`outboundRefsAll`). The heuristic is only meaningful when the target is missing — exactly the dangling-ref case.

---

### I4. `rule.matches()` glob branch is a stub

**Evidence:**

- `core/entry/rule.js:29-33`: glob branch builds `new RegExp(parsed.pattern).test(filePath)`. A glob like `**/*.test.js` is not a valid regex literal. The `try/catch` swallows the error and returns `false`. Net effect: glob rules always fail to match via the factory.
- Production callers of `r.matches()`: **none** outside `rule.test.js` (verified by grep). The factory's `matches()` is a parallel implementation of the real `gate-logic.applyPromotedRules` path, which uses `globMatch()` from `gate-logic.js:47`.
- The snapshot test fixture `RULE_FOR_LEGACY_FIXTURE` uses `pattern_type: "glob"`, but the snapshot test never calls `matches()`.

**Recommended fix:**

Delete the glob branch (KISS — no production caller; real glob handling lives in `gate-logic.globMatch`). Add a guard test that `createRule({pattern_type: "glob"}).matches(...)` returns false (because glob is handled elsewhere) so future readers see the intent.

---

## Passed concerns

- **Soft-inversion reference equality + ADR** (PASS): `core/entry/index.test.js:121-131` enforces reference equality on all 4 kinds; `core/README.md:41-49` documents the ADR inline.
- **Snapshot test isolation** (PASS): `resolveRoot()` and `readRegistry()` read `process.env.GATE_ROOT` fresh per call; each test gets an independent temp dir.
- **factoryFor `entry_kind ?? "finding"` default** (PASS): all 6 fixtures set `entry_kind`; `meta-state.js:355-357` post-load coerces missing values before they reach the factory.
- **Runner glob picks up `core/entry/*.test.js`** (PASS): the new glob at `run-pnpm-test-namespaced.mjs:34` correctly discovers the 5 sibling tests; `mcp-entry` namespace shows 39 tests passing.

---

## Recommended actions (ordered)

1. Fix commit-message test counts to "1336" (or have the runner print totals).
2. Update `plan.md` §Acceptance Criterion to "29 production files (23 pre-entry/ + 6 entry/* added by Mechanism B)".
3. Extend `placement-manifest.test.js` layering regex to also match `\.\.\/X\.js`.
4. Move the dual-field `promoted_to_rule` fallback into `createFinding.outboundRefs(entries)` (or document the factory/tool split in `core/README.md` §Soft inversion).
5. Fix `loop-design.kindForId` to prefer registry lookup over prefix heuristic.
6. Delete the glob branch in `rule.matches()` (KISS — no production caller).

---

## Unresolved questions

None. All 10 concerns investigated and dispositioned.
