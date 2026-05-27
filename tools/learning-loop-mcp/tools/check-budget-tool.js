import { z } from "zod";
import { runCheckBudget } from "#mcp/core/budget-checker.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const budgetCheckTool = {
  name: "budget_check",
  description: "Check resource budget status for a given system and resource. Returns budget, current usage, remaining, and stale status.",
  schema: {
    system: z.string().describe("External system name (e.g., 'vnstock')"),
    resource: z.string().describe("Resource name (e.g., 'device-slots')"),
    allow_active_window: z.boolean().optional().describe("Allow active validation window without blocking"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const result = runCheckBudget(root, {
      system: args.system,
      resource: args.resource,
      allowActiveWindow: args.allow_active_window,
    });

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "budget_check",
      system: args.system,
      resource: args.resource,
      code: result.code,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: result.error, code: result.code }) }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: JSON.stringify({ ...result.output, code: result.code }) }] };
  },
};
