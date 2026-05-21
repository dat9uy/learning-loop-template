const registeredNames = new Set();

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
