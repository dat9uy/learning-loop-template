# Coordination Hooks — Hermes Agent surface (`.hermes`)

Hermes Agent runtime surface for the learning loop. Hermes has no per-project
config file the loop can write (its config lives at `~/.hermes/config.yaml`),
so this directory follows the same surface convention as `.claude`, `.factory`,
and `.mastracode`: the shims live in-repo, and the *wiring record* lives in the
committed `.hermes/*.json` mirrors. The live wiring is applied once per machine
in `~/.hermes/config.yaml` (see § Live wiring below).

## Wire protocol

Hermes shell hooks speak the Claude Code-compatible wire protocol:

- **Input** (stdin JSON): `{ hook_event_name, tool_name, tool_input, session_id, cwd, extra }`
- **Block** (stdout JSON): `{"decision":"block","reason":...}` (Claude-Code style)
  or `{"action":"block","message":...}` (Hermes-canonical); exit code 2 also blocks.
- **Context injection** (pre_llm_call stdout): `{"context": "..."}`

The loop's universal hooks emit the modern Claude-Code envelope
(`hookSpecificOutput.permissionDecision: "deny"`), so each shim here is an
**adapter** (`kind: "adapter"` in `hooks-lock.json`): it maps Hermes tool names,
pins `GATE_ROOT` from its own location (Hermes spawns hook subprocesses from the
session cwd, which may differ from the project root), delegates to the matching
universal hook, and translates the envelope back into Hermes' block/context
shape. These shims are intentionally NOT byte-identical to the `.claude` /
`.factory` shims — the parity checklist filters them out via `hooks-lock.json`.

## Hook → event mapping

| Shim (`.hermes/coordination/hooks/`) | Universal hook | Hermes event | Matcher |
|---|---|---|---|
| `bash-coordination-gate.cjs` | `bash-gate.js` | `pre_tool_call` | `terminal` |
| `write-coordination-gate.cjs` | `write-gate.js` | `pre_tool_call` | `write_file\|patch` |
| `inbound-state-gate.cjs` | `inbound-gate.js` | `pre_llm_call` | (all turns; suppress-window idempotent) |
| `recurrence-check-on-start.cjs` | `recurrence-check-on-start.js` | `on_session_start` | (observer) |
| `toolchain-failure-capture.cjs` | `toolchain-failure-capture.js` | `post_tool_call` | `terminal` + `status != success` |

`.hermes/hooks/loop-surface-inject.cjs` is the Hermes equivalent of the
`.factory` SessionStart adapter: a `pre_llm_call` hook gated to
`is_first_turn: true` that builds the discoverability/process hints from the
canonical core builders, writes `.hermes/session-context.json`, and injects the
formatted block as `{"context": ...}`.

## Event mapping notes

- Hermes `pre_llm_call` fires once per turn (not once per user message); the
  inbound gate's suppress window (`SUPPRESS_WINDOW_MS`) makes repeated firing
  safe — a stale-warning re-emits at most once per window.
- Hermes `on_session_start` is an observer (stdout ignored) — fine for the
  recurrence check, which is a silent-write channel.
- Hermes `post_tool_call` fires after every call; the toolchain shim filters to
  failed `terminal` calls before delegating.

## Live wiring (`~/.hermes/config.yaml`)

The committed mirrors are `.hermes/mcp.json` (MCP registration) and
`.hermes/hooks.json` (hook wiring record). The live equivalents, applied once
per machine (not committed — they carry absolute paths):

```yaml
mcp_servers:
  learning-loop:
    command: "node"
    args: ["/absolute/path/to/tools/learning-loop-mastra/mastra/server.js"]
    env:
      LOOP_SURFACE: ".hermes"

hooks:
  pre_tool_call:
    - matcher: "terminal"
      command: "/absolute/path/to/.hermes/coordination/hooks/bash-coordination-gate.cjs"
      timeout: 10
    - matcher: "write_file|patch"
      command: "/absolute/path/to/.hermes/coordination/hooks/write-coordination-gate.cjs"
      timeout: 10
  pre_llm_call:
    - command: "/absolute/path/to/.hermes/coordination/hooks/inbound-state-gate.cjs"
      timeout: 10
    - command: "/absolute/path/to/.hermes/hooks/loop-surface-inject.cjs"
      timeout: 15
  on_session_start:
    - command: "/absolute/path/to/.hermes/coordination/hooks/recurrence-check-on-start.cjs"
      timeout: 15
  post_tool_call:
    - matcher: "terminal"
      command: "/absolute/path/to/.hermes/coordination/hooks/toolchain-failure-capture.cjs"
      timeout: 10
hooks_auto_accept: true
```

Note: shell hooks run with your full user credentials — the `hooks:` block in
`~/.hermes/config.yaml` is privileged configuration. First-use consent for each
(event, command) pair is persisted to `~/.hermes/shell-hooks-allowlist.json`
(`hooks_auto_accept: true` skips the TTY prompt; non-interactive runs can also
pass `HERMES_ACCEPT_HOOKS=1`).

## Validation

```bash
node tools/learning-loop-mastra/interface/contract.js hermes
hermes hooks list      # configured shell hooks + consent status
hermes mcp list        # MCP servers (learning-loop)
```
