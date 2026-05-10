# Capability Allowlist Deferred Axes

This meta evidence documents three loop-architecture extensions that were considered for the capability source-ref allowlist and explicitly deferred. It is not a domain fact.

## Framing

The capability-record source-ref allowlist (`product/*/capabilities`, capability-records only) was scoped to the minimum needed to admit one stack (`api`) and pre-declare a second (`web`). Three axes for further widening were evaluated and deferred. Each carries an explicit revisit trigger so the deferral is retrievable, not invisible.

## Axis 1: Glob expressiveness beyond `product/*/capabilities`

### Considered
- Multi-segment wildcards (`product/**/capabilities`).
- Character classes (`product/{api,web,mobile}/capabilities`).
- Suffix patterns matching capability files directly (`product/*/capabilities/**/*.py`).

### Decision
Single-segment `*` only. Patterns are prefix-of-segments, not full-path globs. Capability records cite full file paths under the matched prefix; the validator checks the prefix admits the path.

### Rationale
N=1 stack today, N=2 imminent (`web`). Multi-segment patterns introduce regex/glob library coupling and edge cases (`..` traversal under `**`) that single-segment match avoids. Existing `realpathSync` resolves all path operations before match, so prefix match is safe.

### Revisit Trigger
A capability surface needs to live more than two segments below its stack root (e.g., `product/api/legacy/capabilities/...` or `product/web/packages/widgets/capabilities/...`). At that point evaluate whether the layout should change to fit the existing matcher, or whether `**` is genuinely required.

## Axis 2: `stack` field as enum vs open-string

### Considered
- Open-string (`api`, `web`, future `mobile`, `desktop`, anything).
- Enum constrained to currently-known stacks.
- Enum derived at validation time from `product/<X>/` directory existence.

### Decision
Open-string. Reviewers gate stack legitimacy via the stack-manifest convention (every `product/<stack>/` must contain a stack manifest like `pyproject.toml` or `package.json`).

### Rationale
Adding a stack today requires zero schema or validator change. Enum constraint would require schema edits in lockstep with new stacks, replicating the `n-equals-one-gap-class` anti-pattern of locking convention before friction. The cost of a mistyped stack name is a dangling capability record caught in PR review, not a runtime escape.

### Revisit Trigger
A stack typo (e.g., `appi` instead of `api`) ships to main and a capability record under the typo'd path validates green. At that point evaluate whether enum constraint or stack-directory cross-check earns its keep.

## Axis 3: Stack-manifest enforcement at the validator level

### Considered
- Validator checks `product/<X>/` contains a known stack manifest before allowing capability paths under it.
- Multi-ecosystem manifest detection (`pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, etc.).
- Per-stack `.stack-manifest` marker file authored by reviewers.

### Decision
Documentation-only. The convention is captured in `docs/operator-guide.md` "Stacks and Capability Locations" and in the migration brainstorm. Reviewers gate orphan directories in PR.

### Rationale
Validator manifest detection couples the loop validator to ecosystem-specific package conventions. The validator stays loop-shaped: it understands records, refs, schemas. Manifest detection drifts it toward language-aware tooling.

The current risk surface is small: an orphan `product/<X>/` directory with no manifest but a capability record citing files under it would pass the glob match but be visibly anomalous in PR (no stack manifest = nothing to install = capability scripts non-runnable).

### Revisit Trigger
Two or more PRs ship orphan capability directories without reviewer flags catching them. At that point promote the convention to validator enforcement (Approach C from the migration brainstorm).

## Common Pattern

All three axes share the same shape: lock the minimum that admits today's two stacks; document what would un-defer each axis; trust the loop's PR-review gate for orphan cases. The deferrals are deliberate, not lazy — promoting any of them today violates YAGNI/KISS without observed friction.
