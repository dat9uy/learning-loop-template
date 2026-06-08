# Brainstorm Report: Test Codebase Scout

## Problem Statement

The test code base at this repo has grown organically over 50+ days. We've accumulated ~70 test files across `tools/learning-loop-mcp/__tests__/`, `.claude/coordination/__tests__/`, `.factory/hooks/__tests__/`, plus plan-specific test files. There is no systematic audit of:

1. **Dangling / not useful tests** — tests asserting on removed schema fields, removed tools, or auto-resolved observations
2. **MCP-first compliance** — whether tests exercise the loop's canonical MCP surface, or whether they bypass MCP with direct file I/O
3. **Test gaps** — which MCP tools, schemas, gate patterns, and entry kinds lack any test coverage
4. **Prompt budget health** — for the few tests that spawn `droid exec`, whether the prompt's expected file-read overhead fits within the test timeout

The cold-session test 1 hang (`meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env`, corrected by `meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio`) was the most recent symptom of an audit gap. The trace showed the test prompt forces 6 file reads before any MCP call, defeating the abstraction MCP provides. We do not know how many other tests have the same failure mode.

A scout is needed: a single agent that walks the test code base, classifies each test by MCP-first bucket, flags dangling/obsolete patterns, surfaces coverage gaps, and estimates prompt budgets. The scout files one meta-state finding per candidate. Future plans then triage the candidates.

## Requirements

(Captured via AskUserQuestion on 2026-06-08. All 4 questions answered with the recommended options.)

- **Expected output**: Single markdown report at `plans/reports/brainstorm-20260608-test-codebase-scout.md` (this file). Plus a list of actionable `meta_state_report` payloads (one per candidate finding) that the scout session will file.
- **Acceptance criteria**:
  - The report covers 4 deliverables: test inventory, MCP-first audit, dangling/obsolete detection, gap analysis, plus a 5th: prompt budget audit.
  - Each deliverable has a method, an output schema, and an example candidate-finding payload.
  - The candidate-finding payloads are actionable: each row contains category, severity, evidence_code_ref, description sketch — ready for `meta_state_report`.
  - The scout execution protocol is documented: a single agent, sequential deliverables.
- **Scope boundary**:
  - IN: test code base audit; MCP-first classification; dangling/obsolete detection; gap analysis; prompt budget audit; candidate-finding payload templates.
  - OUT: fixing any tests (separate plan session); filing the candidate findings (the scout session does this, not the brainstorm session); rewriting the cold-session test 1 prompt (separate plan); sub-agent execution shape (the user explicitly chose single-agent sequential).
- **Non-negotiable constraints**:
  - Report must follow the existing `brainstorm-YYYYMMDD-...` naming convention.
  - Scout must use the existing `meta_state_report` MCP tool to file findings (not direct I/O).
  - Scout must not modify any test files — read-only audit.
  - All candidate findings must reference code via `evidence_code_ref`, not markdown paths.
- **Touchpoints**:
  - `tools/learning-loop-mcp/__tests__/` — 70+ test files
  - `.claude/coordination/__tests__/` — coordination gate tests
  - `.factory/hooks/__tests__/` — hook tests
  - `plans/*/phase-*-test*.js` — plan-specific test files
  - `tools/manifest.json` — the 52 MCP tools to cross-reference for coverage
  - `tools/learning-loop-mcp/agent-manifest.json` — the 9 tool groups
  - `meta-state.jsonl` — context for prior findings (1410Z, 1522Z, 1618Z, etc.)
  - `schemas/*.schema.json` — to check test coverage of schema validation
  - `tools/learning-loop-mcp/core/gate-logic.js` — gate patterns to check test coverage of

