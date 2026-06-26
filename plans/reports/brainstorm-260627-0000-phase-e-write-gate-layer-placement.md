# Brainstorm: Write-Gate Layer Placement (Open Statement for Next Session)

**Status:** OPEN — open statement for the next `/problem-solving` session. No decisions made; framing the question, surfacing the gap, posing specific explorations.

**Triggered by:** operator observation in `/problem-solving` session — "if we have verification logic, do we need the write-gate? Is write-gate runtime-specific or worthy as a step inside workflow?" Also: "our project structure/docs do not reflect the general encapsulation of each layer."

**Date:** 2026-06-27 (post-midnight session)
**Slug:** phase-e-write-gate-layer-placement
**Technique applied:** Inversion Exercise + Meta-Pattern Recognition + Simplification Cascades (per `/problem-solving` skill)

---

## The bigger problem we surfaced

While preparing Plan 4 (Mastra Code validation), the assumption that the **write-gate is a runtime hook** came under scrutiny. The user's framing is precise and worth holding onto:

> "If we have verification logic, do we need the write-gate? Is write-gate runtime-specific or worthy as a step inside workflow?"

This question is not about Plan 4 specifically. It applies to the entire learning loop architecture. The current model (with MCP wrapper as a transport layer, hooks as runtime adapters):

```
┌──────────────────────────────────────────────────────────────────────┐
│ Runtime (Claude Code / Droid / Mastra Code)                         │
│   ├── .claude/coordination/hooks/*.cjs (shim files)                  │
│   └── .mastracode/hooks.json (declarative config)                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ MCP stdio (Claude/Droid) | direct programmatic call (Mastra)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ MCP Server (tools/learning-loop-mastra/mastra/server.js)             │
│   ← WRAPPER of Core + Mastra shell, exposed via MCP protocol         │
│   ← Exists because Claude/Droid cannot call Mastra shell directly    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ internal function calls (in-process)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Mastra Shell (mastra/)                                               │
│   ├── create-loop-*.js (factories)                                   │
│   ├── workflows/                                                     │
│   ├── agents/                                                        │
│   └── tools/                                                         │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ imports (in-process)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Core (core/)                                                         │
│   ├── gate-logic.js         ← pure verification rules                │
│   ├── meta-state.js         ← pure registry logic                    │
│   └── ...                                                            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ hooks/legacy/ (universal hook scripts)                               │
│   ├── bash-gate.js          ← thin I/O adapter (stdin/stdout JSON)    │
│   ├── write-gate.js         ← thin I/O adapter                       │
│   ├── inbound-gate.js       ← thin I/O adapter                       │
│   └── recurrence-check.js                                            │
└──────────────────────────────────────────────────────────────────────┘
```

The 3-layer architecture is *partially* reflected here: the hook scripts in `hooks/legacy/` are thin I/O adapters (≈ runtime interface), and the gate logic in `core/gate-logic.js` is the pure function (≈ core). But:

- The 3-layer model from the Phase E scope report (`plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`) is **Core / Mastra shell / Runtime interface** — not "Core / Hooks / Runtime". The hooks directory is a 4th layer that isn't named in the architecture.
- The Mastra shell layer is missing from the hook diagram entirely. The Mastra shell is where workflows live; if a workflow has a "verify write" step, the write-gate could be *inside* the workflow instead of *outside* the tool call.
- The runtime interface layer (per the 5-req contract) includes hooks as Requirement #1. But the 5-req contract doesn't articulate *where the hook logic comes from* or *why it's at the runtime layer and not in core or shell*.
- **The MCP server (`tools/learning-loop-mastra/mastra/server.js`) is NOT a separate layer** — it is a transport/wrapper that exposes Core + Mastra shell via the MCP protocol. It belongs at the boundary between runtime and shell, not as a 4th architectural layer.

## The MCP wrapper's role (per operator clarification)

