// Surface-based parser registry.
// To add a new surface:
// 1. Create validators/<surface-kebab>-validator.js
// 2. Export a function matching signature: (capabilityRecord, root) => string[]
// 3. Register it here under the surface name from capability records
// 4. Document in docs/operator-guide.md under "Capability Validation"

import { validateHttpRestDrift } from "./validators/http-rest-validator.js";
import { validateTanStackDrift } from "./validators/tanstack-validator.js";

/** @type {Record<string, (record: Record<string, unknown>, root: string) => string[]>} */
export const surfaceRegistry = {
  "HTTP/REST": validateHttpRestDrift,
  "TanStack Start route": validateTanStackDrift,
};
