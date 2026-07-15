#!/usr/bin/env node
/**
 * setup-branch-protection.mjs — bind branch-protection required status checks
 * to the Actions JOB id, so the required-check context can never drift from
 * the check-run name GitHub actually emits.
 *
 * Why this exists: GitHub matches a required-status-check `context` against the
 * check-run NAME, and Actions names a check run after the JOB id — NOT the
 * workflow `name:` field. Branch protection that was hand-set to the workflow
 * display name (`meta-state refs check`) never matched the job id (`refs-check`),
 * so the required check stayed PENDING forever and merges fell back to admin
 * bypass. Hand-aligning names is a coincidence-fix; this script makes the job
 * id the single source of truth by parsing it from the workflow YAML and
 * writing it into protection, so renaming the job auto-repairs protection on
 * the next run.
 *
 * Also migrates off the legacy `contexts` string array (GitHub marks it
 * "Closing down notice — Use checks instead") to the modern `checks` array of
 * `{context, app_id}`. `app_id: -1` means "any app may set the status" (matches
 * the previous app-agnostic `contexts` behavior). Pin to a specific app id
 * only if stricter binding is later required.
 *
 * Uses the full-protection PUT endpoint and echoes the existing config back,
 * changing ONLY `required_status_checks`. The `required_status_checks`
 * SUB-endpoint (PUT .../protection/required_status_checks) reliably 404s on
 * this repo (GitHub quirk), so the full-protection PUT is the working path.
 * `enforce_admins`, `required_pull_request_reviews`, `restrictions`, and all
 * toggles are read back from the live config and re-sent unchanged, so the PUT
 * is a no-op for everything except the status-check context.
 *
 * Usage:
 *   tools/scripts/setup-branch-protection.mjs [--workflow <path>] [--branch <name>] [--dry-run]
 *
 * Defaults: --workflow .github/workflows/meta-state-refs-check.yml --branch main
 *
 * Exit codes:
 *   0  protection updated (or already correct, no-op)
 *   1  bad input / missing workflow / gh failure
 *
 * Idempotent: re-running with the same job id produces the same protection
 * state. After the PUT, re-GETs and asserts the live `checks[].context` equals
 * the parsed job id; exits 1 on drift.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const DEFAULT_WORKFLOW = ".github/workflows/meta-state-refs-check.yml";
const DEFAULT_BRANCH = "main";

function parseArgs(argv) {
  const out = { workflow: DEFAULT_WORKFLOW, branch: DEFAULT_BRANCH, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workflow") out.workflow = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "-h" || a === "--help") {
      process.stdout.write("usage: setup-branch-protection.mjs [--workflow <path>] [--branch <name>] [--dry-run]\n");
      process.exit(0);
    } else {
      process.stderr.write(`setup-branch-protection: unknown arg: ${a}\n`);
      process.exit(1);
    }
  }
  return out;
}

function parseFirstJobId(workflowPath) {
  let text;
  try {
    text = readFileSync(workflowPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      process.stderr.write(`setup-branch-protection: workflow not found: ${workflowPath}\n`);
      process.exit(1);
    }
    throw err;
  }
  const wf = parseYaml(text);
  if (!wf || !wf.jobs || typeof wf.jobs !== "object") {
    process.stderr.write(`setup-branch-protection: no 'jobs:' mapping in ${workflowPath}\n`);
    process.exit(1);
  }
  const jobIds = Object.keys(wf.jobs);
  if (jobIds.length === 0) {
    process.stderr.write(`setup-branch-protection: 'jobs:' has no keys in ${workflowPath}\n`);
    process.exit(1);
  }
  if (jobIds.length > 1) {
    process.stderr.write(`setup-branch-protection: WARNING — ${jobIds.length} jobs found (${jobIds.join(", ")}); binding required check to the first job id "${jobIds[0]}". Pass --workflow to target a different workflow if needed.\n`);
  }
  return jobIds[0];
}

function gh(args, opts = {}) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
}

function ownerRepo() {
  return gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
}

// Strip GET-only `*_url` fields so the echoed object is accepted by the PUT.
// GitHub's GET returns url/contexts_url links and `{enabled: bool}` wrapper
// objects for toggles; the PUT wants the wrapper too (it accepts
// `{enabled: bool}` for the toggle sub-objects) but rejects the url fields.
function clean(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(clean);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "url" || k.endsWith("_url")) continue;
    out[k] = clean(v);
  }
  return out;
}

function toggle(protection, key) {
  // GET returns toggles as { enabled: bool }; the PUT wants the bare boolean
  // (or null), NOT the wrapper. {"enabled": false} is a 422 per the PUT schema.
  const v = protection[key];
  return v && typeof v === "object" ? !!v.enabled : null;
}

function currentProtection(ownerRepoSlug, branch) {
  const raw = gh(["api", `repos/${ownerRepoSlug}/branches/${branch}/protection`]);
  return JSON.parse(raw);
}

function putProtection(ownerRepoSlug, branch, body) {
  // --input - reads the JSON body from stdin (the `input` option).
  return gh(
    ["api", "-X", "PUT", `repos/${ownerRepoSlug}/branches/${branch}/protection`, "--input", "-"],
    { input: JSON.stringify(body) }
  );
}

const args = parseArgs(process.argv.slice(2));
const jobId = parseFirstJobId(args.workflow);

// strict is preserved from the live config (policy choice, not part of the bug);
// only the context string + the contexts→checks migration are changed.
const desired = {
  strict: null, // filled from live config after the GET
  checks: [{ context: jobId, app_id: -1 }],
};

console.log(`workflow:  ${args.workflow}`);
console.log(`branch:    ${args.branch}`);
console.log(`job id:    ${jobId}  (parsed from workflow → required-check context)`);
console.log(`body:      ${JSON.stringify(desired)}`);

if (args.dryRun) {
  // Dry-run is offline (no gh calls) so it is unit-testable and safe to run
  // without GitHub auth. ownerRepo() runs only on the apply path below.
  console.log("\n[dry-run] not applying. Re-run without --dry-run to PUT.");
  process.exit(0);
}

const repo = ownerRepo();
console.log(`repo:      ${repo}`);

// Pre-read the full protection so we can echo it back unchanged except for
// required_status_checks. required_pull_request_reviews and restrictions are
// preserved if present (url fields stripped), else sent as null.
let before;
try {
  before = currentProtection(repo, args.branch);
  console.log(`\nbefore:    ${JSON.stringify({ contexts: before.required_status_checks.contexts, checks: before.required_status_checks.checks, strict: before.required_status_checks.strict, enforce_admins: before.enforce_admins?.enabled })}`);
} catch (err) {
  process.stderr.write(`\nsetup-branch-protection: could not read existing protection: ${err.message.split("\n")[0]}\n`);
  process.exit(1);
}

const body = {
  required_status_checks: { ...desired, strict: before.required_status_checks.strict },
  enforce_admins: !!before.enforce_admins?.enabled,
  required_pull_request_reviews: clean(before.required_pull_request_reviews),
  restrictions: clean(before.restrictions),
  required_linear_history: toggle(before, "required_linear_history"),
  allow_force_pushes: toggle(before, "allow_force_pushes"),
  allow_deletions: toggle(before, "allow_deletions"),
  block_creations: toggle(before, "block_creations"),
  required_conversation_resolution: toggle(before, "required_conversation_resolution"),
  lock_branch: toggle(before, "lock_branch"),
  allow_fork_syncing: toggle(before, "allow_fork_syncing"),
};
console.log(`\nfull PUT body (preserves existing config, changes only required_status_checks):`);
console.log(JSON.stringify(body, null, 2));

putProtection(repo, args.branch, body);
console.log("\napplied:   PUT branches/main/protection (full rule, only required_status_checks changed)");

// Verify: re-GET required_status_checks and assert the live context equals the
// parsed job id. GitHub keeps `contexts` and `checks` in sync in the GET
// response (both are returned, both updated when you PUT only `checks`), so we
// assert BOTH arrays contain the job id — not that `contexts` is empty.
// Dropping the legacy INPUT is what matters; the GET always echoes both.
const after = currentProtection(repo, args.branch).required_status_checks;
console.log(`after:     ${JSON.stringify({ contexts: after.contexts, checks: after.checks, strict: after.strict })}`);

const liveChecks = (after.checks || []).map((c) => c.context);
const liveContexts = Array.isArray(after.contexts) ? after.contexts : [];
if (!liveChecks.includes(jobId) || !liveContexts.includes(jobId)) {
  process.stderr.write(`\nsetup-branch-protection: VERIFY FAILED — parsed job id "${jobId}" not bound in both arrays: checks=${JSON.stringify(liveChecks)} contexts=${JSON.stringify(liveContexts)}\n`);
  process.exit(1);
}
console.log(`\nOK: required-check context "${jobId}" bound from job id (both checks and contexts carry it).`);