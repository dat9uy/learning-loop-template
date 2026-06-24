# Prediction Report: Phase E Re-Scope to 3-Layer Domain-Driven Architecture

**Type:** predict (ck:predict — 5-persona pre-analysis)
**Date:** 2026-06-24 19:25
**Slug:** phase-e-domain-driven-architecture
**Status:** advisory (no contract change yet; no meta-state mutation)
**Aligned to:** `plans/reports/productization-260612-1530-master-tracker.md` Phase E (currently E1 ✅ / E2 🟡 / E3–E7 🔵)

---

## Verdict: CAUTION

The proposal is architecturally sound but **substantially over-scoped** for the actual gaps the operator surfaced. The 3 layers already exist implicitly in `tools/learning-loop-mastra/{core/legacy, create-loop-*, hooks/legacy}` — the work is **naming + disciplining**, not **building**. The full migration path is 7–10× the cost of a rename-only path with marginal benefit. Adopt the lighter path now; re-evaluate the full extraction only when a 3rd runtime exists that the existing shim pattern cannot express.

---

## Agreements (all 5 personas align)

- **A1 — 3 layers already exist structurally.** `tools/learning-loop-mastra/core/legacy/` holds pure logic; `create-loop-{tool,workflow,agent}.js` are the 3 imperative-shell wrappers (12 total `@mastra/core` import sites — verified); `hooks/legacy/` is the runtime-agnostic shim layer mirrored to `.claude/coordination/hooks/` + `.factory/coordination/hooks/` (SHA-256 parity enforced by `runtime-agnostic-checklist.js`).
- **A2 — The schema doc gap is real but small.** Schemas scattered across 4 files (`core/legacy/schema-descriptions.yaml`, `create-loop-tool.js`, `schema-parity.js`, `legacy-handler-adapter.js`); `schema-descriptions.yaml` is **stale** (references `experiment/risk/decision/observation` records deleted in Phase A). Minimum viable doc is ~150 LoC, half-day effort.
- **A3 — R1 (FCIS for Core) is structurally true today.** All 12 `@mastra/core` imports are confined to the 3 `create-loop-*` wrappers. The shell→core direction is correctly one-way (core has zero Mastra imports; the shell reads `core/legacy/envelope-stripper.js`). FCIS is real; only the *discipline doc* is missing.
- **A4 — R3 (same core, multiple runtimes) is already achieved.** The hook shim pattern is runtime-agnostic today; the `runtime-agnostic-checklist.js` 6-item gate locks the invariant. `createMastraCode({ configDir })` (npm `mastracode`) is a verified package (source at `mastra-ai/mastra/tree/main/mastracode`) that consumes the same `MCPServer` over peer MCP. No new code is required for "Mastra Code Mode 1" — only config.
- **A5 — The user's #3 concern ("Claude Code ↔ Mastra agent") is already solved.** `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent` are MCP tools; any MCP client (Claude Code, Droid CLI, Mastra Code) calls them through the same wire. The interaction surface is the manifest, not new code.

---

## Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|-----|-----------------|------------|
| Should Core be *extracted* (new package) or just *labeled* (renamed + documented)? | Extract is cleaner but invasive; rename is fine if discipline is enforced | Extract creates a clearer trust boundary; rename is fine if the boundary is encoded in a gate | Extract adds module-boundary tax (~µs/call) — negligible; rename has no cost either way | Extract has a clean README target; rename is fine if AGENTS.md is updated | **Rename only.** 7–10× cheaper; same result if R1 is enforced as a doc invariant. | **Rename + discipline doc.** ~0.5 day. Gate enforcement is OPTIONAL — file location + PR review are sufficient at current scale. |
| Should R2 ("runtime interface owned by runtime agent") be a *process norm* or a *write-gate rule*? | A write-gate is the only mechanically-enforceable form; process norms decay | LIM-3 (caller identity) is the underlying primitive; gate is a side-effect of that work — but LIM-3 is open and high-effort | A write-gate adds a per-write check (~ms); only justified if violations recur | Process norm is sufficient when runtime count is 2; gate only pays off at 3+ runtimes | **Process norm now, gate later.** Hidden cost of the gate is new infrastructure (runtime_id env var, per-runtime allowlist, write-gate pattern); defer until a 3rd runtime or a violation forces it. | **Process norm.** Add AGENTS.md section. Defer gate to a hardening plan that bundles LIM-3. |
| Is `workflow-intentional-skip.js` legacy (delete/move) or a parity-test pin (keep registered)? | It's a thin 79-LoC `createLoopWorkflow` wrapper — no product surface | It owns a wire-envelope decision path; removing it removes end-to-end coverage of the envelope-stripper contract | Parity test takes ~ms; no perf cost to keeping it | "Legacy" implies dead; calling it legacy misleads operators | **Parity-test pin.** Keep it registered, do not move to `legacy/`, do not unregister. Label it explicitly as "parity-test pin" in a one-line comment. | **Keep registered + labeled.** The user's "don't migrate it" instinct is right; the rationale should be "parity test pin," not "legacy." |
| What is the minimum viable "runtime interface" surface? | Could be a `runtime/<name>/` dir per runtime, or just `.claude/` + `.factory/` shims | A per-runtime dir exposes per-runtime attack surface; shim pattern already validated | Per-runtime dir adds 0 overhead; shim pattern is already loaded | Per-runtime dir gives operators a clear mental model; shim is invisible to them | **Shim pattern is the runtime interface.** No new dir needed. The Mastra Code "interface" is `configDir` config in `createMastraCode({...})` — not new code. | **Shim pattern + per-runtime config dir.** The "runtime interface" is the shim layer that already exists. Mastra Code adds a 3rd shim (`.mastracode/coordination/hooks/`). |
| Should the new `createMastraCode` peer MCP connection ship in Phase E? | Mastra Code is verified real (npm + repo); config-only setup; no new code in the loop | Peer MCP has the same trust boundary as Claude Code/Droid; no new attack surface | Peer MCP is just a config in `.mcp.json`; no perf impact | "Multiple runtimes" is the operator's stated goal; shipping the connection proves the design works | **Yes — but as config, not code.** Add `mastracode` to `.mcp.json` + `configDir` in `createMastraCode({...})`; ship E5 + E6 together. | **Ship E5 (peer MCP config) + E6 (hook layer confirmation) as one plan.** E7 (Mode 2 single-app) stays deferred. |

---

