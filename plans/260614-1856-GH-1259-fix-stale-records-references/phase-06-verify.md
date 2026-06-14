---
phase: 6
title: "Verify"
status: completed
priority: P1
effort: "1h"
dependencies: [2, 3, 4, 5]
---

# Phase 6: Verify

## Overview

Run the full verification suite, confirm the original symptom is gone, confirm runtime-state.jsonl is protected, and update the master tracker.

## Implementation Steps

1. Run `pnpm test` and capture pass/fail/skip counts.
2. Manually reproduce the original symptom:
   - With no active vnstock runtime-state entry:
     ```bash
     echo '{"tool_name":"bash","tool_input":{"command":"npm install"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js
     ```
     → decision should be `block` with `observation_required: true`.
   - With an active vnstock runtime-state entry:
     → decision should be `ok` for `vendor-api` / `package-manager` mapped commands.
3. Verify direct writes to protected state files are blocked:
   - `echo '{"tool_name":"bash","tool_input":{"command":"echo x > runtime-state.jsonl"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js` → block.
   - `echo '{"tool_name":"bash","tool_input":{"command":"echo x > records/observations/x.yaml"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js` → block.
   - `echo '{"tool_name":"bash","tool_input":{"command":"echo x > records/evidence/x.md"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js` → block (records-evidence unlock removed).
4. Check that `records/observations/` is no longer read by running:
   - `grep -R "readObservations" tools/learning-loop-mcp/ --include="*.js"`
   - Only archive/conversion scripts should reference it; gate/tool code should not.
5. Update `plans/reports/productization-260612-1530-master-tracker.md` Phase A section to note the closeout of this migration gap.
6. File a `meta_state_resolve` for `meta-260614T1842Z-the-bash-gate-still-reads-constraint-observations-from-recor` if all checks pass.

## Success Criteria

- [ ] `pnpm test` passes with no new failures (target: at least the pre-fix baseline).
- [ ] Original reproduction shows the gate now evaluates constraints from runtime-state.jsonl.
- [ ] `runtime-state.jsonl` direct writes are blocked by both bash and write gates.
- [ ] `records/**` write blocking still works.
- [ ] Master tracker updated.
- [ ] Meta-state finding resolved or moved to active with a clear remaining scope.
