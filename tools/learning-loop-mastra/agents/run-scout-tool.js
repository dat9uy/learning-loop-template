/**
 * createTool wrapper over tools/learning-loop-mcp/scout/run-scout.js#runScout.
 * Read-only contract: exposes only { projectRoot?, excludeGlobs? }.
 * Write flags (writeJson, writeMarkdown) are pinned to false in the wrapper so
 * the contract is local — not derived from defaults in run-scout.js.
 */
import { createLoopTool } from "../create-loop-tool.js";
import { z } from "zod";
import { runScout } from "#mcp/scout/run-scout.js";

export const runScoutTool = createLoopTool({
  id: "run_scout",
  description:
    "Run the scout pipeline at tools/learning-loop-mcp/scout/run-scout.js. Returns a ScoutOutput JSON object. Read-only; never edits tests or fixtures.",
  inputSchema: z.object({
    projectRoot: z.string().default(() => process.cwd()),
    excludeGlobs: z.array(z.string()).optional(),
  }),
  execute: async (input) => {
    return await runScout({
      projectRoot: input.projectRoot,
      excludeGlobs: input.excludeGlobs,
      writeJson: false,
      writeMarkdown: false,
    });
  },
});
