---
phase: 3
title: "validate_records Tool"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: validate_records Tool

## Overview

Expose `tools/validate-records/validate-records.js` as an MCP tool. The tool validates all YAML records against JSON schemas and returns structured errors. Read-only — no auto-fix in MCP.

## Requirements

- Functional: MCP tool validates records and returns structured errors/warnings
- Non-functional: Read-only; no file modifications; sub-100ms on current record set

## Architecture

```
tools/constraint-gate/tools/
  validate-records-tool.js     # MCP tool wrapper
tools/validate-records/
  validate-records.js          # existing (unchanged)
  record-loader.js             # existing (unchanged)
  schema-loader.js             # existing (unchanged)
  record-validation-rules.js   # existing (unchanged)
```

The wrapper calls existing `loadRecords` + `validateRecords` + `validateDerivedAssurance` + `validateFilenameConventions` but returns structured JSON instead of console output + process.exit.

## Related Code Files

- **Create:** `tools/constraint-gate/tools/validate-records-tool.js`
- **Modify:** `tools/constraint-gate/server.js` (import + register)
- **Delete:** none

## Implementation Steps

### 3.1 Create validate-records-tool.js

```javascript
import { z } from "zod";
import { loadRecords } from "../../../validate-records/record-loader.js";
import { loadSchemas } from "../../../validate-records/schema-loader.js";
import { validateRecords } from "../../../validate-records/record-validation-rules.js";
import { validateDerivedAssurance } from "../../../validate-records/derived-claim-assurance.js";
import { validateFilenameConventions } from "../../../validate-records/filename-convention-validation.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

function parseErrorMessage(msg) {
  // Error format is "file: message" where message may contain ": "
  // Split on FIRST ": " only
  const match = msg.match(/^([^:]+):\s+(.+)$/);
  if (match) {
    return { record: match[1].trim(), message: match[2].trim() };
  }
  return { record: "unknown", message: msg };
}

export const validateRecordsTool = {
  name: "validate_records",
  description: "Validate YAML records against JSON schemas. Use AFTER writing records to verify correctness. Returns structured errors and warnings.",
  schema: {
    allow_disallowed_fixtures: z.boolean().optional().describe("Allow fixtures that use disallowed source_ref patterns (for test fixtures)"),
    root: z.string().optional().describe("Project root directory (default: auto-detected)"),
  },
  handler: async (args) => {
    const root = resolveRoot(args.root);

    let schemas, records;
    try {
      schemas = loadSchemas(root);
      records = loadRecords(root);
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            valid: false,
            error: true,
            message: `Failed to load records or schemas: ${error.message}`,
          }),
        }],
        isError: true,
      };
    }

    const validationErrors = validateRecords(records, schemas, root, args.allow_disallowed_fixtures || false);
    const derivedErrors = validateDerivedAssurance(records);
    const warnings = validateFilenameConventions(records);

    const errors = [...validationErrors, ...derivedErrors];

    const result = {
      valid: errors.length === 0,
      record_count: records.length,
      errors: errors.map(parseErrorMessage),
      warnings: warnings.map(parseErrorMessage),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "validate_records",
      decision: result.valid ? "ok" : "block",
      record_count: records.length,
      error_count: errors.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### 3.2 Register in server.js

Add import and `registerTool(server, validateRecordsTool)`.

### 3.3 TDD: Write tests first

**Test for validate-records-tool.js:**
- Create `tools/constraint-gate/tools/validate-records-tool.test.js`
- Test: valid records → `{ valid: true, errors: [] }`
- Test: invalid record → `{ valid: false, errors: [{ record, message }] }`
- Test: `allow_disallowed_fixtures` passes disallowed sources
- Test: gate log entry written on call

**Negative fixture test:**
- Test with known-bad fixture → error count > 0, correct message parsed

## Success Criteria

- [x] `validate_records` callable via MCP
- [x] Returns `{ valid, record_count, errors[], warnings[] }`
- [x] Each error has `{ record, message }` structure
- [x] Read-only: never modifies files
- [x] Gate log entry written per call
- [x] Tests pass

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Error message parsing breaks on unusual formats | Fallback to "unknown" record; log raw message |
| loadRecords throws on parse error | Wrap in try/catch; return error as structured result |
| Performance on large record set | Current set is small; if grows, consider caching |

## Security Considerations

- Read-only: no file writes, no schema changes
- `root` param defaults to auto-detected; only override in tests
- No path traversal via `root` — validate it resolves within project

## Rollback Strategy

1. Remove import and `registerTool` call from `server.js`
2. Delete `tools/constraint-gate/tools/validate-records-tool.js`
3. `git checkout -- tools/constraint-gate/server.js` (if on feature branch)

## Next Steps

After Phase 3 completes: Phase 4 (update_claim_verification) begins next. Phases 3-6 add tools serially to `server.js`.
