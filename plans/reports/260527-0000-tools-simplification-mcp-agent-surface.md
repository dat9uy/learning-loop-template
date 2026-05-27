---
title: "Tools/ Simplification & MCP Agent Surface Design"
description: >-
  Brainstorm report: simplify 180-file tools/ directory, eliminate
  constraint-gate duplication, refactor standalone CLI tools for MCP safety,
  and design an agent-friendly MCP surface with semantic grouping.
status: agreed
priority: P1
tags: [brainstorm, technical-debt, mcp, agent-experience, tools]
created: "2026-05-27T00:00:00Z"
createdBy: "ck:brainstorm"
---

# Tools/ Simplification & MCP Agent Surface Design

## Problem Statement

`tools/` has grown to ~180 files across 13 subdirectories. Two critical problems exist:

1. **Dead-code duplication:** `tools/constraint-gate/` (80+ files) duplicates `tools/coordination-gate/` almost identically — same 33-tool manifest, same `server.js`, same core gate logic. The unification plan (260524) created `coordination-gate/core/` as the single source of truth, but `constraint-gate/` was never deleted.

2. **Standalone CLI tools are MCP-unsafe:** `extract-index.js`, `verify-claim.js`, `generate-capabilities.js`, etc. call `process.exit()` at module level. When imported by MCP tool wrappers, they kill the entire server. Red-team finding R1 (plan 260521) flagged this as Critical.

3. **Flat tool list is un-navigable for agents:** 33 MCP tools with names like `workflow_self_improvement`, `update_observation`, `workflow_runtime_probe` have no semantic grouping, ordering hints, or lifecycle context. Agents discover them as an undifferentiated flat list.

## Requirements (Exact)

| # | Requirement | Acceptance Criteria |
|---|-------------|---------------------|
| 1 | Delete `tools/constraint-gate/` entirely | `ls tools/constraint-gate/` returns ENOENT; no package.json scripts reference it |
| 2 | Refactor all standalone tools to pure functions | Each `.js` exports a `run*(root, opts)` function; CLI `main()` only runs under `if (isMain)`; zero `process.exit()` outside `main()` |
| 3 | Namespace MCP tool names | All 33 tools have `{domain}_` prefix: `gate_*`, `record_*`, `workflow_*`, `index_*`, `capability_*` |
| 4 | Expand `tools/lib/` into shared kernel | `resolve-root.js`, `gate-logging.js`, YAML wrappers, path validation live in `tools/lib/`; imported by both core and standalone tools |
| 5 | Create agent-facing MCP surface manifest | `agent-manifest.json` groups tools by semantic domain with ordering hints, typical chains, and cache TTL |
| 6 | Update `.factory/skills/` documentation | SKILL.md contains quickstart recipes for common agent workflows (product build, record CRUD, index verification) |

## Out of Scope

- Rewriting gate logic behavior (refactor-only, no logic changes)
- Adding new MCP tools beyond the existing 33
- Changing record YAML schemas or directory layout
- Frontend/UI changes
- CI/CD pipeline changes beyond package.json scripts

## Evaluated Approaches

### Approach A: Gradual Deprecation (Conservative)

Keep `constraint-gate/` for 1 sprint, redirect `gate:server` to `coordination-gate`, then delete after verification.

| Aspect | Assessment |
|--------|------------|
| Pros | Zero risk of breaking active bindings; rollback is `git checkout` |
| Cons | Leaves dead code in repo; agents may still reference old paths; prolongs confusion |
| Effort | Low (1-2h) |
| Risk | Low |

**Verdict:** Rejected. User confirmed "breaking changes OK" and "pre-production." Gradual deprecation is overcautious.

### Approach B: Hard Delete + Immediate Refactor (Aggressive)

Delete `constraint-gate/` in one commit, refactor all standalone tools in the same PR, rename all MCP tools, and generate the agent manifest.

| Aspect | Assessment |
|--------|------------|
| Pros | Clean slate; no lingering confusion; all agents use one surface |
| Cons | Large blast radius; if a tool rename breaks an active agent session, recovery requires restart |
| Effort | High (6-8h) |
| Risk | Medium-High |

