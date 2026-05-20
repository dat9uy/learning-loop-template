# Brainstorm Report: Machine-Extracted Index for Learning Loop

## Problem Statement

Two problems, one root cause:

1. **No one does the synthesis work.** Experiments are archived. Evidence is captured. But the step from "experiment succeeded" to "doc question is resolved" is skipped. The operator prefers solving code problems over managing claim YAMLs.

2. **Claims are not atomic.** Current claim YAMLs bundle multiple assertions, accumulate supersession history in place, and carry heavy verification blocks. Writing one claim takes 10+ minutes. They are skipped.

**Root cause:** The learning loop archives actions (experiments) but not conclusions. Claims are supposed to bridge that gap, but their schema is too heavy and their maintenance is human-dependent.

## Direction Chosen: Machine-Extracted Index (Direction A)

**Core principle:** Human writes one rich evidence file. Machine extracts atomic assertions into agent-derived index files. Humans never edit the index.

### What This Means

| Current | After |
|---------|-------|
| Human writes experiment YAML + evidence markdown + claim YAML | Human writes evidence markdown with a `## Findings` section of atomic bulleted assertions tagged by operator-named topic |
| Claims are persistent YAMLs that go stale | Assertions live in agent-regenerated index files derived from evidence; humans never edit the index |
| `promotion_review` todo lists track what claims to update | Index regeneration hashes evidence; drift detected mechanically |
| Doc questions diverge from records | Doc answers come from the index (single top-level artifact); docs stay as canary |

### Why This Direction

- **Solves motivation problem:** Writing `## Findings` bullets is natural — it happens during or right after the experiment. No separate "claim writing" step.
- **Solves atomicity problem:** Each bullet IS one assertion. Machine extracts them atomically.
- **Eliminates human-maintenance staleness:** Humans never edit the index. Agents regenerate it from evidence and detect drift via content hashes. The index is persistent on disk (auditable in git) but agent-owned.
- **Leverages existing infrastructure:** Evidence frontmatter already has `record_type`, `capability`, `dimension`, `scope`, `validation_status`, `claim_support`.
- **Enforces N=1/N>1:** See below — this is the hidden reason machine-extracted index is the only viable path.

### Why Machine-Extracted Index Enables N=1/N>1

The learning loop has an N=1/N>1 classification rule (`records/evidence/meta/n-equals-one-gap-class.md`):
- **N=1 closeable:** Fix on first encounter (add rule, close gap).
- **N>=2 deferred:** Wait for pattern repetition before formalizing schema/tooling.

This rule has not been forced into use cases because **non-atomic claims make N counting impossible.**

**Example:** `claim-vnstock-runtime-403-root-cause` bundles four assertions:
1. Config path pointed too deep
2. Device-Id was missing
3. Vendor changed auth mechanism
4. vendor_compat is archived

When assertion #2 (Device-Id required) was disproved, what was N?
- N=1 for "Device-Id required"? Yes.
- N=1 for "Config path pointed too deep"? No — that was never disproved.
- N=1 for the whole claim? Ambiguous.

The claim was edited in place, not split. **N counting requires countable units.** Current claims are not countable.

**Machine-extracted index fixes this:** Each extracted assertion is an independent unit with its own disproof counter. The machine can:
- Detect when new evidence disproves a prior extracted assertion
- Increment N for that specific assertion only
- Auto-classify: N=1 → flag as closeable gap; N=2 → trigger schema/tooling formalization

Without atomicity, N=1/N>1 remains a manual heuristic applied when the operator remembers. With machine-extracted atomic assertions, it becomes a mechanical rule the system enforces.

### Evidence Section Conventions (Net-New, Retrofit Per Migration)

Survey of 22 existing evidence files shows heterogeneous section use: `## Summary` and `## Observations` are common, `## Confirmation / Disproof Notes` appears in 9 files, but `## Findings` and `## Conclusions` appear in zero files. The proposed `## Findings` convention is net-new, not retrofit.

The new convention (decided in item 11 below):

- **`## Findings`** — sole extraction target. Each top-level bullet starts with an operator-named topic tag `[topic-tag]` followed by the assertion. Nested bullets prefixed `Context:` and `Caveat:` populate corresponding fields in the index entry. Other nested bullets are ignored.
- **`## Confirmation / Disproof Notes`** — kept as the cross-evidence supersession signal (consumed by Mechanism 2 Scope C). Not extracted as new assertions.
- All other sections (`## Summary`, `## Observations`, `## Steps Executed`, etc.) — freeform narrative, not extracted.

Existing 12+ files using `## Observations` for prose findings get migrated lazily (G3) when their content is reused; their existing sections stay valid as freeform narrative.

Experiment YAMLs (`agent_outcome`, `product_outcome`) and frozen claim YAMLs (assertion sentences) restate what evidence concludes; the new index entries are the canonical synthesis going forward.

## What Is Decided

1. **Direction:** Machine-extracted index. No new persistent claims; existing claims become frozen-legacy (see item 10).
2. **Human boundary:** Human writes evidence markdown. Machine extracts assertions.
3. **Observation boundary:** Observations keep their current role (external state tracking). Not bloated with soft findings.
4. **Evidence convention:** Evidence markdown gets a standard `## Findings` section for machine extraction (refined in item 11; `## Conclusions` was dropped from the original sketch).
5. **Types that stay separate:** Observations (state), Decisions (choices with boundaries), Risks (hypotheticals), Experiments (pre-action commitments + binary outcome; see item 8).
6. **Three-territory model (format as epistemic boundary):**
   - **`docs/` (escape hatch):** Human-only markdown. Intentionally informal. May diverge from records. Divergence IS the signal.
   - **`records/evidence/` (formal evidence):** Markdown. Human writes. Agent may create under explicit operation. Agent never edits existing.
   - **`records/*/` (machine structure):** YAML. Agent reads/writes freely. Human writes observations.
