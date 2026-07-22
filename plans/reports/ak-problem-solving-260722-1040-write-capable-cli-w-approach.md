# Write-Capable CLI (W) — Status + Approach

**Scope:** approach for the next plan after the read-opt-out (R). Continues finding `meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no` (open, warning). Sequel to the onramp report at `plans/reports/ak-problem-solving-260721-1859-mcp-cli-migration-onramp-report.md` (repo root).
**Method:** evidence check of shipped state + mechanical read of the R2 gate / manifest / bash gate. Operator reframe applied: *reading via CLI but writing via MCP is a split transport* — the context-size win is not realized until the same CLI writes too.
**Not a plan.** A plan (`plans/<ts>-write-capable-cli-w/`) is drafted only after R accrues read-path T2 evidence and the operator confirms W scope.

---

## 1. Current status (2026-07-22)

| Item | State | Evidence |
|------|-------|----------|
| Plan `260721-1933` (read-only slice, 3 phases) | **complete** | `plan.md` status:complete; commits `541d08a`→`c0d5760`→`193c981`→`6a52182`; 2356 tests pass, 1 skipped |
| `bin/loop.mjs` (read-only, 7 tools) | shipped | 166 LOC; reuses `pinRuntimeIdAtBoot`+`normalizeInputSchema`+`adaptLegacyHandler`+`withR2Gate({pathFields:[]})` |
| Runtime-agnostic audit | 6/6 pass | `check_runtime_agnostic` on `bin/loop.mjs` |
| Bash-gate guard test | shipped | `__tests__/cli-bash-gate-guard.test.js` locks read-shape `ok`, write-redirect `block` |
| Contract wiring | shipped | `docs/runtime-contract.md` new read-only-CLI bullet, L27 pluralized; L25 (write-capable CLI) left unchanged |
| **Real `loop.mjs` usage** | **none — dormant** | no runtime points at `bin/loop.mjs`; no per-runtime transport config exists |
| **T2 evidence (read path)** | **none** | no runtime has read via CLI yet |
| **T2 evidence (write path)** | **none, and ungeneratable** | Phase 1 is read-only by construction; nothing shipped produces write-path evidence |
| Finding `meta-260721T0809Z` | open, v1 | gate satisfied via T3; "write surface stays on MCP until T2 evidenced" |

**Operator decision (this session, 2026-07-22):** R (per-runtime MCP read-opt-out) first. W (write-capable CLI) is the follow-on documented here.

## 2. The reframe — why read-only is half a transport

The onramp report framed R as capturing the dominant win (reads dominate manifest-byte cost, line 38). The operator's correction: **a runtime that reads via `node bin/loop.mjs …` but writes via `mastra_*` MCP tools holds *both* transports in model context.** The MCP server descriptor + write-tool schemas stay wired because writes still need MCP. R removes only the 7 read-tool schemas; the MCP surface (server descriptor + ~25 remaining tool schemas) remains.

So R is a *partial* context reduction with a *split-brain* ergonomics cost: the agent must reason in two command shapes (Bash one-shot for reads, native tool-call for writes) against the same registry. The full win — a runtime dropping the MCP record surface from context entirely — lands only when the same CLI does read **and** write. That is W's job. W is not a nice-to-have after R; it is the step that makes the CLI a *complete* transport for the record surface.

Honest bound: W still does not replace MCP for everything. `run_workflow_*` (Mastra registry), `workflow_storage_*` (`initStorage`, server-bound), and `update_r2_allowlist` (inline in `mastra/server.js:70-107`) are not handler modules — they stay MCP. So "full opt-out" = record surface (read + write) on CLI, workflow/storage/allowlist on MCP. The irreducible MCP residue is ~5 tools, not zero.

## 3. W is mechanically cheaper than the onramp report's §5 feared

The onramp §5 "Real costs" listed bash-gate allowlisting, steering surface, and agent ergonomics as the write-path costs. Three of the four dissolve on inspection — the same way read-path bash-gate allowlisting dissolved in the `260721-1933` plan deltas.

**Decisive fact:** `pathFields: []` for *every* manifest entry (`tools/manifest.json`). All meta-state tools write to **fixed internal paths** resolved from the pinned runtime id + root (`core/r2/path-field-detector.js` comment: "legacy tools write to FIXED internal paths… declare `pathFields: []` and the gate short-circuits to allow"). Per-runtime record ownership is enforced by the runtime pin + record-writer routing, **not** by user-supplied path args. Consequences for W:

