import { appendGateLog } from "./gate-logging.js";

const registeredNames = new Set();

/**
 * Safely import a module, logging failures without crashing.
 */
export async function safeImport(path, root) {
  try {
    return await import(path);
  } catch (err) {
    appendGateLog(root || ".", {
      timestamp: new Date().toISOString(),
      action: "safeImport_failed",
      path,
      error: err.message,
    });
    return null;
  }
}

/**
 * Register a tool on an MCP server with error boundary and name collision check.
 */
export function registerTool(server, config) {
  if (registeredNames.has(config.name)) {
    throw new Error(`Tool name collision: ${config.name} already registered`);
  }
  registeredNames.add(config.name);

  // Error boundary: wrap handler to catch exceptions and return structured errors
  const wrappedHandler = async (args) => {
    try {
      return await config.handler(args);
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            tool: config.name,
            message: error.message,
          }),
        }],
        isError: true,
      };
    }
  };

  server.tool(config.name, config.description, config.schema, wrappedHandler);
}
