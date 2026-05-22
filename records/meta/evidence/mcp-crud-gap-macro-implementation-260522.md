---
capability: meta
dimension: static
scope: governance
validation_status: passed
---

# MCP CRUD Gap: Macro Implementation Session

## Context

During the macro layer implementation (experiment-product-260522T2020Z), we created decision and experiment records via MCP CRUD tools. Validation revealed five gaps in the MCP tool surface that prevented full schema compliance.

## Findings

- [mcp-source-refs-missing] The `update_decision_record` and `update_experiment_record` MCP tools do not expose a `source_refs` parameter. After creation, records with invalid `source_refs` cannot be corrected through the authorized MCP path.
- [mcp-local-source-path-validation] The record schema validator requires `local:` source refs to live under `records/evidence` directories, but the `create_*` tools do not enforce this at creation time.
- [mcp-record-id-exact-match] The validator requires `record:` source refs to match the exact full record ID. The `create_*` tools do not validate this.
- [mcp-experiment-verification-block] The `create_experiment_record` tool does not expose `verification.claim_refs` or `verification.proves` fields.
- [mcp-no-delete-tool] There is no `delete_record` MCP tool. After migrating a decision between surfaces, the old record can only be removed via direct Bash `rm`.

## Impact

These gaps create a systematic tension: the loop advertises "MCP-first record access" but the CRUD tools are incomplete. Agents either leave validation errors, ask the operator, or bypass the gate with Bash.

## Proposed Resolution

1. Add `source_refs` to `update_decision_record` and `update_experiment_record`
2. Add `verification` block parameters to `update_experiment_record`
3. Validate `source_refs` at creation time
4. Add a `delete_record` MCP tool with surface-scoped authorization
5. Consider adding a `create_assertion_record` tool for direct index updates
