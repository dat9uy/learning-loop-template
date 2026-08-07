---
phase: 1
title: "Spike & shell-quote dependency adoption"
status: pending
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Spike & shell-quote dependency adoption

## Overview

Adopt `shell-quote` >=1.10.0 as a parse-only dependency behind the bash gate,
with the CVE-2026-9277 mitigations enforced as tests-first guards. Spike the
parse() output against the brainstorm's bypass shapes to confirm the shim can
identify verb + pipe-target + quoted-data for every shape before any gate
logic changes.

## Requirements

- Functional: `shell-quote` >=1.10.0 is a declared dependency; a parse-only
  import path is established; `quote` is unimportable from `shell-quote` in the
  gate path.
- Non-functional: dep adoption follows the loop's side-effect discipline
  (`gate_check` + `runtime_state_record` ledger + `meta_state_report` budget
  check before `pnpm add`).

## Architecture

Parse-only flow: `parse(cmd)` -> read tokens -> classify -> check config.
`quote()` is never called and tokens are never passed to an executor. The
CVE-2026-9277 injection is *realized* at `quote()`, not `parse()`, so a
parse-only classify-only gate is not on the realization path. Defended by:
pin >=1.10.0 (strict shape validation fix, commit 1518179); forbid `quote`
import; consume only string/positional tokens, never trust `.op`.

## Related Code Files

- Modify: `package.json` (add `shell-quote` >=1.10.0).
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/shell-quote-guard.test.js` (version + import guards + parse-only invariants).
- Create: `tools/learning-loop-mastra/core/shell-parse.js` (thin parse-only wrapper, Phase 2 fills the shim; Phase 1 lands only the import guard).

## Implementation Steps (TDD — tests first)

1. **Write the guard tests first** (`shell-quote-guard.test.js`):
   - Assert `require("shell-quote/package.json").version` >= `1.10.0`.
   - Assert the gate path module (`core/shell-parse.js`) exports a parse
     function and does NOT export/re-export `quote`.
   - **Path-wide import guard (red-team #8):** grep `core/` + `hooks/` source
     for `import\s*\{[^}]*\bquote\b[^}]*\}\s*from\s*["']shell-quote["']` and
     `require\(\s*["']shell-quote["']\s*\)` then a `quote` usage; fail on ANY
     match. This makes the test guard independent of the lint rule, so a future
     direct `import { quote } from "shell-quote"` in `gate-logic.js` (bypassing
     `shell-parse.js`) is caught by tests, not just lint.
   - Assert `parse('echo $(echo evil)')` does NOT evaluate the `$(...)`
     (README confirms parse does not interpret command substitution); the
     `$(...)` must appear as a token, not as executed output.
   - Assert `parse` of each brainstorm bypass shape returns a token array from
     which the verb and pipe-target are identifiable (spike acceptance b/c).
2. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/shell-quote-guard.test.js` — it must FAIL (no dep yet).
3. **Side-effect gate before install:** call `gate_check`; record the ledger
   row via `runtime_state_record({affected_system, kind:"ledger-event", id,
   source_ref, timestamp})`; record reasoning via
   `meta_state_report({category:"budget-check", severity:"warning",
   affected_system:"bash-gate", description:"adopt shell-quote >=1.10.0 parse-only"})`.
4. `pnpm add shell-quote@>=1.10.0` (pin). Verify installed version.
5. Create `core/shell-parse.js` skeleton: `export { parse } from "shell-quote"`
   wrapped so `quote` is deliberately not re-exported.
6. Re-run the guard tests -> green.
7. Run the brainstorm's spike script verbatim against the installed library;
   paste the parse output into the plan report as evidence (spike acceptance a-d).

## Success Criteria

- [ ] `shell-quote` >=1.10.0 in `package.json`; installed version asserted by test.
- [ ] `quote` is not importable from `shell-quote` anywhere in `core/`+`hooks/` (grep-based test guard + lint, both green).
- [ ] `parse()` does not evaluate `$(...)` (test guard green).
- [ ] Spike output confirms verb + pipe-target + quoted-data are identifiable
      for all 6 brainstorm shapes (echo-concat, printf-v, eval, node -e, bash <<<, printf-to-bash).
- [ ] Side-effect discipline recorded (gate_check + ledger + budget-check report).

## Risk Assessment

- **Wrong version pinned** -> CVE-2026-9277 reachable. Mitigation: version
  asserted by test; pin floor `>=1.10.0`.
- **Accidentally importing `quote` later** -> reopens the realization path.
  Mitigation: lint rule (forbid `quote` from `shell-quote` in `core/` +
  `hooks/`) added in Phase 1, enforced through Phase 5.
- **Dep adds transitive surface** -> `shell-quote` is dependency-free; confirm
  with `pnpm why` / lockfile review.