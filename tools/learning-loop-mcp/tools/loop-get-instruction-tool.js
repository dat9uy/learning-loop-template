import { z } from "zod";
import { buildDiscoverabilityHints, buildProcessHints } from "#mcp/core/loop-introspect.js";

export const HINT_KEY_MAP = {
  "internalization-rule": 0,
  "mechanism-check": 1,
  "source-refs": 2,
  "derive-refresh": 3,
  "designs-no-code": 4,
  "status-lifecycle": 5,
  reopens: 6,
  "rule-lifecycle": 7,
  "canonical-tool": 8,
  "surface-split": 9,
  "reopens-script": 10,
  "loop-get-instruction": 11,
  "narrow-query": 12,
  "phase-a-reframe": 13,
  "session-id-query": 14,
  "runtime-agnostic-features": 15,
};

export const HINT_KEY_MAP_PROCESS = {
  "pnpm-test-discipline": 0,
  "pr-body-registry-deltas": 1,
};

export const HINT_SUGGESTIONS = [
  "Prefer `local:meta-state:<id>` source_refs and set `evidence_code_ref` to a code path so the loop can re-check it.",
  "When you provide `evidence_code_ref`, `mechanism_check` defaults to true; pass `false` only if you intentionally want to opt out.",
  "Use `local:meta-state:<id>` for citations; reserve `local:plans/...` markdown refs for the escape hatch.",
  "Call `meta_state_derive_status` before resolving; call `meta_state_refresh_fingerprint` after refactoring the cited code.",
  "For design-only choices, log a change-log entry and cite its id in `source_refs`.",
  "Use `stale` for past-TTL findings and `meta_state_re_verify` to re-validate; do not use the legacy `expired` status.",
  "Set `reopens: ['<stale_id>']` on the new finding, then cascade-resolve the stale parent.",
  "Query loop-design/rule lifecycle via `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`.",
  "Use the tool manifest + the tool-selection guide to pick tools; avoid `node -e` and direct file I/O to `meta-state.jsonl`.",
  "AGENTS.md is the steering prompt; the tool manifest is deterministic; warm hints are at-start; the skill is prompt-author docs.",
  "For cross-references, run `meta_state_relationship_validate`, report with `reopens`, then `meta_state_resolve({ cascade_from: [child] })`.",
  "Use `loop_get_instruction` for on-demand lookup. Keep `meta-state.jsonl` (self-model), `product/**` (substrate), and template code separate when citing evidence.",
  "Use `meta_state_list({ id: [...] })` for one-call resolution of cross-reference ids; use `{ ref_by, ref_field }` for 1-hop neighborhood queries. Reserve the unfiltered list for batch audit only.",
  "Phase A reframe: the meta-surface (finding | change-log | rule | loop-design) is the only bound surface; the product surface is unbound.",
  "Hook-emitted batches: query by `session_id` via `meta_state_list`; do not client-side filter compact output.",
  "Runtime-agnostic features: use shim-not-fork + cross-surface-iteration; audit with `check_runtime_agnostic` before shipping.",
];

export const HINT_SUGGESTIONS_PROCESS = [
  "Long-running pnpm test discipline: per-namespace log files, read-loop stop conditions.",
  "PR-body registry deltas: enumerate sweep/resolved/new/promoted/superseded/archived entries. See rule-pr-body-registry-deltas.",
];

/**
 * Resolve a hint key by searching both discoverability and process hint maps.
 * Returns { hint, suggestion, source } or null if not found.
 */
function resolveHint(key) {
  const hints = buildDiscoverabilityHints();
  const processHints = buildProcessHints();

  // Check discoverability map first
  const discIndex = typeof key === "number" ? key : HINT_KEY_MAP[key];
  if (discIndex !== undefined && discIndex >= 0 && discIndex < hints.length) {
    return {
      hint: hints[discIndex],
      suggestion: HINT_SUGGESTIONS[discIndex],
      source: "discoverability",
    };
  }

  // Check process map
  const procIndex = typeof key === "number" ? (key - hints.length) : HINT_KEY_MAP_PROCESS[key];
  if (procIndex !== undefined && procIndex >= 0 && procIndex < processHints.length) {
    return {
      hint: processHints[procIndex],
      suggestion: HINT_SUGGESTIONS_PROCESS[procIndex],
      source: "process",
    };
  }

  return null;
}

export const loopGetInstructionTool = {
  name: "loop_get_instruction",
  description: "On-demand lookup for a single loop discoverability hint. Use when you need a hint that was surfaced at session start but has scrolled out of context, or when cross-referencing and you are unsure which canonical pattern applies. Pass `key` as a hint slug, a 0-based index, or an array of slugs/indices. Returns the hint text plus a one-line suggestion.",
  schema: {
    key: z.union([
      z.string(),
      z.number().int().nonnegative(),
      z.array(z.union([z.string(), z.number().int().nonnegative()])),
    ]).describe("Hint identifier: named slug, a 0-based index, or array of slugs/indices."),
  },
  handler: async ({ key }) => {
    const keys = Array.isArray(key) ? key : [key];
    const results = [];

    for (const k of keys) {
      const resolved = resolveHint(k);
      if (resolved) {
        results.push({
          key: k,
          index: resolved.source === "discoverability"
            ? (typeof k === "number" ? k : HINT_KEY_MAP[k])
            : undefined,
          hint: resolved.hint,
          suggestion: resolved.suggestion,
          source: resolved.source,
        });
      } else {
        results.push({ key: k, error: `Unknown hint key: ${k}` });
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }],
    };
  },
};
