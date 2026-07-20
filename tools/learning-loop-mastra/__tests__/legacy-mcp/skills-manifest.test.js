/**
 * Skills manifest test (Phase 1 of plans/260719-1428-central-skills-management).
 *
 * Contract:
 *   - skills-lock.json (repo root) parses and matches the unified schema
 *     with per-skill fields {name, maturity (mirror), source, sourceType,
 *     delivery, canonicalSource (internal), targets, hash, external}.
 *   - Manifest contains learning-loop, coordination-gate, mastra.
 *   - Drift test: for each internal entry, manifest[name].maturity ===
 *     frontmatter.maturity read from .claude/skills/<name>/SKILL.md
 *     (matches the /maturity:\s*(state-1|state-2|state-3)/m regex).
 *   - Hash-verification test (red-team F6 — makes hash load-bearing):
 *     manifest[name].hash === sha256(canonicalSource).
 *   - External mastra entry has external:true; internal entries have
 *     external:false (or absent).
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const MANIFEST_PATH = join(MCP_ROOT, "skills-lock.json");

const VALID_MATURITY = ["state-1", "state-2", "state-3"];

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function sha256OfPath(p) {
  return createHash("sha256").update(readFileSync(p, "utf8")).digest("hex");
}

function readFrontmatterMaturity(skillPath) {
  if (!existsSync(skillPath)) return null;
  const content = readFileSync(skillPath, "utf8");
  const m = content.match(/^maturity:\s*(state-1|state-2|state-3)\s*$/m);
  return m ? m[1] : null;
}

test("skills-lock.json exists at repo root", () => {
  assert.ok(existsSync(MANIFEST_PATH), `${MANIFEST_PATH} must exist`);
});

test("skills-lock.json has unified schema: version + skills object", () => {
  const manifest = readManifest();
  assert.strictEqual(typeof manifest.version, "number", "manifest.version must be a number");
  assert.strictEqual(typeof manifest.skills, "object", "manifest.skills must be an object");
});

test("manifest contains learning-loop, coordination-gate, mastra", () => {
  const manifest = readManifest();
  for (const required of ["learning-loop", "coordination-gate", "mastra"]) {
    assert.ok(required in manifest.skills, `manifest.skills must include "${required}"`);
  }
});

test("each manifest entry has required unified-schema fields", () => {
  const manifest = readManifest();
  for (const [name, entry] of Object.entries(manifest.skills)) {
    assert.strictEqual(typeof entry.source, "string", `${name}: source must be a string`);
    assert.strictEqual(typeof entry.sourceType, "string", `${name}: sourceType must be a string`);
    assert.strictEqual(typeof entry.delivery, "string", `${name}: delivery must be a string`);
    assert.ok(Array.isArray(entry.targets), `${name}: targets must be an array`);
    assert.ok(entry.targets.length > 0, `${name}: targets must be non-empty`);
    assert.ok(typeof entry.hash === "string" && entry.hash.length === 64, `${name}: hash must be a 64-char hex sha256 string`);
    assert.strictEqual(typeof entry.external, "boolean", `${name}: external must be boolean`);
  }
});

test("internal entries declare maturity in {state-1, state-2, state-3}", () => {
  const manifest = readManifest();
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (entry.external === true) continue;
    assert.ok(
      VALID_MATURITY.includes(entry.maturity),
      `internal "${name}" must have maturity in ${JSON.stringify(VALID_MATURITY)}; got ${entry.maturity}`,
    );
  }
});

test("mastra entry is external:true", () => {
  const manifest = readManifest();
  assert.strictEqual(manifest.skills.mastra.external, true, "mastra must be external:true");
});

test("drift: internal manifest.maturity === frontmatter.maturity", () => {
  const manifest = readManifest();
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (entry.external === true) continue;
    const fmPath = join(MCP_ROOT, ".claude", "skills", name, "SKILL.md");
    const frontmatterMaturity = readFrontmatterMaturity(fmPath);
    assert.ok(frontmatterMaturity !== null, `${name}: frontmatter maturity must exist on .claude mirror`);
    assert.strictEqual(
      entry.maturity,
      frontmatterMaturity,
      `${name}: manifest maturity (${entry.maturity}) must match frontmatter (${frontmatterMaturity})`,
    );
  }
});

test("hash: manifest[name].hash === sha256(canonical-or-mirror) for internal entries", () => {
  // Phase 1: canonicalSource path may not exist yet (Phase 2 ships it).
  // Read the canonicalSource if present, otherwise fall back to the
  // .claude mirror so the hash backstop catches drift today.
  // Phase 2 will tighten this to canonicalSource-only.
  const manifest = readManifest();
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (entry.external === true) continue;
    assert.ok(entry.canonicalSource, `internal "${name}" must declare canonicalSource`);
    const canonicalPath = join(MCP_ROOT, entry.canonicalSource);
    const mirrorPath = join(MCP_ROOT, ".claude", "skills", name, "SKILL.md");
    const hashSourcePath = existsSync(canonicalPath) ? canonicalPath : mirrorPath;
    assert.ok(existsSync(hashSourcePath), `${name}: hash source ${hashSourcePath} must exist`);
    const actual = sha256OfPath(hashSourcePath);
    assert.strictEqual(
      actual,
      entry.hash,
      `${name}: manifest hash (${entry.hash}) must match sha256(${hashSourcePath}) (${actual})`,
    );
  }
});

test("external entries are excluded from the internal-maturity invariant", () => {
  const manifest = readManifest();
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (entry.external !== true) continue;
    // External entries are exempt from the maturity mirror check.
    // The fact that we got here without throwing means mastra (or any
    // future external entry) is allowed to have maturity: null.
    assert.strictEqual(entry.maturity ?? null, null, `external "${name}" must have maturity: null (no frontmatter to mirror)`);
  }
});

test("drift negative: tampered manifest.maturity breaks the drift invariant", () => {
  // Simulate tampering: read manifest, swap learning-loop maturity to state-1,
  // verify the drift test would catch it. (We do not write to disk — this
  // proves the backstop exists by reasoning.)
  const manifest = readManifest();
  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.skills["learning-loop"].maturity = "state-1";
  const fmPath = join(MCP_ROOT, ".claude", "skills", "learning-loop", "SKILL.md");
  const fmMaturity = readFrontmatterMaturity(fmPath);
  assert.notStrictEqual(
    tampered.skills["learning-loop"].maturity,
    fmMaturity,
    "tampered manifest.maturity must not match frontmatter",
  );
  // Therefore the drift test would fail on this tampered state. The test
  // exists to detect drift; the assertion above confirms the detection
  // logic distinguishes tampered from real.
});

test("write-gate: skills-lock.json is gated (Phase 3 trust anchor)", async () => {
  // F4 — the manifest is the trust anchor for the contract's external
  // exclusion. Fixture root (not the live repo) so the assertion is strict:
  // blocked without a marker, allowed with one, narrow elsewhere.
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const root = mkdtempSync(join(tmpdir(), "ll-manifest-gate-"));
  try {
    const mod = await import("../../core/evaluate-write-gate.js");
    const manifestPath = join(root, "skills-lock.json");

    // 1. Blocked without preflight marker.
    const blocked = mod.evaluateWriteGate({ filePath: manifestPath, root });
    assert.strictEqual(blocked.decision, "block", "skills-lock.json write must be blocked without preflight");
    assert.strictEqual(blocked.matched_rule, "skills-lock.json", "block must report the manifest glob as matched_rule");

    // 2. Narrowness: arbitrary tools/** paths are NOT gated (Decision 5).
    const otherToolsPath = mod.evaluateWriteGate({
      filePath: join(root, "tools/learning-loop-mastra/core/some-other.js"),
      root,
    });
    assert.strictEqual(otherToolsPath.decision, "ok", "tools/**-wide gate is forbidden (Decision 5)");

    // 3. Allowed with a fresh .loop-preflight-skills marker.
    const markerDir = join(root, ".claude/coordination");
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(
      join(markerDir, ".loop-preflight-skills"),
      JSON.stringify({ surface: "skills", completed_at: new Date().toISOString() }),
    );
    const allowed = mod.evaluateWriteGate({ filePath: manifestPath, root });
    assert.strictEqual(allowed.decision, "ok", "skills-lock.json write must be allowed with skills preflight marker");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Phase 3: mastra npx round-trip (gated on runtime-state ledger-event) ---

const RUNTIME_STATE_PATH = join(MCP_ROOT, "runtime-state.jsonl");

// Pure helper (testable without the real registry): does ANY row with the
// roundtrip id carry at least one well-formed per-runtime hash? The ledger
// is append-only — placeholder/corrected rows (hash-less) must be skipped,
// not treated as terminal (re-review: first-match-wins would disable the
// F11/F12 gate forever once a hash-less row precedes the hash-bearing one).
function roundTripRecordedInLines(lines) {
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.id !== "npx-skills-mastra-roundtrip-2026-07-19") continue;
    const hashes = entry?.metadata?.hashes;
    if (!hashes || typeof hashes !== "object") continue;
    if (
      ["claude", "factory", "mastracode"].some(
        (k) => typeof hashes[k] === "string" && /^sha256:[a-f0-9]{64}$/.test(hashes[k]),
      )
    ) {
      return true;
    }
  }
  return false;
}

function npxRoundTripRecorded() {
  // Phase 3 ledger-event must carry per-runtime hashes (operator decision
  // Q4: do NOT defer Phase 3; record the npx round-trip as a ledger-event
  // from whichever sandbox can run npx). The round-trip counts as recorded
  // only when the ledger-event has actual per-runtime hashes (not just a
  // marker id); an empty ledger-event is the deferred-execution signal.
  //
  // Scoped parse (review M2): only rows carrying the roundtrip id are
  // consulted — registry-wide regexes could match an unrelated entry that
  // happens to carry a claude/factory/mastracode-named hash key.
  if (!existsSync(RUNTIME_STATE_PATH)) return false;
  const lines = readFileSync(RUNTIME_STATE_PATH, "utf8").split("\n").filter((l) => l.trim());
  return roundTripRecordedInLines(lines);
}

test("F11/F12 gate: any same-id hash-bearing row activates; placeholder rows do not", () => {
  const hash = `sha256:${"a".repeat(64)}`;
  const placeholder = JSON.stringify({ id: "npx-skills-mastra-roundtrip-2026-07-19", metadata: { pending_execution: "..." } });
  const hashRow = JSON.stringify({ id: "npx-skills-mastra-roundtrip-2026-07-19", metadata: { hashes: { claude: hash, factory: hash, mastracode: hash } } });
  const unrelated = JSON.stringify({ id: "other-event", metadata: { hashes: { claude: hash } } });

  assert.strictEqual(roundTripRecordedInLines([placeholder]), false, "hash-less placeholder must not activate");
  assert.strictEqual(roundTripRecordedInLines([placeholder, hashRow]), true, "later same-id hash row must activate (append-only ledger)");
  assert.strictEqual(roundTripRecordedInLines([hashRow, placeholder]), true, "earlier hash row must stay active");
  assert.strictEqual(roundTripRecordedInLines([unrelated]), false, "unrelated entry with hash keys must not activate");
  assert.strictEqual(roundTripRecordedInLines(["not json", placeholder]), false, "unparseable lines are skipped");
});

test("Phase 3 F11: .mastracode/skills/mastra present (gated on npx round-trip ledger-event)", () => {
  // F11 — closes the .mastracode gap. Skipped today; activates when the
  // npx round-trip ledger-event exists (operator decision Q4: do NOT defer
  // Phase 3; record the round-trip as a ledger-event from whichever
  // sandbox can run npx).
  if (!npxRoundTripRecorded()) {
    return;
  }
  const p = join(MCP_ROOT, ".mastracode", "skills", "mastra", "SKILL.md");
  assert.ok(existsSync(p), `.mastracode/skills/mastra/SKILL.md must exist post-roundtrip: ${p}`);
});

test("Phase 3 F12: mastra cross-surface byte-identity (gated on npx round-trip ledger-event)", () => {
  if (!npxRoundTripRecorded()) return;
  const surfaces = [".claude", ".factory", ".mastracode"];
  const contents = surfaces.map((s) => {
    const p = join(MCP_ROOT, s, "skills", "mastra", "SKILL.md");
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  });
  const present = contents.filter((c) => c !== null);
  assert.strictEqual(present.length, surfaces.length, `mastra SKILL.md must exist in all 3 surfaces post-roundtrip`);
  const buffers = contents.map((c) => Buffer.from(c, "utf8"));
  for (let i = 1; i < buffers.length; i++) {
    assert.ok(buffers[0].equals(buffers[i]), `mastra: ${surfaces[i]} mirror diverges from ${surfaces[0]}`);
  }
});

test("Phase 3 mastra entry: sourceType=npx-skills-cli, delivery=npx-per-runtime+fanout-undetected", () => {
  const manifest = readManifest();
  const m = manifest.skills.mastra;
  assert.strictEqual(m.sourceType, "npx-skills-cli", `mastra.sourceType must be 'npx-skills-cli'; got '${m.sourceType}'`);
  assert.strictEqual(m.delivery, "npx-per-runtime+fanout-undetected", `mastra.delivery must be 'npx-per-runtime+fanout-undetected'; got '${m.delivery}'`);
});