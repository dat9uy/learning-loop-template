---
capability: meta
dimension: install
scope: meta-tooling
validation_status: draft
---

# Install Experiment Template Candidate

## Findings

- [install-template] Candidate derived from convergence of 4 vnstock install evidence MDs; 3 of 4 converge on stable 7-section body envelope.
- [evidence-envelope] Required body sections: Summary, Substrate, Steps Executed, Observations, Sanitized Installer Output, Disproof/Confirmation Notes, Source.
- [frontmatter-keys] Canonical frontmatter requires 11 keys: record_type, capability, dimension, scope, validation_status, claim_support, secret_injection_class, installer_url_class, static_dimension_consistency, created, substrate.
- [promotion-gated] Candidate not canonical until validated against next non-vnstock install experiment via meta-experiment.
- [authoring-boundaries] No credentials, API keys, raw vendor data, host-identifying values in any section except sanitized output.

Status: draft (candidate). Pending validation against the next non-vnstock install experiment via `experiment-meta-install-template-candidate-260512T0046Z`. Do not cite this template as canonical until the meta-experiment passes and a follow-up decision promotes it.

Status: draft (candidate). Pending validation against the next non-vnstock install experiment via `experiment-meta-install-template-candidate-260512T0046Z`. Do not cite this template as canonical until the meta-experiment passes and a follow-up decision promotes it.

This candidate was derived from the convergence of 4 vnstock install evidence MDs (3 of 4 converge on a stable 7-section body envelope plus 11-key YAML frontmatter; the 4th, `experiment-install-20260508T101723Z.md`, predates the convention and is treated as legacy outlier). The convergence analysis lives in `plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md`. The gap motivating this artifact is `records/evidence/meta/install-experiment-template-gap.md`.

## Scope

This template covers the **markdown evidence file** authored under `records/evidence/<capability>/experiment-install-<TIMESTAMP>[-<case-label>].md`. The paired experiment YAML under `records/experiments/` is governed by `schemas/experiment.schema.json` and is **out of scope** for this template.

## Canonical Frontmatter

The frontmatter is YAML between two `---` fences at the top of the file. All keys below are required; values use the documented value-class for each key. No host-identifying details, no credentials, no raw vendor data.

```yaml
---
record_type: evidence
capability: <domain-slug>                       # kebab-case capability id (e.g. <data-pack>, <vendor>-data)
dimension: install
scope: <sandbox|production>
validation_status: <passed|passed-with-warning|failed>
claim_support: <supports|does-not-support|inconclusive>
secret_injection_class: <e.g. api-key-via-shell-env-var|none>
installer_url_class: <e.g. vendor-official-download|local-artifact>
static_dimension_consistency: <evaluated|not-evaluable>
created: "<ISO-8601 UTC>"
substrate: <substrate-class-slug>               # e.g. fresh-docker-container-python-3-11-slim
---
```

## Required Body Sections (7)

Each section is required for every non-legacy install experiment. Order is fixed; section names are stable.

### `## Summary`

One paragraph stating the install outcome at the claim level. State whether the claim is supported, refined, or disproved. Do not include flag lists, command transcripts, or vendor copy here — those belong in later sections.

### `## Substrate`

Bulleted list describing the substrate by class, not by identifying value. Required fields:

- temp root class (e.g. `os-temp-outside-repo`, `container-local`)
- temp root path class (e.g. `/tmp/<project-slug>-<random>` — pattern only)
- runner venv (purpose + the prerequisite class(es) installed in it; do not list pinned package versions unless versions are part of the claim under test)
- installer-created venv path class
- installer SHA-256 (literal digest; the digest itself is not sensitive)
- cleanup status (`succeeded` or `failed-with-residue`)
- temp root deleted (`true` or `false`)

### `## Steps Executed`

Numbered list. Each step is a command class plus the operator-visible outcome. Use class-level descriptions ("Downloaded installer from official vendor URL class"), not literal command lines that would leak host paths. Never include secret values, even redacted; refer to them by env-var name.

