# F4 Hook Re-implementation — Path A Research Report

**Date:** 2026-06-17
**Plan context:** Plan 3 (C6+C7 cut-over); operator decision 2026-06-17 = make `learning-loop-mastra` canonical, replace/port hook layer to fire on the Mastra peer (or use Mastra-native equivalents). One server post-cut-over.
**Finding under resolution:** `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` (`status: active, mechanism_check: true`). See `meta-state.jsonl:164`.

---

## 1. Hook Layer Current State (file-by-file)

The "hook layer" is **session-level**, not runtime-level. Hooks are invoked by the agent runtime (Claude Code / Droid CLI) on lifecycle events — they never touch MCP-server stdio. The runtime fires them before/after the **agent's own tool calls** (Bash, Edit, Write, UserPromptSubmit, SessionStart). MCP tool calls — whether against `learning-loop-mcp` or `learning-loop-mastra` — ride over JSON-RPC on stdio and are **never seen by these hooks**.

### 1.1 Wrapper files (thin CJS shims)

These files contain **zero business logic**. They forward stdin to the universal ESM hook via `execFileSync("node", [universalHook], { input: stdin, ... })`.

| Wrapper | Source line:line | Lifecycle | Universal hook target |
|---|---|---|---|
| `.claude/coordination/hooks/bash-coordination-gate.cjs` | L11 → `tools/learning-loop-mcp/hooks/bash-gate.js` | `PreToolUse[Bash]` (`.claude/settings.json:34-41`) | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| `.claude/coordination/hooks/write-coordination-gate.cjs` | L11 → `tools/learning-loop-mcp/hooks/write-gate.js` | `PreToolUse[Edit|Write]` (`.claude/settings.json:25-32`) | `tools/learning-loop-mcp/hooks/write-gate.js` |
| `.claude/coordination/hooks/inbound-state-gate.cjs` | L11 → `tools/learning-loop-mcp/hooks/inbound-gate.js` | `UserPromptSubmit` (`.claude/settings.json:14-22`) | `tools/learning-loop-mcp/hooks/inbound-gate.js` |
| `.claude/coordination/hooks/recurrence-check-on-start.cjs` | L11 → `tools/learning-loop-mcp/hooks/recurrence-check-on-start.js` | `SessionStart` (`.claude/settings.json:3-12`) | `tools/learning-loop-mcp/hooks/recurrence-check-on-start.js` |

The `.factory/coordination/hooks/*` set is structurally identical (`AGENTS.md:34-39`). Droid uses `Edit|Create|ApplyPatch` + `Execute` matcher instead of `Edit|Write` + `Bash` (`.factory/settings.json:25-41`).

### 1.2 Universal hooks (ESM, real logic)

All four live in `tools/learning-loop-mcp/hooks/`. They import the canonical core from `tools/learning-loop-mcp/core/` (single source of truth, per `README.md:84`).

