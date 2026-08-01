# Meta-state lifecycle modeling — tightening the status & relationship vocabulary

**Spawned by:** the `recurrence-trigger-window` plan's validation gate (`plans/260802-0135-recurrence-trigger-window/`, cancelled). The owner rejected the `reopens`-mapping options and redirected: the lifecycle modeling itself is "not tight enough"; resolve the lifecycle questions **before** wiring the recurrence trigger's `reopens` linkage.
**Scope:** the meta-state registry's lifecycle model — the 4 entry kinds, their status vocabularies, and the cross-ref (relationship) vocabulary. Resolves four questions the owner named: **reopens**, **rule↔finding**, **superseded (do we need it?)**, and **accepted value**.
**Out of scope:** the recurrence trigger's window/redaction/grace-window fix (P1–P3+P5 of the cancelled plan) — those are settled and independent of this; they revive once the lifecycle model is tightened.

## 1. The current model (scouted)

### 1.1 Four entry kinds, three status vocabularies

| kind | status enum | closure path | notes |
|------|-------------|--------------|-------|
| `finding` | `open, resolved, superseded, archived` (+ legacy `active`/`reported`/`stale` tolerated by `isOpen`) | `resolve`→resolved; `supersede`→superseded; `archive`→archived | two distinct *closed* states (`resolved`, `superseded`) |
| `rule` | `active, inactive, archived` | `deleteEntry`→archived tombstone; `inactive` = not enforced | one *closed* state (`inactive`) |
| `loop-design` | `active, inactive, archived` | `ship_loop_design`→inactive (`shipped_in_plan`+`shipped_at`) | one *closed* state (`inactive`); same enum as rule |
| `change-log` | `active` (always) | none — immutable audit | never closes |

**Registry census** (`meta-state.jsonl`): finding 119 open / 76 resolved / 7 superseded / 20 archived / 1 None; rule 38 active / 16 inactive / 2 archived; loop-design 11 active / 16 inactive; change-log 49 active.

The concept mapping is tight underneath the words:

| concept | finding | rule / loop-design |
|---|---|---|
| live | `open` | `active` |
| closed (fixed / retired / shipped) | `resolved` **or** `superseded` | `inactive` |
| tombstone | `archived` | `archived` |

So there are really **two vocabularies**: finding uses `open/resolved/superseded/archived`; rule and loop-design use `active/inactive/archived`. The concepts align (live / closed / tombstone) but (a) the words differ and (b) finding has **two** closed states where rule/loop-design have **one**. That gap is the first "not tight enough."

### 1.2 The relationship vocabulary is already centralized

`core/entry/relationship-graph.js` `CROSS_REFS` is the single source of truth for cross-record edges:

| field | from → to | multi | flags |
|---|---|---|---|
| `consolidated_into` | finding → change-log | no | superseded finding's canonical home |
| `reopens` | finding → finding | yes | "new evidence re-surfaces an old finding" |
| `promoted_to_rule` | finding → rule | no | **`legacy: true`** — `rule.origin` is canonical |
| `consolidates` | change-log → finding | yes | inverse of `consolidated_into` |
| `supersedes` | change-log → change-log / rule → rule | no | prior-record refinement |
| `origin` | rule → finding | no | **`canonicalPromotion: true`** |
| `applies_to_resolution` | rule → finding | no | **`forwardOnly, riExempt`** — gating hint, NOT a lifecycle edge |
| `proposed_design_for` | loop-design → any | yes | forward refs (rules/schemas/tools) |
| `addresses` | loop-design → finding | yes | motivating findings |

This is **tighter than it looks**: canonical vs derived refs are explicit (`origin` canonical, `promoted_to_rule` legacy/inverse), and lifecycle edges are distinguished from gating hints (`applies_to_resolution` is `forwardOnly, riExempt`). The relationship model is NOT the loose part. The loose parts are (§2) the status vocabularies and the accepted-limitation modeling.

### 1.3 Versioned-append, last-wins-by-max-version

