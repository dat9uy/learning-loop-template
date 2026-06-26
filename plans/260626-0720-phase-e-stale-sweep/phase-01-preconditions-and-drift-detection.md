---
phase: 1
title: "Preconditions & Drift Detection — verify all 14 entries have grounded fingerprints"
status: pending
priority: P3
dependencies: []
---

# Phase 1: Preconditions & Drift Detection

## Overview

Verify each of the 14 stale `mechanism_check=true` entries has an `evidence_code_ref` path that still exists on disk and a `code_fingerprint` that matches the file's current SHA-256. Categorize each entry as `match` (no action needed) or `drift` (must refresh before Phase 3 patch). Output an inline inventory table for the operator.

**Risk:** Very Low — read-only operations (no MCP mutations in this phase).

## Requirements

- Functional:
  - All 14 entries' `evidence_code_ref` paths exist on disk
  - All 14 entries' `code_fingerprint` matches the file's current SHA-256
  - Drift is detected and the affected entry id is logged for Phase 2
- Non-functional:
  - Pre-condition probe is idempotent and re-runnable
  - Operator reads the inline inventory table (logged to session transcript) before authorizing Phase 2
- TDD gate: 13 entries categorized `match`; 1 entry (`meta-260609T1206Z`) categorized `drift`

## Architecture

The pre-condition probe runs as a series of read-only MCP tool calls + `node --test` style assertions:

1. **Step 1:** `meta_state_list --status stale --compact=false` → returns 16 entries; filter to `mechanism_check=true` → 14 entries.
2. **Step 2:** For each of the 14 entries, resolve the `evidence_code_ref` path (strip `#anchor` suffix via `stripEvidenceAnchor` from `core/gate-logic.js`; if relative, prepend `resolveRoot()`).
3. **Step 3:** For each resolved path, run `existsSync(path)` (must be `true`) and compute `sha256sum` (compare to stored `code_fingerprint`).
4. **Step 4:** Output inline inventory table; operator confirms before Phase 2.

The fingerprint comparison is the SP2 grounding invariant: a stored fingerprint matches the file's current hash iff the cited file has not been modified since the entry was last verified/refreshed. Drift indicates a file edit happened between verification and Phase 3 execution.

## Related Code Files

- No code file modification
- MCP tool calls:
  - `mcp__learning-loop__mastra_meta_state_list` (filter: `status=stale`, `compact=false`)
- Bash: `existsSync`, `sha256sum`, `stripEvidenceAnchor` (imported from `core/gate-logic.js`)

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `meta-state.jsonl` | Read-only | 14 entries | No mutation in this phase |
| `tools/learning-loop-mastra/core/gate-logic.js` | Read-only (`stripEvidenceAnchor` import) | 0 | Re-uses existing utility |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `meta_state_list --status stale --compact=false` returns 16 entries | Before phase 1 | Registry filter |
| 2 | Filter to `mechanism_check === true` returns 14 entries | Before phase 1 | Scope verification |
| 3 | All 14 entries' `evidence_code_ref` paths exist (`existsSync` returns true for each) | Before phase 1 | File existence |
| 4 | 13 entries: stored fingerprint === sha256sum of file | Before phase 1 | Match category |
| 5 | 1 entry: stored fingerprint !== sha256sum of file (`meta-260609T1206Z`: stored `3ba7a862...`, file `24b3eb25...`) | Before phase 1 | Drift category |
| 6 | Inline inventory table matches the 14-row table in `plan.md` Scope Inventory | Before phase 2 | Operator confirmation |

## Function/Interface Checklist (deep mode)

- [ ] `meta_state_list` filter is exact: `status === "stale"` AND `mechanism_check === true`
- [ ] `stripEvidenceAnchor` correctly strips `#anchor` suffix before path resolution
- [ ] `sha256sum` output is normalized to lowercase hex (no trailing newline)
- [ ] Comparison is `stored === current` (not `startsWith` or partial match)
- [ ] Inline inventory table is human-readable (one row per entry, 5 columns)

## Dependency Map (deep mode)

**Depends on:**
- Plan 3 (DONE) — established `meta_state_patch` as canonical mechanism (D7)
- Plan 1 (DONE) — established the `meta_state_list --compact` filter pattern

**Does not depend on:**
- Any phase of this plan

**Does not block:**
- Anything — Phase 1 is read-only

## Implementation Steps

### Step 1: Fetch all stale entries

```bash
mcp__learning-loop__mastra_meta_state_list \
  --status stale \
  --compact false
```

Expected response: 16 entries with `status: "stale"`. Filter client-side to `mechanism_check === true` → 14 entries.

### Step 2: Filter to mechanism_check=true and resolve paths

For each of the 16 stale entries, evaluate `entry.mechanism_check`:

```javascript
const mcTrueEntries = entries.filter((e) => e.mechanism_check === true);
// Expected count: 14
```

For each of the 14 entries, resolve the evidence_code_ref to a filesystem path:

```javascript
import { stripEvidenceAnchor } from "./tools/learning-loop-mastra/core/gate-logic.js";
import { resolveRoot } from "./tools/learning-loop-mastra/lib/resolve-root.js";
import { isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";

const root = resolveRoot();
const refPath = entry.evidence_code_ref; // e.g., "tools/learning-loop-mastra/core/gate-logic.js#splitSegments"
const stripped = stripEvidenceAnchor(refPath);
const fullPath = isAbsolute(stripped) ? stripped : join(root, stripped);
// existsSync(fullPath) must be true
```

