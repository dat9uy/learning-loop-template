import { z } from "zod";
import { stripEnvelope } from "../../core/legacy/envelope-stripper.js";
import { strictBooleanGuard } from "../../core/legacy/strict-boolean-guard.js";
import {
  readRegistry,
  writeEntry,
  updateEntry,
} from "../../core/legacy/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Placeholder operator-role check.
 * The codebase does not yet have a role system; this checks an env var
 * as a lightweight gate until auth infrastructure is added.
 */
function checkOperatorRole() {
  // In production, this should integrate with the actual auth/role system.
  // For now, respect the MCP server's operator context or env override.
  return process.env.OPERATOR_MODE === "1" || process.env.OPERATOR_MODE === "true";
}

export const metaStatePromoteRuleTool = {
  name: "meta_state_promote_rule",
  description: "Promote a meta-state finding to an active rule. Requires operator role. Writes a new entry_kind: 'rule' entry and updates the source finding's promoted_to_rule to the rule id string. Use preview:true to test pattern matches without activating.",
  schema: {
    id: z.string().describe("Exact entry id to promote"),
    rule_id: z.string().describe("Unique rule identifier (e.g., rule-no-new-artifact-types)"),
    enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced (canonical: gate or agent)"),
    pattern_type: z.enum(["regex", "glob", "resolution-evidence-required", "consult-checklist"]).describe("Pattern language (resolution-evidence-required is a consult gate, not a command-path match)"),
    pattern: z.string().describe("Pattern string (regex body, glob path, or session_id for resolution-evidence-required)"),
    scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional().default("none").describe("Optional scope filter: 'none' (default, fires globally) or 'project_has_learning_loop_mcp' (only fires in projects with their own MCP server)"),
    preview: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional().default(false).describe("If true, return sample matches without activating the rule"),
    sample_commands: z.preprocess(stripEnvelope, z.array(z.string())).optional().describe("Sample commands to test against (for regex preview)"),
    sample_paths: z.preprocess(stripEnvelope, z.array(z.string())).optional().describe("Sample paths to test against (for glob preview)"),
  },
  handler: async ({ id, rule_id, enforcement, pattern_type, pattern, scope_predicate, preview, sample_commands, sample_paths }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { promoted: false, reason: "not_found", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_promote_rule",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Operator role check (placeholder until auth system exists)
    if (!preview && !checkOperatorRole()) {
      const result = { promoted: false, reason: "operator_role_required", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_promote_rule",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Category guard: only loop-anti-pattern entries may be promoted
    if (entry.category !== "loop-anti-pattern") {
      const result = { promoted: false, reason: "category_must_be_loop_anti_pattern", id, current_category: entry.category };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_promote_rule",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Preview mode: test pattern without activating
    if (preview) {
      const matches = [];
      if (pattern_type === "regex" && sample_commands) {
        const { isSafeRegexPattern } = await import("../../core/legacy/gate-logic.js");
        if (!isSafeRegexPattern(pattern)) {
          return {
            content: [{ type: "text", text: JSON.stringify({ preview: true, id, rule_id, pattern, error: "pattern_rejected_by_safety_check" }) }],
          };
        }
        for (const cmd of sample_commands) {
          try {
            const matched = new RegExp(pattern).test(cmd);
            matches.push({ input: cmd, matched });
          } catch (err) {
            matches.push({ input: cmd, matched: false, error: err.message });
          }
        }
      } else if (pattern_type === "glob" && sample_paths) {
        const { globMatch } = await import("../../core/legacy/gate-logic.js");
        for (const p of sample_paths) {
          try {
            const matched = globMatch(pattern, p);
            matches.push({ input: p, matched });
          } catch (err) {
            matches.push({ input: p, matched: false, error: err.message });
          }
        }
      }
      const result = {
        preview: true,
        id,
        rule_id,
        pattern_type,
        pattern,
        sample_matches: matches,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Activation mode

    // Glob scope whitelist check (RT Finding 4)
    if (pattern_type === "glob") {
      const { isGlobScopeWhitelisted } = await import("../../core/legacy/gate-logic.js");
      if (!isGlobScopeWhitelisted(pattern)) {
        const result = { promoted: false, reason: "pattern_rejected_by_scope_whitelist", id, pattern };
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_promote_rule",
          ...result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    }

    // Rule ID uniqueness check (RT Finding 10)
    const alreadyActive = entries.find(
      (e) =>
        e.entry_kind === "rule" && e.id === rule_id && e.status === "active"
    );
    if (alreadyActive) {
      const result = { promoted: false, reason: "rule_id_already_active", id, rule_id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_promote_rule",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    const now = new Date().toISOString();

    // Phase 1: write a new entry_kind: "rule" entry (not a mutated finding)
    const ruleEntry = {
      id: rule_id,
      entry_kind: "rule",
      origin: id,
      enforcement,
      pattern_type,
      pattern,
      ...(scope_predicate && scope_predicate !== "none" && { scope_predicate }),
      ...(pattern_type === "resolution-evidence-required" && { applies_to_resolution: pattern }),
      description: `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.`,
      status: "active",
      promoted_at: now,
      promoted_by: "operator",
    };

    await writeEntry(root, ruleEntry);

    // Update the source finding's status (rule entry's origin field is the
    // canonical inverse reference; promoted_to_rule on findings is no longer used)
    await updateEntry(root, id, { status: "active" });

    const result = {
      promoted: true,
      rule_id,
      rule_entry_id: rule_id,
      source_finding_id: id,
      enforcement,
      pattern_type,
      pattern,
    };

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_promote_rule",
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
