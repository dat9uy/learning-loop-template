---
phase: 4
title: "PR-body CI Advisory"
status: complete
priority: P1
dependencies: [1]
effort: "~15min (post-H8 simplification)"
---

# Phase 4: PR-body CI Advisory

## Overview

Add a new GitHub Actions workflow that diffs `meta-state.jsonl` on every `pull_request` and emits a compact delta summary to `$GITHUB_STEP_SUMMARY`. The PR body is the source of truth (per Phase 5's rule); the advisory surfaces the line-level deltas to reviewers as a complementary signal.

**Simplified parser (Red Team H8):** Single-line `git diff --stat` of `meta-state.jsonl` + `grep` for `+` lines to extract added/removed entry ids. No 7-category classifier. Cuts Phase 4 from ~1h to ~15min.

**Forward invariant for finding 1.** PR #8's `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` did enumerate deltas, but the format was per-plan-file, not PR-rendered. The CI advisory makes the deltas visible in the PR's Checks tab so reviewers can verify closeout without opening the per-plan file.

## Requirements

- Functional: workflow runs on `pull_request` only (not `push` to main).
- Functional: workflow diffs `meta-state.jsonl` between PR base and HEAD, with fork-PR handling (Red Team H4).
- Functional: workflow emits a delta summary to `$GITHUB_STEP_SUMMARY` with markdown-escaped content (Red Team M1).
- Functional: parser detects added/removed entry ids from `+`/`-` lines.
- Functional: PR-body section detection checks for non-empty content under each `## <category>` header (Red Team H5).
- Non-functional: no new dependencies (bash + git + grep are runner stdlib).
- Non-functional: advisory-only; never exits non-zero.
- Non-functional: parser test covers the 3 categories that have actually shipped (Swept, Resolved, New — Red Team L8).

## Architecture

```yaml
# .github/workflows/meta-state-pr-body-advisory.yml
name: Meta-state registry delta advisory
on:
  pull_request:
    paths:
      - 'meta-state.jsonl'

permissions:
  contents: read
  pull-requests: read  # for PR body fetch in step 8

jobs:
  registry-deltas:
    runs-on: ubuntu-latest
    timeout-minutes: 5  # explicit cap; not 30 like test.yml
    steps:
      - name: Checkout PR head
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
      - name: Fetch base ref (Red Team H4 fix)
        run: |
          # For non-fork PRs, origin points to the upstream repo.
          # For fork PRs, GITHUB_TOKEN has read access to upstream.
          git fetch origin "$GITHUB_BASE_REF" --depth=1 2>/dev/null || \
            git fetch https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }} "$GITHUB_BASE_REF" --depth=1
        continue-on-error: true  # advisory-only; never block
      - name: Diff registry
        run: |
          set -euo pipefail
          git diff --unified=0 "origin/$GITHUB_BASE_REF"...HEAD -- meta-state.jsonl > /tmp/registry.diff || true
      - name: Parse + emit (Red Team H8 simplification)
        run: tools/scripts/ci-registry-deltas.sh /tmp/registry.diff
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Script design (`tools/scripts/ci-registry-deltas.sh`, ~30-50 lines):
1. `set -euo pipefail` at the top.
2. Read `/tmp/registry.diff` line by line.
3. For each `+` line, extract the JSON id field via `grep -oP '"id":\s*"\K[^"]+'`.
4. For each `-` line, do the same (removed ids).
5. Emit markdown to `$GITHUB_STEP_SUMMARY`:
   ```markdown
   ## Meta-state registry deltas
   
   - **+N entries**: id1, id2, ...
   - **-M entries**: id3, id4, ...
   - **No deltas** (if N+M === 0)
   ```
6. **Markdown escape (Red Team M1):** Pipe every interpolated string through a `escape_md()` function that replaces `|`, `<`, `>`, `[`, `]`, backticks with HTML entities or wraps in code fences.
7. **PR-body section detection (Red Team H5):** Use `actions/github-script@v7` to fetch PR body and grep for non-empty content under each required header:
   ```js
   const body = await github.rest.pulls.get({...}).then(r => r.data.body);
   const sections = ['Swept entries', 'Resolved entries', 'New entries', 'Promoted rules', 'Superseded entries', 'Archived entries'];
   for (const s of sections) {
     const re = new RegExp(`^## ${s}\\s*\\n([^#]+)`, 'm');
     const m = body.match(re);
     if (!m || m[1].trim().length === 0) {
       core.warning(`PR body section "${s}" is empty or missing`);
     }
   }
   ```
8. Exit 0 always (advisory-only).

## Related Code Files

- Create: `.github/workflows/meta-state-pr-body-advisory.yml`
- Create: `tools/scripts/ci-registry-deltas.sh` (~30-50 lines bash + grep, post-H8 simplification)
- Create: `tools/learning-loop-mcp/__tests__/ci-registry-deltas.test.cjs` (parser test, 3 categories)

## Implementation Steps

### TDD: RED first

1. **Write failing parser test.** Create `tools/learning-loop-mcp/__tests__/ci-registry-deltas.test.cjs` with 3 test cases (Swept, Resolved, New — the 3 categories that have actually shipped). Use a fixture diff input. Assert the parser emits the correct markdown section. Test fails: script does not exist.

2. **Write failing markdown-escape test (Red Team M1).** Add a test where the diff contains `<script>alert(1)</script>` in a description field. Assert the parser output escapes to `&lt;script&gt;` or wraps in code fences. Test fails: no escape function yet.

3. **Write failing fork-PR test (Red Team H4).** Add a test that simulates a fork-PR environment (`GITHUB_BASE_REF` set, `origin` not the upstream). Assert the workflow falls back to the `x-access-token` fetch. Test fails: workflow does not have fallback step.

### GREEN

4. **Implement the parser script.** `tools/scripts/ci-registry-deltas.sh`. Reads diff, extracts ids, emits markdown with `escape_md()`. ~30-50 lines.

5. **Create the workflow file.** `.github/workflows/meta-state-pr-body-advisory.yml`. Pull-request trigger with `paths: ['meta-state.jsonl']`. Permissions block. Fork-PR fallback step. `set -euo pipefail`. 5-minute timeout.

6. **Implement PR-body section detection (Red Team H5).** Use `actions/github-script@v7` with regex `^## ${section}\\s*\\n([^#]+)` to require non-empty content per header. Empty/missing sections emit a `core.warning` but do not fail the check.

7. **Run parser tests.** `pnpm test`. All 3 RED tests should now be GREEN.

8. **Validate workflow syntax.** `gh workflow lint .github/workflows/meta-state-pr-body-advisory.yml` (or `actionlint` if available).

### REFACTOR

9. **Refactor parser for readability.** Extract `escape_md()` and id-extraction helpers; reduce complexity if needed.

10. **Add markdown-escape hardening.** Verify all interpolated strings pass through `escape_md()`; no string concat bypasses.

## Success Criteria

- [ ] RED test: parser emits delta summary for added lines (3 categories: Swept/Resolved/New)
- [ ] RED test: parser markdown-escapes `<script>` payload (M1)
- [ ] RED test: workflow falls back to `x-access-token` fetch on fork PRs (H4)
- [ ] GREEN: all 3 RED tests pass
- [ ] GREEN: `pnpm test` passes (no regressions)
- [ ] Workflow file syntax valid (lint passes)
- [ ] PR-body section detection requires non-empty content (H5)
- [ ] Workflow exits 0 even on fork-PR base ref failure (advisory-only)

## Risk Assessment

- **Fork-PR base ref failure (H4).** Risk: medium. `git fetch origin $GITHUB_BASE_REF` fails on fork PRs. Mitigation: explicit fallback to `x-access-token` fetch with `continue-on-error: true`.
- **Markdown XSS in step summary (M1).** Risk: medium. `$GITHUB_STEP_SUMMARY` is rendered as HTML. Mitigation: `escape_md()` function on all interpolated strings + RED test for `<script>` payload.
- **PR-body empty-header bypass (H5).** Risk: medium. Exact-match grep does not verify content. Mitigation: regex requires non-empty content under each header.
- **`set -euo pipefail` missing.** Risk: low. The plan's previous version did not configure shell strict mode. Mitigation: explicit `set -euo pipefail` at the top of the script.
- **Workflow runs on every PR even without registry changes.** Risk: very low. `paths` filter scopes the trigger to PRs touching `meta-state.jsonl`.
- **No `required-status-checks` config means advisory can be ignored.** Risk: low (intentional). First ship is advisory; promote to required check after one quarter of measured compliance.
- **`meta_state_batch` 500-line hunk (now simplified).** Risk: very low. The simplified parser uses `git diff --stat` + `grep` on `+`/`-` lines; no jq per-line forking. 500 lines is trivial for grep.
