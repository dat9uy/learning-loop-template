# Fix C1 — re-source validate-registry-refs to see citation edges

## What changed

The CI hard-enforcer `tools/learning-loop-mastra/scripts/validate-registry-refs.js`
(the BLOCK signal in `.github/workflows/meta-state-refs-check.yml`, run on push:main)
was reading only `meta-state.jsonl` + `change-log.jsonl` and omitted
`citations.jsonl`. After the relationship migration
(`consolidated_into` / `origin` / `supersedes` / `promoted_to_rule` /
`consolidates` were de-routed from `CROSS_REFS` in
`core/entry/relationship-graph.js`), the canonical edges moved to citation rows
in `citations.jsonl`, so a citation with a missing `target` produced no blocking
orphan on main — the gate was blind to the entire migrated surface.

### Production fix (`scripts/validate-registry-refs.js`)
- Added `CITATIONS_FILENAME = "citations.jsonl"` constant (mirrors the unexported
  `core/meta-state.js#CITATIONS_FILENAME`; the path helper is not exported, so
  the constant is defined locally to avoid a cross-module dependency).
- In the CLI entry, `readJsonl(citationsPath)` is now unioned into `allEntries`
  alongside meta-state + change-log.
- The existing `computeDanglingRefs` / `outboundRefsOf` / `classifyRef` pipeline
  already iterates all entries generically. `forwardRefs(citation)` emits
  `{field:"source"}` and `{field:"target"}`; `classifyRef` buckets a citation
  with a missing target as `blocking` (citation `sourceKind === "citation"`,
  not `"change-log"`, and `isTerminalSource(citation)` is false for
  `status:"active"`). Verified manually and via tests.
- Updated the header doc and the final 0-blocking log line to reflect the
  3-file union.
- Stripped stale finding-code references (`red-team F2/F3/F8`) from comments
  per the project rule on code-comment hygiene; invariants described directly.

### Test rewrite (`__tests__/legacy-mcp/validate-registry-refs.test.js`)
Rewrote the 15 failing tests to the new edge model (37 tests total, all passing):
- Migrated on-record fields (`consolidated_into` on a finding, `origin` /
  `supersedes` on a rule, `consolidates` / `supersedes` on a change-log,
  `promoted_to_rule` on a finding) now assert `outboundRefsOf` returns `[]`
  (inert-historical).
- Added citation coverage: citation with missing `target` → `blocking`;
  missing `source` → `blocking` (symmetric endpoint); target `resolved` →
  `informational`; target `superseded` → `informational`; target stale-view
  (open + >7d) → `informational`; target open-and-fresh → healthy (null bucket).
- Kept the non-migrated field assertions: `reopens` (finding),
  `applies_to_resolution` (rule, forwardOnly/riExempt), `addresses` /
  `proposed_design_for` (loop-design).
- Kept the cross-kind duplicate-id guard, same-kind versioned-append +
  merge-collision non-blocking cases, and 3-bucket classification shape.
- Citation fixtures constructed inline as
  `{id:"citation-…", entry_kind:"citation", source, target, rationale,
  recorded_at, recorded_by, status:"active"}`.

## Test result
`npx vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/validate-registry-refs.test.js`
→ 1 file passed, 37 tests passed (0 failed).

## Manual CLI verification
A fixture root with only `meta-state.jsonl` (one open finding `f-src`) and
`citations.jsonl` (one citation `cit-dangling` whose `target: "cl-gone"` is
absent) classifies the dangling citation target as blocking and exits 1:
`cit-dangling (citation).target -> cl-gone [missing]`.

## Files modified
- `tools/learning-loop-mastra/scripts/validate-registry-refs.js`
- `tools/learning-loop-mastra/__tests__/legacy-mcp/validate-registry-refs.test.js`