7. **Doc resolution:** Docs are not updated by agents. They remain the canary. Human updates docs only when running deliberate tests or when divergence becomes painful.
8. **Experiments stay authoritative with slimmer prose (G1.A):** Experiment YAMLs retain `status`, `result`, `verification.proves` (the pre-action commitment + binary outcome that maps to extracted-assertion dimension status). Drop or shrink `agent_outcome` and `result_reason` — these restate what cited evidence already concludes. The pre-execution approval gate (`status: reviewed | approved`) remains a distinct artifact because it is a different epistemic act from observation.
9. **Extracted assertions live in `records/index/` (G2.B + G5 + G7):** Per-assertion YAML files, agent-derived from evidence, never hand-edited. Self-contained — answer "what does the system know about X?" without reading evidence/experiments. Identity rule: `assertion-<capability>-<dimension>-<topic-tag>` where topic-tag is operator-named in `## Findings` bullets (`[topic-tag] assertion text`). Same triple across evidence files = same index entry; N increments. Filenames carry no date (assertions are durable; chronology lives in YAML + git log). Schema detailed in "Index Entry Schema" below.
10. **Existing 10 claims: deprecate-then-leave + prototype seed + lazy migrate (G3.A refined):**
    - **Schema-level deprecation, no per-file edits:** A single `records/decisions/decision-<ts>-claim-deprecation.md` declares the claim schema deprecated for new entries (cites this brainstorm as basis). Annotate `schemas/claim.schema.json` with a top-level `deprecated: true` + `description` pointing at the decision. The 10 existing claim YAMLs are unchanged — their `status: approved` reflects historical truth — and read-only thereafter. "Frozen-legacy" is a process state derived from directory location + decision record, not a record field.
    - **Prototype seed (2 claims):** Migrate `claim-vnstock-runtime-403-root-cause` (stress-tests N counting + supersession) and `claim-vnstock-install-sandbox` (stress-tests multi-dimensional assertions). Human writes `## Findings` into the relevant evidence files; extraction tool builds `records/index/` entries; verify the new index answers the same doc questions the claim used to.
    - **Lazy migration thereafter:** Pull-based — when an agent answers a doc question and the live assertion still lives only in a frozen claim, agent proposes evidence rewrite to operator (Mechanism 1). On confirmation, evidence gets `## Findings`, extraction runs. No proactive batch work — aligns with the motivation diagnosis.
    - **Frozen ≠ invisible:** Mechanism 2 Scope A extends to "frozen claim vs extracted index" (see below).
11. **Section convention (G4.A):** Evidence files adopt `## Findings` as the sole extraction target. Top-level bullets carry `[topic-tag]` followed by an atomic assertion; nested bullets prefixed `Context:` and `Caveat:` populate corresponding index fields. `## Confirmation / Disproof Notes` is parsed for cross-evidence supersession — each `assertion-…` ID under that header drives mechanical write-back of `superseded_by` / `status` on the old entry and `supersedes` on the new entry (Mechanism 2 Scope C, implemented Plan 5). On multi-finding evidence files, disproof IDs disambiguate by topic-tag opposition (`X-required` ↔ `X-not-required`); single-finding files pair unambiguously. All other sections (`## Summary`, `## Observations`, `## Steps Executed`, etc.) remain freeform narrative, not extracted.
12. **Soft immutability via hash (G6.B):** Evidence files are editable; the index entry's `evidence_immutable_hash` detects post-extraction edits. Hash mismatch triggers Mechanism 2 Scope B re-extraction. "Immutability" is not enforced at the filesystem level — the invariant is "index must match its sources at extraction time," enforced by the hash check.
13. **Doc question resolution: index-first, self-contained (Q4.B refined):** Index is the sole top-level artifact for state queries. Agent answers from `records/index/<assertion-id>.yaml` alone; reads source_refs/experiment_refs only on deeper queries (proof, audit, history). Docs (`docs/`) provide intent/context and remain human-only; if docs and index disagree, agent flags drift to operator (item 7 + Mechanism 2 extension).
14. **Extraction authority inherits from evidence (Q1.A):** No separate approval step on the index entry. The index entry's `status` is derived mechanically from the source evidence's `validation_status`:
    - `evidence.validation_status: passed` → `index.status: active` (canonical; agents may rely on it for state queries).
    - `evidence.validation_status: pending` → `index.status: pending_approval` (extracted for traceability; agents must flag uncertainty when answering from it).
    - `evidence.validation_status: failed` → extraction is skipped; no index entry is written until the evidence is corrected and re-validated.
    Rationale: Mechanism 1 already gates *authoring* (human writes evidence; agent verifies). Evidence `validation_status` is the existing human approval signal. Adding a second per-assertion gate would recreate the staleness problem the redesign solves. The extraction tool re-reads `validation_status` on every regeneration, so promoting evidence from `pending` to `passed` upgrades the index entry without manual intervention.
15. **Dimension inherits from evidence frontmatter (Q3.A):** Index entry fields `capability`, `dimension`, and `scope` are copied verbatim from the source evidence file's frontmatter on extraction. One evidence file contributes index entries of exactly one dimension; multi-dimension experiments must be written as multiple evidence files (one per dimension). The dimension axis (`static | install | runtime | product`) is preserved because per-dimension state queries (e.g., "what is the install state of capability X?") remain a load-bearing use case inherited from the claim verification grid. Bullet syntax stays dimension-free — no per-finding overrides. Evidence files with empty frontmatter (e.g., 3 legacy vnstock-data files) get frontmatter backfilled when lazy migration first touches them; extraction errors with a clear message until then.

## Records Layout (Post-Decisions)

```
records/
  claims/            # 10 files, frozen-legacy after bulk action; read-only thereafter
  index/             # NEW — extracted assertions (agent-derived YAMLs)
  index/_by-evidence.md   # OPTIONAL TOC, tool-written, only if reverse grep gets slow
  experiments/       # slim YAMLs (status, result, verification.proves)
  evidence/          # human-authored markdown, source of truth for findings
  decisions/         # unchanged
  observations/      # unchanged
  risks/             # unchanged
```

Provenance chain: `experiment.id` → `evidence_refs[]` → `## Findings` bullet → `records/index/<assertion-id>.yaml`.

## Index Entry Schema