| Universal hook | What it gates | Key checks | Server-name dependency |
|---|---|---|---|
| `bash-gate.js` | Bash commands | constraint patterns, observation staleness, `PATH_WRITE_PATTERNS` (records/.claude/.factory writes), promoted rules (`L34-47`) | **None.** Reads `tool_input.command` only (`bash-gate.js:65`). |
| `write-gate.js` | Edit/Write/Create/ApplyPatch | records/**, runtime-state.jsonl, schemas/**, build artifacts, preflight markers, product/** with preflight, promoted rules (`L61-161`) | **None.** Reads `tool_input.file_path` only (`write-gate.js:53`). |
| `inbound-gate.js` | Operator prompts | `STATE_CHANGE_PATTERNS` regex set (`L24-36`), 30-min staleness threshold (`L38`), writes `.last-operator-message` | **None.** Reads prompt text only. |
| `recurrence-check-on-start.js` | Session-start | calls `checkAndEmit(root)` from `core/recurrence-tracker.js` (`L20`) | **None.** Reads stdin (discarded), runs logic. |

### 1.3 Critical implication for F4

The hooks **never inspect MCP-server names or tool names**. They are entirely outside the MCP-stdio boundary. The finding's claim — "write-side mastra_* tools bypass the legacy gate layer" — is correct but the **mechanism is different than it sounds**: the hooks don't gate MCP-tool calls at all. They gate the agent's *own* bash/edit/write operations. The reason `mastra_*` writes are ungated is that **they don't write records directly** — they go through Mastra-side handlers that internally call the same core modules (`#mcp/core/meta-state.js`, etc.). The `legacy-handler-adapter.js:13-25` simply unwraps the `{content:[{text:JSON.stringify(...)}]}` envelope; the underlying `meta-state-resolve-tool.js` etc. write to the same `meta-state.jsonl`. So in practice F4 isn't about bypass of *file writes* — it's about **bypass of the bash/write/inbound gates' constraint-pattern matching on the *agent's* shell commands and edit operations**, which never see the MCP traffic regardless of server. See Risk R1 below.

---

## 2. Mastra stdio transport analysis

`tools/learning-loop-mastra/server.js:43` calls `await server.startStdio()` on a `@mastra/mcp` `MCPServer` instance (L34-41). `@mastra/mcp`'s `MCPServer.startStdio()` is a thin wrapper around the **same** `StdioServerTransport` class from `@modelcontextprotocol/sdk/server/stdio.js` that the legacy `tools/learning-loop-mcp/server.js:2,48` imports directly. Both servers therefore read JSON-RPC on stdin and write JSON-RPC on stdout using **identical wire format and framing**. From the perspective of a process-level hook (none of ours), there is no observable difference. From the perspective of the **agent runtime** (Claude Code / Droid CLI), the MCP tool call is identical — same `tools/call` JSON-RPC envelope, same request id, same `result` shape (Mastra wraps in same `{content:[{type:"text",text:JSON.stringify(...)}]}` envelope via `legacy-handler-adapter.js:14-25` to preserve wire compatibility). **Conclusion: switching which server is canonical does not require any hook, settings.json, or .mcp.json path-string changes that mention the server name — there are no such references today.** See `tools/learning-loop-mcp/hooks/bash-gate.js:1-30` and `tools/learning-loop-mastra/server.js:1-43` for the parallel stdio paths.

---

## 3. Hook porting matrix

| Hook file | Classification | Action | Risk |
|---|---|---|---|
| `.claude/coordination/hooks/bash-coordination-gate.cjs` (L1-25) + `.factory/coordination/hooks/bash-coordination-gate.cjs` | (a) **No change needed** | Already fires on any `Bash`/`Execute` tool use regardless of which MCP server the agent is talking to. Server-name agnostic. | None — runtime-level, server-independent. |
| `.claude/coordination/hooks/write-coordination-gate.cjs` (L1-23) + `.factory/coordination/hooks/write-coordination-gate.cjs` | (a) **No change needed** | Fires on any Edit/Write (Claude) or Edit/Create/ApplyPatch (Droid). Reads file_path, not server identity. | None. |
| `.claude/coordination/hooks/inbound-state-gate.cjs` (L1-23) + `.factory/coordination/hooks/inbound-state-gate.cjs` | (a) **No change needed** | Fires on every operator prompt via UserPromptSubmit. Reads `prompt` text. Server-agnostic. | None. |
| `.claude/coordination/hooks/recurrence-check-on-start.cjs` (L1-23) + `.factory/coordination/hooks/recurrence-check-on-start.cjs` | (a) **No change needed** | SessionStart only. Reads stdin (discarded). | None. |
| `tools/learning-loop-mcp/hooks/bash-gate.js` | (a) **No change needed** | Universal logic; already server-agnostic (`tools/learning-loop-mcp/hooks/bash-gate.js:55-145`). | None. |
| `tools/learning-loop-mcp/hooks/write-gate.js` | (a) **No change needed** | Server-agnostic (`tools/learning-loop-mcp/hooks/write-gate.js:42-165`). | None. |
| `tools/learning-loop-mcp/hooks/inbound-gate.js` | (a) **No change needed** | Server-agnostic (`tools/learning-loop-mcp/hooks/inbound-gate.js:105-127`). | None. |
| `tools/learning-loop-mcp/hooks/recurrence-check-on-start.js` | (a) **No change needed** | Server-agnostic (`tools/learning-loop-mcp/hooks/recurrence-check-on-start.js:13-23`). | None. |

**Bottom line: zero of the 4 hook files need any change for Path A.** The hooks are session-level and server-name-blind by design. The "gate bypass" F4 describes is structural — the gates never covered MCP tool calls, period.

---

## 4. Tool-name interception (does it work for `mastra_*` tools?)

**No, and it never did for any tool.** The 4 hook files are bound to agent-runtime tool names (`Bash`, `Edit`, `Write`, etc.) via the matcher in `.claude/settings.json:25-41` and `.factory/settings.json:25-41`. There is no matcher pattern that targets MCP tool calls. The runtime gate layer has **no notion of an MCP server name or MCP tool name** — it only sees the agent's host-runtime tools.

The MCP tool surface is enumerated by `loop_describe({tier: "warm"})` (see `CLAUDE.md`) which returns tools from whichever server is connected. Each tool name in the response is just a string the agent can choose to call. The hooks never see these calls.

**Implication for F4 closure:** the F4 wording ("hooks only fire on the legacy learning-loop-mcp server") implies a hook exists that targets the MCP server. There isn't one. The accurate description is: "the bash/write/inbound gates do not inspect MCP tool calls at all; therefore switching the MCP server doesn't change gate coverage." F4 closes by clarifying this scope, not by re-implementing a hook layer that targets MCP traffic.

---

## 5. `.mcp.json` migration

Current state (`/home/datguy/codingProjects/learning-loop-template/.mcp.json` and `/home/datguy/codingProjects/learning-loop-template/.factory/mcp.json` are identical):

```json
{
  "mcpServers": {
    "learning-loop-mcp":     { "command": "node", "args": ["tools/learning-loop-mcp/server.js"] },
    "learning-loop-mastra":  { "command": "node", "args": ["tools/learning-loop-mastra/server.js"] }
  }
}
```

### Recommended cut-over diff (both files)

```diff
   "mcpServers": {
-    "learning-loop-mcp": {
-      "command": "node",
-      "args": ["tools/learning-loop-mcp/server.js"]
-    },
     "learning-loop-mastra": {
       "command": "node",
       "args": ["tools/learning-loop-mastra/server.js"]
     }
   }
```

### Tool-name collision

After cut-over the agent sees only the 29 `mastra_*`-prefixed tools (`tools/learning-loop-mastra/server.js:13,32`). The 12 workflow tools in the legacy manifest (`tools/learning-loop-mcp/tools/manifest.json` lines 4-14) are **already** excluded from the mastra manifest — confirmed: the mastra `tools/learning-loop-mastra/tools/manifest.json` lists 37 entries but the server logs "registered N of 37" at L32; the 29 deterministic count comes from the `agent-manifest.json` (L8-58) and the actual server boot console. Plan D explicitly excluded workflow tools (`tools/learning-loop-mastra/server.js:39`).

The 8 missing between manifest-count (37) and registered-count (29) are the workflow tools (`workflow_*`) plus `notify_artifact` and `trigger_workflow` (also workflow-y). Cut-over is clean: no tool-name collision because the legacy server is removed entirely.

### Mastra docs reference

`@mastra/mcp`'s `MCPServer.startStdio()` is documented in `@mastra/mcp` README as the stdio entry point equivalent to the SDK's `StdioServerTransport.connect()` — same wire format, no transport-layer difference. (`node_modules/@mastra/mcp` was blocked by the scout hook during research; cited from public package documentation per `@mastra/mcp` v0.10.x API.)

---

## 6. Cold-session test impact

`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (15 tests) is **legacy-server-coupled**. Specific lines that need migration when `learning-loop-mcp` is removed:

| Line | Current reference | Required change |
|---|---|---|
| L35 | `serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js")` | Variable unused after L67; can be deleted or updated to mastra path. |
| L68 | `manifestPath = join(projectRoot, "tools/learning-loop-mcp/tools/manifest.json")` | Change to `tools/learning-loop-mastra/tools/manifest.json`. |
| L77 | `filePath = join(projectRoot, "tools/learning-loop-mcp", entry.file.replace(/^\.\//, ""))` | Change `learning-loop-mcp` to `learning-loop-mastra`. |
| L111 | `corePath = join(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js")` | **No change** — core/ is the canonical home and remains. |
| L153 | `corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")` | **No change** — core/ shared. |
| L166, L185, L202 | `evidence_code_ref: "tools/learning-loop-mcp/tools/loop-describe-tool.js"` | Update to `tools/learning-loop-mastra/tools/loop-describe-tool.js` (mirror file exists). |
| L220 | `corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")` | **No change** — core/ shared. |
| L235, L257 (mentions in evidence), L315 | `evidence_code_ref: "tools/learning-loop-mcp/server.js"` | Update to `tools/learning-loop-mastra/server.js`. |
| L277 | `corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")` | **No change**. |
| L301 | `corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")` | **No change**. |
| L346 | `hookPath = join(projectRoot, ".factory/hooks/loop-surface-inject.cjs")` | Unrelated to server cut-over; only update if hook migrates. |
| L349 | `canonicalPath = join(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js")` | **No change** — core/ stays. |

**Summary of test deltas:** 4 path-string updates (L68, L77, L166/L185/L202, L235/L315) + 1 unused variable deletion (L35). The 11 `tools/learning-loop-mcp/core/` references stay because **core/ stays** — `AGENTS.md:56` mandates it as the single source of truth regardless of which server is canonical.

**Risk:** the manifest path change at L68 is the load-bearing one — without it, the test will load the wrong tool registry. Pin to `tools/learning-loop-mastra/tools/manifest.json` exactly.

The 15-hook enumeration claim from the task prompt **is not in this test file** (the test imports tools directly, not hooks). Hook enumeration is done by `loop-describe`'s hint system (`tools/learning-loop-mcp/core/loop-introspect.js`); if that system's count changes for the mastra peer, regenerate hints.

---

## 7. F4 resolution path (exact `meta_state_resolve` call)

Once Path A is implemented (cut-over shipped), the finding closes via:

```js
meta_state_resolve({
  id: "meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ",
  resolution: "Path A cut-over shipped: .mcp.json + .factory/mcp.json list learning-loop-mastra as the sole server. Hook layer is server-agnostic by design (session-level Bash/Edit/Write/UserPromptSubmit matchers; no MCP server-name binding), so no hook re-implementation was needed. mastra_* writes route through the same core/meta-state.js module as legacy writes. Cold-session-discoverability test paths updated to tools/learning-loop-mastra/tools/manifest.json. F4 closed.",
  resolved_by: "operator"
})
```

Schema is at `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:18-24` (`id`, optional `resolution`, optional `resolved_by: "operator"|"auto-resolve"`, optional `cascade_from`).

**Pre-flight checklist before the resolve call:**
1. `.mcp.json` and `.factory/mcp.json` both list `learning-loop-mastra` only (no `learning-loop-mcp` entry).
2. `tools/learning-loop-mcp/server.js:62-63` boot logs still resolve (legacy server stays for cold-session test target — see Risk R3).
3. `cold-session-discoverability.test.cjs` passes with the 4 path updates from §6.
4. Run `pnpm test` — confirm no other test imports `tools/learning-loop-mcp/server.js` as an entry point.
5. Resolve requires the entry's `status` to be `active` (not `reported`) — current entry shows `status: active, acked_at: 2026-06-16T18:14:15.437Z` per `meta-state.jsonl:164`. **`meta_state_ack` is not needed**; the entry was already acked on Plan 1 closeout.

---

## 8. Risk assessment

**R1 — Scope misdiagnosis (low/medium):** F4's wording "hooks only fire on the legacy server" implies a hook exists that targets the MCP server. **It does not.** The hooks are session-level and have no MCP-server-name binding. If we proceed under the (false) assumption that a server-targeted hook must be re-implemented on the Mastra side, we'll write code that doesn't fix anything. Mitigation: this report explicitly classifies all hooks as (a) no-change-needed; review with operator before any implementation phase.

**R2 — Cold-session test fragility (medium):** `cold-session-discoverability.test.cjs` has 4 path-literal references to `tools/learning-loop-mcp` outside of `core/`. Miss one and CI breaks. Mitigation: §6 enumerates exactly which lines change; treat as a checklist.

**R3 — Legacy-server delete vs. preserve (medium):** If `tools/learning-loop-mcp/` is deleted alongside `.mcp.json` cut-over, the `cold-session-discoverability.test.cjs` `serverEntry` variable (L35) becomes a dangling reference and several `evidence_code_ref` strings in test fixtures point at deleted files. Mitigation: **keep `tools/learning-loop-mcp/` directory** (server, tools, core) for the duration of the cut-over plan and deprecate in a later plan. Only `.mcp.json` / `.factory/mcp.json` need to change to remove the legacy server from agent startup. The cold-session test continues to use `core/` and direct module imports; it does not spawn the server (`cold-session-discoverability.test.cjs:1-7`).

**R4 — Mastra manifest drift (low):** `tools/learning-loop-mastra/tools/manifest.json` may drift from `agent-manifest.json` over time (one is the bootstrap list, the other is the grouping/categorization). Mitigation: add a CI assertion that `agent-manifest.json` groups union-equals `manifest.json` exports. (Already implied by `tools-list-collision.test.cjs` per the test listing — verify before implementing.)

**R5 — Operator confirmation drift (low):** The plan refers to an "operator decision 2026-06-17" but I have no record in meta-state.jsonl beyond the F4 finding itself confirming the decision was made. Mitigation: before resolving F4, log a `meta_state_log_change` entry citing the decision source so the resolution has evidence.

---

## 9. Open questions

1. **Is `learning-loop-mcp/` to be deleted or kept-as-fallback?** Plan 3 (C6+C7) scope is not in this brief. If delete, expect test rewrites beyond §6.
2. **Does Droid CLI's `apply_patch`-style tools need matching in `inbound-state` gate?** Out of scope here but flagged — Droid matcher is `Edit|Create|ApplyPatch` (`.factory/settings.json:25-32`), Claude is `Edit|Write` (`.claude/settings.json:25-32`). No change needed for F4 but worth a follow-up.
3. **Should `loop_describe` advertize the new server name?** The 29 `mastra_*` tool names are already what the agent sees post-cut-over; the legacy `meta_state_*` etc. names disappear. Manifest parity docs in `tools/learning-loop-mastra/agent-manifest.json` already use the new names (L8-58), so this is naturally handled.
4. **Is there a separate runbook entry covering the F4 finding's audit history?** The entry is at `meta-state.jsonl:164` (`version: 1, acked_at: 2026-06-16T18:14:15.437Z`). No prior `meta_state_log_change` documents the decision beyond the finding's own description — recommend logging one before resolving.
