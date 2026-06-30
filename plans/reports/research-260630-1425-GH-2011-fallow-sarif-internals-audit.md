# Source Audit: fallow-rs/fallow SARIF Implementation (focus: `fallow audit` multi-run collision)

**Date:** 2026-06-30 14:25 (Asia/Bangkok)
**Branch:** 260629-2011-fallow-tools-v2-action-swap
**Scope:** Map every relevant fallow source file that participates in SARIF output for the `fallow audit` subcommand. Identify the exact line(s) responsible for the `areAllRunsUnique` collision, document the gap between `fallow audit` and `fallow security`, and produce a precise scope estimate for the local workaround (Option B) and the future upstream fix (F-6).

## Executive Summary

The fallow SARIF stack has **three layers**, and the `audit`-vs-`security` asymmetry lives in the **middle layer**:

1. **SARIF document builder** — `crates/output/src/sarif.rs::build_sarif_document`. Always emits a **single-run** SARIF 2.1.0 document with hard-coded driver metadata (`name`, `version`, `informationUri` only; no `fullName`/`guid`/`semanticVersion`/`automationDetails`).
2. **Audit run assembler** — `crates/api/src/audit_output.rs::build_audit_sarif`. The ONLY place that emits a multi-run SARIF file. Takes pre-built dead-code and health SARIF documents (from upstream builders) and **synthesizes** a local dupes run. **Crucially**: the synthesized dupes run sets `automationDetails.id = "fallow/audit/dupes"` — but the dead-code and health runs are passed through verbatim, inheriting whatever (i.e., null) `automationDetails` their upstream builders set. This is the partial fix: dupes is uniquely identified; dead-code and health collide.
3. **CLI driver** — `crates/cli/src/audit_output.rs::print_audit_sarif` and `crates/cli/src/security.rs::render_security_output`. Pure dispatch. The Action's `action/scripts/analyze.sh` only invokes the CLI; no SARIF shaping on the Action side.

**Local workaround (Option B):** Patch the SARIF in-place with inline jq. Only 2 of the 3 runs need patching (dupes is already unique). Classifier heuristic: `tool.driver.rules[0].id` prefix → `fallow/audit/{dead-code,health,dupes}`. Single `codeql-action/upload-sarif@v4` call, single `category: fallow`.

**Upstream fix (F-6, deferred):** Two-file change. Add `automationDetails.id` to the dead-code and health SARIF builders (likely `crates/api/src/dead_code_sarif.rs` and the health SARIF builder — exact files TBD by repo grep, but the pattern is identical to what `build_audit_duplication_sarif_run` already does for dupes). Once both builders emit `automationDetails.id`, the audit run assembler's verbatim passthrough becomes naturally unique. PR #1102 precedent (same-day review/merge for security) makes F-6 plausibly landable.

## Layer 1: SARIF document builder — `crates/output/src/sarif.rs`

### Public API

```
SARIF_FINGERPRINT_KEY: &str = "tools.fallow.fingerprint/v1"
GHAS_SARIF_FINGERPRINT_KEY: &str = "primaryLocationLineHash/v1"

struct SarifResultInput { rule_id, level, message, uri, region, snippet }
struct SarifRuleInput { id, short_description, level, full_description, help_uri }
struct SarifDocumentInput { results, rules, tool_version }

fn build_sarif_result(input) -> Value       // line 77
fn build_sarif_rule(input) -> Value         // line 119
fn build_sarif_document(input) -> Value     // line 149
fn sarif_finding_fingerprint(...) -> String // line 64
fn normalize_sarif_snippet(...) -> String   // line 54
```

### `build_sarif_document` (lines 149–167) — the literal source of the single-run constraint

```rust
{
    "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
    "version": "2.1.0",
    "runs": [{
        "tool": { "driver": { ... } },
        "results": input.results
    }]
}
```

### Driver metadata emitted (lines 154–166)

```json
{
  "name": "fallow",                          // hard-coded literal
  "version": input.tool_version,             // from SarifDocumentInput.tool_version
  "informationUri": "https://github.com/fallow-rs/fallow",  // hard-coded
  "rules": input.rules
}
```

**Notably absent:** `fullName`, `guid`, `semanticVersion`, `dottedQuadFileVersion`, `automationDetails`.

### Single-run constraint