### Step 3: Compute current fingerprints

```bash
sha256sum <fullPath>
# Output: "<lowercase-hex>  <path>"
```

Parse the hash (the first whitespace-separated field). Compare to `entry.code_fingerprint` (which is `"sha256:<lowercase-hex>"`).

### Step 4: Categorize and output inventory

Categorize each entry:

- **match:** existsSync === true AND `entry.code_fingerprint === "sha256:" + currentHash`
- **drift:** existsSync === true AND `entry.code_fingerprint !== "sha256:" + currentHash`
- **missing:** existsSync === false (should not occur for any of the 14; if it does, surface immediately to operator — out of scope for this plan)

Output the inline inventory table to the operator:

```text
Stale Sweep Inventory (14 entries, generated 2026-06-26)
# | Entry id (truncated) | evidence_code_ref | Stored fp | Current fp | Category
1 | meta-260606T1830Z-context-pollution-... | core/gate-logic.js#splitSegments | dcd915b8... | dcd915b8... | match
2 | meta-260609T1206Z-handoff-md-... | docs/mcp-server-restart-protocol.md | 3ba7a862... | 24b3eb25... | DRIFT
3 | meta-260613T0138Z-vnstock-device-... | scripts/convert-ledger-to-sidecar.mjs | 7bde6246... | 7bde6246... | match
4 | meta-260613T1615Z-import-chain-... | core/gate-logic.js#applyPromotedRules | dcd915b8... | dcd915b8... | match
5 | meta-260614T1236Z-no-mcp-path-... | tools/legacy/meta-state-patch-tool.js | faf2dd37... | faf2dd37... | match
6 | meta-260615T1148Z-the-runtime-... | core/gate-logic.js#GLOB_SCOPE_WHITELIST | dcd915b8... | dcd915b8... | match
7 | meta-260615T1920Z-the-new-strip-... | core/gate-logic.js#stripNodeEvalBody | dcd915b8... | dcd915b8... | match
8 | meta-260616T0222Z-inbound-gate-... | hooks/legacy/inbound-gate.js#findStaleObservations | ad37242b... | ad37242b... | match
9 | meta-260616T1453Z-two-more-dead-... | core/gate-logic.js#WRITE_PATH_PATTERNS | dcd915b8... | dcd915b8... | match
10 | meta-260618T0558Z-post-migration-... | mastra/create-loop-tool.js | a4921a94... | a4921a94... | match
11 | meta-260619T2233Z-the-meta-state-... | tools/legacy/meta-state-log-change-tool.js:102-113 | 9bb58753... | 9bb58753... | match
12 | meta-260619T2237Z-the-meta-state-... | tools/legacy/meta-state-report-tool.js | fa04f0fe... | fa04f0fe... | match
13 | meta-260623T1542Z-the-pr-body-... | .github/workflows/meta-state-pr-body-advisory.yml | ecb0279b... | ecb0279b... | match
14 | meta-260624T1920Z-code-fingerprint-... | core/check-grounding.js#computeFileHash | f1c2388a... | f1c2388a... | match

Drift summary: 1 entry (entry #2 meta-260609T1206Z-handoff-md-...)
Phase 2 target: meta_state_refresh_fingerprint for entry #2 only
```

### Step 5: Operator confirmation

The operator reads the table and confirms:
- 13 entries are `match` (no Phase 2 action needed for those)
- 1 entry is `drift` (`meta-260609T1206Z-handoff-md-...`) → Phase 2 will refresh

If any entry is `missing`, STOP and surface to operator — this plan cannot handle a missing file.

## Success Criteria

- [ ] Step 1 returns 16 stale entries
- [ ] Step 2 filter returns 14 mechanism_check=true entries
- [ ] Step 3 computes current SHA-256 for each of the 14 paths
- [ ] Step 4 inline inventory table shows 13 match + 1 drift
- [ ] Step 5 operator confirms the table and authorizes Phase 2

## Risk Assessment

- **R-Phase1-A:** `meta_state_list` returns 0 stale entries (registry already swept). **Mitigation:** Plan is a no-op; write a journal entry noting "sweep was redundant; registry already clean"; exit gracefully.
- **R-Phase1-B:** `meta_state_list` returns a different count (e.g., 17 or 18). **Mitigation:** Reconcile against `plan.md` Scope Inventory; if new entries appeared, add them to Phase 3 batch (still within BATCH_SIZE_LIMIT 500).
- **R-Phase1-C:** A `evidence_code_ref` path doesn't exist (`missing` category). **Mitigation:** Surface immediately; exit Phase 1; file a separate meta_state finding for the missing path; do not proceed.
- **R-Phase1-D:** The `stripEvidenceAnchor` utility doesn't handle a specific anchor format. **Mitigation:** Manual path resolution fallback: take the substring before `#` if present; if no `#`, use the full path.
- **R-Phase1-E:** Concurrent writers add new stale mechanism_check=true entries between Step 1 and Phase 3. **Mitigation:** Phase 3 re-reads the registry before constructing the batch payload; entries added between Phase 1 and Phase 3 are added to the batch.
