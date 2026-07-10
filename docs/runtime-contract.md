<!-- level: L2 | surface: implementation -->

# Runtime Participation Contract

A runtime is whatever hosts an agent that consumes the loop — a CLI, an IDE harness, a programmatic library call. To participate in the loop, a runtime must provide four capabilities. This document states them transport-agnostically: it names no specific transport as the contract. The engine these capabilities serve lives in `docs/loop-engine.md` (L1); the mechanism that realizes them on the MCP transport today lives in `docs/architecture.md` (L3).

## The 4 capabilities

> All capabilities are satisfied by transports that hold **no correctness-critical state** of their own. Correctness lives in L1 (file-based core); transports are stateless adapters over the durable record. (Plan 260711-0030 — the loop is an L2 stateless adapter over the file-based L1 core.)

1. **Capability surface.** The runtime exposes the loop's deterministic-steps and agentic-steps to its agent. The agent can call the loop's tools, read the registry, and surface the loop's discoverability hints. Without this, the agent has no access to the deterministic surface.

2. **Gate enforcement.** The runtime routes lifecycle events — pre-tool, pre-write, pre-prompt, session-start — into the loop's gate evaluation. The gate is meta-only (see `docs/meta-state-lifecycle.md` § Layer Separation): it checks constraint existence, not domain resource limits. The runtime's job is to make every relevant lifecycle event visible to the gate, not to enforce the gate's decisions itself.

3. **Record routing.** The runtime never writes `records/**`, `meta-state.jsonl`, or `runtime-state.jsonl` directly. All writes go through the loop's tools, so the registry's invariants (4-kind union, status lifecycle, grounding fingerprints) hold regardless of which runtime produced the record. Direct writes bypass the self-model and are a contract violation.

4. **Identity + discoverability.** The runtime identifies its surface at boot and surfaces loop-discoverability to its operator/agent. Identity lets the loop attribute records and gate decisions to the runtime that produced them; discoverability lets the agent learn the loop's active rules and findings without reading docs mid-task.

## Transport mapping (many-to-many)

A transport is the mechanism a runtime uses to provide the 4 capabilities. The contract is transport-agnostic; multiple transports can realize it, and one transport can serve multiple runtimes.

- **MCP + hooks transport** — the loop's tools are exposed as MCP tools; lifecycle events are routed via hook shims or declarative hook configs into the gate scripts. The runtime hosts an MCP client and a hook dispatch layer.
- **Library-import transport** — the loop's tools are imported as functions; lifecycle events are routed via in-process callbacks. The runtime embeds the loop directly. (Forward-looking; not wired today.)
- **Shell-hook-only transport** — only the gate hooks are wired (no MCP tool surface); the runtime relies on the loop's file-based records without a tool channel. The minimal participation path.

A runtime picks one transport. The 4 capabilities are the same in every transport; only the wiring differs. A future runtime that has no surface directory (e.g. a library transport) may require a non-dir surface concept — noted here as a forward question, not solved.

## Three concerns previously conflated as "the interface"

The word "interface" was overloaded. These are three distinct concerns, now named separately:

- **Runtime participation contract** — the 4 capabilities above. Transport-agnostic. Lives here (L2).
- **Storage fan-out** — the set of runtime surface directories the loop writes to (.claude, .factory, .mastracode today). Mechanism detail: `tools/learning-loop-mastra/core/surfaces.js` `SURFACES` (L3).
- **Feature-code runtime-agnosticism** — the checklist that proves a loop feature works the same across all surfaces (no surface-specific code in feature paths). Mechanism detail: `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` `CHECKLIST` (L3).

The contract says *what a runtime must be*; the storage fan-out says *which directories the loop mirrors*; the runtime-agnosticism checklist says *which feature code stays surface-neutral*. They are independently variable: a new runtime adds a surface (storage fan-out) and proves its features are agnostic (checklist) against the same contract.

## Current transports

The MCP+hooks transport is wired today for three runtimes. Their identities, surface directories, and hook wiring are L3 mechanism detail — see `docs/architecture.md` for the gate-event flow and the per-runtime wiring. The library-import and shell-hook-only transports are forward options, not wired in this codebase.

## Relationship to the engine

The engine (`docs/loop-engine.md`, L1) defines the deterministic-step / agentic-step / record / rule / promotion cycle. A runtime is the host that lets an agent *take* those steps and *route* their records. The contract above is the minimum a runtime must provide to be a faithful host: expose the steps, enforce the gates, route the records, identify the surface. Everything else is transport choice.