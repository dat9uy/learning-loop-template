/**
 * Lazy-loaded adapter registry.
 * Keys must match the `surface` enum in schemas/capability.schema.json.
 */
export const adapterRegistry = {
  "HTTP/REST": () => import("./fastapi-adapter.js"),
  "TanStack Start route": () => import("./tanstack-adapter.js"),
};