`runs` is a hard-coded `[{ ... }]` literal (line 160). There is **no branching logic**. To produce a multi-run file, callers must invoke the builder multiple times and concatenate the `runs` arrays themselves. This is exactly what `build_audit_sarif` does in layer 2.

### Result-level fields (lines 77–110)

Each result carries:

```json
{
  "ruleId": "...",
  "level": "...",
  "message": { "text": "..." },
  "locations": [{ "physicalLocation": { ... } }],
  "partialFingerprints": {
    SARIF_FINGERPRINT_KEY: "...",
    GHAS_SARIF_FINGERPRINT_KEY: "..."
  }
}
```

GHAS compatibility is achieved by emitting two fingerprint keys inside `partialFingerprints` rather than via dedicated SARIF fields. No `codeFlows`, no `threadFlows`, no `taxonomies` at the run level — these were added for `fallow security` by PR #1102 only.

## Layer 2: Audit run assembler — `crates/api/src/audit_output.rs::build_audit_sarif`

This is the file that **decides the multi-run structure** for `fallow audit` SARIF. It is the asymmetric file (vs. `fallow security`).

### Algorithm

```
let all_runs: Vec<Value> = vec![];

// 1. Spread dead-code runs verbatim from upstream
if let Some(dead_code_sarif) = dead_code_input {
    extend_sarif_runs(&mut all_runs, dead_code_sarif);  // copies existing runs[]
}

// 2. Synthesize one dupes run locally (only if non-empty)
if duplication has clone_groups {
    let dupes_run = build_audit_duplication_sarif_run(duplication);
    all_runs.push(dupes_run);
}

// 3. Spread health runs verbatim from upstream
if let Some(health_sarif) = health_input {
    extend_sarif_runs(&mut all_runs, health_sarif);
}

// 4. Wrap as SARIF 2.1.0 document
{ "$schema": "...", "version": "2.1.0", "runs": all_runs }
```

### The asymmetry — `build_audit_duplication_sarif_run`

```rust
fn build_audit_duplication_sarif_run(duplication: &DuplicationReport) -> serde_json::Value {
    serde_json::json!({
        "tool": {
            "driver": {
                "name": "fallow",
                "version": env!("CARGO_PKG_VERSION"),
                "informationUri": "https://github.com/fallow-rs/fallow",
            }
        },
        "automationDetails": { "id": "fallow/audit/dupes" },   // ← THE FIX FOR DUPES
        ...
    })
}
```

**This is the partial fix.** Only the dupes run has `automationDetails.id` set. Dead-code and health runs do not — they are passed through verbatim from upstream builders, which don't set it.

### Why the verbatim passthrough fails uniqueness

For `fallow audit` 2.102.0 (verified locally against `tools/learning-loop-mastra/reports/fallow/audit.sarif`), the 3 runs have these `createRunKey` inputs:

| Run | name | version | fullName | semanticVersion | guid | automationDetails.id |
|-----|------|---------|----------|-----------------|------|----------------------|
| 0 (dead-code) | fallow | 2.102.0 | null | null | null | **null** |
| 1 (dupes) | fallow | 2.102.0 | null | null | null | `"fallow/audit/dupes"` |
| 2 (health) | fallow | 2.102.0 | null | null | null | **null** |

`createRunKey` produces the same value for runs 0 and 2 (both have null `automationDetails.id` and identical driver fields). The dupes run (1) has a different key. CodeQL Action v4's `areAllRunsUnique` validator rejects the upload with `multiple SARIF runs with the same category`.

For `fallow audit` 2.103.0 (verified locally on a clean tree with no dupes/health findings above threshold), only 2 runs are emitted (dead-code + health), and **both** have null `automationDetails.id`. Same collision, same rejection.

### What dead-code and health builders need to do

The dead-code builder likely lives in `crates/api/src/dead_code_sarif.rs`. Its helpers (`sarif_result_with_snippet`, `push_sarif_results`, `push_sarif_unlisted_deps`, `push_sarif_duplicate_exports`) wrap `build_sarif_result` and `build_sarif_document` from `fallow_output` and pass `tool_version: env!("CARGO_PKG_VERSION")`. **None of these set `automationDetails.id`** on the document level (the truncated view didn't show it, and the resulting SARIF confirms it's null).