## Risk Summary

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | The proposal's R2 ("runtime interface owned by runtime agent") requires new infrastructure (write-gate + runtime_id env var + per-runtime allowlist) that does not exist today. Cost: 1 new gate rule + 1 env-var convention + per-runtime settings update. | **High** (hidden cost) | Ship R2 as a process norm (AGENTS.md section + PR review) in Phase E; defer the write-gate to a hardening plan that bundles with LIM-3 (caller identity). Re-evaluate at 3+ runtimes. |
| R2 | The full-extract path (Core as new sub-package, Mastra shell rewrite, per-runtime interface) is 7–10× the cost of the rename path (1.5–2 weeks vs 0.5 day) for marginal benefit. Risk: future plan over-invests in extraction that yields no new capability. | **High** (over-engineering) | Adopt the rename-only path as the canonical Phase E scope. Document the 3-layer contract; do not extract Core into a new sub-package. The 3 layers are file locations, not packages. |
| R3 | `core/legacy/schema-descriptions.yaml` references `experiment/risk/decision/observation` records deleted in Phase A. Any schema-centralization doc inherits the rot. | **Medium** | Add to Phase E.4: delete or rewrite `schema-descriptions.yaml` (12 LoC, low effort). The new `docs/schemas.md` should be authoritative. |
| R4 | `workflow-intentional-skip.js` is mis-labeled as "legacy" in the user's framing. The file is a parity-test pin for the wire-envelope decision path. If a future plan "cleans up legacy" and moves this file to `legacy/`, end-to-end wire-format coverage is lost. | **Medium** | Add an explicit comment in `workflows/workflow-intentional-skip.js` and an entry in `docs/legacy-pins.md` (new file) listing all parity-test pins that must not be moved. |
| R5 | The 3 agents (`intake`, `scout`, `selfImprovement`) are MCP tools that wrap an LLM call. The proposal's "Mastra layer" framing doesn't explicitly place them. Could be mis-classified as "Core" (the prompt-as-data is pure) or "Runtime interface" (the LLM is the runtime). | **Low** | Document in the layer contract: agents are Mastra-layer (the factory is the imperative shell wrapping an LLM). The `instructions/` dir (in `agents/`) is the data; the `createLoopAgent` factory in `create-loop-agent.js` is the shell. |
| R6 | R1's "Core not bloated with Mastra implementation" is structurally true today, but `create-loop-workflow.js` imports `stripMcpContentEnvelope` from `core/legacy/envelope-stripper.js` — the shell reads the core, which is correct FCIS. Risk: a future "tighten FCIS" refactor accidentally breaks the shell→core dependency. | **Low** | Document the dependency direction explicitly in `core/README.md`: "Core has zero `@mastra/*` imports; the shell may import core." |
| R7 | "Mastra Code" is a real product (npm `mastracode` + source at `mastra-ai/mastra/tree/main/mastracode`) but its `createMastraCode({ configDir })` API is a 1-layer-above abstraction. Phase E's E5 (Mode 1 peer MCP) requires verifying that Mastra Code can consume our existing `MCPServer` over stdio — not yet tested. | **Low** | Add a one-time smoke test in Phase E.5: start `MCPServer` on stdio; instantiate `createMastraCode({ configDir: '.mastracode-test' })`; call one MCP tool (e.g., `mastra_loop_describe`); assert byte-equal response. ~30 LoC, ~30 min. |
| R8 | Phase E's E3 (update `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md`) is still open and orthogonal to the 3-layer proposal. Risk: 3-layer work begins before E3 ships, and the skill docs are out of sync with the new layer contract. | **Low** | Ship E3 *first* (1 hour, doc-only); then ship E.1 (rename + discipline doc). Order: E3 → E.1 → E.2 → E.4 → E.5. |

---

## Recommendations (in execution order)

| # | Phase | Scope | Effort | Risk | Files |
|---|-------|-------|--------|------|-------|
| **E.0** | **E3 (close the open doc drift)** | Update `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` to point at the current 44-tool manifest + 6 groups + the new layer contract. | 1h | None | 2 SKILL.md files |
| **E.1** | **Rename + discipline doc (the actual Phase E work)** | (a) Rename `core/legacy/` → `core/` (no functional change; just removes the misleading `legacy/` segment — the directory contains live code, not legacy). (b) Add `core/README.md` with the FCIS invariant: "Core has zero `@mastra/*` imports; the shell may import core." (c) Add `tools/learning-loop-mastra/docs/schemas.md` (the schema doc the user said was missing): the 4 meta-state entry kinds, runtime-state shape, wire envelope format, parity contract. (d) Update `AGENTS.md` §1 to name the 3 layers explicitly: **Core** (pure logic) / **Mastra shell** (`create-loop-*` wrappers + `server.js`) / **Runtime interface** (`.claude/` + `.factory/` + future `.mastracode/` shim dirs). | 0.5 day | Low — no functional change; all 1189 tests continue to pass | `core/legacy/` → `core/`, `core/README.md` (new), `docs/schemas.md` (new), `AGENTS.md` §1 |
| **E.2** | **R2 as process norm, not gate** | Add `AGENTS.md §11` "Runtime interface ownership": "Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`) is owned by the corresponding runtime agent. Cross-runtime edits require operator approval." Enforce via PR review + branch protection. **Defer the write-gate to a hardening plan that bundles LIM-3 (caller identity).** | 0.5h | None | `AGENTS.md` |
| **E.3** | **Parity-pin label + legacy-pins doc** | (a) Add a one-line comment to `workflows/workflow-intentional-skip.js` flagging it as a parity-test pin. (b) Create `tools/learning-loop-mastra/docs/legacy-pins.md` listing all parity-test pins that must not be moved to `legacy/`. | 0.5h | None | `workflows/workflow-intentional-skip.js`, `docs/legacy-pins.md` (new) |
| **E.4** | **Schema rot cleanup** | Delete `core/legacy/schema-descriptions.yaml` (12 LoC, stale) OR rewrite it to reference the 4 meta-state kinds only. The new `docs/schemas.md` from E.1 is authoritative. | 0.5h | None | `core/legacy/schema-descriptions.yaml` (or its renamed replacement) |
| **E.5** | **E5 + E6: Mastra Code Mode 1 peer MCP** | (a) Verify `createMastraCode({ configDir })` from npm `mastracode` can consume our `MCPServer` over stdio. (b) Add `mastracode` to `.mcp.json` + `.factory/mcp.json` if applicable. (c) Confirm the hook layer (`.claude/`, `.factory/`) does not need changes (per `§3.9 Mode 1` — no hook changes). (d) Document Mastra Code hook surface if it differs. | 1–2 days | Low — config + verification only | `.mcp.json`, `.factory/mcp.json`, `docs/agents/mastra-code.md` (new) |
| **DEFER** | **Full Core extraction + R2 write-gate** | YAGNI at current scale. Re-evaluate when: (a) Core grows >5000 LoC and starts importing Mastra outside the 3 wrappers; OR (b) a 3rd runtime exists that the shim pattern cannot express; OR (c) a process violation of R2 forces automation. | 1.5–2 weeks | High | `tools/learning-loop-mastra/core/` → new sub-package; new write-gate rule; per-runtime `runtime/<name>/` dirs |

