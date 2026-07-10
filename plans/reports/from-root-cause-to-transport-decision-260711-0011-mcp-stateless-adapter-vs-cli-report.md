# Transport Abstraction Decision: MCP-stateless-adapter vs CLI

**Source:** generalizes `plans/reports/from-debugger-to-operator-260710-2350-meta-260619T2233Z-phase1-root-cause-investigation-report.md` (Phase 1, H7 — cross-process file race on `meta-state.jsonl`)
**Question:** Is the MCP server the correct abstraction level for runtime L3, or should the loop's tool surface be a CLI instead? (Operator framing: "the MCP server requires us for managing lifecycle, but there is no external client that uses that MCP server, only local runtime.")
**Method:** Inversion exercise + simplification cascade (`~/.claude/skills/problem-solving/references/{inversion-exercise,simplification-cascades}.md`)
**Verdict:** L2 (Mastra shell / MCP tool surface) is the **correct abstraction level**. The H7 bug is not evidence that the abstraction is wrong — it is evidence the abstraction was **violated**: L2 grew in-process state that contradicts L1's file-based consistency model. Fix = enforce the existing layer invariant (make the MCP server a **stateless adapter over files**). Do **not** swap to a CLI today.

---

## 1. Reframe: the contract already separates abstraction from transport

The architecture does not couple the tool surface to MCP. `docs/runtime-contract.md` (L2) states the runtime participation contract as **4 transport-agnostic capabilities** (capability surface, gate enforcement, record routing, identity+discoverability) and names **3 transports**, only one of which is wired:

| Transport | Status | What it is |
|---|---|---|
| **MCP + hooks** | wired (3 runtimes) | tools as MCP tools; lifecycle via hook shims; runtime hosts an MCP client |
| **Shell-hook-only** | not wired | gate hooks only, no MCP tool surface — "the minimal participation path" |
| **Library-import** | not wired | loop imported as functions, in-process callbacks — forward-looking |

So the precise question is not "is L2 wrong" but **"is MCP+hooks the right transport, or should we wire the shell-hook-only (CLI) transport?"** That is a real choice the contract anticipates — not a heresy. The answer below is "keep MCP+hooks, but strip the state that doesn't belong to it."

## 2. Inversion: what if the write path weren't a long-lived stateful server?

Flip the assumption "the loop's tools must be a long-lived stateful server." Three things fall out.

### 2.1 H7 dissolves by construction

Phase 1's leading root cause (H7) is a per-process `enqueue` Map (`core/meta-state.js:357-366`) that serializes writes **within** a process but **not across** the two live servers (Phase 1 §C8: PID 1107356 + 3831390, same `resolveRoot()` → same file, no cross-process lock). The in-process queue *creates the illusion of serialization* that H7 punctures:

- A reads (10 entries) → A's enqueue schedules the write
- B reads (10 entries) → B's enqueue schedules the write
- A writes (11) → renames → file has 11
- B writes (11 with B's entry, NOT A's) → renames → file has 11 (**A's entry LOST**)
- A's handler returns `logged: true` (enqueue's Promise resolved) — but A's entry was overwritten

A **one-shot CLI has no in-process state to create that illusion.** Every invocation knows it is alone in its process, so the only concurrency to handle is cross-process — which you fix with an explicit `flock`/`proper-lockfile` on every call. The race does not vanish; it becomes **honest and visible** instead of hidden behind a queue that looks safe and isn't. (Phase 1's R1–R4 already name this fix for the MCP path: a cross-process file lock on `writeEntry`.)

### 2.2 The lifecycle-management cost dissolves

Operator's explicit pain. No PID to track, no 22h-stale server to kill (Phase 1 R5), no `/proc/<pid>/` forensics (C8). The report spent real effort diagnosing two live servers; that entire debugging class disappears when there is no persistent process.

### 2.3 In-process caches stop being correctness surfaces

The idempotency cache (in-process Map, 60s TTL — Phase 1 §4 caught a duplicate write from it: `call-1-baseline-repeat`) and the read-registry LRU (`core/read-registry-cache.js`, mtime+size keyed) are **per-process**. With two servers, a repeat call to the *other* server misses. These are perf optimizations that have **accidentally become correctness surfaces** — the F1–F13 known-issues list in `docs/architecture.md` is mostly cache-staleness bugs (F1, F2, F3, F8, F12, F13).

## 3. Simplification cascade: the load-bearing insight

> **The loop's consistency unit is the file. The MCP server's consistency unit is the process. Those two units disagree, and H7 is the disagreement.**

