<!-- level: L3 | surface: implementation -->

# Runtime onboarding — current MCP contract

The current topology is Codex, Claude Code, and Hermes. This guide is for a
future runtime or a deliberate reintroduction of a retired runtime. It is not a
recipe for restoring legacy Factory or Mastra Code files.

## Before implementation

Read `docs/runtime-contract.md`, `interface/CONTRACT.md`, and
`core/runtime-topology.js`. Obtain runtime-owner approval for the runtime's
adapter/config surface. A runtime joins the topology independently of whether
it receives project-local skill mirrors.

## Implementation checklist

- Add one exact `{id, surface, ownershipRoot}` entry to Runtime Topology.
- Register the current MCP server at
  `tools/learning-loop-mastra/mastra/server.js` using the runtime's native
  configuration.
- Implement the then-current lifecycle contract: four gate shims or an
  equivalent native hook adapter, with no legacy compatibility path.
- Decide separately whether the runtime consumes project-local skill mirrors.
  If it does, update the current mirror projection and parity tests.
- Implement a native synchronous Initial I2 Rule Delivery adapter, or return a
  typed owner-scoped conformance gap while the runtime owner ships it. Do not
  claim success from a missing adapter.
- Add R2 ownership allowlist entries and structural tests.
- Add runtime-specific conformance tests and update current documentation.
- Run the focused interface tests, `pnpm test:unit`, `pnpm test:integration`,
  `pnpm test:e2e`, and `pnpm gate:self-verify`.

## Validation

```bash
node tools/learning-loop-mastra/interface/contract.js --list
node tools/learning-loop-mastra/interface/contract.js <runtime-id>
```

The validator's `path_map` is the evidence surface. A missing runtime-owned
delivery adapter must appear as `runtime_owned_delivery_missing` with
`applicable: true` and `ok: false`.

## Ownership boundary

Do not edit another runtime agent's adapter/config directory as part of
onboarding. Core owns policy and conformance; the runtime owner owns the native
wire. Historical records and Git history may explain prior implementations,
but they do not grant compatibility obligations.