**Verdict:** Rejected. Too large for a single changeset. Risk of merge conflicts and review fatigue.

### Approach C: Phased Rollout (Recommended)

5 sequential phases, each independently reviewable and testable.

| Phase | Deliverable | Files Touched | Est. Effort |
|-------|-------------|---------------|-------------|
| 1 | Refactor standalone tools to pure functions | `tools/validate-records/`, `tools/extract-index/`, `tools/generate-capabilities/`, `tools/claim-verification/`, `tools/list-probes/`, `tools/list-verified/`, `tools/search-index/`, `tools/check-budget/`, `tools/generate-docs/` | 3h |
| 2 | Delete `constraint-gate/` + redirect scripts | `tools/constraint-gate/` (delete), `package.json`, `.factory/skills/constraint-gate/SKILL.md` | 1h |
| 3 | Expand `tools/lib/` shared kernel | `tools/lib/` (new files), `tools/coordination-gate/core/` (refactor imports) | 2h |
| 4 | Namespace MCP tool names | `tools/coordination-gate/mcp/tools/*.js`, `manifest.json` | 2h |
| 5 | Agent manifest + skill docs | `tools/coordination-gate/mcp/agent-manifest.json`, `.factory/skills/coordination-gate/SKILL.md` | 1h |

| Aspect | Assessment |
|--------|------------|
| Pros | Each phase is reviewable in isolation; tests pass after each phase; rollback is per-phase |
| Cons | Slightly longer calendar time; requires discipline to not "just do it all at once" |
| Effort | Medium (9h total) |
| Risk | Low per-phase, Medium aggregate |

**Verdict:** **Accepted.** Balances safety with user confirmed "breaking changes OK" posture.

## Final Recommended Solution: Phased Rollout (Approach C)

### Phase 1: Refactor Standalone Tools to Pure Functions

**Goal:** Every standalone CLI script becomes a library module that MCP tool wrappers can safely `import`.

**Pattern:**

```javascript
// tools/extract-index/extract-index.js
export function runExtraction(root, opts) { /* pure logic, no side effects */ }

export function main() {
  const args = parseArgs(process.argv);
  const root = args.root || scriptRoot;
  const result = runExtraction(root, args);
  // CLI I/O only here
  console.log(`Processed ${result.stats.filesProcessed} files`);
  if (result.errors.length) {
    for (const err of result.errors) console.error(`Error: ${err}`);
    process.exit(1);
  }
}

const isMain = import.meta.url.startsWith("file:") && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
```

**Files to refactor:**
- `tools/validate-records/validate-records.js`
- `tools/extract-index/extract-index.js`
- `tools/generate-capabilities/generate-capabilities.js`
- `tools/claim-verification/verify-claim.js`
- `tools/list-probes/list-probes.js`
- `tools/list-verified/list-verified.js`
- `tools/search-index/search-index.js`
- `tools/check-budget/check-budget.js`
- `tools/generate-docs/generate-docs.js`

**Critical rule:** `process.exit()` may ONLY appear inside `main()`, never at module level, never in exported functions.

### Phase 2: Delete `constraint-gate/` + Redirect Scripts

**Goal:** Eliminate 80+ duplicate files.

**Actions:**
1. Update `package.json`: `"gate:server": "node tools/coordination-gate/mcp/server.js"`
2. Delete `tools/constraint-gate/` entirely
3. Update `.factory/skills/constraint-gate/SKILL.md` to point to `coordination-gate`
4. Update any `.claude/` hooks that reference `constraint-gate` paths

**Verification:** `pnpm test` must pass with zero constraint-gate references.

### Phase 3: Expand `tools/lib/` Shared Kernel

**Goal:** Extract reusable utilities from `coordination-gate/core/` into a language-agnostic shared library.

**New files in `tools/lib/`:**

| File | Source | Consumers |
|------|--------|-----------|
| `resolve-root.js` | `coordination-gate/core/resolve-root.js` | All tools |
| `gate-logging.js` | `coordination-gate/core/gate-logging.js` | Gate tools, MCP server |
| `yaml-parse-wrapper.js` | `validate-records/yaml-parse-wrapper.js` | All YAML consumers |
| `frontmatter-splitter.js` | Already exists | `extract-index`, `generate-docs` |
| `path-validator.js` | New — centralized path traversal guard | All file-writing tools |

