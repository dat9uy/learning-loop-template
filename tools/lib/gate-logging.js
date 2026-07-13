import {
  appendFileSync,
  mkdirSync,
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_BACKUPS = 5;

/**
 * Rotate gate-log.jsonl if it exceeds MAX_LOG_SIZE.
 * Keeps only the MAX_LOG_BACKUPS most recent backups.
 */
function rotateGateLog(logDir) {
  try {
    const logPath = join(logDir, "gate-log.jsonl");
    const stats = statSync(logPath);
    if (stats.size <= MAX_LOG_SIZE) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(logPath, join(logDir, `gate-log-${timestamp}.jsonl`));

    const backups = readdirSync(logDir)
      .filter((f) => f.startsWith("gate-log-") && f.endsWith(".jsonl"))
      .map((f) => {
        const s = statSync(join(logDir, f));
        return { name: f, mtime: s.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const b of backups.slice(MAX_LOG_BACKUPS)) {
      unlinkSync(join(logDir, b.name));
    }
  } catch {
    // rotation failure never blocks gate decision
  }
}

/**
 * Validate that a `root` is usable for the gate log. Throws on bad input
 * rather than silently creating junk directories (e.g., the literal path
 * `undefined/.claude/coordination` produced when a test resets
 * `process.env.GATE_ROOT = undefined`, which Node coerces to the string
 * "undefined" and `resolveRoot()` resolves to `<cwd>/undefined`).
 *
 * `GATE_LOG_DIR` overrides are accepted as-is (operators can target any
 * absolute path); only the `join(root, ...)` fallback is validated.
 */
function resolveLogDir(root) {
  if (process.env.GATE_LOG_DIR) return process.env.GATE_LOG_DIR;
  if (typeof root !== "string" || root === "" || root === "undefined") {
    throw new Error(
      `appendGateLog: invalid root ${JSON.stringify(root)} — pass a non-empty string (use resolveRoot() from #lib/resolve-root.js)`,
    );
  }
  if (!isAbsolute(root)) {
    throw new Error(
      `appendGateLog: root must be an absolute path, got ${JSON.stringify(root)} — use resolveRoot() (or pass GATE_LOG_DIR to override)`,
    );
  }
  return join(root, ".claude", "coordination");
}

/**
 * Append a JSONL entry to the gate log. I/O failures are swallowed (a logging
 * failure must never block a gate decision); contract failures (bad `root`)
 * throw — surface the bug to the caller instead of creating bogus directories
 * like `<cwd>/undefined/.claude/coordination/`.
 */
export function appendGateLog(root, entry) {
  let logDir;
  try {
    logDir = resolveLogDir(root);
  } catch (err) {
    // Contract failure (bad root). Surface to caller — silent mkdir of bogus
    // paths is worse than a thrown error here (it was the root cause of the
    // `undefined/.claude/coordination/` artifact on disk).
    throw err;
  }
  try {
    mkdirSync(logDir, { recursive: true });
    rotateGateLog(logDir);
    appendFileSync(join(logDir, "gate-log.jsonl"), JSON.stringify(entry) + "\n");
  } catch {
    // I/O failure (disk full, permission denied, etc.) — never blocks gate.
  }
}

/**
 * Append a structured tool-call record to the gate log. The canonical form
 * used by every tool handler: `{ timestamp, tool, ...result }`. Centralised
 * here so the timestamp format and tool-key field are single-source and fallow
 * stops flagging the same 8-line pattern across handlers.
 *
 * @param {string} root - project root; absolute path.
 * @param {string} tool - the MCP tool name (e.g., "meta_state_ship_loop_design").
 * @param {object} result - the structured outcome to log alongside the tool name.
 */
export function logToolCall(root, tool, result) {
  appendGateLog(root, { timestamp: new Date().toISOString(), tool, ...result });
}
