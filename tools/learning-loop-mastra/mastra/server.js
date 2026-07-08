import { MCPServer } from "@mastra/mcp";
import { Mastra } from "@mastra/core";
import { createTool } from "@mastra/core/tools";
import { makeCoreTool } from "@mastra/core/utils";
import { RequestContext } from "@mastra/core/request-context";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createLoopTool } from "./create-loop-tool.js";
import { adaptLegacyHandler } from "./handler-adapter.js";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { storage, initStorage } from "../storage.js";
import { loadAgentsManifest } from "./agents/load-agents-manifest.js";
import { pinRuntimeIdAtBoot } from "../core/identity-pin.js";
import { validateToolManifest } from "../core/r2/path-field-detector.js";
import { invalidateAllowlist, loadAllowlist } from "../core/r2/allowlist-cache.js";
import { validateR2AllowlistShape } from "../core/r2/allowlist-shape.js";
import { findProjectRoot } from "../core/gate-logic.js";

// Pin runtime identity before any await; see core/identity-pin.js.
// Synchronous, idempotent, freezes the runtime id for process lifetime (R2).
pinRuntimeIdAtBoot();

const __dirname = dirname(fileURLToPath(import.meta.url));
// manifest.json uses JSONC (line-start // comments for convention docs).
// The shim only strips full-line comments; inline `// ...` after code and
// trailing commas would silently drop content. Keep the manifest header
// rule strict (see tools/manifest.json:1-11) to avoid this footgun.
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "..", "tools", "manifest.json"), "utf8")
    .replace(/^\s*\/\/.*$/gm, ""),
);
// R3 default-deny: every manifest entry MUST declare pathFields. Throws at
// boot (loud failure) if any entry is missing the field.
validateToolManifest(MANIFEST);
const WORKFLOW_MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "workflows-manifest.json"), "utf8"),
);

const PREFIX = "mastra_";
const tools = {};

for (const entry of MANIFEST) {
  const { file, export: exportName } = entry;
  const mod = await import(`../tools/handlers/${file.replace('tools/', '')}`);
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
    pathFields: entry.pathFields ?? [],
  });
}

// F9: update_r2_allowlist — the operator-only path to edit .loop/r2-allowlist.json.
// Requires a preflight marker (.loop/.r2-operator-preflight) so accidental calls
// do not mutate the gate. Validates the schema before an atomic temp+rename,
// invalidates the allowlist cache, and logs intent BEFORE the rename.
const R2_ALLOWLIST_PATH = ".loop/r2-allowlist.json";
const R2_OPERATOR_PREFLIGHT = ".loop/.r2-operator-preflight";

tools[`${PREFIX}update_r2_allowlist`] = createLoopTool({
  id: `${PREFIX}update_r2_allowlist`,
  description: "Operator-only: atomically replace .loop/r2-allowlist.json (R2 per-runtime write allowlist). Requires a preflight marker at .loop/.r2-operator-preflight. Validates the schema before write and invalidates the in-process allowlist cache.",
  inputSchema: {
    allowlist: z.record(z.unknown()).describe("Full replacement allowlist object with schema='r2-allowlist/v1', version=1, per-runtime own/deny arrays, and universal array."),
  },
  pathFields: [],
  execute: async ({ allowlist }) => {
    const root = findProjectRoot();
    const preflightPath = join(root, R2_OPERATOR_PREFLIGHT);
    if (!existsSync(preflightPath)) {
      throw new Error(
        `r2_allowlist_preflight_missing: create the marker file at ${R2_OPERATOR_PREFLIGHT} before editing the allowlist (operator-only guard).`,
      );
    }
    // Validate the replacement shape before touching disk.
    validateR2AllowlistShape(allowlist);
    const target = join(root, R2_ALLOWLIST_PATH);
    const tmp = `${target}.tmp`;
    // Log intent BEFORE the rename (R6 ordering).
    console.error(`r2: update_r2_allowlist replacing ${R2_ALLOWLIST_PATH} (operator-preflight present)`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(tmp, JSON.stringify(allowlist, null, 2), "utf8");
    renameSync(tmp, target);
    // Invalidate the cache so the next R2 call re-reads the new allowlist.
    invalidateAllowlist(root);
    // Verify by re-loading.
    const reloaded = loadAllowlist(root);
    return { ok: true, schema: reloaded.schema, version: reloaded.version };
  },
});

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

console.error(`learning-loop: registered ${Object.keys(tools).length} tools, ${Object.keys(workflows).length} workflows, ${Object.keys(agents).length} agents, storage.id=${storage.id}`);

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
      const workflowToolDefinition = createLoopTool({
        id: workflowToolName,
        description: `Run workflow '${workflowKey}'. Workflow description: ${workflowDescription}`,
        inputSchema: workflow.inputSchema,
        // Workflow tools take structured run inputs, not raw write-path args.
        // pathFields: [] short-circuits the R2 gate to allow (R4: workflow
        // tools still flow through createLoopTool so the gate is the single
        // write-authorization point; a future workflow that accepts a write-
        // path arg would declare it here).
        pathFields: [],
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
  id: "learning-loop",
  name: "learning-loop",
  version: "0.1.2",
  description:
    "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2+3). 31 tools + 10 workflows + 3 agents across 6 groups.",
  tools,
  workflows,
  agents,
});

const mastra = new Mastra({
  storage,
  mcpServers: { "learning-loop": server },
});

await server.startStdio();