Self-contained per Q4.B refined — the agent can answer state queries from this YAML alone.

```yaml
id: assertion-vnstock-data-runtime-device-id-required
schema_version: "1.0"
type: extracted-assertion
status: active                   # active | superseded | pending_approval
assertion: "vnstock_data 3.1.8 no longer requires Device-Id injection for VCI auth."
context: "Applies to runtime calls against VCI provider in sandbox scope."
caveats:
  - "Earlier versions (3.0.x) required injection via vendor_compat patch."
  - "TCBS provider not tested; behavior may differ."
capability: vnstock-data
dimension: runtime
scope: sandbox
topic_tag: device-id-required
n_count: 1
superseded_by: null
supersedes: []
source_refs:
  - file: local:records/evidence/vnstock-data/runtime-403-fix-20260511.md
    section: "## Findings"
    bullet_index: 3
    line_anchor: "vnstock_data 3.1.8 no longer requires Device-Id"
experiment_refs:
  - record:experiment-vnstock-vendor-compat-removal-20260518T014500Z
extraction:
  agent_run: <run-id>
  first_extracted_at: "2026-05-19T..."
  last_updated_at: "2026-05-19T..."
  evidence_immutable_hash: <sha-of-source-evidence-file>
```

## Authoring Convention (Inside `## Findings`)

```markdown
## Findings

- [device-id-required] vnstock_data 3.1.8 no longer requires Device-Id injection for VCI auth.
  - Context: Applies to runtime calls against VCI provider in sandbox scope.
  - Caveat: Earlier versions (3.0.x) required injection via vendor_compat patch.
  - Caveat: TCBS provider not tested; behavior may differ.
- [config-path] Wrapper VNSTOCK_CONFIG_PATH now points at `.vnstock` root.
  - Context: Applies to wrapper invocation from product/api venv.
```

Extraction tool reads each top-level bullet as an assertion. `[topic-tag]` is required (extraction errors otherwise). Nested `Context:` and `Caveat:` lines populate the index entry. Other nested bullets are ignored with a warning.

### Disproof Notes (drives supersession write-back)

When new evidence disproves a prior extracted assertion, the same evidence file declares the supersession via a sibling section:

```markdown
## Confirmation / Disproof Notes

- Disproves assertion-vnstock-data-runtime-device-id-injection-required: vnstock_data 3.1.8 authenticates with `api_key.json` alone.
```

The extraction tool parses every `assertion-…` ID under this header, looks each one up in the existing index, and on a match writes `superseded_by: <new-id>` + `status: superseded` on the old entry and `supersedes: [<old-id>]` on the new entry — within the same extraction pass. No hand-edits to the index. Without a disproof note, an assertion-text change on an existing ID is a hard-stop (Mechanism 2 Scope C).

**Disambiguation when one evidence file produces multiple findings:** the disproof ID must end in the explicit topic-tag opposite of the finding it targets (`X-required` ↔ `X-not-required`). The pairing is otherwise unambiguous for single-finding files. Operators who need to supersede from a file producing several unrelated findings should either split the evidence or name the disproof IDs with matching `-required` / `-not-required` suffixes.

## Mechanisms Decided

### Mechanism 1: Suggest-Then-Confirm

Agent proposes evidence markdown content. Human writes the evidence markdown. Agent reads it back, verifies key assertions match the proposal, generates the `extraction` block in the index entry — `agent_run`, `extracted_at`, and `evidence_immutable_hash` (hash of the cited evidence file at extraction time). Only then agent writes `records/index/<assertion-id>.yaml` (and any unrelated YAMLs like observations).

- Human is the sole author of markdown narrative.
- Agent cannot write index or other YAMLs without confirming the human artifact exists and matches.
- Timestamps and hashes (like `extracted_at`, `evidence_immutable_hash`) are agent-generated, not human-editable — same pattern as observations.

### Mechanism 2: Hard-Stop Drift Detection (Scope: A, B, C)

Agent detects drift among learning loop artifacts. Hard stop. Ask human for resolution.

**Scope A — Evidence consistency + frozen-claim drift:** Do evidence files contradict each other, or does a new extracted assertion contradict a frozen-legacy claim's assertion text?  
*Example 1:* Evidence A says "installer SHA is deterministic"; Evidence B says "SHA changed across installs."  
*Example 2:* New extracted assertion says "Device-Id not required"; frozen `claim-vnstock-runtime-403-root-cause` originally claimed "Device-Id required." Hard-stop unless the frozen claim's own supersession block already records the change.

**Scope B — Evidence-to-extraction fidelity:** Does human-written evidence match what the agent extracted into the index? `evidence_immutable_hash` in each index entry detects post-extraction edits; mismatched hash forces re-extraction.  
*Example:* Human added a finding the agent didn't see; index `evidence_immutable_hash` no longer matches the file hash.

**Scope C — Assertion supersession (N counting):** Does new evidence disprove a prior extracted assertion?  
*Example:* New experiment shows Device-Id not required; old extracted assertion in `records/index/` claims it is. Increment `n_count` on the new assertion only; set `superseded_by` on the old.

**Out of scope:** Docs (escape hatch, external to loop) and observations (state snapshots, atomic budget counters — no drift, only updates).

### Enforcement Status (post-Plan-5)

Scopes A, B, C are now mechanically enforced by `tools/extract-index/`:

- **Scope A — frozen-claim drift:** `frozen-claim-drift.js` hard-stops when a new extracted assertion's topic-tag (`X-required` / `X-not-required`) opposes a frozen claim on the same `(capability, dimension)`. Escape hatch: the operator adds `SUPERSEDED` or the new assertion-id to the claim's `notes` field. Free-form contradiction detection remains operator judgment.
- **Scope B — evidence-to-extraction fidelity:** `evidence_immutable_hash` is computed at extraction and compared on every re-run. Any post-extraction edit forces re-extraction.
- **Scope C — assertion supersession:** disproof notes drive supersession write-back; assertion-text change without a disproof note is a hard-stop. `n_count` increments on aggregation; `supersedes` / `superseded_by` are written mechanically (never hand-edited).

