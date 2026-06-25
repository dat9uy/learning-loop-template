---
phase: 2
title: "InternalMove"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: InternalMove

## Overview

`git mv` the 9 file-groups from `tools/learning-loop-mastra/` top-level → `tools/learning-loop-mastra/mastra/`. Internal relative imports stay valid (verified: all `workflows/*.js` use `../create-loop-workflow.js`; all `agents/*.js` use `../create-loop-{tool,workflow,agent}.js`; `server.js` uses `./create-loop-tool.js`, `./legacy-handler-adapter.js`, `./storage.js`; `create-loop-tool.js` uses `./schema-parity.js`). Also update the `legacy-cleanup.test.cjs` test data (lines 58–62) which hardcodes pre-move top-level paths.

## Requirements

- Functional: shell files move to `mastra/`; internal imports unchanged; `legacy-cleanup.test.cjs` test data updated
- Non-functional: use `git mv` (preserves rename detection); no internal import edits (relative paths preserved)
- TDD gate: Phase 1's `no-top-level-shell-files.test.js` flips GREEN; `shell-files-in-mastra-dir.test.js` flips GREEN

## Architecture

The move is a pure physical relocation of 9 file-groups. The directory tree after the move:

```
tools/learning-loop-mastra/
├── core/                            # Layer 1 (unchanged)
├── interface/                       # Layer 3 (unchanged)
├── docs/                            # (unchanged)
├── hooks/legacy/                    # (unchanged — universal hooks)
├── data/                            # (unchanged — LibSQL)
├── scripts/                         # (unchanged — utility scripts)
├── scout/                           # (unchanged — scout legacy)
├── tools/                           # (unchanged — legacy tool surface)
├── __tests__/                       # (unchanged — test root)
├── agent-manifest.json              # (unchanged — legacy tool manifest)
├── storage.js                       # (unchanged — Mastra substrate, NOT shell)
└── mastra/                          # NEW (Layer 2 — Mastra shell)
    ├── server.js
    ├── create-loop-tool.js
    ├── create-loop-workflow.js
    ├── create-loop-agent.js
    ├── legacy-handler-adapter.js
    ├── schema-parity.js
    ├── schemas.js
    ├── workflows-manifest.json      # moves WITH workflows/ (per Plan 1 precedent)
    ├── workflows/
    │   └── workflow-*.js            # 10 files (all use ../create-loop-workflow.js)
    ├── agents-manifest.json         # moves WITH agents/
    └── agents/
        ├── build-meta-state-tools.js
        ├── load-agents-manifest.js
        ├── intake-agent.js
        ├── scout-agent.js
        ├── self-improvement-agent.js
        ├── run-scout-tool.js
        └── instructions/            # subdir, moves WITH agents/
```

## Related Code Files

- Move: `tools/learning-loop-mastra/server.js` → `tools/learning-loop-mastra/mastra/server.js`
- Move: `tools/learning-loop-mastra/create-loop-tool.js` → `tools/learning-loop-mastra/mastra/create-loop-tool.js`
- Move: `tools/learning-loop-mastra/create-loop-workflow.js` → `tools/learning-loop-mastra/mastra/create-loop-workflow.js`
- Move: `tools/learning-loop-mastra/create-loop-agent.js` → `tools/learning-loop-mastra/mastra/create-loop-agent.js`
- Move: `tools/learning-loop-mastra/legacy-handler-adapter.js` → `tools/learning-loop-mastra/mastra/legacy-handler-adapter.js`
- Move: `tools/learning-loop-mastra/schema-parity.js` → `tools/learning-loop-mastra/mastra/schema-parity.js`
- Move: `tools/learning-loop-mastra/schemas.js` → `tools/learning-loop-mastra/mastra/schemas.js`
- Move: `tools/learning-loop-mastra/workflows-manifest.json` → `tools/learning-loop-mastra/mastra/workflows-manifest.json` (manifest is at TOP level pre-Plan-6, NOT inside `workflows/`; red-team F3)
- Move: `tools/learning-loop-mastra/agents-manifest.json` → `tools/learning-loop-mastra/mastra/agents-manifest.json` (manifest is at TOP level pre-Plan-6; red-team F3)
- Move: `tools/learning-loop-mastra/workflows/` → `tools/learning-loop-mastra/mastra/workflows/` (10 files)
- Move: `tools/learning-loop-mastra/agents/` → `tools/learning-loop-mastra/mastra/agents/` (5 files + `instructions/` subdir)
- Modify: 4 test files using `../workflows/` and `../agents/` relative imports (red-team F2):
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (16+ imports)
  - `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` (3 imports)
  - `tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs` (3 imports)
  - `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (2 imports)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs` (lines 58–62, 73–74) — update test data to point at `mastra/` paths

