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
