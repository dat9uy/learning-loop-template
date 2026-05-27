---
title: "Red-Team Review: Tools/ Simplification & MCP Agent Surface"
description: >-
  Adversarial review of plan. 5 critical findings, 4 medium, 3 low.
  Top issue: hook import path fragility during Phase 3 shared-kernel extraction.
status: review
priority: P1
created: "2026-05-27T00:45:00Z"
createdBy: "red-team"
---

# Red-Team Review: Tools/ Simplification & MCP Agent Surface

## Executive Summary

The plan is sound in principle but has **5 critical gaps** around hook path fragility, missing dependency-phase ordering, test-count CI breakage, stale gate-utils.cjs references, and an unverified "zero old-name references" claim. The biggest risk is Phase 3 breaking both `.claude/` and `.factory/` hooks by changing import depths — this would silently disable gating across both agent surfaces.

---

## Critical Findings (Must Fix Before Implementation)

### C1: Hook Import Path Fragility in Phase 3

**Finding:** `.claude/coordination/hooks/bash-coordination-gate.cjs` and `.factory/coordination/hooks/bash-coordination-gate.cjs` are thin wrappers that `execFileSync` universal scripts in `tools/coordination-gate/hooks/`. The plan says Phase 3 will move `resolve-root.js` and `gate-logging.js` from `core/` to `tools/lib/`, then delete them from `core/`.

**Attack:** If `tools/coordination-gate/hooks/bash-gate.js` (the universal script) imports from `../core/resolve-root.js`, and `core/resolve-root.js` is deleted in Phase 3, all hooks break on the next invocation. Both Claude Code and Droid CLI lose gating simultaneously.

**Evidence:** The universal hooks were created in plan `260524-unified-coordination-gate` Phase 3. Their import paths were tested then, but Phase 3 of *this* plan changes those paths again without mentioning hook re-verification.

**Fix:** Add an explicit step to Phase 3: "After deleting files from `core/`, run `node .claude/coordination/hooks/bash-coordination-gate.cjs` and `node .factory/coordination/hooks/bash-coordination-gate.cjs` with test inputs to verify they still resolve."

---

### C2: Missing Dependency Edge — Phase 2 Must Come Before Phase 3

**Finding:** The plan's Dependencies section says:
- Phase 1 before Phase 3
- Phase 2 before Phase 4
- Phase 4 before Phase 5

But Phase 3 modifies `coordination-gate/core/` imports. If Phase 2 hasn't deleted `constraint-gate/` yet, there's a risk of accidentally editing the wrong directory or having stale imports in `constraint-gate/` tests that contaminate the workspace.

**Attack:** A developer running Phase 3 sees `rg "resolve-root" tools/` and gets matches in both `coordination-gate/core/` and `constraint-gate/`. They might fix the wrong file, or `constraint-gate/` tests might still pass (using old paths) and create false confidence.

**Fix:** Add `Phase 2 before Phase 3` to Dependencies. Delete `constraint-gate/` first so there's only one source of truth to modify.

---

### C3: Test Count Assertions Will Break in Phase 2

**Finding:** Plan `260524-unified-coordination-gate` Phase 5 notes: "Original `tools/constraint-gate/` tests pass: 183/184 (1 pre-existing failure: expects 31 tools but 32 registered)." The `260522-2100-mcp-record-crud-gate-simplification` plan added the 32nd tool (`delete_record`).

**Attack:** If `package.json` test script counts total tests or asserts test counts, deleting 82 files (including 16 test files from `constraint-gate/`) will change the count. Any CI or test script that asserts "N tests ran" will fail.

**Evidence:** In the current codebase, `tools/constraint-gate/server.test.js` likely has an assertion like `assert.strictEqual(tools.length, 33)` or similar. After deletion, if `pnpm test` is a glob that included `tools/constraint-gate/**/*.test.js`, the total test count drops.

**Fix:** Before Phase 2, audit `package.json` test scripts and any test-count assertions. Document expected test count change: from ~230 tests to ~150 tests. If CI enforces minimum test counts, update the threshold.

---

### C4: `gate-utils.cjs` Still References `constraint-gate/`

**Finding:** `.claude/coordination/hooks/lib/gate-utils.cjs` was preserved in plan `260524-unified-coordination-gate` as a backward-compat adapter. The current plan says to delete `tools/constraint-gate/` entirely and update skill files, but never mentions `gate-utils.cjs`.

**Attack:** `gate-utils.cjs` may contain `require("../../../tools/constraint-gate/...")` paths. After Phase 2, these paths are dead. Hooks that rely on `gate-utils.cjs` will throw `MODULE_NOT_FOUND`.

**Evidence:** File path: `.claude/coordination/hooks/lib/gate-utils.cjs`. It was supposed to be migrated to import from `tools/coordination-gate/core/` in Phase 3 of the unified gate plan, but the completion notes say only "Preserved as CJS adapter" with a deprecation comment.

**Fix:** In Phase 2, add a step: "Read `.claude/coordination/hooks/lib/gate-utils.cjs` and `.factory/coordination/hooks/lib/gate-utils.cjs` (if it exists). If they reference `constraint-gate/`, update to `coordination-gate/core/` or delete if fully superseded by universal hooks."

---

### C5: "Zero Old-Name References" Claim Is Unverifiable