**Rule:** After this phase, `coordination-gate/core/` imports from `tools/lib/` for shared logic. Standalone tools also import from `tools/lib/`. No cross-imports between `coordination-gate/` and standalone tool directories except through `tools/lib/`.

### Phase 4: Namespace MCP Tool Names

**Goal:** Make 33 tools scannable and enable future server splitting.

**Mapping:**

| Old Name | New Name |
|----------|----------|
| `check_gate` | `gate_check` |
| `mark_preflight_complete` | `gate_mark_preflight` |
| `create_decision_record` | `record_create_decision` |
| `update_decision_record` | `record_update_decision` |
| `create_experiment_record` | `record_create_experiment` |
| `update_experiment_record` | `record_update_experiment` |
| `create_risk_record` | `record_create_risk` |
| `update_risk_record` | `record_update_risk` |
| `record_observation` | `record_create_observation` |
| `update_observation` | `record_update_observation` |
| `delete_record` | `record_delete` |
| `validate_records` | `index_validate` |
| `extract_index_entries` | `index_extract` |
| `search_index_entries` | `index_search` |
| `update_claim_verification` | `index_update_claim` |
| `generate_capability_records` | `capability_generate` |
| `list_runtime_probes` | `capability_list_probes` |
| `workflow_intake_orient` | `workflow_intake_orient` |
| `workflow_intake_plan` | `workflow_intake_plan` |
| `workflow_classify_prompt` | `workflow_classify_prompt` |
| ... (remaining workflow tools keep `workflow_` prefix) | ... |

**Why no aliases:** User confirmed no backward-compat requirement. Aliases create maintenance debt.

### Phase 5: Agent Manifest + Skill Documentation

**Goal:** Give agents workflows, not just a flat tool list.

**Deliverable 1:** `tools/coordination-gate/mcp/agent-manifest.json`

```json
{
  "version": "1.0.0",
  "groups": {
    "gate": {
      "description": "Safety checks — call BEFORE any write operation",
      "tools": ["gate_check", "gate_mark_preflight"],
      "ordering": "mandatory-first",
      "cache_ttl": 0
    },
    "record_crud": {
      "description": "Create/update decision, experiment, risk, observation records",
      "tools": [
        "record_create_decision", "record_update_decision",
        "record_create_experiment", "record_update_experiment",
        "record_create_risk", "record_update_risk",
        "record_create_observation", "record_update_observation",
        "record_delete"
      ],
      "ordering": "any",
      "requires_observation": true
    },
    "workflow": {
      "description": "Learning-loop workflow orchestration",
      "tools": [
        "workflow_intake_orient", "workflow_intake_plan",
        "workflow_classify_prompt", "workflow_prepare_runtime_request",
        "workflow_convert_evidence", "workflow_verify_evidence",
        "workflow_generate_prompt", "workflow_external_decision",
        "workflow_self_improvement", "workflow_intentional_skip",
        "workflow_report_phase_status", "workflow_product_build",
        "workflow_runtime_probe"
      ],
      "ordering": "linear",
      "typical_chain": [
        "workflow_intake_orient",
        "workflow_intake_plan",
        "workflow_product_build",
        "workflow_runtime_probe"
      ]
    },
    "index": {
      "description": "Index extraction, search, and validation",
      "tools": ["index_extract", "index_search", "index_validate", "index_update_claim"],
      "ordering": "extract-before-search",
      "typical_chain": ["index_validate", "index_extract", "index_search"]
    },
    "capability": {
      "description": "Capability map generation and probe listing",
      "tools": ["capability_generate", "capability_list_probes"],
      "ordering": "any"
    }
  },
  "quickstart": {
    "product_build": [
      { "tool": "gate_mark_preflight", "surface": "product" },
      { "tool": "gate_check", "file_path": "product/**" },
      { "tool": "workflow_intake_orient", "input": "plan.md" },
      { "tool": "workflow_intake_plan", "input": "$workflow_intake_orient" },
      { "tool": "record_create_decision", "surface": "product" },
      { "tool": "workflow_product_build" },
      { "tool": "index_validate" },
      { "tool": "index_extract" }
    ],
    "record_verification": [
      { "tool": "index_validate" },
      { "tool": "index_extract" },
      { "tool": "index_search", "filters": { "status": "verified" } }
    ]
  }
}
```

