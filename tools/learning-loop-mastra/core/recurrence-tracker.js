import { createHash, randomBytes } from "node:crypto";
import { readRegistry, writeEntryIfAbsent } from "./meta-state.js";
import { readJsonlFromAllSurfaces } from "./surfaces.js";

const RECURRENCE_THRESHOLD_N = 3;
const COMMAND_PREFIX_MAX_LEN = 50;
const FALLBACK_TIER_SPAN_MS = 24 * 60 * 60 * 1000;
const CROSS_SESSION_THRESHOLD_N = 5;
const CROSS_SESSION_MIN_REAL_SESSIONS = 2;
const CROSS_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DECISION_LOG_FILE = ".gate-decision.log";

/**
 * Promoted-rule recurrence eligibility. ONLY an explicit, evaluator-produced
 * unexpected-match event — event_source "bash-gate-evaluator" + candidate_kind
 * "unexpected-match" + match_origin "inert-data" — is an automatic recurrence
 * candidate. Every other state (missing fields, unclassified,
 * ordinary-rule-fire, wrong producer, contradictory pair, toolchain source) is
 * telemetry-only.
 *
 * Provenance is a discriminated, fail-closed pair: the tracker never infers
 * candidate kind from rule_id, reason, command prefix, or key collision.
 *
 * @param {object} entry
 * @returns {boolean}
 */
export function isUnexpectedMatchCandidate(entry) {
  return (
    entry?.event_source === "bash-gate-evaluator"
    && entry?.candidate_kind === "unexpected-match"
    && entry?.match_origin === "inert-data"
  );
}

/**
 * Partition an entry into the recurrence grouping path. Toolchain-failure
 * rows (rule_id "toolchain-failure") keep the EXISTING toolchain grouping
 * semantics exactly — they are never filtered by promoted-rule candidate
 * logic. Every other rule_id requires the evaluator-produced
 * unexpected-match trio; a wrong producer marker (e.g. a
 * toolchain-failure-capture-sourced row carrying a promoted-rule rule_id),
 * missing provenance, or a contradictory pair is ineligible.
 *
 * @param {object} entry
 * @returns {boolean}
 */
function isRecurrenceGroupableEntry(entry) {
  if (!entry?.rule_id) return false;
  if (entry.rule_id === "toolchain-failure") return true;
  return isUnexpectedMatchCandidate(entry);
}

/**
 * Same-identity key used by the cross-surface JSONL reader to dedupe. Matches
 * readJsonlFromAllSurfaces exactly: ts::command_prefix::rule_id::decision::
 * session_id. Provenance is deliberately NOT part of the key, so a
 * same-identity row fan-out across surfaces with differing provenance must be
 * detected before dedup order can select a surface winner.
 */
function decisionLogIdentityKey(entry) {
  return `${entry.ts}::${entry.command_prefix ?? ""}::${entry.rule_id ?? ""}::${entry.decision ?? ""}::${entry.session_id ?? ""}`;
}

function provenanceSignature(entry) {
  return `${entry.event_source ?? ""}|${entry.match_origin ?? ""}|${entry.candidate_kind ?? ""}`;
}

/**
 * Read the cross-surface decision log with provenance-conflict downgrade.
 * Uses readJsonlFromAllSurfaces with dedupe:false to get the FULL raw union
 * of every surface's lines (the cross-surface JSONL reader is the only
 * surfaces.js helper; a hand-rolled per-surface loop would break the
 * core/ no-inline-SURFACES-iteration invariant). BEFORE any dedup order can
 * pick a surface winner, detects same-identity rows whose provenance differs
 * across surfaces and downgrades them to candidate_kind "unclassified" /
 * match_origin "unknown" (fail closed). A `.claude` unexpected-match row +
 * `.factory` ordinary row for one identity is one conflicted event that can
 * never auto-file.
 *
 * The raw union is read in surface order (`.claude`, `.factory`,
 * `.mastracode`); identical rows (duplicated on the same surface, or
 * byte-identical fan-out across surfaces) dedupe to the first occurrence with
 * the SAME provenance signature, preserving the reader's previous behavior.
 * The full log is scanned — no `since` filter.
 *
 * @param {string} root
 * @returns {Array} deduped, ts-sorted entries (conflicted identities downgraded)
 */
