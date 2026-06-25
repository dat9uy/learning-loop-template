---
phase: 1
title: "BaselineAndTests"
status: pending
priority: P2
dependencies: []
---

# Phase 1: BaselineAndTests

## Overview

Capture the pre-move baseline (grep counts of all external references to shell paths) and write 5 regression guards as RED tests. The guards lock the post-Plan-6 invariants (no top-level shell files; `mastra/` contains the moved files; external refs all updated; AGENTS.md §1.1 updated; meta-state repoint applied). **No production code changes in this phase.**

## Requirements

- Functional: capture pre-move counts via `grep -rln` + `find` and save to `plans/260626-0302-phase-e-shell-restructure/reports/pre-move-baseline.json`
- Non-functional: tests must be RED on the current tree (because shell files are still at top level) and GREEN after Phase 2-3 land
- TDD gate: write the 5 regression guards FIRST, run them to confirm RED, then proceed to Phase 2

## Architecture

This phase produces 5 regression guards that collectively enforce the post-Plan-6 invariant:

```
tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/
├── no-top-level-shell-files.test.js         # find -maxdepth 1 -name "*.js" returns 0
├── shell-files-in-mastra-dir.test.js        # 7 files + 2 subdirs + 2 manifests in mastra/
├── external-refs-updated.test.js            # 31 external refs all point at mastra/
├── test-relative-imports.test.js            # 4 parity test files use ../mastra/ relative imports
├── agents-md-layer-locations.test.js        # §1.1 says mastra/ (not top level)
└── meta-state-fingerprints-repointed.test.js # 9 meta-state entries repointed (cross-reference check)
```

## Related Code Files

- Create: `plans/260626-0302-phase-e-shell-restructure/reports/pre-move-baseline.json` (baseline snapshot)
- Create: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/agents-md-layer-locations.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/meta-state-fingerprints-repointed.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/test-relative-imports.test.js`
- Modify: `tools/scripts/run-pnpm-test-namespaced.mjs` (add 13th GLOB entry; update header comment "Active globs (9)" → "Active globs (13)")
- Modify: `package.json` (no change; `pnpm test` already runs the runner)

## Implementation Steps

### Step 1: Capture pre-move baseline

Run these commands and save to `reports/pre-move-baseline.json`:

```bash
mkdir -p plans/260626-0302-phase-e-shell-restructure/reports

# Count *.js files at top level of tools/learning-loop-mastra/ (pre-move: 5)
find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js" -type f | sort

# List all top-level entries (pre-move: shell files + dirs)
ls -la tools/learning-loop-mastra/

# Count external references to shell paths
grep -rln "tools/learning-loop-mastra/server\.js\|tools/learning-loop-mastra/create-loop\|tools/learning-loop-mastra/legacy-handler\|tools/learning-loop-mastra/schema-parity\|tools/learning-loop-mastra/schemas\.js" \
  --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" --include="*.md" \
  tools/ AGENTS.md README.md CLAUDE.md package.json .mcp.json .factory/ docs/ .claude/ \
  | sort > plans/260626-0302-phase-e-shell-restructure/reports/pre-move-external-refs.txt

# Count meta-state entries referencing shell paths
grep -c "tools/learning-loop-mastra/server\.js\|tools/learning-loop-mastra/create-loop\|tools/learning-loop-mastra/legacy-handler\|tools/learning-loop-mastra/schema-parity\|tools/learning-loop-mastra/schemas\.js" \
  meta-state.jsonl

