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

// Module-level in-process serializer. Tests that spawn multiple MCP servers
// (legacy + mastra) with a shared GATE_ROOT race on registry writes because
// each server reads and writes meta-state.jsonl independently. This queue
// guarantees that all listTools/callTool operations from this process are
// FIFO and non-overlapping. Per-process scope is intentional: each test file
// runs in its own process via node --test, and each test gets its own temp
// GATE_ROOT, so the queue never starves unrelated tests.
let inFlight = Promise.resolve();
function withMutex(operation) {
  const release = inFlight;
  const next = release.then(() => operation(), () => operation());
  inFlight = next.then(() => undefined, () => undefined);
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

function prepareTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "mcp-server-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);
  return tempRoot;
}

/**
 * Connect to a single MCP server entry point with a shared GATE_ROOT.
 *
 * Returns handles for calling tools and listing tools, plus a cleanup function.
 */
export async function connectMcpServer(serverEntry, tempRoot) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverEntry],
    env: { ...process.env, GATE_ROOT: tempRoot },
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const listTools = async () =>
    withMutex(async () => {
      const result = await client.listTools();
      return result.tools;
    });

  const callTool = async (name, args) =>
    withMutex(async () => {
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
      }
    },
  };
}

/**
 * Run a test function against a single MCP server entry point.
 *
 * Creates an isolated temp GATE_ROOT, connects a Client, invokes fn(handles),
 * and cleans up the child process afterwards.
 */
export async function withMcpServer(serverEntry, fn) {
  const tempRoot = prepareTempRoot();
  const handles = await connectMcpServer(serverEntry, tempRoot);
  try {
    await fn(handles);
  } finally {
    await handles.cleanup();
  }
}

/**
 * Convenience entry point for the legacy learning-loop-mcp server.
 */
export function withLegacyMcpServer(fn) {
  return withMcpServer(
    join(projectRoot, "tools/learning-loop-mcp/server.js"),
    fn,
  );
}

/**
 * Convenience entry point for the learning-loop-mastra server.
 */
export function withMastraMcpServer(fn) {
  return withMcpServer(
    join(projectRoot, "tools/learning-loop-mastra/server.js"),
    fn,
  );
}
