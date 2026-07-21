#!/usr/bin/env node
/**
 * delivery-classify.mjs — offline classifier for SessionStart steering delivery.
 *
 * Walks a projects-dir of Claude Code session transcripts, classifies each
 * session's first API call against the loop's run-time-recomputed surface
 * floors, and appends a `delivery-<sessionId>-<runTs>` ledger row to the
 * repo-root `runtime-state.jsonl` via core/appendLedgerEvent.
 *
 * Floors are recomputed at run time (no hardcoded constants): MCP tool
 * definition bytes via live `tools/list` and the hint-payload floor from
 * the pointer-projection builders. The two floors are measured up front in
 * one spawn — if the spawn fails, exit 1 before any append (no partial
 * writes). Per-session classification failure is non-fatal: skip, log, and
 * continue.
 *
 * Idempotency: a delivery-<sessionId> row that already exists with a
 * matching `transcript_content_hash` is SKIPPED. When the hash differs, a
 * new versioned row is appended (latest-by-timestamp on read). This
 * unfreezes partial transcripts that complete across runs.
 *
 * Reference: plans/260720-1955-context-size-delivery-observability-pointer-
 * projection-jit-contracts-channel-vocabulary/plan.md (Phase 4).
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, openSync, closeSync, statSync, mkdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRoot } from "#lib/resolve-root.js";
import { prepareTempRoot, connectMcpServer } from "../learning-loop-mastra/__tests__/with-mcp-server.js";
import {
  appendLedgerEvent,
  readRuntimeStateRows,
  verifyRow,
} from "../learning-loop-mastra/core/runtime-state.js";
import { runtimeStateRecordTool } from "../learning-loop-mastra/tools/handlers/runtime-state-record-tool.js";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(scriptDir, "..", "..");
const serverEntry = join(root, "tools/learning-loop-mastra/mastra/server.js");

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : 20;
const projectsArg = args.find((a) => a.startsWith("--projects-dir="));
const cwdSlug = "-" + process.cwd()
  .replace(/^\/+/, "")
  .replace(/\//g, "-");
const PROJECTS_DIR = projectsArg
  ? projectsArg.slice("--projects-dir=".length)
  : join(homedir(), ".claude", "projects", cwdSlug);

if (process.env.DELIVERY_CLASSIFY_SKIP === "1") {
  console.log("[delivery-classify] DELIVERY_CLASSIFY_SKIP=1 — skipping.");
  process.exit(0);
}

const SOURCE_REF = "local:meta-state:meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent";
const KINDS = { LEDGER: "ledger-event" };

function classifyTokens(inputTokens, cacheRead, cacheCreation) {
  return (inputTokens || 0) + (cacheRead || 0) + (cacheCreation || 0);
}

function firstAssistantUsage(events) {
  const seen = new Set();
  for (const event of events) {
    if (event?.type !== "assistant") continue;
    const messageId = event?.message?.id;
    if (messageId && seen.has(messageId)) continue;
    if (messageId) seen.add(messageId);
    const usage = event?.message?.usage;
    if (usage && typeof usage === "object") {
      return {
        usage,
        model: event?.message?.model ?? null,
        messageId,
      };
    }
  }
  return null;
}

function readRecordedBytes(events, usageAnchor) {
  let bytes = 0;
  for (const event of events) {
    if (event && event.timestamp && usageAnchor && event.timestamp > usageAnchor) break;
    if (!event || typeof event !== "object") continue;
    const attachment = event.attachment;
    if (attachment && typeof attachment === "object" && typeof attachment.stdout === "string") {
      bytes += Buffer.byteLength(attachment.stdout);
    }
    if (typeof event.content === "string") bytes += Buffer.byteLength(event.content);
  }
  return bytes;
}

async function computeFloors() {
  const tempRoot = prepareTempRoot();
  const handles = await connectMcpServer(serverEntry, tempRoot, { LOOP_SURFACE: ".claude" });
  try {
    const tools = await handles.listTools();
    const manifestBytes = Buffer.byteLength(JSON.stringify(tools));
    const manifestFloorTokens = Math.ceil(manifestBytes / 4);
    // Hint payload floor: measure the pointer-projection output rendered with
    // current builder signatures. Falls back to the full-text builders if the
    // pointer builders are absent (partial Phase 3 landing).
    const introspect = await import("../learning-loop-mastra/core/loop-introspect.js");
    const buildD = introspect.buildDiscoverabilityPointers ?? introspect.buildDiscoverabilityHints;
    const buildP = introspect.buildProcessPointers ?? introspect.buildProcessHints;
    const pointerBytes = Buffer.byteLength(JSON.stringify([...(buildD?.() ?? []), ...(buildP?.() ?? [])]));
    const hintFloorTokens = Math.ceil(pointerBytes / 4);
    return { manifestBytes, manifestFloorTokens, hintFloorTokens };
  } finally {
    await handles.cleanup();
  }
}

function withLock(root, fn) {
  const lockPath = join(root, "runtime-state.classify.lock");
  mkdirSync(root, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      closeSync(fd);
      try {
        return fn();
      } finally {
        try { unlinkSync(lockPath); } catch { /* ignore */ }
      }
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      // Wait briefly and retry.
      const wait = 25 * (attempt + 1);
      const start = Date.now();
      while (Date.now() - start < wait) { /* spin */ }
    }
  }
  throw new Error("delivery-classify: could not acquire runtime-state.classify.lock after 5 attempts");
}

