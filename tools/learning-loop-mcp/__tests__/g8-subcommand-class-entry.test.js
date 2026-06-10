import { describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolveRoot } from "#lib/resolve-root.js";
import { join } from "node:path";

describe("G8 subcommand-class meta-state entry", () => {
  test("meta-state.jsonl contains a gate-bug entry describing subcommand-class false positive", () => {
    const root = resolveRoot();
    const raw = readFileSync(join(root, "meta-state.jsonl"), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    const entries = lines.map((l) => JSON.parse(l));

    const g8Entry = entries.find(
      (e) =>
        e.subtype === "gate-bug" &&
        typeof e.description === "string" &&
        e.description.includes("subcommand-class") &&
        // Exclude the rule entry (which has a promoted_to_rule); we want
        // a G8 finding entry, not the rule that codifies the prevention.
        !e.promoted_to_rule
    );

    assert.ok(g8Entry, "Expected a meta-state entry with subtype=gate-bug and description containing 'subcommand-class'");
    assert.ok(
      ["loop-anti-pattern", "gate-logic-bug"].includes(g8Entry.category),
      `Expected category loop-anti-pattern or gate-logic-bug, got ${g8Entry.category}`
    );
    // Phase 2 of plan 260605 transitions the G8 entries from 'expired' to 'superseded'
    // with consolidated_into pointing to a single change-log entry. 'superseded' is a
    // terminal status, so it is no longer a live finding — but it must remain queryable
    // for audit trail purposes (loop_describe cold tier surfaces it via superseded_lineage).
    assert.ok(["reported", "active", "superseded", "resolved"].includes(g8Entry.status), `Expected status reported, active, superseded, or resolved, got ${g8Entry.status}`);
  });
});