Everything that needs cross-process / cross-session / cross-runtime consistency is **already a file**: `meta-state.jsonl`, `runtime-state.jsonl`, `file-index.jsonl`, `gate-log.jsonl`, the `records/**` tree. The in-process state (enqueue Map, idempotency cache, LRU, the long-lived process itself) is a performance optimization that crossed into correctness territory.

Hold the invariant **"L2 is a stateless adapter over file-based L1"** and the cascade eliminates:

| Component | Eliminated by |
|---|---|
| per-process `enqueue` Map | cross-process file lock on `writeEntry` (Phase 1 R1–R4) |
| in-process idempotency cache | derive idempotency from the durable registry — entry `id` + `created_at` already is the source of truth |
| long-lived-process as consistency boundary | stale servers become **safe to kill** because they hold no authoritative write queue |

The replacement parts are **already on the trajectory.** `docs/trajectory.md` §6 names:
- the **batch primitive** (`meta_state_batch`) — single file lock, single cache invalidation (§6.2)
- the **materialized sidecar cache** — a *file* (`records/meta/.cache/loop-describe-cold.json`), correct across processes by construction (§6.1)

The cascade is not inventing new machinery; it is **finishing a move the docs already committed to.** The storage layer is parked, not jumped to — but the parking rationale (escape-hatch #11) is about *not rotating to SQLite yet*, not about keeping in-process state authoritative.

## 4. The honest tradeoff: MCP vs CLI

Operator's sharpest observation: **"there is no external client — only local runtime."** This is decisive. MCP's defining value is **client-server separation** — a remote client discovers and calls tools over a transport. If the only client is local and the "remote" is a localhost stdio pipe, MCP is being used for its tool-call *ergonomics*, not its *separation*. The "server" part of MCP — long-lived, stateful, lifecycle-managed — pays a real cost (lifecycle, cross-process state) for a benefit (remote client) nobody is collecting. That is the core of the operator's intuition, and it is correct.

| | **MCP, made stateless over files (Option B)** | **CLI / shell-hook-only (Option C)** |
|---|---|---|
| H7 / cross-process race | fixed via file lock | fixed by construction (no in-process state) |
| Lifecycle management | stale servers safe to kill (no authoritative state) | no server at all |
| Agent ergonomics | native tool calls, zod coercion, JSON schemas | `Bash` → parse stdout; bash-gate must allowlist the loop's own CLI |
| R2 write-authorization | already wired (`with-r2-gate.js`, `core/identity-pin.js`, `core/path-containment.js`) | must re-wire into the CLI |
| Workflow layer | `notify_artifact_change` → `trigger_workflow` already MCP-bound | must re-host the workflow registry + spawn isolation |
| Migration cost | low (surgical; 3 runtimes already wired) | high (re-wire 3 runtimes; re-host R2 + workflows; sunk schema work) |
| Contract status | current transport | "minimal participation path," not wired |

**Key realization from the cascade: the choice is false.** MCP's ergonomics (native tool calls, schema coercion, R2 gate) and CLI's honesty (stateless, no lifecycle) are **not in tension** once the MCP server is stateless-over-files. The server keeps its ergonomics; it stops owning correctness-critical state. That is the synthesis — not a compromise, an invariant enforcement.

## 5. Recommendation (prioritized)

**Do not swap to a CLI. Make the MCP server a stateless adapter over the file-based core** — which is the L1 invariant the architecture already claims (`docs/loop-engine.md`: the record is the loop's memory; `docs/architecture.md` §3-Layer: Core owns the data model, shell owns the tool surface).

1. **Add a cross-process file lock to `writeEntry`** (`core/meta-state.js:535-551`). Phase 1 R1–R4. Kills H7 directly. Small, surgical. The lock lives in `core/` (L1), not the shell, so it is correct under any transport.
2. **Drop or file-back the in-process idempotency cache** (`meta-state-log-change-tool.js:10`). It is per-process and created the duplicate-write illusion Phase 1 §4 caught. Idempotency belongs to the durable registry (`id` + `created_at`).
3. **Confirm the read-registry LRU is pure perf**, not correctness. It is already invalidated on every write — keep it, but verify no correctness path depends on it (audit the 30+ call sites Phase 1 §6.1 names).
4. **After (1)–(3), the server holds no correctness-critical in-process state**, so "kill the stale server" (R5) becomes safe — the lifecycle complaint dissolves because stale servers are **harmless**, not because they are gone.

Steps 1–2 are the load-bearing fix; 3–4 are verification + payoff.

### 5.1 Deeper answer to the abstraction question

**L2 is the correct level for the tool surface. The bug is that L2 grew in-process state that contradicts L1's file-based consistency model.** The fix is to *enforce the existing layer invariant*, not to change the layer. H7 is not telling you the abstraction is wrong; it is telling you the abstraction was **violated** — the shell reached into the consistency layer and cached authority it never owned.

## 6. When would the full CLI swap (Option C) actually be right?

Two conditions, both required:

1. **Lifecycle pain is chronic, not occasional.** If the operator is killing stale MCP servers weekly and debugging `/proc/<pid>/` forensics routinely, the case for eliminating the process strengthens materially. Today this is one 22h-stale server (Phase 1 C8) — a one-off.
2. **Ergonomics loss is acceptable.** The agent tolerates `Bash`-as-tool-channel: stdout parsing, the bash-gate allowlisting the loop's own CLI, no native zod coercion. Three runtimes (Claude Code, Droid CLI, Mastra Code) are already wired on MCP and benefit from native tool calls.

Today **neither holds** → Option B dominates. But keep Option C available: the contract names shell-hook-only the **minimal-participation escape valve** for a future runtime that cannot or will not host an MCP client, and **library-import** as the forward-looking option for a runtime that embeds the loop entirely (eliminating the process boundary — but only available to a runtime that can embed Node, which Claude Code cannot).

## 7. Contract gap surfaced (for the loop to close)

While analyzing this, a real underspecification in `docs/runtime-contract.md` surfaced:

- Capability 3 (record routing) says: *"The runtime never writes `records/**`, `meta-state.jsonl`, or `runtime-state.jsonl` directly. All writes go through the loop's tools."*
- The shell-hook-only transport says: *"no MCP tool surface; the runtime relies on the loop's file-based records **without a tool channel**."*

These two statements tension: if there is no tool channel, how do writes go through the loop's tools? Two readings:
- (a) shell-hook-only is **read-only participation** (no write path) — then capability 3 is unsatisfiable under that transport and the contract should say so.
- (b) a **CLI counts as a tool channel** (just not MCP) — then the contract should name it, and wiring a CLI would *define* the shell-hook-only transport rather than merely wire it.

This is an open contract question, not solved here. It matters because it determines whether Option C is "wire an existing transport" or "define an existing transport" — different amounts of design work.

## 8. Lineage to Phase 1 report

| Phase 1 item | This report's resolution |
|---|---|
| H7 (cross-process file race) | dissolved by construction under stateless-over-files (§2.1); fixed by R1–R4 file lock (§5.1) |
| R5 (kill stale PID 1107356) | becomes safe to kill once server is stateless (§5.4) — no authoritative state lost |
| R7 (where does cross-process file lock live?) | `core/` (L1), not the shell — transport-correct by construction (§5.1) |
| C16 / latent `meta-state-resolve-tool.js:161` bug | orthogonal; ship per Phase 1 R6 regardless of this decision |
| F1–F13 known issues (mostly cache-staleness) | root cause unified: in-process state as correctness surface (§2.3) |

## Unresolved questions

1. **Is the lifecycle pain occasional or chronic?** Weekly stale-PID kills → strengthens Option C materially. One-off 22h server → Option B clearly wins. (Operator judgment; not answerable from the repo.)
2. **Contract gap (§7):** is shell-hook-only read-only, or does a CLI count as a tool channel? Determines whether Option C is "wire" or "define." Recommend a `meta_state_report` finding if the operator wants the loop to track this.
3. **Should this decision be loop-cited?** The internalization rule (`AGENTS.md` §6) says cite code, not markdown. The load-bearing claim here — "L2 grew in-process state contradicting L1" — cites `core/meta-state.js:357-366` (enqueue) + `docs/architecture.md` §3-Layer. If the operator wants this as a first-class loop artifact, the path is: `meta_state_report` finding with `evidence_code_ref: tools/learning-loop-mastra/core/meta-state.js:357` + `mechanism_check: true`, then this report's `source_refs` use `local:meta-state:<id>`. Otherwise this report stands as a session-level architectural decision record.
4. **Does the operator want a `plan/` directory (phased implementation) for §5 steps 1–2**, or is the surgical fix small enough to ship directly? Steps 1–2 touch `core/meta-state.js` (the write path) + one handler — likely small enough for direct implementation after R1 confirmation, but a plan would force the R1 cross-process test (Phase 1 R1) before the lock lands.