**To be explicit:** the MCP server is the **wrapper of Core + Mastra shell**, exposed via the MCP protocol so external runtimes can consume the shell's tools. It is NOT a separate architectural layer — it is a transport/protocol adapter at the boundary.

**Why the MCP wrapper exists:**

1. **Runtime constraint:** Claude Code and Droid CLI **cannot call Mastra shell directly**. They are not Node.js processes running the same runtime; they communicate with the shell via protocols (MCP, hooks, settings files). The MCP server is the bridge that translates MCP protocol calls into Mastra shell tool/workflow invocations.

2. **Safety / encapsulation:** We **do not want Claude Code (or any runtime) to execute Core directly**. If a runtime could import `core/meta-state.js` and call its functions, an LLM agent could:
   - Bypass workflow step ordering
   - Skip verification gates
   - Mutate state in ways the workflow didn't authorize
   - "Make mistakes and not follow the workflow/loop logic" (per operator framing)

   The MCP wrapper forces all callers to go through the **proper protocol surface** (MCP tool definitions, server-mediated invocations). Each tool exposed via MCP is a discrete, named operation with a defined input/output contract. The runtime cannot reach into Core's internals.

**What this means for Plan 4 (Mastra Code):**

- **Claude Code / Droid:** MUST go through the MCP wrapper. The wrapper is mandatory.
- **Mastra Code:** CAN go through the MCP wrapper (CLI/script-invokes-our-server) OR can call Mastra shell directly (programmatic integration via `createMastraCode({ tools, subagents })`).
- **Programmatic integration is SAFE because** Mastra Code's `createMastraCode()` returns a Harness that calls our tools/workflows through Mastra's framework primitives. The agent still goes through the workflow — there's no way for the agent to "skip" a workflow step any more than it could via MCP. The MCP protocol is the safety boundary for runtimes that CAN'T integrate directly; for runtimes that CAN integrate directly, the framework primitives are the safety boundary.

**Implication for the write-gate placement question (per operator framing):**

