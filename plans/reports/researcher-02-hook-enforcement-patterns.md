# Hook-Based Enforcement Patterns for Claude Code Tool Gating

## 1. PreToolUse Hook Mechanism

### Input JSON (via stdin)
Every PreToolUse hook receives this JSON on stdin:
```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",        // or "Edit", "Write", "Read", "Skill", etc.
  "tool_use_id": "toolu_xxx",
  "tool_input": { ... }       // shape depends on tool_name
}
```

### tool_input shapes by tool
- **Bash**: `{ "command": "npm test", "description": "...", "timeout": 120000 }`
- **Edit**: `{ "file_path": "/abs/path", "old_string": "...", "new_string": "...", "replace_all": false }`
- **Write**: `{ "file_path": "/abs/path", "content": "..." }`
- **Read**: `{ "file_path": "/abs/path" }`
- **Skill**: `{ "skill": "cook", ... }` (MCP-style skill invocations)

### Exit codes
- **exit 0** = allow (stdout parsed for optional JSON context)
- **exit 2** = block (stderr fed back to Claude as error)
- **Any other** = non-blocking error, execution continues

### Blocking output (two patterns)

**Pattern A — stderr + exit 2 (legacy, used by existing hooks):**
```bash
echo "Blocked: reason here" >&2
exit 2
```

**Pattern B — hookSpecificOutput + exit 0 (newer, richer control):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Database writes not allowed"
  }
}
```
`permissionDecision` values: `"allow"`, `"deny"`, `"ask"`, `"defer"`

**Pattern C — top-level decision (also works):**
```json
{
  "decision": "block",
  "reason": "Must pass tests before proceeding"
}
```

### Key insight: Pattern B is preferred for new hooks because:
- `permissionDecision: "allow"` can grant permission without user interaction
- `permissionDecision: "ask"` triggers Claude to ask the user
- `permissionDecision: "defer"` falls through to normal permission flow
- Cleaner separation: stdout = structured JSON, stderr = debug logs

---

## 2. Hook Matcher Patterns

### Settings.json structure
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",           // exact match
        "hooks": [{ "type": "command", "command": "..." }]
      },
      {
        "matcher": "Bash|Glob|Grep|Read|Edit|Write",  // pipe-separated list
        "hooks": [
          { "type": "command", "command": "hook1.sh" },
          { "type": "command", "command": "hook2.sh" }
        ]
      }
    ]
  }
}
```

### Matcher rules
| Pattern | Behavior |
|---------|----------|
| `"*"`, `""`, or omitted | Match ALL tools |
| Only `a-zA-Z0-9_\|` | Exact string or pipe-separated list |
| Any other chars | Treated as JavaScript regex |

### Multi-tool matching examples
```json
// Exact list
"matcher": "Edit|Write|Bash"

// Regex for all MCP tools
"matcher": "mcp__.*"

// Regex for specific MCP server
"matcher": "mcp__memory__.*"

// Single hook entry can have MULTIPLE hook handlers
{
  "matcher": "Bash|Edit|Write",
  "hooks": [
    { "type": "command", "command": "hook-a.sh" },
    { "type": "command", "command": "hook-b.sh" }
  ]
}
```

### The `if` field (finer-grained filtering within a hook)
```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "if": "Bash(rm *)",
      "command": "/path/to/block-rm.sh"
    }
  ]
}
```
The `if` field uses permission rule syntax: `ToolName(pattern)`. This lets a single matcher fire the hook only for specific inputs, reducing unnecessary hook invocations.

### For Edit+Write+Bash gating: use ONE matcher entry
```json
{
  "matcher": "Edit|Write|Bash",
  "hooks": [{ "type": "command", "command": "node gate.cjs" }]
}
```
The hook script then inspects `tool_name` to branch logic.

---

## 3. Hook → MCP Integration

### Can a hook call an MCP server?
**No direct MCP client in hooks.** Hooks are plain shell commands — they don't have access to Claude Code's MCP transport. A hook cannot invoke `mcp__server__tool` directly.

### Options for external gate consultation

**Option A: File-based coordination (current pattern in this project)**
- Hook reads JSON files from disk (skill-registry.json, coordination-config.json)
- Uses a `.bypass-next` sentinel file for one-shot overrides
- Zero latency, no network, no subprocess spawning beyond Node
- Works offline, deterministic

