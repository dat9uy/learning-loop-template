# Legacy Pins (Parity-Test + Parity-Semantic)

Files that must NOT be moved to `tools/learning-loop-mastra/tools/handlers/` (or any other "legacy" location), because they enforce parity contracts that the loop's wire-format correctness depends on.

## Convention

There are two categories of parity-pinned files:

1. **Parity-test pins** — workflows/files that the parity-test suite depends on for its assertions. Moving them breaks the tests.
2. **Parity-semantic pins** — files that implement the parity contract (wire-format guarantees for MCP tool schemas). Moving them breaks the loop's runtime correctness.

Both categories are listed here. Future operators should consult this file before considering any move-to-legacy action.

## Pinned Files

### Parity-test pins

(None currently. The former pin on `mastra/workflows/workflow-intentional-skip.js` was lifted when the 6 portable workflow tools were unwrapped to plain `tools/handlers/workflow-*-tool.js` manifest handlers; their parity coverage moved to `__tests__/workflow-unwrap-parity.test.js` against the oracle fixtures in `__tests__/fixtures/workflow-oracles/`.)

### Parity-semantic pins

The 5 files below implement or apply parity guarantees for MCP tool schemas. The canonical contract lives in `core/schema-parity.js`; the other 4 files are factories that attach the schema-parity shim to every tool/workflow/agent. See `core/schema-parity.js` for the wire-format contract details.

- `core/schema-parity.js` — implements the wire-format parity contract for MCP tool schemas. Moving it breaks the contract. **Do not move to `legacy/`.**
- `mastra/create-loop-tool.js` — factory that attaches the schema-parity shim to every tool. Moving it breaks every tool's wire format. **Do not move to `legacy/`.**
- `mastra/create-loop-workflow.js` — factory that attaches the schema-parity shim to every workflow. Same as above. **Do not move to `legacy/`.**
- `mastra/create-loop-agent.js` — factory that attaches the schema-parity shim to every agent. Same as above. **Do not move to `legacy/`.**
- `mastra/agents/build-meta-state-tools.js` — applies the parity shim to meta-state tools. Moving it breaks meta-state wire format. **Do not move to `legacy/`.**

## Rule

**If a file is listed here, it does not move to `legacy/` without an explicit operator-approved PR that updates this document first.**
