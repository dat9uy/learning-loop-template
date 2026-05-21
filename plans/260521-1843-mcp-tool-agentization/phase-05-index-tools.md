---
phase: 5
title: "Index Tools"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 5: Index Tools

## Overview

Expose `extract-index` and `search-index` as MCP tools: `extract_index_entries` and `search_index_entries`.

## Requirements

- Functional: Extract index entries from evidence files; search index by capability/dimension/status
- Non-functional: Extract is idempotent (safe to call multiple times); search is read-only

## Architecture

```
tools/constraint-gate/tools/
  extract-index-tool.js        # MCP tool wrapper
tools/extract-index/
  extract-index.js             # existing (refactor for library use)
tools/search-index/
  search-index.js              # existing (already exports searchIndex function)
```

## Related Code Files

- **Create:** `tools/constraint-gate/tools/extract-index-tool.js`, `tools/constraint-gate/tools/search-index-tool.js`
- **Modify:** `tools/extract-index/extract-index.js` (extract pure function), `tools/constraint-gate/server.js`
- **Delete:** none

## Implementation Steps

### 5.1 Use existing runExtraction export

`extract-index.js` already exports `runExtraction(root, args)` (line 247). Use it directly instead of creating a new function.

Verify the export signature: `runExtraction(root, { capability, dryRun, verbose })` returns structured results. No refactor needed.

### 5.2 Create extract-index-tool.js

```javascript
import { z } from "zod";
import { runExtraction } from "../../../extract-index/extract-index.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const extractIndexTool = {
  name: "extract_index_entries",
  description: "Extract index entries from evidence markdown files. Idempotent — safe to call multiple times. Use after writing evidence to update the index.",
  schema: {
    capability: z.string().optional().describe("Filter to specific capability (default: all)"),
    dry_run: z.boolean().optional().describe("Preview changes without writing"),
    verbose: z.boolean().optional().describe("Print detailed progress"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const result = await runExtraction(root, {
      root,
      capability: args.capability,
      dryRun: args.dry_run,
      verbose: args.verbose,
    });

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "extract_index_entries",
      ...result.stats,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### 5.3 Create search-index-tool.js

`search-index.js` already exports `searchIndex`. Direct wrapper:

```javascript
import { z } from "zod";
import { searchIndex } from "../../../search-index/search-index.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const searchIndexTool = {
  name: "search_index_entries",
  description: "Search index entries by capability, dimension, and status. Read-only query.",
  schema: {
    capability: z.string().optional().describe("Filter by capability name"),
    dimension: z.string().optional().describe("Filter by verification dimension (static, install, runtime, product)"),
    status: z.string().optional().describe("Filter by verification status (claimed, verified, rejected)"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const results = searchIndex(root, {
      capability: args.capability,
      dimension: args.dimension,
      status: args.status,
    });

    const result = {
      count: results.length,
      results: results.map((r) => ({ id: r.id, frontmatter: r.frontmatter })),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "search_index_entries",
      count: results.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### 5.4 Register in server.js

Add imports and register both tools.

### 5.5 TDD: Write tests first

**Test for extract-index-tool.js:**
- Create `tools/constraint-gate/tools/extract-index-tool.test.js`
- Test: dry_run=true → no files written, stats.preview
- Test: normal run → entries written to `records/index/`
- Test: capability filter → only matching capability processed
- Test: gate log entry written

**Test for search-index-tool.js:**
- Create `tools/constraint-gate/tools/search-index-tool.test.js`
- Test: no filters → all entries returned
- Test: capability filter → only matching entries
- Test: dimension + status filter → combined filter
- Test: empty result → `{ count: 0, results: [] }`

## Success Criteria

- [ ] `extract_index_entries` callable via MCP
- [ ] `search_index_entries` callable via MCP
- [ ] Extract is idempotent (same result on second call)
- [ ] Search is read-only
- [ ] CLI `pnpm extract:index` still works
- [ ] CLI `pnpm search:index` still works
- [ ] Tests pass

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| extract-index modifies files → gate block | Phase 1 added records/index to allow list |
| extract-index errors leave partial writes | Existing file-writer.js handles this; tool returns errors array |
| search-index returns huge result set | Current index is small; add pagination if needed later |

## Rollback Strategy

1. Remove imports and `registerTool` calls from `server.js`
2. Delete `tools/constraint-gate/tools/extract-index-tool.js` and `search-index-tool.js`

## Security Considerations

- `extract_index_entries` writes to `records/index/**` — gated by observation requirement
- `search_index_entries` is read-only — no gate concern

## Next Steps

After Phase 5 completes: Phase 6 (capability + probe tools) begins next.
