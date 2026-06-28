# Fallow Follow-up Rule Design — Research Report

Plan dir: `plans/260628-1337-fallow-tool-integration-rule-encoding/`
Date: 2026-06-28
Researcher: code-researcher (read-only)

## §1. Existing rule precedent analysis

`meta-state.jsonl` contains 8 rule entries (`entry_kind: rule`). Two use `pattern_type: consult-checklist` and are the load-bearing precedents for a multi-item checklist:

- **`rule-runtime-agnostic-features`** (line 127) — `enforcement: agent`, `pattern_type: consult-checklist`, 6-item JSON-encoded checklist. **Best precedent for shape.**
- **`rule-pr-body-registry-deltas`** (line 167) — `enforcement: agent`, `pattern_type: consult-checklist`, 6-item checklist, plus `scope_predicate: project_has_learning_loop_mcp`. **Best precedent for the registry-side enforcement lifecycle** because the originating finding (`meta-260622T1708Z-...`, line 158) is closed via `status: superseded`, `consolidated_into: <change-log-id>`, and `resolution: "rule-pr-body-registry-deltas promoted; PROCESS_HINTS split shipped; CI advisory in place."` — a canonical promotion narrative.

The other 6 rules use `regex` (`rule-no-new-artifact-types`, `rule-import-chain-analysis-after-tool-deletion`), `glob` (`rule-short-slug-for-risk-records`, `rule-project-skill-boundary`), and `resolution-evidence-required` (`rule-cold-session-test-must-pass-before-resolution`, `rule-no-orphaned-evidence`). The regex/glob precedents are unsuitable here: finding 1 cannot be cleanly expressed as a single regex (it requires correlating a workflow edit with `package.json#devDependencies`), and finding 2's flag confusion is a write-time decision, not a runtime command. Consult-checklist is the correct type for all 3 items.

## §2. Gate enforcement for consult-checklist rules

The bash gate's `applyPromotedRules` explicitly skips consult-checklist rules: `tools/learning-loop-mastra/core/gate-logic.js:762-767` does `continue` (with comment "Design-time rule; no command/path matching. The gate ignores it."). The factory mirror is at `core/entry/rule.js:13,16`: `isConsultChecklist()` returns true, and `matches()` short-circuits to `false` for consult-checklist and resolution-evidence-required.

The consult-checklist rule is surfaced to the agent in two places:
1. **`loop_describe` warm tier** via `result.rules` (the rule payload includes the 6-item checklist array, see `tools/legacy/loop-describe-tool.js:113`).
2. **`PROCESS_HINTS`** in `core/loop-introspect.js:116-120`. The H6 ordering gate at `loop-describe-tool.js:90-102` **enforces** that every `consult-checklist` rule must have a corresponding `PROCESS_HINTS` row mentioning the rule id, or a warning fires.

Conclusion: a new `consult-checklist` rule **must be added to `PROCESS_HINTS`** in the same commit, or `loop_describe` will warn. Neither the bash gate nor the write gate can enforce a consult-checklist rule; the agent is the enforcement surface.

## §3. Current state of fallow / CI / package.json

- `package.json:33` — `fallow: 2.102.0` in `devDependencies` (fixed in `9ed520d`).
- `.github/workflows/test.yml:55-77` — `Fallow audit (PR gate)` step runs `pnpm exec fallow audit --gate new-only --dead-code-baseline ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json ...` (lines 62-67).
- `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/` contains `dead-code-baseline.json`, `health-baseline.json`, `dupes-baseline.json`, and `regression-baseline.json` (the regression format is informational only).
- `tools/learning-loop-mastra/core/README.md:41-64` — **"Admission rule"** section exists, with structure: rationale paragraph (43-49), enforcement sub-bullet list (51-57), and numbered onboarding steps (59-64). This is the natural anchor for an extended checklist section.
- `tools/learning-loop-mastra/.fallow/.gitignore` — confirmed contains `*`, which silently gitignores `<root>/.fallow/baselines/`. Only `cache.bin` and `churn.bin` are tracked at `.fallow/` root.