## Implementation Steps

### Step 1: Move the 7 shell files (top-level .js)

```bash
cd /home/datguy/codingProjects/learning-loop-template

mkdir -p tools/learning-loop-mastra/mastra
git mv tools/learning-loop-mastra/server.js                  tools/learning-loop-mastra/mastra/server.js
git mv tools/learning-loop-mastra/create-loop-tool.js        tools/learning-loop-mastra/mastra/create-loop-tool.js
git mv tools/learning-loop-mastra/create-loop-workflow.js    tools/learning-loop-mastra/mastra/create-loop-workflow.js
git mv tools/learning-loop-mastra/create-loop-agent.js       tools/learning-loop-mastra/mastra/create-loop-agent.js
git mv tools/learning-loop-mastra/legacy-handler-adapter.js  tools/learning-loop-mastra/mastra/legacy-handler-adapter.js
git mv tools/learning-loop-mastra/schema-parity.js           tools/learning-loop-mastra/mastra/schema-parity.js
git mv tools/learning-loop-mastra/schemas.js                 tools/learning-loop-mastra/mastra/schemas.js
```

### Step 2: Move the 2 manifests (separate from the subdirs — they're siblings, not children)

**Critical (red-team F3):** `workflows-manifest.json` and `agents-manifest.json` live at TOP level pre-Plan-6, NOT inside their subdirs. `git mv workflows/` does NOT move them. They must be moved separately.

```bash
git mv tools/learning-loop-mastra/workflows-manifest.json  tools/learning-loop-mastra/mastra/workflows-manifest.json
git mv tools/learning-loop-mastra/agents-manifest.json     tools/learning-loop-mastra/mastra/agents-manifest.json
```

### Step 3: Move the 2 subdirs (workflows/, agents/)

```bash
git mv tools/learning-loop-mastra/workflows  tools/learning-loop-mastra/mastra/workflows
git mv tools/learning-loop-mastra/agents     tools/learning-loop-mastra/mastra/agents
```

`git mv` for directories recursively renames all contents (verified: `git mv <dir> <newdir>/` works when `<newdir>/` does not yet contain the dirname).

### Step 4: Verify the move

```bash
ls tools/learning-loop-mastra/mastra/
# Expected: server.js  create-loop-tool.js  create-loop-workflow.js  create-loop-agent.js
#           legacy-handler-adapter.js  schema-parity.js  schemas.js
#           workflows-manifest.json  agents-manifest.json
#           workflows/  agents/

find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js" -type f
# Expected: storage.js (substrate, stays per D5) — shell files all gone

ls tools/learning-loop-mastra/workflows 2>&1
# Expected: No such file or directory

ls tools/learning-loop-mastra/agents 2>&1
# Expected: No such file or directory

ls tools/learning-loop-mastra/workflows-manifest.json 2>&1
# Expected: No such file or directory

ls tools/learning-loop-mastra/agents-manifest.json 2>&1
# Expected: No such file or directory
```

### Step 5: Update 4 test files with `../workflows/` and `../agents/` relative imports (red-team F2)

These 4 test files in `__tests__/` use `await import("../workflows/...")` and `require("../agents/...")` patterns. After the move, these resolve to non-existent paths. Update them to `../mastra/workflows/` and `../mastra/agents/`.

