/**
 * Protocol Adapter — normalizes stdin/stdout between Claude Code and Droid CLI.
 *
 * Both systems use the same JSON protocol with minor differences:
 * - Tool names: Claude uses "Bash"/"Write", Droid uses "Execute"/"Create"
 * - Exit codes: both use 0=allow, 2=block
 * - Output format: both support { decision, reason, hookSpecificOutput }
 */

/**
 * Parse JSON from stdin (buffer).
 */
export function parseInput(stdin) {
  try {
    const text = stdin.toString("utf8").trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * Normalize tool names between Claude Code and Droid CLI.
 */
// fallow-ignore-next-line complexity
export function normalizeToolName(toolName) {
  if (!toolName || typeof toolName !== "string") return null;
  const lower = toolName.toLowerCase();
  if (lower === "bash" || lower === "execute") return "bash";
  if (lower === "edit" || lower === "write" || lower === "create" || lower === "applypatch") return "write";
  return lower;
}

/**
 * Extract command from tool input (handles both Claude and Droid formats).
 */
export function extractCommand(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return null;
  return toolInput.command || null;
}

/**
 * Extract file path from tool input (handles both Claude and Droid formats).
 */
export function extractFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return null;
  return toolInput.file_path || null;
}

/**
 * Extract prompt from user message (handles both Claude and Droid formats).
 */
// fallow-ignore-next-line complexity
export function extractPrompt(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.prompt || payload.user_prompt || null;
}

/**
 * Format gate decision as JSON stdout.
 */
export function formatOutput(decision) {
  return JSON.stringify(decision);
}

/**
 * Map gate decision to exit code.
 * 0 = allow, 2 = block/escalate.
 */
export function exitCode(decision) {
  if (!decision || decision.decision === "ok") return 0;
  return 2;
}

/**
 * Build hook-specific output for UserPromptSubmit (soft warning).
 */
export function formatSoftWarning(message) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: message,
    },
  });
}

/**
 * Format gate decision for a specific hook output channel.
 *
 * When `channel` is "hookSpecificOutput", wraps the decision in the canonical
 * hook-specific envelope so the runtime surfaces it back to the model. This
 * matches the existing `formatSoftWarning` contract and keeps both gates
 * speaking the same stdout dialect.
 *
 * Defaults to the raw `formatOutput` shape for backward compatibility.
 */
export function formatHookDecision(decision, { channel } = {}) {
  if (channel === "hookSpecificOutput") {
    const isOk = !decision || decision.decision === "ok";
    const hookSpecificOutput = {
      hookEventName: "PreToolUse",
      additionalContext: JSON.stringify(decision),
    };
    if (!isOk) {
      // Modern Claude Code PreToolUse protocol: the harness only processes
      // stdout JSON on exit 0, and `permissionDecision: "deny"` is the field
      // that blocks the call and surfaces `permissionDecisionReason` to the
      // model. On exit 2 the stdout JSON is discarded and the harness falls
      // back to stderr — which is empty here — producing a generic
      // "No stderr output" error that hides the reason from the agent.
      hookSpecificOutput.permissionDecision = "deny";
      hookSpecificOutput.permissionDecisionReason =
        decision.reason ?? "Blocked by learning-loop gate";
    }
    return JSON.stringify({ hookSpecificOutput });
  }
  return formatOutput(decision);
}
