# L2 transport-capability criterion — which function rides which transport

**Scope:** reframe BEFORE the W follow-up ("auxiliary read-ish tools → `CLI_READ_TOOLS`", §8 of `ak-problem-solving-260722-1040-write-capable-cli-w-approach.md`). The follow-up adds 5 tools to the CLI set; this report asks the prior question — *what decides the set in the first place* — and argues it belongs at L2, not in `core/cli-tools.js`.
**Trigger:** `plans/260722-1623-runtime-state-versioned-dedup-per-surface-tracking-toggle/` red-team finding **M6** — the plan text said "MCP write tools are not registered" as if universal; it was true only for `.claude` (`LOOP_RECORDS_VIA_CLI=1`) and false for `.factory`/`.mastracode`. The runtime agent could not read, off the tool, which transport a function rides. The fix was applied reactively at red-team. Operator reframe: keeping 2 transport surfaces is "arbitrary" unless the partition is contract-defined.
**Method:** Simplification Cascades (one criterion dissolves the heuristic + the arbitrariness + the agent confusion) + Inversion (one-transport ⇒ proves the split is forced, not arbitrary).
**Not a plan.** A recommendation: define a per-function transport-capability axis at L2. The follow-up then falls out of the criterion instead of being a separate judgment call.

---

## 0.5 Reframe after operator review — stateless-by-default, stateful → runtime-state layer

Operator correction (post-review): the criterion should not be a per-function statefulness *test*; it should be a **layer-ownership rule**. Sharpened principle:

- **Transport = stateless by default.** A function rides a transport iff it is a stateless adapter over durable L1 records — no process-scoped state, no warm cache.
- **Stateful behavior is owned by the runtime-state layer** (the file-based sidecar). Because that sidecar is *file-based*, its own tools (`runtime_state_record`, `pause`, `resume`, `prune`) are themselves stateless handlers and ride any transport. "Stateful command" in this framing means *process-scoped/warm* state, not *file* state — which dissolves the apparent contradiction that runtime-state tools mutate state yet are CLI-capable: they mutate a file, not a process.
- The only functions that **cannot** ride a one-shot transport are those needing **process-scoped server state** — exactly the mastra-layer residue (workflow registry, `initStorage`, warm allowlist cache).

This supersedes the looser "stateless-over-L1" phrasing in §2/§4: stateless is the *default disposition*, and MCP-only is always either a process-state necessity or a labeled policy override of that default (see §5.4, Q-A). The one genuine design question this leaves open is **where multi-step workflows live** — tracked as Q-D below and sharpened by the predict review (§7): the L1 baseline already exists (deterministic-step vs agentic-step), execution has **3 homes** (agent | runtime-state file | Mastra), and the answer is per-workflow-class via an audit, not a pre-built schema.

---

## 1. Two axes are conflated — this is the root of the M6 confusion

The contract (`docs/runtime-contract.md`, L2) already names *transports* (read-only CLI, write-capable CLI, MCP+hooks, library, shell-hook-only) and says wiring is "configurable per runtime." It does **not** name a per-**function** property. So today the only place "which transport does function F ride" is answered is:

- `core/cli-tools.js` (`CLI_READ_TOOLS` / `CLI_WRITE_TOOLS`) — the CLI side, L3.
- `__tests__/cli-write-tool-set-drift.test.js` `MCP_RESIDUE` — the MCP-only side, L3, with per-group "documented reasons."

Both are **L3 mechanism**. There is no L2 statement of the *criterion*. So when an agent (or a plan author) asks "is `runtime_state_pause` on MCP?", the answer is not a property of the function — it is `.claude`'s env flag. M6 happened because a **per-runtime wiring fact** was written as if it were a **per-function capability fact**. Two distinct axes, never separated:

| Axis | Property of | Stable? | Lives where today | Should live |
|------|-------------|---------|-------------------|-------------|
| **A. Transport capability** — can F ride transport X at all? | the **function** | yes (changes only when F's deps change) | nowhere (implicit in `pathFields:[]` heuristic) | **L2** |
| **B. Transport wiring** — does runtime R surface F on X? | the **runtime** | no (env flag per runtime) | L3 (`LOOP_RECORDS_VIA_CLI` + `cli-tools.js`) | L3 (stay) |

M6 conflated A and B. The fix is to **state A at L2** so B can be read as a pure runtime config on top of it.

## 2. The cascade insight — one criterion, not three buckets

Today's drift test partitions the manifest into three buckets by three different reasons:
- `CLI_TOOLS` — "handler module + `pathFields: []`" (a *mechanism* signal: R2 gate short-circuits to passthrough).
- `MCP_RESIDUE` workflow/storage/allowlist — "server-bound / process-scoped / warm-cache."
- `MCP_RESIDUE` audit + auxiliary read-ish — "never invoked by agents" / "not in the 7 reads, not a mutation handler."

The first two are the **same reason** stated two ways. The third is **not a reason at all** — it is "we haven't gotten to it," which is exactly the arbitrary residue the follow-up exists to clean up.

**Simplification:** collapse to one criterion that is already implicit in the contract's own L9 line — *"transports are stateless adapters over the durable record; correctness lives in L1 (file-based core)."* Stated as a **layer-ownership rule** (§0.5): stateless is the default; stateful behavior is owned by the runtime-state layer; the only transport-excluded functions are those needing process-scoped server state.

> **A function is CLI-capable iff it is a stateless adapter over the L1 file-based core: it holds no correctness-critical state, binds no process-scoped resource, and needs no warm in-process dependency. It is MCP-only iff it requires a server-bound resource a one-shot process cannot reconstruct cheaply and correctly, OR is an operator-only surface kept off the agent path by explicit policy.** (Default = stateless = transport-capable; MCP-only is always one of these two *overrides* of the default, never silent.)

Under that criterion the three buckets become two, and the reasons unify:

| Function class | L2 verdict | Why (one criterion) |
|----------------|------------|---------------------|
| 7 reads + 16 mutation handlers | **CLI-capable** | handler modules, `pathFields: []`, read/write fixed internal paths resolved from the pinned runtime id + root. No server state. |
| `gate_check`, `gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`, `meta_state_relationship_validate` (aux read-ish) | **CLI-capable** (currently mis-bucketed) | same — stateless read handlers over the file-based registry. Their `MCP_RESIDUE` status is a backlog artifact, not a property. **This dissolves the follow-up:** by the L2 criterion they belong in `CLI_READ_TOOLS`; the follow-up is not a judgment call, it is conformance to the contract. |
| `run_workflow_*` | **MCP-only today; pending per-workflow audit** | Mastra workflow registry is process-scoped — but the predict review (§7) shows this is per-class: deterministic short sequences could re-home to core+runtime-state; only long suspend/resume genuinely needs process state. Audit decides per tool, not a flat verdict. |
| `workflow_storage_*` | **MCP-only** | needs `initStorage` (`server.js:262`), server-bound. |
| `update_r2_allowlist` | **MCP-only** | mutates a server-state allowlist with a warm in-process cache (`allowlist-cache.js`); inline in `server.js:70-107`, not a handler module. |
| `check_runtime_agnostic` | **MCP-only** (operator-only) | audit; not an agent record path. The criterion is "stateless," and this *is* stateless — so this is the one genuine policy exception, not a statelessness exception. Keep it MCP for the *operator-only* reason, stated as such. |

So the criterion resolves the auxiliary-read-ish follow-up **for free**: they are CLI-capable by the contract, full stop. The only honest MCP-only-by-policy exception is `check_runtime_agnostic` (operator-only surface, not a statelessness violation) — and that should be labeled as a *policy* exception in the L2 text, not smuggled into the same bucket as the server-bound tools.

## 3. Inversion check — is keeping 2 surfaces actually arbitrary?

The operator's "arbitrary" worry inverts two ways:

- **Invert to one transport = MCP only (drop CLI).** Cost: the full MCP server descriptor + all ~33 tool schemas stay in model context permanently. This is the context-size cost R and W exist to remove. The `.claude` dogfood would lose the read-channel win already shipped (commit `9544084`). Not viable.
- **Invert to one transport = CLI only (drop MCP).** Cost: `run_workflow_*` / `workflow_storage_*` / `update_r2_allowlist` cannot ride a one-shot process — each call would have to re-`initStorage` (~15ms first call) and re-resolve a process-scoped registry, or lose the warm allowlist cache. Incorrect or wasteful. Not viable.

**Result:** both single-transport inversions fail, and they fail at the *same seam* — statefulness. So the 2-surface split is **not arbitrary; it is forced by the statelessness line**, and that line is exactly the L2 criterion above. The arbitrariness the operator felt is real, but its cause is that the forcing criterion was never *stated* — it lived implicitly in `pathFields:[]` and in red-team reactions. State it, and "arbitrary" becomes "derived."

This is the simplification-cascade payoff: one criterion (stateless-over-L1) simultaneously (a) gives L2 the missing per-function axis, (b) unifies the two real buckets and isolates the one policy exception, (c) resolves the auxiliary-read-ish follow-up as conformance not judgment, and (d) answers "why 2 surfaces" — forced, not chosen.

## 4. What moves where (L2 vs L3) — the contract edit is small

**L2 (`docs/runtime-contract.md`) gains one section** — a per-function capability axis sitting alongside the existing per-runtime transport list. Sketch:

> ### Transport capability (per function)
> A loop function has a transport capability independent of any runtime's wiring:
> - **CLI-capable** — the function is a stateless adapter over the L1 file-based core: no correctness-critical state, no process-scoped resource, no warm in-process dependency. It reads/writes fixed internal paths resolved from the pinned runtime id + root.
> - **MCP-only** — the function binds a server-bound resource a one-shot process cannot reconstruct cheaply and correctly (process-scoped registry, `initStorage`, warm allowlist cache), **or** is an operator-only surface kept off the agent path by policy.
>
> Capability is a property of the function; **wiring** (which capabilities a runtime surfaces) is a property of the runtime and is configurable per runtime (`LOOP_RECORDS_VIA_CLI` / `LOOP_READS_VIA_CLI`). The two are independent: a CLI-capable tool rides MCP by default and is *additionally* reachable via `bin/loop.mjs`; a runtime may drop it from MCP. "Is F on my MCP surface?" is a wiring question about the runtime, not a capability question about F.

That last sentence is the direct fix for M6 — it tells plan authors and agents which axis they are reading.

**L3 stays the mechanism:**
- `core/cli-tools.js` remains the single source of truth for the CLI set, but its header comment should cite the L2 criterion as the *reason*, with `pathFields: []` recast as the *test* of statelessness, not the reason.
- The drift test `MCP_RESIDUE` keeps its per-tool reasons, now phrased against the criterion: workflow/storage/allowlist = "server-bound / process-scoped" (statelessness failure); `check_runtime_agnostic` = "operator-only policy exception"; the 5 aux read-ish tools **leave** `MCP_RESIDUE` and enter `CLI_READ_TOOLS`.

No behavior changes for already-shipped tools; the L2 edit is a contract clarification + the follow-up the criterion entails.

## 5. Recommendation

1. **Define the per-function transport-capability axis at L2** in `docs/runtime-contract.md` as a **layer-ownership rule**: stateless-by-default (transport-capable); stateful behavior owned by the runtime-state layer (whose file-based tools are themselves stateless); MCP-only as one of two explicit overrides — process-scoped server state, or operator-only policy — never silent (capability ≠ wiring). This is the missing piece; everything else follows.
2. **Reframe `core/cli-tools.js` + the drift test as L3 enforcement of the L2 criterion** — header comments cite the criterion; `pathFields: []` becomes the statelessness test, not the reason.
3. **Fold the "auxiliary read-ish tools" follow-up into this**, not a separate plan: by the L2 criterion the 5 tools are CLI-capable, so move them from `MCP_RESIDUE` to `CLI_READ_TOOLS` and update the drift test. The follow-up is no longer a judgment call — it is the criterion's consequence. (Sequencing still respects the W gate: this lands after `.claude`'s write-path T2 accrues, since adding reads is low-risk but the criterion text is the durable output and can land sooner.)
4. **Isolate `check_runtime_agnostic` as a labeled policy exception** in both L2 text and the drift test, so the MCP-only bucket stops mixing "can't" (statelessness) with "choose not to" (policy). This is the one place the current buckets genuinely hide a distinction.
5. **Re-verify finding `meta-260721T0809Z`** (transport-diversification deferred decision) against this criterion at land time — it now has an L2 basis to cite as `evidence_code_ref` rather than only the L3 manifest.

