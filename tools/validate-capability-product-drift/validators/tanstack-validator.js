import { parseTanStackRoutes } from "../parsers/tanstack-route-parser.js";

/**
 * @param {Record<string, unknown>} capabilityRecord
 * @param {string} root
 * @returns {string[]}
 */
export function validateTanStackDrift(capabilityRecord, root) {
  const routes = parseTanStackRoutes(root);
  const errors = [];
  for (let i = 0; i < (capabilityRecord.maps || []).length; i++) {
    const map = capabilityRecord.maps[i];
    if (!routes.has(map.route_class)) {
      errors.push(
        `capability drift: ${capabilityRecord.__file} map[${i}] route_class "${map.route_class}" not found in TanStack routes (surface: TanStack Start route)`
      );
    }
  }
  return errors;
}
