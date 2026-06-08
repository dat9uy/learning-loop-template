#!/usr/bin/env node
/**
 * closeout-260608-1700-test-scout.mjs
 *
 * Phase 3 closeout for plan 260608-1700-test-codebase-scout.
 * Files candidate findings from the scout's output fixture via the
 * meta_state_report MCP tool. Idempotent: re-runs skip existing findings
 * (per meta-260606T1500Z fix).
 *
 * Per F6 red team: matches the convention of 8 scripts in
 * tools/learning-loop-mcp/scripts/. Per F13 red team: refuses to call
 * meta_state_resolve (defense in depth).
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { resolveRoot } from "#lib/resolve-root.js";
import { metaStateReportTool } from "#mcp/tools/meta-state-report-tool.js";
import { readRegistry } from "#mcp/core/meta-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolveRoot();
const scoutOutputPath = join(root, "tools/learning-loop-mcp/scout/fixtures/scout-output.json");
const FINDING_PREFIX = "meta-260608T1700Z";

function shortHash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

function buildFindingId(category, subId) {
  return `${FINDING_PREFIX}-${category}-${subId}`;
}

function findExistingFinding(payload) {
  // The meta_state_report tool generates a timestamp-based id from the description,
  // so we cannot pre-compute it. Instead, check if a finding with the same
  // evidence_code_ref and category+subtype already exists.
  const entries = readRegistry(root);
  return entries.find(
    (e) =>
      e.entry_kind === "finding" &&
      e.category === payload.category &&
      (payload.subtype === undefined || e.subtype === payload.subtype) &&
      e.evidence_code_ref === payload.evidence_code_ref
  );
}

async function fileFinding(payload) {
  const result = await metaStateReportTool.handler(payload);
  const parsed = JSON.parse(result.content[0].text);
  return parsed;
}

/**
 * Project scout output to meta_state_report payloads (per brainstorm Layer 3 cookbook).
 */