## 6. Unresolved questions

- **Q-A — what `check_runtime_agnostic` does, and the tag-enforcement test.** `check_runtime_agnostic` (`tools/handlers/check-runtime-agnostic-tool.js` → `core/runtime-agnostic-checklist.js`) is a *static file audit*: it takes a caller-supplied `feature_path`, walks `core/` + `hooks/universal/` + `tools/handlers/` + each surface's `coordination/hooks`, and runs the 6-item "shim-not-fork + cross-surface-iteration" checklist — chiefly: code must not hardcode surface names (`.claude`/`.factory`/`.mastracode`) and must derive paths from `SURFACES`. Returns `{items_checked, items_passed, failures:[{item_id, description, fix_suggestion}]}`. It reads files off disk via `resolveRoot()`, holds no state/registry/cache — so by the statelessness criterion it is **CLI-capable**; its `MCP_RESIDUE` membership is purely the "audit-only, never invoked by agents" comment, i.e. an **operator-only policy** override, not a statefulness failure. Under §0.5 (stateless is the default), every `MCP_RESIDUE` entry is an *override* of that default, so the drift test should require each entry to declare **one of two reason tags**: `server-state` (mastra workflow registry / `initStorage` / warm allowlist cache) or `operator-policy` (the `check_runtime_agnostic` case). An untagged entry fails the test — mechanically enforcing the L2 default at L3 and preventing another silent "policy tool bucketed next to stateful tools" drift. Recommend: yes, extend the drift test to require the tag.
- **Q-B — retracted; abstraction-level jump.** The original Q-B tried to make the transport-capability criterion name the "`gh issue create` between `dispatch_finding` prepare and commit" seam. That is wrong: "did the agent run `gh` between the two stages?" is an **agent-behavior observation**, which is exactly what the **runtime-state layer** (the layer below transport) exists to record — ledger events / delivery attestations. The transport layer carries function calls; it does not observe agent behavior. The only transport question for `dispatch_finding` is whether the *handler* is stateless (yes — `handleCommitStage` does `appendLedgerEvent` + `updateEntry` only), and it is already answered. If the loop needs to know the agent did the `gh` step, that is a **runtime-state record the agent writes (or a gate attests)** — a gap in the runtime-state layer's contract, not the transport layer's. Moved out of this report; the transport criterion says nothing about it.
- **Q-C:** Library-import transport (forward-looking, L2 line 25) — under this criterion every CLI-capable function is also library-import-capable (stateless), and only the MCP-only set is excluded. Confirms the criterion generalizes beyond the CLI/MCP pair, but not wired; noted, not solved here.
- **Q-D — ANSWERED-WITH-RULE by the predict review (§7); pending per-workflow audit.** Where multi-step workflows live is no longer open *in principle*: the L1 baseline already exists (deterministic-step vs agentic-step, `docs/loop-engine.md:57-63`), so "define workflow at L1 first" = a *naming* clarification, not a new concept. Execution state has **3 homes** — agent | runtime-state file | Mastra process — chosen per-workflow-class; default durable home = runtime-state file (keeps core process-stateless); Mastra is the *exception* for genuine long suspend/resume, not the default. The definition carries ordering + per-step success contract (not "fully stateless data" — the split is a framing, not a strict partition). What remains is the *audit* that classifies each of the ~11 workflow tools into the right home — evidence-driven, no pre-built schema. See §7 and `ak-predict-260722-2103-workflow-definition-vs-execution-l1-baseline.md`.

