---
phase: 2
title: "Probe 4: pnpm test consumers"
status: pending
priority: P2
dependencies: []
---

# Phase 2: Probe 4 — pnpm test consumers

## Overview

Enumerate every consumer of the `pnpm test` command in the repo and classify each by prefix-line sensitivity. The brainstorm's Layer 1 fix shape (`[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL` prefix per namespace) only works if the consumers can tolerate the prefix, or if we can partition the consumers (e.g., CI gets the raw output, pre-commit gets the prefixed output).

## Why This Probe Is Blocking

Plan B's Layer 1 fix cannot be finalized without knowing which consumers will break if the runner emits non-spec-reporter lines. A consumer that parses the output line-by-line (e.g., a CI script) may fail on a prefix line. A consumer that just runs the command and checks the exit code (e.g., a hook) is fine.

## Requirements

- Functional: produce a complete list of `pnpm test` consumers; classify each.
- Non-functional: read-only. Do not modify any source files. The `grep` is the only command needed.

## Related Code Files (read-only)

- `package.json` — primary test script definition
- `README.md` — documented test commands
- `AGENTS.md` — agent-facing documentation of the test command
- `tools/learning-loop-mcp/core/meta-state.js` — code-side, may reference test execution
- `tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js` — test consumer
- All `plans/*/plan.md` and `plans/*/phase-*.md` that mention `pnpm test` (already partially enumerated)
- `tools/learning-loop-mcp/hooks/*` — hook consumers
- `.factory/hooks/*` — Droid hook consumers
- `.claude/settings.json` and similar — configuration references

## Implementation Steps

1. **Run the canonical grep:**
   ```bash
   grep -r "pnpm test" --exclude-dir=node_modules --exclude-dir=.git .
   ```
   Record the output. This is the master list.

2. **De-duplicate by file.** Group matches by file path. For each file, count the number of matches and note whether the matches are in: (a) markdown documentation, (b) JSON config, (c) JS/TS code, (d) shell script, (e) test file, (f) plan/report.

3. **For each consumer file, classify by parsing sensitivity:**
   - **Class A (exit-code only):** runs `pnpm test` and checks `$?` / exit code. Prefix lines are invisible.
   - **Class B (output parsed):** parses the output line-by-line (e.g., looking for "pass", "fail", test names). Prefix lines may break parsing.
   - **Class C (documentation only):** mentions `pnpm test` in prose. Prefix lines are invisible.
   - **Class D (config only):** defines `pnpm test` in `package.json` scripts. Prefix lines are invisible.
   - **Class E (test fixture):** uses `pnpm test` as test data (e.g., a test that asserts the `package.json` test script). Prefix lines are invisible.

4. **For each Class B consumer, identify the parser:**
   - What regex / parser does it use?
   - Does the parser anchor on the first character of the line, or on patterns within the line?
   - Will the prefix `[ns] ==> start` collide with any pattern?

5. **Build the summary table.** Rows = consumer files. Columns: file path, classification (A/B/C/D/E), parser description (if B), prefix-tolerance verdict (yes/no/conditional), evidence line number.

   **Enumeration policy (per Validation Session 1, D3):**
   - **Class A & B (executable, output-relevant):** enumerated exhaustively with a full per-row entry.
   - **Class C (documentation), D (config), E (test fixtures):** counted and noted as "prefix-tolerance n/a — by inspection, these do not parse stdout line-by-line" in a single row per class, not enumerated individually.
   - This keeps the <300 line budget intact while preserving the full Class A/B analysis that Plan B needs.

6. **Compute the global verdict:**
   - How many Class B consumers exist?
   - Can all Class B consumers tolerate the prefix?
   - If not, what partition or migration is needed?

## Success Criteria

- [ ] All `pnpm test` consumers enumerated (no missed files)
- [ ] Each consumer classified A/B/C/D/E with file:line evidence
- [ ] Summary table produced
- [ ] Global verdict: "all consumers tolerate the prefix" OR "X consumers break; fix is [partition | migration | wrapper]"
- [ ] For any Class B consumer that breaks, the file:line of the parser is cited

## Risk Assessment

- **Risk:** A consumer is missed because it uses an indirect invocation (e.g., `npm test` instead of `pnpm test`). **Mitigation:** also grep for `npm test` and `yarn test`; record any indirect invocations.
- **Risk:** A consumer's parser is dynamic (e.g., reads a different format per environment). **Mitigation:** note this in the consumer's row; flag for Plan B's design.
- **Risk:** A consumer is a plan/report file (Class C) that, if updated, becomes a coordination cost. **Mitigation:** Class C consumers are documentation-only; record them but do not block on updating them.

## Output Format

Append to `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` under `## Probe 4`:

```markdown
### Probe 4: pnpm test consumers

**Question:** Can all `pnpm test` consumers tolerate a `[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL` prefix line per namespace?

**Answer:** [Yes / No (X of N consumers break) / Conditional (depends on partition)]

**Consumer summary table:**
| File | Class | Parser | Prefix tolerance | Evidence |
|------|-------|--------|------------------|----------|
| `package.json` | D | (script def) | n/a | line 7 |
| `README.md` | C | (prose) | n/a | line 23 |
| ... | ... | ... | ... | ... |

**Class B consumers (output parsed):**
- `path/to/file.js:LINE` — parser description, verdict

**Global verdict:** [1-2 sentences]

**New constraints (if any):** [List, or "None"]
```
