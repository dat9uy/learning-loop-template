---
phase: 7
title: "list_verified_claims + Integration"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: list_verified_claims + Integration

## Overview

Create the final MCP tool `list_verified_claims` from the Phase 1 pure-JS rewrite, then run integration tests and verify the complete server.

## Requirements

- Functional: `list_verified_claims` exposes verified claims + evidence mapping
- Non-functional: Drop `yq` dependency; complete server has all 12 tools

## Architecture

```
tools/constraint-gate/tools/
  list-verified-tool.js        # MCP tool wrapper
tools/list-verified/
  list-verified.js             # Phase 1 pure JS rewrite
```

## Related Code Files

- **Create:** `tools/constraint-gate/tools/list-verified-tool.js`
- **Modify:** `tools/constraint-gate/server.js` (final registration), `package.json` (update scripts)
- **Delete:** `tools/list-verified/list-verified.sh` (after JS version proven)

## Implementation Steps

### 7.1 Create list-verified-tool.js

```javascript
import { listVerifiedClaims } from "../../../list-verified/list-verified.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const listVerifiedTool = {
  name: "list_verified_claims",
  description: "List all verified claims and their supporting evidence. Read-only reporting tool.",
  schema: {}, // no params
  handler: async () => {
    const root = resolveRoot();
    const result = listVerifiedClaims(root);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "list_verified_claims",
      claim_count: result.claims.length,
      evidence_count: result.evidence.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### 7.2 Final server.js registration

Ensure all 12 tools are registered:
1. `check_gate` (existing)
2. `record_observation` (existing)
3. `update_observation` (existing)
4. `notify_artifact_change` (existing)
5. `trigger_workflow` (existing)
6. `validate_records` (new)
7. `update_claim_verification` (new)
8. `extract_index_entries` (new)
9. `search_index_entries` (new)
10. `generate_capability_records` (new)
11. `list_runtime_probes` (new)
12. `list_verified_claims` (new)

### 7.3 Update package.json scripts

Replace `list-verified` shell script call:
```json
"list:verified": "node tools/list-verified/list-verified.js"
```

### 7.4 Delete list-verified.sh (after proving parity)

**Definition of "proven":**
1. Run both `.sh` and `.js` on same dataset
2. Compare JSON outputs — must be structurally equivalent
3. All `list-verified.test.js` tests pass
4. Keep `.sh` until Phase 7 success criteria are met; then delete

**Rollback:** If JS version has issues, restore `.sh` from git and revert `package.json` script.

### 7.5 Integration test

Create `tools/constraint-gate/integration.test.js`:
- Start MCP server in subprocess with **30s timeout**
- Send `ListTools` request → verify all 12 tools returned
- Call each tool with valid args → verify structured response
- Call each tool with invalid args → verify error handling (error boundary returns `isError: true`)
- Verify gate-log.jsonl has entries for all calls
- **Cleanup:** kill subprocess on test completion or timeout; remove temp files

### 7.6 TDD: Write tests first

**Test for list-verified-tool.js:**
- Create `tools/constraint-gate/tools/list-verified-tool.test.js`
- Test: returns claims array with verified_dimensions
- Test: returns evidence array with capability/dimension mapping
- Test: empty repo → `{ claims: [], evidence: [] }`

**Integration test:**
- Create `tools/constraint-gate/integration.test.js`
- Test: server responds to initialization
- Test: all 12 tools listed
- Test: round-trip for each tool category (gate, observation, validation, index, capability, probe, report)

## Success Criteria

- [x] `list_verified_claims` callable via MCP
- [x] Returns `{ claims: [...], evidence: [...] }`
- [x] `list-verified.sh` deleted; `list-verified.js` is sole implementation
- [x] `package.json` script updated
- [x] Server has exactly 12 registered tools
- [x] Integration test passes
- [x] All existing tests pass (no regressions)
- [x] `pnpm check` passes (validate:records + test)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Integration test is flaky | Use stdio transport, not network; cleanup temp files |
| Missing tool in final registration | Integration test lists all tools |
| list-verified.js output differs from .sh | Compare on same dataset before deleting .sh |

## Rollback Strategy

1. Remove `list-verified-tool.js` import and `registerTool` call from `server.js`
2. Restore `list-verified.sh` from git
3. Revert `package.json` script to use `.sh`
4. `git checkout -- tools/constraint-gate/server.js tools/list-verified/list-verified.sh package.json`

## Security Considerations

- `list_verified_claims` is read-only
- No gate concerns

## Next Steps

After Phase 7 completes: Plan is ready for `/ck:cook` implementation.

## Post-Implementation Checklist

- [x] Update `docs/system-architecture.md` with new MCP tools
- [x] Update `docs/operator-guide.md` with tool descriptions
- [x] Verify `.mcp.json` registration is correct (if config file exists)
