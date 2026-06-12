import { z } from "zod";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { resolveRoot } from "#lib/resolve-root.js";

const SIDECAR_FILENAME = "runtime-state.jsonl";

function computeFingerprint(row) {
  const data = `${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}`;
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

function readSidecar(root) {
  const path = join(root, SIDECAR_FILENAME);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export const runtimeStateReadTool = {
  name: "runtime_state_read",
  description: "Read runtime state sidecar entries. Queries runtime-state.jsonl for ledger events and budget states. Read-only; does not mutate state. Use to inspect mutable runtime state (device slots, budgets, counters) that is not derivable from code.",
  schema: {
    affected_system: z.enum(["vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"]).optional()
      .describe("Filter by affected system"),
    kind: z.enum(["ledger-event", "budget-state"]).optional()
      .describe("Filter by kind"),
    since: z.string().datetime().optional()
      .describe("Filter entries with timestamp >= since"),
    until: z.string().datetime().optional()
      .describe("Filter entries with timestamp <= until"),
    limit: z.number().int().min(1).max(1000).default(100)
      .describe("Maximum number of entries to return"),
  },
  handler: async ({ affected_system, kind, since, until, limit = 100 }) => {
    const root = resolveRoot();
    const rows = readSidecar(root);

    let result = rows;

    if (affected_system) {
      result = result.filter((r) => r.affected_system === affected_system);
    }
    if (kind) {
      result = result.filter((r) => r.kind === kind);
    }
    if (since) {
      const sinceMs = new Date(since).getTime();
      result = result.filter((r) => new Date(r.timestamp).getTime() >= sinceMs);
    }
    if (until) {
      const untilMs = new Date(until).getTime();
      result = result.filter((r) => new Date(r.timestamp).getTime() <= untilMs);
    }

    result = result.slice(0, limit);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ count: result.length, rows: result }),
      }],
    };
  },
};
