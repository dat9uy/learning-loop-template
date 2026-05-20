import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";

/**
 * Extract capability entries from a running FastAPI dev server or OpenAPI JSON.
 * @param {string} root — repo root
 * @param {{ useFixture?: string, useOpenApi?: object, serverUrl?: string }} [opts]
 * @returns {{ entries: Array<{source: string, domain: string}> }}
 */
export async function extract(root, opts = {}) {
  let openapiJson;

  if (opts.useOpenApi) {
    openapiJson = opts.useOpenApi;
  } else if (opts.useFixture) {
    openapiJson = JSON.parse(readFileSync(opts.useFixture, "utf8"));
  } else if (opts.serverUrl) {
    const res = await fetch(`${opts.serverUrl}/openapi.json`);
    if (!res.ok) throw new Error(`Failed to fetch OpenAPI: ${res.status}`);
    openapiJson = await res.json();
  } else {
    const apiRoot = join(root, "product", "api");
    const pythonCode = `
import json, sys, types
from pathlib import Path

vnstock_data_stub = types.ModuleType("vnstock_data")
vnstock_data_stub.Reference = object
sys.modules["vnstock_data"] = vnstock_data_stub

vnstock_env_stub = types.ModuleType("vnstock_env")
vnstock_env_stub.__version__ = "stub"
sys.modules["vnstock_env"] = vnstock_env_stub

api_root = Path("${apiRoot.replace(/\\/g, "\\\\")}")
if str(api_root) not in sys.path:
    sys.path.insert(0, str(api_root))

from src.main import app
print(json.dumps(app.openapi()))
`;
    const output = execFileSync("uv", ["run", "python", "-c", pythonCode], {
      cwd: apiRoot,
      encoding: "utf8",
      timeout: 30000,
    });
    openapiJson = JSON.parse(output);
  }

  const entries = [];
  for (const [path, methods] of Object.entries(openapiJson.paths || {})) {
    for (const method of Object.keys(methods)) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        if (path === "/health") continue;
        const source = `${method.toUpperCase()} ${path}`;
        const domain = path.replace(/^\//, "").split("/")[0];
        if (!domain) continue;
        entries.push({ source, domain });
      }
    }
  }

  return { entries };
}