function readDecisionLogEntries(root) {
  const raw = readJsonlFromAllSurfaces(root, DECISION_LOG_FILE, {
    dedupe: false,
    since: 0,
    sort: "none",
  });

  // First pass: per-identity provenance signatures across ALL surfaces.
  const identitySignatures = new Map();
  for (const entry of raw) {
    const key = decisionLogIdentityKey(entry);
    let sigs = identitySignatures.get(key);
    if (!sigs) {
      sigs = new Set();
      identitySignatures.set(key, sigs);
    }
    sigs.add(provenanceSignature(entry));
  }

  // Second pass: dedupe first-occurrence-wins; downgrade conflicted
  // identities BEFORE dedup order can select a surface winner.
  const seen = new Set();
  const entries = [];
  for (const entry of raw) {
    const key = decisionLogIdentityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    const sigs = identitySignatures.get(key);
    if (sigs && sigs.size > 1) {
      entries.push({ ...entry, candidate_kind: "unclassified", match_origin: "unknown" });
      continue;
    }
    entries.push(entry);
  }
  entries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return entries;
}

/**
 * Privacy-safe command samples for a recurrence group. Automatic candidates
 * must not surface raw command payloads through gate_check_recurrence: each
 * sample is reduced to the provenance classes plus a short opaque hash of the
 * raw prefix (correlation without payload reconstruction).
 *
 * @param {Array} entries
 * @returns {Array<{ match_origin: string, candidate_kind: string, prefix_hash: string }>}
 */
function privacySafeSample(entries) {
  return entries.slice(0, 3).map((e) => ({
    match_origin: e.match_origin ?? "unknown",
    candidate_kind: e.candidate_kind ?? "unclassified",
    prefix_hash: createHash("sha256").update(e.command_prefix ?? "").digest("hex").slice(0, 8),
  }));
}

/**
 * Normalize a command prefix for grouping.
 * First 50 chars; remove single + double quotes; collapse whitespace.
 *
 * @param {string} command
 * @returns {string}
 */