## Evaluated Approaches (for REPORT STRUCTURE)

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A. Deliverable-Centric** | 5 sections (one per deliverable + execution protocol) | Easiest to execute; clear section boundaries | Decision criteria scattered across MCP-first audit section |
| **B. Decision-Lattice First** | Top-level decision tree; deliverables as branches | Forces upfront criteria definition | Harder to scan; not "follow-me top-to-bottom" |
| **C. Hybrid — Criteria + Deliverables + Payload Cookbook** | Layer 1: criteria glossary. Layer 2: 4 deliverables. Layer 3: payload cookbook | Criteria defined once, used everywhere; payload templates reusable; scout reads top-to-bottom OR jumps to cookbook | 3-layer structure adds upfront design cost |

**Picked: C** (per user approval 2026-06-08).

## Final Recommended Solution: Approach C — Hybrid Report

### Layer 1 — Decision-Criteria Glossary

Define the 5 terms the scout will use to classify tests. Each definition is the source of truth for both the scout's audit and the future fixes' acceptance criteria.

#### C1. MCP-First Bucket (4 values)

A test is classified into exactly one bucket:

- **A. MCP-only** — Test drives the loop via `mcp__learning_loop_mcp__*` calls (real agent) or direct server JSON-RPC spawn. No `fs.readFileSync` / `fs.writeFileSync` in test logic; file I/O allowed only in fixture setup/teardown.
- **B. MCP + setup/teardown I/O** — Test uses MCP calls in logic; file I/O only for fixtures (e.g., `mkdtempSync`, `copyFileSync` of schemas into GATE_ROOT). The I/O is scaffolding, not the test's purpose.
- **C. Bypass-MCP** — Test logic uses direct file I/O (e.g., `writeEntry`, `readRegistry` imported from `core/meta-state.js`) when an MCP tool exists for the same operation. Anti-pattern. Each instance is a candidate finding.
- **D. Droid exec** — Test spawns `droid exec` for end-to-end agent behavior. Inherently real-runtime; cannot be reclassified as A/B/C.

#### C2. Dangling / Obsolete Pattern Match

A test is "dangling" if any of these patterns apply:

- **D1. Schema-drift** — Asserts on a schema field that was removed in a refactor (e.g., nested `evidence.code_ref` after the dual-field unification at `meta-260607T0008Z`).
- **D2. Resolved-finding dependency** — Gates on a meta-state finding or observation that has since been resolved, expired, or auto-resolved (e.g., a test that requires `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` to be in `status: 'active'`, but the finding is now `resolved`).
- **D3. Removed-tool reference** — Imports a tool module or calls a tool that no longer exists in `tools/manifest.json` or `tools/learning-loop-mcp/agent-manifest.json`.
- **D4. Stale fixture** — Reads a fixture file that snapshots state at a moment in time but is not refreshed (e.g., the deleted `tools/learning-loop-mcp/__tests__/fixtures/cold-tier-pre-refactor.json` had this issue).
- **D5. Stale TOLERANCES array** — Count-based assertion with hard-coded tolerance numbers that drifted (the cold-tier test had this; fixed at `meta-260608T0847Z`; pattern may recur).

#### C3. Test Gap Definition

A "gap" is a contract surface with zero test coverage. To detect:

- For each MCP tool in `tools/manifest.json` (52 total), grep test files for the tool's name (exact match, e.g., `gate_check`, `meta_state_report`). Missing = gap.
- For each schema in `schemas/*.schema.json`, grep test files for that schema's filename. Missing = gap.
- For each gate pattern in `tools/learning-loop-mcp/core/gate-logic.js`, grep test files for the pattern. Missing = gap.
- For each entry kind (finding | change-log | rule | loop-design), grep test files for tests that exercise that kind. Missing = gap.
- For each error path (e.g., what does `meta_state_report` do with an invalid `severity`?), grep for tests that exercise the rejection. Missing = gap.

#### C4. Anti-MCP Phrase Test

A test prompt (for bucket D) contains an anti-MCP phrase if any of:

