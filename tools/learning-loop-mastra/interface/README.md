# Runtime Interface

The runtime interface is the contract boundary between Core and an agent
runtime. The current support set is Codex, Claude Code, and Hermes. Runtime
identity and ownership roots come from `core/runtime-topology.js`; transport
checks live in `interface/contract.js`.

Current project-local mirrors are retained only for Claude Code and Hermes:
`.claude/` and `.hermes/`. Codex participates through its native `.codex`
Initial Delivery adapter and is not part of skill mirror fan-out.

## Files

- `CONTRACT.md` — current MCP-transport requirements and ownership boundary.
- `contract.js` — executable validator and `validateAll` projection.
- `RUNTIME_ONBOARDING.md` — process for implementing a new runtime against the
  current contract.
- `__tests__/contract.test.js` — requirement and retired-runtime guards.

## Current conformance state

Codex has a native Initial Delivery check. Claude Code and Hermes pass the
shared MCP/config/skill checks, but the validator reports the typed
`runtime_owned_delivery_missing` result until each runtime owner supplies its
current native Initial I2 Rule Delivery adapter. This is a deliberate failure,
not a successful compatibility fallback.

## Runtime-owned files

The corresponding runtime agent owns `.claude/` and `.hermes/` adapter/config
files. Changes to those surfaces require the runtime owner's approved PR. Core
may validate their wiring and report missing delivery; it does not repair their
adapters.
