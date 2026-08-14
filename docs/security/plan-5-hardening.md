# Plan 5-Lite Hardening: R2 Write-Gate + LIM-4 Path Containment

This document is the single source of truth for the gating chain shipped by
Plan 5-Lite (R2 write-ownership gate + LIM-4 path containment + identity
pinning). It covers what each layer protects, how to diagnose denials, and the
residual threats that are explicitly out of scope.

## The Gating Chain

A tool write request flows through three layers before it touches disk:

```
Tool call (write_file / edit / etc.)
  ↓
1. LIM-4 path containment (core/path-containment.js)
     resolveSafePath(): realpath containment + hardlink/symlink rejection.
     Throws if the resolved path escapes the project root or is a hardlink.
  ↓
2. R2 ownership check (core/r2/ownership.js#checkR2Ownership)
     Decides whether the PINNED runtime may write to the resolved path.
     Decision cascade: BOOTSTRAP_DENY → allow own → allow universal → deny
     explicit → default deny (fail closed).
  ↓
3. Tool execute (the gated write itself)
     Only reached if LIM-4 passed AND R2 allowed.
```

If any layer denies, the write is rejected with `cross_runtime_write_denied`
(or a path-containment throw) and an audit-log row is appended to
`.gate-decision.log` on every surface.

## Identity Pinning

`mastra/server.js` calls `pinRuntimeIdAtBoot()` (from
`core/identity-pin.js`) as its FIRST executable statement — before any `await`
or `import` resolution that could fire `beforeExit` hooks. The pin reads
`process.env.LOOP_SURFACE` once, validates it against `SURFACES` (the single
source of truth in `core/surfaces.js`), maps it to a runtime id via
`SURFACE_TO_RUNTIME`, and freezes the pin state with `Object.freeze`. The pin
is immutable for the process lifetime: NO setter is exported, and strict-mode
property mutation throws. A mid-process env mutation does NOT flip the pin
(the R2 closure-immutability defense).

Canonical boot errors live in `mastra/identity-errors.json`:

| Key | Trigger | Substitution |
|-----|---------|--------------|
| `MISSING_LOOP_SURFACE` | `LOOP_SURFACE` env var unset | none |
| `INVALID_LOOP_SURFACE` | env value not in `SURFACES` | `{value}`, `{allowed}` |
| `MISSING_RUNTIME_MAPPING` | surface has no `SURFACE_TO_RUNTIME` entry | `{surface}` |
| `PIN_NOT_INITIALIZED` | `getPinnedRuntimeId()` called before pin | none |

If the pin cannot be established at boot, the server fails fast with one of
the above messages — no tool call is served until the pin is set.

## LOOP_SURFACE Wiring via mcp.json `env` Field

The current runtime set is Codex, Claude Code, and Hermes. Each transport
identifies its runtime at boot; Codex uses native Initial Delivery while the
retained MCP transports pass their surface to `server.js` where
`pinRuntimeIdAtBoot()` reads it.

| Runtime | Runtime configuration | Surface/identity |
|---------|------------|-------------------|
| Codex | `.codex/config.toml` | native Initial Delivery / `codex` |
| Claude Code | `.mcp.json` | `.claude` / `claude-code` |
| Hermes | `.hermes/mcp.json` | `.hermes` / `hermes` |

The MCP stdio transport passes the identity to the spawned `server.js`, so no
additional runtime alias is required. The contract validator checks the
current native Codex delivery and the Claude/Hermes transport configuration;
the exact fields are locked by `__tests__/mcp-config.test.js`.

**Operator kill-switch:** to disable `LOOP_SURFACE` injection for a runtime,
remove the `env` field from the relevant `mcp.json`. The MCP server will then
fail to start with `MISSING_LOOP_SURFACE` (the canonical error from
`identity-errors.json`). Use this only to debug harness issues — the server
fails closed and serves no tool calls without the pin.

## R2 Allowlist Schema v1

The R2 gate reads `.loop/r2-allowlist.json` (schema `r2-allowlist/v1`, version
1). Shape:

```json
{
  "schema": "r2-allowlist/v1",
  "version": 1,
  "codex":       { "own": ["..."], "deny": ["..."] },
  "claude-code": { "own": ["..."], "deny": ["..."] },
  "hermes":      { "own": ["..."], "deny": ["..."] },
  "universal":   ["..."]
}
```

- `<runtime>.own` — glob patterns the runtime may write to (matched against
  the resolved path).
- `<runtime>.deny` — glob patterns the runtime may NOT write to (even if
  `universal` would allow).
- `universal` — glob patterns ANY runtime may write to (shared write targets).

**Worked example** (the actual repo allowlist):

