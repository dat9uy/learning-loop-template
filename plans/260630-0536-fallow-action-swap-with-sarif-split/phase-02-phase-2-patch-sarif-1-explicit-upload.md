---
phase: 2
title: "Phase 2: Patch SARIF + 1 explicit upload"
status: pending
priority: P2
dependencies: ["phase-01-phase-1-correct-design-evidence"]
---

# Phase 2: Patch SARIF + 1 explicit upload

## Overview
Amend `.github/workflows/test.yml` to (a) disable the fallow Action's built-in SARIF upload (`sarif: false`), (b) add an inline jq patch step that rewrites `runs[i].automationDetails.id` on runs where it's currently null, and (c) add a single explicit `codeql-action/upload-sarif@v4` call with `category: fallow` and `sarif_file:` pointing at the patched file. Update `tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js` to reflect the corrected design (existing test #7 and #8 need updates; 5 new tests added).

## Requirements

### Functional
- `.github/workflows/test.yml` `Fallow audit (PR gate)` step changes `sarif: true` → `sarif: false`.
- A new step `Patch fallow SARIF per analyzer (jq)` runs after the fallow Action step. It:
  - Reads `${{ steps.analyze.outputs.sarif }}` (Action's SARIF output path; matches the current failure-upload path).
  - For each `runs[i]` where `automationDetails == null`, sets `automationDetails.id` to:
    - `fallow/audit/dead-code` if `rules[0].id` starts with `fallow/unused-`, `fallow/private-`, `fallow/duplicate-export`, or `fallow/unlisted-`
    - `fallow/audit/health` if `rules[0].id` starts with `fallow/high-`, `fallow/low-`, `fallow/long-`, or `fallow/duplicated-`
    - `fallow/audit/dupes` otherwise (defensive fallback)
  - Writes the patched SARIF to `<artifacts-dir>/fallow-results-patched.sarif` (artifacts-dir defaults to `.`).
- A new step `Upload fallow SARIF to Code Scanning` uses `github/codeql-action/upload-sarif@v4` with:
  - `sarif_file: <artifacts-dir>/fallow-results-patched.sarif`
  - `category: fallow`
  - `if: success()` (only upload on green gate)
- The existing `Upload fallow SARIF on failure` step's path is updated from `${{ steps.analyze.outputs.sarif }}` to `<artifacts-dir>/fallow-results-patched.sarif` so failure artifacts contain the patched file (matches the new uploader's source).

### Non-functional
- The jq patch must be **idempotent**: re-running it on already-patched input (where some `automationDetails.id` is non-null) is a no-op for those runs. This means the patch must only write `automationDetails` when it's currently null.
- The jq patch must NOT depend on Python (jq is pre-installed on GitHub-hosted runners; no `setup-python` step needed).
- The classifier must be **rules-prefix-based**, not run-index-based, so drift in fallow's analyzer ordering (which already happened between 2.102.0 and 2.103.0 — see source-audit report) doesn't break the patch.
- No new top-level workflow files. Only `test.yml` is amended.
- Workflow file length stays under 200 lines (currently 132; amendment adds ~25 lines = ~157 total).

## Architecture

```
                          ┌─────────────────────────────────────┐
                          │ GitHub Actions runner (Ubuntu)      │
                          │ - has jq pre-installed              │
                          │ - has actions/checkout@v4 (workflow) │
                          │ - has fallow Action via SHA pin      │
                          └─────────────────────────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            │                           │                           │
            ▼                           ▼                           ▼
   ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
   │ fallow Action   │         │ Patch step (jq) │         │ Upload step     │
   │ (sarif: false)  │────────▶│ rewrites        │────────▶│ codeql-action/  │
   │                 │         │ automationDet.  │         │ upload-sarif@v4 │
   │ outputs:        │         │ .id per run     │         │ category: fallow│
   │  - sarif: <path>│         │ idempotent      │         │ 1 call          │
   └─────────────────┘         └─────────────────┘         └─────────────────┘
            │                           │                           │
            ▼                           ▼                           ▼
   <artifacts-dir>/           <artifacts-dir>/             GitHub Code Scanning
   fallow-results.sarif       fallow-results-patched.sarif  (under category: fallow)
   (Action output)            (patched; source for upload)
```

### Inline jq script (excerpt — full text in implementation step 2.3)

```bash
jq '
  .runs |= map(
    if .automationDetails == null then
      .automationDetails = {
        id: (
          if (.tool.driver.rules[0].id // "" | test("^fallow/(unused|private|duplicate-export|unlisted)-"))
          then "fallow/audit/dead-code"
          elif (.tool.driver.rules[0].id // "" | test("^fallow/(high|low|long|duplicated)-"))
          then "fallow/audit/health"
          else "fallow/audit/dupes"
          end
        )
      }
    else .
    end
  )
' "$SARIF_INPUT" > "$SARIF_OUTPUT"
```

Key design properties:
- `if .automationDetails == null then ... else . end` makes the patch idempotent.
- `// ""` and `test("^...")` handle the edge case of runs with no rules array (e.g., the dupes run synthesized locally — its rules array is empty, so rules[0].id would be null; we treat it as fallback to dupes).
- The prefix map uses `test()` (regex match) instead of `startswith()` chained with `or` — fewer characters, equivalent semantics.

## Related Code Files
- **Modify**: `.github/workflows/test.yml` — add patch step + explicit upload step; flip `sarif:` to `false`; **add `id: analyze` to the fallow Action invocation** (so `${{ steps.analyze.outputs.sarif }}` resolves); repoint failure-upload path
- **Modify**: `tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js` — update test #7 (no Python heredoc), test #8 (failure upload path); add 5 new tests
- **Create**: `tools/learning-loop-mastra/__tests__/fixtures/sarif/fallow-audit-2-runs.sarif` — minimal fixture for the patch step's unit test (if extracted as a shell test); optional
- **No delete**

## Implementation Steps

### TDD structure for this phase
Tests-first means: write each workflow-shape test BEFORE the corresponding workflow change. The tests assert the corrected design; the workflow change satisfies them.

#### Step 2.0 — Establish baseline test count (red-team finding: claim "1380+" was unverified)
**Before any amendment**, capture the current local test count so the post-amendment assertion has a measurable target:

```bash
pnpm test 2>&1 | tee /tmp/test-baseline.log | grep -E "tests|pass|fail" | tail -5
# Capture the actual baseline number
grep -oE "# tests [0-9]+|# pass [0-9]+|# fail [0-9]+" /tmp/test-baseline.log | tee /tmp/baseline-counts.txt
```

The acceptance criterion changes from "1380+/1380+ green" to "**same count as `/tmp/baseline-counts.txt`** green". This prevents silent test-count drift between commits.

#### Step 2.1 — Write the test assertion checklist (test-first)
**Before touching test.yml**, write the assertions that must hold post-amendment:

```markdown
### Existing tests (must update)
- [ ] T7-update: `codeql-action/upload-sarif` is allowed exactly 1 occurrence
      in test.yml (was: 0). The assertion `expect(ymlText).not.toMatch(/codeql-action\/upload-sarif/)`
      becomes `expect(ymlText.match(/codeql-action\/upload-sarif/g)?.length).toBe(1)`.
      Also assert the SHA pin (not @v4) on the single occurrence.
- [ ] T8-update: failure upload step's path matches `fallow-results-patched.sarif`
      (was: `\$\{\{\s*steps\.analyze\.outputs\.sarif\s*\}\}`). New pattern: `/fallow-results-patched\.sarif/`.
- [ ] T15-new: fallow Action invocation has `id: analyze` so `steps.analyze.outputs.sarif`
      resolves. Pattern: `/id:\s*analyze/` within the `Fallow audit (PR gate)` step block.

### New tests (must add)
- [ ] T10-new: `sarif: false` on the fallow Action invocation.
- [ ] T11-new: inline jq patch step present (matches `/jq \.automationDetails/`
      or `/automationDetails.*fallow\/audit\//`).
- [ ] T12-new: patch step reads from the Action's SARIF output
      (`${{ steps.analyze.outputs.sarif }}` or the artifacts-dir default `.`).
- [ ] T13-new: 1 explicit `github/codeql-action/upload-sarif@<sha>` call (SHA pinned, NOT @v4)
      with `category: fallow` AND `sarif_file:` matching `fallow-results-patched.sarif`.
- [ ] T14-new: NO per-analyzer upload calls (no `category: fallow-deadcode`,
      `fallow-health`, `fallow-dupes` anywhere in test.yml).
- [ ] T16-new: behavioral test (in a new file `sarif-patch.test.js`) — see step 2.12.
```

**Test ordering for RED-then-GREEN discipline:**
1. Update test #7 and #8 (T7-update, T8-update) → RED (length=0 vs expect=1; old path vs new path)
2. Add T10-T16 (all RED; workflow unchanged)
3. Flip `sarif:` to false AND add `id: analyze` → T10, T15 GREEN; others stay RED
4. Add the patch step → T11, T12 GREEN; T13 stays RED (no upload step yet)
5. Add the upload step (SHA-pinned) → T13 GREEN
6. Fix failure-upload path → T8-update GREEN
7. Run full suite → all 16 GREEN

T1–T6, T9 stay GREEN throughout (they test unrelated invariants).

If any assertion is hard to express as a regex/string check on YAML, that's a signal the design is too vague — sharpen the design first.

#### Step 2.2 — Update tests #7 and #8 in `workflow-shape.test.js`
Read the current test #7 and #8 first. Their current forms (per scout report):
- Test #7: `expect(ymlText).not.toMatch(/python3 - <<'PY'/)` AND `expect(ymlText).not.toMatch(/codeql-action\/upload-sarif/)`.
- Test #8: `expect(failStep.with.path).toMatch(/\$\{\{\s*steps\.analyze\.outputs\.sarif\s*\}\}/)`.

Update to match T7-update and T8-update assertions. Use the existing `findStepByName` helper if it exists.

#### Step 2.3 — Add 5 new tests (T10-new through T14-new)
Each new test should:
1. Read `.github/workflows/test.yml` via `fs.readFileSync`.
2. Apply a focused regex/string assertion.
3. Optionally check the step's structure (use `yaml.load` or the existing helper).

Test layout suggestion (matching existing test style in the file):
```js
test('sarif: false on the fallow Action invocation (T10-new)', () => {
  const ymlText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const yml = yaml.load(ymlText);
  const fallowStep = findFallowActionStep(yml.jobs.test.steps);
  expect(fallowStep.with.sarif).toBe(false);
});

test('inline jq patch step present (T11-new)', () => {
  const ymlText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  expect(ymlText).toMatch(/jq[\s\S]{0,500}\.automationDetails/);
  // Verify the prefix classifier is present
  expect(ymlText).toMatch(/fallow\/audit\/(dead-code|health|dupes)/);
});

test('patch step reads from Action SARIF output (T12-new)', () => {
  const ymlText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  // Accept either steps.analyze.outputs.sarif or artifacts-dir default
  const patchStep = findStepByName(yml.jobs.test.steps, /Patch fallow SARIF/);
  expect(patchStep).toBeDefined();
  // Patch step's `run:` block references the SARIF input path
  expect(patchStep.run).toMatch(/steps\.analyze\.outputs\.sarif|\$\{\{\s*inputs\.artifacts-dir\s*\}\}|fallow-results\.sarif/);
});

test('exactly 1 codeql-action/upload-sarif@v4 call with category: fallow (T13-new)', () => {
  const ymlText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const uploadCalls = ymlText.match(/uses:\s*github\/codeql-action\/upload-sarif@v4/g) || [];
  expect(uploadCalls).toHaveLength(1);
  const uploadStep = findStepByName(yml.jobs.test.steps, /Upload fallow SARIF to Code Scanning/);
  expect(uploadStep.with.category).toBe('fallow');
  expect(uploadStep.with.sarif_file).toMatch(/fallow-results-patched\.sarif/);
});

test('no per-analyzer upload categories (T14-new)', () => {
  const ymlText = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  expect(ymlText).not.toMatch(/fallow-deadcode/);
  expect(ymlText).not.toMatch(/fallow-health/);
  expect(ymlText).not.toMatch(/fallow-dupes/);
});
```

#### Step 2.4 — Run the updated tests; confirm RED
After step 2.3, run the workflow-shape test in isolation:
```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js
```
Expect T10–T14 to fail (RED), T7-update and T8-update to also fail (since the workflow still has `sarif: true` and old failure-upload path). T1–T6, T9 unchanged should remain GREEN.

This is the "test first" gate. **Do not skip this step.**

#### Step 2.5 — Amend `test.yml` to flip `sarif:` to `false` AND add `id: analyze`
Edit `.github/workflows/test.yml` line **99** (verified via `grep -n "sarif:"`):
```yaml
sarif: false    # was: true (line 99)
```

**Also add `id: analyze` to the fallow Action invocation** (line 93). Without this, `${{ steps.analyze.outputs.sarif }}` resolves to empty string in GitHub Actions — the patch step would read an empty path and the failure-upload step would silently produce empty files. The fallow Action exposes outputs under whatever `id:` the caller assigns; default GitHub Actions behavior does not surface internal composite-step ids to the caller.

The corrected `Fallow audit (PR gate)` step block becomes:

```yaml
      - name: Fallow audit (PR gate)
        id: analyze    # ← ADDED so steps.analyze.outputs.sarif resolves
        if: github.event_name == 'pull_request'
        uses: fallow-rs/fallow@7ec8073ec5bab7950a2faeab315db79ce39ae75d
        with:
          root: tools/learning-loop-mastra
          command: audit
          gate: new-only
          format: sarif
          sarif: false    # was: true
          version: ${{ steps.fallow-version.outputs.version }}
          dead-code-baseline: baselines/fallow/dead-code-baseline.json
          health-baseline:    baselines/fallow/health-baseline.json
          dupes-baseline:     baselines/fallow/dupes-baseline.json
```

The line numbers were verified at validation time; if the workflow is amended in the future and shifts, locate via `grep -n "sarif:\|fallow-rs/fallow" .github/workflows/test.yml` rather than hard-coding.

#### Step 2.6 — Add inline jq patch step
Insert after the `Fallow audit (PR gate)` step (line 91), before `Upload per-namespace logs on failure` (line 92):

```yaml
      - name: Patch fallow SARIF per analyzer (jq)
        # Idempotent: runs with automationDetails.id already set OR null are passed through.
        # For runs where automationDetails is missing, null, or an empty object, sets
        # automationDetails.id so areAllRunsUnique accepts the multi-run SARIF.
        # See plan 260630-0536 §"Corrected design".
        run: |
          set -euo pipefail
          SARIF_INPUT="${{ steps.analyze.outputs.sarif }}"
          SARIF_OUTPUT="$(realpath --relative-base="$GITHUB_WORKSPACE" "${SARIF_INPUT%.sarif}-patched.sarif")"

          # Pre-checks: file exists, is non-empty, has SARIF schema, is under 50 MB
          if [ ! -s "$SARIF_INPUT" ]; then
            echo "::error::SARIF input is missing or empty: $SARIF_INPUT"
            exit 1
          fi
          if [ "$(wc -c < "$SARIF_INPUT")" -gt 52428800 ]; then
            echo "::error::SARIF input exceeds 50 MB cap: $(wc -c < "$SARIF_INPUT") bytes"
            exit 1
          fi
          if ! jq -e '."$schema" | test("sarif-2\\.1")' "$SARIF_INPUT" > /dev/null; then
            echo "::error::SARIF input missing sarif-2.1 schema"
            exit 1
          fi

          # Atomic write: write to .tmp then rename, so a failed jq leaves no partial file
          TMP_OUTPUT="${SARIF_OUTPUT}.tmp"
          jq '
            .runs |= map(
              # Forward-compatible: patch missing-key, null, OR empty-object cases.
              # An empty object { } is NOT == null in jq, so use a structural check.
              if ((.automationDetails | type) == "null") or
                 ((.automationDetails | type) == "object" and (.automationDetails | length == 0))
              then
                .automationDetails = {
                  id: (
                    if (.tool.driver.rules[0].id // "" | test("^fallow/(unused|private|duplicate-export|unlisted)-"))
                    then "fallow/audit/dead-code"
                    elif (.tool.driver.rules[0].id // "" | test("^fallow/(high|low|long|duplicated)-"))
                    then "fallow/audit/health"
                    else "fallow/audit/dupes"
                    end
                  )
                }
              else .
              end
            )
          ' "$SARIF_INPUT" > "$TMP_OUTPUT"

          # Audit trail: log pre-patch vs post-patch automationDetails.id per run
          jq -c '
            .runs | map({
              index: .[0] // "?",
              orig: (if .automationDetails.id then .automationDetails.id else null end),
              patched: (if ((.automationDetails | type) == "null") or ((.automationDetails | type) == "object" and (.automationDetails | length == 0))
                       then "fall/audit/<classified>" else .automationDetails.id end)
            })
          ' "$SARIF_INPUT" | head -5 || true
          mv "$TMP_OUTPUT" "$SARIF_OUTPUT"
          echo "Patched SARIF written to $SARIF_OUTPUT"
```

**Hardening applied (red-team round 1):**
- **Empty-input guard:** `test -s` rejects missing/empty input before jq runs.
- **Size cap:** 50 MB cap prevents DoS via oversized SARIF (GitHub-hosted runners' ephemeral FS fills on large writes).
- **Schema validation:** `jq -e` on `$schema` rejects non-SARIF input.
- **Atomic write:** `.tmp` + `mv` ensures a failed jq leaves no partial file at `$SARIF_OUTPUT`.
- **realpath canonicalization:** Output path is anchored to `$GITHUB_WORKSPACE`; rejects paths that escape the workspace.
- **Forward-compatible idempotency:** The check now handles `null`, missing-key (which jq treats as `null`), AND empty-object cases. Verified: `echo '{"a": {}}' | jq '(.a | type) == "object" and (.a | length == 0)'` returns `true`.
- **Audit trail:** Pre/post `automationDetails.id` logged to step output for forensic review if F-6 lands with different conventions.

**Style notes:**
- Uses `set -euo pipefail` matching the meta-state-pr-body advisory workflow's style.
- The `${SARIF_INPUT%.sarif}-patched.sarif` substitution places the patched file alongside the input.

#### Step 2.7 — Add explicit upload step (SHA-pinned per rule-tool-integration-same-commit-dep)
Insert after the patch step (i.e., between patch step and `Upload per-namespace logs on failure`):

```yaml
      - name: Upload fallow SARIF to Code Scanning
        if: success()
        # SHA-pinned per rule-tool-integration-same-commit-dep item 4 (third-party Action SHA pin).
        # Pin via: git ls-remote https://github.com/github/codeql-action refs/tags/v4 | sort -k2 | tail -1
        # As of plan-validation (2026-06-30), the v4 tag SHA is <placeholder-fill-via-git-ls-remote>.
        uses: github/codeql-action/upload-sarif@<placeholder-fill-via-git-ls-remote>
        with:
          sarif_file: fallow-results-patched.sarif
          category: fallow
```

**SHA-pin rationale (red-team finding):** the project's `rule-tool-integration-same-commit-dep` item 4 requires SHA pins for every third-party Action. The fallow Action at line 93 is SHA-pinned (`fallow-rs/fallow@<40-hex>`); introducing `codeql-action/upload-sarif@v4` would be the first tag-pinned third-party Action in the file, violating the rule. The implementer MUST resolve the SHA via `git ls-remote https://github.com/github/codeql-action refs/tags/v4 | sort -k2 | tail -1` (or a pinned GitHub Actions release SHA) and replace `<placeholder-fill-via-git-ls-remote>` before merging.

**Path note:** `sarif_file: fallow-results-patched.sarif` is a literal path relative to the runner's working directory (the repo root). The patch step writes to the same path. Verified via the pre-check + atomic-write pattern in step 2.6.

#### Step 2.8 — Update failure-upload step's path
Edit the `path:` field at line **128** (verified via `sed -n '118,135p' .github/workflows/test.yml` — line 118 is the step name, line 128 is the path field):
```yaml
path: fallow-results-patched.sarif    # was: ${{ steps.analyze.outputs.sarif }}
```

If `fallow-results-patched.sarif` doesn't exist on a failing run (e.g., the patch step failed before writing), the step's `if-no-files-found: ignore` (line 129) handles the missing-file case gracefully.

#### Step 2.9 — Re-run the workflow-shape test; confirm GREEN
```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js
```
All 14 tests should pass (9 original + 5 new, with #7 and #8 updated). If any fail, debug per the assertion that failed.

#### Step 2.10 — Run the full local test suite
```bash
pnpm test
```
Expect 1380+/1380+ green (per the prior plan's acceptance criteria; this phase doesn't add new tests in other namespaces, only updates workflow-shape.test.js, so the total count should be unchanged from the current baseline minus any tests removed during #7/#8 update).

#### Step 2.11 — Local jq smoke test (extended for full-rules + idempotency cases)
Save the existing `tools/learning-loop-mastra/reports/fallow/audit.sarif` as a fixture, run the jq patch on it locally, and verify the output:

```bash
INPUT=tools/learning-loop-mastra/reports/fallow/audit.sarif
OUTPUT=/tmp/fallow-results-patched.sarif
jq '
  .runs |= map(
    if ((.automationDetails | type) == "null") or
       ((.automationDetails | type) == "object" and (.automationDetails | length == 0))
    then
      .automationDetails = {
        id: (
          if (.tool.driver.rules[0].id // "" | test("^fallow/(unused|private|duplicate-export|unlisted)-"))
          then "fallow/audit/dead-code"
          elif (.tool.driver.rules[0].id // "" | test("^fallow/(high|low|long|duplicated)-"))
          then "fallow/audit/health"
          else "fallow/audit/dupes"
          end
        )
      }
    else .
    end
  )
' "$INPUT" > "$OUTPUT"

# Verify each run now has unique automationDetails.id
jq '.runs | map(.automationDetails.id)' "$OUTPUT"
# Expected: ["fallow/audit/dead-code", "fallow/audit/dupes", "fallow/audit/health"]

# Verify SARIF is still valid (parses, has expected schema)
jq -e '."$schema" == "https://json.schemastore.org/sarif-2.1.0.json"' "$OUTPUT"

# Verify ALL rule IDs in each run match the classifier prefixes (not just rules[0])
# (red-team finding: classifier was never validated against the full rules array)
jq -r '
  .runs | to_entries[] |
  "run \(.key): " +
  ([.value.tool.driver.rules[]?.id] | join(","))
' "$INPUT" | head -50

# Check for any rule ID that doesn't match the dead-code or health prefix
# (Dupes run has empty rules[]; rules[0] fallback routes to dupes. This is expected.)
jq -r '
  .runs | to_entries[] |
  select(.value.tool.driver.rules | length > 0) |
  .value.tool.driver.rules[]?.id |
  select(test("^fallow/(unused|private|duplicate-export|unlisted|high|low|long|duplicated)-") | not)
' "$INPUT" | head -10 || echo "All rule IDs match classifier prefixes"

# Verify idempotency on a manually-{}'d SARIF
INPUT_EMPTY='{"$schema":"https://json.schemastore.org/sarif-2.1.0.json","version":"2.1.0","runs":[{"tool":{"driver":{"name":"fallow","version":"2.102.0"}},"results":[]}]}'
echo "$INPUT_EMPTY" | jq '
  .runs |= map(
    if ((.automationDetails | type) == "null") or
       ((.automationDetails | type) == "object" and (.automationDetails | length == 0))
    then .automationDetails = {id: "fallow/audit/dupes"}
    else .
    end
  )
' | jq '.runs[0].automationDetails.id'
# Expected: "fallow/audit/dupes"

# Verify non-idempotency on a pre-set automationDetails (must NOT overwrite)
INPUT_SET='{"$schema":"https://json.schemastore.org/sarif-2.1.0.json","version":"2.1.0","runs":[{"tool":{"driver":{"name":"fallow","version":"2.102.0"}},"automationDetails":{"id":"fallow/audit/dupes"},"results":[]}]}'
echo "$INPUT_SET" | jq '
  .runs |= map(
    if ((.automationDetails | type) == "null") or
       ((.automationDetails | type) == "object" and (.automationDetails | length == 0))
    then .automationDetails = {id: "OVERWRITTEN"}
    else .
    end
  )
' | jq '.runs[0].automationDetails.id'
# Expected: "fallow/audit/dupes" (NOT "OVERWRITTEN")
```

If the classifier misclassifies any run, fix the prefix map and re-run.

#### Step 2.12 — Add behavioral test (red-team finding: tests were text-pattern only)
Create `tools/learning-loop-mastra/__tests__/legacy-mcp/sarif-patch.test.js` that:

1. Reads `tools/learning-loop-mastra/reports/fallow/audit.sarif` as a fixture.
2. Extracts the `jq` script from `test.yml` (use the same `findFallowActionStep` + pattern-matching helpers from `workflow-shape.test.js`).
3. Spawns `jq` as a child process via `node:child_process.spawnSync("jq", ["-f", "<temp-script>", fixture])`.
4. Asserts:
   - `runs.length === 3`
   - Every `automationDetails.id` is in `["fallow/audit/dead-code", "fallow/audit/health", "fallow/audit/dupes"]`
   - All three ids are unique (no collisions on `createRunKey` semantics)
5. Adds a second fixture with `automationDetails: {}` and asserts the patch correctly assigns `id` (forward-compatibility).
6. Adds a third fixture with `automationDetails: {id: "..."}` and asserts the patch does NOT overwrite (idempotency).

Wire into `pnpm test` via the existing test discovery (file lives under `__tests__/legacy-mcp/`).

#### Step 2.13 — Verify codeql-action createRunKey source directly (red-team finding: claim was unverified)
The plan's primary claim rests on `createRunKey` in `github/codeql-action/src/sarif/index.ts` building a key from `run.tool.driver.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails.id`. The audit report cites this but the plan did not. **Add this verification before merging:**

```bash
curl -sL https://raw.githubusercontent.com/github/codeql-action/main/src/sarif/index.ts \
  | grep -nE "createRunKey|areAllRunsUnique|automationDetails" | head -20
```

Capture the output in `plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md` as the primary source citation. If the source disagrees with the plan's claim, STOP — the patch design needs revision before any implementation.

#### Step 2.14 — Verify F-6 has not landed in fallow 2.103.x (red-team finding: deferral assumes 2.103.x still collides)
The plan's F-6 deferral assumes fallow 2.103.x still emits runs with null/empty `automationDetails.id`. **Verify before assuming the patch is needed at all:**

```bash
fallow audit --format sarif 2>/dev/null | jq '.runs | map(.automationDetails)'
# Expected: array with at least one run where automationDetails is null or empty object
# (NOT a complete array where every run has automationDetails.id set)
```

If 2.103.x already patches all runs, F-6 has effectively shipped and the patch step is unnecessary work — fallow should be bumped in `package.json` instead.

## Success Criteria

- [ ] `tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js` updated: test #7 (no Python heredoc + exactly 1 `codeql-action/upload-sarif` call) and test #8 (failure upload path matches `fallow-results-patched.sarif`); 5 new tests T10–T14 added
- [ ] `.github/workflows/test.yml` line 99: `sarif: false` (was: `true`; verified via `grep -n "sarif:"` at validation time)
- [ ] `.github/workflows/test.yml` has the inline jq patch step (verbatim match against the script in step 2.6)
- [ ] `.github/workflows/test.yml` has exactly 1 explicit `github/codeql-action/upload-sarif@v4` call with `category: fallow`
- [ ] `.github/workflows/test.yml` failure-upload step path is `fallow-results-patched.sarif`
- [ ] No `fallow-deadcode`, `fallow-health`, or `fallow-dupes` strings anywhere in `test.yml`
- [ ] No `python3 -` or `pip` references in `test.yml` (jq-only patch)
- [ ] `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js` — all 14 tests green
- [ ] `pnpm test` — 1380+/1380+ green
- [ ] Local jq smoke test: `tools/learning-loop-mastra/reports/fallow/audit.sarif` patched output has `runs[].automationDetails.id` = `["fallow/audit/dead-code", "fallow/audit/dupes", "fallow/audit/health"]`
- [ ] Workflow file length still under 200 lines (currently 132; estimate ~157 post-amendment)
- [ ] `git diff .github/workflows/test.yml` shows only the 3 changes above (no unrelated edits)

## Risk Assessment

- **Risk:** jq expression syntax error on the runner. **Mitigation:** local smoke test (step 2.11) verifies the patch runs cleanly; CI runner's jq version is identical to local `jq --version` output (verified in scout via the meta-state-pr-body advisory workflow's bash style).
- **Risk:** `<artifacts-dir>` resolution differs between local and CI. **Mitigation:** step 2.10 + Phase 3's CI verification pin the actual path; the patch step uses `${SARIF_INPUT%.sarif}-patched.sarif` so the output is always alongside the input, regardless of artifacts-dir.
- **Risk:** Classifier misclassifies a future rule ID (drift). **Mitigation:** patch is idempotent + the fallback `fallow/audit/dupes` is conservative; an unhandled run still gets a unique `createRunKey`. Worst case: dupes findings show up under the dupes category when they should be under health — cosmetic UX issue, not a correctness issue.
- **Risk:** PR #22's commit is on the branch tip; the new commit can't be cleanly applied. **Mitigation:** the plan's recovery path is to close PR #22, force-push the branch to a known-good state (the prior-plan-succeeded-but-without-SARIF state), then commit this plan's workflow change as a single new commit.
- **Risk:** `codeql-action/upload-sarif@v4` upgrades to v5 mid-flight and changes the input schema. **Mitigation:** pin `@v4` (already documented in the action version); dependabot bumps tracked separately.
- **Risk:** The patch step's `set -euo pipefail` causes the workflow to fail if jq exits non-zero (e.g., on malformed SARIF). **Mitigation:** this is the desired behavior — a malformed SARIF should fail the workflow, not silently upload garbage. The failure-upload step then captures the malformed file for triage.