- *"cites ... for the [reason] path"* — forces the agent to read a file to "understand the reason"
- *"internalize the [source] reference"* — forces content understanding
- *"pointing at the relevant [code/content]"* — forces the agent to find/understand content
- *"mechanism_check: true"* (in a prompt that doesn't already provide the file path) — forces the agent to verify the mechanism exists
- Any other phrase that requires the agent to understand file content before calling a tool

The L2 probe (`cold-session-discoverability.test.cjs#probeL2Gap`) is the reference prompt: it contains zero such phrases, only tool-call instructions and output spec.

#### C5. Prompt Budget Formula

For each bucket-D test:

```
wall_clock_estimate = (expected_file_reads * 12s)
                    + (expected_mcp_calls * 8s)
                    + (expected_reasoning_blocks * 6s)
                    + (toolsearch_overhead * 5s)
                    + (other_io * 3s)
timeout_utilization = wall_clock_estimate / test_timeout_seconds
```

A test is "at-risk" if `timeout_utilization > 0.7`. The cold-session test 1 had `expected_file_reads=6`, so `wall_clock_estimate ≈ 72s + ...` against a 60s timeout = >100% utilization.

Per-op latencies are derived from the test 1 trace (epoch ms timestamps):

- File read with reasoning: 10-15s (avg 12s)
- MCP call (single tool): 7-9s (avg 8s) — includes ToolSearch for deferred tools
- Reasoning block: 5-20s (avg 6s for short, 15s for long)
- ToolSearch overhead: 5s

These are estimates. The scout may refine them with additional traces.

### Layer 2 — 4 Deliverable Sections

#### Deliverable 1: Test Inventory

**Method**: For each `__tests__/` directory in the project, list:

- File path
- Last modified (`git log -1 --format=%ci`)
- Test count (`grep -c "^test\|^it("`)
- Bucket (from C1)
- Dangling flag (from C2)
- Gap flag (from C3, inverse)
- Prompt budget (from C5, only for bucket D)

**Output schema** (markdown table):

| File | Last mod | Tests | Bucket | Dangling | Gap | Prompt budget |
|------|----------|-------|--------|----------|-----|---------------|
| `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` | 2026-06-08 | 12 | A | no | no | n/a |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | 2026-06-08 | 5 | D | no | no | test 1: 183% (FAIL); tests 2/3/4/5: <50% |
| ... | ... | ... | ... | ... | ... | ... |

**Example candidate-finding payload**: see Layer 3.

#### Deliverable 2: MCP-First Audit

**Method**: For each test file, classify into bucket A/B/C/D per C1. Bucket C is the gap.

**Output schema** (markdown table):

| Bucket | Count | % of total | Files |
|--------|-------|-----------|-------|
| A. MCP-only | (count) | (pct) | (list) |
| B. MCP + setup/teardown I/O | (count) | (pct) | (list) |
| C. Bypass-MCP | (count) | (pct) | (list — this is the gap) |
| D. Droid exec | (count) | (pct) | (list) |

**Expected outcome**: Bucket C is 0 (or close to 0). Any non-zero count is a candidate finding.

#### Deliverable 3: Dangling / Obsolete Detection

**Method**: For each test file, run the 5 dangling-pattern checks (C2). Each match is a row in the report.

**Output schema** (markdown table):

| File | Pattern | Match (line:code) | Suggested fix |
|------|---------|-------------------|---------------|
| `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` | D1. schema-drift | line 47: `evidence: { code_ref: ... }` (nested form) | Migrate to top-level `evidence_code_ref` |
| ... | ... | ... | ... |

#### Deliverable 4: Gap Analysis (Coverage)

**Method**: For each contract surface (C3), compute (covered_count / total_count). Surface with 0% coverage = gap.

**Output schema** (markdown table):

| Surface | Total | Covered | % | Missing tools/patterns |
|---------|-------|---------|---|------------------------|
| MCP tools | 52 | (count) | (pct) | (list) |
| Schemas | (count) | (count) | (pct) | (list) |
| Gate patterns | (count) | (count) | (pct) | (list) |
| Entry kinds | 4 | (count) | (pct) | (list) |
| Error paths | (count) | (count) | (pct) | (list) |

#### Deliverable 5: Prompt Budget Audit

**Method**: For each bucket-D test, estimate `wall_clock_estimate` and `timeout_utilization` per C5. Tests with `timeout_utilization > 0.7` are at-risk.

**Output schema** (markdown table):

| File | Test | Expected file reads | Wall clock est | Timeout | Utilization | Risk |
|------|------|---------------------|----------------|---------|-------------|------|
| `cold-session-discoverability.test.cjs` | test 1 | 6 | 110s | 60s | 183% | CRITICAL |
| `cold-session-discoverability.test.cjs` | tests 2-5 | 0 | 25s | 60-90s | 28-42% | low |
| ... | ... | ... | ... | ... | ... | ... |

### Layer 3 — Payload Cookbook

Actionable `meta_state_report` payloads for each finding type. Scout copies, fills in the variable fields, and files.

#### Payload: Bucket-C (Bypass-MCP)

```yaml
category: loop-anti-pattern
severity: warning
affected_system: mcp-tools
subtype: test-bypasses-mcp
description: |
  Test file <PATH> uses direct file I/O (e.g., `writeEntry`, `readRegistry` from
  `core/meta-state.js`) for test logic when an MCP tool exists for the same
  operation. This bypasses the canonical MCP surface and contradicts the loop's
  philosophy. Detected by test-codebase-scout per C1.bucket-C.
evidence_code_ref: <PATH>:<LINE>
mechanism_check: true
session_id: test-codebase-scout-<DATE>
```

#### Payload: Dangling D1 (Schema-Drift)

```yaml
category: schema-drift
severity: warning
affected_system: record-validation
subtype: test-asserts-removed-field
description: |
  Test <PATH> asserts on schema field <FIELD> that was removed in refactor <REF>
  (meta-<ID>). After the dual-field unification at meta-260607T0008Z, only the
  top-level `evidence_code_ref` form is canonical. Migrate the assertion.
evidence_code_ref: <PATH>:<LINE>
mechanism_check: true
```

#### Payload: Dangling D2 (Resolved-Finding Dependency)

```yaml
category: gate-logic-bug
severity: warning
affected_system: gate-logic
subtype: test-stale-gate-dependency
description: |
  Test <PATH> gates on meta-state finding <ID> being in status='active', but the
  finding is now <CURRENT_STATUS> (auto-resolved at <DATE>). The test passes
  by accident (status check is permissive) or fails intermittently. The test
  should either reset the finding or remove the dependency.
evidence_code_ref: <PATH>:<LINE>
mechanism_check: true
```

#### Payload: Dangling D3 (Removed-Tool Reference)

```yaml
category: mcp-tool-missing
severity: warning
affected_system: mcp-tools
subtype: test-imports-removed-module
description: |
  Test <PATH> imports <MODULE_PATH> or calls tool <TOOL_NAME>, but the module
  is no longer in tools/manifest.json. The import fails or the call returns
  TOOL_UNAVAILABLE. Either the test is dead or the tool was removed without
  test cleanup.
evidence_code_ref: <PATH>:<LINE>
mechanism_check: true
```

#### Payload: Gap (Missing Test Coverage)

```yaml
category: mcp-tool-missing
severity: warning
affected_system: mcp-tools
subtype: test-coverage-gap
description: |
  Contract surface <SURFACE> (<NAME>) has 0 test coverage. The surface is
  defined at <CODE_REF> but no test file references it. Adding 1 happy-path
  test + 1 error-path test would close the gap.
evidence_code_ref: <CODE_REF>
mechanism_check: true
```

#### Payload: Anti-MCP Phrase (Bucket-D Test Design)

```yaml
category: loop-anti-pattern
severity: warning
affected_system: test-suite
subtype: test-prompt-defeats-mcp-abstraction
description: |
  Test <PATH> prompt contains anti-MCP phrases: <LIST_OF_PHRASES>. The phrases
  force the agent to read files to understand content before calling a tool
  whose purpose is to abstract content. Rewriting the prompt as a pure
  <N>-MCP-call chain with all paths provided upfront removes the file-read
  overhead and fits the test timeout. Pattern reference: meta-260608T1522Z
  (cold-session test 1) and meta-260608T1618Z (corrected diagnosis).
evidence_code_ref: <PATH>:<LINE>
mechanism_check: true
session_id: test-codebase-scout-<DATE>
```

#### Payload: Prompt Budget At-Risk (Bucket-D Timeout Risk)

```yaml
category: loop-anti-pattern
severity: warning
affected_system: test-suite
subtype: test-prompt-budget-overrun
description: |
  Test <PATH>:<TEST> has timeout_utilization = <PCT>% (wall_clock_estimate=<S>s,
  timeout=<S>s). The test prompt forces <N> file reads + <M> MCP calls + <K>
  reasoning blocks. Either reduce the prompt's file-read requirements (apply
  C4 anti-MCP phrase check) or increase the timeout. Pattern reference:
  meta-260608T1522Z (test 1 hang).
evidence_code_ref: <PATH>:<LINE>
mechanism_check: true
```

### Execution Protocol

1. **Pre-flight**: Run `loop_describe({ tier: "summary" })` to confirm the loop's surface; run `meta_state_list({ status: "active" })` to confirm no scout is already running.
2. **Phase 1 — Inventory**: For each `__tests__/` directory, collect file-level metadata. Output: a single table (Deliverable 1).
3. **Phase 2 — Bucket classification**: For each file, classify into A/B/C/D (C1). Output: bucket distribution table (Deliverable 2). File all bucket-C findings via `meta_state_report` using the cookbook payload.
4. **Phase 3 — Dangling detection**: For each file, run the 5 dangling-pattern checks (C2). Output: dangling matches table (Deliverable 3). File all findings.
5. **Phase 4 — Gap analysis**: For each contract surface (C3), compute coverage. Output: gap table (Deliverable 4). File all findings.
6. **Phase 5 — Prompt budget**: For each bucket-D test, estimate budget (C5). Output: budget table (Deliverable 5). File all at-risk findings.
7. **Closeout**: Run `loop_describe({ tier: "summary" })` again to confirm the scout's findings are visible; run `git status` to confirm no test files were modified.

**Execution shape**: Single agent, sequential phases. Each phase files its findings before moving to the next. No parallel sub-agents (per user choice 2026-06-08).

**Estimated duration**: 4-6 hours. Phases 1-2 are quick (1 hour combined). Phase 3 is medium (1-2 hours). Phase 4 is medium (1-2 hours). Phase 5 is fast (30 min).

**Estimated findings count**:

- Bucket C: 0-3 (we've been disciplined; should be near-zero)
- Dangling: 5-15 (some test files have been around for weeks; likely some have stale patterns)
- Gap: 10-30 (52 MCP tools minus those with tests; new tools added without test coverage)
- Anti-MCP phrase: 1-3 (the cold-session test 1 is the known instance; others may exist)
- Prompt budget at-risk: 1-3 (the cold-session test 1 is the known instance)

Total: ~20-50 candidate findings. The future plan session will triage and prioritize.

## Implementation Considerations and Risks

**Risks**:

- **False positives in bucket classification** — A test that uses `readFileSync` of a YAML fixture may look like bucket C but is actually bucket B. The scout must distinguish "I/O in setup" from "I/O in test logic." Mitigation: the bucket-C payload template requires the scout to cite the specific line where the I/O happens in test logic, not setup.
- **False negatives in dangling detection** — Pattern D5 (stale TOLERANCES) is hard to detect statically; the scout may need to run the test and observe failure. Mitigation: Phase 3 includes a "test execution check" sub-step that runs the test and reports pass/fail. If a test passes only when run in isolation, it has a hidden dependency.
- **False positives in gap analysis** — A tool may be covered by an integration test that uses the tool indirectly (via a workflow). The scout's "0 references" count is a necessary but not sufficient signal of a gap. Mitigation: the gap-finding payload includes a "suggested test shape" line so the future plan can validate the gap is real.
- **Prompt budget latencies drift** — The latencies in C5 are derived from one trace. The scout should re-measure with 2-3 traces for confidence. Mitigation: Phase 5 runs the L2 probe 3 times to get a more stable latency baseline.

**Open questions** (for the future plan session):

- Should bucket-C findings be auto-filed, or should the scout present them for human review first? (Default: auto-file with cookbook payloads, since the cookbook's specificity makes false positives unlikely.)
- Should gap findings be batched per surface (one finding covering N missing tools), or per missing tool (N findings)? (Default: per surface, to avoid registry bloat.)
- Should the scout's output be a markdown report, or a structured JSON file? (Default: markdown report at `docs/journals/<DATE>-test-scout-report.md` plus a structured JSON at `tools/learning-loop-mcp/__tests__/fixtures/test-scout-output.json` for downstream tooling.)

## Success Metrics and Validation Criteria

- **Coverage of deliverables**: All 4 deliverables + prompt budget audit are present in the report. Verified by counting sections.
- **Actionable findings**: Every candidate finding in the report has a cookbook payload (Layer 3) populated with at least `category`, `severity`, `evidence_code_ref`, and a description sketch. Verified by parsing the report.
- **Zero test file modifications**: After the scout runs, `git status --porcelain` shows no modifications under `__tests__/`. Verified by running git status.
- **Findings are visible in the registry**: After the scout runs, `meta_state_list({ status: "reported" })` includes all candidate findings. Verified by running meta_state_list.
- **Cold-session test 1 is correctly flagged**: The scout's prompt budget audit lists `cold-session-discoverability.test.cjs#test 1` with `timeout_utilization > 100%` and `bucket-D + anti-MCP-phrase + prompt-budget-overrun` flags. Verified by reading the report.
- **Bucket C is 0 or near-0**: The MCP-first audit shows 0 bucket-C tests. If non-zero, each instance is a candidate finding. Verified by reading the report.

## Next Steps and Dependencies

**Immediate (this session)**: File this brainstorm report at `plans/reports/brainstorm-20260608-test-codebase-scout.md`. Log a `meta_state_log_change` to record the report's creation.

**Future plan session (separate)**: Use this report to create a `plans/<DATE>-test-codebase-scout/plan.md` that implements the scout per the execution protocol. The plan should:

- TDD-first: write the scout's output schema (Layer 1-3 of this report) as a JSON-schema fixture, then write the scout that conforms to it
- Use the existing `meta_state_report` MCP tool for filing (no direct I/O)
- Read-only: do not modify any test files
- Idempotent: re-running the scout produces the same candidate findings (within reason)

**Dependency on prior work**:

- `meta-260608T1522Z` and `meta-260608T1618Z` (this session's findings) provide the reference case for the anti-MCP phrase and prompt budget criteria.
- `meta-260608T1410Z` provides the L2 probe pattern the cold-session test uses.
- `meta-260607T0008Z` (dual-field schema unification) provides the D1 pattern reference for dangling schema-drift.

**No blocking dependencies**. The scout can be planned and executed independently of any other in-flight work.

## Notes for the Future Plan Session

- This report's Layer 1 (criteria glossary) is the most important artifact. The criteria must be stable before the scout runs. If the criteria need refinement, do it in the plan session, not in the scout's first run.
- The cookbook payloads (Layer 3) are intentionally minimal. The scout session adds evidence (e.g., specific line numbers, specific missing tools) when filing.
- The execution protocol's phase ordering matters: Phase 2 (bucket classification) is needed for Phase 3 (dangling detection) because bucket C tests are inherently anti-pattern and shouldn't be flagged as "dangling." Phase 4 (gap analysis) is independent of phases 1-3. Phase 5 (prompt budget) only operates on bucket-D tests, so it depends on Phase 2's classification.
- If the scout's findings exceed 50, the future plan session should batch them into groups (e.g., "fix all bucket-C first", "fix all dangling second", "address gaps in priority order") rather than tackling them one by one.