All kinds use versioned-append (`core/meta-state.js:204–212`): new entries start at `version: 0`; patches bump to `N+1`; reads project `max_by(version)` per id. "Latest version of each finding" is that projection. Lifecycle tools (`resolve`/`supersede`/`archive`/`ship`/`unarchive`) true-append a new version with the status stamp; `unarchive` restores by appending past a tombstone. This is sound and is not in question.

## 2. Diagnosis of the four questions

### 2.1 rule↔finding — already tight; the recurrence report's premise was wrong

**Finding:** findings are **rule-agnostic**. `metaStateFindingEntrySchema` has no `rule_id` field — only `promoted_to_rule` (legacy inverse), `consolidated_into`, `reopens`, `recurrence_key`. The rule→finding link is `rule.origin` (canonical); the finding→rule link is `finding.promoted_to_rule` (legacy, being retired in favor of `rule.origin`). So the coupling is **one canonical forward edge** (`rule.origin`), and findings carry no rule pointer at all.

The recurrence report's "match the recurring finding's `rule_id` to B" was a category error: neither the recurring finding nor B carries a `rule_id` field. The `rule_id` in that context is a **decision-log field** (which gate rule fired), embedded in the recurring finding's `recurrence_key` (`rule_id::hash(prefix)`), not a finding field.

**Verdict:** the rule↔finding relationship is already tight (one canonical edge, findings rule-agnostic, the legacy inverse is explicitly being retired). **No decoupling work needed here** — the owner's instinct ("findings shouldn't carry rule_id") is already the state of the schema. The only follow-up is to finish retiring `promoted_to_rule` (it is `legacy: true`; confirm zero live writers and drop it, or leave as a read-only derived inverse).

### 2.2 superseded — the *semantics* are needed; the *separate status* is the question

**Finding:** `superseded` (7 findings) is a **distinct closure path** from `resolved`:
- `resolved` = "closed because fixed/addressed" (`resolve` tool: `resolved_at` + `resolved_by` + `resolution`; no change-log link).
- `superseded` = "closed because consolidated into a change-log as a durable decision" (`supersede` tool: `superseded_at` + `superseded_by` + `consolidated_into` → a change-log id).

The 7 superseded findings are design-tension / lineage findings folded into a change-log (e.g. `meta-260704T1006Z-…keep-dispatch-and-ack-orthogonal…` → `meta-260717T1057Z-meta-state-lifecycle-status-enum`). These were not "fixed"; they were **recorded as design decisions** in a change-log. That is a real, distinct closure semantics — a finding whose resolution *is* a durable recorded decision, not a fix.

**Do we need it as a separate status?** Two views:
- **Keep (distinct status):** `superseded` says "this finding is closed *by consolidation*, not by fix" — a queryable distinction. A `resolved` finding with `consolidated_into` would be ambiguous (was it fixed *and* recorded, or just recorded?).
- **Collapse (status + field):** one closed status (`resolved`) + an optional `consolidated_into` link. `supersede` becomes "resolve with a change-log consolidation." This aligns finding with rule/loop-design (one closed state), removes a status, and lets `consolidated_into` ride on `resolved`. The distinction "fixed vs recorded" moves from the status to the *presence* of `consolidated_into` + the `resolution` text.

**Verdict (lean): collapse.** The two-closed-states split is the main reason finding's vocabulary diverges from rule/loop-design. `resolved` + optional `consolidated_into` (and `resolution` text that says "consolidated into change-log X") preserves the semantics while removing the status. Cost: a migration of 7 findings (`superseded`→`resolved`, carry `consolidated_into`), and `supersede` becomes a flavor of `resolve`. The `CROSS_REFS` `consolidated_into` edge is unchanged. **Open for owner decision** — this is a real semantic choice, not a bug.

### 2.3 accepted value — the genuine smell

**Finding:** "accepted limitations" are modeled as **`open` findings** with a `-accepted` subtype suffix, never meant to be resolved. Census: 4 `strip-bypass-accepted` (incl. B = `meta-260615T1920Z-…`, 6 versions, open since 2026-06-15) + 2 `design-tradeoff`. B's `rule_id: None`, `recurrence_key: None`, `status: open`.

