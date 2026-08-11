---
name: learning-loop
description: Create prompts for this repo's learning-loop system. Use when asking how to prompt agents for evidence, records, experiments, runtime proofs, or meta self-improvement.
maturity: state-2
---

# Learning Loop

## Scope

Use this skill to turn a user intent into a ready-to-run prompt for this repo's learning-loop system.

This skill handles prompt authoring, boundary setting, evidence policy, validation expectations, and self-improvement meta prompts. It does not execute runtime proofs, approve product decisions, modify records by itself, or build product code.

## When to Use

Use when the user asks:

- "I want to do X. What is best way to prompt learning loop?"
- "Draft a handoff prompt for evidence / claims / experiment work."
- "How should I ask another agent to run this learning-loop task?"
- "Write a safe prompt for runtime proof, install proof, or metadata-only verification."
- "Use self-improvement flow / meta evidence to close a loop gap."
- "Migrate evidence MDs to per-run experiment YAMLs."
- "I have a draft experiment and a claim. How do I run the experiment and update the claim if it succeeds?"

Also use before any task involving external systems with irreversible state (e.g., vendor APIs, device slots, production databases).

Also use when:
- Any external skill needs to interact with this repo's records, evidence, or state

## Workflow

1. Classify the requested learning-loop task:
   - source extraction
   - evidence review or evidence capsule update
   - claim/risk/decision record update
   - experiment planning or proof run
   - runtime/install proof
   - product-build prompt
   - self-improvement/meta-evidence
   - evidence-to-experiment migration
   - full-lifecycle orchestration
2. **Check state** (before prompt generation):
   - If the task involves an external system with irreversible state, call `pnpm check:budget -- --system {system} --resource {resource}` for each relevant system/resource.
   - Parse the JSON output from the tool.
   - If exit code 1 (budget exhausted) → return a BLOCKED signal (not a prompt).
   - If `validation_window_active` is true → return a DEFERRED signal with window protocol.
   - If `stale` is true → return a WARNING and ask the operator to confirm before proceeding.
   - If exit code 0 (budget available) → embed budget context in the prompt.
3. Load `references/learning-loop-rules.md` for repo policy. If the prompt needs exact current wording, read the named `docs/` or `records/evidence/meta/` files before drafting.
4. Identify approval level:
   - default: read-only or metadata-only prompt
   - explicit approval required: install, runtime execution, live provider calls, copying local config, product code, product approval decisions
5. Draft the prompt with `references/prompt-blueprints.md`.
   - If budget context applies, embed current state, remaining capacity, hard-stop rules, and operator-update reminder using `references/prompt-blueprints-state-gated.md`.
6. If the task is about improving the loop itself, apply `references/meta-evidence-self-improvement.md`; include meta evidence, risk, and decision governance when residual exposure or a loop-level policy choice exists.
7. Return a concise answer with:
   - recommended prompt (or BLOCKED/DEFERRED/WARNING signal)
   - required approvals, if any
   - why this prompt shape
   - unresolved questions, if any


## Runtime contract

This skill is Requirement #3 (skill spec) of the runtime interface contract. The runtime that loads it must also satisfy Requirements #1 (hook shims), #2 (MCP client config), #4 (identity marker), and #5 (settings integration). To audit: run `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`. See `tools/learning-loop-mastra/interface/CONTRACT.md`.

**Authoring loop-maintained skills** — see the maintainer standard in `docs/loop-engine.md` under the "Authoring loop-maintained skills" subsection (mirror + `maturity:` + `meta_state_log_change` step).

## Prompt Requirements

Every generated prompt must state:

- work context path and artifact paths
- source allowlist and forbidden sources/actions
- desired output artifacts and citation style
- evidence capture policy
- verification dimension and approval limits
- validation commands
- report format
- stop conditions for unclear authority, secrets, raw data, or cleanup failure

## Security Policy

Refuse or rewrite prompts that ask agents to exfiltrate secrets, expose config contents, retain private package artifacts, copy raw provider rows, bypass approval gates, or create product code without an approved experiment. Default to dry-run-first, metadata-only output unless the user gives explicit bounded approval.

## Gate Signals

When budget state blocks prompt generation, return one of these signals instead of a prompt:

- **BLOCKED**: Budget exhausted. Operator must clear the resource before proceeding.
- **DEFERRED**: Validation window is active. No state-changing actions until operator confirms.
- **WARNING**: Budget data is stale. Ask operator to confirm external system state before acting.

## References

### Tool manifest
- `tools/learning-loop-mastra/agent-manifest.json` — current 44-tool manifest, 6 groups (gate, workflow, meta_state, introspection, runtime_agnostic, agent). Call `mastra_loop_describe({tier: "warm"})` to discover the surface at session start. Use `mastra_meta_state_list` to query the registry.

### 3-layer architecture
- `AGENTS.md` §1.1 — Core / Mastra shell / Runtime interface (the contract you satisfy by being loaded as this skill).
- `tools/learning-loop-mastra/core/README.md` — FCIS invariant: zero `@mastra/*` imports in core.
- `tools/learning-loop-mastra/docs/schemas.md` — meta-state 4-kind schema, wire envelope, parity contract.

### Runtime interface contract (Phase E.1b)
- `tools/learning-loop-mastra/interface/CONTRACT.md` — the 5 requirements a runtime MUST satisfy (hook shims, MCP config, this skill, identity marker, settings).
- `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` — how to onboard a new runtime (worked example: Mastra Code).
- `node tools/learning-loop-mastra/interface/contract.js <runtime-id>` — validate a runtime against the contract. Returns `{ok, missing[], notes[], path_map}`.
