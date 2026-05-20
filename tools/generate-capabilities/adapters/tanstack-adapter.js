import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Extract capability entries from TanStack router.tsx and route files.
 * @param {string} root — repo root
 * @param {{ routerPath?: string }} [opts]
 * @returns {{ entries: Array<{source: string, domain: string}> }}
 */
export async function extract(root, opts = {}) {
  const routerPath = opts.routerPath || join(root, "product", "web", "src", "router.tsx");
  const routerSource = readFileSync(routerPath, "utf8");
  const routerDir = dirname(routerPath);

  const entries = [];

  const importRe = /import\s+\{([^}]+)\}\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(routerSource)) !== null) {
    const imports = match[1];
    const routeFile = match[2];
    if (!imports.includes("RoutePath")) continue;

    const routeFilePath = join(routerDir, "routes", routeFile + ".tsx");
    const routeSource = readFileSync(routeFilePath, "utf8");

    const pathRe = /export\s+const\s+(\w+RoutePath)\s+=\s+['"]([^'"]+)['"]/g;
    let pathMatch;
    while ((pathMatch = pathRe.exec(routeSource)) !== null) {
      const pathValue = pathMatch[2];
      const domain = pathValue.replace(/^\//, "").split("/")[0];
      if (!domain) continue;
      entries.push({ source: pathValue, domain });
    }
  }

  return { entries };
}