---

## 7. Status after predict review — cleared vs remaining

Cross-ref: `plans/reports/ak-predict-260722-2103-workflow-definition-vs-execution-l1-baseline.md` (verdict **CAUTION**). The predict was scoped to the workflow-definition-vs-execution concern (the Q-D / operator worry about "workflow" terminology and Functional Core). It did **not** re-examine the transport-capability criterion itself (§1–§5) — that stays this report's contribution.

### Cleared by the predict report

- **The L1 baseline already exists.** `docs/loop-engine.md:57-63` defines **deterministic-step vs agentic-step** and states a workflow step can realize either role; "the concept role is primary; the mechanism is interchangeable." So "define workflow at L1 first" = a *naming* clarification of an existing concept, **not** a new concept. This forecloses the over-definition risk the predict flagged as its top High risk: **no 5th registry kind**; workflow-definitions, if any, are bound-artifacts like skills (operator-authored, change-log-gated, not agent-writable).
- **Q-D answered-with-rule (pending audit).** Execution state has **3 homes, not 2** (the §0.5 "2 homes" framing is upgraded): **agent | runtime-state file | Mastra process**, chosen per-workflow-class. Default durable home = runtime-state file (keeps core process-stateless); Mastra is the *exception* for genuine long suspend/resume, not the default. The "definition vs execution" split is a useful framing, not a strict partition — the definition embeds per-step success criteria (execution semantics).
- **Q-B retraction confirmed and sharpened.** Predict Q2 names the precise sub-question: for agent-executed sequences, is "step N succeeded" *gate-observed* (enforceable) or *agent-asserted* (trusted)? That is a runtime-state-layer contract question — the same abstraction level as the retracted Q-B. Confirms Q-B belongs in the runtime-state layer, not transport.