## Worked Example: vnstock-403 Migration (Action Point)

Concrete walkthrough of migrating `claim-vnstock-runtime-403-root-cause`. Validates the design on paper before any commits. Operator runs this when seeding prototype migration in Next Steps step 2.

### Starting Point — The Bundled Claim

`claim-vnstock-runtime-403-root-cause` bundles four assertions accumulated across two time-points (2026-05-11 original, 2026-05-18 supersession edit in place):

| # | Bundled Assertion | Time-point | Current Truth |
|---|------------------|------------|---------------|
| A | Wrapper `VNSTOCK_CONFIG_PATH` pointed one segment too deep; fix points at `.vnstock` root. | 2026-05-11 | Active (the wrapper fix is still in effect) |
| B | vnstock_data VCI headers lacked `Device-Id`; vendor_compat injects it. | 2026-05-11 | Superseded — 3.1.8 doesn't need injection |
| C | vnstock_data 3.1.8 authenticates via `api_key.json` only; Device-Id injection no longer required. | 2026-05-18 | Active (supersedes B) |
| D | vnstock_data 3.1.8 reads `api_key.json` via `Path.home()`; `HOME` must point at `product/api` during import. | 2026-05-18 | Active (the real install-time requirement post-3.1.8) |
| E | vendor_compat module is archived; not needed for vnstock_data ≥ 3.1.8. | 2026-05-18 | Active |

The claim's in-place supersession (`notes` field + `SUPERSEDED:` strings in reasons) mixes time-points and dimensions. N counting on it is impossible.

### Rewritten Evidence — `## Findings` Sections

Two source evidence files are touched. (Capability-revalidation file also needs frontmatter backfilled per item 15; assumed done.)

**File 1: `records/evidence/vnstock-data/runtime-403-fix-20260511.md`** (existing, `dimension: runtime`). Add at the end:

```markdown
## Findings

- [device-id-injection-required] vnstock_data VCI request headers must include a `Device-Id` header and matching `device_id` cookie for the listing and quote surfaces to authenticate.
  - Context: Observed against vnstock_data 3.0.x in product/api sandbox venv on 2026-05-11.
  - Caveat: Patch lives in `product/api/src/vendor_compat/`; not upstreamed.
```

The install-dimension assertion A (config-path fix) does **not** belong in this runtime-dimension file. Per item 15, it migrates into an install-dimension evidence file. The operator either (a) extracts a new file `records/evidence/vnstock-data/wrapper-config-path-fix-20260511.md` with `dimension: install`, or (b) defers extraction until the next install-related experiment touches the same fix. The worked example uses path (a):

**File 1b (new): `records/evidence/vnstock-data/wrapper-config-path-fix-20260511.md`** (`dimension: install`, `validation_status: passed`, content cited from the original 2026-05-11 verification block):

```markdown
## Findings

- [wrapper-config-path-root] The install-vnstock.sh wrapper must set `VNSTOCK_CONFIG_PATH` to the `.vnstock` root, not one segment deeper, for the installer and runtime to agree on where `user.json`, `api_key.json`, and `device.id` live.
  - Context: Applies to the wrapper at `product/api/scripts/install-vnstock.sh` running against vnstock_data 3.0.x and 3.1.x.
```

**File 2: `records/evidence/vnstock-data/capability-revalidation-20260518.md`** (after frontmatter backfill: `dimension: runtime`, `scope: sandbox`, `validation_status: passed`, `claim_support: supports`). Add:

```markdown
## Findings

- [device-id-injection-not-required] vnstock_data 3.1.8 no longer requires Device-Id injection for VCI auth; api_key.json is sufficient.
  - Context: Verified across 6 surfaces (Reference.listings, Reference.company, Market.ohlcv, Fundamental.income_statement, Insights.ranking, Macro.gdp) in sandbox on 2026-05-18.
  - Caveat: TCBS provider not tested; behavior may differ.
- [home-env-for-api-key] vnstock_data 3.1.8 resolves `api_key.json` via `Path.home() / ".vnstock" / "api_key.json"`, so `os.environ["HOME"]` must point at `product/api` before importing vnstock_data.
  - Context: Capability scripts in product/api now set HOME explicitly before import.
  - Caveat: If HOME is left at the shell user's home, vnstock_data raises "Không tìm thấy thông tin người dùng hợp lệ" (vendor-side, looks like an auth failure but is actually a missing-config failure).
- [vendor-compat-archived] The `product/api/src/vendor_compat/` module is no longer required for vnstock_data ≥ 3.1.8 and is archived.
  - Context: Direct import of vnstock_data without vendor_compat patching now succeeds.
```

### Resulting Index Entries

Extraction produces 5 entries in `records/index/`. Showing the supersession pair in full and three abbreviated.

```yaml
# records/index/assertion-vnstock-data-runtime-device-id-injection-required.yaml
id: assertion-vnstock-data-runtime-device-id-injection-required
type: extracted-assertion
status: superseded
assertion: "vnstock_data VCI request headers must include a Device-Id header and matching device_id cookie for the listing and quote surfaces to authenticate."
context: "Observed against vnstock_data 3.0.x in product/api sandbox venv on 2026-05-11."
caveats:
  - "Patch lives in product/api/src/vendor_compat/; not upstreamed."
capability: vnstock-data
dimension: runtime
scope: sandbox
topic_tag: device-id-injection-required
n_count: 1                # superseded once
superseded_by: assertion-vnstock-data-runtime-device-id-injection-not-required
supersedes: []
source_refs:
  - file: local:records/evidence/vnstock-data/runtime-403-fix-20260511.md
    section: "## Findings"
    bullet_index: 1
    line_anchor: "vnstock_data VCI request headers must include"
experiment_refs:
  - record:experiment-vnstock-runtime-403-fix-20260511T143500Z
extraction:
  agent_run: <run-id>
  first_extracted_at: "2026-05-19T..."
  last_updated_at: "2026-05-19T..."
  evidence_immutable_hash: <sha>
```