# Save baseline counts as JSON
cat > plans/260626-0302-phase-e-shell-restructure/reports/pre-move-baseline.json << 'EOF'
{
  "captured_at": "<ISO_TIMESTAMP>",
  "top_level_js_files": 5,
  "shell_files": ["create-loop-agent.js", "create-loop-tool.js", "create-loop-workflow.js", "legacy-handler-adapter.js", "schema-parity.js", "schemas.js", "server.js"],
  "expected_mastra_dir_files": 7,
  "expected_mastra_subdirs": ["workflows", "agents"],
  "external_refs_count": <integer>,
  "meta_state_entries_count": 9,
  "stale_entries_to_reverify": ["meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop"]
}
EOF
```

### Step 2: Add new GLOB to test runner

Edit `tools/scripts/run-pnpm-test-namespaced.mjs`:

```js
// Update header comment line 18 from:
//   Active globs (9)
// to:
//   Active globs (12). Plan 6 adds phase-e-shell-restructure (total 13).

// Add new entry after line 41 (after `interface-contract-tests`):
{ ns: "phase-e-shell-restructure", pattern: "tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js" },
```

### Step 3: Write regression guard #1 — `no-top-level-shell-files.test.js`

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const SHELL_DIR = "tools/learning-loop-mastra";

// Top-level entries that are allowed to remain (non-shell per Plan 6 D5):
//   storage.js              — Mastra substrate (LibSQL); not shell
//   agent-manifest.json     — legacy tool manifest; not shell
//   data/                   — LibSQL DB; gitignored
//   core/, interface/, docs/, hooks/, scripts/, scout/, tools/, __tests__/ — other layers
const ALLOWED_TOP_LEVEL_BASENAMES = ["storage.js", "agent-manifest.json"];

test("no shell *.js / *.cjs / *.mjs files at tools/learning-loop-mastra/ top level", () => {
  // Allowlisted basenames are excluded from the assertion
  const result = execSync(
    `find ${SHELL_DIR} -maxdepth 1 \\( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \\) -type f 2>/dev/null || true`,
    { cwd: PROJECT_ROOT, encoding: "utf8" }
  );
  const files = result
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => {
      const basename = f.split("/").pop();
      return !ALLOWED_TOP_LEVEL_BASENAMES.includes(basename);
    });
  assert.deepStrictEqual(files, [], `shell files at top level (allowlist excluded): ${files.join(", ")}`);
});
```

### Step 4: Write regression guard #2 — `shell-files-in-mastra-dir.test.js`

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const MASTRA_DIR = join(PROJECT_ROOT, "tools", "learning-loop-mastra", "mastra");

const EXPECTED_FILES = [
  "server.js",
  "create-loop-tool.js",
  "create-loop-workflow.js",
  "create-loop-agent.js",
  "legacy-handler-adapter.js",
  "schema-parity.js",
  "schemas.js",
];

const EXPECTED_SUBDIRS = ["workflows", "agents"];

test("mastra/ contains the 7 expected shell files", () => {
  for (const f of EXPECTED_FILES) {
    assert.ok(
      existsSync(join(MASTRA_DIR, f)),
      `mastra/${f} must exist post-move`
    );
  }
});

test("mastra/ contains the 2 expected subdirs (workflows, agents)", () => {
  const entries = readdirSync(MASTRA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const sub of EXPECTED_SUBDIRS) {
    assert.ok(entries.includes(sub), `mastra/${sub}/ must exist post-move`);
  }
});

test("mastra/workflows-manifest.json and mastra/agents-manifest.json are at the new location", () => {
  // Manifests were at top level pre-Plan-6; Plan 6 moves them into mastra/
  assert.ok(
    existsSync(join(MASTRA_DIR, "workflows-manifest.json")),
    "mastra/workflows-manifest.json must exist post-move (was at top level pre-Plan-6)"
  );
  assert.ok(
    existsSync(join(MASTRA_DIR, "agents-manifest.json")),
    "mastra/agents-manifest.json must exist post-move (was at top level pre-Plan-6)"
  );
  // And NOT at top level
  assert.ok(
    !existsSync(join(PROJECT_ROOT, "tools", "learning-loop-mastra", "workflows-manifest.json")),
    "tools/learning-loop-mastra/workflows-manifest.json must NOT exist post-move (moved to mastra/)"
  );
  assert.ok(
    !existsSync(join(PROJECT_ROOT, "tools", "learning-loop-mastra", "agents-manifest.json")),
    "tools/learning-loop-mastra/agents-manifest.json must NOT exist post-move (moved to mastra/)"
  );
});