- The MCP wrapper is the **runtime-shell boundary** (encapsulation mechanism for safety).
- The write-gate hook is the **tool-call boundary** (verification mechanism for write authorization).
- These are two different boundaries serving two different purposes. The write-gate placement question is independent of the MCP wrapper question — even if the MCP wrapper is replaced by direct programmatic integration (Mastra Code case), the write-gate hook may still be needed for built-in tool writes (e.g., Mastra Code's `edit_file`).

**Diagram update — the 4 actual layers / boundaries:**

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Runtime (Claude Code / Droid / Mastra Code)                   │
│   - User-facing interface, agent loop, tool calling                    │
│   - Hooks fire here (PreToolUse, UserPromptSubmit, SessionStart)       │
│   - Built-in tools (Write, Edit, edit_file, execute_command)           │
└────────────────────────────────────────────────────────────────────────┘
                │                       │                       │
       MCP stdio │              Hook stdin/stdout JSON          │ Programmatic
                │                       │                       │ (Mastra only)
                ▼                       ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 2: Boundary Adapters                                            │
│   - MCP Server: wraps Core+Shell, exposes via MCP protocol             │
│   - hooks/legacy/: thin I/O adapters, call into Core                   │
│   - (For Mastra Code programmatic: NO MCP; tools imported directly)    │
└────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Mastra Shell (mastra/)                                        │
│   - create-loop-{tool,workflow,agent}.js: factories                    │
│   - workflows/, agents/, tools/                                        │
│   - Enforces step ordering, agent discipline                          │
└────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 4: Core (core/) — pure functional                               │
│   - gate-logic.js: pure verification                                   │
│   - meta-state.js: pure registry logic                                 │
│   - Zero Mastra imports (FCIS invariant)                              │
└────────────────────────────────────────────────────────────────────────┘
```

**The 3-layer architecture from the Phase E scope report (Core / Mastra shell / Runtime interface) is preserved if we re-interpret "Runtime interface" as "Boundary Adapters" (Layer 2).** The hooks directory + MCP server are both boundary adapters. This is consistent with the 3-layer model — the documentation just needs to make "Runtime interface = boundary adapters" explicit.

**The clarification makes the write-gate question sharper:**

The write-gate is currently a **boundary adapter** (hooks/legacy/write-gate.js). Per the user's question: "is it runtime-specific or a step inside workflow?" — the answer is now clearer:

- The hook IS runtime-specific (different config per runtime: shim files vs declarative JSON)
- The workflow step would be a SHELL-layer concern (inside Mastra shell, inside the workflow definition)
- These are at DIFFERENT layers (Layer 2 vs Layer 3)

**The placement decision is fundamentally a layer decision.** This makes the question more important and more architectural, not less.

## Two valid placements for the write-gate

## Two valid placements for the write-gate

### Placement A: Runtime hook (current model)

```
Tool call → Runtime hook fires → core/gate-logic.js verifies → block/allow → tool executes
```

- **Where it lives:** `hooks/legacy/write-gate.js` (runtime-specific I/O adapter) + `core/gate-logic.js` (verification)
- **Enforced at:** PreToolUse hook (runtime-level event)
- **Catches:** ALL writes from BUILT-IN runtime tools (Claude Code Write, Mastra Code edit_file) AND from any MCP server tool
- **Trade-off:** Runtime-specific config (each runtime needs its own hook config). Defense-in-depth (catches writes that bypass workflows).

### Placement B: Workflow step (alternative)

```
Tool call → enters workflow → workflow step "verify write" → core/gate-logic.js verifies → block/allow → next step
```

- **Where it lives:** as a step in `tools/learning-loop-mastra/mastra/workflows/*.js` (Mastra shell)
- **Enforced at:** workflow execution time (Mastra-level event)
- **Catches:** Writes that go through our workflows (i.e., the normal path)
- **Trade-off:** Doesn't catch writes from BUILT-IN tools. More visible (in workflow definition). Composes with other steps.

### Placement C: Hybrid (defense in depth)

Both A and B active. The hook catches abnormal writes; the workflow step is the normal path.

- **Where it lives:** hook in `hooks/legacy/` + workflow step in `mastra/workflows/`
- **Enforced at:** both layers
- **Trade-off:** More complex; risk of double-blocking (confusing error); need to keep in sync.

### Placement D: Tool-level guard

Each tool that writes (e.g., `meta_state_report`) calls the gate internally before executing.

- **Where it lives:** inside each tool's `execute()` function
- **Enforced at:** tool execution time
- **Trade-off:** Each tool must remember to call the gate. Easy to forget. Doesn't catch BUILT-IN tool writes.

## What we know (from existing code)

- `tools/learning-loop-mastra/core/gate-logic.js` is the source of truth for verification rules
- `tools/learning-loop-mastra/hooks/legacy/write-gate.js` is a thin I/O adapter (reads JSON, calls gate-logic, writes decision)
- The 5-req contract's Requirement #1 is "hook shim set" — currently satisfied by Claude Code / Droid shim files
- The contract validator checks for the shim files, not the gate-logic.js file

## What we don't know (open questions)

1. **What does the Mastra workflow primitive look like for our tools?** Can a workflow step call our core logic and return a block/allow decision? (Likely yes, but unverified.)
2. **What is the "default" write path for Mastra Code?** Does the agent call our tools (which are workflows) or does it use the built-in edit_file tool? If the former, workflow-step gates work. If the latter, we need the hook.
3. **Is there a "guard middleware" pattern in Mastra?** The framework may support per-tool guards (e.g., `beforeExecute` hooks on individual tools). This would be Placement D without the forgetting risk.
4. **What does the Phase E scope report's "3-layer architecture" actually look like in the code?** The report diagrams Core / Mastra shell / Runtime interface, but the actual code has Core / Mastra shell / Hooks / Runtime — 4 layers. Is this a documentation gap or a real architectural issue?
5. **What does "verification logic" mean in this context?** The user said "if we have verification logic, do we need the write-gate?" — what verification logic exists? Tests? Schema validation? Fingerprinting? The write-gate's job may overlap with these.

## What needs to be explored in the next session

### Exploration 1: Map the actual code organization to the 3-layer architecture

- List every file in `tools/learning-loop-mastra/{core,mastra,hooks/legacy,interface}/`
- Classify each file as: Core (pure logic), Mastra shell (framework wrapper), Runtime interface (config + adapter), or NEW (4th layer)
- Identify files that don't fit cleanly into 3 layers
- Identify files where the layer is ambiguous
- Produce a "code → layer" map

### Exploration 2: Trace the write-gate's call paths

- For Claude Code: which tools trigger write-gate? (Write, Edit, MultiEdit, NotebookEdit?)
- For Droid: which tools trigger write-gate? (same as Claude Code?)
- For Mastra Code: which tools would trigger write-gate? (built-in edit_file? Our tool factories? MCP tools?)
- Document the FULL call graph: tool → hook → gate-logic → decision → tool
- Identify which placements (A/B/C/D) cover which call paths

### Exploration 3: Identify the "verification logic" the user referenced

- What verification exists today? (meta_state_check_grounding, runtime-agnostic-checklist, schema validation, test suites?)
- Which verification runs WHERE? (Core? Shell? Runtime hook?)
- Is there duplication between the write-gate and other verification?
- Could the write-gate be REPLACED by a combination of existing verification?

### Exploration 4: Survey Mastra framework primitives for gate placement

- Does Mastra support tool-level `beforeExecute` hooks? (Placement D via framework)
- Does Mastra support workflow-level step types like "verify and continue"? (Placement B)
- Does Mastra support per-mode permission policies? (alternative model)
- Does Mastra's `HarnessConfig` have a hook integration point we're missing?
- Document all framework primitives relevant to gate placement

### Exploration 5: Survey other runtimes (for the runtime-specific question)

- Does Claude Code support workflow-level gates? (Not really — Claude Code doesn't have a workflow concept like Mastra does)
- Does Droid support workflow-level gates? (TBD)
- Does Mastra Code support workflow-level gates? (Yes — Mastra workflows are a thing)
- This asymmetry means the "placement" decision may be RUNTIME-SPECIFIC, not universal
- Document per-runtime gate placement options

### Exploration 6: Test the "step inside workflow" hypothesis

- Sketch what a workflow with a "verify write" step would look like
- What are the step types? (function, agent, tool-call, conditional)
- Can a step return "block" and abort the workflow?
- Can the write-gate be a reusable step that any workflow can include?
- Compare to the current hook model: complexity, audit trail, composability

## Specific questions to pose in the next session

1. **The 3-layer architecture has 4 layers in the code (Core, Mastra shell, Hooks, Runtime). Is the "Hooks" layer a bug, a feature, or a documentation gap?**
2. **Is the write-gate's job to enforce policy, or is it to catch errors? If it's error-catching, could it be replaced by tool-level validation?**
3. **The user said "verification logic" — what does this mean concretely? Can we enumerate every verification that exists and see if any duplicate the write-gate?**
4. **If we move the write-gate to a workflow step, what happens to BUILT-IN tool writes (Claude Code Write, Mastra Code edit_file)? Are they acceptable, or do we need the hook for those?**
5. **Is the runtime hook layer (hooks/legacy/) the right name for what it does? Or should it be called something else (e.g., "adapters", "shims", "transports")?**
6. **If we adopt the hybrid (Placement C), what's the contract between the hook and the workflow step? Do they use the same gate-logic.js? Who wins if they disagree?**

## Implications for the 3-layer architecture docs

The Phase E scope report (`plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`) defines 3 layers. The actual code has 4. Three options:

1. **Update the scope report** to include a 4th "hooks/adapters" layer. This makes the docs match reality.
2. **Reorganize the code** to fit 3 layers. Move `hooks/legacy/` content into `interface/` (runtime interface) or `core/` (pure logic).
3. **Reframe the 3 layers** so the hooks fit naturally. E.g., "Runtime interface = the runtime-specific config + adapters, including hooks." This is closer to option 1 but keeps the 3-layer count.

Recommend **option 1 or 3** — the code organization is correct (separate thin adapters from pure logic), the docs just need to reflect it.

## Why this is a real architectural question (not a documentation issue)

The hook layer was introduced because the loop needed to integrate with Claude Code's hook system. The hooks were an ADAPTER to a runtime-specific protocol. Over time, the hooks accumulated verification logic that arguably belongs in Core. The current state is a hybrid: verification logic split between hooks/legacy/ (I/O + some logic) and core/gate-logic.js (pure logic).

The question "is the write-gate runtime-specific or a workflow step?" is asking: should the verification be:
- **Adapter-pattern:** the runtime has a hook; the hook calls core; the core decides
- **Workflow-pattern:** the workflow has a step; the step calls core; the core decides
- **Middleware-pattern:** the core has a wrapper; every write call goes through the wrapper

The first two are structurally identical (thin adapter calling core); the third is fundamentally different (core owns the gating).

The user's intuition may be: "we have core-level verification already (gate-logic.js, schema validation, fingerprints). The hook layer is just plumbing. Could we eliminate the plumbing and have core own the gating entirely?"

## What this brainstorm is NOT

- This is NOT a decision document. We are NOT committing to a placement yet.
- This is NOT a critique of the existing code. The current architecture works; we're asking if it can be improved.
- This is NOT a Plan 4 blocker. Plan 4 (Mastra Code validation) can proceed with the current hook model and we can revisit the question later.

## What this brainstorm IS

- A structured framing of a real architectural question
- A list of specific explorations to run in the next session
- A pre-read for anyone joining the next `/problem-solving` session
- An open question that may surface a 4th layer in the 3-layer architecture

## References

- Phase E scope report (3-layer architecture): `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`
- Plan 4 prep research (Mastra Code): `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`
- Harness class research: `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md`
- 5-req interface contract: `tools/learning-loop-mastra/interface/CONTRACT.md`
- Core gate logic: `tools/learning-loop-mastra/core/gate-logic.js`
- Universal hook scripts: `tools/learning-loop-mastra/hooks/legacy/{bash,write,inbound}-gate.js`
- Claude Code hook shims: `.claude/coordination/hooks/*.cjs`
- Mastra Code hook config (planned): `.mastracode/hooks.json`

## Next session agenda suggestion

1. Run Exploration 1 (code → layer map). Output: a table showing which files belong to which layer.
2. Run Exploration 2 (write-gate call paths). Output: a call graph per runtime.
3. Run Exploration 3 (verification logic inventory). Output: a list of every verification + where it lives + whether it duplicates the write-gate.
4. Based on 1-3, decide:
   - Is the 3-layer architecture a documentation gap (4th layer needed)?
   - Is the write-gate a runtime hook, a workflow step, a middleware, or all three?
   - What's the contract between placements (if hybrid)?
5. Author a follow-up plan (if needed): `plans/<timestamp>-layer-placement-rationalization/` to reconcile code + docs.

## Open questions for the operator

1. **What "verification logic" did you have in mind when you said "if we have verification logic, do we need the write-gate"?** This is the key input for the next session.
2. **Is the 4th layer (hooks) intentional, or did it grow accidentally?** If intentional, the docs need to acknowledge it. If accidental, we should consider merging.
3. **Is the runtime hook model a "phase 1" design that's outlived its usefulness, or is it the right long-term model?** If phase 1, what's the phase 2 design?