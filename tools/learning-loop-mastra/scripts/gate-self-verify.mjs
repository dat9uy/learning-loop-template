#!/usr/bin/env node
/**
 * gate:self-verify — reproducible local pre-push gate for fix loops.
 *
 * Issue #34 (`meta-260704T0933Z-local-fallow-gate-cannot-fully-self-verify-and-the-file-inde`).
 *
 * Why this wrapper exists:
 *   local `pnpm fallow:gate` is not a reliable pre-push check for complexity findings. Two coupled issues from PR #33:
 *     (a) Fallow locally fails to match coverage for some functions despite
 *         100% statement coverage in coverage-final.json (yields `crap: ?`
 *         and false `introduced: true` flags).
 *     (b) Editing a source file desyncs file-index.jsonl which fails the
 *         cold-tier grounding test, which produces incomplete coverage,
 *         which compounds the false positives.
 *
 * The contract this wrapper enforces:
 *   1. Re-seed file-index.jsonl via seed-file-index.mjs so every cited
 *      path's fingerprint matches the current source-tree SHA-256.
 *   2. Regenerate Istanbul coverage by running `pnpm test` with a fully-
 *      passing suite, so coverage-final.json matches the c8 output.
 *   3. Delegate to `pnpm fallow:gate` with that coverage in place.
 *   4. Emit a clear caveat at startup so operators know to cross-check
 *      introduced findings' `crap`/`coverage_pct` fields (absent =
 *      coverage-unmatched = likely a local artifact, NOT a real CI
 *      regression).
 *
 * Usage:
 *   pnpm gate:self-verify
 *
 * Exit codes:
 *   0 — every step succeeded; fallow:gate verdict is pass-or-fail per its own
 *       script (this wrapper inherits it).
 *   non-zero — fingerprint seed, test run, or fallow:gate exited non-zero.
 *
 * Out of scope:
 *   - Does NOT call gh, gh-CI, or any vendor API.
 *   - Does NOT mutate meta-state, runtime-state, or records.
 *   - Does NOT modify source files.
 */

import { spawnSync } from "node:child_process";

// 1. Caveat FIRST so any operator who ctrl-C'd before seeing it still ran
//    into the explanation. The phrase below is the verbatim contract from
//    issue #34 (`meta-260704T0933Z-local-fallow-gate-cannot-fully-self-verify-and-the-file-inde`).
//    Tests grep the exact phrase so the contract is grep-able across surfaces.
const CAVEAT_FINDING_PHRASE =
  "local `pnpm fallow:gate` is not a reliable pre-push check for complexity findings";

const CAVEAT = [
  "┌──────────────────────────────────────────────────────────────────────────────┐",
  "│ gate:self-verify — local-verification caveat (issue #34)                     │",
  "├──────────────────────────────────────────────────────────────────────────────┤",
  "│ local `pnpm fallow:gate` is not a reliable pre-push check for complexity findings. Fallow │",
  "│ may report `crap: ?` and `introduced: true` on baselined                       │",
  "│ functions when Istanbul coverage fails to match — a local artifact, NOT a     │",
  "│ real CI regression. Cross-check: if an introduced finding lacks `crap` or     │",
  "│ `coverage_pct` fields, treat it as coverage-unmatched (local), not a regression.│",
  "│                                                                              │",
  "│ Ritual: refresh fingerprints → regenerate coverage → run fallow. CI is the    │",
  "│ source of truth for `introduced: true` regressions.                          │",
  "└──────────────────────────────────────────────────────────────────────────────┘",
].join("\n");
console.error(CAVEAT);

const STEPS = [
  {
    name: "seed file-index.jsonl",
    cmd: "node",
    args: ["tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs"],
    why: "Re-hash every cited path so file-index.jsonl matches the current source tree (cold-tier grounding invariant).",
  },
  {
    name: "regenerate coverage via pnpm test",
    cmd: "pnpm",
    args: ["test"],
    why: "Re-emit coverage/coverage-final.json with a fully-passing c8 suite, so the Istanbul path keys in coverage-match fallow are current.",
  },
  {
    name: "delegate to fallow:gate",
    cmd: "pnpm",
    args: ["fallow:gate"],
    why: "Per-script verdict. Treat `introduced: true` findings lacking `crap`/`coverage_pct` as local artifacts; defer to CI for the real verdict.",
  },
];

function runStep(step) {
  console.error(`\n─── ${step.name} ───`);
  console.error(`  ${step.why}`);
  console.error(`  $ ${step.cmd} ${step.args.join(" ")}\n`);
  const result = spawnSync(step.cmd, step.args, { stdio: "inherit", env: process.env });
  if (result.status === 0) return;
  const signalSuffix = result.signal ? ` (signal: ${result.signal})` : "";
  console.error(
    `\n[gate:self-verify] ${step.name} exited with status ${result.status}${signalSuffix}. ` +
      `Aborting before further steps (file-index seed via seed-file-index.mjs is idempotent; re-run safe).`,
  );
  process.exit(result.status ?? 1);
}

for (const step of STEPS) {
  runStep(step);
}

console.error(
  "\n[gate:self-verify] all steps passed. If `pnpm fallow:gate` reports introduced findings\n" +
    "without `crap`/`coverage_pct` fields, cross-reference the original CI SARIF before\n" +
    "treating them as regressions.",
);
process.exit(0);