The health SARIF builder path goes through `report::api_health_sarif_document` from the CLI's `audit_output.rs::print_audit_sarif` (line ~`report::api_health_sarif_document(&health.report, &health.config.root)`). That function in turn calls `build_health_sarif` in `crates/api/src/sarif_output.rs`, which delegates to `sarif_document()` → `build_sarif_document` from `fallow_output`. **No `automationDetails.id` is added** anywhere along this path.

**Therefore the upstream fix (F-6) is a two-file change:**

1. `crates/api/src/dead_code_sarif.rs` (or wherever the dead-code document is finalized): add `"automationDetails": { "id": "fallow/audit/dead-code" }` to the document.
2. The health SARIF builder (likely `crates/api/src/sarif_output.rs::build_health_sarif` or a similar module): add the same with `id: "fallow/audit/health"`.

Once both are done, `build_audit_sarif`'s verbatim passthrough becomes naturally unique — the dupes run already sets its own `automationDetails.id`, and the dead-code/health runs would then set theirs. No changes to `build_audit_sarif` itself are needed; the partial fix is completed.

## Layer 3: CLI driver — `crates/cli/src/{audit_output.rs, security.rs}` + `action/scripts/analyze.sh`

### `crates/cli/src/audit_output.rs::print_audit_sarif` (verified)

```rust
let check_sarif = result.check.as_ref().map(|check| {
    report::api_sarif_document(&check.results, &check.config.root, &check.config.rules)
});
let health_sarif = result.health.as_ref().map(|health| {
    report::api_health_sarif_document(&health.report, &health.config.root)
});
let combined = fallow_api::build_audit_sarif(AuditSarifOutputInput {
    dead_code: check_sarif.as_ref(),
    duplication: result.dupes.as_ref().map(|dupes| &dupes.report),
    health: health_sarif.as_ref(),
});
```

Dispatch only. No SARIF shaping.

### `crates/cli/src/security.rs::render_security_output` (verified)

```rust
fn render_security_output(opts, output) -> String {
    match opts.output {
        OutputFormat::Sarif => render_sarif(output),
        ...
    }
}
fn maybe_write_security_sarif(opts, output) -> Result {
    if let Some(path) = opts.sarif_file { write_sarif_file(output, path) } else { Ok(()) }
}
```

Dispatch only. No SARIF shaping.

### `action/scripts/analyze.sh` (verified, no SARIF shaping)

The Action is pure orchestration: detects `--sarif-file` support, falls back to `format=sarif` re-run if missing, validates file presence with `if [ ! -s "$SARIF_FILE" ] || ! jq -e '.' "$SARIF_FILE" > /dev/null 2>&1`. **No run-splitting, no driver-metadata patching, no flag-flipping for single-run vs multi-run.** Every structural decision is upstream in the CLI/audit_output/api/output chain.

## Why the dead-code and health builders don't set `automationDetails.id`

Hypothesis: at the time `build_audit_sarif` was designed, the maintainers knew they needed per-analyzer uniqueness and added `automationDetails.id` to the dupes run because that run is synthesized locally. The dead-code and health runs come from upstream builders that were not modified at the same time. The fix was applied to the assembled document level, not at the source. PR #1102 (merged Jun 9, 2026) demonstrates the maintainers are willing to enrich fallow SARIF output when given a concrete scoped proposal — but PR #1102 only modified `security.rs`. The same scope-of-work is needed for the audit subcommand's dead-code and health builders.

## Workaround design (Option B) — refined with the source-code knowledge

Knowing that dupes is already unique and only dead-code + health collide, the jq patch simplifies:

```bash
# Patch only runs with null automationDetails.id
jq '
  .runs |= map(
    if .automationDetails == null then
      .automationDetails = {
        id: (
          if (.tool.driver.rules[0].id // "" | startswith("fallow/high-"))
              or (.tool.driver.rules[0].id // "" | startswith("fallow/low-"))
              or (.tool.driver.rules[0].id // "" | startswith("fallow/long-"))
              or (.tool.driver.rules[0].id // "" | startswith("fallow/duplicated-"))
          then "fallow/audit/health"
          elif (.tool.driver.rules[0].id // "" | startswith("fallow/unused-"))
              or (.tool.driver.rules[0].id // "" | startswith("fallow/private-"))
              or (.tool.driver.rules[0].id // "" | startswith("fallow/duplicate-"))
              or (.tool.driver.rules[0].id // "" | startswith("fallow/unlisted-"))
          then "fallow/audit/dead-code"
          else "fallow/audit/dupes"
          end
        )
      }
    else .
    end
  )
' /tmp/fallow-fresh.sarif > /tmp/fallow-patched.sarif
```

