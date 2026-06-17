import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMcpServer } from "./with-mcp-server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const legacyEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");
const mastraEntry = join(projectRoot, "tools/learning-loop-mastra/server.js");

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
  const tempRoot = mkdtempSync(join(tmpdir(), "both-mcp-servers-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);
  return tempRoot;
}

/**
 * Spawn both the legacy and mastra MCP servers in the same test process with a
 * shared GATE_ROOT.
 *
 * The returned `call(name, args, { server })` helper serializes cross-server
 * calls so only one tool call is in flight at a time. This avoids interleaved
 * writes to the shared meta-state.jsonl registry.
 */
export async function withBothMcpServers(fn) {
  const tempRoot = prepareTempRoot();

  const legacy = await connectMcpServer(legacyEntry, tempRoot);
  const mastra = await connectMcpServer(mastraEntry, tempRoot);

  // Single in-flight promise mutex for shared registry safety. This is a
  // best-effort in-process serializer: it ensures only one callTool/listTools
  // is in flight at a time for the two clients spawned by this helper. It does
  // not guard against server-side concurrent writes or unrelated processes
  // touching the same temp root.
  let inFlight = Promise.resolve();
  const withMutex = async (operation) => {
    const release = await inFlight;
    inFlight = operation().finally(() => {});
    return inFlight;
  };

  const listTools = ({ server }) =>
    withMutex(async () =>
      server === "legacy" ? legacy.listTools() : mastra.listTools(),
    );

  const callTool = (name, args, { server }) =>
    withMutex(async () => {
      const target = server === "legacy" ? legacy : mastra;
      return target.callTool(name, args);
    });

  try {
    await fn({ legacy, mastra, tempRoot, listTools, callTool });
  } finally {
    await Promise.all([legacy.cleanup(), mastra.cleanup()]);
  }
}
