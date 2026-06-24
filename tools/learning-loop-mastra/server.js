import { MCPServer } from "@mastra/mcp";
import { Mastra } from "@mastra/core";
import { createTool } from "@mastra/core/tools";
import { makeCoreTool } from "@mastra/core/utils";
import { RequestContext } from "@mastra/core/request-context";
import { randomUUID } from "node:crypto";
import { createLoopTool } from "./create-loop-tool.js";
import { adaptLegacyHandler } from "./legacy-handler-adapter.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { storage, initStorage } from "./storage.js";
import { loadAgentsManifest } from "./agents/load-agents-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "tools", "manifest.json"), "utf8"),
);
const WORKFLOW_MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "workflows-manifest.json"), "utf8"),
);

const PREFIX = "mastra_";
const tools = {};

for (const { file, export: exportName } of MANIFEST) {
  const mod = await import(`#mcp/${file}`);
  const legacy = mod[exportName];
  if (!legacy) {
    console.error(`skipped ${file} (missing export "${exportName}")`);
    continue;
  }
  const prefixed = PREFIX + legacy.name;
  tools[prefixed] = createLoopTool({
    id: prefixed,
    description: legacy.description,
    inputSchema: legacy.schema,
    execute: adaptLegacyHandler(legacy),
  });
}

const workflows = {};
for (const { file, export: exportName } of WORKFLOW_MANIFEST) {
  const mod = await import(`./${file}`);
  const wf = mod[exportName];
  if (!wf) {
    console.error(`skipped ${file} (missing export "${exportName}")`);
    continue;
  }
  workflows[wf.id] = wf;
}

// MASTRA_AGENTS_MANIFEST is a TEST-ONLY env var (used by agent-parity.test.cjs).
// In production, the default agents-manifest.json is loaded. Never set this env
// var in a production deployment; the test fixture under __tests__/fixtures/ is
// for parity tests only. Path containment is enforced in loadAgentsManifest.
const AGENTS_MANIFEST = loadAgentsManifest();
const agents = {};
for (const [key, entry] of Object.entries(AGENTS_MANIFEST.agents)) {
  const mod = await import(`./${entry.file}`);
  const agent = mod[entry.export];
  if (!agent) {
    console.error(`skipped agent ${key} (missing export "${entry.export}")`);
    continue;
  }
  agents[key] = agent;
}

console.error(`learning-loop-mastra: registered ${Object.keys(tools).length} tools, ${Object.keys(workflows).length} workflows, ${Object.keys(agents).length} agents, storage.id=${storage.id}`);

// Custom MCPServer subclass that extracts only the step result from workflow
// execution output, ensuring parity with legacy createTool handlers.
class LoopMCPServer extends MCPServer {
  convertWorkflowsToTools(workflowsConfig, definedConvertedTools) {
    const workflowTools = {};
    if (!workflowsConfig) {
      return workflowTools;
    }
    for (const workflowKey in workflowsConfig) {
      const workflow = workflowsConfig[workflowKey];
      if (!workflow || typeof workflow.createRun !== "function") {
        this.logger.warn(
          `Workflow instance for '${workflowKey}' is invalid or missing a createRun function. Skipping.`
        );
        continue;
      }
      const workflowDescription = workflow.description;
      if (!workflowDescription) {
        throw new Error(
          `Workflow '${workflow.id}' (key: '${workflowKey}') must have a non-empty description to be used in an MCPServer.`
        );
      }
      const workflowToolName = `run_${workflowKey}`;
      if (definedConvertedTools?.[workflowToolName] || workflowTools[workflowToolName]) {
        this.logger.warn(
          `Tool with name '${workflowToolName}' already exists. Workflow '${workflowKey}' will not be added as a duplicate tool.`
        );
        continue;
      }
      const workflowToolDefinition = createTool({
        id: workflowToolName,
        description: `Run workflow '${workflowKey}'. Workflow description: ${workflowDescription}`,
        inputSchema: workflow.inputSchema,
        execute: async (inputData, context) => {
          this.logger.debug(
            `Executing workflow tool '${workflowToolName}' for workflow '${workflow.id}' with input:`,
            inputData
          );
          try {
            const proxiedContext = context?.requestContext || new RequestContext();
            if (context?.mcp?.extra) {
              Object.entries(context.mcp.extra).forEach(([key, value]) => {
                proxiedContext.set(key, value);
              });
            }
            const run2 = await workflow.createRun({ runId: proxiedContext?.get("runId") ?? randomUUID() });
            const response = await run2.start({
              inputData,
              requestContext: proxiedContext,
              tracingContext: context?.tracingContext
            });
            // Extract only the step result for parity with legacy handlers
            return response?.result ?? response;
          } catch (error) {
            this.logger.error(
              `Error executing workflow tool '${workflowToolName}' for workflow '${workflow.id}':`,
              error
            );
            throw error;
          }
        }
      });
      const options = {
        name: workflowToolName,
        logger: this.logger,
        mastra: this.mastra,
        requestContext: new RequestContext(),
        tracingContext: {},
        description: workflowToolDefinition.description
      };
      const coreTool = makeCoreTool(workflowToolDefinition, options);
      workflowTools[workflowToolName] = {
        ...coreTool,
        id: workflowToolName,
        mcp: {
          toolType: "workflow"
        }
      };
      this.logger.info("Registered workflow as tool", {
        workflow: workflow.id,
        key: workflowKey,
        tool: workflowToolName
      });
    }
    return workflowTools;
  }
}

// Initialize storage before the server starts accepting requests so that
// workflows can persist stateSchema snapshots from the first call.
// initStorage() is idempotent (~15ms first call, <1ms subsequent).
await initStorage();

const server = new LoopMCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.2",
  description:
    "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2+3). 31 tools + 10 workflows + 3 agents across 6 groups.",
  tools,
  workflows,
  agents,
});

const mastra = new Mastra({
  storage,
  mcpServers: { "learning-loop-mastra": server },
});

await server.startStdio();