**Option B: HTTP call to a local gate server**
- Hook makes `fetch()` or `curl` to a local HTTP endpoint
- Gate server runs as a background process
- Adds latency (~50-200ms per tool call), requires server lifecycle
- Good for: complex authorization logic, database queries, external API checks

**Option C: Subprocess call to a CLI gate**
- Hook spawns a child process (`child_process.execFile`)
- Gate logic lives in a separate binary/script
- Moderate latency, clean separation of concerns

**Option D: Direct file I/O with lock files (recommended for this project)**
- Hook reads config/state files directly (current pattern)
- Use atomic writes (write-to-temp + rename) for state changes
- Lock files for concurrent access (see `hook-logger.cjs` pattern)
- Zero external dependencies, fastest execution

### Recommendation for this project
**Option D (file-based) is correct.** The existing `skill-coordination-gate.cjs` pattern is sound:
- Registry is static JSON, loaded once per hook invocation
- Bypass via sentinel file is simple and atomic
- No need for MCP/HTTP — the gate logic is deterministic rule-checking
- Adding MCP would add latency to EVERY tool call for zero benefit

If the gate ever needs dynamic state (e.g., budget counters, rate limits), use the same file-based pattern with atomic read-modify-write via temp+rename (see `session-state-manager.cjs` for a working example).

---

## 4. Bash Command Parsing

### Extracting the command
```javascript
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (input.tool_name !== 'Bash') { process.exit(0); }
const command = input.tool_input.command;  // the raw shell string
```

### Pattern matching approaches

**Simple prefix matching (fast, safe):**
```javascript
const blocked = ['docker', 'sudo', 'curl', 'wget', 'pip install', 'npm publish'];
const cmd = command.trim();
for (const prefix of blocked) {
  if (cmd.startsWith(prefix) || cmd.includes(` ${prefix} `)) {
    // block
  }
}
```

**Regex matching (more flexible):**
```javascript
const patterns = [
  /\bsudo\b/,
  /\bdocker\b/,
  /\bcurl\b.*\|.*bash/,   // curl pipe to shell
  /\bpip\s+install\b/,
  /\bnpm\s+(publish|uninstall)\b/,
];
for (const pat of patterns) {
  if (pat.test(command)) { /* block */ }
}
```

### Security considerations
1. **Command injection via pattern matching is NOT a risk here** — the hook is checking the command string, not executing it. The hook reads stdin and outputs a decision. No shell expansion occurs in the hook's matching logic.
2. **Bypass risk**: users/agents can obfuscate commands (`/usr/bin/curl`, `cu"r"l`, `$(which curl)`, aliases). Mitigation: match on word boundaries (`\bsudo\b`), normalize the command (resolve paths), or accept that this is advisory enforcement, not security enforcement.
3. **False positives**: `curl` in a comment string, `docker` in a file path. Mitigation: use word-boundary regex, not substring matching.
4. **Pipe chains**: `echo foo | sudo rm -rf /` — simple prefix matching won't catch this. For robustness, split on pipe/semicolon/&& and check each segment.

### Recommended pattern for this project
```javascript
function extractBashCommands(command) {
  // Split on shell operators, trim each segment
  return command.split(/[;&|]+/).map(s => s.trim()).filter(Boolean);
}

function isDangerousCommand(command) {
  const segments = extractBashCommands(command);
  const dangerous = /^\s*(sudo|docker|curl|wget|pip\s+install|npm\s+publish|rm\s+-rf)/;
  return segments.some(seg => dangerous.test(seg));
}
```

---

## 5. Existing Hook Analysis

### `skill-coordination-gate.cjs` (project hook)
- Matcher: `"Skill"` — gates MCP skill invocations only
- Reads `skill-registry.json` for registered skills
- Checks `.bypass-next` sentinel for coordinator-initiated calls
- Outputs `{ decision: "block", reason: "..." }` + exit 2
- **Does NOT gate Edit, Write, or Bash**

### `scout-block.cjs` (global hook)
- Matcher: `"Bash|Glob|Grep|Read|Edit|Write"` — gates all file tools
- Uses `.ckignore` patterns (gitignore-style)
- Extracts paths from `tool_input.file_path`, `tool_input.path`, or Bash `tool_input.command`
- Fail-open on parse errors (security-conscious: invalid input → allow)

### `privacy-block.cjs` (global hook)
- Same matcher as scout-block
- Blocks sensitive files (`.env`, credentials, etc.)
- Uses approval-prefix flow: block → user approves → agent retries with `APPROVED:` prefix
- Outputs structured JSON marker for `AskUserQuestion` integration