## §4. `metaStateRuleEntrySchema` fields for consult-checklist

`tools/learning-loop-mastra/core/meta-state.js:164-197`. Required fields for any rule (consult-checklist included):
- `entry_kind: "rule"` (default)
- `id` matching `/^rule-[a-z0-9-]+$/` (line 166) — **note: id must start with `rule-`, not a timestamp-based `meta-...` slug** (per existing precedent; the proposed `rule-tool-integration-same-commit-dep` satisfies this).
- `origin` (finding id)
- `enforcement`: `enum ["gate", "agent"]` — `agent` is required for consult-checklist.
- `pattern_type`: `enum [...]` includes `consult-checklist` (line 169).
- `pattern`: `z.string()` — for consult-checklist, this holds a **JSON-encoded** `{version, items: [{id, description}]}` array (see rule-runtime-agnostic-features line 127 and rule-pr-body-registry-deltas line 167). The factory schema parser accepts any string; **JSON parsing of the pattern body happens at the agent-rendering layer**, not at validation time.
- `description`: `z.string().min(20)`.
- `status`: `enum ["active", "inactive"]`, default `active`.
- `promoted_at` (ISO timestamp), `promoted_by` (operator id).
- Optional: `scope_predicate` (`"none"` | `"project_has_learning_loop_mcp"`), `evidence_code_ref`, `evidence_journal`, `evidence_test`, `code_fingerprint`, `supersedes`, `refined_at`, `refined_by`, `refinement_reason`, `affected_system`.

**Field-name gotchas:**
- `pattern` is the **whole JSON blob** for consult-checklist rules (existing precedent), not a regex/glob string. Treat it like a free-form string field at the schema level.
- `applies_to_resolution` is for `resolution-evidence-required` only; consult-checklist does NOT use it.
- The min-20-char `description` is enforced by Zod and will reject empty summaries.

## §5. Doc location recommendation

**Extend `tools/learning-loop-mastra/core/README.md` with a new `## Tool integration checklist` section immediately after the existing `## Admission rule` section (line 64).** Rationale:

