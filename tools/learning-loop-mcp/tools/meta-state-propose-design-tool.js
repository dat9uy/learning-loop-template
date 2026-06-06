import { z } from "zod";
import {
  readRegistry,
  writeEntry,
  metaStateLoopDesignSchema,
} from "#mcp/core/meta-state.js";
import { slugify } from "#mcp/core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Set equality for arrays of strings (order-independent).
 */
function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const aSet = new Set(a);
  for (const x of b) if (!aSet.has(x)) return false;
  return true;
}

export const metaStateProposeDesignTool = {
  name: "meta_state_propose_design",
  description: "Propose a new loop-design entry. Loop-designs are deferred designs with their own lifecycle (active -> inactive when shipped). Use this for designs that will create or modify rules, schemas, or tools. Mirrors meta_state_log_change's append-only semantics with the addition of proposed_design_for (forward: what the design ships) and addresses (backward: what findings the design responds to). Idempotent: same addresses + proposed_design_for set returns the existing entry id.",
  schema: {
    title: z.string().min(10).describe("Short human-readable title"),
    description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
    proposed_design_for: z.array(z.string()).min(1)
      .describe("Forward: ids of rules/schemas/tools this design will create or modify (non-empty)"),
    addresses: z.array(z.string()).default([])
      .describe("Backward: ids of findings this design responds to"),
    affected_system: z.enum([
      "gate-logic", "record-validation", "index-extractor",
      "mcp-tools", "workflow-registry", "vnstock_vendor",
    ]).describe("Which system this design affects"),
    severity_hint: z.enum(["low", "medium", "high"]).optional()
      .describe("Operator's read on the urgency of shipping this design"),
    loop_design_id: z.string().optional()
      .describe("Optional explicit id (loop-design-<slug>). If omitted, the id is auto-generated from the title."),
  },
  handler: async ({
    title,
    description,
    proposed_design_for,
    addresses,
    affected_system,
    severity_hint,
    loop_design_id,
  }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);

    // Idempotency check 1: explicit loop_design_id collision
    if (loop_design_id) {
      const existing = entries.find(
        (e) => e.id === loop_design_id && e.entry_kind === "loop-design"
      );
      if (existing) {
        const result = {
          proposed: false,
          reason: "already_exists",
          id: loop_design_id,
          existing_entry: existing,
        };
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_propose_design",
          ...result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    }

    // Idempotency check 2: same addresses + proposed_design_for set (canonical key per Locked #9)
    const existingByKey = entries.find(
      (e) =>
        e.entry_kind === "loop-design" &&
        e.status === "active" &&
        setsEqual(e.addresses, addresses) &&
        setsEqual(e.proposed_design_for, proposed_design_for)
    );
    if (existingByKey) {
      const result = {
        proposed: false,
        reason: "already_exists_by_addresses_and_proposed_design_for",
        existing_id: existingByKey.id,
        existing_entry: existingByKey,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_propose_design",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Id generation
    const generated_id = loop_design_id || `loop-design-${slugify(title)}`;

    // Idempotency check 3: auto-generated id collision
    if (!loop_design_id) {
      const idCollision = entries.find(
        (e) => e.id === generated_id && e.entry_kind === "loop-design"
      );
      if (idCollision) {
        const result = {
          proposed: false,
          reason: "id_collision",
          generated_id,
          note: "Provide an explicit loop_design_id or change the title.",
        };
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_propose_design",
          ...result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    }

    // Construct the entry
    const now = new Date().toISOString();
    const entry = {
      id: generated_id,
      entry_kind: "loop-design",
      title,
      status: "active",
      proposed_design_for,
      addresses,
      description,
      affected_system,
      ...(severity_hint && { severity_hint }),
      created_at: now,
      created_by: "operator",
    };

    // Validate against the schema
    const validation = metaStateLoopDesignSchema.safeParse(entry);
    if (!validation.success) {
      const result = {
        proposed: false,
        reason: "validation_failed",
        errors: validation.error.format(),
      };
      appendGateLog(root, {
        timestamp: now,
        tool: "meta_state_propose_design",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Write
    await writeEntry(root, entry);

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_propose_design",
      id: generated_id,
      title,
      addresses_count: addresses.length,
      proposed_design_for_count: proposed_design_for.length,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          proposed: true,
          id: generated_id,
          status: "active",
          entry,
        }),
      }],
    };
  },
};
