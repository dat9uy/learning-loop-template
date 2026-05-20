import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseOpenApiPaths } from "../parsers/openapi-path-parser.js";

/**
 * @param {Record<string, unknown>} capabilityRecord
 * @param {string} root
 * @returns {string[]}
 */
export function validateHttpRestDrift(capabilityRecord, root) {
  const scriptPath = join(root, "tools", "generate-openapi", "generate-openapi.py");
  const openapiJson = JSON.parse(
    execFileSync("uv", ["run", "python", scriptPath], {
      cwd: join(root, "product", "api"),
      encoding: "utf8",
      timeout: 30000,
    })
  );
  const routes = parseOpenApiPaths(openapiJson);
  const errors = [];
  for (let i = 0; i < (capabilityRecord.maps || []).length; i++) {
    const map = capabilityRecord.maps[i];
    if (!routes.has(map.route_class)) {
      errors.push(
        `capability drift: ${capabilityRecord.__file} map[${i}] route_class "${map.route_class}" not found in OpenAPI spec (surface: HTTP/REST)`
      );
    }
  }
  return errors;
}
