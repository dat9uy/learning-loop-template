import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allowedTransitions, lifecycleStates } from "../validate-records/claim-proof-lifecycle-rules.js";
import { loadPackStatuses, loadRecords } from "../validate-records/record-loader.js";
import { validateRecords } from "../validate-records/record-validation-rules.js";
import { parseValue } from "../validate-records/simple-yaml-parser.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function usage() {
  return [
    "Usage: pnpm lifecycle:claim -- --claim <id> --state <state> --reason <text> [--proof-ref <ref>] [--blocked-action <text>] [--apply]",
    "Without update flags, validates claim lifecycle records only.",
    "Without --apply, previews the update and prints: Dry run: no files changed.",
  ].join("\n");
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  const args = { proofRefs: [], blockedActions: [], apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--claim") args.claim = requireValue(argv, index, arg);
    else if (arg === "--state") args.state = requireValue(argv, index, arg);
    else if (arg === "--reason") args.reason = requireValue(argv, index, arg);
    else if (arg === "--proof-ref") args.proofRefs.push(requireValue(argv, index, arg));
    else if (arg === "--blocked-action") args.blockedActions.push(requireValue(argv, index, arg));
    else throw new Error(`Unknown argument: ${arg}`);
    if (["--claim", "--state", "--reason", "--proof-ref", "--blocked-action"].includes(arg)) index += 1;
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadSchemas() {
  return Object.fromEntries(
    ["claim", "experiment", "decision", "risk"].map((type) => [
      type,
      JSON.parse(readFileSync(join(root, "schemas", `${type}.schema.json`), "utf8")),
    ]),
  );
}

function validateRecordSet(records, schemas, packStatuses) {
  const errors = validateRecords(records, schemas, packStatuses, root);
  if (errors.length) fail(errors.map((error) => `- ${error}`).join("\n"));
}

function hasUpdateArgs(args) {
  return Boolean(
    args.apply
      || args.claim
      || args.state
      || args.reason
      || args.proofRefs.length
      || args.blockedActions.length,
  );
}

function requireUpdateArgs(args) {
  const missing = [];
  if (!args.claim) missing.push("--claim");
  if (!args.state) missing.push("--state");
  if (!args.reason) missing.push("--reason");
  if (missing.length) fail(`Missing required update argument(s): ${missing.join(", ")}`);
  if (!lifecycleStates.has(args.state)) fail(`Unsupported lifecycle state: ${args.state}`);
}

function assertWritablePlainString(label, value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  if (value !== value.trim()) throw new Error(`${label} must not start or end with whitespace`);
  if (/[\r\n]/.test(value)) throw new Error(`${label} must be single-line`);
  if (parseValue(value) !== value) throw new Error(`${label} must avoid YAML-special scalar syntax`);
  if (value.includes(": ")) throw new Error(`${label} must not include ': '`);
  if (value.includes("#")) throw new Error(`${label} must not include '#'`);
}

function assertWritableLifecycle(lifecycle) {
  assertWritablePlainString("state_reason", lifecycle.state_reason);
  for (const ref of lifecycle.proof_refs) assertWritablePlainString("proof_refs item", ref);
  for (const action of lifecycle.blocked_actions) assertWritablePlainString("blocked_actions item", action);
}

function formatList(key, values) {
  if (!values.length) return [`  ${key}: []`];
  return [`  ${key}:`, ...values.map((value) => `    - ${value}`)];
}

function serializeLifecycle(lifecycle) {
  assertWritableLifecycle(lifecycle);
  return [
    "lifecycle:",
    `  state: ${lifecycle.state}`,
    `  state_reason: ${lifecycle.state_reason}`,
    ...formatList("proof_refs", lifecycle.proof_refs),
    ...formatList("blocked_actions", lifecycle.blocked_actions),
  ].join("\n");
}

function replaceLifecycleBlock(fileText, lifecycle) {
  const lines = fileText.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "lifecycle:");
  if (start === -1) throw new Error("Target claim file has no top-level lifecycle block");

  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith(" ") || !lines[end].trim())) end += 1;
  lines.splice(start, end - start, ...serializeLifecycle(lifecycle).split("\n"));
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

function findTargetClaim(records, claimId) {
  const claim = records.find((record) => record.id === claimId && record.type === "claim");
  if (!claim) fail(`Claim not found: ${claimId}`);
  return claim;
}

function validateTransition(claim, targetState) {
  const currentState = claim.lifecycle.state;
  if (targetState === currentState) return;
  if (!allowedTransitions.get(currentState)?.includes(targetState)) {
    fail(`Forbidden lifecycle transition: ${currentState}->${targetState}`);
  }
}

function printProposal(claim, lifecycle, apply) {
  console.log(`Claim: ${claim.id}`);
  console.log(`Current state: ${claim.lifecycle.state}`);
  console.log(`Proposed state: ${lifecycle.state}`);
  console.log(`Proof refs: ${lifecycle.proof_refs.length}`);
  console.log(`Blocked actions: ${lifecycle.blocked_actions.length}`);
  if (!apply) console.log("Dry run: no files changed");
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

  const schemas = loadSchemas();
  const packStatuses = loadPackStatuses(root);
  const records = loadRecords(root);
  validateRecordSet(records, schemas, packStatuses);

  if (!hasUpdateArgs(args)) {
    console.log(`Validated ${records.length} records.`);
    console.log("Dry run: no files changed");
    return;
  }

  requireUpdateArgs(args);
  const claim = findTargetClaim(records, args.claim);
  validateTransition(claim, args.state);

  const lifecycle = {
    state: args.state,
    state_reason: args.reason,
    proof_refs: args.proofRefs,
    blocked_actions: args.blockedActions,
  };
  assertWritableLifecycle(lifecycle);

  const updatedRecords = records.map((record) => (
    record.id === claim.id ? { ...record, lifecycle } : record
  ));
  validateRecordSet(updatedRecords, schemas, packStatuses);
  printProposal(claim, lifecycle, args.apply);

  if (!args.apply) return;

  const filePath = join(root, claim.__file);
  const nextFileText = replaceLifecycleBlock(readFileSync(filePath, "utf8"), lifecycle);
  writeFileSync(filePath, nextFileText);
  validateRecordSet(loadRecords(root), schemas, packStatuses);
  console.log(`Applied lifecycle update to ${claim.__file}.`);
}

main();