**Total Phase E.1–E.5 effort: ~3–4 days.** Replaces the original Phase E scope (~1.5–2 weeks including the unused R2 gate) at ~25% the cost.

---

## Counter-arguments to the user's framing

The user is *directionally right* but *specifically over-scoped*:

1. **"I am thinking of 3 layers: Core, Mastra and runtime interface, but you can debate me on this."** — **The 3 layers already exist; the proposal is a rename, not a build.** The cost of building them is 7–10× the cost of naming them. The user's instinct to *formalize* the boundary is correct; the instinct to *rebuild* the layers is over-engineering. Adopt the rename path.

2. **"Core logic follows: Functional core, Imperative Shell architecture ... so the core logic not bloated with Mastra implementation, not until we touch Mastra surface (Agent, Workflow...)"** — **Already true.** 12 `@mastra/core` import sites are confined to the 3 `create-loop-*` wrappers. The discipline is enforced by file location + PR review, not by a new gate. Adding a gate is unnecessary cost.

3. **"Runtime interface has to be edit by that runtime agent except allowance by operator."** — **Right as a process norm; wrong as a write-gate.** The current write-gate is a path/regex check, not an actor-identity check. Adding actor-identity requires LIM-3 (caller identity) to ship first — a separate, larger hardening plan. Process norm is free; gate is ~1 new rule + 1 env var convention + per-runtime settings update. Defer the gate; ship the norm.

4. **"There is no files that I could called 'schema', which I could read to understand how many records we have, which fields it has."** — **Real gap; cheap fix.** `docs/schemas.md` (~150 LoC, half-day) is the entire fix. The schema data is *not* missing; it's scattered across 4 files. The doc consolidates it. This is a *docs* problem, not an *architecture* problem.