```json
{
  "schema": "r2-allowlist/v1",
  "version": 1,
  "codex": {
    "own": [".codex/**"],
    "deny": [".claude/**", ".hermes/**", ".loop/r2-allowlist.json",
             "runtime-state.jsonl", ".gate-override"]
  },
  "claude-code": {
    "own": [".claude/**"],
    "deny": [".codex/**", ".hermes/**", ".loop/r2-allowlist.json",
             "runtime-state.jsonl", ".gate-override"]
  },
  "hermes": {
    "own": [".hermes/**"],
    "deny": [".codex/**", ".claude/**", ".loop/r2-allowlist.json",
             "runtime-state.jsonl", ".gate-override"]
  },
  "universal": ["records/**", "plans/**", "docs/**", "AGENTS.md",
                "tools/learning-loop-mastra/**", "meta-state.jsonl"]
}
```

**Per-surface ownership table:**

| Surface | Owner runtime | Other runtimes |
|---------|---------------|----------------|
| `.codex/**` | codex | denied (in their `deny` list) |
| `.claude/**` | claude-code | denied (in their `deny` list) |
| `.hermes/**` | hermes | denied |
| `.loop/r2-allowlist.json` | nobody (bootstrap-deny) | use `update_r2_allowlist` |
| `runtime-state.jsonl` | nobody (bootstrap-deny) | operator-controlled |
| `.gate-override` | nobody (bootstrap-deny) | operator-controlled |
| `records/**`, `plans/**`, `docs/**`, `meta-state.jsonl` | universal | universal |

The `update_r2_allowlist` MCP tool is the ONLY legitimate edit path for
`.loop/r2-allowlist.json`; it requires a preflight marker
(`.loop/.r2-operator-preflight`) so accidental calls do not mutate the gate.

## Audit-Log Entry Shape (R6 hardened)

On a denied write, one JSON-serialized line is appended to
`.gate-decision.log` under each surface's `coordination/` dir via
`appendToAllSurfaces`. Two loggers write to this file:

- `core/gate-decision-log.js#appendDecisionLog` — gate decisions
  (bash/write/inbound gates, promoted rules).
- `core/r2/denial-log.js#appendR2DenialLog` — R2 ownership denials.

**R6 hardening invariants** (both loggers):

1. The entry is `JSON.stringify`-ed. `JSON.stringify` escapes control chars in
   string values, so a raw `\n` or `\r` inside a field becomes the two-char
   escape sequence `\n` / `\r` — never a raw newline byte. This is the primary
   JSONL-injection defense.
2. `gate-decision-log.js` asserts the serialized line contains no raw `\n` or
   `\r` and throws `gate_log entry contains unescaped newline` if it does
   (defense-in-depth against a future field or serializer regression).
3. `r2/denial-log.js` realpath-resolves the `path` field before serializing
   (R6.2): a malicious path that resolves to a real entry becomes its benign
   realpath; a non-existent path is logged as-is (realpath failure never breaks
   the log). It also collapses any residual `\r\n` to a space and asserts no
   raw newline survives.
4. `command_prefix` is passed through `oneLinePrefix` (max 80 chars, `\r\n\t`
   stripped) before serialization.

R2 denial entry shape:

```json
{
  "ts": "2026-07-02T00:00:00.000Z",
  "gate": "r2",
  "runtime": "claude-code",
  "tool": "write_file",
  "path": "/abs/realpath/resolved.txt",
  "reason": "default_deny",
  "hint": "Use the update_r2_allowlist MCP tool to edit .loop/r2-allowlist.json; ..."
}
```

**BOOTSTRAP_DENY_PATTERNS** (R17): `runtime-state.jsonl`, `**/runtime-state.jsonl`,
`.gate-override`, `**/.gate-override`, `.loop/r2-allowlist.json`,
`**/.loop/r2-allowlist.json` are hard-denied for ALL runtimes BEFORE the
allowlist is consulted — even the runtime that "owns" the surface dir cannot
write these. The hint names `update_r2_allowlist` as the legitimate allowlist
edit path; `runtime-state.jsonl` and `.gate-override` are operator-controlled.

## Operator Runbook

### Diagnosing `cross_runtime_write_denied`

When a tool write is denied with `cross_runtime_write_denied`:

1. Read the denial row from `.gate-decision.log` (any surface):
   ```bash
   tail -1 .claude/coordination/.gate-decision.log | jq .
   ```
   The `reason` field tells you the decision:
   - `bootstrap_deny` — you tried to write a protected file
     (`.loop/r2-allowlist.json`, `runtime-state.jsonl`, `.gate-override`).
     Use the documented edit path; do NOT bypass.
   - `deny` — your runtime's `deny` list explicitly forbids this path.
   - `default_deny` — the path is not in your runtime's `own` list or
     `universal`. Either move the file under your surface, or add a
     `universal` pattern via `update_r2_allowlist` (if it is a shared target).
2. Confirm the pin matches the runtime you expect:
   `node -e "console.log(process.env.LOOP_SURFACE)"` from the session — the
   pinned runtime is derived from this. If it is unset or wrong, the harness
   `mcp.json` env field is missing or misconfigured (see "Troubleshooting"
   below).
3. If the denial is legitimate, do NOT bypass — file an override or update
   the allowlist (next sections).

