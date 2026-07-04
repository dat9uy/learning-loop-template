import { z } from "zod";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { appendLedgerEvent, readRuntimeStateRows } from "../../core/runtime-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * meta_state_dispatch_finding — two-mode tool for routing fixable findings
 * to a GitHub Issue via an external coordination repo.
 *
 * Two-surfaces split (plan 260704-0301-stale-findings-dispatch-handle, Phase 2):
 * the deterministic core (this tool) does NO GitHub side effects. The agentic
 * runtime (the agent) runs `gh issue create` between prepare and commit.
 *
 * Stages:
 *   - prepare({id}): builds the issue title/body + advisory coord-repo hint.
 *     Read-only; no operator gate; idempotent (returns existing coords if
 *     a `dispatch-<id>` ledger row already exists, agent does NOT re-run gh).
 *   - commit({id, issue_number, issue_url, repo, delegated_to}): writes the
 *     `dispatch-<id>` ledger event and patches the finding's `ledger_ref`
 *     back-pointer. OPERATOR_MODE-gated (orthogonal to preflight).
 *
 * Idempotency (handles H1 orphan-retry + H2 concurrent-race): both stages
 * scan runtime-state.jsonl for a row with `id === "dispatch-<finding_id>"`
 * BEFORE acting. Prepare returns existing coords on hit. Commit on hit with
 * SAME coords is a no-op; with DIFFERENT coords is refused. The CAS layer
 * on `ledger_ref` patch is the only safety under true concurrency.
 *
 * Citation asymmetry (P3 F10): the issue body cites `local:meta-state:<id>`
 * (loop-citable for agents; not human-clickable). The registry-side
 * `ledger_ref → dispatch-<id>` is human-citable via `gh issue view <n>` but
 * not back-linkable from the issue side. They are NOT symmetric.
 */

const TOOL_NAME = "meta_state_dispatch_finding";

// Dispatch-mode idempotency: every dispatched finding has exactly one
// `dispatch-<finding_id>` ledger row. The row holds the coords of the
// created issue so re-prepare / re-commit can detect prior state.
function dispatchLedgerId(findingId) {
  return `dispatch-${findingId}`;
}

function findDispatchRow(rows, findingId) {
  const target = dispatchLedgerId(findingId);
  // Filter by kind=ledger-event so a future budget-state row reusing the
  // `dispatch-` prefix can't be mistaken for a dispatch ledger row.
  return rows.find((r) => r && r.id === target && r.kind === "ledger-event") || null;
}

/**
 * Build the issue title and body from the finding. Pure function so tests
 * can verify the body shape without going through the handler.
 */
function buildIssueContent(finding) {
  const evidenceLine = finding.evidence_code_ref
    ? `\n\n**Evidence:** \`${finding.evidence_code_ref}\``
    : "";
  const citationLine = `\n\n---\n_Citation: \`local:meta-state:${finding.id}\` (loop-citable; for humans, use the issue tracker URL above once created.)_`;

  const title = `[${finding.severity}] ${finding.id} — ${finding.category}`;
  const body = [
    `## ${finding.id}`,
    "",
    `**Category:** \`${finding.category}\`  `,
    `**Severity:** \`${finding.severity}\`  `,
    `**Affected system:** \`${finding.affected_system}\`  `,
    `**Status:** \`${finding.status}\``,
    evidenceLine,
    "",
    "### Description",
    "",
    finding.description,
    citationLine,
  ].join("\n");

  return { title, body };
}

/**
 * Terminal-result helper: build the MCP content envelope, write the gate-log
 * row, and return. Collapses the repeated `appendGateLog + return` boilerplate
 * that previously dominated the handler (DRY + drops handler CRAP).
 *
 * The gate-log row is `{ timestamp, tool, ...result, ...extraLog }`. `extraLog`
 * carries fields the log needs but the returned result should NOT (e.g. `stage`
 * on early-validation returns where the result itself omits it). Pass
 * `logOnly: true` to log ONLY `{ timestamp, tool, ...extraLog }` — used by the
 * prepare-success path whose result body is too large for the gate log.
 *
 * @param {string} root — project root
 * @param {string} ts — ISO timestamp for the gate-log row
 * @param {object} result — value serialized into the returned content envelope
 * @param {object} [extraLog] — extra gate-log fields (merged after result)
 * @param {boolean} [logOnly=false] — when true, log only extraLog (skip result spread)
 * @returns {{ content: [{ type: "text", text: string }] }}
 */