The conflation: `open` means both (a) "a problem to fix" and (b) "a standing accepted trade-off." The cost is real and is what the owner reacted to:
- `isOpen(B)` is true → B counts in "open problems" tallies and the stale-view flags it as aged (48 days), nudging the operator to "resolve" something that was *accepted*. Resolving it would be wrong.
- The `-accepted` subtype suffix mitigates (machine-readable) but does not fix the status lie.

**Viable models, by cost:**

| model | change | `reopens` applies? | cost |
|---|---|---|---|
| **A. `accepted` finding status** | add `accepted` to the finding enum; `isOpen` excludes it; migrate 4+2 findings | yes (still a finding) | small: enum + `isOpen`/`isStaleView`/`derive-status` + migration |
| **B. model as `loop-design`** | accepted trade-off is a *design decision* → `loop-design` (active), `addresses` the motivating finding/rule | **no** (`reopens` is finding-only; use `addresses`) | medium: B changes *kind* (6 versions migrate), `reopens` linkage changes primitive |
| **C. new `accepted-limitation` kind** | dedicated kind + lifecycle + tools | n/a | heavy; YAGNI for ~6 entries |

**Verdict (lean): model A (`accepted` status).** It is the smallest change that fixes the status lie, keeps `reopens` applicable (so the recurrence trigger's linkage still works), and aligns with the §2.2 collapse (finding would become `open / accepted / resolved / archived` — one canonical closure state, plus `accepted` for standing trade-offs). Model B is conceptually cleanest (an accepted trade-off *is* a design decision) but it breaks the `reopens` primitive the recurrence trigger needs and forces a kind migration. **Open for owner decision** — A vs B is a real modeling choice (status vs kind).

### 2.4 reopens — right primitive, wrong framing for accepted-limitations

**Finding:** `reopens` (finding→finding, 17 precedents) is a **lifecycle edge** in `CROSS_REFS`: "new evidence re-surfaces an old finding's conclusion." The flow is `reopens` (record the link on the new finding) + `meta_state_resolve({ id, cascade_from })` (close the stale parent). It is already tight: it is centralized, typed, and distinct from consolidation (`consolidated_into`) and promotion (`origin`).

The recurrence report's use of `reopens` against B is **misframed** because B is an *accepted limitation*, not a *stale finding to be closed*. `reopens` + cascade-resolve **closes** the parent — but an accepted limitation is not "stale evidence to close"; it is a standing acknowledgment. Reopening-and-closing B says "the accepted trade-off is now resolved" — which is the opposite of the owner's intent (the trade-off stands; the new evidence is that it is *actively recurring in vivo*, which is information *about* the accepted limitation, not a refutation of it).

So the right primitive for "in-vivo recurrence evidence relates to an accepted limitation" is **not `reopens`** (which closes a stale finding). It is one of:
- **`addresses`** (loop-design→finding) — if accepted-limitations become loop-designs (§2.3 model B), the recurring finding is a *motivating finding* that the design `addresses`. But `addresses` is loop-design→finding (design points at findings), the wrong direction for "finding cites design."
- **a new finding→design edge** ("informs" / "evidence-for") — a finding that provides in-vivo evidence *about* a design/accepted-limitation, without closing it.
- **just file independently** — the recurring finding stands on its own; the operator draws the link at triage (the existing manual pattern for `reopens`).

**Verdict:** `reopens` is the right primitive *for stale findings* (close-on-new-evidence) and should be kept. It is the **wrong** primitive for accepted-limitations (which should not be closed). The recurrence trigger should **not** `reopens` B. This resolves the P4 impasse: the reopens linkage was solving the wrong problem. The right linkage depends on the §2.3 decision (A: a finding→finding `informs` edge; B: a finding→loop-design `evidence-for` edge; or file-independently).

## 3. Proposed tighter model (synthesis)

Assuming the owner accepts the leans (§2.2 collapse, §2.3 model A), the finding lifecycle becomes:

```
finding:  open  →  accepted  (standing trade-off; not "to fix"; isOpen excludes)
          open  →  resolved  (closed; fixed OR consolidated — distinguished by
                               optional consolidated_into + resolution text)
          any   →  archived   (tombstone)
```

This:
- **Removes `superseded`** (folded into `resolved` + `consolidated_into`); finding goes from 4→4 statuses but with one canonical closure state (`resolved`) + `accepted` for standing trade-offs. Aligns the "closed" concept with rule/loop-design's single `inactive`.
- **Adds `accepted`** so accepted-limitations stop lying as `open`.
- **Keeps `reopens`** for the stale-finding-closed-by-new-evidence case (its real job).
- **Adds a non-closing evidence edge** for "in-vivo recurrence informs an accepted limitation" (the recurrence trigger's actual need) — direction finding→accepted-limitation, semantics "evidence-for" / "informs", does NOT close the target. (Exact field name + whether it lives on the finding or is a new `CROSS_REFS` edge is a follow-up design detail.)
- **Leaves rule↔finding as-is** (already tight; optionally finish retiring `promoted_to_rule`).

The status vocabularies still differ in *words* (finding `open/accepted/resolved` vs rule/loop-design `active/inactive`). A second, optional tightening pass could unify the words (e.g. one canonical set `{live, closed, tombstone}` with kind-specific aliases), but that is cosmetic and lower-value than the §2.2/§2.3 fixes. Flagged as a non-goal for now.

## 4. What this unblocks / defers

- **Unblocks:** the recurrence trigger's P4 (reopens) — re-scoped. It no longer `reopens` B; it files the recurring finding with a non-closing evidence edge to the accepted-limitation (or files independently). P1–P3+P5 (window, redaction, grace window, regression) revive unchanged from the cancelled plan.
- **Defers to a follow-up plan:** the actual lifecycle migration — add `accepted` status, collapse `superseded`→`resolved`+`consolidated_into` (7 findings), migrate the 4+2 accepted-limitation findings to `accepted`, add the non-closing evidence edge to `CROSS_REFS`, update `isOpen`/`isStaleView`/`derive-status`/the lifecycle tools, and finish retiring `promoted_to_rule`. That is a registry-wide lifecycle refactor with its own migration + tests; it should be its own plan, not folded into the recurrence trigger.

## Unresolved questions (owner decisions)

1. **`superseded` — collapse into `resolved` + `consolidated_into` (lean), or keep as a distinct closure status?** §2.2. A semantic choice, not a bug.
2. **Accepted-limitation model — `accepted` finding status (lean, model A) or remodel as `loop-design` (model B)?** §2.3. Model A keeps `reopens`-adjacent primitives; model B is conceptually cleanest but breaks them.
3. **The recurrence-trigger's evidence edge — a new non-closing finding→accepted-limitation edge ("informs"/"evidence-for"), or file-independently and let the operator draw the link?** §2.4. Depends on #2.
4. **Cosmetic vocabulary unification** (open/accepted/resolved vs active/inactive) — worth a second pass, or leave the words kind-specific? Low value; flagged as a likely non-goal.
5. **`promoted_to_rule` retirement** — finish dropping the legacy inverse (confirm zero live writers), or leave as read-only derived? §2.1.

## Scouting resolutions (260802-0152)

- **Findings are rule-agnostic** — confirmed against `metaStateFindingEntrySchema` (no `rule_id`; `promoted_to_rule` is `legacy: true`, `rule.origin` canonical). The recurrence report's rule_id-matching premise was a category error.
- **`superseded` semantics** — confirmed via `meta_state_supersede` tool: stamps `status:superseded` + `consolidated_into` (change-log). 7 findings, all design-tension/lineage, consolidated into change-logs. Distinct from `resolve` (no change-log link).
- **Status vocabularies** — confirmed 3 enums (finding `open/resolved/superseded/archived`; rule+loop-design `active/inactive/archived`; change-log `active`). Concept alignment documented in §1.1.
- **`reopens`** — confirmed a lifecycle edge in `CROSS_REFS` (finding→finding, multi), 17 precedents, paired with cascade-resolve (closes the parent). Wrong fit for accepted-limitations (which should not be closed).
- **Accepted-limitation census** — 4 `strip-bypass-accepted` + 2 `design-tradeoff`, all `open`. B confirmed `rule_id: None`, `recurrence_key: None`, `status: open`, 6 versions.