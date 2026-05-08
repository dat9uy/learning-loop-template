import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "../validate-records/simple-yaml-parser.js";

export function loadPacks(root) {
  const packsRoot = join(root, "knowledge-packs");
  return readdirSync(packsRoot).sort().flatMap((name) => {
    const manifestPath = join(packsRoot, name, "manifest.yaml");
    if (!existsSync(manifestPath)) return [];
    const manifest = parseYaml(readFileSync(manifestPath, "utf8"));
    const capabilitiesPath = join(packsRoot, name, "capabilities.yaml");
    const capabilities = existsSync(capabilitiesPath)
      ? parseYaml(readFileSync(capabilitiesPath, "utf8")).capabilities || []
      : [];
    return [{ ...manifest, capabilities }];
  });
}