5. **"tools/learning-loop-mastra/workflows/workflow-intentional-skip.js still there after Phase A. So the domain logic has changed, but the implementation is not follows yet. If we migrate, I don't want to migrate them, keep them legacy for that reason"** — **Reframed:** this file is **not legacy**; it's a **parity-test pin** for the wire-envelope decision path. Removing it (or moving it to `legacy/`) loses end-to-end wire-format coverage. The right move is to *keep it registered + label it explicitly as a parity pin*, not to "keep it legacy." The user's instinct (don't touch it) is right; the rationale should be "parity test pin," not "legacy."

6. **"The target now is have same core, but could be run by multiple runtime, which that runtime could write interface for itself by utilizing the core learning loop"** — **Already achieved at the hook layer** (`.claude/` + `.factory/` shims, SHA-256 parity). **Mastra Code is a verified 3rd runtime** (npm `mastracode`, source at `mastra-ai/mastra/tree/main/mastracode`). The work to extend to Mastra Code is **configuration** (peer MCP in `.mcp.json` + `configDir` in `createMastraCode({...})`), not new code. The "runtime interface" the user wants to *author* already exists as the shim pattern.

---

## What the proposal gets wrong (deviation from the user's strict recommendations)

| User said | Devil's Advocate correction | What to ship instead |
|-----------|----------------------------|---------------------|
| "3 layers: Core, Mastra, runtime interface" (build) | The 3 layers already exist; build is unnecessary | **Rename + discipline doc.** ~0.5 day. |
| "Core follows FCIS" (new gate) | FCIS is structurally true; gate is over-engineering | **Doc the invariant in `core/README.md` + AGENTS.md.** No gate. |
| "Runtime interface owned by runtime agent" (write-gate) | Write-gate requires new infrastructure (LIM-3, runtime_id env var, per-runtime allowlist) | **Process norm via PR review + AGENTS.md §11.** Defer gate to hardening plan. |
| "Keep legacy untouched" | `workflow-intentional-skip.js` is a parity-test pin, not legacy | **Label explicitly as parity pin; create `docs/legacy-pins.md` index.** |
| "Mastra Code as a separate runtime" | `createMastraCode` is one consumer of the same Mastra APIs; no new "interface" code is needed | **E5 = peer MCP config + smoke test.** ~1–2 days. |

---

## Unresolved questions for the operator

1. **Is `createMastraCode` API stable enough to commit to a per-runtime interface?** The npm package exists and the source is public, but we have not smoke-tested it against our `MCPServer`. Phase E.5 covers this.
2. **Does R2's "edit ownership" map to file paths or to git branches owned per runtime agent?** Path-based requires a write-gate (deferred); branch-based is conventional and free. Recommend branch-based for now; revisit at 3+ runtimes.
3. **Is the `core/legacy/schema-descriptions.yaml` rot a Phase A cleanup item or a Phase E item?** Recommended: Phase E.4 (delete or rewrite). The Phase A plan is closed; cross-cutting cleanup rolls forward.
4. **The 2 hardening LIMs (LIM-3 caller identity, LIM-4 path traversal) overlap with R2's enforcement.** Recommend: ship R2 as a process norm now; bundle LIM-3 + R2 write-gate into a dedicated hardening plan in the next quarter. Do not gate Phase E on LIM-3.
5. **Should E5 (Mastra Code Mode 1) ship *before* or *after* E.1 (rename + doc)?** Recommend E.1 first (cheap, low risk, addresses user's #2 concern). E.5 second (1–2 days, config + smoke test). Independent of E.1; can be parallelized.

---

## References (verifiable)

- Master tracker: `plans/reports/productization-260612-1530-master-tracker.md` § Phase E (lines 211–222)
- AGENTS.md: §1 (meta-surface), §2 (hook matrix + runtime-agnostic pattern)
- Current Core dir: `tools/learning-loop-mastra/core/legacy/` (live code; rename target)
- Current Mastra shell: `tools/learning-loop-mastra/{create-loop-tool,create-loop-workflow,create-loop-agent}.js` (12 `@mastra/core` import sites)
- Runtime shim pattern: `tools/learning-loop-mastra/hooks/legacy/` mirrored to `.claude/coordination/hooks/` + `.factory/coordination/hooks/` (SHA-256 enforced by `runtime-agnostic-checklist.js`)
- Mastra Code: npm `mastracode`; source at `mastra-ai/mastra/tree/main/mastracode`
- Mastra project structure: https://mastra.ai/docs/getting-started/project-structure (canonical layout: `src/mastra/{index.ts,agents,tools,workflows,mcp,scorers}`)
- Stale schema doc: `tools/learning-loop-mastra/core/legacy/schema-descriptions.yaml` (references Phase-A-deleted records)
- Parity-test pin: `tools/learning-loop-mastra/workflows/workflow-intentional-skip.js` (parity-tested at `__tests__/workflow-direct-parity.test.js:142,159`)
- Existing runtime-agnostic gate: `tools/learning-loop-mastra/core/legacy/runtime-agnostic-checklist.js` (6-item gate)
- Open LIMs that overlap with R2: LIM-3 (caller identity), LIM-4 (path traversal) — see master tracker § Phase B LIMs table

---

**Status:** DONE (advisory only; no meta-state mutation, no contract change).
