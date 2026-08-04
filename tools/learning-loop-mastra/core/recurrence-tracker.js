import { createHash, randomBytes } from "node:crypto";
import { readDecisionLog } from "./gate-decision-log.js";
import { readRegistry, writeEntryIfAbsent } from "./meta-state.js";

const RECURRENCE_THRESHOLD_N = 3;
const COMMAND_PREFIX_MAX_LEN = 50;
const FALLBACK_TIER_SPAN_MS = 24 * 60 * 60 * 1000;
const CROSS_SESSION_THRESHOLD_N = 5;
const CROSS_SESSION_MIN_REAL_SESSIONS = 2;
const CROSS_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  // default; the trigger relies on dedup, not time-window pruning.
  const allEntries = readDecisionLog(root);
  if (options.out) options.out.log_entries_scanned = allEntries.length;
  // (Clean-cutover rule: entries with no session_id group into a bucket that
  // never fires, so the historical backlog does not flood the first post-ship
  // SessionStart. Fallback-tier session_ids are bounded to a 24h span.)

  /** @type {Map<string, { rule_id: string, command_prefix_normalized: string, session_id: string, entries: Array }>} */
  const groups = new Map();
  for (const entry of allEntries) {
    if (!entry.rule_id) continue;
    const sid = entry.session_id ?? "no-session";
    // Clean cutover: never fire on no-session entries (historical backlog).
    if (sid === "no-session") continue;
    const normalized = normalizePrefix(entry.command_prefix);
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
      sample_commands: entries.slice(0, 3).map((e) => e.command_prefix),
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
  const crossGroups = groupCrossSessionEntries(allEntries, windowStart);
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
    const normalized = normalizePrefix(entry.command_prefix);
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
      sample_commands: cg.entries.slice(0, 3).map((e) => e.command_prefix),
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
