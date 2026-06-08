# Revised Finding: Loop Memory as Product, Vnstock as Substrate

**Predict revision** — supersedes the initial `What's this repo about?` and `Does dual-purpose make sense?` exchanges. Authored in `/brainstorm` after the user corrected my framing: meta-state is the product, not the template's bookkeeping.

---

## Verdict: **GO** on the corrected model — with three structural decisions needed now

The dual-purpose framing I started with ("template + live system + research") was wrong. The actual architecture is three layers, and naming them correctly changes every recommendation that follows.

### The corrected model

| Layer | Role | Lifespan | Lives in |
|---|---|---|---|
| **Template** (loop machinery) | Gates, hooks, schemas, MCP server — the static rules of the game | Frozen-ish; evolves through formal change-log entries | `tools/learning-loop-mcp/`, `schemas/`, `.claude/coordination/` |
| **Meta-state** (loop memory) | **The actual product.** Self-referential findings, rules, drift, lifecycle. The system learning about itself. | Grows continuously per operator; change-log tier is durable | `meta-state.jsonl` + 11 MCP tools in the `meta_state` group |
| **Vnstock / `product/api/`** | **A substrate.** Real surface area the loop operates on so it generates real findings. Replaceable. | Disposable — exists to provoke learning, not to be learned *about* | `records/vnstock/`, `product/api/` |

**The product isn't vnstock. The product isn't the template. The product is the meta-state system itself** — a self-referential learning log that turns loop behavior into durable, queryable knowledge about the loop's own correctness.

This is exactly what the recent commit history shows in action: `gate-bug finding → resolve → refresh fingerprint`, `cold-tier test → replace with invariant checks`, `:line/#anchor suffixes → strip`. The loop is finding its own bugs and patching them. The vnstock work is the scratch pad that exposes the bugs.

---

## What changed in my analysis

### Recommendations to REVERSE

- ❌ **"Move `meta-state.jsonl` to `state/` and add to `.gitignore`"** — this was the biggest miss. If meta-state is the product, it must be visible, persisted, versioned, and inspectable. Hiding it hides the product. The right question is *how* meta-state travels between operators, not *whether* it stays in the repo.
- ❌ **"69 findings is unhealthy / suggests churn"** — I read recursion as a smell. It is the whole point. The right metric is not count, it's **promotion rate** (findings → rules → enforced invariants) and **drift recovery** (findings caught + resolved vs drifted). A recent sample entry — `meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe` (category `loop-anti-pattern`, subtype `tool-retry-loop`) — is the loop noticing its own retry pathology. That's learning, not churn.
- ❌ **"Categorize findings by target — % self-referential"** — wrong axis. The right question is: *of the findings, how many changed behavior?* A finding that doesn't promote to a rule, fix a gate, or block a future violation is dead weight. A finding that does is the loop working.

### Recommendations that are now STRONGER

- ✅ **Charter rule #8 ("loop changes MUST be logged as meta-state change-log")** — this is the heartbeat, not a guardrail. The change-log IS the system's evolution log. Code is its compiled form. If a gate change lands without a paired change-log entry, it is not "incomplete" — it is an inconsistency in the system's self-model. The charter should say so explicitly. A silent gate change is the loop mutating itself without updating its own memory. That is a memory wipe.
- ✅ **Pre-commit hook for `tools/learning-loop-mcp/core/`** — even more important than I said. The hook is the muscle that enforces the heartbeat.
- ✅ **"Vnstock is replaceable"** — yes, but the substrate must be **non-deterministic and prone to novel breakage** to generate interesting findings. A synthetic fixture would lose the property that makes the loop's learning non-trivial. Vnstock is good substrate for now, but the property to preserve is "real-world failure modes," not "vnstock specifically."

### Recommendations that HOLD (per user confirmation)

- ✅ **"Tighten the 'vnstock as research subject' framing"** — still right, now in sharper form. Vnstock is not the research subject. **The research subject is the loop's capacity to learn from running against any non-trivial surface.** Vnstock is the current instantiation. The "research question" should be: *"Can a self-referential constraint-enforcement system improve itself through operational use, without operator authorship of findings?"* The vnstock work is one trial of that question; the substrate should be documented as a trial, not a centerpiece.

---

## Three structural decisions needed now

### 1. Where does meta-state live, and how does it migrate?

Meta-state must be visible. But each operator's environment differs (API keys, drift patterns, gate configs). Two viable models:

| Model | Pros | Cons |
|---|---|---|
| **A. Repo-tracked, operator-owned** (current) | Visible, version-controlled, migrates via git | Pollutes template with operator state; onboarding operator sees prior operator's noise |
| **B. Template ships with a stub; operators commit their own** | Clean template; each operator's memory is theirs | Meta-state never accumulates into shared knowledge; the system's "wisdom" dies with each clone |

Neither is fully right. The third option:

**C. Template ships clean. Meta-state has a *promotion tier* — local findings stay local, promoted rules (via `meta_state_promote_rule`) can be exported as a YAML bundle and PR'd back to the template.** This makes the template itself a snapshot of "rules the loop has learned are worth enforcing." The full operator history stays in their clone; the distilled wisdom migrates.

→ Recommend **C**. Implementation: a new `meta_state_export_rules` MCP tool that emits a YAML bundle of promoted rules in template-importable form. Low effort, high leverage.

### 2. What is the loop's loss function?

Self-referential learning needs a target. Current candidates:

| Target | Why it might be the right one | Why it might be wrong |
|---|---|---|
| **Drift recovery rate** (findings caught + resolved vs. drifted) | Direct measure of self-correction | Operators can game it by not creating fingerprints |
| **False-positive rate** (findings that turn out to be wrong) | Measures epistemic humility | Hard to measure without ground truth |
| **Time-to-resolution** for a finding class | Latency of the learning loop | Encourages premature resolution |
| **Irreversible operations the loop prevented** | Closest to the original charter promise | Counterfactual is invisible — "would have been wrong" is unprovable |

→ Recommend a composite: **drift recovery rate** (primary) + **findings-per-promoted-rule ratio** (efficiency). Track both, surface drift in `meta_state_query_drift`. The point isn't to optimize; it's to make the loop's learning trajectory visible. The current `meta_state_query_drift` tool (SP3) already returns aggregate drift; extending it to a "learning metrics" view is small.

### 3. How is operator capture prevented?

The corrected model surfaces a subtle failure mode: if the operator's corrections shape what the loop learns, and the loop's gates shape what the operator sees, they're co-adapting. The meta-state becomes a record of operator preferences, not system truths. Charter rule #1 ("operator is final authority") makes this worse — it explicitly cedes truth to the operator.

This is not a hypothetical. A loop that learns "the operator doesn't like gate warnings about X" will stop generating them. The loop becomes an extension of the operator's taste, not an independent check.

**Mitigation candidate: an "operator-ack" annotation on change-log entries** distinguishing operator-driven changes from loop-discovered changes. The ratio of these two over time is the "operator capture index." High ratio = the operator is the system's brain, not the loop.

This is probably out of scope for a single brainstorm, but it should be filed as a design candidate (loop-design entry) so the question doesn't get lost.

---

## Tightened vnstock-as-substrate framing (kept from prior version, sharpened)

The vnstock work in `records/vnstock/` and `product/api/` should be documented as a **trial substrate**, not a centerpiece. Concrete asks:

1. **Add `LIVE.md` to repo root** — one paragraph declaring: "This repo is a reference template AND a live vnstock experiment. The template is the loop machinery (`tools/learning-loop-mcp/`, `schemas/`). The experiment is the meta-state that grows from running the loop against `product/api/`. To extract the pure template, delete `records/vnstock/`, `product/api/`, `product/web/`, and reset `meta-state.jsonl`."

2. **Frame vnstock records as a single experiment** — give it one experiment record in `records/vnstock/experiments/` capturing: goal (provide a non-trivial substrate for the loop), method (run vnstock install/runtime probes through the gate), observations (link to meta-state findings the loop generated from the work). The scattered records then become evidence for the single experiment, not a fragmented corpus.

3. **Document the substrate's required properties** — "the loop requires a substrate that (a) has irreversible operations to gate, (b) exhibits non-deterministic failure modes, (c) provides evidence files the loop can fingerprint. Vnstock satisfies all three. A future substrate (e.g., a different vendor API, a synthetic fixture with seeded failures) must satisfy the same three."

---

## Risk Summary (revised)

| Risk | Severity | Mitigation |
|---|---|---|
| Meta-state gitignored or hidden → product disappears | **High** | Model C above: tiered promotion, never gitignore |
| Charter rule #8 unenforced → silent self-modification | **High** | Pre-commit hook on `tools/learning-loop-mcp/core/` |
| Vnstock substrate is confused with the product | **Medium** | `LIVE.md` + single experiment record + "substrate properties" doc |
| Operator capture → loop learns to please operator | **Medium** | File as loop-design candidate; track operator-ack vs loop-discovered ratio over time |
| Loss function unstated → loop optimizes wrong thing | **Medium** | Adopt composite metric; extend `meta_state_query_drift` to a learning-metrics view |
| Findings that don't change behavior accumulate as noise | **Low** | Sweep tool already exists (`meta_state_sweep`); add a "stale-finding" signal: finding with no rule promotion, no drift fix, no commit reference after N days |
| Substrate loses its non-determinism (vendor too stable, or too locked down) | **Low** | Rotate substrate periodically; document the property explicitly |

---

## Honest read

The repo is healthier than my first read suggested. The dual-purpose confusion I flagged is real but minor — it's a labeling problem, not a design problem. The deeper risk is the one the corrected model surfaces: **the system has no stated loss function and no protection against operator capture.** Both are addressable now while the meta-state is small (69 entries) and the operator is the same person who designed the loop. They will be much harder to retrofit after the system has crystallized its preferences.

The three structural decisions above (migration model, loss function, operator-capture guard) are the things worth doing *before* the meta-state grows another order of magnitude. Once it's 700 entries instead of 69, the cost of a "lost-loop-memory" incident goes up by 10x.

---

## Unresolved questions

1. **Does the operator-ack annotation belong in the schema now, or wait until capture pressure is empirically observed?** (Lean: add it now while cheap, label it "experimental.")
2. **Is `meta-state.jsonl` at 115KB / 69 entries the size where `query_drift` starts hurting on every MCP call?** Worth profiling before the next 10x.
3. **Is the vnstock substrate's non-determinism decaying?** The vendor is stable. Are we still generating novel findings, or has the loop learned enough about vnstock that findings have dried up? A "findings-per-week" trend would answer this.
4. **Is there a separate "learning trajectory" doc that exists outside the loop?** A periodic reflection on what the loop has learned, written by the operator from the meta-state, would catch the operator-capture signal early.

---

**Status:** DONE
**Summary:** Revised finding inverts the dual-purpose framing. Meta-state is the product, vnstock is the substrate, template is the machinery. Three structural decisions proposed: (C) tiered meta-state migration, composite loss function, operator-capture guard. Charter rule #8 elevated to "heartbeat, not guardrail."
**Concerns/Blockers:** None for this analysis. Implementation of recommendation C requires a new MCP tool (~half-day work) and a schema decision on operator-ack annotation.
