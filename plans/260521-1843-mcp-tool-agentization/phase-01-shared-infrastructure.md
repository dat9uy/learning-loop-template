---
phase: 1
title: "Shared Infrastructure"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Shared Infrastructure

## Overview

Prepare the codebase for MCP tool agentization by extracting shared utilities, updating the write gate for new agent-managed paths, and rewriting the list-verified tool in pure JavaScript.

## Requirements

- Functional: Extract frontmatter splitter to shared lib; update write gate; rewrite list-verified in JS
- Non-functional: No regression in existing tests; no new dependencies; gate changes must not weaken security

## Architecture

```
tools/lib/
  frontmatter-splitter.js      # extracted from tools/extract-index/
tools/extract-index/
  frontmatter-splitter.js      # re-export from ../lib/ (temp compat)
tools/list-verified/
  list-verified.js             # NEW: pure JS replacement for .sh
.claude/coordination/hooks/
  write-coordination-gate.cjs  # MODIFIED: add records/index/** and records/capabilities/**
```

## Related Code Files

- **Create:** `tools/lib/frontmatter-splitter.js`, `tools/list-verified/list-verified.js`
- **Modify:** `.claude/coordination/hooks/write-coordination-gate.cjs`, `tools/extract-index/frontmatter-splitter.js`
- **Delete:** `tools/list-verified/list-verified.sh` (after JS version proven)

## Implementation Steps

### 1.1 Extract frontmatter-splitter to shared lib

1. Create `tools/lib/` directory
2. Move `tools/extract-index/frontmatter-splitter.js` to `tools/lib/frontmatter-splitter.js`
3. Update `tools/extract-index/frontmatter-splitter.js` to re-export from `../lib/`
4. Update `tools/extract-index/extract-index.js` import to use `../lib/` (or keep via re-export)
5. Verify `tools/extract-index/frontmatter-splitter.test.js` still passes

### 1.2 Update write-coordination-gate.cjs

**Step 1.2a — Extend WRITE_PATH_PATTERNS in gate-logic.js and gate-utils.cjs:**

Before updating the write gate hook, extend the shared pattern maps in BOTH files:

```javascript
// gate-logic.js and gate-utils.cjs
const WRITE_PATH_PATTERNS = {
  'records-evidence': 'records/evidence/**',
  'records-index': 'records/index/**',
  'records-capabilities': 'records/capabilities/**',
};
```

Verify `pathMatchesObservation` uses `WRITE_PATH_PATTERNS[obs.constraint]` to match. Without this extension, observations for index/capabilities will never match and the gate will always block.

**Step 1.2b — Update write-coordination-gate.cjs:**

Add two new allowed domains between the evidence check and the existing allowed domains:

```javascript
// After records/evidence/** check, before docs/** check:
const coordDir = path.join(__dirname, '..');

// Index and capabilities are agent-managed derived artifacts
if (globMatch('records/index/**', relPath) || globMatch('records/capabilities/**', relPath)) {
  const root = findProjectRoot();
  const obsDir = path.join(root, 'records', 'observations');
  const observations = readObservations(obsDir);
  const matchingObs = observations.find(obs => pathMatchesObservation(obs, relPath));

  if (matchingObs) {
    const staleness = checkObservationStaleness([matchingObs], coordDir);
    if (staleness.stale) {
      console.log(JSON.stringify({
        decision: 'escalate',
        reason: staleness.reason,
        file_path: filePath,
        observation_id: staleness.observation_id,
        inbound_gate: true,
      }));
      process.exit(2);
    }
    process.exit(0);
  }

  console.log(JSON.stringify({
    decision: 'block',
    reason: 'Index/capability files require observation. Explicit approval required.',
    file_path: filePath,
    matched_rule: 'records/{index,capabilities}/**',
  }));
  process.exit(2);
}
```

**Step 1.2c — Create observations for records-index and records-capabilities:**

The gate requires active observations for these paths. Create them:

```bash
# After deploying the gate change, create observations:
# (Via MCP record_observation tool or manually)
# constraint_type: write-path
# constraint: records-index
# description: "Agent-managed derived index entries from evidence files"
#
# constraint_type: write-path
# constraint: records-capabilities
# description: "Agent-managed derived capability records from surface adapters"
```

### 1.3 Rewrite list-verified in pure JS

The shell script `tools/list-verified/list-verified.sh` uses `yq` to query YAML. Rewrite in pure JS:

1. Read all YAML files in `records/claims/`
2. Parse with `yaml` package (already in dependencies)
3. Filter claims where any verification dimension has `status: verified`
4. Read evidence files from `records/evidence/` to build evidence mapping
5. Output structured JSON

**Scope:** Match the shell script's behavior (records/evidence only). Do NOT add records/index reading unless explicitly requested later.

Function signature:
```javascript
export function listVerifiedClaims(root) {
  // Returns { claims: Array<{id, subject, verified_dimensions}>, evidence: Array<{...}> }
}
```

### 1.4 TDD: Write tests first

**Test for frontmatter-splitter (shared lib):**
- Create `tools/lib/frontmatter-splitter.test.js` — same tests as original, verify re-export works

**Test for write gate:**
- Create `.claude/coordination/__tests__/write-gate-index-capabilities.test.cjs`
- Test: `records/index/foo.yaml` with active observation → allow
- Test: `records/index/foo.yaml` without observation → block
- Test: `records/capabilities/api-rest.yaml` with active observation → allow
- Test: `records/capabilities/api-rest.yaml` without observation → block

**Test for list-verified JS:**
- Create `tools/list-verified/list-verified.test.js`
- Test: finds verified claims
- Test: returns empty when no verified claims
- Test: maps evidence correctly

## Success Criteria

- [x] `tools/lib/frontmatter-splitter.js` exists and is imported by extract-index
- [x] `tools/extract-index/frontmatter-splitter.test.js` passes
- [x] Write gate allows `records/index/**` and `records/capabilities/**` with observation
- [x] Write gate blocks `records/index/**` and `records/capabilities/**` without observation
- [x] `tools/list-verified/list-verified.js` exists and outputs same data as `.sh`
- [x] `tools/list-verified/list-verified.test.js` passes
- [x] `pnpm test` passes (no regressions)

## Rollback Strategy

1. **Gate change:** `cp .claude/coordination/hooks/write-coordination-gate.cjs.bak .claude/coordination/hooks/write-coordination-gate.cjs`
2. **Shared lib:** Delete `tools/lib/`; restore `tools/extract-index/frontmatter-splitter.js`
3. **list-verified:** Keep `.sh` file; delete `.js` file; revert `package.json` script in Phase 7

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Gate change accidentally weakens security | Gate test covers both allow and block paths |
| list-verified JS output differs from .sh | Compare outputs on same dataset before deleting .sh |
| frontmatter-splitter move breaks extract-index | Keep re-export stub, run extract-index tests |
| WRITE_PATH_PATTERNS extension missed in one file | Update BOTH gate-logic.js and gate-utils.cjs; test both |

## Security Considerations

- `records/index/**` and `records/capabilities/**` require the same observation model as `records/evidence/**`
- No unconditional allow — always check observation + staleness
- Path traversal: `globMatch` already normalizes; verify `..` cannot escape
- Verify `pathMatchesObservation` lookups work for all three constraint types before deploying

## Next Steps

After Phase 1 completes: Phase 2 (tool registry + server refactor) can begin.
