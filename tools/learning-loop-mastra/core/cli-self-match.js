// cli-self-match.js — Phase 1 of plans/260722-1343-write-capable-cli-w.
//
// Single source of truth for the canonical CLI invocation shapes that a
// regex rule MUST NOT match. The promote-rule tool's activation path uses
// `matchesCliTransport(pattern)` to reject any regex that would intercept
// the loop's own CLI transport (`node bin/loop.mjs ...`).
//
// Why regex-only:
//   - `command`-matching patterns are the only path that can intercept the
//     bash gate. `glob` rules match `filePath`, which is null for bash
//     commands. `agent-checklist` and `determinism-checklist` patterns are
//     `continue`'d in `applyPromotedRules` (core/gate-logic.js:937-1019)
//     without ever being tested against a bash command string. So the
//     guard is regex-only by construction; glob/agent-checklist rules
//     naming the bin path do NOT intercept evaluateBashGate.
//
// Shape coverage (the literal forms a runtime would write):
//   - relative canonical: `node tools/learning-loop-mastra/bin/loop.mjs`
//   - absolute canonical: `node <resolved loop-root>/bin/loop.mjs`
//     (resolved from `bin/loop.mjs`'s `__dirname` at module load, then
//     regex-escaped so a tmpdir / symlink survives a literal match)
//   - bare forms: `bin/loop.mjs` and `loop.mjs` (handles wrappers that
//     invoke the bin via PATH or rel-path)
//
// Symlinks, `npx`/`pnpm exec` wrapping, and any other indirection are
// intentionally NOT covered — they would be brittle, and the
// exclude-`promote_rule` escape hatch in CLI_WRITE_TOOLS is the
// operator-visible fallback if a real variant slips through.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = join(__dirname, "..", "bin", "loop.mjs");

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Resolve the absolute CLI bin path. The relative canonical shape is the
// primary defense; the absolute path only matters if a runtime ever
// invokes the CLI via `cd /tmp && node /abs/.../loop.mjs`. We attempt the
// resolve; if the path does not exist on disk (test fixtures, packed
// installs), the absolute shape is silently skipped.
function absoluteBinLiteral() {
  if (!existsSync(CLI_BIN)) return null;
  return CLI_BIN;
}

/**
 * Return the canonical CLI invocation shapes as regex source strings.
 * The list is shared between the guard and the test (single source of truth).
 *
 * @returns {string[]} array of regex source strings; each is `new RegExp()`-safe
 */
export function canonicalCliInvocationShapes() {
  const shapes = [
    // Relative canonical: `node tools/learning-loop-mastra/bin/loop.mjs`
    String.raw`\bnode\s+tools/learning-loop-mastra/bin/loop\.mjs\b`,
    // Bare forms: `bin/loop.mjs` and `loop.mjs` (PATH / rel-path wrappers)
    String.raw`\bnode\s+.*bin/loop\.mjs\b`,
    String.raw`\bnode\s+.*loop\.mjs\b`,
  ];
  const abs = absoluteBinLiteral();
  if (abs) shapes.push(escapeForRegex(abs));
  return shapes;
}

// Compile the canonical shapes once at module load. Failures are silent
// because every shape here is a hand-curated literal — if a future edit
// introduces a syntax error, the assertion in the test will catch it.
function compileShapes() {
  const sources = canonicalCliInvocationShapes();
  return sources.map((s) => {
    try {
      return { source: s, re: new RegExp(s) };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

const SHAPE_REGEXES = compileShapes();

// The actual literal command strings we'd never want a regex to match.
// Used for the inverted test (does the user's pattern match the literal?).
// Note: SHAPE_REGEXES is the regex form (used by `applyPromotedRules`).
// SHAPE_LITERALS is the command-string form we test the user's regex against.
const SHAPE_LITERALS = [
  "node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{}'",
  "node bin/loop.mjs meta_state_list '{}'",
  "node loop.mjs meta_state_list '{}'",
];
const ABS_BIN = absoluteBinLiteral();
if (ABS_BIN) SHAPE_LITERALS.push(`node ${ABS_BIN} meta_state_list '{}'`);

/**
 * True iff `pattern` (a regex source string) would match any canonical
 * CLI invocation literal. Used by the promote-rule activation path to
 * reject self-bricking regexes.
 *
 * Strategy: compile `pattern`, then test it against the actual command
 * strings a runtime would issue. If any match, the regex would intercept
 * the CLI transport and is rejected.
 *
 * @param {string} pattern — a regex source string (compiled with `new RegExp(pattern)`)
 * @returns {boolean}
 */
export function matchesCliTransport(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) return false;
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    // A pattern that does not even compile cannot self-brick the CLI
    // transport; the existing regex safety checks downstream will catch
    // it. Return false so the guard does not over-reach.
    return false;
  }
  return SHAPE_LITERALS.some((literal) => re.test(literal));
}
