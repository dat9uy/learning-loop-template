// Surface: TanStack Start route
// To add a new surface:
// 1. Create validators/<surface-kebab>-validator.js
// 2. Export a function matching signature: (capabilityRecord, root) => string[]
// 3. Register in surface-registry.js
// 4. Document in docs/operator-guide.md under "Capability Validation"

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} root */
export function parseTanStackRoutes(root) {
  const routerPath = join(root, "product", "web", "src", "router.tsx");
  const routerSource = readFileSync(routerPath, "utf8");

  const routes = new Map();

  // Find imports like: import { equityRoutePath, ... } from './routes/reference/equity'
  const importRe = /import\s+\{([^}]+)\}\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g;
  /** @type {RegExpExecArray | null} */
  let match;
  while ((match = importRe.exec(routerSource)) !== null) {
    const imports = match[1];
    const routeFile = match[2];
    // Only process imports that include a RoutePath variable
    if (!imports.includes("RoutePath")) continue;

    const routeFilePath = join(root, "product", "web", "src", "routes", routeFile + ".tsx");
    const routeSource = readFileSync(routeFilePath, "utf8");

    // Extract: export const xyzRoutePath = '/some/path'
    const pathRe = /export\s+const\s+(\w+RoutePath)\s+=\s+['"]([^'"]+)['"]/g;
    /** @type {RegExpExecArray | null} */
    let pathMatch;
    while ((pathMatch = pathRe.exec(routeSource)) !== null) {
      const pathValue = pathMatch[2];
      routes.set(pathValue, true);
    }
  }

  return routes;
}