### Still needs doing (not cleared)

1. **L1 naming clarification paragraph** (`docs/loop-engine.md`) — name the existing deterministic/agentic split as "workflow definition (declarative ordering + per-step success contract, stateless data, bound-artifact-class) vs workflow execution (imperative shell, 3 state homes)." One paragraph, not a schema. *(predict rec #1)*
2. **L2 transport-capability section** (`docs/runtime-contract.md`) — this report's rec #1; predict did not touch it (different layer). Still pending.
3. **Audit the ~11 workflow tools per-class** against the clarified L1 baseline → a report: deterministic short → portable candidate (re-home to core+runtime-state); long suspend/resume → stays Mastra; storage-bound → stays Mastra. **Classify the 3 `mastra_workflow_*` helpers** (`generate_prompt`, `notify_artifact`, `trigger`) *separately* from the 8 `run_workflow_*` — the drift test lumps them today. *(predict rec #2, Q3)*
4. **Drift-test reason tags (Q-A)** — both reports agree: extend the drift test to require each `MCP_RESIDUE` entry declare `server-state` or `operator-policy`. Pending build.
5. **Aux-read-ish fold** (rec #3) — move 5 tools `MCP_RESIDUE` → `CLI_READ_TOOLS`. Gated on W's write-path T2; not done.
6. **`check_runtime_agnostic` policy label** (rec #4) — pending.

### New open questions from the predict

- **P-Q1:** Does runtime-state need a new `kind` for per-step success records, or do existing kinds (ledger event / delivery attestation) cover it? Answered *by* the audit, not a prerequisite to it.
- **P-Q2:** For agent-executed deterministic sequences, is step success gate-observed (enforceable) or agent-asserted (trusted)? Resolve in the runtime-state layer's contract — the predict confirms this is the same seam as the retracted Q-B.
- **P-Q3:** The 3 `mastra_workflow_*` helpers are a different surface from the 8 `run_workflow_*`; the audit must classify them separately (the drift test lumps them today).

### Refined sequencing

L1 naming clarification → audit report (evidence) → [only if the audit proves it] any new L1 concept → L2 transport section + drift-test tags + aux-read-ish fold (gated on W T2). **No workflow-tool re-homing code until the audit names which tools and why** — evidence-driven, not speculative.