### Filing an override (audit-log-only)

The `gate_override` MCP tool marks a promoted rule as temporarily skipped
(with a TTL and operator note). It is audit-log-only: no env var, no
persistent flag. The override marker is written to `.gate-override` under
each surface's `coordination/` dir (a protected file — BOOTSTRAP_DENY for tool
writes; only the `gate_override` tool may write it). TTL max 86400s (24h).
Requires a known `rule_id` (the tool rejects unknown rule ids).

### Using `update_r2_allowlist`

`update_r2_allowlist` is the ONLY legitimate edit path for
`.loop/r2-allowlist.json`. Flow:

1. Mark operator preflight (unlocks the write):
   `gate_mark_preflight({ surface: "operator" })`.
2. Call `update_r2_allowlist` with the replacement allowlist object. The tool
   validates the schema before an atomic temp+rename, invalidates the
   allowlist cache, and logs intent BEFORE the rename (R6 ordering).
3. The next R2 check re-reads the new allowlist.

Example: adding a temporary `universal` pattern for an emergency fix
(e.g., allowing writes to `tmp/` for all runtimes):

```json
{
  "schema": "r2-allowlist/v1",
  "version": 1,
  "universal": ["records/**", "plans/**", "docs/**", "AGENTS.md",
                "tools/learning-loop-mastra/**", "meta-state.jsonl",
                "tmp/**"]
}
```

Remove the temporary pattern as soon as the emergency is over.

## Out-of-Scope / Residual Threats

These threats are explicitly NOT closed by Plan 5-Lite and are documented for
traceability:

- **Read-then-write composition via tool stdout**: a tool that reads a
  cross-surface file and pipes its content to a write tool can exfiltrate
  data across surfaces. The R2 gate is per-call; it does not track data
  flow across tool calls. Deferred.
- **Subprocess-spawn re-pin detection**: a subprocess spawned by a tool
  could re-pin a different `LOOP_SURFACE` if it boots its own MCP server.
  The pin is per-process; cross-process re-pin detection is deferred to a
  future plan.
- **Windows UNC / device paths**: `realpathSync` and the path-containment
  check are tested on POSIX. Windows UNC (`\\?\C:\`) and device paths are
  deferred. The gate fails closed (a path that cannot be resolved is denied).
- **Tool-stdout credential leak**: a tool that prints a secret to stdout
  could leak it to the agent transcript. Not in scope for the write-gate;
  deferred.
- **Identity-spoofing via `meta_state_resolve({resolved_by: 'operator'})`**:
  the LIM-3 caller-identity master-tracker row for `resolved_by` spoofing is
  deferred (LIM-3 was dropped from Plan 5-Lite; the `resolved_by` field is
  operator-supplied and not yet cryptographically authenticated).
- **Surface-divergence follow-up (source files)** — **CLOSED**. Runtime-aware
  source files now derive retained mirror paths from `core/surfaces.js` rather
  than maintaining independent surface lists. Codex is represented by its
  native Initial Delivery path; Claude Code and Hermes are the retained mirror
  consumers. The `shims-in-sync` checklist compares only manifest-declared shim
  files, while Hermes adapters remain runtime-owned and are not byte-parity
  shims. A direct write to any retained `.loop-preflight-*` path is blocked,
  consistent with the invariant that preflight markers may only be created via
  `mark_preflight_complete`.

## Troubleshooting: verify `LOOP_SURFACE` is set

If the MCP server fails to start with `MISSING_LOOP_SURFACE`:

1. Check the runtime's current identity configuration:
   ```bash
   node -e "console.log(JSON.parse(require('fs').readFileSync('.mcp.json','utf8')).mcpServers['learning-loop'].env)"
   ```
   Claude Code should identify `.claude`; Hermes uses `.hermes/mcp.json` and
   Codex uses `.codex/config.toml` with native Initial Delivery.
2. From inside a harness session, verify the env var reached the session:
   ```bash
   node -e "console.log(process.env.LOOP_SURFACE)"
   ```
   Should print the current runtime identity. If it prints `undefined`, the
   harness did not pass the configured identity to the spawned process —
   re-check the runtime configuration.
3. If you intentionally disabled injection (removed the env field to debug),
   re-add it once the harness issue is resolved. The server fails closed
   without the pin.

## Cross-Platform Notes

- `realpathSync` (used by R6.2 path pre-resolve and LIM-4 containment) throws
  on a null byte in the path (Node guards this). A malicious path with a null
  byte is denied via the throw, not silently accepted.
- `realpathSync` resolves case-insensitive paths on case-insensitive
  filesystems (macOS APFS, Windows NTFS). The resolved path is the canonical
  form the gate compares against.
- Windows UNC paths (`\\?\C:\...`) are deferred (see Out-of-Scope). On Windows
  the gate fails closed for paths it cannot resolve.
- Symlinks: `realpathSync` follows symlinks to the real target, so a symlink
  aliasing a protected file is resolved to the real (protected) path before
  the decision is made.
