<!-- level: L2 | surface: implementation -->

# Runtime Participation Contract

A runtime is whatever hosts an agent that consumes the loop — a CLI, an IDE harness, a programmatic library call. To participate in the loop, a runtime must provide four capabilities. This document states them transport-agnostically: it names no specific transport as the contract. The engine these capabilities serve lives in `docs/loop-engine.md` (L1); the mechanism that realizes them on the MCP transport today lives in `docs/architecture.md` (L3).

## The 4 capabilities

> All capabilities are satisfied by transports that hold **no correctness-critical state** of their own. Correctness lives in L1 (file-based core); transports are stateless adapters over the durable record. (Plan 260711-0030 — the loop is an L2 stateless adapter over the file-based L1 core.)

1. **Capability surface.** The runtime exposes the loop's deterministic-steps and agentic-steps to its agent. The agent can call the loop's tools, read the registry, and surface the loop's discoverability hints. Without this, the agent has no access to the deterministic surface.

2. **Gate enforcement.** The runtime routes lifecycle events — pre-tool, pre-write, pre-prompt, session-start — into the loop's gate evaluation. The gate is meta-only (see `docs/meta-state-lifecycle.md` § Layer Separation): it checks constraint existence, not domain resource limits. The runtime's job is to make every relevant lifecycle event visible to the gate, not to enforce the gate's decisions itself.

3. **Record routing.** A runtime that produces records never writes `records/**`, `meta-state.jsonl`, or `runtime-state.jsonl` directly. All writes go through the loop's tools via a write-capable tool channel, so the registry's invariants (4-kind union, status lifecycle, grounding fingerprints) hold regardless of which runtime produced the record. Direct writes bypass the self-model and are a contract violation. This capability is conditional on a write-capable transport: a read-only transport (see *Transport mapping*) produces no records and so does not exercise it — unsatisfiable there by design, not in violation.

4. **Identity + discoverability.** The runtime identifies its surface at boot and surfaces loop-discoverability to its operator/agent. Identity lets the loop attribute records and gate decisions to the runtime that produced them; discoverability lets the agent learn the loop's active rules and findings without reading docs mid-task.

## Transport mapping (many-to-many)

A transport is the mechanism a runtime uses to provide the 4 capabilities (a read-only transport provides a subset — see below). The contract is transport-agnostic; multiple transports can realize it, and one transport can serve multiple runtimes.

- **MCP + hooks transport** — the loop's tools are exposed as MCP tools; lifecycle events are routed via hook shims or declarative hook configs into the gate scripts. The runtime hosts an MCP client and a hook dispatch layer.
- **Read-only CLI transport** — the loop's read tools are exposed as commands over a stateless CLI (`bin/loop.mjs`). The CLI has a tool surface (unlike shell-hook-only), no write path (so Capability 3 does not apply), and satisfies Capabilities 1+4 only. Wired for the 7-tool slice (`loop_describe`, `loop_get_instruction`, `meta_state_list`, `meta_state_relationships`, `meta_state_derive_status`, `meta_state_check_grounding`, `runtime_state_read`). A runtime may set `LOOP_READS_VIA_CLI=1` in its `mcp.json` environment to remove those seven schemas from its MCP surface and route reads through `bin/loop.mjs`; MCP remains wired for writes. A runtime that wants the full record surface via CLI can also set `LOOP_RECORDS_VIA_CLI=1` to additionally drop the CLI-portable mutation handlers (the `CLI_WRITE_TOOLS` set in `core/cli-tools.js`) from its MCP surface.
- **Library-import transport** — the loop's tools are imported as functions; lifecycle events are routed via in-process callbacks. The runtime embeds the loop directly. (Forward-looking; not wired today.)
- **Write-capable CLI transport** — the loop's read tools **and** CLI-portable mutation handlers (the `CLI_WRITE_TOOLS` set in `core/cli-tools.js`) are exposed as commands over the same stateless CLI (`bin/loop.mjs`). The CLI becomes a full record transport: it satisfies Capabilities 1, 3, and 4; the gate (Capability 2) still flows through hook shims. This is the **example realization** of Capability 3 on a non-MCP transport — a CLI over the same L1 file-based core (stateless, no correctness-critical state of its own), so the L5 transport-agnostic framing ("names no specific transport") and L9 "no correctness-critical state" claims remain true. A runtime that sets `LOOP_RECORDS_VIA_CLI=1` drops every CLI_TOOLS member (reads + portable mutation tools) from its MCP surface; MCP keeps only the irreducible residue (workflow / storage / allowlist / audit + auxiliary read-ish tools). Promotion-path safety: a regex rule that would intercept the CLI's own invocation shape is rejected at activation (`core/cli-self-match.js`) so a runtime cannot brick its own transport.
- **Shell-hook-only transport** — only the gate hooks are wired (no MCP tool surface, no write-capable tool channel). This is **read-only participation**: the runtime may read the loop's file-based records and route gate events, but it produces no records, so Capability 3 does not apply. The minimal participation path.

