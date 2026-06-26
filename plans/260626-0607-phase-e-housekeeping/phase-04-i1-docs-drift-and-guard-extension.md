---
phase: 4
title: "Rev 6 I-1 — core/README.md docs drift fix + regression guard extension"
status: pending
priority: P2
dependencies: []
---

# Phase 4: Rev 6 I-1 — core/README.md docs drift + regression guard extension

## Overview

Fix 3 stale path references in `tools/learning-loop-mastra/core/README.md` (lines 26, 27, 46) that the Plan 6 regression guard `external-refs-updated.test.js` missed because:
1. The guard's `SEARCH_PATHS` does NOT include `tools/learning-loop-mastra/core/`
2. The guard's `FORBIDDEN_PATH_PATTERNS` uses literal regex (no glob), so the `create-loop-*.js` reference on line 26 didn't match any pattern

Close both gaps. Also extend FORBIDDEN_PATH_PATTERNS to include `schema-descriptions\\.yaml` (per D5, guards against future re-creation of the deleted Phase 3 file).

**Risk:** Low — 3 doc-line edits + 2 test-file extensions. No behavioral change.

## Requirements

- Functional:
  1. `core/README.md` line 26: `tools/learning-loop-mastra/create-loop-*.js` → `tools/learning-loop-mastra/mastra/create-loop-*.js`
  2. `core/README.md` line 27: `tools/learning-loop-mastra/{workflows,agents,tools}/` → `tools/learning-loop-mastra/mastra/{workflows,agents}/` (with `tools/legacy/` noted separately)
  3. `core/README.md` line 46: `tools/learning-loop-mastra/` top level → `tools/learning-loop-mastra/mastra/`
- Non-functional:
  1. `core/README.md` line 47 unchanged (`interface/` path is correct post-Plan-2)
  2. `__tests__/phase-e-shell-restructure/external-refs-updated.test.js` `SEARCH_PATHS` includes `tools/learning-loop-mastra/core/`
  3. `__tests__/phase-e-shell-restructure/external-refs-updated.test.js` `FORBIDDEN_PATH_PATTERNS` includes `tools/learning-loop-mastra/schema-descriptions\\.yaml`
- TDD gate: `node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` GREEN; `pnpm test` GREEN

## Architecture

The Plan 6 regression guard (`external-refs-updated.test.js`) was designed to scan production files for FORBIDDEN_PATH_PATTERNS (pre-move shell paths) and ensure they don't appear post-move. The guard caught 31 external refs across configs, tests, hooks, docs, and skill MDs — but missed `core/README.md` for two reasons:

1. **SEARCH_PATHS gap:** The guard's list includes `tools/learning-loop-mastra/interface/`, `tools/learning-loop-mastra/__tests__/`, `tools/learning-loop-mastra/agents-manifest.json`, `tools/learning-loop-mastra/storage.js`, but NOT `tools/learning-loop-mastra/core/`. Adding `core/` closes this gap.
2. **FORBIDDEN_PATH_PATTERNS literal regex gap:** The 7 forbidden patterns use literal `.js` / `server.js` matches (with escaped dots `\\.`). The `create-loop-*.js` reference on line 26 is a glob-style reference that doesn't match any pattern. Adding a glob pattern OR a wildcard literal would close this.

**Why literal regex (not glob):** The grep invocation builds `-e "<pattern>"` pairs for `grep -rn`; supporting glob would require code change in the test runner. Adding a separate literal pattern that matches the glob-style reference is simpler and keeps the existing pattern structure.

