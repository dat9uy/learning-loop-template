---
phase: 4
title: "Integration Validation"
status: completed
effort: "1h"
dependencies: [3]
---

# Phase 4: Integration Validation

## Overview

Run the full test suite, verify the gate behavior end-to-end with real observations, and ensure no regressions.

## Validation Steps

1. Run `pnpm test` — all 224+ tests must pass
2. Run `pnpm validate:records` — must exit 0
3. Run `pnpm extract:index` — must exit 0
4. Run the bash gate directly against the test cases:

```bash
# Test 1: sudo command with no observation -> should block (not escalate)
echo '{"tool_name":"Bash","tool_input":{"command":"sudo apt update"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js

# Test 2: package-manager command with no observation -> should block (not escalate)
echo '{"tool_name":"Bash","tool_input":{"command":"pnpm add simple-git-hooks"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js

# Test 3: vendor-api command with vendor-api observation and exhausted budget -> should escalate
echo '{"tool_name":"Bash","tool_input":{"command":"curl https://api.vnstock.com/data"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js
```

5. Verify the error message for vendor-api escalation includes `vnstock_vendor` and `device_slots`:
   ```json
   { "reason": "Budget exhausted for constraint \"vendor-api\" (vnstock_vendor device_slots)." }
   ```

6. Check that `cross-surface.test.js` still passes with the updated assertions.

## Success Criteria

- [x] All 259 tests pass
- [x] `pnpm validate:records` exits 0
- [x] `pnpm extract:index` exits 0
- [x] Gate escalation scoped correctly: vendor-api only escalates vendor-api, sudo only escalates sudo
- [x] Error message includes `external_system` and `resource` when available
- [x] No regressions in write gate, inbound gate, or MCP server