**Key properties:**

- The classifier is based on `tool.driver.rules[0].id` prefix, which is **stable across fallow versions** (it's a public rule taxonomy, documented at `https://docs.fallow.tools/explanations/...`).
- The patch only modifies runs where `automationDetails == null`, so it's **idempotent** — re-running against a SARIF that already has `automationDetails.id` is a no-op.
- After the patch, all 3 runs have unique `createRunKey` values; single `codeql-action/upload-sarif@v4` call with `category: fallow` succeeds.

### Drift risk

When fallow 2.103+ adds new rule IDs (e.g., `fallow/new-analyzer/...`), the classifier must be updated. The classifier can be kept in sync with fallow's `CHANGELOG.md` rule-taxonomy section, or we can fall back to a Python classifier that reads more rules per run before deciding.

**Alternative drift-proof approach**: use the run's index in the array (dead-code is always index 0, dupes is always index 1 when present, health is always last). Less explicit but more drift-proof against taxonomy changes:

```bash
jq '
  .runs |= to_entries | map(
    if .value.automationDetails == null then
      .value.automationDetails = {
        id: (
          if .key == 0 then "fallow/audit/dead-code"
          elif (.value.tool.driver.rules | length) > 0 and (.value.tool.driver.rules[0].id | startswith("fallow/code-duplication")) then "fallow/audit/dupes"
          else "fallow/audit/health"
          end
        )
      }
    else .
    end
  )
'
```

This is less safe (depends on run order) but more drift-proof against rule renaming. Recommend the rules-prefix approach for now and revisit when fallow 2.103+ lands.

## Upstream fix (F-6, deferred per user instruction)

**Scope:** two-file change. Add `automationDetails.id` to the dead-code and health SARIF builders.

**Concrete patch (in pseudocode for the dead-code builder):**

```rust
// in crates/api/src/dead_code_sarif.rs, in the function that builds the dead-code document
let mut doc = build_sarif_document(SarifDocumentInput {
    results: ...,
    rules: ...,
    tool_version: env!("CARGO_PKG_VERSION"),
});
doc["runs"][0]["automationDetails"] = json!({ "id": "fallow/audit/dead-code" });
doc
```

**Equivalent patch for the health builder** (`id: "fallow/audit/health"`).

**PR template strategy:**

1. Open a tracking issue: "`fallow audit` SARIF: dead-code and health runs collide on `areAllRunsUnique`" — link PR #1102 as precedent, paste the codeql-action v4 error from our PR #22 run.
2. Open the PR with the two-file diff. Reference #1097 + #1102 as precedent for the SARIF fidelity class.
3. PR #1102 was opened and merged same-day by `BartWaardenburg` for `fallow security` — the same author/collaborator engagement model is plausible for `fallow audit`.

**F-6 is deferred per user instruction. Not filing now.**

## Decision matrix (post-research)

| Aspect | Option A (split + 3 uploads) | Option B (patch in-place + 1 upload) | Upstream fix (F-6, deferred) |
|---|---|---|---|
| Code Scanning categories | 3 (per-analyzer) | 1 (`fallow`) | 1 (after fix) |
| Workflow complexity | split step + 3 uploads + 3 categories | jq patch + 1 upload + 1 category | just upload (after fallow ships) |
| Local debuggability | 3 files to re-concatenate | 1 file (after patch) | 1 file (after fallow ships) |
| Failure-mode granularity | 1 analyzer's patch bug → that analyzer lost | 1 bad patch → all findings lost | n/a |
| Drift risk vs fallow versions | classifier must track rule taxonomy | classifier must track rule taxonomy (same risk) | n/a (fallow handles) |
| Time-to-implement | medium | low | out of scope (deferred) |
| Time-to-retire | when F-6 ships | when F-6 ships | n/a |

**Recommendation:** Option B. The dead-code/health/dupes split is over-engineered for a temporary workaround; F-6 will retire it when it lands. Option B is the simplest defensible local fix.

## Files in this audit (with line ranges)

| File | Purpose | Key lines |
|------|---------|-----------|
| `crates/output/src/sarif.rs` | Single-run SARIF builder | 11–17 (constants), 21–47 (inputs), 77 (result builder), 119 (rule builder), 149–167 (document builder) |
| `crates/api/src/sarif_output.rs` | Health and duplication SARIF builders | `build_duplication_sarif`, `build_grouped_duplication_sarif`, `build_health_sarif`, `annotate_sarif_results`, `sarif_document` |
| `crates/api/src/audit_output.rs` | **Multi-run audit assembler** | `build_audit_sarif`, `extend_sarif_runs`, `build_audit_duplication_sarif_run` |
| `crates/api/src/dead_code_sarif.rs` | Dead-code SARIF builder | helpers: `sarif_result_with_snippet`, `push_sarif_results`, `push_sarif_unlisted_deps`, `push_sarif_duplicate_exports` |
| `crates/api/src/output_contracts.rs` | Output contracts (likely health builder entry) | TBD |
| `crates/cli/src/audit_output.rs` | `print_audit_sarif` dispatch | calls `report::api_sarif_document`, `report::api_health_sarif_document`, `fallow_api::build_audit_sarif` |
| `crates/cli/src/security.rs` | `render_security_output` dispatch | `render_sarif`, `maybe_write_security_sarif`, `validate_security_output` |
| `action/scripts/analyze.sh` | GitHub Action orchestration | no SARIF shaping; detects `--sarif-file`, validates with `jq -e` |

## Unresolved questions

1. **Exact location of the health SARIF document builder**: the CLI calls `report::api_health_sarif_document`, which lives somewhere — likely in `crates/api/src/sarif_output.rs::build_health_sarif` or in a `report` module. The `sarif_output.rs` file has `build_health_sarif` but it's not 100% confirmed that this is what produces the `health` run in `fallow audit`. Worth one more grep before filing F-6.
2. **Did fallow 2.103.0 also fix the audit dead-code/health `automationDetails.id` gap?** My local 2.103.0 emits `automationDetails: null` on both dead-code and health runs, same as 2.102.0. So the gap is **unfixed in 2.103.0**. The CHANGELOG entry for 2.103.0 should be checked for any mention of SARIF changes — none surfaced in this audit.
3. **Does `fallow security` (post PR #1102) emit a single run or multi-run?** The `crates/cli/src/security.rs::render_security_output` dispatches to `render_sarif` which calls `build_sarif_document` (single-run). So `fallow security` is single-run. **This is the opposite of `fallow audit`.** Worth noting in F-6 framing — security emits 1 run (no collision risk), audit emits N runs (collision risk).
4. **Why doesn't `fallow audit` use the single-run approach like `fallow security`?** Hypothesis: each analyzer has different `rules[]` taxonomies and merging them into one run's `rules[]` would require deduplication + namespace handling. Single-run with merged `rules[]` is feasible but more complex than the current per-analyzer-runs approach. The `automationDetails.id` fix preserves the per-analyzer-run structure while satisfying uniqueness — best of both worlds.

## Resources & References

### Internal artifacts

- `plans/260630-0536-fallow-action-swap-with-sarif-split/plan.md` — current amendment (Option A; to be refactored to Option B)
- `plans/reports/research-260630-1354-GH-2011-fallow-sarif-upstream-search.md` — upstream search report
- `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 / §6.5 — error source (deep-dive claim)

### Local SARIF files inspected

- `tools/learning-loop-mastra/reports/fallow/audit.sarif` — fallow 2.102.0 output (3 runs; dead-code + dupes + health)

### Upstream sources

- `crates/output/src/sarif.rs` — single-run builder
- `crates/api/src/audit_output.rs` — multi-run audit assembler
- `crates/api/src/dead_code_sarif.rs` — dead-code SARIF builder (F-6 target #1)
- `crates/api/src/sarif_output.rs` — health SARIF builder (F-6 target #2; `build_health_sarif`)
- `crates/cli/src/audit_output.rs::print_audit_sarif` — CLI dispatch
- `crates/cli/src/security.rs::render_security_output` — security CLI dispatch
- `action/scripts/analyze.sh` — Action orchestration
- `crates/output/src/security.rs` — security envelope (different from SARIF; PR #1102 modified `security.rs` in `cli/src`, not `output/src`)

### Downstream validation

- `areAllRunsUnique` validator in `github/codeql-action/src/sarif/index.ts` — keys on `run.tool.driver.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails.id`
- Code Scanning changelog [2025-07-21](https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/)