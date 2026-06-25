---
phase: 3
title: "ExternalRefUpdate"
status: pending
priority: P2
dependencies: [2]
---

# Phase 3: ExternalRefUpdate

## Overview

Update ~31 external references to shell paths. The references span runtime configs (3 files), the interface contract + docs (5 files), tests (11 files), hooks + hook tests (4 files including `MASTRA_AGENT_MODEL.md`), skill MDs (2 files), operator docs (3 files), tech docs (2 files: `docs/mcp-tool-schema-architecture.md` + `docs/project-changelog.md`), and meta-state registry (9 entries). After this phase, Phase 1's `external-refs-updated.test.js` and `agents-md-layer-locations.test.js` flip GREEN.

## Requirements

- Functional: every external reference to `tools/learning-loop-mastra/{server.js, create-loop-{tool,workflow,agent}.js, legacy-handler-adapter.js, schema-parity.js, schemas.js}` is updated to `tools/learning-loop-mastra/mastra/...`. Internal `from "./..."` imports stay unchanged (relative paths preserved).
- Non-functional: AGENTS.md §1.1 + AGENTS.md path-invariant sentence updated; `meta_state_batch` deferred to Phase 5 (this phase covers only file-system + string-literal updates; the meta-state registry update is part of Phase 5's verify step).
- TDD gate: Phase 1's `external-refs-updated.test.js` flips GREEN; `agents-md-layer-locations.test.js` flips GREEN.

## Architecture

External references are organized into 7 buckets, each with a distinct update strategy:

1. **Runtime configs (JSON)** — substring replace
2. **Package script (JSON)** — substring replace
3. **Interface contract + docs (Markdown + JS)** — substring replace + path-invariant addition
4. **Tests (JS/CJS)** — `join(...)` arg update + path-string fixture updates
5. **Runtime hooks + hook tests (CJS)** — `evidence_code_ref` string update
6. **Skill MDs (Markdown)** — path string update
7. **Operator docs (Markdown)** — path string update (preserve journals via grep exclusion in `external-refs-updated.test.js`)

## Related Code Files

### Runtime configs (3)
- Modify: `.mcp.json` line 5
- Modify: `.factory/mcp.json` line 5
- Modify: `package.json` line 19 (`gate:server` script)

### Interface contract + docs (5)
- Modify: `tools/learning-loop-mastra/interface/contract.js` line 94 (the `endsWith(...)` literal)
- Modify: `tools/learning-loop-mastra/interface/__tests__/contract.test.js` line 42 (test fixture)
- Modify: `tools/learning-loop-mastra/interface/CONTRACT.md` line 21 (path string in spec)
- Modify: `tools/learning-loop-mastra/interface/README.md` line 42 (path string in spec)
- Modify: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` lines 21, 55 (worked-example strings)

### Tests (11)
- Modify: `tools/learning-loop-mastra/__tests__/with-mcp-server.js` line 128 (default spawn entry — **SINGLE POINT OF FAILURE**)
- Modify: `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` line 27
- Modify: `tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs` line 17
- Modify: `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` line 12
- Modify: `tools/learning-loop-mastra/__tests__/mutex-scope.test.js` line 17
- Modify: `tools/learning-loop-mastra/__tests__/mcp-config.test.js` lines 24, 28 (assertion + fixture)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs` line 22
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` lines 35, 209, 289 (spawn + 2 evidence_code_ref)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/scout-budget-estimator.test.js` line 48 (prompt string)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-churn-regression.test.js` lines 29, 53, 89, 107 (4 evidence_code_ref strings — update for consistency)

### Runtime hooks + hook tests (3)
- Modify: `.factory/hooks/loop-surface-inject.cjs` line 166 (evidence_code_ref)
- Modify: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` lines 19, 21 (join + fixture)
- Modify: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` line 177 (evidence_code_ref)

### Skill MDs (2)
- Modify: `.claude/skills/coordination-gate/SKILL.md` line 14
- Modify: `.factory/skills/coordination-gate/SKILL.md` line 14

### Operator docs (3)
- Modify: `AGENTS.md` lines 20–22 (shell location), 57, 86 (server.js references)
- Modify: `AGENTS.md` lines 24–28 (add path-invariant sentence after shell location bullet)
- Modify: `README.md` line 48
- Modify: `CLAUDE.md` line 6
- Modify: `docs/mcp-server-restart-protocol.md` lines 3, 21, 55
- Modify: `docs/operator-notes/260624-mcp-server-rename-operator-action.md` line 35

### Cosmetic (1)
- Modify: `tools/learning-loop-mastra/agents-manifest.json` line 3 (description string)

## Implementation Steps

### Step 0: Manually edit `AGENTS.md §1.1` to remove "(top level)" prose (BEFORE sed)

**Critical (red-team F4):** Phase 3's bulk sed updates path strings but NOT the prose "(top level)" that wraps them. To make Phase 1's `agents-md-layer-locations.test.js` assertion (`!section.includes("(top level)")`) pass, the prose must be edited manually BEFORE the sed runs.

Edit `AGENTS.md` lines 20–22:

```diff
- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
-   Lives at `tools/learning-loop-mastra/` (top level): `server.js`,
-   `create-loop-{tool,workflow,agent}.js`, `workflows/`, `agents/`, `tools/`.
-   May import core; core may NOT import the shell.
+ **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
+   Lives at `tools/learning-loop-mastra/mastra/`: `server.js`,
+   `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`,
+   `schema-parity.js`, `schemas.js`, `workflows/`, `agents/`. May import
+   core; core may NOT import the shell.
```

This edit:
- Removes `(top level)` prose (F4 fix)
- Changes the path to the post-move location (sed will also do this, but doing it manually preserves readability)
- Updates the file list to reflect the 7 shell files + 2 subdirs that actually move
- Removes `tools/` from the list (that dir is `tools/legacy/`, not shell)

### Step 1: Add the path-invariant sentence to `AGENTS.md §1.1`

Add a load-bearing invariant sentence right after the shell-layer bullet (after line 22):

```markdown
> **Path invariant (Phase E Plan 6):** shell files MUST live at
> `tools/learning-loop-mastra/mastra/` and MUST NOT be at the top level of
> `tools/learning-loop-mastra/`. Enforced by
> `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`.
```

### Step 2: Bulk substring replace across all files

Use a single `sed` invocation across the 31 files for the 9 path patterns. The replacement is a deterministic prefix-only rename; other path occurrences (e.g., `tools/learning-loop-mastra/core/`) are unaffected because the sed patterns anchor on the file basename.

```bash
cd /home/datguy/codingProjects/learning-loop-template

# Define the file list (31 files; includes docs/mcp-tool-schema-architecture.md
# and docs/project-changelog.md per red-team F1 + H1)
FILES=(
  .mcp.json
  .factory/mcp.json
  package.json
  AGENTS.md
  README.md
  CLAUDE.md
  tools/learning-loop-mastra/interface/contract.js
  tools/learning-loop-mastra/interface/__tests__/contract.test.js
  tools/learning-loop-mastra/interface/CONTRACT.md
  tools/learning-loop-mastra/interface/README.md
  tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md
  tools/learning-loop-mastra/__tests__/with-mcp-server.js
  tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs
  tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs
  tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js
  tools/learning-loop-mastra/__tests__/mutex-scope.test.js
  tools/learning-loop-mastra/__tests__/mcp-config.test.js
  tools/learning-loop-mastra/__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs
  tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs
  tools/learning-loop-mastra/__tests__/legacy-mcp/scout-budget-estimator.test.js
  tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-churn-regression.test.js
  .factory/hooks/loop-surface-inject.cjs
  .factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs
  .claude/coordination/__tests__/claude-code-mcp-loading.test.cjs
  .claude/coordination/MASTRA_AGENT_MODEL.md
  .claude/skills/coordination-gate/SKILL.md
  .factory/skills/coordination-gate/SKILL.md
  docs/mcp-server-restart-protocol.md
  docs/operator-notes/260624-mcp-server-rename-operator-action.md
  docs/mcp-tool-schema-architecture.md
  docs/project-changelog.md
  tools/learning-loop-mastra/agents-manifest.json
)

# Apply the 9 substring replacements to each file:
#  - 7 shell-file paths (server.js, create-loop-{tool,workflow,agent}.js, legacy-handler-adapter.js, schema-parity.js, schemas.js)
#  - 2 manifest paths (workflows-manifest.json, agents-manifest.json) — per red-team F3 + H5
for f in "${FILES[@]}"; do
  sed -i \
    -e 's|tools/learning-loop-mastra/server\.js|tools/learning-loop-mastra/mastra/server.js|g' \
    -e 's|tools/learning-loop-mastra/create-loop-tool\.js|tools/learning-loop-mastra/mastra/create-loop-tool.js|g' \
    -e 's|tools/learning-loop-mastra/create-loop-workflow\.js|tools/learning-loop-mastra/mastra/create-loop-workflow.js|g' \
    -e 's|tools/learning-loop-mastra/create-loop-agent\.js|tools/learning-loop-mastra/mastra/create-loop-agent.js|g' \
    -e 's|tools/learning-loop-mastra/legacy-handler-adapter\.js|tools/learning-loop-mastra/mastra/legacy-handler-adapter.js|g' \
    -e 's|tools/learning-loop-mastra/schema-parity\.js|tools/learning-loop-mastra/mastra/schema-parity.js|g' \
    -e 's|tools/learning-loop-mastra/schemas\.js|tools/learning-loop-mastra/mastra/schemas.js|g' \
    -e 's|tools/learning-loop-mastra/workflows-manifest\.json|tools/learning-loop-mastra/mastra/workflows-manifest.json|g' \
    -e 's|tools/learning-loop-mastra/agents-manifest\.json|tools/learning-loop-mastra/mastra/agents-manifest.json|g' \
    "$f"
done
```

**Why this is safe:** The sed patterns anchor on the exact file basename (e.g., `server.js` not `mastra/server.js`). Other paths like `tools/learning-loop-mastra/storage.js` are unaffected because `storage.js` is not in the replacement list. The patterns are specific enough to not false-match.

### Step 3: Verify `interface/contract.js:94` literal updated

The sed pattern matches the exact line; verify the output:

```bash
grep "endsWith" tools/learning-loop-mastra/interface/contract.js
# Expected: endsWith("tools/learning-loop-mastra/mastra/server.js")
```

If the sed did not match (e.g., due to quote variations), edit manually.

### Step 4: Verify `__tests__/with-mcp-server.js:128` updated (single point of failure)

```bash
grep -n "tools/learning-loop-mastra" tools/learning-loop-mastra/__tests__/with-mcp-server.js
# Expected: line 128 references the new path with /mastra/ prefix
```

### Step 5: Run Phase 1 regression guards (expect GREEN on external-refs-updated + agents-md-layer-locations)

```bash
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/agents-md-layer-locations.test.js
```

**Expected:** both GREEN.

### Step 6: Run `pnpm test` (expect partial GREEN — all path-updated tests pass; meta-state-fingerprints-repointed.test.js still RED because Phase 5 hasn't run yet)

```bash
pnpm test
```

**Expected:** Most namespaces pass. The `meta-state-fingerprints-repointed.test.js` test in the `phase-e-shell-restructure` namespace fails (because meta-state hasn't been repointed yet). All other namespaces pass (the move + ref updates are internally consistent).

**If any non-meta-state test fails:** STOP. A substring sed missed a ref. Use `git grep -n "tools/learning-loop-mastra/server\.js"` to find the leftover ref and fix manually. **Do NOT proceed to Phase 4 until `pnpm test` is fully green except for the meta-state test.**

### Step 7: Update `agents-manifest.json` description (cosmetic)

```bash
sed -i 's|tools/learning-loop-mastra/server\.js|tools/learning-loop-mastra/mastra/server.js|g' \
  tools/learning-loop-mastra/agents-manifest.json
```

(The bulk sed in Step 2 already covers this, but confirm with a grep.)

## Success Criteria

- [ ] All 31 external files + `agents-manifest.json` updated (substring replace applied)
- [ ] `AGENTS.md §1.1` says shell lives at `tools/learning-loop-mastra/mastra/` (sed updated lines 57, 86)
- [ ] `AGENTS.md §1.1` has the path-invariant sentence (added manually per Step 2)
- [ ] `interface/contract.js:94` endsWith literal updated
- [ ] `interface/CONTRACT.md`, `interface/README.md`, `interface/RUNTIME_ONBOARDING.md` all reference the new path
- [ ] `__tests__/with-mcp-server.js:128` default spawn entry updated
- [ ] `__tests__/mcp-config.test.js:24-29` assertion updated; test passes
- [ ] `__tests__/interface/runtimes-pass-contract.test.js` (Plan 2 regression guard) passes against post-move `.mcp.json` + `.factory/mcp.json`
- [ ] Phase 1's `external-refs-updated.test.js` GREEN
- [ ] Phase 1's `agents-md-layer-locations.test.js` GREEN
- [ ] `pnpm test` GREEN except for `meta-state-fingerprints-repointed.test.js` (Phase 5 dependency)
- [ ] `git grep -n "tools/learning-loop-mastra/server\.js"` (excluding `docs/journals/`, `plans/reports/`, and `meta-state.jsonl`) returns 0 matches

## Risk Assessment

- **R-Phase3-A:** Substring sed misses a ref due to quote variations (single vs double quotes). Mitigation: Step 3-4 manual verification of critical files.
- **R-Phase3-B:** A doc has the path inside a code block or string literal that the sed doesn't match due to escaping. Mitigation: post-sed `git grep` verification.
- **R-Phase3-C:** AGENTS.md §1.1 path-invariant sentence conflicts with §11 (R2 ownership). Mitigation: §11 is for runtime ownership; §1.1 is for layer ownership. No conflict.
- **R-Phase3-D:** The bulk sed modifies a file that should NOT be modified (e.g., `docs/journals/`). Mitigation: explicitly excluded `docs/journals/` from the FILES array; Phase 1's `external-refs-updated.test.js` excludes `docs/journals/` and `plans/reports/` from the scan.
- **R-Phase3-E:** A test file references a now-moved shell file via `__tests__/path/to/something.js` style relative import that doesn't include `tools/learning-loop-mastra/`. Mitigation: research verified all shell imports use the `tools/learning-loop-mastra/` prefix; no relative-from-`__tests__/` imports of shell files exist.
- **R-Phase3-F:** `pnpm test` reveals a previously-unknown external ref (e.g., a hidden test in `.claude/coordination/__tests__/`). Mitigation: if a new test file is discovered, add it to the FILES list and re-run sed.

---

## Phase Checklist (for `ck plan check 3`)

```bash
# Phase 3 done when:
grep -c "tools/learning-loop-mastra/mastra/server\.js" .mcp.json .factory/mcp.json package.json  # 3 matches total
grep -c "endsWith.*tools/learning-loop-mastra/mastra" tools/learning-loop-mastra/interface/contract.js  # ≥1
grep -c "MUST NOT be at the top level" AGENTS.md  # ≥1
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js 2>&1 | tail -30
# Expected: 4 tests GREEN, 1 test (meta-state-fingerprints-repointed) RED
pnpm test 2>&1 | tail -10
# Expected: 12 namespaces GREEN; 1 namespace (phase-e-shell-restructure) RED on meta-state test only

cd /home/datguy/codingProjects/learning-loop-template/plans/260626-0302-phase-e-shell-restructure && ck plan check 3
```