// core/pattern-config.js — single load of core/patterns.json + derived gate config.
//
// Owns the one-time readFileSync(patterns.json) so blanking.js and gate-logic.js
// share one load instead of duplicating the parse. Loads once at import (same
// semantics as the per-module loads it replaces); the exported sets/regexes are
// byte-identical to what each module derived locally.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));

// Raw parsed sets (byte-identical to the per-module loads they replace).
export const message_flags = PATTERNS_RAW.message_flags || [];
export const inert_sinks = PATTERNS_RAW["inert-sinks"] || [];
export const gate_verbs = PATTERNS_RAW["gate-verbs"] || [];

export const MESSAGE_FLAGS = new Set(message_flags);
export const INERT_SINKS = new Set(inert_sinks);

// Constraint patterns: every key in patterns.json compiled to a RegExp —
// matches the historical map in gate-logic.js (array-valued keys coerce to
// their comma-joined string form, byte-identical).
export const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)]),
);

// Gate-verbs: structured list of executor verbs (direct + indirection) that
// become observation-gated constraints. Loaded from patterns.json — NOT a
// hardcoded list. Each entry is either a bare string ("bash") for verb-only
// match, or an object {verb, flags} for verb+flag match (e.g. node -e), or
// {verb, indirection: true} for verbs that only count when followed by an
// executor (env bash, xargs bash).
export const GATE_VERBS = (() => {
  const raw = PATTERNS_RAW["gate-verbs"];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) =>
    typeof entry === "string"
      ? { verb: entry, flags: null, indirection: false }
      : {
          verb: entry.verb,
          flags: Array.isArray(entry.flags) ? entry.flags : null,
          indirection: entry.indirection === true,
        },
  );
})();

// Indirection verbs (env, xargs) ONLY count as gate-verbs when followed by
// an executor. Derived from the same patterns.json config as GATE_VERBS so
// the match path and the observation path (file-readers.js, also config-
// derived) can never drift: removing a verb from config removes it from
// both. `find` is a verb+flag entry (-exec/-execdir/-ok), not indirection.
export const INDIRECTION_VERBS = new Set(
  GATE_VERBS.filter((e) => e.indirection).map((e) => e.verb),
);
