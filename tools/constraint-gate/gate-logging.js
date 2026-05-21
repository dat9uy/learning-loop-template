import {
  appendFileSync,
  mkdirSync,
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_BACKUPS = 5;

/**
 * Rotate gate-log.jsonl if it exceeds MAX_LOG_SIZE.
 * Keeps only the MAX_LOG_BACKUPS most recent backups.
 */
export function rotateGateLog(logDir) {
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
 * Append a JSONL entry to the gate log. Never blocks on failure.
 */
export function appendGateLog(root, entry) {
  try {
    const logDir = join(root, ".claude", "coordination");
    mkdirSync(logDir, { recursive: true });
    rotateGateLog(logDir);
    appendFileSync(join(logDir, "gate-log.jsonl"), JSON.stringify(entry) + "\n");
  } catch {
    // log failure never blocks gate decision
  }
}