```yaml
# records/index/assertion-vnstock-data-runtime-device-id-injection-not-required.yaml
id: assertion-vnstock-data-runtime-device-id-injection-not-required
type: extracted-assertion
status: active
assertion: "vnstock_data 3.1.8 no longer requires Device-Id injection for VCI auth; api_key.json is sufficient."
context: "Verified across 6 surfaces (Reference.listings, Reference.company, Market.ohlcv, Fundamental.income_statement, Insights.ranking, Macro.gdp) in sandbox on 2026-05-18."
caveats:
  - "TCBS provider not tested; behavior may differ."
capability: vnstock-data
dimension: runtime
scope: sandbox
topic_tag: device-id-injection-not-required
n_count: 1
superseded_by: null
supersedes:
  - assertion-vnstock-data-runtime-device-id-injection-required
source_refs:
  - file: local:records/evidence/vnstock-data/capability-revalidation-20260518.md
    section: "## Findings"
    bullet_index: 1
    line_anchor: "vnstock_data 3.1.8 no longer requires Device-Id"
experiment_refs:
  - record:experiment-vnstock-vendor-compat-removal-20260518T014500Z
extraction:
  agent_run: <run-id>
  first_extracted_at: "2026-05-19T..."
  last_updated_at: "2026-05-19T..."
  evidence_immutable_hash: <sha>
```

Remaining three entries (abbreviated — full schema identical to above):

| id | dimension | source file | status |
|----|-----------|-------------|--------|
| `assertion-vnstock-data-install-wrapper-config-path-root` | install | `wrapper-config-path-fix-20260511.md` | active |
| `assertion-vnstock-data-runtime-home-env-for-api-key` | runtime | `capability-revalidation-20260518.md` | active |
| `assertion-vnstock-data-install-vendor-compat-archived` | install | `capability-revalidation-20260518.md` ⚠ | active |

⚠ **Cross-dimension surface gotcha:** The `vendor-compat-archived` finding is install-dimension semantically (it's about what's installed) but appears in a `dimension: runtime` evidence file. Per item 15, this would not be extracted — the extraction tool must either (i) refuse and flag, or (ii) treat the bullet as runtime-dimension because the source file says so. Decision needed during extraction-tool design (flagged in Next Steps).

### Supersession Flow

Mechanism 2 Scope C triggers when the 2026-05-18 evidence is extracted:

1. New extraction produces `assertion-vnstock-data-runtime-device-id-injection-not-required` (active).
2. Tool detects topic-tag pair `device-id-injection-required` (existing) vs `device-id-injection-not-required` (new) on the same `(capability, dimension, scope)` — semantic opposites flagged via `## Confirmation / Disproof Notes` in the new evidence file (or via topic-tag naming convention `X-required` vs `X-not-required`).
3. Hard-stop to operator: "New extracted assertion contradicts existing active assertion. Confirm supersession?"
4. On operator confirm: old entry → `status: superseded`, `superseded_by: <new-id>`; new entry → `supersedes: [<old-id>]`.
5. `n_count` increments only on the superseding entry (not the bundle).

Mechanism 2 Scope A also fires once on frozen `claim-vnstock-runtime-403-root-cause` vs the new active assertion — hard-stop unless the claim's `notes` field already records the supersession (it does, so the stop resolves immediately).

### Doc-Question Parity Check

The original claim was the answer-source for these state queries. Verify the new index answers each one without reading the claim YAML.

| Doc question | Old answer (from claim) | New answer (from index entries) |
|--------------|-------------------------|--------------------------------|
| "Does vnstock_data require Device-Id injection?" | Read claim verification + notes; reconcile original vs SUPERSEDED. | Grep `topic_tag: device-id-injection-*` → find active entry `device-id-injection-not-required`. Done in one read. |
| "What's the install-dimension state of vnstock-data in sandbox?" | Read claim.verification.install.{status, reason}. | Grep `capability: vnstock-data AND dimension: install AND status: active` → `wrapper-config-path-root` + `vendor-compat-archived`. |
| "Is vendor_compat still needed?" | Read claim.notes "vendor_compat is archived". | Read `assertion-vnstock-data-install-vendor-compat-archived` → status: active, assertion text. |
| "What HOME setting does vnstock_data need at import time?" | Not in claim (only mentioned in `verification.install.reason` as a SUPERSEDED note). | Direct entry `assertion-vnstock-data-runtime-home-env-for-api-key` → answered self-contained. |
| "What's the FastAPI Reference product-dimension status?" | claim.verification.product.status = claimed, decision_refs: []. | **Not covered by index** — product dimension is a decision-record concern (item 5 + item 8). Agent reads `records/decisions/` instead. |

Last row is the intended gap: product-dimension state intentionally lives in decisions, not in the index. The agent learns to route product queries to decisions.

### Surfaced Gotchas (Feed into Next Steps)

The walkthrough surfaces three open design points for the extraction tool spec:

1. **Cross-dimension bullets in single-dimension evidence files.** `vendor-compat-archived` is install-semantic but lives in a runtime-dimension file. Tool must decide: error-and-refuse, force-split, or trust frontmatter and tag as runtime anyway. Recommended: error-and-refuse with a clear message asking the operator to split the bullet into an install-dimension companion file. Keeps item 15's one-file-one-dimension invariant strict.
2. **Supersession detection heuristic.** The topic-tag pair `X-required` vs `X-not-required` is naming convention, not semantic guarantee. Tool must combine: (a) explicit `## Confirmation / Disproof Notes` block in the new evidence file naming the old assertion-id, and (b) optional topic-tag convention. Without (a), no auto-supersession — Mechanism 2 Scope A still triggers on the frozen claim mismatch, surfacing the question to operator.
3. **Backfill of empty frontmatter on legacy files.** `capability-revalidation-20260518.md` has no frontmatter; extraction must error until backfilled. Spec the error message to include the inferred fields (`dimension: runtime`, `scope: sandbox` from sibling files) as a suggestion the operator can paste.

These three points are inputs to the extraction-tool spec (Next Steps follow-up; operator running `/ck:plan` separately).

## Risks

