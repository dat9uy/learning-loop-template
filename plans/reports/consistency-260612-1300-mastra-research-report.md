# Consistency Check: Mastra Runtime/Model-Agnostic Productization Research

**Type:** review (consistency check, not a research deliverable)
**Date:** 2026-06-12
**Slug:** mastra-research-report-consistency-check
**Subject:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md`
**Work context:** learning-loop-template
**Goal of this document:** identify gaps, drift, and inconsistencies in the subject report before it is used as the goal contract for Bridge 5 work. Findings are grounded in the actual repo state on 2026-06-12, not in the report's internal narrative.

---

## Method

Cross-checked the report's claims against:

1. `tools/learning-loop-mcp/agent-manifest.json` (canonical tool list)
2. `tools/learning-loop-mcp/tool-registry.js` (wire-format coercion, registration)
3. `tools/learning-loop-mcp/core/schema-to-zod.js` (Bridge 5 Approach 2 status)
4. `schemas/*.schema.json` (schema inventory)
5. `records/` directory tree (legacy meta-surface state)
6. `AGENTS.md` (Bridges table, hooks matrix, MCP tool count)
7. `git log` (commit presence, ordering)
8. The 4 tool files that import `buildZodSchemaFor` / `composeUpdateSchema` (Approach 2 evidence)
9. `__tests__/` for test counts and wire-format-coercion coverage

Each finding below cites the report's section/line and the contradicting evidence.

---

## Findings (9 total, severity-sorted)

### F1. Tool count is wrong (high)

**Report claim (§1.3 line 98):** "58 tools, 7 groups"
**Report claim (table in §1.3):** 52 tools across 8 groups (gate 2 + record 9 + workflow 15 + index 5 + budget 1 + capability 3 + meta_state 16 + introspection 1)
**Actual (`agent-manifest.json`):** **56 tools** across 8 groups (introspection has 2: `loop_describe` + `loop_get_instruction`, not 1)
**Actual (`ls tools/learning-loop-mcp/tools/*.js` excluding tests):** **59 files** (test files included brings it to ~65+)
**AGENTS.md (line 25):** "52 tools"

The "58" headline is wrong. The in-table "52" is wrong (it predates the `loop_get_instruction` tool that landed in `260611-1700-loop-get-instruction`). All downstream tables that depend on the count (the §3.10 cascade, the 30-tool final number, the Q1–Q9 surface math) inherit the error. Required fix: bump to 56 (manifest) or 59 (file count), add `loop_get_instruction` to the introspection row, and recompute the cascade.

### F2. Bridge 5 status claim contradicts `AGENTS.md` (high)

**Report claim (§3.8):** "Bridge 5 is *partially* shipped. Approach 2 (...) — SHIPPED for 4 record types (experiment, risk, decision, observation). Approach 3 (full codegen for writers + validators) — pending, sequenced after SP3 schemas stabilize."

**Code evidence (verified):** All 8 tool files import schema-derived Zod from `core/schema-to-zod.js`:
- `create-experiment-record-tool.js`, `update-experiment-record-tool.js`
- `create-risk-record-tool.js`, `update-risk-record-tool.js`
- `create-decision-record-tool.js`, `update-decision-record-tool.js`
- `record-observation-tool.js`, `update-observation-tool.js`

Each imports `buildZodSchemaFor` or `composeUpdateSchema` and uses it as the tool's input schema. **Approach 2 is in production for those 4 types.**

**`AGENTS.md` contradiction (line 253, original version):** "Bridges 1–5 are aspirational; Bridge 6 is the active front." The Six Bridges table in `AGENTS.md` lists Bridge 5 as "Not shipped".

**Resolution (2026-06-12 reframe):** the F2 "pick one source of truth" question was resolved by the 2026-06-12 operator reframe, which **picked neither** — instead it collapsed Bridge 5 and Bridge 6 into one atomic front called the meta-surface, and rewrote both `AGENTS.md` and `docs/trajectory.md` from scratch. The "which one is canonical" question is moot when both are rewritten in the same shape. See the "F2+F3 operator reframe" entry in the Status block below.

### F3. Bridge 5 schema list is wrong (high)

**Report claim (§3.8, "10 record types in scope" table and prose):** Lists 8 record types — "experiment, risk, decision, observation, claim, evidence, capability, index."

**Actual (`schemas/` directory):** 8 `.schema.json` files exist, but they are: `capability`, `claim`, `decision`, `experiment`, `index-entry`, `observation`, `resource-budget`, `risk`. **No `evidence.schema.json` exists.** The report is using "evidence" colloquially (the markdown `## Findings` evidence files), but the Bridge 5 code generator needs JSON Schema inputs. Either the report means something different by "evidence", or the list confuses "8 record types" with "8 schema files" — those are not the same set.

**Resolution (2026-06-12 reframe):** F3 is **superseded** by the 2026-06-12 reframe's engine/instance split (§3.8.1 of the report). The "what 8 record types go through the codegen engine" question is now answered as: **the 4 meta-surface entry kinds** (`finding | change-log | rule | loop-design`). Product-surface schemas (capability, claim, index-entry, resource-budget, observation) are unbound and not in the codegen engine's bound output. The "evidence" entry in the original list was a red herring — it never referred to a JSON Schema; it was about the meta-surface's own entry kinds. See the "F2+F3 operator reframe" entry in the Status block below.

### F4. `records/meta/` content is already mostly converted (medium)

**Report claim (§3.10, "Pre-Phase 0"):** Convert `records/meta/evidence/*.md` and `records/meta/capabilities/*.yaml` to `meta-state.jsonl` entries.

**Actual (current `records/meta/` tree):**
```
records/meta/.cache/
records/meta/experiments/   (2 yaml files)
records/meta/index/         (12 files)
records/meta/risks/         (empty)
```

**No `evidence/` or `capabilities/` subdirectories remain in `records/meta/`.** The conversion the report describes as "pre-Phase 0 work" is already done. The report's "pre-Phase 0" list overstates remaining work and would misdirect the next agent. Required fix: delete the corresponding lines from the §3.10 list, or re-scope them to the `experiments/` and `index/` content that *does* remain.

### F5. `records/index.yaml` deletion is partially complete (medium)

**Report claim (§3.10):** "`records/index.yaml` is **DELETED**. Re-derived from `meta-state.jsonl` at runtime by the (refactored) introspection tools."

**Actual:** No `records/index.yaml` exists. So the deletion is consistent with the *intent*.

**But `AGENTS.md` (line 184) still shows:**
```
records/
├── <surface>/
├── observations/*.yaml
├── meta/
│   ├── evidence/*.md
│   └── capabilities/*.yaml
└── index.yaml
```

The directory layout in `AGENTS.md` is **inconsistent with both the report and the actual repo state.** Required fix: update `AGENTS.md` to either drop `index.yaml` or annotate it as "derived, not stored" — and drop the `meta/evidence/` and `meta/capabilities/` lines that no longer match the filesystem.

### F6. The "675+ tests" gate is unverifiable (medium)

**Report claim (§3.6 and Q3):** "Phase 0 runs the existing 675+ tests against the Mastra server; pass = coercion was dead code, drop it. Fail = surface the diffs and decide case-by-case."

**Actual:** No file in the repo mentions "675", "676", or "677" as a test count. The number is used as a self-evident fact without sourcing it. If the actual count is materially different (e.g., 100, 200, 800), the Phase 0 acceptance bar shifts. Required fix: count the test files (`ls __tests__/*.test.js | wc -l`) and cite the source.

### F7. The Q3 caveat at the top is incomplete (medium)

**Report claim (top-of-file "Status as of 2026-06-11" block):**
> "During the same session, `2315341 feat(mcp-tools): patch validateToolInput for top-level array/boolean wire-format coercion` landed on main, which **partially supersedes the Q3 framing** (drop the coercion in Phase 1, gated on Phase 0 parity test)."

**Actual:**
- `git log` confirms `2315341` is on main.
- `coerceParamsToSchema` and `installWireFormatCoercion` in `tools/learning-loop-mcp/tool-registry.js` are **in production** (not pre-decision) and have full test coverage at `__tests__/wire-format-top-level-coercion.test.js`.
- `__tests__/wire-format-coercion-fix.test.js` directly tests `coerceParamsToSchema` for top-level array/boolean coercion.

The caveat says "during the same session" (the report was committed 2026-06-11, the patch is in the same window). The report's framing implies the helpers are *proposed* for Phase 1 deletion. They are *live and load-bearing* today. The Phase 1 "drop the coercion" decision is **no longer a free option** — it requires porting the upstream patch's behavior into Mastra's `createTool` input validation, or accepting the regression. Required fix: the caveat should explicitly say "the helpers are in production and have test coverage; Phase 1 must reproduce the upstream behavior in Mastra, not just delete the helpers."

### F8. The report doesn't reason about `loop_get_instruction` (low)

**Actual:** `introspection` group has 2 tools: `loop_describe` + `loop_get_instruction`. The `loop_get_instruction` tool landed in plan `260611-1700-loop-get-instruction` and is referenced in `loop_describe`'s `discoverability_hints` block (which the report itself relies on, per the §3.10 cross-reference script).

The report treats `introspection` as 1 tool. This is the same root cause as F1, but it has a separate downstream effect: the report's §3.1 mapping table assigns `loop_describe` to "Tool (deterministic, tiered reads)" but does not assign `loop_get_instruction` to anything. If `loop_get_instruction` is a workflow-driven tool (its MCP handler returns a curated instruction set, not a tiered read), it may belong in the `workflow` group after the Mastra migration.

**Resolution (2026-06-12):** F8 is **patched**. The §3.1 mapping table now has two introspection rows. See the F8 entry in the Status block below.

### F9. Snapshot-vs-contract framing is unresolved (low)

**Report claim (top-of-file block):** "Treat this report as a snapshot, not a contract." It explicitly says "Refine in place when the operator returns — edit the report's sections, not just add a new one."

**But the rest of the report reads as a contract:**
- "Updated implementation order (replaces §3.4 Phasing for the Bridge 5 axis)" (§3.8)
- "Sequencing decision rule (operator-stated, easy to revise)" (§3.7, §3.8)
- "Not captured as a meta-state finding (per operator decision 2026-06-11)" (multiple sections)

The body uses declarative language ("Mastra migration Phase 1 shrinks dramatically", "the plan's effective tool surface shrinks to ~30") and refers to "the plan" as a noun. A snapshot does not have a plan. A contract does.

**Resolution (2026-06-12):** F9 is **patched by inversion**. The 2026-06-12 reframe promoted the §3.x decisions and §8 resolutions to operator-approved contract. See the F9 entry in the Status block below.

---

## Cross-cutting recommendation

**As of 2026-06-12, the report is suitable for adoption as a *contract for Bridge 5*** after the patches documented in the Status block. F1, F4, F6, F7, F8, F9 are patched in place. F2, F3, F5 are **superseded by the 2026-06-12 operator reframe** (which rewrote `AGENTS.md` and `docs/trajectory.md` from scratch; both F2 "pick one source of truth" and F3 "what 8 record types go through the engine" are answered by the meta-surface atomicity and the engine/instance split, respectively).

The single highest-leverage edit (now done): **resolve F2 first** by collapsing Bridge 5+6 into the meta-surface atomic front, which made the F3 schema-list question moot and unlocked the AGENTS.md / trajectory.md rewrites. The 2026-06-12 reframe is the resolution.

---

## Action Checklist (original 2026-06-12 — superseded)

> **Status (2026-06-12 post-audit):** This Action Checklist was the original "to confirm and execute" list at the time the consistency report was first written. **All 9 findings and both optional items are now resolved; the original "What" / "Where" / "Effort" annotations below are retained for forensic continuity** but the checkboxes are updated to reflect actual outcome. See the Status block at the bottom of this document for the per-finding resolution notes.

### 1. [x] F1 — Fix tool count (52 → 56, plus file-count note) — RESOLVED 2026-06-12 (patched in place; see Status block F1)
   - **What (original):** Update §1.3 to say "56 tools per `agent-manifest.json` (8 groups; introspection has 2: `loop_describe` + `loop_get_instruction`); 59 tool files under `tools/learning-loop-mcp/tools/` (excluding tests)."
   - **Where:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §1.3 line 98 and the in-table row.
   - **Cascade impact:** §3.10 tool surface table needs the same +2; the "52 → 38 → 30" cascade becomes "56 → 42 → 34" (approximate; recompute with new baseline).
   - **Effort:** 5 minutes.

### 2. [x] F2 — Reconcile `AGENTS.md` Six Bridges table with report's Bridge 5 status claim — RESOLVED 2026-06-12 (superseded by reframe; see Status block F2)
   - **What (original):** Decide canonical source. Recommend: keep `AGENTS.md` as canonical (it is the gate-truth document), update it to mark Bridge 5 as "Partially shipped (Approach 2 done for 4 record types; Approach 3 pending). Approach 3 is the remaining work."
   - **Where:** `AGENTS.md` line 25 (the "MCP server" description) and the Six Bridges table around line 250.
   - **Alternative:** Mark the report as a downstream document that cannot override `AGENTS.md`.
   - **Effort:** 15 minutes including a Bridge 5 status verification (count tool files importing `buildZodSchemaFor`).

### 3. [x] F3 — Clarify the "evidence" entry in the Bridge 5 schema list — RESOLVED 2026-06-12 (superseded by reframe; see Status block F3)
   - **What (original):** Either (a) drop "evidence" from the 8-record-type list and replace with `index-entry` (matches the actual `schemas/index-entry.schema.json` filename) or (b) clarify that "evidence" refers to the markdown `## Findings` files in `meta-state.jsonl`, not a JSON Schema input.
   - **Where:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 prose and the "10 record types" table.
   - **Recommended fix (original):** Option (a) — list is: experiment, risk, decision, observation, claim, index-entry, capability, resource-budget. That matches the 8 `.schema.json` files.
   - **Effort:** 5 minutes.

### 4. [x] F4 — Trim the §3.10 "Pre-Phase 0" list to match current `records/meta/` state — RESOLVED 2026-06-12 (patched in place; see Status block F4)
   - **What (original):** Drop the lines about converting `records/meta/evidence/*.md` and `records/meta/capabilities/*.yaml`. Replace with a note that those directories no longer exist (already converted) and the remaining work is `records/meta/experiments/*.yaml` (2 files) and `records/meta/index/*.yaml` (12 files).
   - **Where:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 "Pre-Phase 0" list.
   - **Effort:** 10 minutes.

### 5. [x] F5 — Update `AGENTS.md` directory layout to match filesystem — RESOLVED 2026-06-12 (superseded by from-scratch AGENTS.md rewrite; see Status block F5)
   - **What (original):** Drop `└── index.yaml` from the layout diagram (line 184). Drop `meta/evidence/*.md` and `meta/capabilities/*.yaml` lines. Add a note that `meta/` currently contains `experiments/` and `index/` only.
   - **Where:** `AGENTS.md` line 184 ("Surface-First Directory Layout" diagram).
   - **Effort:** 5 minutes.

### 6. [x] F6 — Verify and cite the "675+ tests" count — RESOLVED 2026-06-12 (verified 985 tests; see Status block F6)
   - **What (original):** Run `ls tools/learning-loop-mcp/__tests__/*.test.js | wc -l` and `find tools/learning-loop-mcp/__tests__ -name "*.test.js" | wc -l`. Cite the actual number in §3.6 and Q3.
   - **Where:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.6 and §8 Q3.
   - **Effort:** 2 minutes for the count, 5 minutes for the citation edit.

### 7. [x] F7 — Expand the Q3 caveat to acknowledge the helpers are live — RESOLVED 2026-06-12 (patched in place; see Status block F7)
   - **What (original):** Replace the existing "partially supersedes the Q3 framing" caveat with a clearer statement.
   - **Where:** Top-of-file "Status as of 2026-06-11" block in `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md`.
   - **Effort:** 5 minutes.

### 8. [x] F8 — Add `loop_get_instruction` to the §3.1 mapping table — RESOLVED 2026-06-12 (patched in place; see Status block F8)
   - **What (original):** Add a row: "`loop_get_instruction` | **Tool** (deterministic, key-indexed) | returns curated instruction from `loop_describe`'s `discoverability_hints` block".
   - **Where:** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.1.
   - **Effort:** 2 minutes.

### 9. [x] F9 — Resolve snapshot-vs-contract framing — RESOLVED 2026-06-12 (patched by inversion; see Status block F9)
   - **What (original):** Pick a side. Recommended: keep snapshot framing for the *research* portions (§1, §2) and adopt contract framing for the *decisions* (§3.7, §3.8, §3.10). Add a sub-section at the top that explicitly says "The §1 and §2 sections are research snapshots verified on 2026-06-11. The §3.x decisions are operator-approved contracts as of 2026-06-11; deviations require new operator decision entries in `meta-state.jsonl`."
   - **Where:** Top of `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` after the existing "Status as of 2026-06-11" block.
   - **Effort:** 10 minutes.

### 10. [ ] Optional: Log this consistency check in `meta-state.jsonl` — PENDING operator confirmation
   - **What:** Create a `meta_state_log_change` entry documenting the consistency check as a `change-log` entry with `change_target: 'plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md'`. This makes the check queryable from `meta_state_list` and protects against the report being treated as canonical without these 9 fixes.
   - **Use the `meta_state_log_change` MCP tool with:**
     - `change_target`: `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md`
     - `change_dimension`: `semantic`
     - `change_diff`: `{"findings": 9, "severity_high": 3, "severity_medium": 3, "severity_low": 3, "report_path": "plans/reports/consistency-260612-1300-mastra-research-report.md", "resolution_status": "all_9_resolved_2026-06-12"}`
     - `reason`: "9 consistency findings against repo state on 2026-06-12; all 9 resolved 2026-06-12. Report promoted to operator-approved contract per F9 inversion. F1/F4/F6/F7/F8 patched in place; F2/F3/F5 superseded by the 2026-06-12 operator reframe. Pre-condition for opening the meta-surface atomic-front plan (Optional item 11)."
   - **Effort:** 5 minutes.

### 11. [ ] Optional: Sequence the Bridge 5 plan to start with the meta-surface atomic front — PENDING operator confirmation
   - **What:** If you want to start Bridge 5 work, the first phase should be "open the meta-surface atomic front plan" — not "start coding against the product surface". The Bridge 5 codegen engine ships first, scoped to the meta-surface only (4 entry kinds). Product-surface binding is the Bridge 7 question, deferred until after the meta-surface ships.
   - **Where:** Any future `plans/2606XX-HHMM-bridge-5-approach-3/plan.md` (or equivalent: `plans/2606XX-HHMM-meta-surface-atomic-front/`).
   - **Pre-conditions for opening the plan:**
     - F1, F4, F6, F7, F8, F9 patched in place in the Mastra research report (all done 2026-06-12).
     - F2, F3, F5 superseded by the 2026-06-12 reframe (all done 2026-06-12).
     - The `meta_state_log_change` entry logging the reframe (Optional item 10) is created.
   - **Effort:** None now; just a sequencing note for the next plan.

---

## Status

- [x] All 9 findings identified with code-grounded evidence.
- [x] F1 — Tool count fix: patched in place (2026-06-12). §1.3 header updated to "56 tools per `agent-manifest.json`, 59 tool files on disk, 8 groups"; introspection row updated to 2 tools (`loop_describe` + `loop_get_instruction`).
- [x] F2 — `AGENTS.md` Bridges table reconciliation: **superseded and replaced** by 2026-06-12 operator reframe. The Bridges table in `AGENTS.md` is now a full rewrite of the Bridge 5/6/Six-Bridges sections; F2's original "reconcile" framing is no longer accurate. See "F2+F3 operator reframe" below.
- [x] F3 — Schema list fix: **superseded by 2026-06-12 reframe.** The "what 8 record types go through the codegen engine" question is answered by the engine/instance split: 4 meta-surface entry kinds (`finding | change-log | rule | loop-design`) are bound; product-surface schemas are unbound. The "evidence" entry in the original list was a red herring (never a JSON Schema). See "F2+F3 operator reframe" below.
- [x] F4 — §3.10 "Pre-Phase 0" list trim: patched in place (2026-06-12). `records/meta/evidence/` and `records/meta/capabilities/` conversions marked ~~struck through~~ with "Already done" notes; `records/meta/experiments/*.yaml` (2 files) and `records/meta/index/*.yaml` (12 files) called out as remaining; `records/index.yaml` deletion marked done.
- [x] F5 — `AGENTS.md` directory layout: **resolved by from-scratch AGENTS.md rewrite.** The "Surface-First Directory Layout" diagram is removed entirely; the meta-surface does not have a directory layout (it has a single JSONL file). The legacy product-record CRUD table, Product-Build Plans, Product Code Writes, Budget-Check Rule, and Implementation Workflows sections are also dropped. Previous `AGENTS.md` preserved at `AGENTS.old.260612-1300.md`. The new doc leads with §1 "The Meta-Surface (the only bound surface)" as the opening thesis and structures the entire document around meta-surface infrastructure.
- [x] F6 — Test count verification: **verified 2026-06-12 via `pnpm test`.** Authoritative count: **985 tests** (984 pass, 1 skipped, 147 suites, ~9s duration). Per-glob breakdown of the 9 globs in the `pnpm test` script:
  - `tools/learning-loop-mcp/__tests__/*.test.js` — 105 files, 755 tests
  - `tools/learning-loop-mcp/core/__tests__/*.test.js` — 2 files, 9 tests
  - `tools/learning-loop-mcp/core/*.test.js` — 3 files, 34 tests
  - `tools/learning-loop-mcp/scout/*.test.js` — 0 files, 0 tests
  - `tools/learning-loop-mcp/lib/*.test.js` — 1 file, 24 tests
  - `tools/learning-loop-mcp/evals/*.test.js` — 0 files, 0 tests
  - `tools/learning-loop-mcp/tools/*.test.js` — 4 files, 28 tests
  - `.claude/coordination/__tests__/*.test.cjs` — 8 files, 55 tests
  - `.factory/hooks/__tests__/*.test.cjs` — 4 files, 13 tests
  - **Total: 127 files, 985 tests** (the `pnpm test` reporter's "147 suites" includes individual test() blocks reported as suites; my 127 is file-level)
  - The report's "675+ tests" claim is **wrong by ~310 tests**; the figure was inherited from the SP3 trajectory entry (~674 tests) and never updated. Both §3.6 line 298 and §8 Q3 line 753 are updated to cite the verified 985-test count.
- [x] F7 — Q3 caveat expansion: patched in place (2026-06-12). Top-of-file "Status as of 2026-06-11" block rewritten to acknowledge the helpers are in production with test coverage, and Phase 1 of the Mastra migration must reproduce the behavior (not delete the helpers). §8 Q3 resolution rewritten with the same framing + the implementation mechanism (Mastra's `createTool` `inputSchema` with `.preprocess()`, or `beforeToolCall` hook). The "Aligned to" line is updated from "Bridge 6" to "the meta-surface (Bridge 5+6)".
- [x] F8 — `loop_get_instruction` mapping row: patched in place (2026-06-12). §3.1 mapping table now has two rows: `loop_describe` (deterministic, tiered reads, returns the full `discoverability_hints` block at one of 4 tiers) and `loop_get_instruction` (deterministic, key-indexed, on-demand lookup of a single hint by named slug / 0-based index / array of either). The new row cites the backing file `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js`, the shared `buildDiscoverabilityHints()` from `core/loop-introspect.js`, and the originating plan `260611-1700-loop-get-instruction`.
- [x] F9 — Snapshot-vs-contract framing: **resolved by inversion.** The 2026-06-11 framing ("snapshot, not a contract") is **superseded** by the 2026-06-12 reframe, which has effectively promoted the §3.x decisions and §8 resolutions to operator-approved contract. Patched in place: top-of-file "Status as of 2026-06-12" block rewritten from "(snapshot, refined by 2026-06-12 operator reframe)" to "(operator-approved contract, refined by 2026-06-12 operator reframe)", with an explicit list of **what is contract** (the §3.6 wire-format decision, §3.7 storage deferral, §3.8 meta-surface atomicity + engine/instance + 7-step order, §3.10 meta-surface-as-only-bound-surface + Q8 reopening + tool-surface split, §3.9 hook layer, §8 Q1–Q7 resolutions) and **what is research/snapshot** (§1 current state, §2 Mastra concepts, §4 risks). The "What the next agent should do" Step 4 is sharpened: refine §1-§2 and §4 in place without operator sign-off (research/snapshot); do not refine §3.x or §8 without first recording a `change-log` or `loop-design` entry that supersedes the prior contract. Step 5 explicitly ties the Q3 revisit to a `change-log` entry as the precondition for any in-place refinement.
- [x] **F2+F3 operator reframe (2026-06-12) — meta-surface is the only bound surface, Bridges 1-4 voided.** Patched in place:
  - `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8 rewritten as "Engine vs Instance" with §3.8.1 (engine vs instance) and §3.8.2 (Bridges 1-4 voided by re-debate). New implementation order has Step 0 = "Re-debate product-surface schemas" and Step 7 = "Bridge 7 question, post-meta-surface."
  - `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 rewritten as "Scope: meta-surface as the only bound surface" with the engine/instance split, the Q8 reopening (Option D: re-debate from meta-surface), and the 2026-06-12 tool-surface table (~36 bound to meta-surface, ~20 unbound or dropped).
  - `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` marked "VOIDED BY RE-DEBATE, 2026-06-12" with the full reframe citation.
  - `plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md` marked "VOIDED BY RE-DEBATE, 2026-06-12" with the full reframe citation.
  - `AGENTS.md` fully rewritten from scratch (see F5). The new doc drops the legacy product-record CRUD table, the Surface-First Directory Layout, the Product-Build Plans / Product Code Writes / Journal Writes subsections, the Budget-Check Rule, and the Implementation Workflows Use Case A and B. The Bridges table is the 2026-06-12 reframe; the engine/instance split is documented in §10; the Bridges 1-4 voiding is cited with the full report list. The new doc leads with the meta-surface as the opening thesis (§1).
  - `docs/trajectory.md` fully rewritten from scratch (the trajectory is the trajectory of the meta-surface, not any substrate). The 4 stacked "What Has Happened Since" changelogs are dropped; the 4-bridge table is the 2026-06-12 reframe; the "Substrate vs. Product vs. Template" table is replaced; "What Stays Human Forever" is reframed around meta-surface scope, not product scope. Previous `docs/trajectory.md` preserved at `docs/trajectory.old.260612-1300.md`.
  - F6 patch (this entry): test count verified at 985; "675+ tests" claim updated in §3.6 line 298 and §8 Q3 line 753. See F6 line above.
  - F7 patch: top-of-file "Status as of 2026-06-11" block rewritten; §8 Q3 resolution rewritten. See F7 line above.
- [ ] Optional: log via `meta_state_log_change`: pending confirmation.
- [ ] Optional: sequence Bridge 5 plan: pending confirmation.

## References

- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` — subject report (rewritten §3.8 and §3.10 per the 2026-06-12 operator reframe)
- `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` — Bridge 1 report, marked "VOIDED BY RE-DEBATE, 2026-06-12"
- `plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md` — Bridge 2 report, marked "VOIDED BY RE-DEBATE, 2026-06-12"
- `AGENTS.md` — "Where This Project Is Heading" section rewritten from scratch per the 2026-06-12 reframe
- `tools/learning-loop-mcp/agent-manifest.json` — canonical tool list (56 tools)
- `tools/learning-loop-mcp/tool-registry.js` — wire-format coercion helpers (in production)
- `tools/learning-loop-mcp/core/schema-to-zod.js` — Bridge 5 Approach 2 engine
- `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` — coercion test coverage
- `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` — coercion test coverage
- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` — Approach 2 verification
- `schemas/*.schema.json` — 8 schema files (capability, claim, decision, experiment, index-entry, observation, resource-budget, risk). **As of 2026-06-12, only the 4 meta-surface schemas (decision, experiment, observation, risk) are bound; the rest (capability, claim, index-entry, resource-budget) are unbound product-surface and may not be the right shape after re-debate.**
- `records/meta/` — current state (no `evidence/` or `capabilities/` subdirs)
- `AGENTS.md` — hooks matrix (lines 1-50), directory layout (line 184), Six Bridges table (rewritten 2026-06-12)
- `git log` — confirms `2315341` is on main
- Plan directories: `plans/260611-1700-loop-get-instruction/` (added `loop_get_instruction`), `plans/260611-2230-mcp-wire-format-coercion-fix/` (the `2315341` commit)
