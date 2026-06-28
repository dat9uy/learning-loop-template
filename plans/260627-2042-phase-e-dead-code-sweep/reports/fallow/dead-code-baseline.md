## Fallow: 66 issues found

### Unused files (14)

- `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js`
- `__tests__/with-mcp-server.js`
- `core/lib/source-ref-validator.js`
- `core/list-probes.js`
- `core/record-validation-rules.js`
- `hooks/legacy/bash-gate.js`
- `hooks/legacy/inbound-gate.js`
- `hooks/legacy/lib/protocol-adapter.js`
- `hooks/legacy/recurrence-check-on-start.js`
- `hooks/legacy/session-start-inject-discoverability.cjs`
- `hooks/legacy/write-gate.js`
- `interface/contract.js`
- `tools/legacy/scripts/backfill-mechanism-check.mjs`
- `tools/legacy/scripts/fix-loop-design-refs.mjs`

### Unused exports (42)

- `core/check-grounding.js`
  - :44 `META_STATE_GROUNDING_STATUSES`
  - :48 `META_STATE_GROUNDING_DRIFT_KINDS`
  - :56 `FileNotFoundError`
- `core/consistency-check.js`
  - :16 `META_STATE_CONSISTENCY_INVARIANTS`
- `core/derive-status.js`
  - :8 `META_STATE_DERIVATION_KINDS`
  - :12 `META_STATE_DERIVED_STATUSES`
  - :16 `META_STATE_RECOMMENDATIONS`
- `core/entry/index.js`
  - :8 `createChangeLog` (re-export)
  - :8 `createFinding` (re-export)
  - :8 `createLoopDesign` (re-export)
  - :8 `createRule` (re-export)
  - :8 `deepFreeze` (re-export)
  - :30 `validateCrossRefs`
  - :50 `findOrphans`
  - :58 `outboundRefsAll`
- `core/gate-logic.js`
  - :92 `splitSegments`
  - :168 `stripMessageFlags`
  - :225 `stripNodeEvalBody`
  - :281 `evaluateBudget`
- `core/meta-state.js`
  - :12 `TERMINAL_STATUSES`
  - :232 `metaStateEntrySchema`
  - :316 `metaStateEntryPatchSchema`
  - :322 `InvalidEntryError`
  - :495 `deleteEntry`
  - :664 `tryClaimSessionId`
- `core/record-validation-rules.js`
  - :84 `validateRecords`
  - :215 `validateAllowedLocalPath`
  - :243 `validateLocalRef`
- `core/recurrence-tracker.js`
  - :19 `normalizePrefix`
  - :38 `findRecurrentGroups`
- `core/runtime-agnostic-checklist.js`
  - :41 `stripCommentsAndStrings`
- `core/surfaces.js`
  - :24 `getAllCoordinationPaths`
  - :36 `writeToAllSurfaces`
- `hooks/legacy/lib/protocol-adapter.js`
  - :13 `parseInput`
  - :26 `normalizeToolName`
  - :37 `extractCommand`
  - :45 `extractFilePath`
  - :54 `extractPrompt`
  - :62 `formatOutput`
  - :70 `exitCode`
  - :78 `formatSoftWarning`
  - :97 `formatHookDecision`

### Unresolved imports (1)

- `mastra/workflows/workflow-intake-orient.js`
  - :50 `../core/file-readers.js`

### Duplicate exports (1)

- `instructions` in `mastra/agents/instructions/intake-agent.js`, `mastra/agents/instructions/scout-agent.js`, `mastra/agents/instructions/self-improvement-agent.js`

### Circular dependencies (1)

- `core/check-grounding.js` → `core/gate-logic.js` → `core/check-grounding.js`

### Stale suppressions (7)

- `core/meta-state.js`:1 `// fallow-ignore-file —` ('—' is not a recognized fallow issue kind. Other tokens on this line still apply.)
- `core/meta-state.js`:1 `// fallow-ignore-file registry` ('registry' is not a recognized fallow issue kind. Other tokens on this line still apply.)
- `core/meta-state.js`:1 `// fallow-ignore-file CRUD` ('CRUD' is not a recognized fallow issue kind. Other tokens on this line still apply.)
- `core/meta-state.js`:1 `// fallow-ignore-file with` ('with' is not a recognized fallow issue kind. Other tokens on this line still apply.)
- `core/meta-state.js`:1 `// fallow-ignore-file Zod` ('Zod' is not a recognized fallow issue kind. Other tokens on this line still apply.)
- `core/meta-state.js`:1 `// fallow-ignore-file CAS` ('CAS' is not a recognized fallow issue kind. Other tokens on this line still apply.)
- `core/meta-state.js`:1 `// fallow-ignore-file TTL` ('TTL' is not a recognized fallow issue kind. Other tokens on this line still apply.)