test("mastra/workflows/ contains all 10 workflow files", () => {
  const expectedWorkflows = [
    "workflow-classify-prompt.js",
    "workflow-intake-orient.js",
    "workflow-intake-plan.js",
    "workflow-intentional-skip.js",
    "workflow-prepare-runtime-request.js",
    "workflow-report-phase-status.js",
    "workflow-runtime-probe.js",
    "workflow-self-improvement.js",
    "workflow-storage-read.js",
    "workflow-storage-round-trip.js",
  ];
  const workflowsDir = join(MASTRA_DIR, "workflows");
  for (const f of expectedWorkflows) {
    assert.ok(existsSync(join(workflowsDir, f)), `mastra/workflows/${f} must exist`);
  }
});
```

### Step 5: Write regression guard #3 — `external-refs-updated.test.js`

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

// Files (relative to PROJECT_ROOT) that MUST NOT contain pre-move shell paths after Phase 3.
// Excludes: docs/journals/ (historical), records/meta/.cache/ (regenerated),
//           tools/learning-loop-mastra/interface/__tests__/contract.test.js (Plan 2 fixture; gets updated in Phase 3),
//           the regression test files themselves.
const FORBIDDEN_PATH_PATTERNS = [
  "tools/learning-loop-mastra/server\\.js",
  "tools/learning-loop-mastra/create-loop-tool\\.js",
  "tools/learning-loop-mastra/create-loop-workflow\\.js",
  "tools/learning-loop-mastra/create-loop-agent\\.js",
  "tools/learning-loop-mastra/legacy-handler-adapter\\.js",
  "tools/learning-loop-mastra/schema-parity\\.js",
  "tools/learning-loop-mastra/schemas\\.js",
];

// Search paths (excludes docs/journals/ + records/ + .cache/ + __tests__/phase-e-shell-restructure/)
const SEARCH_PATHS = [
  ".mcp.json", ".factory/mcp.json", "package.json",
  "AGENTS.md", "README.md", "CLAUDE.md",
  "tools/learning-loop-mastra/interface/",
  "tools/learning-loop-mastra/__tests__/",
  "tools/learning-loop-mastra/agents-manifest.json",
  "tools/learning-loop-mastra/storage.js",  // has comment, will be checked separately
  "tools/scripts/",
  ".claude/skills/", ".factory/skills/",
  ".claude/coordination/", ".factory/hooks/",
  ".claude/coordination/MASTRA_AGENT_MODEL.md",
  "docs/mcp-server-restart-protocol.md",
  "docs/operator-notes/",
  "docs/mcp-tool-schema-architecture.md",
  "docs/project-changelog.md",
];

test("no external refs to pre-move shell paths in production files", () => {
  // Use grep to find any forbidden pattern in search paths
  // Note: this is RED on pre-move tree (many matches expected), GREEN after Phase 3
  const grepArgs = FORBIDDEN_PATH_PATTERNS.map((p) => `-e "${p}"`).join(" ");
  const result = execSync(
    `grep -rn ${grepArgs} ${SEARCH_PATHS.map((p) => `"${p}"`).join(" ")} --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" --include="*.md" 2>/dev/null || true`,
    { cwd: PROJECT_ROOT, encoding: "utf8" }
  );
  const lines = result.trim().split("\n").filter(Boolean);
  // Filter out false positives: regression test files themselves (intentional pre-move refs for documentation)
  const filtered = lines.filter((line) =>
    !line.includes("phase-e-shell-restructure/")
  );
  assert.deepStrictEqual(filtered, [], `forbidden shell-path references found:\n${filtered.join("\n")}`);
});
```

### Step 6: Write regression guard #4 — `agents-md-layer-locations.test.js`

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/agents-md-layer-locations.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const AGENTS_MD = join(PROJECT_ROOT, "AGENTS.md");

test("AGENTS.md §1.1 says shell lives at tools/learning-loop-mastra/mastra/", () => {
  const content = readFileSync(AGENTS_MD, "utf8");
  // The shell layer description must reference the new path
  assert.ok(
    content.includes("tools/learning-loop-mastra/mastra/"),
    `AGENTS.md must reference the new shell path; current content lacks it`
  );
  // The shell layer description must NOT say "(top level)" — Phase 3 manually edits the prose
  // before running sed (per red-team finding F4)
  const shellLayerSection = content.match(/\*\*Mastra shell[^*]+\*\*[^*]+/);
  assert.ok(shellLayerSection, "AGENTS.md must contain a 'Mastra shell' section");
  assert.ok(
    !shellLayerSection[0].toLowerCase().includes("(top level)"),
    `AGENTS.md §1.1 must not say 'top level' for the shell; found: ${shellLayerSection[0].slice(0, 200)}`
  );
});

test("AGENTS.md §1.1 has the post-Plan-6 path-invariant sentence", () => {
  const content = readFileSync(AGENTS_MD, "utf8");
  // The invariant sentence should mention the post-move path and the regression test
  assert.ok(
    content.includes("mastra/") && content.includes("MUST NOT be at the top level"),
    `AGENTS.md must contain the path-invariant sentence; current content lacks it`
  );
});
```

