import { list, section, writeDoc } from "./markdown-rendering.js";

function recordsOf(records, type) {
  return records.filter((record) => record.type === type);
}

export function renderGeneratedDocs(root, records) {
  return {
    "docs/generated/overview.md": renderOverview(records),
    "docs/generated/backlog.md": renderBacklog(records),
    "docs/generated/decisions.md": renderDecisions(records),
    "docs/generated/evidence-index.md": renderEvidenceIndex(records),
    "docs/product-proposals/first-product-proposal.md": renderProposal(records),
  };
}

function renderOverview(records) {
  return writeDoc("Learning Loop Overview", [
    section("Record Counts", list([`Claims: ${recordsOf(records, "claim").length}`, `Experiments: ${recordsOf(records, "experiment").length}`, `Decisions: ${recordsOf(records, "decision").length}`])),
    section("Current Product Status", "No product code exists. The current template supports proposal-only experiments."),
  ]);
}

function renderBacklog(records) {
  const entries = recordsOf(records, "experiment").flatMap((experiment) => (experiment.promotion_review || []).map((item) => `${item.route}: ${item.observation}`));
  return writeDoc("Backlog", [
    section("Product Backlog", list(entries.filter((entry) => entry.startsWith("product-backlog")))),
    section("Workflow Backlog", list(entries.filter((entry) => entry.startsWith("workflow-backlog")))),
  ]);
}

function renderDecisions(records) {
  return writeDoc("Decisions", [
    section("Decision Records", list(recordsOf(records, "decision").map((decision) => `${decision.id}: ${decision.decision}`))),
    section("Promoted Decision Observations", list(recordsOf(records, "experiment").flatMap((experiment) => (experiment.promotion_review || []).filter((item) => item.route === "decision").map((item) => `${experiment.id}: ${item.observation}`)))),
  ]);
}

function renderEvidenceIndex(records) {
  return writeDoc("Evidence Index", [
    section("Claim Sources", list(recordsOf(records, "claim").map((claim) => `${claim.id}: ${(claim.source_refs || []).join(", ") || "local/template"}`))),
    section("Experiment Sources", list(recordsOf(records, "experiment").map((experiment) => `${experiment.id}: ${(experiment.source_refs || []).join(", ") || "local/template"}`))),
  ]);
}

function renderProposal(records) {
  const experiment = records.find((record) => record.id === "exp-first-product-proposal");
  if (!experiment) return writeDoc("First Product Proposal", [section("Status", "No proposal experiment exists yet.")]);
  return writeDoc("First Product Proposal", [
    section("Question", experiment.goal),
    section("Outcome", experiment.product_outcome),
    section("Result", experiment.result),
    section("Evidence", list(experiment.source_refs || [])),
    section("No-Code Status", "No files under `product/` were created or modified by this proposal."),
  ]);
}
