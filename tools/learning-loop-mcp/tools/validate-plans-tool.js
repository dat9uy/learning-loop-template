import { z } from "zod";
import { scanPlans, report } from "#mcp/core/plan-validator.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const indexValidatePlansTool = {
  name: "index_validate_plans",
  description: "Validate all plan.md files for product-build tag compliance. Checks Phase 0 presence and decision records for each declared surface.",
  schema: {},
  handler: async () => {
    const root = resolveRoot();
    const { violations, checked } = scanPlans(root);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "index_validate_plans",
      checked,
      violation_count: violations.length,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ violations, checked, passed: violations.length === 0 }) }],
    };
  },
};