**Pattern design:** To match `create-loop-*.js`, the literal regex would be `tools/learning-loop-mastra/create-loop-.*\\.js`. The `.*` matches any chars (including the `*` itself, but `grep` doesn't see `*` as special in regex when not preceded by `.`). Test:
```
echo "tools/learning-loop-mastra/create-loop-*.js" | grep "tools/learning-loop-mastra/create-loop-.*\\.js"
# Expected: 1 match
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/README.md` (3 line edits: 26, 27, 46)
- Modify: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` (SEARCH_PATHS extension + FORBIDDEN_PATH_PATTERNS extension)
- No file creation
- No file deletion

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `tools/learning-loop-mastra/core/README.md` | Modify | 3 lines (26, 27, 46) | Doc-only edits; no logic change |
| `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` | Modify | ~3 lines (1 new SEARCH_PATHS entry + 2 new FORBIDDEN_PATH_PATTERNS entries: `create-loop-.*\\.js` + `schema-descriptions\\.yaml`) | Test guard extension; no semantic change to existing 7 patterns |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `cat tools/learning-loop-mastra/core/README.md \| sed -n '24,28p'` shows `mastra/create-loop-*.js` and `mastra/{workflows,agents}/` | After phase 4 | Lines 26-27 fixed |
| 2 | `cat tools/learning-loop-mastra/core/README.md \| sed -n '44,48p'` shows `mastra/` | After phase 4 | Line 46 fixed |
| 3 | `cat tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js \| grep -A20 SEARCH_PATHS` shows `tools/learning-loop-mastra/core/` | After phase 4 | SEARCH_PATHS extended |
| 4 | `cat tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js \| grep -A10 FORBIDDEN_PATH_PATTERNS` shows `create-loop-.*\\.js` and `schema-descriptions\\.yaml` | After phase 4 | FORBIDDEN_PATH_PATTERNS extended |
| 5 | `node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` passes (1 test) | After phase 4 | Guard test GREEN |
| 6 | `pnpm test` GREEN across all 13 namespaces | After phase 4 | No regression |
| 7 | `node tools/learning-loop-mastra/interface/contract.js claude-code` still returns `{ok: true}` | After phase 4 | Contract unaffected |
| 8 | `git diff core/README.md` shows ONLY the 3-line fix (no other changes) | After phase 4 | Diff scope clean |

## Function/Interface Checklist (deep mode)

- [ ] Line 26 wording matches: `- \`tools/learning-loop-mastra/mastra/create-loop-*.js\` (shell factories)`
- [ ] Line 27 wording matches: `- Anything under \`tools/learning-loop-mastra/mastra/{workflows,agents}/\` (shell-defined entities); \`tools/learning-loop-mastra/tools/legacy/\` is a separate Layer 1 substrate (legacy tool adapters)`
- [ ] Line 46 wording matches: `- **Mastra shell** (\`tools/learning-loop-mastra/mastra/\`) — the imperative shell`
- [ ] Line 47 wording unchanged (interface/ path is correct)
- [ ] SEARCH_PATHS extension is in the right alphabetical position OR appended (doesn't matter for correctness)
- [ ] FORBIDDEN_PATH_PATTERNS additions follow the existing format (literal regex with escaped dots; semicolon-quoted)

## Dependency Map (deep mode)

**Depends on:**
- Plan 6 (DONE) — the regression guard `external-refs-updated.test.js` was created in Plan 6 Phase 1; this phase extends it
- Phase 3 of this plan (E.4 deletion) — the `schema-descriptions\\.yaml` FORBIDDEN_PATH_PATTERNS entry guards against re-creation of the deleted file

**Does not depend on:**
- Phase 1/2/5 of this plan — I-1 ships independently

**Does not block:**
- Plan 4 — Plan 4 reads `legacy-pins.md` (Phase 2) but not `core/README.md`
- Plan 5 — hardening is parallel

## Implementation Steps

### Step 1: Edit `core/README.md` line 26

```diff
- - `tools/learning-loop-mastra/create-loop-*.js` (shell factories)
+ - `tools/learning-loop-mastra/mastra/create-loop-*.js` (shell factories)
```

### Step 2: Edit `core/README.md` line 27

```diff
- - Anything under `tools/learning-loop-mastra/{workflows,agents,tools}/`
-   (shell-defined entities)
+ - Anything under `tools/learning-loop-mastra/mastra/{workflows,agents}/`
+   (shell-defined entities); `tools/learning-loop-mastra/tools/legacy/`
+   is a separate substrate directory (legacy tool adapters; NOT under `mastra/`)
```

### Step 3: Edit `core/README.md` line 46

```diff
- - **Mastra shell** (`tools/learning-loop-mastra/` top level) — the imperative shell
+ - **Mastra shell** (`tools/learning-loop-mastra/mastra/`) — the imperative shell
```

### Step 4: Verify the doc edits

```bash
cd /home/datguy/codingProjects/learning-loop-template

sed -n '24,28p' tools/learning-loop-mastra/core/README.md
# Expected: line 26 contains "mastra/create-loop-*.js"; line 27 contains "mastra/{workflows,agents}/"

sed -n '44,48p' tools/learning-loop-mastra/core/README.md
# Expected: line 46 contains "Mastra shell" + "tools/learning-loop-mastra/mastra/"; line 47 unchanged (interface/)

git diff tools/learning-loop-mastra/core/README.md
# Expected: 3-line change (lines 26, 27, 46); no other modifications
```

### Step 5: Extend `external-refs-updated.test.js` SEARCH_PATHS

Open `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js`. The `SEARCH_PATHS` array (lines 21–36) currently contains 17 entries. Insert a new entry:

```diff
   "tools/learning-loop-mastra/interface/",
   "tools/learning-loop-mastra/__tests__/",
+  "tools/learning-loop-mastra/core/",
   "tools/learning-loop-mastra/agents-manifest.json",
```

### Step 6: Extend FORBIDDEN_PATH_PATTERNS (2 entries)

Add 2 new patterns to the `FORBIDDEN_PATH_PATTERNS` array (currently lines 10–18, 7 entries):

```diff
   "tools/learning-loop-mastra/legacy-handler-adapter\\.js",
   "tools/learning-loop-mastra/schema-parity\\.js",
   "tools/learning-loop-mastra/schemas\\.js",
+  "tools/learning-loop-mastra/create-loop-.*\\.js",
+  "tools/learning-loop-mastra/core/schema-descriptions\\.yaml",
 ];
```

**Why both entries:**
- `create-loop-.*\\.js` — matches the glob-style reference in `core/README.md` line 26 (pre-fix) AND any future such reference
- `core/schema-descriptions\\.yaml` — guards against future re-creation of the deleted Phase 3 file at the original location (the actual file lived at `tools/learning-loop-mastra/core/schema-descriptions.yaml`, NOT at `tools/learning-loop-mastra/schema-descriptions.yaml` — corrected per red-team finding M6)

### Step 7: Verify the test file edits

```bash
cd /home/datguy/codingProjects/learning-loop-template

grep -A20 "SEARCH_PATHS" tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js | grep "core/"
# Expected: 1 match (the new entry)

grep -A10 "FORBIDDEN_PATH_PATTERNS" tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js | grep -E "create-loop-.*\\.js|schema-descriptions\\.yaml"
# Expected: 2 matches
```

### Step 8: Run the regression guard test (expect GREEN)

```bash
cd /home/datguy/codingProjects/learning-loop-template

node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js 2>&1 | tail -10
# Expected: 1 test passes (the guard now scans core/ + catches the 2 new patterns)
```

**If the test fails:** the extended patterns are matching valid code. Investigate which file matches the new pattern; either fix the doc (if a real stale ref) or tighten the pattern (if a false positive).

### Step 9: Run full `pnpm test` (expect GREEN)

```bash
pnpm test 2>&1 | tail -15
# Expected: all 13 namespaces GREEN
```

### Step 10: Diff scope check

```bash
git diff --stat
# Expected: 2 files changed (core/README.md + external-refs-updated.test.js); small line counts
```

## Success Criteria

- [ ] Step 1–3 doc edits applied; lines 26, 27, 46 fixed
- [ ] Step 4 verification passes; line 47 unchanged
- [ ] Step 5 SEARCH_PATHS extension applied; `tools/learning-loop-mastra/core/` in list
- [ ] Step 6 FORBIDDEN_PATH_PATTERNS extension applied; 2 new entries
- [ ] Step 7 verification passes
- [ ] Step 8 regression guard test GREEN
- [ ] Step 9 `pnpm test` GREEN across all 13 namespaces
- [ ] Step 10 diff scope clean

## Risk Assessment

- **R-Phase4-A:** The new FORBIDDEN_PATH_PATTERNS matches valid code (false positive). **Mitigation:** Step 8 test catches this; scout verified no current code matches the new patterns. If false positive, tighten the pattern OR add to a `FORBIDDEN_PATH_EXCEPTIONS` array.
- **R-Phase4-B:** Line 27 wording drift (e.g., the user wanted `tools/legacy/` to be inside `mastra/`). **Mitigation:** The scout verified `tools/legacy/` is Layer 1 substrate (per D5 of Plan 6), NOT shell code, and stays at top level. Wording reflects this.
- **R-Phase4-C:** The test runner's grep invocation breaks with the new pattern (e.g., shell escaping issue). **Mitigation:** The new patterns follow the existing format (literal regex with `\\.` escapes); test runs as part of `pnpm test` GREEN gate.
- **R-Phase4-D:** Line 47 also needs editing (scout claim). **Mitigation:** Step 4 verification confirms line 47 is unchanged (`interface/` path is correct). If scout was right, the verification catches it and we add the edit.
- **R-Phase4-E:** The `create-loop-.*\\.js` pattern also matches the 3 actual `create-loop-{tool,workflow,agent}.js` patterns in FORBIDDEN_PATH_PATTERNS. **Mitigation:** This is the desired behavior — the regex is broader and catches glob-style refs too. No conflict because the existing 3 patterns are subsumed by the new broader pattern. (Optional: remove the 3 narrower patterns for cleanliness; defer to a future cleanup if desired.)