```bash
# 4 files with ../workflows/ or ../agents/ relative imports
TEST_FILES=(
  tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js
  tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js
  tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs
  tools/learning-loop-mastra/__tests__/storage-parity.test.cjs
)

for f in "${TEST_FILES[@]}"; do
  sed -i \
    -e 's|"\.\./workflows/|"../mastra/workflows/|g' \
    -e 's|"\.\./agents/|"../mastra/agents/|g' \
    "$f"
done
```

**Why the sed patterns use a leading `"`:** The pattern matches the import string `"../workflows/..."` and `"../agents/..."`. The leading quote anchors the match to import constructs only, not comments or prose. The replacement preserves the leading quote.

**Verify:**

```bash
grep -nE '\.\./(workflows|agents)/' tools/learning-loop-mastra/__tests__/*.test.*
# Expected: 0 matches post-sed

grep -nE '\.\./mastra/(workflows|agents)/' tools/learning-loop-mastra/__tests__/*.test.* | head -5
# Expected: 24+ matches across the 4 files
```

### Step 6: Update `__tests__/legacy-cleanup.test.cjs` test data

This test asserts that 5 specific files exist at specific paths. After the move, the test must reference the new `mastra/` paths.

Edit `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs`:

```js
// Lines 58-62, change from:
const consumers = [
  { file: "tools/learning-loop-mastra/schemas.js", importPath: "./tools/legacy/meta-state-propose-design-tool.js" },
  { file: "tools/learning-loop-mastra/create-loop-workflow.js", importPath: "./core/envelope-stripper.js" },
  { file: "tools/learning-loop-mastra/agents/run-scout-tool.js", importPath: "../scout/legacy/run-scout.js" },
  { file: "tools/learning-loop-mastra/workflows/workflow-intake-plan.js", importPath: "../core/envelope-stripper.js" },
  { file: "tools/learning-loop-mastra/workflows/workflow-self-improvement.js", importPath: "../core/envelope-stripper.js" },
];

// To:
const consumers = [
  { file: "tools/learning-loop-mastra/mastra/schemas.js", importPath: "./tools/legacy/meta-state-propose-design-tool.js" },
  { file: "tools/learning-loop-mastra/mastra/create-loop-workflow.js", importPath: "./core/envelope-stripper.js" },
  { file: "tools/learning-loop-mastra/mastra/agents/run-scout-tool.js", importPath: "../scout/legacy/run-scout.js" },
  { file: "tools/learning-loop-mastra/mastra/workflows/workflow-intake-plan.js", importPath: "../core/envelope-stripper.js" },
  { file: "tools/learning-loop-mastra/mastra/workflows/workflow-self-improvement.js", importPath: "../core/envelope-stripper.js" },
];
```

Also update lines 73-74 (the prose-references test reads from `agents/instructions/scout-agent.js`):

```js
// Lines 73-74, change from:
const scoutAgent = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/agents/instructions/scout-agent.js"), "utf8");
const runScoutTool = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/agents/run-scout-tool.js"), "utf8");

// To:
const scoutAgent = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/agents/instructions/scout-agent.js"), "utf8");
const runScoutTool = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/agents/run-scout-tool.js"), "utf8");
```

### Step 7: Run Phase 1 regression guards (expect GREEN on no-top-level + shell-files-in-mastra-dir)

```bash
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/test-relative-imports.test.js
```

**Expected:** all 3 GREEN (no shell files at top level; all 7 files + 2 subdirs + 2 manifests present in `mastra/`; 4 test files now use `../mastra/` relative imports).

### Step 8: Sanity check — run legacy-cleanup test alone

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs
```

**Expected:** GREEN (the test's path assertions now point at `mastra/...` and the files exist there).

### Step 9: PRE-FLIGHT WARNING — `pnpm test` will still fail

External refs (`.mcp.json`, `.factory/mcp.json`, `package.json`, `interface/contract.js`, test files, hooks, docs) still point at the OLD pre-move paths. **Phase 2 alone breaks the suite** because the spawn helpers (`__tests__/with-mcp-server.js:128` etc.) reference the old path. **DO NOT commit or run `pnpm test` after Phase 2 alone.** Proceed to Phase 3.

### Step 5: Run Phase 1 regression guards (expect GREEN on no-top-level + shell-files-in-mastra-dir)

```bash
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js
```

**Expected:** both GREEN (no shell files at top level; all 7 files + 2 subdirs present in `mastra/`).

### Step 6: Sanity check — run legacy-cleanup test alone

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs
```

