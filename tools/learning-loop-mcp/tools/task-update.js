import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLoopTool } from "#mastra/create-loop-tool.js";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const CACHE_PATH = path.resolve(".claude/task-status-cache.json");

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch { return {}; }
}

function writeCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export const taskUpdate = createLoopTool({
  id: "task_update",
  description: "Wraps native TaskUpdate; returns {changed: bool} so agents can detect no-ops and stop degenerate loops.",
  inputSchema: {
    taskId: z.string().describe("Task identifier"),
    status: z.enum(["pending", "in_progress", "completed"]).describe("New status"),
    reason: z.string().optional().describe("Optional reason for the update"),
  },
  execute: async ({ taskId, status, reason }) => {
    if (!taskId) return { changed: false, error: "taskId required" };
    const cache = readCache();
    const previous = cache[taskId] || null;
    try {
      const args = ["task", "update", "--id", taskId, "--status", status];
      if (reason) args.push("--reason", reason);
      await execFileAsync("claude", args);
    } catch (err) {
      return { changed: false, error: `native TaskUpdate failed: ${err.message}`, previous, current: previous };
    }
    const changed = previous !== status;
    cache[taskId] = status;
    writeCache(cache);
    return { changed, previous, current: status, runAt: new Date().toISOString() };
  },
});