function truncateTrailingPartialLine(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  if (!raw) return;
  const ends = raw.endsWith("\n");
  if (ends) return;
  const lastNewline = raw.lastIndexOf("\n");
  if (lastNewline < 0) {
    // single-line partial; truncate the file
    writeFileSync(path, "");
    return;
  }
  writeFileSync(path, raw.slice(0, lastNewline + 1));
}

function parseTranscripts(dir, limit) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, stat: statSync(join(dir, f)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, limit)
    .map(({ f }) => f);
  const out = [];
  for (const f of files) {
    const path = join(dir, f);
    const sessionId = f.replace(/\.jsonl$/, "");
    const raw = readFileSync(path, "utf8");
    const events = raw
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
    const first = firstAssistantUsage(events);
    if (!first) continue;
    const firstTokens = classifyTokens(first.usage.input_tokens, first.usage.cache_read_input_tokens, first.usage.cache_creation_input_tokens);
    const recorded = readRecordedBytes(events, first.message?.timestamp ?? null);
    out.push({
      sessionId,
      model: first.model,
      path,
      firstCallInputTokens: firstTokens,
      recordedAttachmentBytes: recorded,
      transcriptContentHash: "sha256:" + createHash("sha256").update(raw).digest("hex"),
      events,
    });
  }
  return out;
}

function buildRow({ sessionId, model, classification, floors, runTs, transcriptContentHash, firstCallInputTokens, recordedAttachmentBytes }) {
  return {
    affected_system: "meta-state-tools",
    kind: KINDS.LEDGER,
    id: `delivery-${sessionId}-${runTs}`,
    source_ref: SOURCE_REF,
    value: classification === "full" ? 1 : classification === "lean" ? 0 : null,
    delta: null,
    timestamp: new Date(runTs).toISOString(),
    status: "active",
    fingerprint: null,
    metadata: {
      classification,
      first_call_input_tokens: firstCallInputTokens,
      recorded_attachment_bytes: recordedAttachmentBytes,
      model,
      classified_at: new Date(runTs).toISOString(),
      transcript_content_hash: transcriptContentHash,
      manifest_floor_bytes: floors.manifestBytes,
      hint_floor_bytes: floors.hintFloorTokens * 4,
    },
  };
}

function schemaValidateRow(row) {
  const fields = runtimeStateRecordTool.schema;
  for (const [key, value] of Object.entries(row)) {
    const fieldSchema = fields[key];
    if (!fieldSchema || typeof fieldSchema.safeParse !== "function") continue;
    const result = fieldSchema.safeParse(value);
    if (!result.success) {
      throw new Error(`delivery-classify: schema rejected ${key}: ${JSON.stringify(result.error.issues)}`);
    }
  }
  if (!/^[a-z0-9-]+$/.test(row.id)) {
    throw new Error(`delivery-classify: id contains characters outside [a-z0-9-]: ${row.id}`);
  }
  return true;
}

const floors = await computeFloors();
const runTs = Date.now();
const transcripts = parseTranscripts(PROJECTS_DIR, LIMIT);
const targetRoot = resolveRoot();
const summary = { scanned: transcripts.length, classified: 0, skipped: 0, appended: 0, failed: 0 };
const failures = [];

const result = withLock(targetRoot, () => {
  truncateTrailingPartialLine(join(targetRoot, "runtime-state.jsonl"));
  const existing = readRuntimeStateRows(targetRoot);
  for (const t of transcripts) {
    try {
      if (t.firstCallInputTokens === 0) {
        summary.skipped += 1;
        continue;
      }
      const floorTokens = floors.manifestFloorTokens + floors.hintFloorTokens;
      const classification = t.firstCallInputTokens >= 0.8 * floorTokens
        ? "full"
        : "lean";
      summary.classified += 1;

      const sameSession = existing.find((row) =>
        typeof row?.id === "string" && row.id.startsWith(`delivery-${t.sessionId}-`) && row.kind === KINDS.LEDGER);
      if (sameSession) {
        const priorHash = sameSession?.metadata?.transcript_content_hash;
        const validPrior = verifyRow(sameSession);
        if (validPrior && priorHash === t.transcriptContentHash) {
          summary.skipped += 1;
          continue;
        }
      }
      const row = buildRow({
        sessionId: t.sessionId,
        model: t.model,
        classification,
        floors,
        runTs,
        transcriptContentHash: t.transcriptContentHash,
        firstCallInputTokens: t.firstCallInputTokens,
        recordedAttachmentBytes: t.recordedAttachmentBytes,
      });
      schemaValidateRow(row);
      appendLedgerEvent(targetRoot, row);
      summary.appended += 1;
    } catch (err) {
      summary.failed += 1;
      failures.push({ sessionId: t.sessionId, error: err.message });
    }
  }
  return summary;
});

console.log(JSON.stringify({
  measured_at: new Date(runTs).toISOString(),
  projects_dir: PROJECTS_DIR,
  limit: LIMIT,
  floors,
  result,
  failures,
}, null, 2));
if (result.failed > 0) {
  process.exit(1);
}
