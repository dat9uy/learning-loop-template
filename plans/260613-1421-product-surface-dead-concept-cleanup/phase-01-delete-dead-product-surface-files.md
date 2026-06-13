---
phase: 1
title: "Delete Dead Product-Surface Files"
status: complete
priority: P2
effort: "10min"
dependencies: []
---

# Phase 1: Delete Dead Product-Surface Files

## Overview
Delete 6 files and 2 directories that exist solely to serve the unbound product surface. None are imported by live MCP tools, hooks, or server.

## Related Code Files
- Delete: `tools/learning-loop-mcp/core/claim-verification-rules.js` (189 lines)
- Delete: `tools/learning-loop-mcp/core/experiment-proof-match.js`
- Delete: `tools/learning-loop-mcp/core/claim-update.js` (143 lines)
- Delete: `tools/learning-loop-mcp/tools/workflow-product-build-tool.js` (74 lines)
- Delete: `tools/learning-loop-mcp/core/generate-capabilities/` (directory: generate-capabilities.js, normalizer.js, adapters/)
- Delete: `tools/learning-loop-mcp/core/vendor-doc-assist/` (directory: doc-parser.js, suggestion-engine.js)

## Implementation Steps
1. `rm tools/learning-loop-mcp/core/claim-verification-rules.js`
2. `rm tools/learning-loop-mcp/core/experiment-proof-match.js`
3. `rm tools/learning-loop-mcp/core/claim-update.js`
4. `rm tools/learning-loop-mcp/tools/workflow-product-build-tool.js`
5. `rm -r tools/learning-loop-mcp/core/generate-capabilities/`
6. `rm -r tools/learning-loop-mcp/core/vendor-doc-assist/`
7. Run `pnpm test` — expect failures in dead test files (Phase 2 deletes those)

## Success Criteria
- [ ] All 6 files + 2 directories deleted
- [ ] `pnpm test` failures are ONLY in the 5 dead test files (bridge-1-e2e, generate-capabilities, fastapi-adapter, candidate-block, verify-claim-scalar-rules)