**Expected:** GREEN (the test's path assertions now point at `mastra/...` and the files exist there).

### Step 9: PRE-FLIGHT WARNING — `pnpm test` will still fail

External refs (`.mcp.json`, `.factory/mcp.json`, `package.json`, `interface/contract.js`, test files, hooks, docs) still point at the OLD pre-move paths. **Phase 2 alone breaks the suite** because the spawn helpers (`__tests__/with-mcp-server.js:128` etc.) reference the old path. **DO NOT commit or run `pnpm test` after Phase 2 alone.** Proceed to Phase 3.

## Success Criteria

- [ ] `tools/learning-loop-mastra/mastra/` contains `server.js`, `create-loop-tool.js`, `create-loop-workflow.js`, `create-loop-agent.js`, `legacy-handler-adapter.js`, `schema-parity.js`, `schemas.js`, `workflows-manifest.json`, `agents-manifest.json`, `workflows/`, `agents/`
- [ ] `tools/learning-loop-mastra/workflows`, `tools/learning-loop-mastra/agents`, `tools/learning-loop-mastra/workflows-manifest.json`, `tools/learning-loop-mastra/agents-manifest.json` no longer exist at top level
- [ ] `find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js" -type f` returns 1 match (`storage.js`, which stays per D5)
- [ ] 4 test files (`workflow-direct-parity.test.js`, `agent-direct-parity.test.js`, `agent-prompt-content.test.cjs`, `storage-parity.test.cjs`) updated to use `../mastra/workflows/` and `../mastra/agents/` relative imports
- [ ] `git status` shows ~11 renames (R records, not D+A pairs) for the moved items
- [ ] `__tests__/legacy-cleanup.test.cjs` lines 58–62, 73–74 updated to `mastra/` paths
- [ ] Phase 1 regression guards `no-top-level-shell-files.test.js`, `shell-files-in-mastra-dir.test.js`, and `test-relative-imports.test.js` pass (GREEN)
- [ ] `__tests__/legacy-cleanup.test.cjs` passes when run alone
- [ ] Internal imports INSIDE `mastra/` (e.g., `workflows/*` → `../create-loop-workflow.js`) unchanged (relative paths preserved)

## Risk Assessment

- **R-Phase2-A:** `git mv` for directories might not produce `R` records if the content is identical (it is — the move is the only change). Mitigation: verify with `git log --follow` post-move.
- **R-Phase2-B:** A non-shell file at top-level (e.g., `storage.js`, `agent-manifest.json`) might get accidentally moved. Mitigation: explicit per-file `git mv` commands; verify with `ls` after each step.
- **R-Phase2-C:** `git mv` fails if the target directory doesn't exist or if the source path is wrong. Mitigation: pre-flight `mkdir -p`; check error messages.
- **R-Phase2-D:** `__tests__/legacy-cleanup.test.cjs` test data update is brittle — the test asserts specific files import specific paths. If a future plan changes imports, this test breaks. Mitigation: the test is a regression guard for Phase 1's cleanup; out-of-scope for Plan 6.
- **R-Phase2-E:** Committing after Phase 2 alone breaks the suite (per Step 7). Mitigation: do not commit until Phase 3 lands.

---

## Phase Checklist (for `ck plan check 2`)

```bash
# Phase 2 done when:
ls tools/learning-loop-mastra/mastra/server.js
ls tools/learning-loop-mastra/mastra/workflows/workflow-classify-prompt.js
ls tools/learning-loop-mastra/mastra/agents/intake-agent.js
[ ! -d tools/learning-loop-mastra/workflows ]
[ ! -d tools/learning-loop-mastra/agents ]
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js
node --test tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs
git status | grep "^R " | wc -l   # ~9+ rename records

cd /home/datguy/codingProjects/learning-loop-template/plans/260626-0302-phase-e-shell-restructure && ck plan check 2
```