**Deliverable 2:** `.factory/skills/coordination-gate/SKILL.md`

Contains quickstart recipes referencing the namespaced tools and typical chains from the manifest.

## Implementation Considerations

### Testing Strategy

- After Phase 1: Run `pnpm test` — all existing tests must pass; no behavioral changes
- After Phase 2: Run `pnpm test` + grep for `constraint-gate` — must return zero matches
- After Phase 3: Run `pnpm test` — verify no import cycles or broken paths
- After Phase 4: Run MCP integration tests — all 33 tools respond to new names
- After Phase 5: Manual agent session test — verify agent can follow `product_build` quickstart

### Rollback Per Phase

| Phase | Rollback |
|-------|----------|
| 1 | `git checkout -- tools/validate-records/ tools/extract-index/ ...` |
| 2 | `git checkout -- tools/constraint-gate/ package.json` |
| 3 | `git checkout -- tools/lib/ tools/coordination-gate/core/` |
| 4 | `git checkout -- tools/coordination-gate/mcp/tools/` |
| 5 | `git checkout -- tools/coordination-gate/mcp/agent-manifest.json .factory/skills/` |

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| `process.exit()` missed in refactor | Critical | Lint rule: `no-process-exit` outside `main()` function; code review checklist |
| Import path breaks after `constraint-gate/` deletion | Medium | Search-replace audit: `rg "constraint-gate"` must return zero before commit |
| MCP client caches old tool names | Medium | Restart all agent sessions after Phase 4; document in SKILL.md |
| `tools/lib/` creates circular imports | Medium | Import graph validation: `coordination-gate/core/` -> `tools/lib/` only; no reverse |
| Agent manifest drifts from actual tools | Low | Generate manifest from `manifest.json` + tool descriptions in CI |

## Success Metrics

| Metric | Target |
|--------|--------|
| `tools/` file count | < 100 (from ~180) |
| Duplicate code (constraint-gate) | 0 files |
| `process.exit()` in exported functions | 0 occurrences |
| MCP tool names with domain prefix | 33 / 33 |
| Agent quickstart recipes documented | 2+ (product_build, record_verification) |
| `pnpm test` pass rate | 100% after each phase |

## Next Steps

1. Create plan via `/ck:plan --tdd` (tests-first refactor preserves current behavior)
2. Execute Phase 1-5 sequentially
3. Run `/ck:journal` after completion

## Pre-existing Issues Discovered (Session 260527)

During the fix session for write-gate simplification and `findProjectRoot` path correction, the following pre-existing failures were confirmed in `tools/constraint-gate/` — reinforcing the case for Phase 2 deletion.

### `constraint-gate/` Test Failures (dead code)

| Test File | Failures | Root Cause |
|-----------|----------|------------|
| `tools/constraint-gate/tools/generate-capabilities-tool.test.js` | 3 | Tests run against real repo data; tightened source-ref validation rejects old generated records |
| `tools/constraint-gate/tools/update-claim-tool.test.js` | 2 | `verify-claim.js` now validates `claim_refs` and `proves` fields — old test fixtures lack them; error message changed from "Claim not found" to full validation dump |
| `tools/constraint-gate/tools/validate-records-tool.test.js` | 1 | `validate-records` now catches schema violations that existed in real repo records but weren't checked when constraint-gate tests were written |

**Why these failures matter:**
- `constraint-gate/` duplicates `coordination-gate/` 1:1 (same 33 tools, same server.js, same manifest)
- Its tests are tightly coupled to old repo state and outdated validation rules
- Fixing them is wasted effort — the directory should be deleted per Phase 2
- The failures create noise that obscures real regressions

**Action for next session:** Execute Phase 2 (delete `constraint-gate/` + redirect `gate:server` script) before any further gate logic changes.

## Unresolved Questions

None. All requirements locked during Discovery Phase.
