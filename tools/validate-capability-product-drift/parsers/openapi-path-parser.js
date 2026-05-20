// Surface: HTTP/REST
// To add a new surface:
// 1. Create validators/<surface-kebab>-validator.js
// 2. Export a function matching signature: (capabilityRecord, root) => string[]
// 3. Register in surface-registry.js
// 4. Document in docs/operator-guide.md under "Capability Validation"

/** @param {Record<string, unknown>} openapiJson */
export function parseOpenApiPaths(openapiJson) {
  const routes = new Map();
  for (const [path, methods] of Object.entries(openapiJson.paths || {})) {
    for (const method of Object.keys(methods)) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        routes.set(`${method.toUpperCase()} ${path}`, true);
      }
    }
  }
  return routes;
}