function finish(root, ts, result, extraLog, logOnly = false) {
  const logRow = logOnly
    ? { timestamp: ts, tool: TOOL_NAME, ...(extraLog || {}) }
    : { timestamp: ts, tool: TOOL_NAME, ...result, ...(extraLog || {}) };
  appendGateLog(root, logRow);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

/**
 * Prepare stage: build the issue title/body, or return existing dispatch
 * coords if a `dispatch-<id>` ledger row already exists (idempotent — the
 * agent must NOT re-run `gh issue create`). Read-only; no operator gate.
 */
function handlePrepareStage(root, finding, id) {
  const rows = readRuntimeStateRows(root);
  const existing = findDispatchRow(rows, id);
  if (existing) {
    return finish(root, new Date().toISOString(), {
      dispatched: false,
      reason: "already_dispatched",
      id,
      stage: "prepare",
      issue_number: existing.metadata?.issue_number,
      issue_url: existing.metadata?.issue_url,
      repo: existing.metadata?.repo,
      delegated_to: existing.metadata?.delegated_to,
    });
  }

  const { title, body } = buildIssueContent(finding);
  // Prepare-success: the result body (issue_title/issue_body) is large and
  // not useful in the gate log, so log only id+stage (logOnly=true).
  return finish(
    root,
    new Date().toISOString(),
    {
      finding_id: id,
      issue_title: title,
      issue_body: body,
      // Advisory hint text only — no env var default, no allowlist,
      // no content-gate. Per INC-1 reversal (the brainstorm Addendum 3
      // explicitly rejected tool-level gates: "the disclosure mitigation
      // is procedural (private coord repo + operator-edited description),
      // not tool-level").
      coord_repo_hint: "agent-proposes-operator-dispatches; name the issue-tracker repo at gh time (--repo <private-repo> or rely on gh's default to current git remote)",
    },
    { id, stage: "prepare" },
    true,
  );
}

/**
 * Commit stage: operator-gated. Validates coords, enforces idempotency
 * (same-coords → no-op success with orphan self-heal; different-coords →
 * refuse), then appends the `dispatch-<id>` ledger event and CAS-patches
 * the finding's `ledger_ref` back-pointer. `now` is captured once at the
 * first-write boundary so the ledger row and its gate-log rows share a
 * timestamp (matches the original capture point at L216 of the pre-refactor
 * handler).
 *
 * Complexity is inherent: the stage validates 3 coord conditions, branches
 * on existing-row same/different coords, and handles 3 CAS-patch outcomes.
 * Splitting further would scatter the idempotency + CAS contract across
 * functions and hurt readability. Suppressed per the codebase pattern (see
 * core/gate-override.js, core/query-drift.js, core/derive-status.js).
 */
// fallow-ignore-next-line complexity
async function handleCommitStage(root, finding, id, coords) {
  const { issue_number, issue_url, repo, delegated_to } = coords;
  const ledgerId = dispatchLedgerId(id);

  if (process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true") {
    return finish(root, new Date().toISOString(), { dispatched: false, reason: "operator_role_required", id, stage: "commit" });
  }
  if (issue_number === undefined || !issue_url) {
    return finish(root, new Date().toISOString(), { dispatched: false, reason: "missing_coords", id, stage: "commit" });
  }
  // Defensive: z.coerce.number() yields NaN on a non-numeric string and 0 on
  // an empty string; both would otherwise be written to the ledger as the
  // issue number. Reject them explicitly. `gh issue create` returns a
  // positive integer, so <= 0 is never a real issue number.
  if (!Number.isFinite(issue_number) || issue_number <= 0) {
    return finish(root, new Date().toISOString(), { dispatched: false, reason: "invalid_coords", id, stage: "commit", issue_number });
  }

  const rows = readRuntimeStateRows(root);
  const existing = findDispatchRow(rows, id);
  if (existing) {
    const exNum = existing.metadata?.issue_number;
    const exUrl = existing.metadata?.issue_url;
    if (exNum === issue_number && exUrl === issue_url) {
      // Same coords — no-op success. Ensure ledger_ref is patched too
      // (orphan self-heal: the previous commit may have written the row
      // but failed the patch).
      if (!finding.ledger_ref) {
        await updateEntry(root, id, { ledger_ref: ledgerId });
      }
      return finish(root, new Date().toISOString(), {
        dispatched: true,
        idempotent: true,
        id,
        stage: "commit",
        issue_number,
        issue_url,
        repo: repo ?? "",
        ledger_id: ledgerId,
      });
    }
    // Different coords — refuse (the dispatch is already bound to another issue).
    return finish(root, new Date().toISOString(), {
      dispatched: false,
      reason: "already_dispatched",
      existing_issue_number: exNum,
      existing_issue_url: exUrl,
      id,
      stage: "commit",
    });
  }

  // First write path: append the ledger event + patch the finding.
  const now = new Date().toISOString();
  const row = {
    affected_system: "meta-state-tools",
    kind: "ledger-event",
    id: ledgerId,
    value: null,
    delta: null,
    source_ref: `local:meta-state:${id}`,
    timestamp: now,
    status: "active",
    fingerprint: null,
    metadata: {
      issue_number,
      issue_url,
      repo: repo ?? "",
      dispatched_by: process.env.OPERATOR_ID || "operator",
      dispatched_at: now,
      finding_id: id,
      delegated_to: delegated_to ?? null,
    },
  };

  try {
    appendLedgerEvent(root, row);
  } catch (err) {
    return finish(root, now, { dispatched: false, reason: "ledger_append_failed", error: err.message || String(err), id, stage: "commit" });
  }

  // CAS patch — read current version first.
  const fresh = readRegistry(root).find((e) => e.id === id);
  const expectedVersion = fresh?.version ?? 0;
  const updateResult = await updateEntry(root, id, {
    ledger_ref: ledgerId,
    _expected_version: expectedVersion,
  });

  if (updateResult === "version_mismatch") {
    // Orphan self-heal: ledger row written but back-pointer patch failed.
    // Re-invoking commit will detect the row and run the same-coords no-op
    // path (which patches ledger_ref if still missing).
    return finish(root, now, {
      dispatched: true,
      orphan_warning: "version_mismatch on ledger_ref patch — re-invoke commit to heal",
      id,
      stage: "commit",
      issue_number,
      issue_url,
      repo: repo ?? "",
      ledger_id: ledgerId,
    });
  }
  if (updateResult !== true) {
    return finish(root, now, { dispatched: false, reason: "ledger_ref_patch_failed", update_result: updateResult, id, stage: "commit" });
  }

  return finish(root, now, {
    dispatched: true,
    id,
    stage: "commit",
    issue_number,
    issue_url,
    repo: repo ?? "",
    ledger_id: ledgerId,
  });
}

export const metaStateDispatchFindingTool = {
  name: "meta_state_dispatch_finding",
  description:
    "Dispatch a fixable finding to a GitHub Issue via an external coordination " +
    "repo. Two-surfaces split: this tool does NOT call gh — the agent runs " +
    "`gh issue create` between the prepare and commit stages. " +
    "prepare({id}) builds the issue title/body + coord-repo hint (read-only, " +
    "ungated, idempotent). commit({id, issue_number, issue_url, repo, " +
    "delegated_to}) writes the dispatch-<id> ledger event + patches " +
    "ledger_ref (OPERATOR_MODE-gated, idempotent on re-commit). " +
    "Citation: the issue body cites `local:meta-state:<id>` (loop-citable); " +
    "the registry-side `ledger_ref` is human-citable. They are NOT symmetric.",
  schema: {
    id: z.string().describe("Finding id to dispatch"),
    stage: z.enum(["prepare", "commit"]).default("prepare")
      .describe("Workflow stage. prepare=build body (read-only); commit=record ledger (operator-gated)."),
    issue_number: z.coerce.number().optional()
      .describe("[commit only] The GitHub issue number returned by `gh issue create`."),
    issue_url: z.string().optional()
      .describe("[commit only] The GitHub issue URL returned by `gh issue create`."),
    repo: z.string().optional()
      .describe("[commit only] The repo the agent passed to `gh --repo` (or empty if the agent used gh's default = current git remote). The tool does not validate this value — coord-repo policy is procedural, not tool-level."),
    delegated_to: z.string().optional()
      .describe("[commit only] Optional agent id recording who took ownership of the fix (for cross-worktree accounting)."),
  },
  handler: async ({ id, stage = "prepare", issue_number, issue_url, repo, delegated_to }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const finding = entries.find((e) => e.id === id);

    if (!finding) {
      return finish(root, new Date().toISOString(), { dispatched: false, reason: "not_found", id }, { stage });
    }
    if (finding.entry_kind !== "finding") {
      return finish(root, new Date().toISOString(), { dispatched: false, reason: "not_a_finding", id, entry_kind: finding.entry_kind }, { stage });
    }

    if (stage === "prepare") {
      return handlePrepareStage(root, finding, id);
    }
    return handleCommitStage(root, finding, id, { issue_number, issue_url, repo, delegated_to });
  },
};