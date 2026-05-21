---
phase: 4
title: "update_claim_verification Tool"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 4: update_claim_verification Tool

## Overview

Expose `tools/claim-verification/verify-claim.js` as an MCP tool. This is the most complex CLI → MCP conversion due to many positional args and the need for structured enum validation.

## Requirements

- Functional: Update claim verification status with enum-validated params, dry-run preview
- Non-functional: Safer than CLI (enums prevent typos); preview mode before apply

## Architecture

```
tools/constraint-gate/tools/
  update-claim-tool.js         # MCP tool wrapper
tools/claim-verification/
  verify-claim.js              # existing (refactor for library use)
```

The existing `verify-claim.js` is CLI-focused (calls `process.exit`, `console.error`). Refactor to export a pure function that the MCP tool wraps.

## Related Code Files

- **Create:** `tools/constraint-gate/tools/update-claim-tool.js`
- **Modify:** `tools/claim-verification/verify-claim.js` (extract pure function), `tools/constraint-gate/server.js`
- **Delete:** none

## Implementation Steps

### 4.1 Refactor verify-claim.js for library use

**CRITICAL:** Before extracting, audit ALL internal functions for `process.exit` calls. `verify-claim.js` has `fail()` which calls `process.exit(1)` — this will kill the MCP server if triggered.

**Audit checklist:**
- [ ] Replace `fail()` with thrown errors in the library path
- [ ] Thread `root` through ALL internal functions (currently module-level `const root`)
- [ ] Replace `console.error` in library path with returned error messages
- [ ] Ensure `main()` CLI wrapper catches errors and calls `process.exit`

Extract a pure `updateClaimVerification` function from the CLI body:

```javascript
// tools/claim-verification/verify-claim.js
// Existing CLI code stays; add export:

export function updateClaimVerification({
  root,
  claimId,
  dimension,
  status,
  reason,
  scope,
  output,
  proofRefs = [],
  decisionRefs = [],
  blockedActions = [],
  apply = false,
}) {
  // Return { updated: boolean, claim_id, preview?: string, validation_errors?: string[] }
  // Throws errors instead of process.exit; callers handle exceptions
}
```

Keep existing CLI entry point (`main()` function) unchanged — it calls `updateClaimVerification`, catches errors, and handles console/process.

### 4.2 Create update-claim-tool.js

```javascript
import { z } from "zod";
import { updateClaimVerification } from "../../../claim-verification/verify-claim.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

const DIMENSIONS = ["static", "install", "runtime", "product"];
const STATUSES = ["claimed", "verified", "rejected"];
const CLAIM_ID_PATTERN = /^[a-z0-9-]+$/;

export const updateClaimTool = {
  name: "update_claim_verification",
  description: "Update a claim's verification status for a specific dimension. Use with apply=false first to preview, then apply=true to commit.",
  schema: {
    claim_id: z.string().regex(CLAIM_ID_PATTERN).describe("The claim ID to update"),
    dimension: z.enum(DIMENSIONS).describe("Verification dimension"),
    status: z.enum(STATUSES).describe("New verification status"),
    reason: z.string().min(1).describe("Reason for the status change"),
    scope: z.string().optional().describe("Optional scope string"),
    output: z.string().optional().describe("Output capture level"),
    proof_refs: z.array(z.string()).optional().describe("Proof reference IDs"),
    decision_refs: z.array(z.string()).optional().describe("Decision reference IDs"),
    blocked_actions: z.array(z.string()).optional().describe("Actions blocked pending verification"),
    apply: z.boolean().optional().default(false).describe("If false, preview only. If true, write changes."),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const result = await updateClaimVerification({
      root,
      claimId: args.claim_id,
      dimension: args.dimension,
      status: args.status,
      reason: args.reason,
      scope: args.scope,
      output: args.output,
      proofRefs: args.proof_refs,
      decisionRefs: args.decision_refs,
      blockedActions: args.blocked_actions,
      apply: args.apply,
    });

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "update_claim_verification",
      claim_id: args.claim_id,
      dimension: args.dimension,
      status: args.status,
      apply: args.apply,
      updated: result.updated,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### 4.3 Register in server.js

Add import and `registerTool(server, updateClaimTool)`.

### 4.4 TDD: Write tests first

**Test for update-claim-tool.js:**
- Create `tools/constraint-gate/tools/update-claim-tool.test.js`
- Test: dry run (apply=false) → `{ updated: false, preview: "..." }`
- Test: apply (apply=true) → `{ updated: true, claim_id }`
- Test: invalid dimension → Zod validation error (caught by MCP layer)
- Test: invalid status → Zod validation error
- Test: gate log entry written

**Test for refactored verify-claim.js:**
- Update `tools/claim-verification/verify-claim-scalar-rules.test.js`
- Verify CLI still works (main() path)
- Verify `updateClaimVerification` export works with same inputs

## Success Criteria

- [ ] `update_claim_verification` callable via MCP
- [ ] Enum validation on `dimension` and `status` (Zod)
- [ ] Dry-run preview mode (apply=false)
- [ ] Apply mode writes claim YAML (apply=true)
- [ ] CLI `pnpm verify:claim` still works unchanged
- [ ] Tests pass

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Refactor breaks CLI | Keep main() wrapper; test CLI separately |
| apply=false still modifies files | Verify preview path has no fs.writeFileSync calls |
| Zod enum rejects valid legacy values | DIMENSIONS/STATUSES match schema exactly |

## Rollback Strategy

1. Remove import and `registerTool` call from `server.js`
2. Delete `tools/constraint-gate/tools/update-claim-tool.js`
3. Revert `verify-claim.js` refactor (restore from git)

## Security Considerations

- `apply: true` modifies `records/claims/*.yaml` — same as existing CLI
- Write gate does NOT block claims (not in block list) — intentional; claims are agent-managed
- `claim_id` validated with `[a-z0-9-]+` regex in Zod schema
- `verify-claim.js` refactor must eliminate ALL `process.exit` calls from library path

## Next Steps

After Phase 4 completes: Phase 5 (index tools) begins next.
