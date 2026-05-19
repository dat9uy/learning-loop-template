import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verificationDimensions } from "../validate-records/claim-verification-rules.js";
import { loadRecords } from "../validate-records/record-loader.js";
import { loadSchemas } from "../validate-records/schema-loader.js";
import { validateRecords } from "../validate-records/record-validation-rules.js";
import { parse as parseValue } from "yaml";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function usage() {
  return [
    "Usage: pnpm verify:claim -- --claim <id> --dimension <dimension> --status <status> --reason <text> [--scope <scope>] [--output <level>] [--proof-ref <ref>] [--decision-ref <ref>] [--blocked-action <text>] [--apply]",
    "Without update flags, validates claim verification records only.",
    "Without --apply, previews the update and prints: Dry run: no files changed.",
  ].join("\n");
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  const args = { proofRefs: [], decisionRefs: [], blockedActions: [], apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--claim") args.claim = requireValue(argv, index, arg);
    else if (arg === "--dimension") args.dimension = requireValue(argv, index, arg);
    else if (arg === "--status") args.status = requireValue(argv, index, arg);
    else if (arg === "--reason") args.reason = requireValue(argv, index, arg);
    else if (arg === "--scope") args.scope = requireValue(argv, index, arg);
    else if (arg === "--output") args.output = requireValue(argv, index, arg);
    else if (arg === "--proof-ref") args.proofRefs.push(requireValue(argv, index, arg));
    else if (arg === "--decision-ref") args.decisionRefs.push(requireValue(argv, index, arg));
    else if (arg === "--blocked-action") args.blockedActions.push(requireValue(argv, index, arg));
    else throw new Error(`Unknown argument: ${arg}`);
    if (["--claim", "--dimension", "--status", "--reason", "--scope", "--output", "--proof-ref", "--decision-ref", "--blocked-action"].includes(arg)) index += 1;
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validateRecordSet(records, schemas) {
  const errors = validateRecords(records, schemas, root);
  if (errors.length) fail(errors.map((error) => `- ${error}`).join("\n"));
}

function hasUpdateArgs(args) {
  return Boolean(args.apply || args.claim || args.dimension || args.status || args.reason || args.proofRefs.length || args.decisionRefs.length || args.blockedActions.length);
}

function requireUpdateArgs(args) {
  const missing = [];
  if (!args.claim) missing.push("--claim");
  if (!args.dimension) missing.push("--dimension");
  if (!args.status) missing.push("--status");
  if (!args.reason) missing.push("--reason");
  if (missing.length) fail(`Missing required update argument(s): ${missing.join(", ")}`);
  if (!verificationDimensions.has(args.dimension)) fail(`Unsupported verification dimension: ${args.dimension}`);
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
  if (!claim) fail(`Claim not found: ${claimId}`);
  return claim;
}

function buildDimension(args) {
  const base = { status: args.status, reason: args.reason };
  if (args.dimension === "product") return { ...base, decision_refs: args.decisionRefs };
  if (args.dimension === "install") return { ...base, scope: args.scope || "sandbox", proof_refs: args.proofRefs };
  if (args.dimension === "runtime") return { ...base, scope: args.scope || "sandbox", output: args.output || "metadata-only", proof_refs: args.proofRefs };
  return { ...base, proof_refs: args.proofRefs };
}

function printProposal(claim, verification, args) {
  console.log(`Claim: ${claim.id}`);
  console.log(`Dimension: ${args.dimension}`);
  console.log(`Proposed status: ${args.status}`);
  console.log(`Proof refs: ${args.proofRefs.length}`);
  console.log(`Decision refs: ${args.decisionRefs.length}`);
  if (!args.apply) console.log("Dry run: no files changed");
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
  if (args.help) {
    console.log(usage());
    return;
  }

  const schemas = loadSchemas(root);
  const records = loadRecords(root);
  validateRecordSet(records, schemas);

  if (!hasUpdateArgs(args)) {
    console.log(`Validated ${records.length} records.`);
    console.log("Dry run: no files changed");
    return;
  }

  requireUpdateArgs(args);
  const claim = findTargetClaim(records, args.claim);
  const verification = {
    ...(claim.verification || {}),
    [args.dimension]: buildDimension(args),
    blocked_actions: args.blockedActions,
  };

  const updatedRecords = records.map((record) => (
    record.id === claim.id ? { ...record, verification } : record
  ));
  validateRecordSet(updatedRecords, schemas);
  printProposal(claim, verification, args);

  if (!args.apply) return;

  const filePath = join(root, claim.__file);
  const nextFileText = replaceVerificationBlock(readFileSync(filePath, "utf8"), verification);
  writeFileSync(filePath, nextFileText);
  validateRecordSet(loadRecords(root), schemas);
  console.log(`Applied verification update to ${claim.__file}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