| Risk | Mitigation |
|------|-----------|
| Machine extracts wrong assertion from evidence | Human writes findings clearly; `evidence_immutable_hash` detects post-extraction edits and triggers re-extraction; Mechanism 2 Scope B catches divergence |
| Query time too slow (reading N evidence files) | Index YAMLs are pre-extracted; evidence frontmatter indexed by capability+dimension; grep-first, read-narrow |
| Evidence files become bloated living documents | Split evidence per experiment; superseded evidence gets `## Supersedes` block, not edits |
| Loss of audit trail (no persistent claim) | Frozen-legacy claim YAMLs preserve historical approval audit; index entries are git-tracked; new experiments write new evidence; git history is the audit trail |
| Frozen-legacy claims become invisible to the loop | Mechanism 2 Scope A extended to compare new extracted assertions against frozen claims; contradictions hard-stop |

## Trade-off Summary

| Approach | Human Work | Machine Work | Staleness Risk |
|----------|-----------|-------------|----------------|
| Current (exp + claim + evidence) | High | Low | **High** |
| Machine-extracted index (chosen) | Medium | Medium | **None (mechanical drift detection)** |
| Search-only (no index at all) | Medium | High | None |

## Execution Plan — 4 Sessions

Below are the four plans derived from the Next Steps. They are ordered by dependency. The operator should run them as separate sessions (or `/ck:plan` invocations) because each phase gates the next and has a different review focus.

### Plan 1: Schema + Scaffolding

**Dependencies:** None. Ready to start immediately.
**Risk:** None — mechanical changes, no runtime behavior change.
**Session scope:** One commit, one review round.

- Author `records/decisions/decision-<ts>-claim-deprecation.md` declaring the claim schema deprecated for new entries (cites this brainstorm as basis).
- Annotate `schemas/claim.schema.json` with top-level `deprecated: true` + `description` pointing at the decision.
- Create `schemas/index-entry.schema.json` from the Index Entry Schema example (add `schema_version`, type enums, field patterns). `schemas/` must know about the new record type before the extraction tool writes it.
- Create `records/index/` directory.
- Extend `tools/validate-records/` (loader + rules) to recognize `records/index/` YAMLs and validate them against the new schema.
- Update `docs/record-system-architecture.md`:
  - Add `records/index/` as a load-bearing entity in the core hierarchy.
  - Note that claims are frozen as legacy reference (no new entries); state queries route to `records/index/`.
  - Preserve frozen-legacy claims as read-only audit trail.

**Status:** Completed 2026-05-19 — decision record authored (`decision-260519T1400Z-claim-deprecation`), claim schema deprecated (`deprecated: true`), index-entry schema created (`schemas/index-entry.schema.json`), validator plumbing extended (shared `schema-loader.js`, `records/index/` in loader, `extracted-assertion` validation path), docs updated (`docs/record-system-architecture.md`).

**Decision deltas from red-team/validation:**
- `decision_effect.action` changed from `deprecate` to `supersede` (matches decision schema enum).
- `decision_effect.scope` changed from `records` to `schema-improvement` (matches decision schema enum).
- `source_refs` to `plans/reports/` moved to `affected_refs` (avoids local-path validation failure on `source_refs`).
- Schema filename `index-entry.schema.json` mapped to type `extracted-assertion` via explicit mapping object in shared `schema-loader.js` (replaces array-map pattern).
- `superseded_by` typed as `["string", "null"]` (accepts null for active entries).
- `experiment_refs` schema carries `pattern: "^record:.+"`.
- Bare IDs (no `record:` prefix) in `superseded_by` and `supersedes` accepted as by-design convention.

**Acceptance criteria:** `pnpm check` passes on all unchanged files + the new schema loads without errors.

### Plan 2: Extraction Tool

**Dependencies:** Plan 1 (schemas, directory, validator plumbing).
**Risk:** Medium — new tool, new parsing convention, first time extraction runs.
**Session scope:** One commit for spec, one commit for implementation, one review round.

- Spec the tool under `tools/extract-index/`. Recommended interface: `node tools/extract-index/extract-index.js --capability <name>` or run over all `records/evidence/`.
- Inputs:
  - Read `records/evidence/**/*.md` for `## Findings` sections.
  - Read frontmatter for `capability`, `dimension`, `scope`, `validation_status`.
  - Read `records/experiments/` for `experiment_refs` linkage.
- Outputs:
  - Write `records/index/assertion-<capability>-<dimension>-<topic-tag>.yaml`.
  - Compute `evidence_immutable_hash` per file and store in `extraction` block.
- Resolve the three open gotchas surfaced in the Worked Example (see Unresolved Questions below):
  1. **Cross-dimension bullets** — error-and-refuse if a `## Findings` bullet's dimension conflicts with the evidence file frontmatter.
  2. **Supersession detection** — combine explicit `## Confirmation / Disproof Notes` block (naming old assertion-id) + optional topic-tag naming convention (`X-required` vs `X-not-required`). Without an explicit disproof note, never auto-supersede; rely on Mechanism 2 Scope A hard-stop.
  3. **Frontmatter backfill** — when a legacy evidence file lacks frontmatter, error with a message including inferred-field suggestions (derived from sibling files or operator input).
- Optionally wire `pnpm extract:index` into `package.json` scripts.
- Add tests for the three gotchas and a round-trip test (evidence markdown → index YAML → validation against schema).

**Acceptance criteria:** Tool runs clean on evidence files that already have `## Findings`; produces valid YAMLs per Plan 1 schema; `pnpm check` passes.

**Status:** Completed 2026-05-19 — `tools/extract-index/` implemented with 6 modules (all under 200 lines), 3 test files (38 tests), `pnpm check` at 139 pass / 0 fail.