A runtime's transport wiring is configurable per runtime. It may use MCP + hooks for all tools, or keep MCP for writes while routing the seven read tools through the read-only CLI. The capabilities are the same in every transport; only the wiring differs — except that a read-only transport (shell-hook-only OR read-only CLI) carries no write path and so does not exercise Capability 3. A future runtime that has no surface directory (e.g. a library transport) may require a non-dir surface concept — noted here as a forward question, not solved.

## Transport capability (per function)

`Is function F on my MCP surface?` is a wiring question about the runtime, not a capability question about F. The two are independent axes:

- **Axis A — capability** (property of the function, stable, lives at L2): can F ride a one-shot transport at all?
- **Axis B — wiring** (property of the runtime, configurable, lives at L3): does runtime R surface F on transport X?

**Rule:** a tool is *transport-capable* by default when it is **stateless**: every invocation computes its result from arguments + the file-based record surface and emits no process-scoped side effects beyond that surface. Stateful behavior — any warm state the process holds across invocations — is owned by the runtime-state layer (whose file-based tools are themselves stateless handlers; "stateful" here means *process*/warm state, not *file* state).

A tool that cannot meet the stateless bar is **MCP-only by explicit override**. The overrides are limited to two documented kinds:

- **`server-state`** — the tool reads/writes process-scoped server state (a singleton DB handle, an in-process registry, a per-server allowlist); one-shot transports do not host that state.
- **`operator-policy`** — the tool applies an operator-only effect (R2 allowlist mutation, audit triggers) that agents must not invoke transitively.

A special **`agent-facing`** override keeps a stateless-but-Mastra-internal tool on MCP so the engine's internal-agent tool surface resolves it under `LOOP_RECORDS_VIA_CLI=1`. **`deferred-rehoming`** flags a tool that is CLI-capable in principle but whose re-homing is blocked on a separate evidence-driven plan; the residue is intentional, not silent.

This rule cross-references `docs/loop-engine.md` § "Workflow: definition vs execution" for the 3 state homes (deterministic steps, agentic steps, records/rules) — capability is judged against those three homes, not against transient per-call state. The drift test at `__tests__/cli-write-tool-set-drift.test.js` enforces the rule at L3 by requiring every manifest entry to land in `CLI_TOOLS` or `MCP_RESIDUE` with a declared reason.

## Three concerns previously conflated as "the interface"

The word "interface" was overloaded. These are three distinct concerns, now named separately:

- **Runtime participation contract** — the 4 capabilities above. Transport-agnostic. Lives here (L2).
- **Storage fan-out** — the set of runtime surface directories the loop writes to (.claude, .factory, .mastracode today). Mechanism detail: `tools/learning-loop-mastra/core/surfaces.js` `SURFACES` (L3).
- **Feature-code runtime-agnosticism** — the checklist that proves a loop feature works the same across all surfaces (no surface-specific code in feature paths). Mechanism detail: `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` `CHECKLIST` (L3).

The contract says *what a runtime must be*; the storage fan-out says *which directories the loop mirrors*; the runtime-agnosticism checklist says *which feature code stays surface-neutral*. They are independently variable: a new runtime adds a surface (storage fan-out) and proves its features are agnostic (checklist) against the same contract.

## Current transports

The MCP+hooks transport is wired today for three runtimes. Their identities, surface directories, and hook wiring are L3 mechanism detail — see `docs/architecture.md` for the gate-event flow and the per-runtime wiring. The read-only CLI transport is wired as a 7-tool additive slice over `tools/learning-loop-mastra/bin/loop.mjs`; the `.claude` runtime dogfoods the read-channel opt-out with `LOOP_READS_VIA_CLI=1`, while MCP remains available for writes. The write-capable CLI transport extends `bin/loop.mjs` to also carry the `CLI_WRITE_TOOLS` set (the CLI-portable mutation handlers in `core/cli-tools.js`); `.claude` dogfoods the combined opt-out with `LOOP_RECORDS_VIA_CLI=1`, which drops the full CLI_TOOLS set (reads + writes) from MCP and keeps only workflow / storage / allowlist / audit + auxiliary read-ish tools on the MCP surface. The library-import and shell-hook-only transports are forward options, not wired in this codebase.

## Relationship to the engine

The engine (`docs/loop-engine.md`, L1) defines the deterministic-step / agentic-step / record / rule / promotion cycle. A runtime is the host that lets an agent *take* those steps and *route* their records. The contract above is the minimum a runtime must provide to be a faithful host: expose the steps, enforce the gates, route the records, identify the surface. Everything else is transport choice.