| Onramp §5 cost | Reality for W | Disposition |
|----------------|---------------|-------------|
| **Bash-gate allowlisting on writes** | Gate is default-allow (`core/gate-logic.js:1008-1016`); `node bin/loop.mjs meta_state_report '{…}'` has no redirect, matches no blocking regex → `ok`. Same shape as reads. | **Dissolved.** Add a guard-test variant for the write shape; no promoted rule. |
| **R2 write authorization** | `withR2Gate({pathFields:[]})` passthrough is correct for write tools too — they write fixed internal paths. The gate that *does* bind writes (runtime pin → record-writer → runtime's own dir) is transport-agnostic. | **Transfers free** — CLI already calls `withR2Gate`. |
| **zod validation, manifest load, handler adapt, locks** | Identical code path as reads. | **Transfers free.** |
| **Steering surface (hint renderer)** | Renderer variant built for R (command forms for read tools) extends to write tools. | **Reuses R's work**; adds write-tool hint text. |
| **Agent ergonomics (stdout JSON parse on write path)** | Genuinely new. Write args are richer (report/resolve/batch schemas); a write that fails R2/record validation returns a structured error on stderr the agent must parse and react to. | **Real cost — the T2 write-path question.** |

So W's *mechanical* delta over the shipped read-only CLI is small:

1. **Expand the CLI tool set.** `READ_ONLY_TOOLS` → `CLI_TOOLS` (add the CLI-portable mutation tools; see §4 scope). One set, or a read-set + write-set if the operator wants a runtime to opt into writes separately.
2. **Exit-code semantics for write rejections.** Today: exit 1 = handler error, exit 2 = usage/identity-pin. A write denial (`cross_runtime_write_denied`) or record-writer validation failure is a handler-layer rejection → exit 1 with the structured error JSON on stderr. Decide whether to surface denial as exit 2 (caller-config: runtime not permitted) vs exit 1 (real rejection). Recommend **exit 1** — it is a genuine rejection, not a usage error, and exit 2 is reserved for caller-configuration preconditions (missing/invalid `LOOP_SURFACE`, bad JSON, ZodError).
3. **Bash-gate guard test extension.** Add `node bin/loop.mjs meta_state_report '{…}'` passes as `ok` (proves the write shape matches no blocking rule); keep the write-redirect `block` test. Locks the same assumption the read guard locks.
4. **Self-footgun guard.** `meta_state_promote_rule` can promote a bash-gate regex that blocks `node bin/loop.mjs` itself. A CLI runtime promoting such a rule would brick its own transport. Guard: either block `promote_rule` via CLI, or (preferred) the existing rule-promotion path already blocks self-referential gate rules — verify and lock with a test. Open question §7.
5. **Contract activation.** `docs/runtime-contract.md:25` currently names a write-capable CLI as "would be the smallest Capability-3 transport." W flips it from "would be" to "is," and the opt-out bullet (added in `260721-1933` Phase 3) gains a sentence: a runtime may route writes via CLI too. L25 is the contract basis the finding cites as `evidence_code_ref`; activating it is the contract-side closure.

## 4. W scope — all CLI-portable mutation tools, not the onramp's 6

The onramp §5 Phase 2 named 6 write tools: `meta_state_report`, `meta_state_resolve`, `meta_state_batch`, `runtime_state_record`, `gate_mark_preflight`, `meta_state_promote_rule`. But the manifest carries ~12 more mutation tools that are equally CLI-portable (handler modules, `pathFields: []`): `meta_state_patch`, `meta_state_supersede`, `meta_state_archive`, `meta_state_log_change`, `meta_state_propose_design`, `meta_state_ship_loop_design`, `meta_state_dispatch_finding`, `meta_state_re_verify`, `meta_state_refresh_file_index`, `meta_state_relationship_validate`, plus the gate ops `gate_check`, `gate_override`, `gate_check_recurrence`, `mark_preflight_complete`.

**Recommendation: scope W as "every handler-module tool the CLI can carry," not the 6.** The split-transport problem (§2) is only solved when the *whole* record surface is on one transport. Shipping 6 of ~18 mutation tools leaves the agent reading+writing most mutations via MCP anyway — the split-brain persists. The marginal cost of carrying the rest is one set entry each (the handler, schema, and gate are already transport-agnostic).

**Excluded from W (stay MCP):**
- `run_workflow_*` — Mastra registry-bound (`create-loop-workflow.js`).
- `workflow_storage_round_trip` / `workflow_storage_read` — need `initStorage` (`mastra/server.js:13,243`), server-bound.
- `update_r2_allowlist` — logic inline in `mastra/server.js:70-107`, not a handler module. Extract only if a CLI runtime must self-serve allowlist edits; otherwise stays MCP (operator-only surface).
- `meta_state_dispatch_finding` *commit* stage — hits GitHub via `gh`. The *prepare* stage is CLI-portable; *commit* needs network/subprocess. Decide: include prepare only, or include both and accept `gh` as a CLI subprocess dependency.

## 5. Real costs that remain (T2 write-path is the gate)

1. **T2 write-path evidence — the true sequencing dependency.** R produces *read-path* T2 evidence; it produces **zero** write-path evidence. W is gated on write-path ergonomics: can an agent reliably compose `meta_state_report` / `meta_state_batch` args as a JSON string in Bash, parse a structured stderr rejection, and recover? That is only answerable by dogfooding W. Unlike R (whose evidence R itself generates by making a runtime read), W's evidence requires W itself to exist and be used. So W is **self-gated**: ship a CLI-write dogfood on one runtime, accrue write-path T2, then generalize.
2. **Write-hint ergonomics.** Read hints are short (`loop.mjs meta_state_list '{…}'`). Write hints must convey richer schemas (report's category/severity/affected_system enum, batch's operation array). The hint renderer must emit usable command forms without re-injecting the full schema into context (that would undo the win). Likely: per-tool one-line arg sketch + a `loop.mjs <tool> --schema` flag that prints the zod schema on demand (pull, not push).
3. **Error-recovery loop.** A rejected write (denial / validation) must produce an actionable stderr message the agent can fix and retry — not a stack trace. Exit 1 + structured `{error, …}` JSON on stderr; the `--schema` flag for arg-shape recovery.
4. **Reversibility / blast radius.** Writes mutate the shared registry. A CLI-write bug (wrong runtime pin, mis-serialized batch) corrupts meta-state the whole loop reads. Mitigation: the existing `assertinvariant` wrappers + record-writer validation already bind mutations transport-agnostically; a CLI-write parity test against MCP responses (mirroring `cli-read-parity.test.js`) must cover the write path before any dogfood.

## 6. Sequencing

```
R (read-opt-out, one non-syn runtime dogfood)
   └─ accrues read-path T2 evidence
        └─ re-evaluate: is read-only opt-out enough? (operator call)
              └─ NO → W (this plan)
                    └─ Phase A: expand CLI to all portable mutation tools + write parity tests + exit-code/guard tests
                    └─ Phase B: write-hint renderer variant + `--schema` flag
                    └─ Phase C: contract L25 activation + opt-out bullet sentence
                    └─ dogfood W on the same runtime → write-path T2 evidence
                         └─ generalize: runtime drops MCP record surface (reads+writes via CLI); MCP kept for workflow/storage/allowlist only
```

W does **not** unblock on R's completion — it unblocks on R's *evidence* (read-path T2), and then adds its own evidence requirement (write-path T2). The two evidence streams are independent; R's read evidence does not license W. This is why W is a separate plan with its own dogfood, not a phase appended to R.

## 7. Open questions

1. **W tool-set boundary:** carry *all* handler-module mutation tools (recommended) or only the onramp's 6? Carrying all closes the split-brain; carrying 6 leaves it.
2. **`meta_state_dispatch_finding` commit stage:** include (accept `gh` subprocess dependency) or exclude (prepare-only via CLI, commit via MCP)?
3. **`update_r2_allowlist`:** extract from `server.js:70-107` into a handler module so the CLI can carry it, or leave MCP-only (operator-only surface)?
4. **Write-denial exit code:** exit 1 (rejection, recommended) vs exit 2 (caller-config)? Decides the agent's retry-vs-reconfigure branch.
5. **Self-footgun:** does the existing rule-promotion path block a regex that would match `node bin/loop.mjs`? If not, W must add a guard or exclude `meta_state_promote_rule` from the CLI.
6. **`--schema` flag:** pull-on-demand schema print (recommended) vs embedding arg sketches in hints (re-injects schema, partial undo of the win)?
7. **Dogfood runtime:** same non-syn runtime as R (the profile class the `b96b96c3` incident exploited), or a different one to widen T2 coverage?