**Decision deltas from red-team/validation:**
- Parser strategy: line-based scanner for `## Findings` bullets; no markdown AST library (remark/unified overkill for a single rigid section). Zero new npm dependencies.
- Frontmatter splitter: line-based `---` split skipping fenced-code-block delimiters; manual code-block state tracking.
- Hash format: SHA-256 via `node:crypto` on raw Buffer; `sha256:<hex>` format.
- Pre-write aggregation: in-memory map keyed by assertion ID merges `source_refs` across evidence files and computes `n_count` as `merged_source_refs.length`.
- Supersession: never auto-supersede without explicit `## Confirmation / Disproof Notes` naming the old assertion-id; hard-stop to operator otherwise.
- Frontmatter strictness: missing `capability`, `dimension`, `scope`, or `validation_status` errors with inferred suggestions derived from sibling files in the same evidence directory.
- `context: null` omitted from index entry when evidence has no `Context:` nested bullet (schema requires `string`, not nullable).
- `validateFrontmatter` enforces capability pattern `[a-z0-9-]+`, dimension in enum, validation_status in enum — prevents path traversal and schema-invalid IDs.
- `main()` guarded with `import.meta.url === process.argv[1]` so module import for tests does not trigger CLI execution.

### Plan 3: Migration Execution

**Dependencies:** Plans 1 and 2.
**Risk:** Low-Medium — touches evidence files (human-authored), first real extraction run.
**Session scope:** 2–3 commits (one per prototype seed), one review round.

**Prototype seed #1 — `claim-vnstock-runtime-403-root-cause` (stress-tests N counting + supersession):**
- Human writes `## Findings` into the relevant evidence files, per the Worked Example section above.
- Create new evidence file `records/evidence/vnstock-data/wrapper-config-path-fix-20260511.md` (`dimension: install`).
- Backfill frontmatter on `records/evidence/vnstock-data/capability-revalidation-20260518.md`.
- Run extraction tool.
- Verify doc-question answers against the Parity Check table in the Worked Example.
- Confirm supersession flow works: old `device-id-injection-required` entry gets `status: superseded`, new `device-id-injection-not-required` gets `status: active`.

**Prototype seed #2 — `claim-vnstock-install-sandbox` (stress-tests multi-dimensional assertions across capability scripts):**
- Same process: identify bundled assertions, write `## Findings` into relevant evidence files, run extraction tool, verify.
- This seed is intentionally fuzzier because the claim touches install, runtime, and product dimensions — it tests whether the one-file-one-dimension rule holds and whether cross-dimension bullets are caught.

**Acceptance criteria:** All new index entries validate against Plan 1 schema; doc-parity table passes; `pnpm check` passes; git diff is reviewable (evidence markdown + index YAMLs only; no claim file edits).

**Status:** Completed 2026-05-19 — prototype seed #1 executed (evidence files updated with `## Findings`, extraction tool ran, 24+ index entries generated including supersession pair `device-id-injection-required` → `device-id-injection-not-required`); prototype seed #2 deferred to lazy migration (seed #1 proved the pattern); `pnpm check` passes.

**Decision deltas from implementation:**
- Cross-dimension bullet in `capability-revalidation-20260518.md` (`vendor-compat-archived` appearing in runtime-dimension file) was flagged by extraction tool and deferred to lazy migration per one-file-one-dimension rule.
- All 10 frozen-legacy claim YAMLs remain untouched in `records/claims/`.

### Plan 4: Deprecation + Docs Canonicalization

**Dependencies:** Plan 3 validated (prototype seeds pass parity check; extraction tool stable).
**Risk:** None — editorial.
**Session scope:** One commit, no review gate required.

- Update `docs/philosophy.md` and `docs/operator-guide.md` to canonicalize the new conventions:
  - Evidence files get `## Findings` for machine extraction.
  - Claims are legacy-only; index is the live assertion store.
  - State queries route to `records/index/` first.
- Remove any "claim-first" language that implies claims are still the primary state store.
- If Prototype seed #2 surfaces new assertions that affect `docs/` (e.g., install-dimension findings that should inform operator guide), patch docs.
- Close out any lingering `plans/` artifacts: mark this brainstorm complete.

**Acceptance criteria:** No stale references to "claims as primary state" remain in `docs/`; `pnpm check` passes.

**Status:** Completed 2026-05-20. All 4 phases executed: philosophy.md and operator-guide.md rewritten to index-first; artifact-reference.md updated with index-entry schema table and deprecation banner; brainstorm marked complete; stale-reference check passes; `pnpm check` passes (136/136). See `plans/260519-2326-docs-canonicalization-machine-extracted-index/` for full implementation details.

### Plan 5: Mechanical Enforcement Gap Closure (G1 + G2)

**Dependencies:** Plans 1–4. Surfaced during 2026-05-20 post-implementation review.
**Risk:** Medium — touches the extraction tool's hot path; supersession write-back changes index entry shape on regeneration.
**Session scope:** One commit per gap, one review round.

**Gap G1 — Supersession write-back not implemented:**
- `tools/extract-index/index-entry-builder.js:45-46` hard-codes `superseded_by: null` and `supersedes: []` on every build. `checkSupersession()` in `extract-index.js:159` emits errors but never patches entries.
- The active pair `device-id-injection-required` ↔ `device-id-injection-not-required` carries linked fields only because they were hand-edited, which violates item 9 ("agent-derived, never hand-edited") and Mechanism 1 ("agent cannot write index without confirming the human artifact").
- Fix: when a `## Confirmation / Disproof Notes` block names an old assertion-id, the tool must write `superseded_by: <new-id>` on the old entry and `supersedes: [<old-id>]` on the new entry as part of the same extraction pass. Without an explicit disproof note, retain the existing hard-stop (Mechanism 2 Scope C unchanged).
- Verification: regenerate index from the two prototype-seed evidence files and confirm the supersession pair is reproduced byte-for-byte from extraction (no manual edits required).

