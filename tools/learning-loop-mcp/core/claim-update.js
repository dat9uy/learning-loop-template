import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verificationDimensions } from "#mcp/core/claim-verification-rules.js";
import { loadRecords } from "#mcp/core/record-loader.js";
import { loadSchemas } from "#mcp/core/schema-loader.js";
import { validateRecords } from "#mcp/core/record-validation-rules.js";
import { parse as parseValue } from "yaml";

function validateRecordSet(records, schemas, rootPath) {
  const errors = validateRecords(records, schemas, rootPath);
  if (errors.length) {
    throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  }
}

export function assertWritablePlainString(label, value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  if (value !== value.trim()) throw new Error(`${label} must not start or end with whitespace`);
  if (/[\r\n]/.test(value)) throw new Error(`${label} must be single-line`);
  let parsedValue;
  try {
    parsedValue = parseValue(value);
  } catch {
    throw new Error(`${label} must avoid YAML-special scalar syntax`);
  }
  if (parsedValue !== value) throw new Error(`${label} must avoid YAML-special scalar syntax`);
  if (value.includes(": ")) throw new Error(`${label} must not include ': '`);
  if (value.includes("#")) throw new Error(`${label} must not include '#'`);
}

function formatList(key, values) {
  if (!values.length) return [`  ${key}: []`];
  return [`  ${key}:`, ...values.map((value) => `    - ${value}`)];
}

function serializeDimension(dimension, config) {
  assertWritablePlainString("reason", config.reason);
  const lines = [`  ${dimension}:`, `    status: ${config.status}`];
  if (config.scope) lines.push(`    scope: ${config.scope}`);
  if (config.output) lines.push(`    output: ${config.output}`);
  lines.push(`    reason: ${config.reason}`);
  const refKey = dimension === "product" ? "decision_refs" : "proof_refs";
  const refs = dimension === "product" ? config.decision_refs : config.proof_refs;
  if (!refs.length) lines.push(`    ${refKey}: []`);
  else lines.push(`    ${refKey}:`, ...refs.map((ref) => `      - ${ref}`));
  return lines;
}

function serializeVerification(verification) {
  const lines = ["verification:"];
  for (const dimension of ["static", "install", "runtime", "product"]) {
    if (verification[dimension]) lines.push(...serializeDimension(dimension, verification[dimension]));
  }
  lines.push(...formatList("blocked_actions", verification.blocked_actions || []));
  return lines.join("\n");
}

function replaceVerificationBlock(fileText, verification) {
  const lines = fileText.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "verification:");
  if (start === -1) throw new Error("Target claim file has no top-level verification block");
  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith(" ") || !lines[end].trim())) end += 1;
  lines.splice(start, end - start, ...serializeVerification(verification).split("\n"));
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

function findTargetClaim(records, claimId) {
  const claim = records.find((record) => record.id === claimId && record.type === "claim");
  if (!claim) throw new Error(`Claim not found: ${claimId}`);
  return claim;
}

function buildDimension(args) {
  const base = { status: args.status, reason: args.reason };
  if (args.dimension === "product") return { ...base, decision_refs: args.decisionRefs };
  if (args.dimension === "install") return { ...base, scope: args.scope || "sandbox", proof_refs: args.proofRefs };
  if (args.dimension === "runtime") return { ...base, scope: args.scope || "sandbox", output: args.output || "metadata-only", proof_refs: args.proofRefs };
  return { ...base, proof_refs: args.proofRefs };
}

function formatProposal(claim, args) {
  const lines = [
    `Claim: ${claim.id}`,
    `Dimension: ${args.dimension}`,
    `Proposed status: ${args.status}`,
    `Proof refs: ${args.proofRefs.length}`,
    `Decision refs: ${args.decisionRefs.length}`,
  ];
  if (!args.apply) lines.push("Dry run: no files changed");
  return lines.join("\n");
}

/**
 * Pure function to update claim verification. Throws on error.
 * @returns {{ updated: boolean, claim_id: string, preview?: string }}
 */
export function updateClaimVerification({
  root,
  claimId,
  dimension,
  status,
  reason,
  scope,
  output,
  proofRefs = [],
  decisionRefs = [],
  blockedActions = [],
  apply = false,
}) {
  const rootPath = root;
  const schemas = loadSchemas(rootPath);
  const records = loadRecords(rootPath);
  validateRecordSet(records, schemas, rootPath);

  const claim = findTargetClaim(records, claimId);
  const verification = {
    ...(claim.verification || {}),
    [dimension]: buildDimension({
      dimension, status, reason, scope, output, proofRefs, decisionRefs,
    }),
    blocked_actions: blockedActions,
  };

  const updatedRecords = records.map((record) => (
    record.id === claim.id ? { ...record, verification } : record
  ));
  validateRecordSet(updatedRecords, schemas, rootPath);

  const preview = formatProposal(claim, { dimension, status, proofRefs, decisionRefs, apply });

  if (!apply) {
    return { updated: false, claim_id: claimId, preview };
  }

  const filePath = join(rootPath, claim.__file);
  const nextFileText = replaceVerificationBlock(readFileSync(filePath, "utf8"), verification);
  writeFileSync(filePath, nextFileText);
  validateRecordSet(loadRecords(rootPath), schemas, rootPath);

  return { updated: true, claim_id: claimId, preview: `Applied verification update to ${claim.__file}.` };
}
