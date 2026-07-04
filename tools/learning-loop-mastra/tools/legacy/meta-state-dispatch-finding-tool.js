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
      const result = { dispatched: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result, stage });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (finding.entry_kind !== "finding") {
      const result = { dispatched: false, reason: "not_a_finding", id, entry_kind: finding.entry_kind };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result, stage });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (stage === "prepare") {
      // Idempotency: if a dispatch row exists, return its coords so the
      // agent does NOT re-run `gh issue create`.
      const rows = readRuntimeStateRows(root);
      const existing = findDispatchRow(rows, id);
      if (existing) {
        const result = {
          dispatched: false,
          reason: "already_dispatched",
          id,
          stage,
          issue_number: existing.metadata?.issue_number,
          issue_url: existing.metadata?.issue_url,
          repo: existing.metadata?.repo,
          delegated_to: existing.metadata?.delegated_to,
        };
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      const { title, body } = buildIssueContent(finding);
      const result = {
        finding_id: id,
        issue_title: title,
        issue_body: body,
        // Advisory hint text only — no env var default, no allowlist,
        // no content-gate. Per INC-1 reversal (the brainstorm Addendum 3
        // explicitly rejected tool-level gates: "the disclosure mitigation
        // is procedural (private coord repo + operator-edited description),
        // not tool-level").
        coord_repo_hint: "agent-proposes-operator-dispatches; name the issue-tracker repo at gh time (--repo <private-repo> or rely on gh's default to current git remote)",
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", id, stage });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // stage === "commit" — operator-gated.
    if (process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true") {
      const result = { dispatched: false, reason: "operator_role_required", id, stage };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (issue_number === undefined || !issue_url) {
      const result = { dispatched: false, reason: "missing_coords", id, stage };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    // Defensive: z.coerce.number() yields NaN on a non-numeric string and 0 on
    // an empty string; both would otherwise be written to the ledger as the
    // issue number. Reject them explicitly. `gh issue create` returns a
    // positive integer, so <= 0 is never a real issue number.
    if (!Number.isFinite(issue_number) || issue_number <= 0) {
      const result = { dispatched: false, reason: "invalid_coords", id, stage, issue_number };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
          await updateEntry(root, id, { ledger_ref: dispatchLedgerId(id) });
        }
        const result = {
          dispatched: true,
          idempotent: true,
          id,
          stage,
          issue_number,
          issue_url,
          repo: repo ?? "",
          ledger_id: dispatchLedgerId(id),
        };
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      // Different coords — refuse (the dispatch is already bound to another issue).
      const result = {
        dispatched: false,
        reason: "already_dispatched",
        existing_issue_number: exNum,
        existing_issue_url: exUrl,
        id,
        stage,
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // First write path: append the ledger event + patch the finding.
    const now = new Date().toISOString();
    const row = {
      affected_system: "meta-state-tools",
      kind: "ledger-event",
      id: dispatchLedgerId(id),
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
      const result = { dispatched: false, reason: "ledger_append_failed", error: err.message || String(err), id, stage };
      appendGateLog(root, { timestamp: now, tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // CAS patch — read current version first.
    const fresh = readRegistry(root).find((e) => e.id === id);
    const expectedVersion = fresh?.version ?? 0;
    const updateResult = await updateEntry(root, id, {
      ledger_ref: dispatchLedgerId(id),
      _expected_version: expectedVersion,
    });

    if (updateResult === "version_mismatch") {
      // Orphan self-heal: ledger row written but back-pointer patch failed.
      // Re-invoking commit will detect the row and run the same-coords no-op
      // path (which patches ledger_ref if still missing).
      const result = {
        dispatched: true,
        orphan_warning: "version_mismatch on ledger_ref patch — re-invoke commit to heal",
        id,
        stage,
        issue_number,
        issue_url,
        repo: repo ?? "",
        ledger_id: dispatchLedgerId(id),
      };
      appendGateLog(root, { timestamp: now, tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (updateResult !== true) {
      const result = { dispatched: false, reason: "ledger_ref_patch_failed", update_result: updateResult, id, stage };
      appendGateLog(root, { timestamp: now, tool: "meta_state_dispatch_finding", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const result = {
      dispatched: true,
      id,
      stage,
      issue_number,
      issue_url,
      repo: repo ?? "",
      ledger_id: dispatchLedgerId(id),
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_dispatch_finding", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};