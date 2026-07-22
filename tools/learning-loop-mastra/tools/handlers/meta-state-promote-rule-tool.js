import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import {
  readRegistry,
  writeEntry,
  updateEntry,
} from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { isLiveSession } from "#lib/session-mode.js";
import { matchesCliTransport } from "../../core/cli-self-match.js";

export const metaStatePromoteRuleTool = {
  name: "meta_state_promote_rule",
  description: "Promote a loop-anti-pattern finding to an active gate or agent rule. Requires LOOP_SESSION_MODE=live unless preview:true.",
  schema: {
    id: z.string().describe("Exact entry id to promote"),
    rule_id: z.string().describe("Unique rule identifier (e.g., rule-no-new-artifact-types)"),
    enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced (canonical: gate or agent)"),
    pattern_type: z.enum(["regex", "glob", "determinism-checklist", "agent-checklist"]).describe("Pattern language (determinism-checklist is a resolve consult-gate, not a command-path match)"),
    pattern: z.string().describe("Pattern string (regex body, glob path, or session_id for determinism-checklist)"),
    scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional().default("none").describe("Optional project scope predicate"),
    // Plan 260712-0724 follow-up (Fix B): optional tool/surface scope that
    // narrows the rule's firing surface without regex hand-curation. Parallel
    // to change-log's applies_to. Used by universal rules (e.g.,
    // rule-assertinvariant-at-boundary) to scope to 12 core-logic tools.
    applies_to: z.object({
      tools: z.array(z.string()).optional(),
      surfaces: z.array(z.string()).optional(),
      rules: z.array(z.string()).optional(),
      statuses: z.array(z.string()).optional(),
      schemas: z.array(z.string()).optional(),
    }).optional().describe("Optional scope-narrowing block; persisted on the rule entry"),
    // Phase 3 (plans/260717-1826-unify-context-injection): rule-derived
    // process hints. Required when pattern_type === "agent-checklist" (the
    // rule owns the SessionStart-injected prose). Optional otherwise —
    // gate-enforced rules don't need injection prose. The hint-renderer
    // treats missing hint_text on an agent-checklist rule as skip+warn.
    hint_text: z.string().min(20).optional()
      .describe("Agent-checklist hint text (min 20 chars); required for agent-checklist."),
    preview: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional().default(false).describe("If true, return sample matches without activating the rule"),
    sample_commands: z.preprocess(stripEnvelope, z.array(z.string())).optional().describe("Sample commands to test against (for regex preview)"),
    sample_paths: z.preprocess(stripEnvelope, z.array(z.string())).optional().describe("Sample paths to test against (for glob preview)"),
  },
  handler: async ({ id, rule_id, enforcement, pattern_type, pattern, scope_predicate, applies_to, hint_text, preview, sample_commands, sample_paths }) => {
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

    // Session-mode gate (plan 260708-0833): refuses when LOOP_SESSION_MODE is
    // unset or any value other than strict "live". Default = autonomous.
    if (!preview && !isLiveSession()) {
      const result = { promoted: false, reason: "live_session_required", id };
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

    // Phase 3 (plans/260717-1826-unify-context-injection): agent-checklist
    // rules MUST carry hint_text — the rule owns the SessionStart-injected
    // prose. Reject with an actionable reason so the operator knows what to
    // pass (parallel to the empty-patch lesson in core/meta-state.js).
    // Code-review I5: skipped in preview mode — preview tests pattern matches
    // without creating a rule, so no injection prose is needed yet (parallel
    // to the preview-aware session-mode gate above).
    if (!preview && pattern_type === "agent-checklist" && (typeof hint_text !== "string" || hint_text.length < 20)) {
      const result = {
        promoted: false,
        reason: "hint_text_required_for_agent_checklist",
        id,
        rule_id,
        message:
          "Agent-checklist rules MUST carry a `hint_text` field (>=20 chars). The rule owns the SessionStart-injected prose — the registry entry references the rule by `derived_from_rule` and renders `rule.hint_text` at inject time. Re-call with `hint_text: '<your prose>'`.",
      };
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
        const { isSafeRegexPattern } = await import("../../core/gate-logic.js");
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
        const { globMatch } = await import("../../core/gate-logic.js");
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
      const { isGlobScopeWhitelisted } = await import("../../core/gate-logic.js");
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

    // Plan 260722-1343 Phase 1: self-footgun guard. A regex rule that
    // matches canonical CLI invocation shapes would intercept the loop's
    // own CLI transport and brick every `node bin/loop.mjs ...` call.
    // Only `regex` rules can intercept the bash gate (glob matches
    // `filePath` which is null for bash; agent-checklist /
    // determinism-checklist are `continue`'d in applyPromotedRules), so
    // the guard is regex-only by construction. `core/cli-self-match.js`
    // owns the shape list (single source of truth shared with the test).
    if (pattern_type === "regex" && matchesCliTransport(pattern)) {
      const result = {
        promoted: false,
        reason: "pattern_matches_cli_transport",
        id,
        rule_id,
        pattern,
        message:
          "Pattern matches a canonical CLI invocation shape; promoting this rule would intercept the loop's own CLI transport (`node bin/loop.mjs ...`) and brick every record operation that flows through the CLI. Pick a different pattern (e.g. narrow to a specific tool call), or use `enforcement: 'agent'` for advisory rules.",
      };
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

    // Pre-existing ReDoS gap (caught en route by plan 260722-1343 Phase 1
    // self-footgun guard review): the activation branch did not run
    // `isSafeRegexPattern` — it was preview-only (line ~119). A pathological
    // pattern compiled by a promoted rule would then be executed against
    // every bash command by `applyPromotedRules`. Mirror the preview
    // branch's check here so the activation cannot persist an unsafe
    // regex. Same named reason; same gate-log shape.
    if (pattern_type === "regex") {
      const { isSafeRegexPattern } = await import("../../core/gate-logic.js");
      if (!isSafeRegexPattern(pattern)) {
        const result = {
          promoted: false,
          reason: "pattern_rejected_by_safety_check",
          id,
          rule_id,
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
      }
    }

    // Phase 1: write a new entry_kind: "rule" entry (not a mutated finding)
    const ruleEntry = {
      id: rule_id,
      entry_kind: "rule",
      origin: id,
      enforcement,
      pattern_type,
      pattern,
      ...(scope_predicate && scope_predicate !== "none" && { scope_predicate }),
      ...(pattern_type === "determinism-checklist" && { applies_to_resolution: pattern }),
      ...(applies_to && { applies_to }),
      ...(hint_text && { hint_text }),
      description: `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.`,
      status: "active",
      promoted_at: now,
      promoted_by: "operator",
    };

    await writeEntry(root, ruleEntry);

    // Plan 260716-1101 Tier 2 Phase B: the no-op short-circuit makes this
    // pre-call guard valuable. Previously this code unconditionally called
    // `updateEntry(root, id, { status: "open" })`, which on an already-open
    // finding produced a gratuitous version bump + full rewrite (resolved by
    // meta-260715T2311Z-gratuitous-mutations). With Phase B, the canonical
    // comparator short-circuits the bump when status is unchanged — but a
    // defense-in-depth pre-call guard skips the update path entirely on
    // already-open findings (lower cost, clearer operator intent).
    //
    // Note: this read happens OUTSIDE the registry lock, so it is best-effort:
    // a concurrent writer could flip status between this read and the
    // `updateEntry` call below. The canonical-comparator short-circuit inside
    // `updateEntry` is the load-bearing safety (it drops the no-op even if the
    // guard races). This guard is operator-intent signaling, not correctness.
    //
    // Lifecycle migration note (plan 260611-1000): the finding status enum
    // was collapsed to {open, resolved, superseded}; legacy "active" is no
    // longer a valid finding status. A promoted finding stays "open" (the
    // issue isn't resolved — the rule now enforces). Rule entry's `origin`
    // field is the canonical inverse reference; promoted_to_rule on findings
    // is no longer used.
    const refreshedEntry = readRegistry(root).find((e) => e.id === id);
    if (refreshedEntry && refreshedEntry.status !== "open") {
      await updateEntry(root, id, { status: "open" });
    }

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