export function normalizePrefix(command) {
  if (typeof command !== "string") return "";
  return command
    .slice(0, COMMAND_PREFIX_MAX_LEN)
    .replace(/['"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tracker-only data-blanking for recurrence-key derivation. COARSER than the
 * gate's blanker chain (`stripHeredocBodies`): the recurrence key is a
 * grouping artifact with NO bypass consequence, so it blanks classes the gate
 * deliberately keeps visible:
 *
 *   (a) ALL heredoc bodies — quoted `<<'EOF'` AND unquoted `<<EOF` (the
 *       residual class the gate leaves visible). The body can vary per
 *       occurrence (different data lines) while the root-cause class is one.
 *   (b) `node -e` / `--input-type=module` bodies from the opening quote to
 *       end — escaped-quote-tolerant (the documented `stripNodeEvalBody`
 *       limitation: it stops at the first `\"`). The key must collapse
 *       `node -e "a"` / `node -e "b"` / escaped variants into one class.
 *   (c) The redirect target and delimiter word for blankable-verb heredocs,
 *       so `cat > /tmp/VARYING <<'EOF'` shapes collapse (the live logged
 *       shapes carry varying redirect paths + delimiter names).
 *
 * Over-collapse guard: the key is salted with a residue of POST-heredoc real
 * command text, so data-only body variants collapse but a distinct trailing
 * real command (`; vitest run | tail` after the heredoc) does NOT collapse
 * into the false-positive class. Concretely, a short hash of the tokens
 * following the heredoc terminator is appended to the blanked string.
 *
 * This function returns a string for HASHING ONLY — it never reaches the gate
 * decision path. `normalizePrefix` (the shared capture-time redactor used by
 * toolchain-failure-capture.js and the debug emitters) is UNCHANGED; the
 * coarser blanking lives only here, applied at scan time.
 */
// Blank the redirect target token following the LAST `>` in `prefix` (e.g.
// `/tmp/VARYING` in `cat > /tmp/VARYING <<'EOF'`), preserving surrounding
// whitespace so the 50-char truncation window stays stable. Varying redirect
// paths are a data variant of one root-cause class, not distinct classes.
function blankRedirectTarget(prefix) {
  let idx = -1;
  for (let p = 0; p < prefix.length; p++) if (prefix[p] === ">") idx = p;
  if (idx === -1) return prefix;
  let t = idx + 1;
  while (t < prefix.length && (prefix[t] === ">" || prefix[t] === " " || prefix[t] === "\t")) t++;
  let tEnd = t;
  while (tEnd < prefix.length && !/[\s;]/.test(prefix[tEnd])) tEnd++;
  if (t === tEnd) return prefix; // no target token
  return prefix.slice(0, t) + " ".repeat(tEnd - t) + prefix.slice(tEnd);
}

// fallow-ignore-next-line complexity -- single-pass blanker; keeps the gate and tracker blanker chains locally readable
export function blankDataPayloadsForKey(command) {
  if (typeof command !== "string" || !command) return command;
  let out = "";
  let i = 0;
  while (i < command.length) {
    // Heredoc operator detection — outside quotes. The tracker's input is the
    // one-line-flattened command_prefix (newlines already replaced with
    // spaces), so the terminator boundary is the next `;` after the delimiter
    // word (the delimiter appears as a standalone token before it).
    if (command[i] === "<" && command[i + 1] === "<") {
      let opEnd = i + 2;
      if (command[opEnd] === "-") opEnd++;
      // Herestring `<<<` — not a heredoc, leave visible (its body executes).
      // Emit the ENTIRE `<<<` operator and advance past it — emitting only one
      // `<` would leave the remaining `<<` re-parsed as a heredoc and blank
      // whatever follows to end (a real command on the next line).
      if (command[opEnd] === "<") {
        out += command.slice(i, opEnd + 1);
        // fallow-ignore-next-line code-duplication -- mirror of the gate-side blanker; kept parallel so gate and tracker stay independently readable
        i = opEnd + 1;
        continue;
      }
      // Parse the delimiter word (quoting chars are part of it in the
      // gate-log path; the toolchain-failure path pre-stripped them).
      let j = opEnd;
      while (j < command.length && (command[j] === " " || command[j] === "\t")) j++;
      let k = j;
      while (k < command.length && !/[\s;]/.test(command[k])) k++;
      if (k === j) {
        out += command[i];
        i++;
        continue; // no delimiter word — not a recognizable heredoc
      }
      // Blank through the next `;` (the one-line-flattened terminator
      // boundary) or to end when unterminated — the 80-char window may cut
      // the body before its terminator. The body + closing delimiter are DATA
      // either way.
      const termIdx = command.indexOf(";", k);
      const end = termIdx === -1 ? command.length : termIdx;
      // (c) Redirect target + opening delimiter word blanked: `cat >
      // /tmp/VARYING <<'EOF'` and `cat > /tmp/OTHER <<"BOUNDARY"` collapse
      // to the same class. The closing delimiter word lives in the body span
      // `[k, end)` and is blanked with it. The prefix chars before the `<<`
      // are already in `out` — rewrite them with the redirect target blanked.
      out = blankRedirectTarget(out);
      out += command.slice(i, opEnd); // keep the `<<` / `<<-` operator
      out += " ".repeat(Math.max(0, k - j)); // blank the opening delimiter
      out += " ".repeat(Math.max(0, end - k)); // blank the body + closing delim
      // Over-collapse guard: salt with a hash of the post-terminator residue
      // (the real command that follows the heredoc), so a distinct trailing
      // `; vitest run | tail` does NOT collapse into the bare-heredoc class.
      const residue = command.slice(end).slice(0, 60);
      if (residue) {
        out += " " + createHash("sha256").update(residue).digest("hex").slice(0, 8);
      }
      out += command.slice(end);
      i = command.length;
      continue;
    }
    // `node -e` / `--input-type=module` body — blank the eval body to END,
    // escaped-quote-tolerant (the gate's stripNodeEvalBody stops at the first
    // `\"`; blanking to end sidesteps the escape ambiguity — the true closing
    // quote is unreliable to locate). The key must collapse ALL body variants
    // — quoted (`"x"`, `'y'`, `\"escaped\"`) AND unquoted (`node -e  echo
    // foo`) — into one class, because the eval body is data either way. A
    // single opening quote char is preserved so normalizePrefix's quote-strip
    // normalizes the quoted forms to the same key as the unquoted form.
    if (command[i] === "n") {
      const bodyMatch = command.slice(i).match(/^((?:node|nodejs)\s+(?:-e|--eval|-p|--print|--input-type=module)\s+)/);
      if (bodyMatch) {
        const bStart = i + bodyMatch[1].length;
        let keepQuote = 0;
        if (command[bStart] === '"' || command[bStart] === "'") keepQuote = 1;
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
 * Tracker-only key normalization. Applies `blankDataPayloadsForKey` first
 * (coarser than the gate), then reuses `normalizePrefix` for the existing
 * quote-strip / whitespace-collapse / 50-char truncation pipeline. Memoized
 * per entry so the two scan passes (per-session + cross-session) don't pay
 * the blanking cost twice. The cache is an unbounded module-global Map by
 * design: the tracker only runs in short-lived processes (the gate_check
 * recurrence CLI call and the recurrence-check-on-start SessionStart hook),
 * so it is bounded by decision-log size per scan and freed on process exit.
 * If the tracker ever moves into a long-lived server process, add an LRU cap.
 *
 * @param {string} command
 * @returns {string}
 */
const normalizePrefixForKeyCache = new Map();
export function normalizePrefixForKey(command) {
  if (typeof command !== "string") return "";
  if (normalizePrefixForKeyCache.has(command)) {
    return normalizePrefixForKeyCache.get(command);
  }
  const out = normalizePrefix(blankDataPayloadsForKey(command));
  normalizePrefixForKeyCache.set(command, out);
  return out;
}

/**
 * Hash a (rule_id, prefix) pair into the 16-hex-char recurrence-key tail.
 *
 * `rule_id` is mixed into the hash input so identical prefixes under
 * different rules produce different keys (a false cross-rule collision
 * would either suppress a real burst or co-file two findings under one
 * key — both undesirable).
 *
 * @param {string} ruleId
 * @param {string} prefix
 * @returns {string} 16 hex chars (64 bits, birthday-safe far beyond registry scale)
 */
// fallow-ignore-next-line unused-export -- public API consumed by gate-recurrence tests to assert key derivation
export function hashRecurrenceKey(ruleId, prefix) {
  return createHash("sha256")
    .update(`${ruleId}::${prefix}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Fallback-tier span bound: worktree-hash buckets are lifetime-accumulating,
 * so they fire only when the whole bucket spans <= 24h (per-worktree is a
 * coarse session proxy, not a lifetime counter). Entries arrive ts-sorted
 * from readDecisionLog.
 */
function passesFallbackSpanBound(entries) {
  const isFallback = entries.some((e) => e.session_id_tier === "fallback");
  if (!isFallback) return true;
  const firstMs = new Date(entries[0].ts).getTime();
  const lastMs = new Date(entries[entries.length - 1].ts).getTime();
  return lastMs - firstMs <= FALLBACK_TIER_SPAN_MS;
}

/**
 * Find all (rule_id, command_prefix_normalized) groups that exceed the
 * threshold within a single session.
 *
 * Grouping is by `(rule_id, normalized_prefix, session_id)` with threshold
 * N>=3 PER SESSION and NO `since` time filter. The full append-only log is
 * scanned; the dedup layer and the hashed `recurrence_key` handle re-filing.
 *
 * Clean cutover: entries with no `session_id` group into a bucket that
 * never fires — otherwise the historical backlog (~28.7K lines) would file
 * ~14 stale lifetime-accumulated findings on the first post-ship SessionStart.
 *
 * Fallback-tier span bound: when the grouping session_id came from the
 * worktree fallback (not a real UUID), the bucket is lifetime-accumulating;
 * it fires only if `last_ts - first_ts <= 24h` (per-worktree is a coarse
 * session proxy, not a lifetime counter).
 *
 * @param {string} root
 * @param {object} options
 * @param {number} options.threshold
 * @param {object} [options.out] — optional sink; receives
 *   `{ log_entries_scanned }` (decision-log lines read, for the latency
 *   tripwire — the scan cost scales with this, not with registry size)
 * @returns {Array}
 */
export function findRecurrentGroups(root, options = {}) {
  const threshold = options.threshold ?? RECURRENCE_THRESHOLD_N;

  // Scan the full log — no `since` filter. `since` is a tool, not the
  // default; the trigger relies on dedup, not time-window pruning. The read
  // detects cross-surface provenance disagreement (fail closed) before dedup
  // order can select a surface winner.
  const allEntries = readDecisionLogEntries(root);
  if (options.out) options.out.log_entries_scanned = allEntries.length;
  // (Clean-cutover rule: entries with no session_id group into a bucket that
  // never fires, so the historical backlog does not flood the first post-ship
  // SessionStart. Fallback-tier session_ids are bounded to a 24h span.)
  //
  // Eligibility is applied at GROUPING time, not scan time: `entries_scanned`
  // still reports the full decision-log line count. Only explicit
  // evaluator-produced unexpected-match events (plus toolchain-failure rows on
  // their own branch) enter a group; ordinary rule fires and unclassified/
  // legacy rows remain telemetry.

  /** @type {Map<string, { rule_id: string, command_prefix_normalized: string, session_id: string, entries: Array }>} */
  const groups = new Map();
  for (const entry of allEntries) {
    if (!isRecurrenceGroupableEntry(entry)) continue;
    const sid = entry.session_id ?? "no-session";
    // Clean cutover: never fire on no-session entries (historical backlog).
    if (sid === "no-session") continue;
    // Key normalization is the COARSER tracker-side pass (blankDataPayloadsForKey
    // first, then the shared normalizePrefix pipeline), so all payload variants
    // of one root-cause class under one rule hash to a single recurrence_key.
    const normalized = normalizePrefixForKey(entry.command_prefix);
    const key = `${entry.rule_id}::${normalized}::${sid}`;
    if (!groups.has(key)) {
      groups.set(key, { rule_id: entry.rule_id, command_prefix_normalized: normalized, session_id: sid, entries: [] });
    }
    groups.get(key).entries.push(entry);
  }

  const recurrent = [];
  for (const group of groups.values()) {
    if (group.entries.length < threshold) continue;
    const entries = group.entries;
    if (!passesFallbackSpanBound(entries)) continue;
    recurrent.push({
      rule_id: group.rule_id,
      command_prefix_normalized: group.command_prefix_normalized,
      session_id: group.session_id,
      count: entries.length,
      first_ts: entries[0].ts,
      last_ts: entries[entries.length - 1].ts,
      sample_commands: privacySafeSample(entries),
    });
  }

  // Cross-session slow-burn pass: sub-threshold-per-session failures that
  // accumulate across >=2 REAL-tier sessions within 7 days file a lower-
  // confidence finding. See findCrossSessionGroups for the guards.
  recurrent.push(...findCrossSessionGroups(allEntries, recurrent));

  return recurrent;
}

/**
 * Cross-session slow-burn pass: a prefix with >=5 occurrences across >=2
 * distinct REAL-tier sessions in a trailing 7-day window, where no
 * within-window single session crossed the per-session threshold, files
 * a lower-confidence recurring-false-positive finding. The dedup layer
 * and the hashed `recurrence_key` handle re-filing uniformly with the
 * per-session pass.
 *
 * `firedKeys` is built from within-window per-session groups only; a stale
 * out-of-window per-session burst does NOT enter firedKeys and so does
 * NOT suppress a fresh slow-burn. The cross-session pass counts distinct
 * REAL-tier session_ids only — fallback session_ids contribute to `count`
 * but cannot satisfy the distinct-session requirement on their own (defeats
 * single-worktree branch-switch false positive). The window is enforced at
 * the grouping step, not at collapseFreshByKey.
 *
 * @param {Array} allEntries — decision-log entries (ts-sorted), shared with the per-session pass.
 * @param {Array} recurrent — within-window per-session groups, used to build the dedup firedKeys set.
 * @returns {Array} cross-session slow-burn groups to append to `recurrent`.
 */
function findCrossSessionGroups(allEntries, recurrent) {
  const windowStart = Date.now() - CROSS_SESSION_WINDOW_MS;
  const firedKeys = withinWindowFiredKeys(recurrent, windowStart);
  // Same eligibility filter as the per-session pass: only explicit
  // unexpected-match candidates and toolchain-failure rows may accumulate
  // across sessions. Ordinary/legacy/unclassified rows never enter a
  // cross-session group.
  const eligible = allEntries.filter(isRecurrenceGroupableEntry);
  const crossGroups = groupCrossSessionEntries(eligible, windowStart);
  return emitCrossSessionGroups(crossGroups, firedKeys);
}

/**
 * Build the set of recurrence keys already covered by a within-window
 * per-session group. A stale out-of-window per-session burst does NOT enter
 * this set, so it cannot suppress a fresh slow-burn (red-team Finding 1).
 *
 * @param {Array} recurrent
 * @param {number} windowStart
 * @returns {Set<string>}
 */
function withinWindowFiredKeys(recurrent, windowStart) {
  /** @type {Set<string>} */
  const firedKeys = new Set();
  for (const g of recurrent) {
    const lastMs = new Date(g.last_ts).getTime();
    if (Number.isFinite(lastMs) && lastMs >= windowStart) {
      firedKeys.add(recurrenceKeyFor(g));
    }
  }
  return firedKeys;
}

/**
 * Group within-window entries by (rule_id, normalized_prefix), ignoring
 * session_id. Null-rule_id, no-session, and out-of-window / NaN-ts entries
 * are skipped. Fallback session_ids contribute to `count` but only REAL-tier
 * ids are tracked in `realSessions` — the distinct-session requirement is
 * real-tier-only (defeats single-worktree branch-switch false positive).
 *
 * @param {Array} allEntries
 * @param {number} windowStart
 * @returns {Map<string, { rule_id: string, command_prefix_normalized: string, entries: Array, realSessions: Set<string> }>}
 */
function groupCrossSessionEntries(allEntries, windowStart) {
  /** @type {Map<string, { rule_id: string, command_prefix_normalized: string, entries: Array, realSessions: Set<string> }>} */
  const crossGroups = new Map();
  for (const entry of allEntries) {
    if (!entry.rule_id) continue;
    const tsMs = new Date(entry.ts).getTime();
    if (!Number.isFinite(tsMs) || tsMs < windowStart) continue;
    const sid = entry.session_id ?? "no-session";
    if (sid === "no-session") continue;
    const normalized = normalizePrefixForKey(entry.command_prefix);
    const key = `${entry.rule_id}::${normalized}`;
    let cg = crossGroups.get(key);
    if (!cg) {
      cg = { rule_id: entry.rule_id, command_prefix_normalized: normalized, entries: [], realSessions: new Set() };
      crossGroups.set(key, cg);
    }
    cg.entries.push(entry);
    if (entry.session_id_tier === "real") cg.realSessions.add(sid);
  }
  return crossGroups;
}

/**
 * Emit cross-session slow-burn groups that cross the (count, distinct-real-
 * sessions) thresholds and are not already covered by a within-window
 * per-session finding (`firedKeys`). Each group carries
 * `cross_session_slow_burn: true` so `buildFinding` appends the lower-
 * confidence suffix; the persisted finding shape is unchanged.
 *
 * @param {Map<string, { rule_id: string, command_prefix_normalized: string, entries: Array, realSessions: Set<string> }>} crossGroups
 * @param {Set<string>} firedKeys
 * @returns {Array}
 */
function emitCrossSessionGroups(crossGroups, firedKeys) {
  const crossSession = [];
  for (const cg of crossGroups.values()) {
    if (cg.entries.length < CROSS_SESSION_THRESHOLD_N) continue;
    if (cg.realSessions.size < CROSS_SESSION_MIN_REAL_SESSIONS) continue;
    if (firedKeys.has(recurrenceKeyFor(cg))) continue;
    crossSession.push({
      rule_id: cg.rule_id,
      command_prefix_normalized: cg.command_prefix_normalized,
      session_id: latestRealSessionId(cg.entries),
      count: cg.entries.length,
      first_ts: cg.entries[0].ts,
      last_ts: cg.entries[cg.entries.length - 1].ts,
      sample_commands: privacySafeSample(cg.entries),
      sessions_crossing_threshold: cg.realSessions.size,
      cross_session_slow_burn: true,
    });
  }
  return crossSession;
}

/**
 * Pick the latest REAL-tier entry's `session_id` for the surfaced group
 * `session_id` field; fall back to the latest entry overall when no
 * real-tier entry exists.
 *
 * @param {Array} entries
 * @returns {string}
 */
function latestRealSessionId(entries) {
  const latestReal = entries
    .filter((e) => e.session_id_tier === "real")
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))[0];
  return latestReal?.session_id ?? entries[entries.length - 1].session_id;
}

function generateFindingId(ruleId) {
  // Canonical finding-id stamp: YYMMDDTHHMMSS (matches hand-filed ids like
  // meta-260804T1026Z-*). Milliseconds are dropped entirely — slicing raw
  // digits previously kept one ms digit and dropped the T separator.
  const digits = new Date().toISOString().replace(/[^0-9]/g, "");
  const ts = `${digits.slice(2, 8)}T${digits.slice(8, 14)}`;
  // Hash-derived suffix: no raw prefix fragment can survive into the
  // committed registry via the id (red-team Critical: slugify preserves
  // base64url token bodies nearly intact).
  const tail = createHash("sha256")
    .update(`${ruleId}::${randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 8);
  return `meta-${ts}Z-${tail}`;
}

function recurrenceKeyFor(group) {
  return `${group.rule_id}::${hashRecurrenceKey(group.rule_id, group.command_prefix_normalized)}`;
}

/**
 * Build the dedup index from one registry read. Suppression rule: any
 * non-archived recurring-false-positive suppresses. `open`, `accepted`, and
 * `resolved` all hold; `archived` re-admits. No grace-window comparison, no
 * `resolved_at` read. Also builds the rule-record lookup used to derive each
 * finding's evidence_code_ref (the referent grounding co-locates with
 * accepted-limitation findings on that file).
 *
 * Re-file burst note: a key-derivation change (coarser normalizePrefixForKey)
 * can re-file a historically-suppressed class under a NEW recurrence_key.
 * Existing-format findings carry no recoverable prefix in their description
 * (the description redacts raw commands to protect secrets), so a
 * description-keyed suppression fallback cannot match them — it would be dead
 * code. The actual burst mitigation is `existingKeys` (key equality) plus the
 * post-ship re-file triage, which resolves residual duplicates with a
 * same-rule link. Do not embed the normalized prefix in the finding
 * description: it leaks redacted command data into the registry.
 */
function resolveDedupIndex(allEntries) {
  const existing = allEntries.filter(
    (e) =>
      e.entry_kind === "finding"
      && e.subtype === "recurring-false-positive"
      && e.recurrence_key
      && e.status !== "archived",
  );
  const ruleById = new Map();
  for (const e of allEntries) {
    if (e.entry_kind === "rule" && e.id && !ruleById.has(e.id)) {
      ruleById.set(e.id, e);
    }
  }
  return { existing, existingKeys: new Set(existing.map((e) => e.recurrence_key)), ruleById };
}

/**
 * In-call dedup by recurrence_key: multiple per-session groups sharing one
 * prefix (e.g. session A and session B both cross threshold) collapse to a
 * single finding before the write loop. The hashed key is rule-scoped, so
 * cross-rule collapses are impossible.
 */
function collapseFreshByKey(recurrent, existingKeys) {
  const freshByKey = new Map();
  for (const group of recurrent) {
    const recurrenceKey = recurrenceKeyFor(group);
    if (existingKeys.has(recurrenceKey)) continue;
    const prior = freshByKey.get(recurrenceKey);
    if (!prior) {
      freshByKey.set(recurrenceKey, group);
      continue;
    }
    // Same key across calls — keep the richer observation: summed count,
    // earliest first_seen, latest last_seen, accumulated distinct sessions.
    freshByKey.set(recurrenceKey, {
      ...prior,
      count: prior.count + group.count,
      first_ts: prior.first_ts < group.first_ts ? prior.first_ts : group.first_ts,
      last_ts: prior.last_ts > group.last_ts ? prior.last_ts : group.last_ts,
      sessions_crossing_threshold: (prior.sessions_crossing_threshold ?? 1) + 1,
    });
  }
  return Array.from(freshByKey.values());
}

function buildFinding(group, ruleById) {
  const ruleRecord = ruleById.get(group.rule_id);
  // evidence_code_ref resolution: rule record beats defaults; absent records
  // fall back to the rule-class-specific capture hook (not the gate-logic
  // detector). toolchain-failure has no rule record — its source is the
  // PostToolUseFailure hook, so cite the hook as the referent.
  let evidenceCodeRef;
  if (ruleRecord?.evidence_code_ref && typeof ruleRecord.evidence_code_ref === "string") {
    evidenceCodeRef = ruleRecord.evidence_code_ref;
  } else if (group.rule_id === "toolchain-failure") {
    evidenceCodeRef = "tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js";
  } else {
    evidenceCodeRef = "tools/learning-loop-mastra/core/gate-logic.js";
  }
  const description =
      `Pattern recurred ${group.count} time(s) across ${group.sessions_crossing_threshold ?? 1} session(s) ` +
      `(latest: ${group.session_id}) under rule ${group.rule_id}. ` +
      `First seen: ${group.first_ts}. Last seen: ${group.last_ts}.` +
      (group.cross_session_slow_burn
        ? ` (cross-session slow-burn: no single session reached the per-session threshold of ${RECURRENCE_THRESHOLD_N})`
        : "");
  return {
    id: generateFindingId(group.rule_id),
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    subtype: "recurring-false-positive",
    recurrence_key: recurrenceKeyFor(group),
    description,
    evidence_code_ref: evidenceCodeRef,
    mechanism_check: true,
    status: "open",
    created_at: new Date().toISOString(),
  };
}

/**
 * Check for recurrent groups and auto-file findings (deduped against existing).
 * Returns { checked_groups, findings_emitted, recurrent, entries_scanned }
 * where entries_scanned is the DECISION-LOG line count (the latency-tripwire
 * metric; the full-log scan cost scales with it).
 *
 * @param {string} root
 * @param {object} options
 * @returns {{ checked_groups: number, findings_emitted: number, recurrent: Array, entries_scanned: number }}
 */
export async function checkAndEmit(root, options = {}) {
  const scanOut = {};
  const recurrent = findRecurrentGroups(root, { ...options, out: scanOut });

  // One registry read covers the dedup filter AND the evidence_code_ref
  // derivation. Race-safety: `writeEntryIfAbsent` acquires
  // `withRegistryLock(root)` and serializes via the per-root enqueue queue;
  // the unlocked pre-filter is the fast path and the cross-process race
  // window self-heals on the next session via the same filter.
  const { existing, existingKeys, ruleById } = resolveDedupIndex(readRegistry(root));
  const fresh = collapseFreshByKey(recurrent, existingKeys);

  const dryRun = process.env.GATE_RECURSION_DRY_RUN === "1";
  let written = 0;
  for (const group of fresh) {
    if (dryRun) continue;
    // writeEntryIfAbsent re-checks the registry inside the lock, so two
    // concurrent SessionStart processes serialize on `withRegistryLock`
    // and only one wins per `recurrence_key`. The unlocked pre-filter
    // remains the fast path; this is the correctness boundary.
    const res = await writeEntryIfAbsent(root, buildFinding(group, ruleById));
    if (res.written) {
      written++;
    } else if (res.suppressed_by) {
      // Locked re-check suppression — emit the stderr diagnostic so the
      // suppression is attributable (id + hashed key), not silent.
      console.error(`recurrence-check: suppressed ${recurrenceKeyFor(group)} by existing finding ${res.suppressed_by.id}`);
    }
  }

  // Surface dedup hits on stderr: any recurrent group whose key was
  // already present in the registry at the unlocked pre-filter read
  // (the suppressed-not-filed case). Distinct from the locked
  // writeEntryIfAbsent suppression above: this fires for groups that
  // never reach the write loop because the unlocked filter caught them
  // first.
  for (const group of recurrent) {
    const recurrenceKey = recurrenceKeyFor(group);
    if (existingKeys.has(recurrenceKey)) {
      const sup = existing.find((e) => e.recurrence_key === recurrenceKey);
      console.error(`recurrence-check: suppressed ${recurrenceKey} by existing finding ${sup?.id ?? "(unknown)"}`);
    }
  }

  return {
    checked_groups: recurrent.length,
    findings_emitted: dryRun ? 0 : written,
    recurrent,
    entries_scanned: scanOut.log_entries_scanned ?? 0,
  };
}
