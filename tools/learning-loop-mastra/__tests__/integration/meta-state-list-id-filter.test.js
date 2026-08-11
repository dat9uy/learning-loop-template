import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "list-id-filter-"));
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

const SEED_ENTRIES = [
  { id: "alpha", entry_kind: "finding", status: "open", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha finding for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
  { id: "beta", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "beta finding for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
  { id: "gamma", entry_kind: "change-log", status: "open", change_dimension: "surface", change_target: "tools/test.js", change_diff: { added: ["id filter"], removed: [], changed: [] }, reason: "gamma change-log for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
];

describe("meta_state_list id filter", () => {
  let root;
  let originalGateRoot;

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    writeRegistry(root, SEED_ENTRIES);
  });

  afterAll(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("id: 'alpha' returns only the alpha entry", async () => {
    const result = await metaStateListTool.handler({ id: "alpha" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
    assert.deepStrictEqual(text.filters_applied.id, ["alpha"]);
  });

  test("id: ['alpha', 'beta'] returns both, no gamma", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "beta"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 2);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta"]);
    assert.deepStrictEqual(text.filters_applied.id, ["alpha", "beta"]);
  });

  test("id: ['nonexistent'] returns empty array", async () => {
    const result = await metaStateListTool.handler({ id: ["nonexistent"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.deepStrictEqual(text.entries, []);
  });

  test("id: ['alpha', 'nonexistent'] silently skips missing", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "nonexistent"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });

  test("id composes with status filter (AND)", async () => {
    const resolved = { id: "delta-resolved", entry_kind: "finding", status: "resolved", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "resolved entry for compose test (min 20 chars)", created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), resolved_by: "test" };
    writeFileSync(join(root, "meta-state.jsonl"), [...SEED_ENTRIES, resolved].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ id: ["alpha", "delta-resolved"], status: "open" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });

  test("id composes with entry_kind filter (AND)", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "gamma"], entry_kind: "change-log" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "gamma");
  });

  test("id with no value (undefined) returns all entries (backward compat)", async () => {
    const result = await metaStateListTool.handler({});
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 3);
  });

  // Finding meta-260801T2348Z: an id-filtered query that hits a
  // terminal/archived id must say so (`excluded_ids` notice) instead of
  // silently returning count 0 — silent exclusion pushed agents to grep
  // meta-state.jsonl raw.
  test("id-filtered query on a terminal id emits an excluded_ids notice, not silent count 0", async () => {
    writeFileSync(join(root, "meta-state.jsonl"), [...SEED_ENTRIES, {
      id: "delta-resolved",
      entry_kind: "finding",
      status: "resolved",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "resolved entry for excluded_ids test (min 20 chars)",
      created_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by: "test",
    }].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ id: "delta-resolved" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0, "terminal id still excluded by default");
    assert.ok(Array.isArray(text.excluded_ids), "excluded_ids notice must be present");
    assert.strictEqual(text.excluded_ids.length, 1);
    assert.strictEqual(text.excluded_ids[0].id, "delta-resolved");
    assert.strictEqual(text.excluded_ids[0].status, "resolved");
    assert.ok(
      text.excluded_ids[0].note.includes("include_archived"),
      "notice must carry the include_archived retry hint"
    );
  });

  test("include_archived: true suppresses the excluded_ids notice", async () => {
    const result = await metaStateListTool.handler({ id: "delta-resolved", include_archived: true });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1, "terminal id included via include_archived");
    assert.strictEqual(text.excluded_ids, undefined, "no notice when terminal entries are opted in");
  });

  test("open ids emit no excluded_ids notice", async () => {
    const result = await metaStateListTool.handler({ id: "alpha" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.excluded_ids, undefined, "open id must not surface an exclusion notice");
  });

  test("nonexistent id emits no excluded_ids notice (that's the prefix-hint path)", async () => {
    const result = await metaStateListTool.handler({ id: "no-such-id-xyz" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.strictEqual(text.excluded_ids, undefined, "missing id is not an exclusion");
  });

  test("mixed [open, terminal] id query: open returns, terminal excluded + noticed", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "delta-resolved"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
    assert.ok(Array.isArray(text.excluded_ids));
    assert.strictEqual(text.excluded_ids.length, 1);
    assert.strictEqual(text.excluded_ids[0].id, "delta-resolved");
  });

  test("no excluded_ids notice when an explicit filter (not the terminal exclusion) dropped the id", async () => {
    // A terminal id dropped by the caller's OWN filter (status:"open",
    // entry_kind, category, ...) is NOT an exclusion `include_archived` can
    // recover — surfacing `excluded_ids` would be a false positive with a
    // dead-end retry hint. The notice must fire only for ids dropped by the
    // DEFAULT terminal/archived view (no other filter).
    const cases = [
      { args: { id: "delta-resolved", status: "open" }, label: "status:open" },
      { args: { id: "delta-resolved", entry_kind: "change-log" }, label: "entry_kind:change-log" },
      // delta-resolved's category IS "gate-logic-bug"; a non-matching category
      // drops it in Step 3, so the terminal-exclusion notice must NOT fire.
      { args: { id: "delta-resolved", category: "mcp-tool-missing" }, label: "category mismatch" },
    ];
    for (const { args, label } of cases) {
      const result = await metaStateListTool.handler(args);
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(
        text.excluded_ids,
        undefined,
        `${label}: terminal id dropped by explicit filter must NOT emit excluded_ids`
      );
    }
  });

  test("explicit status:'archived' filter is a caller opt-in — no excluded_ids notice", async () => {
    // `archived` is not in EXCLUDABLE_STATUSES, so without special handling the
    // caller who explicitly queried `status:"archived"` would get the "you
    // haven't opted in to archived" notice — a false positive. An explicit
    // status:"archived" filter is a clear opt-in and must suppress the notice.
    writeFileSync(join(root, "meta-state.jsonl"), [...SEED_ENTRIES, {
      id: "epsilon-archived",
      entry_kind: "finding",
      status: "archived",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "archived entry for opt-in test (min 20 chars)",
      created_at: new Date().toISOString(),
      archived_at: new Date().toISOString(),
      archived_by: "test",
    }].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ id: "epsilon-archived", status: "archived" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.excluded_ids, undefined, "explicit status:archived must suppress the notice");
  });

  test("same-version tie-break: later created_at terminal line is noticed, not silent", async () => {
    // Two version-1 lines for one id where the later-created is resolved. Step 4
    // drops the id (later created_at wins on equal version), so the notice must
    // fire with the terminal status — the same-version corner the tie-break
    // handles. Without it, a terminal id silently returns count 0.
    const root2 = mkdtempSync(join(tmpdir(), "tiebreak-"));
    const origRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root2;
    try {
      writeFileSync(join(root2, "meta-state.jsonl"), [
        { id: "tie-samev", entry_kind: "finding", status: "open", version: 1, category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "tie-samev v1 open (min 20 chars)", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "tie-samev", entry_kind: "finding", status: "resolved", version: 1, category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "tie-samev v1 resolved (min 20 chars)", created_at: "2026-01-02T00:00:00.000Z" },
      ].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      const result = await metaStateListTool.handler({ id: "tie-samev", include_all_versions: true, compact: false });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.count, 0, "id dropped (projected status resolved)");
      assert.ok(Array.isArray(text.excluded_ids), "same-version tie-break must emit the notice");
      assert.strictEqual(text.excluded_ids[0].status, "resolved", "notice reports the projected terminal status");
    } finally {
      process.env.GATE_ROOT = origRoot;
      rmSync(root2, { recursive: true, force: true });
    }
  });
});

// did-you-mean prefix hints: when an id query misses but the queried id is a
// non-empty proper prefix of exactly one registry id, the empty/miss
// envelope carries `id_prefix_hints` naming the full id (and its status, so
// the agent can fold include_archived into the retry). Exact-match semantics
// are unchanged — ambiguous and zero-match prefixes stay silent.
describe("meta_state_list id prefix hints", () => {
  let root;
  let originalGateRoot;

  const PREFIX_SEED = [
    { id: "alpha-001", entry_kind: "finding", status: "open", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha-001 finding for prefix-hint test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "alpha-002", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "alpha-002 finding for prefix-hint test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "beta-001", entry_kind: "finding", status: "open", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "beta-001 finding for prefix-hint test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "gamma-resolved-001", entry_kind: "finding", status: "resolved", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "gamma resolved finding for prefix-hint test (min 20 chars)", created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), resolved_by: "test" },
  ];

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    writeRegistry(root, PREFIX_SEED);
  });

  afterAll(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("unique proper-prefix miss surfaces a hint naming the full id + status", async () => {
    const result = await metaStateListTool.handler({ id: "beta-00" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0, "prefix must not exact-match");
    assert.ok(Array.isArray(text.id_prefix_hints), "id_prefix_hints must be present");
    assert.strictEqual(text.id_prefix_hints.length, 1);
    const hint = text.id_prefix_hints[0];
    assert.strictEqual(hint.queried, "beta-00");
    assert.strictEqual(hint.suggested_id, "beta-001");
    assert.strictEqual(hint.suggested_status, "open");
  });

  test("terminal matched entry reports its status so the agent can retry with include_archived", async () => {
    // gamma-resolved-001 is excluded by the default status filter, so the
    // prefix miss returns count 0 AND the hint carries status:"resolved".
    const result = await metaStateListTool.handler({ id: "gamma-resolved-00" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.ok(Array.isArray(text.id_prefix_hints));
    assert.strictEqual(text.id_prefix_hints[0].suggested_id, "gamma-resolved-001");
    assert.strictEqual(text.id_prefix_hints[0].suggested_status, "resolved");
  });

  test("ambiguous prefix (2+ matches) stays silent — no hint", async () => {
    const result = await metaStateListTool.handler({ id: "alpha-00" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.strictEqual(text.id_prefix_hints, undefined, "ambiguous prefix must not hint");
  });

  test("exact match does not surface a hint", async () => {
    const result = await metaStateListTool.handler({ id: "beta-001" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.id_prefix_hints, undefined, "exact match must not hint");
  });

  test("zero-prefix-match id stays silent — no hint", async () => {
    const result = await metaStateListTool.handler({ id: "zzz-no-such-prefix" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.strictEqual(text.id_prefix_hints, undefined, "no prefix match must not hint");
  });

  test("mixed [exact, prefix-miss] hints only the miss", async () => {
    const result = await metaStateListTool.handler({ id: ["beta-001", "gamma-resolved-00"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.ok(Array.isArray(text.id_prefix_hints));
    assert.strictEqual(text.id_prefix_hints.length, 1);
    assert.strictEqual(text.id_prefix_hints[0].queried, "gamma-resolved-00");
  });
});
