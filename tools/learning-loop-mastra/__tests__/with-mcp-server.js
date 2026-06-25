import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

// Per-tempRoot in-process serializer. Tests that spawn multiple MCP servers
// (legacy + mastra) with a shared GATE_ROOT race on registry writes because
// each server reads and writes meta-state.jsonl independently. This map keeps
// a FIFO queue per tempRoot so operations sharing a GATE_ROOT serialize, while
// unrelated tempRoots run concurrently.
const inFlightByTempRoot = new Map();

function withMutex(tempRoot, operation) {
  if (!inFlightByTempRoot.has(tempRoot)) {
    inFlightByTempRoot.set(tempRoot, Promise.resolve());
  }
  const release = inFlightByTempRoot.get(tempRoot);
  const next = release.then(() => operation(), () => operation());
  inFlightByTempRoot.set(tempRoot, next.then(() => undefined, () => undefined));
  return next;
}

function copySchemas(tempRoot) {
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(tempRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }
}

export function prepareTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "mcp-server-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);
  return tempRoot;
}

/**
 * Connect to a single MCP server entry point with a shared GATE_ROOT.
 *
 * Sets MASTRA_STORAGE_DRIVER=memory by default. Pass `env` to override or
 * extend environment variables.
 *
 * Returns handles for calling tools and listing tools, plus a cleanup function.
 */
export async function connectMcpServer(serverEntry, tempRoot, env = {}) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverEntry],
    env: {
      ...process.env,
      GATE_ROOT: tempRoot,
      MASTRA_STORAGE_DRIVER: "memory",
      ...env,
    },
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const listTools = async () =>
    withMutex(tempRoot, async () => {
      const result = await client.listTools();
      return result.tools;
    });

  const callTool = async (name, args) =>
    withMutex(tempRoot, async () => {
      const result = await client.callTool({ name, arguments: args });
      if (
        !result ||
        !Array.isArray(result.content) ||
        !result.content[0] ||
        typeof result.content[0].text !== "string"
      ) {
        throw new Error(
          `Unexpected MCP result for ${name}: ${JSON.stringify(result)}`,
        );
      }
      return JSON.parse(result.content[0].text);
    });

  return {
    client,
    listTools,
    callTool,
    tempRoot,
    async cleanup() {
      try {
        await client.close();
      } catch (e) {
        if (!e?.message?.includes("closed")) {
          console.error("client close error:", e);
        }
      } finally {
        inFlightByTempRoot.delete(tempRoot);
      }
    },
  };
}

/**
 * Run a test function against the canonical Mastra MCP server entry point.
 *
 * Creates an isolated temp GATE_ROOT, connects a Client, invokes fn(handles),
 * and cleans up the child process afterwards.
 */
export async function withMcpServer(fn) {
  const tempRoot = prepareTempRoot();
  const handles = await connectMcpServer(
    join(projectRoot, "tools/learning-loop-mastra/mastra/server.js"),
    tempRoot,
  );
  try {
    await fn(handles);
  } finally {
    await handles.cleanup();
  }
}