- `core/README.md` is the **single source of truth for fallow-related rules** today (the Admission rule section already documents `.fallowrc.json`, `fallow audit --gate new-only`, and the `dead-code --save-regression-baseline` workflow). Adding the tool-integration checklist here keeps all fallow-related operator knowledge in one file.
- `docs/placement.md` is about where to put new **code** files, not new **process rules**. Wrong layer.
- `docs/operator-guide.md` covers MCP tool mechanics and resolution flows; not the right home for a `devDependencies`-and-CI-workflow checklist (which is a project-level wiring concern, not a registry/MCP concern).
- Creating `docs/tool-integration-checklist.md` (alternative) splits the fallow knowledge across two files and creates a discoverability gap (the Admission rule section already says "see `docs/placement.md` §3"; adding another cross-link is more friction than it's worth for ~30 lines of content).

Recommended extension at `core/README.md:64` (insert after line 64, before `## Soft inversion`):

```markdown
## Tool integration checklist (consult-checklist rule `rule-tool-integration-same-commit-dep`)

When wiring a new tool into CI, package scripts, or repo automation:

1. **Same-commit dependency.** If a workflow adds `pnpm exec <tool>` / `npx <tool>` / `npm run <script>`, the tool MUST be in `devDependencies` (or `dependencies`) in the SAME commit. Verify with `grep '<tool>' package.json` after any `.github/workflows/*.yml` edit.
2. **Baseline flag format.** When wiring `fallow audit`, generate baselines with `fallow <sub> --save-baseline <path>` (audit format), NEVER `--save-regression-baseline`. The two flags produce incompatible JSON.
3. **Baseline storage.** `fallow` auto-creates `<root>/.fallow/.gitignore: *` that silently gitignores `.fallow/baselines/`. Verify `git ls-files <root>/.fallow/baselines/` returns expected files BEFORE committing. Prefer `plans/<slug>/reports/fallow/`; if you must keep `<root>/.fallow/baselines/`, add `!.fallow/baselines/` to root `.gitignore`.
```

Also add a `PROCESS_HINTS` row at `tools/learning-loop-mastra/core/loop-introspect.js:120` referencing the new rule id, mirroring the `rule-pr-body-registry-deltas` and `rule-runtime-agnostic-features` precedents.

## §6. `meta_state_resolve` canonical pattern with `consolidated_into`

Two distinct mechanics are at play:

1. **`status: superseded` + `consolidated_into: <change-log-id>`** (G8 precedent, line 158 of meta-state.jsonl; canonical test at `tools/learning-loop-mastra/core/__tests__/meta-state-g8-supersede.test.js:50-58`). This is for **collapsing N findings into one change-log**. The consistency check (`core/consistency-check.js:23-24`, F-4 invariant) requires `status: superseded` to carry `consolidated_into`. **Pointing `consolidated_into` at a rule id is not the G8 pattern** — rules aren't change-logs, and `consolidated_into` is documented for change-log targets (`core/meta-state.js:75-76`: "For status='superseded' entries: the id of the change-log entry that is the canonical source.").

2. **`status: resolved` + `resolution: "<promotion narrative>"`** (PR-body precedent, line 158 itself: `"resolution": "rule-pr-body-registry-deltas promoted; PROCESS_HINTS split shipped; CI advisory in place."`; plus line 169 for the runtime-agnostic promotion). This is the **canonical pattern for "encoded as rule-X"**: the finding transitions `active → resolved` with `resolved_by: operator` and a one-sentence `resolution` field naming the promoted rule id.

**Recommendation: use pattern (2).** For each of the 3 findings, call `meta_state_resolve({id, resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist, 3 items). ..."})`. The rule's `origin` field will be set to the **first** finding id; the other 2 should reference the rule via `supersedes` cross-links in the change-log entry, or simply be resolved with the same resolution text. Do NOT use `consolidated_into: rule-...` — that field targets change-log entries per its schema docstring and the G8 precedent.

The `superseded_by` + `consolidated_into: <change-log-id>` pattern is a separate concern: a single change-log entry should be written to capture "Promoted rule-tool-integration-same-commit-dep" with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]`, mirroring `meta-260623T1450Z-...` (line 168) which links `rules: ["rule-pr-body-registry-deltas"]`.

## §7. Design recommendation (A vs B)

**Recommend Design A (single `consult-checklist` rule with 3 items).**

Design A pros:
- Matches existing precedent 1:1 (rule-pr-body-registry-deltas is 6 items, rule-runtime-agnostic-features is 6 items — extending to 3 is a clean reduction).
- One `PROCESS_HINTS` row, one rule id to reference from all 3 finding resolution notes, one loop_describe warning to satisfy.
- The 3 items share a unifying concept ("don't repeat the 9ed520d fixes") — splitting them fragments the semantic.

Design A cons:
- Items 1 and 2 are theoretically expressible as `regex` rules. A `regex` rule for item 1 (`pnpm exec fallow` in workflow without fallow in package.json) is impossible without runtime correlation across 2 files; the bash gate only sees one command at a time. A `regex` rule for item 2 (`--dead-code-baseline.*regression-baseline\.json`) would only fire if someone re-introduces the wrong flag in the same command line — and is too narrow to catch the broader class ("two flag names that mean different things").
- Lacks auto-enforcement; relies on agent prompt rendering.

Design B pros:
- Items 1 and 2 become `regex` rules with real gate enforcement.
- Item 3 stays `consult-checklist` (storage decision is genuinely non-automatable).

Design B cons:
- **Item 1 cannot be reliably expressed as a regex** — the gate sees `pnpm exec fallow audit ...` but cannot query `package.json#devDependencies` at gate-eval time. A regex match alone (e.g., `pnpm exec [a-z][a-z0-9-]+ audit` in a workflow) would generate noise on `pnpm exec pnpm test` and other pnpm-bundled commands.
- Item 2's regex (`--dead-code-baseline.*regression-baseline\.json`) only fires when someone runs that exact command — but the bug was a **write-time decision** (choosing which flag to invoke when generating the baseline), not a read-time one. The right enforcement is "consult the checklist before running `fallow <sub> --save-*`."
- Splits one semantic concept across 3 registry entries + 3 PROCESS_HINTS rows + 3 resolution narratives. The 3 findings all stemmed from the same review cycle; the rule should reflect that.
- `rule-no-orphaned-evidence` would need to be re-verified for each of 3 new rules (3 separate fingerprints to maintain).

**Verdict:** Design A. The 3 items share a domain (CI/tool integration hygiene for fallow-like workflows); a consult-checklist is the right enforcement primitive for design-time decisions that gate-time regex cannot make; and the existing precedent (rule-pr-body-registry-deltas, rule-runtime-agnostic-features) shows this exact shape works in production.

## §8. Files that will need to change

| File | Change | Rationale |
|---|---|---|
| `meta-state.jsonl` | Append new rule entry at end: `{"entry_kind": "rule", "id": "rule-tool-integration-same-commit-dep", "origin": "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but", ...}` | The rule itself; `origin` set to finding #1 (the most directly fixable of the 3). |
| `meta-state.jsonl` | Append a new change-log entry: `{"id": "meta-260628T-followup-rule-tool-integration-same-commit-dep", "entry_kind": "change-log", ...}` mirroring `meta-260623T1450Z-...` shape with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]` and `consolidates: <3-finding-ids-csv>` | Captures the promotion in the audit log; matches `rule-pr-body-registry-deltas` precedent. |
| `meta-state.jsonl` | Update finding entries at lines 203, 204, 205: set `status: "resolved"`, `resolved_by: "operator"`, `resolved_at: <iso>`, `resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist). <one-sentence recap of the specific fix>."` | Per §6, use `resolved` (not `superseded`); each finding gets a finding-specific resolution note (e.g., finding #2 mentions the audit-format regeneration, finding #3 mentions the plan-dir relocation). |
| `tools/learning-loop-mastra/core/loop-introspect.js` | Append a 4th row to `PROCESS_HINTS` (after line 119) referencing `rule-tool-integration-same-commit-dep` | Required by H6 ordering gate (`loop-describe-tool.js:90-102`); without this row, `loop_describe({tier: warm})` emits a warning. |
| `tools/learning-loop-mastra/core/README.md` | Insert new `## Tool integration checklist` section after line 64 (before `## Soft inversion`) | Per §5; 3-item checklist as numbered list; cites the rule id and PROCESS_HINTS for cross-reference. |
| `docs/project-changelog.md` (if exists and the repo convention requires it) | One-line note: `Encoded rule-tool-integration-same-commit-dep (consult-checklist, 3 items); resolved 3 fallow-integration findings.` | Per `documentation-management.md`, only update if the change is user-facing. The rule is mostly internal, but adding a new process rule is user-facing for operators reviewing `meta-state.jsonl`. **Verify the changelog's house style first.** |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/` (optional, recommended) | Add `gate-logic-consult-checklist-tool-integration.test.js` mirroring `gate-logic-consult-checklist.test.js`: parse the new rule via `metaStateRuleEntrySchema.parse(...)`, call `applyPromotedRules("pnpm exec fallow audit --gate new-only", null, [rule], tmpRoot)`, assert `{decision: "ok"}`. | Defensive regression test; the rule must remain a no-op for the bash gate. Matches existing test discipline. |

Files explicitly NOT changed:
- `package.json`, `.github/workflows/test.yml`, `tools/learning-loop-mastra/.fallowrc.json`, `plans/260627-2042-phase-e-dead-code-sweep/**` — all correctly configured as of `9ed520d`; the rule encodes the prevention without re-touching the fixes.
- `tools/learning-loop-mastra/core/gate-logic.js` — no schema/engine change needed; consult-checklist is already a first-class path.

## §9. Open questions / risks

1. **Pattern body JSON parsing.** The schema accepts `pattern` as `z.string()`; existing consult-checklist rules embed JSON. The agent rendering path (in `loop_describe` / process-hint consumers) must JSON-parse the pattern to render the checklist items. Verify the agent prompt renderer handles the 3-item shape — read `tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js` cold-tier rendering (line 113) and any SessionStart hook that includes `process_hints` to confirm no parser assumptions break. (Likely fine; both existing 6-item precedents work.)
2. **`origin` field cardinality.** Rule schema requires `origin` to be a single finding id, but we have 3 source findings. The plan should pick the **most representative** finding (`meta-260628T1328Z-commit-6f9402e-...` — finding 1, since "tool-integration-incomplete" is the broadest category) and reference the other 2 only in the change-log entry's `consolidates` field. The 2-orphan situation is documented but not auto-flagged; confirm with operator.
3. **`rule-no-orphaned-evidence` interaction.** The new rule has `mechanism_check: true` (implicitly via `evidence_code_ref`); on any future change to `package.json` or `.github/workflows/test.yml` that touches the rule's evidence, the fingerprint hash will drift and resolution will be blocked until `meta_state_refresh_fingerprint` runs. **Pick a stable evidence reference** — `package.json:32-34` is a moving target (line numbers shift). Prefer `evidence_code_ref: "tools/learning-loop-mastra/.github/workflows/test.yml#fallow-audit"` (symbolic anchor) over a line-number anchor.
4. **PROCESS_HINTS row wording.** The 3rd PROCESS_HINTS row currently points at `rule-runtime-agnostic-features` with a 6-item checklist inline. For consistency, the new row should similarly inline the 3 items OR reference `core/README.md` §Tool integration checklist — pick one style and stay consistent. The existing precedent inlines (line 119) but the rule body is the source of truth; inlining duplicates and can drift.
5. **PROCESS_HINTS ordering.** Lines 117-119 have hints in operational order: test runner → PR body → runtime-agnostic audit. The new hint is about CI tool integration, which is a similar operational class as test runner (CI mechanics). Consider placing it as hint index 3 (line 120, after the runtime-agnostic hint) rather than appending at the end; verify the cold-tier regression test that asserts PROCESS_HINTS count.
6. **Effectiveness of consult-checklist for finding 1.** Item 1 ("same-commit dependency") is the most likely to recur — it's the kind of oversight PR reviewers miss. A consult-checklist relies on the agent reading the checklist during `pnpm exec`-intent reasoning. Consider strengthening with an optional **review-time advisory**: `tools/learning-loop-mastra/.github/workflows/meta-state-pr-body-advisory.yml` (existing CI advisory pattern) could surface a "did you update `package.json#devDependencies`?" reminder when `.github/workflows/*.yml` is touched. Out of scope for this rule promotion but worth tracking as a follow-up design (would need a `loop-design-*` entry).
7. **Scope predicate.** Both precedents use `scope_predicate: project_has_learning_loop_mcp` (or no predicate = always). The new rule should arguably **omit** the predicate (always on): the same-commit dependency check applies to any CI tool integration, not just learning-loop-mcp projects. Confirm with operator.

---

**Status:** DONE
**Summary:** Single `consult-checklist` rule (`rule-tool-integration-same-commit-dep`) with 3 items is the right design, modeled on `rule-pr-body-registry-deltas` (line 167) and `rule-runtime-agnostic-features` (line 127). Resolve the 3 findings with `status: resolved` + `resolution: "Encoded as rule-..."` (NOT `consolidated_into: rule-...`, which targets change-logs per `core/meta-state.js:75-76`). The new rule requires a `PROCESS_HINTS` row at `core/loop-introspect.js:120` to satisfy the H6 ordering gate, and `core/README.md` §Admission rule is the right home for the human-readable checklist. 7 files to change; 4 open questions, none blocking.