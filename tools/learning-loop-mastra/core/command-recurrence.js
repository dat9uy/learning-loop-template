// command-recurrence.js — pure coarse recurrence projection primitives.
//
// These helpers are the temporary compatibility surface for the existing
// recurrence tracker. Command Interpretation exposes only the opaque
// `requestRecurrenceKey` operation; callers should not consume these views.

import { createHash } from "node:crypto";

const COMMAND_PREFIX_MAX_LEN = 50;

/**
 * Normalize a command prefix for the existing toolchain-failure capture path.
 * First 50 chars; remove single + double quotes; collapse whitespace.
 *
 * @param {string} command
 * @returns {string}
 */
export function normalizePrefix(command) {
  if (typeof command !== "string") return "";
  return command
    .slice(0, COMMAND_PREFIX_MAX_LEN)
    .replace(/[\'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tracker-only data blanking for recurrence-key derivation. COARSER than the
 * gate's blanker chain: the recurrence key is a grouping artifact with no
 * bypass consequence, so data-only variants collapse while executable residue
 * remains visible.
 *
 * @param {string} command
 * @returns {string}
 */
// Blank the redirect target token following the LAST `>` in `prefix`.
function blankRedirectTarget(prefix) {
  let idx = -1;
  for (let p = 0; p < prefix.length; p++) if (prefix[p] === ">") idx = p;
  if (idx === -1) return prefix;
  let t = idx + 1;
  while (t < prefix.length && (prefix[t] === ">" || prefix[t] === " " || prefix[t] === "\t")) t++;
  let tEnd = t;
  while (tEnd < prefix.length && !/[\s;]/.test(prefix[tEnd])) tEnd++;
  if (t === tEnd) return prefix;
  return prefix.slice(0, t) + " ".repeat(tEnd - t) + prefix.slice(tEnd);
}

// fallow-ignore-next-line complexity -- single-pass recurrence blanker; the coarse grouping grammar is intentionally explicit
export function blankDataPayloadsForKey(command) {
  if (typeof command !== "string" || !command) return command;
  let out = "";
  let i = 0;
  while (i < command.length) {
    if (command[i] === "<" && command[i + 1] === "<") {
      let opEnd = i + 2;
      if (command[opEnd] === "-") opEnd++;
      // Herestring `<<<` is executable input, not a heredoc body.
      if (command[opEnd] === "<") {
        out += command.slice(i, opEnd + 1);
        i = opEnd + 1;
        continue;
      }
      let j = opEnd;
      while (j < command.length && (command[j] === " " || command[j] === "\t")) j++;
      let k = j;
      while (k < command.length && !/[\s;]/.test(command[k])) k++;
      if (k === j) {
        out += command[i];
        i++;
        continue;
      }
      const termIdx = command.indexOf(";", k);
      const end = termIdx === -1 ? command.length : termIdx;
      out = blankRedirectTarget(out);
      out += command.slice(i, opEnd);
      out += " ".repeat(Math.max(0, k - j));
      out += " ".repeat(Math.max(0, end - k));
      // Preserve a short hash of post-heredoc executable residue. This keeps
      // a trailing real command distinct from the data-only class.
      const residue = command.slice(end).slice(0, 60);
      if (residue) out += " " + createHash("sha256").update(residue).digest("hex").slice(0, 8);
      out += command.slice(end);
      i = command.length;
      continue;
    }
    if (command[i] === "n") {
      const bodyMatch = command.slice(i).match(/^((?:node|nodejs)\s+(?:-e|--eval|-p|--print|--input-type=module)\s+)/);
      if (bodyMatch) {
        const bStart = i + bodyMatch[1].length;
        const keepQuote = command[bStart] === '"' || command[bStart] === "'" ? 1 : 0;
        out += command.slice(i, bStart + keepQuote);
        out += " ".repeat(Math.max(0, command.length - (bStart + keepQuote)));
        i = command.length;
        continue;
      }
    }
    out += command[i];
    i++;
  }
  return out;
}

/**
 * Coarse grouping normalization. Memoized because the tracker scans the same
 * command prefixes in both its per-session and cross-session passes.
 */
const normalizePrefixForKeyCache = new Map();
export function normalizePrefixForKey(command) {
  if (typeof command !== "string") return "";
  if (normalizePrefixForKeyCache.has(command)) return normalizePrefixForKeyCache.get(command);
  const out = normalizePrefix(blankDataPayloadsForKey(command));
  normalizePrefixForKeyCache.set(command, out);
  return out;
}

/**
 * Hash a rule-scoped normalized prefix into the established recurrence tail.
 */
// fallow-ignore-next-line unused-export -- legacy recurrence callers consume this named helper during the compatibility migration
export function hashRecurrenceKey(ruleId, prefix) {
  return createHash("sha256")
    .update(`${ruleId}::${prefix}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Return the complete opaque recurrence identity for a command and Rule.
 * Recurrence is telemetry identity only and never a permission input.
 *
 * @param {string} command
 * @param {string} ruleId
 * @returns {string}
 */
export function projectRecurrenceKey(command, ruleId) {
  if (typeof ruleId !== "string" || !ruleId) return "";
  return `${ruleId}::${hashRecurrenceKey(ruleId, normalizePrefixForKey(command))}`;
}