**Finding:** Phase 4 has a success criterion: `rg "check_gate|mark_preflight_complete|create_decision_record" tools/coordination-gate/mcp/` returns zero. But tool names might appear in:
- `docs/journals/` (archived but still in repo)
- `records/*/decisions/` (YAML files referencing tool names)
- `CLAUDE.md` (outside `tools/`)
- `.mcp.json` (outside `tools/`)
- `.claude/coordination/workflows.json` (workflow definitions referencing tools)
- Comments or strings inside tool files that describe *other* tools (e.g., `workflow-product-build-tool.js` might reference `check_gate` in its description)

**Attack:** `rg` with the shown pattern won't catch: dynamic tool name construction (`toolName = "workflow_" + suffix`), JSON-encoded tool names in workflow configs, or human-written docs.

**Fix:** Expand the verification step to search the entire repo (excluding `.git/`, `node_modules/`, archived journal entries). Use a script that compares `manifest.json` old names against a grep of the repo, not just `tools/coordination-gate/mcp/`.

---

## Medium Findings (Should Fix, Can Mitigate During Implementation)

### M1: Phase 1 Effort Underestimated for `validate-records.js`

**Finding:** The plan allocates 45 min for `validate-records.js` refactor. This tool has ~10 helper modules (`record-loader.js`, `schema-loader.js`, `claim-verification-rules.js`, `derived-claim-assurance.js`, `experiment-proof-match.js`, `filename-convention-validation.js`, `yaml-parse-wrapper.js`, `record-validation-rules.js`). Some of these helpers may also call `process.exit()` or rely on global `process.cwd()`.

**Mitigation:** Add a pre-refactor audit step to Phase 1: `rg "process\.exit" tools/validate-records/` and `rg "process\.cwd" tools/validate-records/` before estimating effort. If helpers have exits, each helper needs the same `run*()` treatment, adding 15-30 min per helper.

---

### M2: No Rollback Plan for Phase 4 (Tool Rename)

**Finding:** Phase 2 has a rollback (`git checkout -- tools/constraint-gate/ package.json`). Phase 4 has no equivalent. If an MCP client is actively connected during Phase 4 and caches old tool names, the client session breaks.

**Mitigation:** Document in Phase 4: "Rollback: `git checkout -- tools/coordination-gate/mcp/manifest.json tools/coordination-gate/mcp/server.js tools/coordination-gate/mcp/tools/`. Restart MCP server. Agents must reload their tool list."

---

### M3: `tools/lib/path-validator.js` Security Model Not Defined

**Finding:** Phase 3 introduces `path-validator.js` with `safePath(root, relative)` but doesn't specify the threat model. Is it protecting against directory traversal (`../../../etc/passwd`)? Symlink attacks? Path case-insensitivity on Windows?

**Mitigation:** Define the minimal viable check in the plan: "`safePath` resolves the joined path and verifies the resolved absolute path starts with `root`. Does NOT follow symlinks; that is out of scope." Document the limitation so future security reviews know the boundary.

---

### M4: `generate-capabilities.js` Has Adapter Subdirectories

**Finding:** `tools/generate-capabilities/` has `adapters/fastapi-adapter.js`, `adapters/tanstack-adapter.js`, `adapters/registry.js`. These are not listed in the Phase 1 refactor table. If the main `generate-capabilities.js` exports `runGenerateCapabilities()`, do the adapters also need refactoring?

**Mitigation:** Add to Phase 1: "Audit `tools/generate-capabilities/adapters/*.js` for `process.exit()` and global cwd usage. Refactor if found." The adapter files are likely pure already, but the plan should verify.

---

## Low Findings (Nice-to-Have)

### L1: `agent-manifest.json` Versioning Strategy

The manifest has `"version": "1.0.0"` but no policy for when to bump. Add a note: "Bump minor version when tools are added/removed; bump patch when descriptions change. Major bump for group restructuring."

### L2: Missing `capability_list_verified` in Namespace Mapping

The brainstorm report includes `list_verified` → `capability_list_verified`, but the namespace table in Phase 4 omits it. Add it to the mapping.

### L3: `validate-plan-loop/` Not Mentioned

`tools/validate-plan-loop/` (3 files) is not in the Phase 1 refactor list. It should either be included or explicitly excluded with rationale. The plan currently neither mentions it nor excludes it.

---

## Recommended Plan Changes

1. **Add to Dependencies:** `Phase 2 before Phase 3`
2. **Add to Phase 2, Step 1:** Audit `gate-utils.cjs` files in `.claude/` and `.factory/` hooks
3. **Add to Phase 2, Step 5:** Document expected test count drop and update CI thresholds
4. **Add to Phase 3, Step 5:** Re-verify universal hooks after `core/` deletions
5. **Add to Phase 1:** Pre-audit `validate-records/` helpers for exits and globals
6. **Expand Phase 4 verification:** Search entire repo (not just `tools/coordination-gate/mcp/`) for old tool names
7. **Add Phase 4 rollback:** Document `git checkout` paths for tool rename reversal
8. **Add `capability_list_verified` to Phase 4 mapping**
9. **Address `validate-plan-loop/` in Phase 1** — include or explicitly exclude
10. **Add threat model note to `path-validator.js` in Phase 3**

---

## Overall Verdict

**Proceed with fixes.** The plan is fundamentally sound (phased rollout, refactor-only, TDD), but the 5 critical findings are all preventable with the recommended edits. The highest-impact fix is **C1** (hook path fragility) — if missed, it silently disables gating on both agent surfaces.