### `descriptive-name.cjs` (global hook)
- Matcher: `"Write"` only
- Uses `hookSpecificOutput` with `permissionDecision: "allow"` + `additionalContext`
- Injects guidance without blocking — purely advisory

### Key patterns from existing hooks
1. **Fail-open**: All hooks exit 0 on parse errors, missing files, unexpected exceptions
2. **Crash wrapper**: Outer try/catch with `logHookCrash` + exit 0
3. **Timer logging**: `createHookTimer()` for performance monitoring
4. **Config toggle**: `isHookEnabled('hook-name')` check at startup
5. **stdin reading**: `fs.readFileSync(0, 'utf8')` (sync) or `for await (const chunk of process.stdin)` (async)

---

## 6. Hook Output Format Summary

### Blocking (exit 2)
```bash
# stderr = message shown to Claude
echo "BLOCKED: reason" >&2
exit 2
```

### Blocking (hookSpecificOutput, exit 0)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Skill requires coordination. Invoke /ck:learning-loop with target=cook."
  }
}
```

### Allow with context (exit 0)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "additionalContext": "File naming guidance: prefer kebab-case..."
  }
}
```

### How Claude sees the block
- Exit 2: stderr text appears as an error message in the conversation. Claude sees it and adapts its behavior.
- hookSpecificOutput deny: Claude sees the `permissionDecisionReason` as the denial reason.

---

## 7. Architectural Recommendation

### Should the expanded hook call MCP or do file-based checks?

**File-based checks. No MCP. No HTTP.**

Rationale:
1. **Latency**: Hooks run on EVERY tool call. MCP/HTTP adds 50-200ms per invocation. File reads are <1ms.
2. **Reliability**: File-based = no server lifecycle to manage, no connection failures, no startup ordering issues.
3. **Complexity**: The gate logic is simple rule-matching (is this tool registered? is there a bypass? what profile?). No need for a running service.
4. **Existing pattern**: The project already has `skill-registry.json` + `coordination-config.json` + `.bypass-next` sentinel. This works.
5. **Concurrency**: Multiple hooks can run simultaneously. File reads are safe. File writes use atomic temp+rename (see `hook-logger.cjs` lock pattern).

### Expanded gate design
```
.claude/coordination/hooks/skill-coordination-gate.cjs
├── Reads tool_name from stdin
├── If tool_name === "Skill" → existing registry check
├── If tool_name === "Edit"|"Write" → check write_allowlist/write_forbidlist from profile
├── If tool_name === "Bash" → check command patterns (dangerous cmds)
├── Outputs hookSpecificOutput with permissionDecision
└── Exit 0 always (use permissionDecision: "deny" instead of exit 2)
```

### Migration path
1. Keep existing `skill-coordination-gate.cjs` for Skill gating
2. Create new `write-coordination-gate.cjs` for Edit/Write gating
3. Create new `bash-coordination-gate.cjs` for Bash command gating
4. Register all three in `.claude/settings.json` under appropriate matchers
5. Share lib code via `require('./lib/gate-utils.cjs')`

### Why separate hooks instead of one mega-hook?
- **Matcher precision**: Each hook only fires for its tool type (less wasted stdin parsing)
- **Fail isolation**: One hook crashing doesn't affect others
- **Toggle granularity**: Can disable bash-gating while keeping write-gating
- **Code size**: Each file stays under 100 lines (per project conventions)

---

## Unresolved Questions

1. **hookSpecificOutput vs exit 2**: The existing project hook uses exit 2. Should the expanded hooks migrate to `hookSpecificOutput` with `permissionDecision: "deny"`? The newer pattern is cleaner but both work. Migration is optional.

2. **Profile-based write gating**: The `coordination-config.json` has `write_allowlist` and `write_forbidlist` per profile. Should Edit/Write hooks enforce these glob patterns, or is that a future concern? If yes, need a glob matcher (use `minimatch` or `picomatch` npm package, or implement simple glob matching).

3. **Bash gating scope**: Should Bash gating be advisory (warn + allow) or blocking (deny)? The scout-block hook already blocks dangerous directory access. Should the coordination gate add another layer for coordination-specific Bash restrictions?

4. **Hook ordering**: When multiple hooks match the same tool, they run in order. If scout-block.cjs allows a Write but coordination-gate.cjs denies it, the denial wins (first exit 2 or deny decision blocks). This is correct but needs documenting.