### Step 7: Write regression guard #5 — `meta-state-fingerprints-repointed.test.js`

This test enforces that the 9 meta-state entries referencing shell paths have been repointed to `mastra/...`. Cross-references the meta-state registry without depending on the MCP server (which may not be running in the test environment).

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/meta-state-fingerprints-repointed.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const META_STATE_PATH = join(PROJECT_ROOT, "meta-state.jsonl");

// 9 entries / 13 field updates verified by research
const REPOINTED_ENTRIES = [
  "meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation",
  "meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p",
  "meta-260617T0113Z-tools-learning-loop-mastra-schemas-js",
  "meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js",
  "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop",
  "meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js",
  "meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md",
  "meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md",
  "meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md",
];

test("9 meta-state entries have been repointed to mastra/ paths", () => {
  const content = readFileSync(META_STATE_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const unrepointed = [];
  for (const entryId of REPOINTED_ENTRIES) {
    const entryLine = lines.find((line) => line.includes(`"id":"${entryId}"`));
    assert.ok(entryLine, `entry ${entryId} not found in meta-state.jsonl`);
    // After repoint, the entry's evidence_code_ref + change_target + applies_to.schemas
    // should NOT contain the pre-move shell paths (must use mastra/ instead)
    const hasPreMovePath =
      entryLine.includes("tools/learning-loop-mastra/server.js") ||
      entryLine.includes("tools/learning-loop-mastra/create-loop-tool.js") ||
      entryLine.includes("tools/learning-loop-mastra/create-loop-workflow.js") ||
      entryLine.includes("tools/learning-loop-mastra/legacy-handler-adapter.js") ||
      entryLine.includes("tools/learning-loop-mastra/schema-parity.js") ||
      entryLine.includes("tools/learning-loop-mastra/schemas.js");
    if (hasPreMovePath) {
      unrepointed.push(entryId);
    }
  }
  assert.deepStrictEqual(unrepointed, [], `entries not repointed to mastra/ paths: ${unrepointed.join(", ")}`);
});

test("repointed entries reference mastra/ paths", () => {
  const content = readFileSync(META_STATE_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  for (const entryId of REPOINTED_ENTRIES) {
    const entryLine = lines.find((line) => line.includes(`"id":"${entryId}"`));
    assert.ok(entryLine, `entry ${entryId} not found in meta-state.jsonl`);
    // Each entry should reference at least one mastra/ path (the repoint target)
    assert.ok(
      entryLine.includes("tools/learning-loop-mastra/mastra/"),
      `entry ${entryId} must reference at least one mastra/ path after repoint`
    );
  }
});
```

### Step 7b: Write regression guard #6 — `test-relative-imports.test.js`

The 4 test files in `__tests__/` use `../workflows/` and `../agents/` relative imports. After Phase 2 moves `workflows/` and `agents/` to `mastra/`, these imports must become `../mastra/workflows/` and `../mastra/agents/`. This test (red-team F2) locks the post-move import style.

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/test-relative-imports.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

// 4 test files using `../workflows/` and `../agents/` relative imports (red-team F2)
const TEST_FILES_WITH_RELATIVE_IMPORTS = [
  "tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js",
  "tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js",
  "tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs",
  "tools/learning-loop-mastra/__tests__/storage-parity.test.cjs",
];

test("4 parity test files use ../mastra/workflows/ and ../mastra/agents/ relative imports", () => {
  for (const relPath of TEST_FILES_WITH_RELATIVE_IMPORTS) {
    const fullPath = join(PROJECT_ROOT, relPath);
    const content = readFileSync(fullPath, "utf8");
    // After Phase 2, these imports must use the mastra/ prefix
    assert.ok(
      content.includes("../mastra/workflows/") || content.includes("../mastra/agents/"),
      `${relPath} must use ../mastra/workflows/ or ../mastra/agents/ relative imports post-Phase-2`
    );
    // And must NOT have stale bare `../workflows/` or `../agents/` imports
    assert.ok(
      !content.includes("../workflows/") && !content.includes("../agents/"),
      `${relPath} must NOT have stale ../workflows/ or ../agents/ imports post-Phase-2`
    );
  }
});
```

### Step 8: Run all 5 regression guards (expect RED on baseline)

```bash
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js
```

**Expected:** all 5 tests FAIL on the current pre-move tree (because shell files are still at top level, `mastra/` doesn't exist, AGENTS.md says "top level", meta-state entries reference pre-move paths). This is the RED baseline.

## Success Criteria

- [ ] `reports/pre-move-baseline.json` saved with all counts
- [ ] `reports/pre-move-external-refs.txt` saved (full file list of pre-move external refs)
- [ ] `tools/scripts/run-pnpm-test-namespaced.mjs` has 13 GLOBs (12 existing + `phase-e-shell-restructure`)
- [ ] 6 regression guard test files created in `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/`
- [ ] All 6 tests FAIL on current pre-move tree (RED baseline confirmed)
- [ ] No production code modified in this phase

## Risk Assessment

- **R-Phase1-A:** Baseline counts depend on the actual current state; if the codebase has drifted since research, counts will be off. Mitigation: re-verify the baseline counts against the research reports before Phase 2.
- **R-Phase1-B:** `external-refs-updated.test.js` has a complex grep pattern; if too permissive, it passes on stale refs; if too strict, it rejects valid refs. Mitigation: list specific search paths (not recursive) to bound the search.
- **R-Phase1-C:** `meta-state-fingerprints-repointed.test.js` reads `meta-state.jsonl` directly; if the file is gitignored or moved, the test fails. Mitigation: confirm `meta-state.jsonl` is at the project root and not gitignored (verify in `git check-ignore`).

---

## Phase Checklist (for `ck plan check 1`)

```bash
# Phase 1 done when:
ls plans/260626-0302-phase-e-shell-restructure/reports/pre-move-baseline.json
ls plans/260626-0302-phase-e-shell-restructure/reports/pre-move-external-refs.txt
ls tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js | wc -l   # 5
grep -c "phase-e-shell-restructure" tools/scripts/run-pnpm-test-namespaced.mjs   # ≥2 (header + entry)
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js 2>&1 | tail -20
# Expected: most/all tests FAIL (RED baseline)

cd /home/datguy/codingProjects/learning-loop-template/plans/260626-0302-phase-e-shell-restructure && ck plan check 1
```