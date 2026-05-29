import { z } from "zod";
import {
  writeEntry,
  generateId,
} from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateReportTool = {
  name: "meta_state_report",
  description: "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator.",
  schema: {
    category: z.enum(["gate-logic-bug", "record-repair-gap", "schema-drift", "stale-ref", "mcp-tool-missing", "budget-check"])
      .describe("Category of the finding"),
    severity: z.enum(["warning", "escalate"]).describe("Severity level"),
    affected_system: z.enum(["gate-logic", "record-validation", "index-extractor", "mcp-tools", "workflow-registry", "vnstock_vendor"])
      .describe("Which system is affected by this finding"),
    description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
    evidence_journal: z.string().optional().describe("Path to related journal file"),
    evidence_code_ref: z.string().optional().describe("Code reference, e.g. path/to/file.js:line"),
    evidence_test: z.string().optional().describe("Test file reference"),
    auto_resolve_file: z.string().optional().describe("File path to watch for auto-resolve"),
    auto_resolve_line_range: z.array(z.number()).optional().describe("Line range [start, end] for auto-resolve"),
  },
  handler: async ({
    category,
    severity,
    affected_system,
    description,
    evidence_journal,
    evidence_code_ref,
    evidence_test,
    auto_resolve_file,
    auto_resolve_line_range,
  }) => {
    const root = resolveRoot();
    const id = generateId(slugify(description));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const entry = {
      id,
      category,
      severity,
      affected_system,
      description,
      evidence: {
        ...(evidence_journal && { journal: evidence_journal }),
        ...(evidence_code_ref && { code_ref: evidence_code_ref }),
        ...(evidence_test && { test: evidence_test }),
      },
      auto_resolve: auto_resolve_file
        ? {
            file_modified: auto_resolve_file,
            ...(auto_resolve_line_range && { line_range: auto_resolve_line_range }),
          }
        : null,
      status: "reported",
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      acked_at: null,
      resolved_at: null,
      resolved_by: null,
    };

    await writeEntry(root, entry);

    appendGateLog(root, {
      timestamp: now.toISOString(),
      tool: "meta_state_report",
      id,
      category,
      severity,
      affected_system,
    });

    const result = {
      reported: true,
      id,
      status: "reported",
      expires_at: expiresAt.toISOString(),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

function slugify(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}
