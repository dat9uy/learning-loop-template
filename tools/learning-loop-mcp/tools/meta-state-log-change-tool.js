import { z } from "zod";
import { writeEntry, generateId, metaStateChangeEntrySchema } from "#mcp/core/meta-state.js";
import { slugify } from "#mcp/core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  description: "Log a system change (schema, rule, tool, policy, surface, lifecycle, manifest) as a change-log entry in the meta-state registry. The entry is immutable, status=active, no TTL. Use supersedes to replace a prior change entry. Use when you ship a meaningful code or rule change that should appear in the durable audit log. Not for operator-observed issues (use `meta_state_report` instead) or for closing a finding (use `meta_state_resolve` instead).",
  schema: {
    change_dimension: z.enum(["semantic", "mechanical", "surface"])
      .describe("What kind of change: semantic (schemas/taxonomies/contracts) | mechanical (rules/policies/enforcement) | surface (tools/surfaces/lifecycles/manifests)"),
    change_target: z.string().min(1)
      .describe("Specific path or identifier being changed"),
    change_diff: z.object({
      added: z.array(z.string()).default([]).describe("Paths/fields added"),
      removed: z.array(z.string()).default([]).describe("Paths/fields removed"),
      changed: z.array(z.string()).default([]).describe("Paths/fields whose meaning changed (not value)"),
    }).describe("Structured diff"),
    reason: z.string().min(20)
      .describe("Why the change was made (min 20 chars)"),
    applies_to: z.object({
      tools: z.array(z.string()).optional().describe("Tool names affected"),
      surfaces: z.array(z.string()).optional().describe("Surface names affected"),
      rules: z.array(z.string()).optional().describe("Rule IDs affected"),
      statuses: z.array(z.string()).optional().describe("Status values affected"),
      schemas: z.array(z.string()).optional().describe("Schema files affected"),
    }).optional().describe("Wider impact scope"),
    supersedes: z.string().optional()
      .describe("ID of a previous change-log entry this one replaces"),
    consolidates: z.string().optional()
      .describe("ID of a finding entry this change-log consolidates (inverse of finding's consolidated_into)"),
    evidence_code_ref: z.string().optional()
      .describe("Path to the change in code (e.g., commit hash or file:line)"),
    evidence_journal: z.string().optional()
      .describe("Path to related journal/plans/reports file"),
  },
  handler: async ({
    change_dimension,
    change_target,
    change_diff,
    reason,
    applies_to,
    supersedes,
    consolidates,
    evidence_code_ref,
    evidence_journal,
  }) => {
    const root = resolveRoot();
    const id = generateId(slugify(change_target));
    const now = new Date();

    const entry = {
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      change_diff,
      reason,
      ...(applies_to && { applies_to }),
      ...(supersedes && { supersedes }),
      ...(consolidates && { consolidates }),
      ...(evidence_code_ref && { evidence_code_ref }),
      ...(evidence_journal && { evidence_journal }),
      status: "active",
      created_at: now.toISOString(),
      version: 0,
    };

    await writeEntry(root, entry);

    appendGateLog(root, {
      timestamp: now.toISOString(),
      tool: "meta_state_log_change",
      id,
      change_dimension,
      change_target,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          logged: true,
          id,
          entry_kind: "change-log",
          change_dimension,
          change_target,
          created_at: now.toISOString(),
        }),
      }],
    };
  },
};
