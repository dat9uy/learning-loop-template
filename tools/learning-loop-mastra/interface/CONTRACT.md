<!-- level: L2 | surface: implementation -->

# Runtime Interface Contract — MCP transport

Runtime identity is owned by `core/runtime-topology.js`. The current topology
is exactly:

| Runtime id | Owned surface |
|---|---|
| `codex` | `.codex` |
| `claude-code` | `.claude` |
| `hermes` | `.hermes` |

`interface/contract.js` is the executable conformance view. It rejects retired
ids; it does not provide compatibility aliases for `droid` or `mastra-code`.

## Requirements

The validator reports these requirement ids in `path_map`:

1. `hook-shim-set` — Claude Code and Hermes expose the four universal gate
   shims in `<surface>/coordination/hooks/`. Codex is intentionally reported as
   non-compliant here because it uses its native Initial Delivery surface.
2. `mcp-client-config` — the runtime registers `learning-loop` and points to
   `tools/learning-loop-mastra/mastra/server.js`. Codex reads its TOML config;
   Claude Code and Hermes use their project-local JSON mirrors.
3. `skill-spec` — every loop-maintained mirror declares `maturity:` as
   `state-1`, `state-2`, or `state-3`; `learning-loop` references
   `loop_describe` and `meta_state_list`; retained mirror surfaces have parity.
   Codex does not consume project-local skill mirrors.
4. `identity-marker` — `RUNTIME_ID` (or the legacy advisory resource marker) is
   observed when present. It is advisory until runtime-owned identity is
   adopted.
5. `settings-integration` — Claude Code and Hermes route the four shim
   basenames through their native hook configuration. Codex is reported as
   missing this generic lifecycle wiring because its native surface is checked
   separately.
6. `tools-manifest-has-path-fields` — every manifest entry declares
   `pathFields`.
7. `runtime-owned-i2-delivery` — the current runtime owner must declare the
   Initial I2 Rule Delivery adapter. Claude Code and Hermes currently return a
   typed failure:

   ```json
   {
     "code": "runtime_owned_delivery_missing",
     "applicable": true,
     "ok": false
   }
   ```

   A shared conformance pass must not silently certify either runtime while
   this owner-controlled delivery wiring is absent.
8. `codex-initial-delivery` — Codex's synchronous
   `.codex/hooks/session-start-i2-delivery.cjs` registration and adapter must
   exist. This is the Codex-native delivery check.

The result is intentionally a projection, not a claim that the loop may edit a
runtime-owned adapter. Claude Code and Hermes adapter/config files remain owned
by those runtime agents; their missing I2 result is the handoff signal.

## Running the validator

```bash
node tools/learning-loop-mastra/interface/contract.js --list
node tools/learning-loop-mastra/interface/contract.js codex
node tools/learning-loop-mastra/interface/contract.js claude-code
node tools/learning-loop-mastra/interface/contract.js hermes
```

Exit status `0` means every applicable check passes. Exit status `1` means at
least one requirement fails. Unknown or retired ids return a typed
`unknown-runtime-id` result.

## Reintroducing a retired runtime

Reintroduction is a new implementation against the then-current contract. Add
one exact Runtime Topology entry, native configuration, ownership rules, and
tests; do not restore the deleted Factory/Mastra Code adapters or resurrect a
legacy compatibility branch. Historical journals, registry records, and Git
history remain available for archaeology but are not current conformance input.