### `## Observations`

Bulleted list. Each bullet is a single fact class paired with a verdict. Cover at minimum: env-var pre-flight result, archive operations, installer exit code class, vendor registration result, package install outcome, import smoke test outcome, temp-file secret audit result. Do not narrate; one fact per bullet.

### `## Sanitized Installer Output`

Fenced code block (` ```text `). Contains only sanitized status lines from the installer. Redact:

- API keys, tokens, session ids
- device fingerprints / kernel strings / hardware ids
- absolute host paths (replace with class placeholders)
- vendor account identifiers
- any raw vendor data response payloads

Include `installer_exit=<code>` near the top so the exit class is unambiguous.

### `## Disproof / Confirmation Notes`

Bulleted list. Each bullet ties one observation back to the claim under test using the verbs: `confirms`, `refines`, `disproves`, or `does-not-support`. This is the section claim-verification cites when promoting evidence; it must stand alone without the reader reverse-engineering the Observations list.

### `## Source`

Bulleted, fixed shape:

- Operator: <local|named-collaborator>
- Plan: `plans/<plan-dir>/`
- Phase: <integer or section anchor>

## Optional Body Sections (4)

Include only when the triggering condition holds. Mark each instance with its trigger inline so reviewers can audit the inclusion decision.

### (Optional) `## Static Dimension Consistency`

**Trigger:** A reference snapshot exists for the capability (`records/evidence/<capability>/unified-ui-snapshot/...` or equivalent) AND the runtime artifact is inspectable. Without both, omit.

Required content when included: reference snapshot path + upstream commit, runtime shape (or `not evaluable`), divergence list.

### (Optional) `## Process-Side Findings`

**Trigger:** The installer touches host state outside its declared boundary — e.g. writes config files even when env-var driven, mutates host PATH, writes to user-home outside the temp root, registers with a vendor service. Without observed side-effects beyond the declared boundary, omit.

Required content: bulleted list of side-effects, each tagged with the boundary it crossed.

### (Optional) `## Supersedes`

**Trigger:** The experiment empirically replaces a prior note, prior evidence MD, or prior claim text. Without explicit supersession, omit (and do not retroactively reframe prior records).

Required content: bulleted list of `local:` refs to the superseded artifacts, each paired with a one-line note describing what was empirically replaced.

### (Optional, legacy) `## Allowed Outputs Captured` + `## Blocked Outputs`

**Trigger:** The experiment predates the convention of expressing output policy in the paired experiment YAML's `output_capture` block. Current convention absorbs this pair into the YAML record; only retain in the markdown when re-classifying legacy evidence.

If included, both sub-sections appear together. If the paired YAML expresses `output_capture`, omit both from the markdown.

## Authoring Boundaries

This file class is **meta-evidence neighbour** (when used by an author) or **meta-evidence artifact** (this file itself). In either role:

- No credentials, no API keys, no session tokens (even redacted) inline outside `## Sanitized Installer Output`.
- No raw vendor data, no raw external API responses.
- No raw installer logs — only sanitized status lines.
- No private artifacts (operator notes, internal commentary on people, business decisions).
- No host-identifying values: kernel string, hardware id, absolute home path, hostname.

If a fact only makes sense with a forbidden value present, refer to the value by class name and cite where the verifying record lives (e.g. "the installer-created venv path matched the configured `VNSTOCK_VENV_PATH` env var — verified in the operator's local notes outside the ledger").

## Promotion Path

1. Author writes a non-vnstock install experiment using this candidate as the source.
2. Meta-experiment `experiment-meta-install-template-candidate-260512T0046Z` re-evaluates fit against the new case.
3. If the candidate fits without forcing case-specific add-ons into the required set, a follow-up decision promotes the template to canonical (possible new home: `docs/templates/install-experiment-template.md` or successor location chosen at promotion time).
4. If the candidate does not fit, the meta-experiment captures the deviation, the template is revised, and the cycle repeats on the next install experiment.
