// Unit tests for tools/scripts/compact-registry.sh.
//
// Locks the 6-way contract:
//   (a) --check: identity stats on a one-line-per-id fixture (raw=3, deduped=3, dead=0)
//   (b) --check: last-wins projection on a versioned fixture (raw=N, deduped=M, dead=N-M)
//   (c) --check: exits 1 when compaction_eligible=true (raw_lines >= 1000) — H7 signal-not-noise
//   (d) --check: exits 0 when below threshold
//   (e) --check: does NOT modify the file (mtime unchanged)
//   (f) --full: rewrites meta-state.jsonl keeping max_by(.version) per id,
//                keeps the latest tombstone per archived id (audit completeness),
//                drops superseded non-winning versions, file remains valid JSONL,
//                projection output unchanged
//   (g) --full: tolerates absent change-log.jsonl (post-Tier-1-split may omit it)
//
// Plus: missing/invalid file → exit 2 (mirror registry-table.sh contract shape).
//
// Uses isolated temp dirs; never touches the real registry. Mirrors
// `registry-table.test.js` + `setup-git-merge-drivers.test.js` temp-repo idiom.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../compact-registry.sh");

function runScript(args = [], opts = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
}

function writeJsonl(path, entries) {
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

function parseStats(stdout) {
  const out = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([a-z_]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return {
    raw_lines: Number(out.raw_lines),
    deduped_ids: Number(out.deduped_ids),
    dead_version_lines: Number(out.dead_version_lines),
    compaction_eligible: out.compaction_eligible === "true",
  };
}

describe("compact-registry.sh: --check contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("--check on one-line-per-id fixture: raw == deduped, dead == 0, ineligible, exit 0", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "b", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:01.000Z" },
        { id: "c", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:02.000Z" },
      ]);
      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      const stats = parseStats(proc.stdout);
      assert.strictEqual(stats.raw_lines, 3);
      assert.strictEqual(stats.deduped_ids, 3);
      assert.strictEqual(stats.dead_version_lines, 0);
      assert.strictEqual(stats.compaction_eligible, false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--check on versioned fixture: raw > deduped, dead = raw - deduped, ineligible, exit 0", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "alpha", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 2, created_at: "2026-01-01T01:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 3, created_at: "2026-01-01T02:00:00.000Z" },
        { id: "beta", entry_kind: "finding", version: 1, created_at: "2026-01-02T00:00:00.000Z" },
      ]);
      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
      const stats = parseStats(proc.stdout);
      assert.strictEqual(stats.raw_lines, 4);
      assert.strictEqual(stats.deduped_ids, 2);
      assert.strictEqual(stats.dead_version_lines, 2);
      assert.strictEqual(stats.compaction_eligible, false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--check exits 1 when compaction_eligible (raw_lines >= 1000) — H7 signal-not-noise", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      // Build 1001 distinct entries (raw_lines = 1001, deduped = 1001).
      const entries = [];
      for (let i = 0; i < 1001; i++) {
        entries.push({ id: `id-${i}`, entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" });
      }
      writeJsonl(join(cwd, "meta-state.jsonl"), entries);
      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 1, `expected exit 1 when eligible, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      const stats = parseStats(proc.stdout);
      assert.strictEqual(stats.raw_lines, 1001);
      assert.strictEqual(stats.compaction_eligible, true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--check exits 0 at exactly threshold-1 (999 raw lines, ineligible)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      const entries = [];
      for (let i = 0; i < 999; i++) {
        entries.push({ id: `id-${i}`, entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" });
      }
      writeJsonl(join(cwd, "meta-state.jsonl"), entries);
      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 0, `expected exit 0 just below threshold, got ${proc.status}\nstderr: ${proc.stderr}`);
      const stats = parseStats(proc.stdout);
      assert.strictEqual(stats.raw_lines, 999);
      assert.strictEqual(stats.compaction_eligible, false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--check does NOT modify the file (mtime unchanged)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      const target = join(cwd, "meta-state.jsonl");
      writeJsonl(target, [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
      ]);
      // Pin a known mtime: 2026-07-15T10:00:00Z.
      const pinned = new Date("2026-07-15T10:00:00Z");
      utimesSync(target, pinned, pinned);
      const beforeMtime = statSync(target).mtimeMs;

      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 0);

      const afterMtime = statSync(target).mtimeMs;
      assert.strictEqual(beforeMtime, afterMtime, `mtime must be unchanged after --check (read-only mode), before=${beforeMtime} after=${afterMtime}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--check with absent file: exit 2 + guidance (mirrors registry-table.sh contract)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 2, `expected exit 2 on absent input, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /no registry files found|missing|absent/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--check tolerates absent change-log.jsonl (post-Tier-1-split may omit it)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
      ]);
      const proc = runScript(["--check"], { cwd });
      assert.strictEqual(proc.status, 0, `expected exit 0 when change-log absent, got ${proc.status}\nstderr: ${proc.stderr}`);
      const stats = parseStats(proc.stdout);
      assert.strictEqual(stats.raw_lines, 1);
      assert.strictEqual(stats.deduped_ids, 1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("compact-registry.sh: --full contract", () => {
  test("--full rewrites meta-state.jsonl keeping max_by(.version) per id", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-full-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "alpha", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 2, created_at: "2026-01-01T01:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 3, created_at: "2026-01-01T02:00:00.000Z" },
        { id: "beta", entry_kind: "finding", version: 1, created_at: "2026-01-02T00:00:00.000Z" },
        { id: "beta", entry_kind: "finding", version: 2, created_at: "2026-01-02T01:00:00.000Z" },
      ]);
      const proc = runScript(["--full"], { cwd });
      assert.strictEqual(proc.status, 0, `--full must exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);

      const after = readFileSync(join(cwd, "meta-state.jsonl"), "utf8");
      const lines = after.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      assert.strictEqual(lines.length, 2, `expected 2 lines after compaction, got ${lines.length}: ${after}`);

      const alpha = lines.find((l) => l.id === "alpha");
      const beta = lines.find((l) => l.id === "beta");
      assert.strictEqual(alpha.version, 3, `alpha must be max-version=3, got ${alpha.version}`);
      assert.strictEqual(beta.version, 2, `beta must be max-version=2, got ${beta.version}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--full keeps the latest tombstone per archived id (audit completeness)", () => {
    // Archived tombstones are versioned lines with status='archived'. The
    // compaction script must preserve the LATEST tombstone per id so the
    // audit retains the fact that the id was archived at some point.
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-full-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        // deleted-id has two archive tombstones (different versions); the latest must win.
        { id: "deleted-id", entry_kind: "finding", version: 1, status: "archived", created_at: "2026-01-01T00:00:00.000Z", tombstone_kind: "delete" },
        { id: "deleted-id", entry_kind: "finding", version: 2, status: "archived", created_at: "2026-01-01T01:00:00.000Z", tombstone_kind: "delete" },
        // live id unaffected
        { id: "live-id", entry_kind: "finding", version: 1, status: "open", created_at: "2026-01-02T00:00:00.000Z" },
      ]);
      const proc = runScript(["--full"], { cwd });
      assert.strictEqual(proc.status, 0, `--full must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);

      const after = readFileSync(join(cwd, "meta-state.jsonl"), "utf8");
      const lines = after.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      assert.strictEqual(lines.length, 2);

      const tombstone = lines.find((l) => l.id === "deleted-id");
      assert.strictEqual(tombstone.status, "archived", `latest tombstone must be retained (status=archived), got ${tombstone.status}`);
      assert.strictEqual(tombstone.version, 2, `latest tombstone version must be 2, got ${tombstone.version}`);
      assert.strictEqual(tombstone.tombstone_kind, "delete");

      const live = lines.find((l) => l.id === "live-id");
      assert.strictEqual(live.status, "open");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--full: projection (last-wins) output is unchanged before/after", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-full-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "alpha", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 2, created_at: "2026-01-01T01:00:00.000Z" },
        { id: "beta", entry_kind: "finding", version: 1, created_at: "2026-01-02T00:00:00.000Z" },
      ]);

      // Capture before-projection via registry-table.sh (same jq shape).
      const regTable = resolve(__dirname, "../registry-table.sh");
      const before = spawnSync("bash", [regTable, join(cwd, "meta-state.jsonl")], { encoding: "utf8" });
      assert.strictEqual(before.status, 0);

      const proc = runScript(["--full"], { cwd });
      assert.strictEqual(proc.status, 0, `--full must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);

      const after = spawnSync("bash", [regTable, join(cwd, "meta-state.jsonl")], { encoding: "utf8" });
      assert.strictEqual(after.status, 0);
      assert.strictEqual(before.stdout.trim(), after.stdout.trim(), `projection output must be byte-identical before/after compaction`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--full: file is valid JSONL after compaction", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-full-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "alpha", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "alpha", entry_kind: "finding", version: 2, created_at: "2026-01-01T01:00:00.000Z" },
        { id: "beta", entry_kind: "change-log", version: 1, created_at: "2026-01-02T00:00:00.000Z" },
      ]);
      const proc = runScript(["--full"], { cwd });
      assert.strictEqual(proc.status, 0);

      const after = readFileSync(join(cwd, "meta-state.jsonl"), "utf8");
      // Every non-blank line must parse as JSON.
      for (const line of after.split("\n")) {
        if (line.length === 0) continue;
        assert.doesNotThrow(() => JSON.parse(line), `every line must be valid JSON, got: ${line}`);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--full tolerates absent change-log.jsonl", () => {
    const cwd = mkdtempSync(join(tmpdir(), "compact-registry-full-"));
    try {
      writeJsonl(join(cwd, "meta-state.jsonl"), [
        { id: "a", entry_kind: "finding", version: 1, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "a", entry_kind: "finding", version: 2, created_at: "2026-01-01T01:00:00.000Z" },
      ]);
      const proc = runScript(["--full"], { cwd });
      assert.strictEqual(proc.status, 0, `--full must exit 0 when change-log absent, got ${proc.status}\nstderr: ${proc.stderr}`);
      const after = readFileSync(join(cwd, "meta-state.jsonl"), "utf8");
      const lines = after.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].version, 2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