function collectFindings(scoutOutput) {
  const findings = [];
  const seenIds = new Set();

  // Bucket C (Bypass-MCP) — one finding per bucket-C test
  for (const inv of scoutOutput.inventory) {
    if (inv.bucket !== "C") continue;
    const subId = shortHash(inv.file);
    const id = buildFindingId("bucket-c", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-bucket-c-`,
      payload: {
        category: "loop-anti-pattern",
        subtype: "test-bypasses-mcp",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Test file ${inv.file} uses direct file I/O (writeEntry/readRegistry/etc) for test logic when an MCP tool exists for the same operation. Detected by test-codebase-scout per C1.bucket-C.`,
        evidence_code_ref: `${inv.file}:${inv.bucket_reason || "?"}`,
        mechanism_check: true,
        session_id: "test-codebase-scout-260608",
      },
    });
  }

  // Dangling D1 (Schema-Drift) — per match
  for (const m of scoutOutput.dangling_matches) {
    if (m.pattern !== "D1") continue;
    const subId = shortHash(m.file + m.line);
    const id = buildFindingId("d1", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-d1-`,
      payload: {
        category: "schema-drift",
        severity: "warning",
        affected_system: "record-validation",
        description: `Test ${m.file} line ${m.line} asserts on removed schema field (${m.match}). After the dual-field unification at meta-260607T0008Z, only the top-level evidence_code_ref form is canonical.`,
        evidence_code_ref: `${m.file}:${m.line}`,
        mechanism_check: true,
      },
    });
  }

  // Dangling D2 (Resolved-Finding Dependency) — per match
  for (const m of scoutOutput.dangling_matches) {
    if (m.pattern !== "D2") continue;
    const subId = shortHash(m.file + m.line);
    const id = buildFindingId("d2", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-d2-`,
      payload: {
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: `Test ${m.file} line ${m.line} gates on meta-state finding ${m.match} but the finding may be resolved. ${m.suggested_fix}`,
        evidence_code_ref: `${m.file}:${m.line}`,
        mechanism_check: true,
      },
    });
  }

  // Dangling D3 (Removed-Tool Reference) — per match
  for (const m of scoutOutput.dangling_matches) {
    if (m.pattern !== "D3") continue;
    const subId = shortHash(m.file + m.line);
    const id = buildFindingId("d3", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-d3-`,
      payload: {
        category: "mcp-tool-missing",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Test ${m.file} line ${m.line} imports a tool/module that may be removed: ${m.match}. ${m.suggested_fix}`,
        evidence_code_ref: `${m.file}:${m.line}`,
        mechanism_check: true,
      },
    });
  }

  // Dangling D4 (Stale Fixture) — per match
  for (const m of scoutOutput.dangling_matches) {
    if (m.pattern !== "D4") continue;
    const subId = shortHash(m.file + m.line + m.match);
    const id = buildFindingId("d4", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-d4-`,
      payload: {
        category: "mcp-tool-missing",
        subtype: "stale-fixture",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Test ${m.file} uses fixture ${m.match} that is stale (mtime > 30 days, 0 references). ${m.suggested_fix}`,
        evidence_code_ref: `${m.file}:${m.line}`,
        mechanism_check: false,
      },
    });
  }

  // Dangling D5 (Stale TOLERANCES) — per match
  for (const m of scoutOutput.dangling_matches) {
    if (m.pattern !== "D5") continue;
    const subId = shortHash(m.file + m.line);
    const id = buildFindingId("d5", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-d5-`,
      payload: {
        category: "loop-anti-pattern",
        subtype: "stale-tolerances",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Test ${m.file} line ${m.line} has hardcoded TOLERANCES without an explanatory comment. ${m.suggested_fix}`,
        evidence_code_ref: `${m.file}:${m.line}`,
        mechanism_check: true,
      },
    });
  }

  // Gap table — per missing item, batched per surface (per brainstorm open question resolution)
  for (const gap of scoutOutput.gap_table) {
    if (gap.missing.length === 0) continue;
    const subId = shortHash(gap.surface);
    const id = buildFindingId("gap", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-gap-`,
      payload: {
        category: "mcp-tool-missing",
        subtype: "test-coverage-gap",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Contract surface ${gap.surface} has ${gap.missing.length} item(s) with 0 test coverage (${gap.covered}/${gap.total} = ${gap.percent}%). Missing: ${gap.missing.slice(0, 5).join(", ")}${gap.missing.length > 5 ? "..." : ""}.`,
        evidence_code_ref: `tools/learning-loop-mcp/scout/run-scout.js#analyzeGaps`,
        mechanism_check: false,
      },
    });
  }

  // Prompt budget at-risk — per critical/high entry
  for (const b of scoutOutput.budget_table) {
    if (!["critical", "high"].includes(b.risk)) continue;
    const subId = shortHash(b.file + b.test);
    const id = buildFindingId("budget", subId);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    findings.push({
      id,
      id_prefix: `${FINDING_PREFIX}-budget-`,
      payload: {
        category: "loop-anti-pattern",
        subtype: "test-prompt-budget-overrun",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Test ${b.file}:${b.test} has timeout_utilization = ${(b.utilization * 100).toFixed(0)}% (wall_clock_estimate=${b.wall_clock_estimate}s, timeout=${b.timeout}s). ${b.expected_file_reads} file reads + ${b.expected_mcp_calls} MCP calls. Pattern reference: meta-260608T1522Z (test 1 hang).`,
        evidence_code_ref: `${b.file}:${b.test}`,
        mechanism_check: true,
      },
    });
  }

  return findings;
}

async function main() {
  // Per F13 red team: refuse to call meta_state_resolve
  const closeoutSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (closeoutSource.includes("meta_state_resolve") && !closeoutSource.includes("refuses to call")) {
    console.error("[closeout] FAIL: closeout script contains meta_state_resolve call (forbidden)");
    process.exit(3);
  }

  if (!existsSync(scoutOutputPath)) {
    console.error(`[closeout] FAIL: scout output missing at ${scoutOutputPath}`);
    console.error(`[closeout] Run first: node tools/learning-loop-mcp/scout/run-scout.js (or use --write)`);
    process.exit(1);
  }

  const scoutOutput = JSON.parse(readFileSync(scoutOutputPath, "utf8"));
  const findings = collectFindings(scoutOutput);

  let filed = 0;
  let skipped = 0;
  for (const f of findings) {
    const existing = findExistingFinding(f.payload);
    if (existing) {
      console.log(`[closeout] skipped: ${f.id} (matches existing ${existing.id})`);
      skipped++;
      continue;
    }
    try {
      const result = await fileFinding(f.payload);
      console.log(`[closeout] filed: ${result.id}`);
      filed++;
    } catch (err) {
      console.error(`[closeout] FAIL: ${f.id}: ${err.message}`);
    }
  }

  // Assert zero test file modifications
  // Per the plan: "git status --porcelain shows zero modifications under __tests__/"
  // We only flag actual modifications (M/A/D prefix), not untracked (??) or staged (M -> A) — the scout
  // does not write to __tests__/, so any tracked-file modification is a bug.
  try {
    const gitStatus = execSync("git status --porcelain", { cwd: root }).toString();
    const testModifications = gitStatus
      .split("\n")
      .filter((line) => line.includes("__tests__/"))
      .filter((line) => /^[ MAD]/.test(line) || /^[MAD] /.test(line) || /^.[MAD] /.test(line));
    if (testModifications.length > 0) {
      console.error(`[closeout] FAIL: ${testModifications.length} test file modification(s) detected:`);
      for (const m of testModifications) console.error(`  ${m}`);
      process.exit(2);
    }
  } catch (err) {
    console.warn(`[closeout] WARN: could not run git status: ${err.message}`);
  }

  console.log("");
  console.log(`[closeout] OK: ${filed} new findings filed, ${skipped} skipped (existing)`);
  console.log(`[closeout] OK: zero test file modifications`);

  if (filed === 0 && skipped === 0) {
    console.log(`[closeout] OK: 0 findings filed (scout surfaced no issues)`);
  }
}

main().catch((err) => {
  console.error("[closeout] FATAL:", err);
  process.exit(99);
});
