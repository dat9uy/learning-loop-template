---
phase: 2
title: "Dispatch Tool — meta_state_dispatch_finding"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Dispatch Tool — meta_state_dispatch_finding

## Overview
Add a new MCP tool `meta_state_dispatch_finding` with two modes — **prepare** and **commit** — that coordinate with the agent to route a fixable finding to a GitHub Issue. The **core tool does not access GitHub** (two-surfaces: the deterministic core does no external side effects); the **agent** runs `gh issue create` as a Bash command. The tool prepares the issue body (prepare), and after the agent creates the issue, records the `dispatch-<finding_id>` ledger event + patches the finding's `ledger_ref` back-pointer (commit). Idempotent at both modes via a ledger scan. Operator-gated on commit; prepare is read-only/ungated. One-way derivation: finding → issue → resolve-on-close.

## Requirements
- Functional: `prepare({id})` returns the issue title/body + citation, refusing (returning existing coords) if a `dispatch-<id>` ledger row already exists. `commit({id, issue_number, issue_url, repo})` writes the ledger event (via shared `appendLedgerEvent` helper) + patches `ledger_ref` to `dispatch-<id>` (CAS), refusing if `ledger_ref` is set or a `dispatch-<id>` row exists with DIFFERENT coords (returns existing coords). The issue body cites `local:meta-state:<id>`.
- Non-functional: **no `gh` spawn in the core tool** (the agent runs `gh`); idempotent via ledger scan (handles orphan-retry AND concurrent races); CAS-protected patch (`_expected_version`); commit is operator-gated (`OPERATOR_MODE`); `gh` failure handling is an agent-side concern (the agent checks `gh`'s exit code before calling commit); the shared `appendLedgerEvent` helper is extracted from `runtime-state-record-tool.js:59-76` (DRY).

## Architecture
**Two-surfaces split (per operator correction 2026-07-04):** the deterministic core (MCP tools) does no external side effects; the agentic runtime (the agent) runs `gh`. So the dispatch is a **protocol** between the agent and the tool, not a single spawning tool:

1. **Agent calls `meta_state_dispatch_finding({id, stage:"prepare"})`.** The tool validates the finding, scans `runtime-state.jsonl` for an existing `dispatch-<id>` row (idempotency), and if none, builds the issue title + body (id, category, severity, affected_system, evidence_code_ref [repo-relative, no redaction], description, `local:meta-state:<id>` citation). Returns `{finding_id, issue_title, issue_body, coord_repo_hint}`. Read-only — no write, ungated.
2. **Agent runs `gh issue create --json number,url --repo <coord-repo> --title "<title>" --body "<body>"`** as a Bash command. The bash gate (`hooks/legacy/bash-gate.js:27`) intercepts the agent's Bash tool; `gh` is NOT in `core/patterns.json` constraints (`docker|sudo|package-manager|vendor-api|side-effect-import`) → returns `ok` (passes). The agent checks `gh`'s exit code + stdout before proceeding (agent-side failure handling).
3. **Agent calls `meta_state_dispatch_finding({id, stage:"commit", issue_number, issue_url, repo})`.** The tool re-checks idempotency (ledger scan), writes the `dispatch-<id>` ledger event (via `appendLedgerEvent`) holding `{issue_number, issue_url, repo, dispatched_by, dispatched_at, finding_id, delegated_to}`, and patches the finding's `ledger_ref` to `dispatch-<id>` (CAS via `updateEntry`).

**Idempotency (handles H1 orphan-retry + H2 concurrent-race):** both modes scan `runtime-state.jsonl` for a row with `id === "dispatch-<finding_id>"` BEFORE acting. Prepare: if found, return its `metadata.issue_number`/`issue_url` (no re-prepare, agent does NOT re-run `gh`). Commit: if a row exists with the SAME coords → no-op success; if a row exists with DIFFERENT coords → refuse (`already_dispatched`, return existing coords); only if NO row → write + patch. `runtime-state.jsonl` is append-only with no uniqueness check (scout confirmed `runtime-state-record-tool.js:76` `appendFileSync`) — so the ledger scan is the dedupe, not the id.

**Disclosure mitigation (procedural, not tool-level):** with the tool not calling `gh`, there is no `LOOP_DISPATCH_REPO` env var. The agent/operator chooses `--repo` at dispatch time. The Rec 10 surfacing prompt (Phase 3) instructs: "dispatch to a **private coordination repo**; agent proposes, operator dispatches." The operator's authority (R3) is the boundary — the agent proposes, the operator picks the repo + authorizes. If dispatch-to-public is ever enabled, the operator edits the description to a non-exploitable summary before create (content gate, not a path-redaction step; `evidence_code_ref` is repo-relative and already as public as the tree).

**`ledger_ref`** (finding schema `core/meta-state.js:108`, patchable — NOT in `IMMUTABLE_PATCH_FIELDS` `:274-285`) is set to the bare ledger-event id `dispatch-<finding_id>` via `updateEntry(root, finding_id, { ledger_ref, _expected_version: version })` (CAS at `:573-577`).

## Related Code Files
- Create: `tools/learning-loop-mastra/tools/legacy/meta-state-dispatch-finding-tool.js` — export `metaStateDispatchFindingTool`; template `meta-state-ack-tool.js`. One tool, `stage` param (`"prepare"|"commit"`). Return shape `{ content: [{ type:"text", text: JSON.stringify(result) }] }` (unwrapped by `legacy-handler-adapter.js:12-26`).
- Modify: `tools/learning-loop-mastra/tools/manifest.json` — add one entry: `{ "file": "tools/meta-state-dispatch-finding-tool.js", "export": "metaStateDispatchFindingTool", "pathFields": [] }`. JSONC: full-line `//` comments only, **no trailing commas**.
- Modify (shared helper): extract `appendLedgerEvent(root, entry)` from `tools/legacy/runtime-state-record-tool.js:59-76` (append + fingerprint path) into `core/runtime-state.js` (or a new `core/ledger.js`); call from both the record tool and the dispatch commit step. Removes per-dispatch preflight friction.
- Read-only: `tools/learning-loop-mastra/core/meta-state.js` (`updateEntry` `:573-599`, `IMMUTABLE_PATCH_FIELDS` `:274-285`, finding `ledger_ref` `:108`).
- Read-only: `tools/learning-loop-mastra/core/patterns.json` (no `gh` constraint — confirmed; the agent's `gh` call passes the bash gate). Do NOT route `gh` through `core/verification-runner.js` (its `VERIFY_ALLOWLIST` excludes `gh`).
- Create: tests — prepare builds body + idempotent-returns-existing-coords; commit writes ledger + patches `ledger_ref` + refuses duplicate coords; non-operator commit refused; concurrent-race (two commits, same id) → first wins, second gets `already_dispatched`.

## Implementation Steps (TDD — tests first)
1. **Test first (red):** prepare test — `meta_state_dispatch_finding({id, stage:"prepare"})` on an undispatched finding returns `{finding_id, issue_title, issue_body}` with the body containing `local:meta-state:<id>`; no ledger row, no `ledger_ref` change (read-only). Run; fails (no tool).
2. **Create the tool + manifest entry.** No `server.js` edit (dynamic import at `server.js:44-60`). Schema: `id` (required), `stage` (enum `prepare|commit`, default `prepare`), and commit-only params `issue_number` (number), `issue_url` (string), `repo` (string), optional `delegated_to`.
3. **Prepare handler:** validate finding exists + is a finding; scan `runtime-state.jsonl` for `id === "dispatch-<id>"` — if found, return `{dispatched:false, reason:"already_dispatched", issue_number:<from metadata>, issue_url:<from metadata>}` (idempotent — agent does NOT re-run `gh`); else build the title/body and return `{finding_id, issue_title, issue_body, coord_repo_hint:"<private coordination repo>"}`. Read-only, ungated.
4. **Test first (red):** commit test — `meta_state_dispatch_finding({id, stage:"commit", issue_number:42, issue_url:"...", repo:"..."})` writes a `dispatch-<id>` ledger event (via `appendLedgerEvent`) holding the coords + `delegated_to`, and patches the finding's `ledger_ref` to `dispatch-<id>` (CAS). Run; fails.
5. **Extract `appendLedgerEvent` helper** from `runtime-state-record-tool.js:59-76` into `core/runtime-state.js` (append + `fingerprint` = `sha256:` over `id|source_ref|value|delta|timestamp` + `status:"active"`). Refactor `runtime_state_record` to call it. Add a test that the record tool still works (regression).
6. **Commit handler:** operator-gate (`OPERATOR_MODE === "1" || "true"`; else `{dispatched:false, reason:"operator_role_required"}`). Re-scan the ledger for `dispatch-<id>`: if a row exists with the SAME coords → no-op success; if with DIFFERENT coords → `{dispatched:false, reason:"already_dispatched", existing_issue_number, existing_issue_url}` (refuse duplicate); if NO row → `appendLedgerEvent({kind:"ledger-event", affected_system:"meta-state-tools", id:"dispatch-<id>", source_ref:"local:meta-state:<id>", value:null, delta:null, timestamp, metadata:{issue_number, issue_url, repo, dispatched_by, dispatched_at, finding_id, delegated_to}})`. Then read the finding's `version` and `updateEntry(root, id, { ledger_ref:"dispatch-<id>", _expected_version: version })`; on `version_mismatch`, retry once with a fresh version.
7. **Test first (red):** idempotency tests — (a) re-prepare after a ledger row exists returns existing coords (no new body build); (b) re-commit with same coords → no-op; (c) commit with different coords after a row exists → refused, returns existing; (d) non-operator commit → `operator_role_required`. Run → green.
8. **Test first (red):** concurrent-race test — two commit calls (same `id`, same coords) in sequence; first writes, second is a no-op (same coords) OR `already_dispatched` (different coords). Verify ONE ledger row, ONE `ledger_ref`. Run → green.
9. **Orphan path:** if `updateEntry` fails after the ledger event is written (both retries), the ledger row is orphaned (issue exists, no back-pointer). The next prepare/commit scan finds the `dispatch-<id>` row and returns its coords — so the orphan is **self-healing** (the agent re-commits with the same coords, the no-op path fires, and `ledger_ref` gets patched on retry). Document this; no separate cleanup query needed.
10. **Verify:** `pnpm test` green; manifest JSONC valid (no trailing comma). Manual: agent prepare → `gh issue create --repo <private-coord-repo>` → commit; `gh issue view <n> --json` confirms the body citation and the finding's `ledger_ref` resolves to the ledger event.

## Success Criteria
- [ ] `prepare({id})` builds the issue body with `local:meta-state:<id>`; read-only (no ledger/`ledger_ref` change); idempotent (returns existing coords if `dispatch-<id>` row exists).
- [ ] `commit({id, issue_number, issue_url, repo})` writes the `dispatch-<id>` ledger event (via `appendLedgerEvent`) + patches `ledger_ref` (CAS); operator-gated.
- [ ] Re-commit with same coords → no-op; with different coords → refused, returns existing (idempotent via ledger scan).
- [ ] Concurrent-race → ONE ledger row, ONE `ledger_ref` (first-write-wins via ledger scan, not via id uniqueness).
- [ ] Non-operator commit → `operator_role_required`; prepare is ungated.
- [ ] **No `gh` spawn in the core tool**; the agent runs `gh issue create` (bash-gated, passes).
- [ ] Shared `appendLedgerEvent` helper extracted; `runtime_state_record` still works (regression test green).
- [ ] Orphan path self-heals (next prepare/commit finds the `dispatch-<id>` row and patches `ledger_ref`).
- [ ] `pnpm test` green; manifest JSONC valid.

## Risk Assessment
- **High — duplicate dispatch via orphan-retry or concurrent race.** Mitigation: both modes scan the ledger for `dispatch-<id>` BEFORE acting; prepare returns existing coords (agent does not re-run `gh`); commit refuses duplicate coords. The ledger scan is the dedupe (`runtime-state.jsonl` is append-only with no uniqueness check — confirmed).
- **High — `gh` failure handling is agent-side.** The tool does not spawn `gh`, so the agent must check `gh`'s exit code + stdout before calling commit. Mitigation: the Rec 10 surfacing prompt (Phase 3) instructs the agent protocol (prepare → gh [check exit code] → commit); if `gh` fails, the agent does NOT call commit (no orphan). Document this in the prompt.
- **Medium — disclosure (issue created in the public template repo).** Mitigation: procedural — the surfacing prompt instructs "private coordination repo; agent proposes, operator dispatches"; the operator names the repo at dispatch time. No `evidence_code_ref` redaction (repo-relative, already as public as the tree). If dispatch-to-public is ever enabled, the operator edits the description to a non-exploitable summary (content gate).
- **Medium — `ledger_ref` value shape.** Bare id `dispatch-<finding_id>` (deterministic; join by id lookup in `runtime-state.jsonl`). The ledger event's `source_ref` is `local:meta-state:<finding_id>` (inverse pointer, regex `^local:meta-state:.+$`).
- **Low — shared helper extraction touches a working tool.** Mitigation: extract `appendLedgerEvent` + add a `runtime_state_record` regression test in the same step (step 5).
- **Low — `gh` not in `VERIFY_ALLOWLIST`** is irrelevant (the tool does not use `verification-runner.js`; the agent runs `gh` directly via Bash).