**Gap G2 — Mechanism 2 Scope A (frozen-claim drift) is not enforced:**
- No code in `tools/` references `records/claims/` or compares new extracted assertions against frozen claim text. The brainstorm's promised hard-stop ("Mechanism 2 Scope A extended to compare new extracted assertions against frozen claims; contradictions hard-stop") does not exist.
- Fix: extend the extraction tool (or add a sibling audit step in `tools/validate-records/`) to load all `records/claims/*.yaml`, scan each frozen claim's `assertion` / `verification.*.reason` for topic-tag matches against newly-extracted entries with semantic-opposite naming (`X-required` vs `X-not-required`) on the same `(capability, dimension)` pair. On hit, hard-stop with a message naming both records unless the frozen claim's `notes` field already records the supersession.
- Verification: the `claim-vnstock-runtime-403-root-cause` ↔ `device-id-injection-not-required` pair must resolve cleanly (frozen claim's notes already record the change); any new contradiction without a recorded supersession must hard-stop with a reproducible error.

**Acceptance criteria:**
- Re-running `pnpm extract:index` over the current evidence corpus produces byte-identical `superseded_by` / `supersedes` fields on the existing supersession pair without any hand-edit.
- A synthetic test case with a contradiction against a frozen claim (no `notes` supersession record) triggers a hard-stop with a non-zero exit code.
- `pnpm check` passes; new tests cover both gaps.

**Status:** Completed 2026-05-20. Both gaps closed with TDD: supersession write-back now mutates `supersedes` on new entries and `superseded_by`/`status` on old entries during extraction (file-scoped disambiguation when multiple findings share an evidence file); frozen-claim drift hard-stops on topic-tag opposition unless `notes` records `SUPERSEDED` or names the new assertion-id. Existing `device-id-injection-*` pair regenerates with correct supersession fields without hand-editing; synthetic drift fixture confirmed hard-stop; `pnpm check` passes 144/144. See `plans/260520-1530-machine-extracted-index-enforcement-gaps/` and new module `tools/extract-index/frozen-claim-drift.js`.

### Plan 6: Residual Docs Index-First Conversion (G4 + G5)

**Dependencies:** Plan 4 (philosophy + operator-guide + artifact-reference partially converted). Plan 5 not required (editorial only).
**Risk:** None — editorial.
**Session scope:** One commit, no review gate required.

**Gap G4 — `docs/artifact-reference.md` half-converted:**
- Line 392 explicitly notes: "This document remains predominantly claim-centric. Full index-first parallel sections (Dimension Overview for extracted assertions, Experiment Proof mapping for index entries, Product Decision routing) are a future documentation enhancement beyond the current canonicalization plan."
- Fix: author the parallel index-entry sections (Dimension Overview, Experiment Proof mapping, Product Decision routing) so the document is no longer claim-centric. Move claim-centric sections behind the deprecation banner without deleting them (frozen-legacy audit value).

**Gap G5 — Five docs still reference claims as live:**
- `docs/charter.md` (2 mentions), `docs/record-system-architecture.md` (11), `docs/problem-classification.md` (4), `docs/red-team-review.md` (9), `docs/vendor-vnstock-installer.md` (5).
- Fix: walk each file; replace "claim" with "index entry" / "extracted assertion" / "frozen-legacy claim" as semantically correct. The state-query routing language in `record-system-architecture.md` is the highest priority because operator-guide and philosophy now point readers there.

**Gap G7 — Vendor-doc snapshot mislabelled as evidence (deferred reclassification, marker only):**
- `records/evidence/vnstock-data/unified-ui-snapshot/` is a machine-refreshed copy of upstream `vnstock-hq/vnstock-agent-guide` docs pinned by commit, not human-authored findings. It fits none of the three territories cleanly (not `docs/`, not human-authored evidence, not YAML).
- The extraction tool already ignores it (no `## Findings`, no frontmatter), so the mismatch is conceptual not mechanical. A full territory move to `records/vendor-references/` is deferred until autonomous doc-ingestion work begins (see `docs/trajectory.md` bridge 1) — by then the right shape will be informed by more than one vendor.
- Fix (cheap insurance): add `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md` (two-line marker) stating the subtree is a vendor documentation snapshot, ignored by the extraction tool, queued for reclassification when bridge 1 starts. No refresh-tool change, no validator change, no territory restructure.

**Acceptance criteria:**
- No doc outside `records/claims/` and the deprecation banner contexts says claims are the primary state store.
- `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md` exists and names the subtree's true class.
- `pnpm check` passes.
- Cross-document references between philosophy, operator-guide, artifact-reference, and record-system-architecture remain consistent on the index-first routing rule.

**Status:** Planned 2026-05-20.

## Unresolved Questions

All four originally-listed Qs (Q1–Q4) are resolved by items 11 (Q2), 13 (Q4), 14 (Q1), and 15 (Q3).

All originally open design points were resolved during Plan 2 implementation:

1. **Cross-dimension bullets in single-dimension evidence files** — error-and-refuse with inferred-field suggestions derived from sibling files (`validateFrontmatter` enforces capability pattern `[a-z0-9-]+`, dimension in enum, validation_status in enum).
2. **Supersession detection heuristic** — never auto-supersede without explicit `## Confirmation / Disproof Notes` naming the old assertion-id; hard-stop to operator otherwise. Pre-write aggregation merges `source_refs` by assertion ID and computes `n_count`.
3. **Frontmatter backfill on legacy files** — error message includes inferred suggestions derived from sibling files in the same evidence directory.

---

**Worked example (done; embedded above):** `claim-vnstock-runtime-403-root-cause` migration is fully sketched in the "Worked Example" section. Surfaces the three design points for the extraction tool listed above.

## Completion Status

- **Plan 1 (Schema + Scaffolding):** Completed 2026-05-19.
- **Plan 2 (Extraction Tool):** Completed 2026-05-19.
- **Plan 3 (Migration Execution):** Completed 2026-05-19. Prototype seed #2 (`claim-vnstock-install-sandbox`) deferred to lazy migration — multi-dimensional invariant remains partially unproven outside the runtime/install split seed #1 happened to exercise.
- **Plan 4 (Deprecation + Docs Canonicalization):** Completed 2026-05-20. See `plans/260519-2326-docs-canonicalization-machine-extracted-index/`.
- **Plan 5 (Mechanical Enforcement Gap Closure — G1 + G2):** Completed 2026-05-20. Both gaps closed via TDD; see `plans/260520-1530-machine-extracted-index-enforcement-gaps/`.
- **Plan 6 (Residual Docs Index-First Conversion — G4 + G5):** Planned 2026-05-20. Completes artifact-reference index-entry parallel sections and converts remaining 5 docs.
