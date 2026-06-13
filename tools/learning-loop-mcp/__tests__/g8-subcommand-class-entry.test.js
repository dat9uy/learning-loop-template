import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("G8 subcommand-class meta-state entry", () => {
  test("meta-state.jsonl contains a gate-bug entry describing subcommand-class false positive", () => {
    // Uses a self-contained fixture to avoid depending on live registry state.
    // The original G8 findings were superseded and pruned by meta_state_sweep.
    const fixtureRoot = mkdtempSync(join(tmpdir(), "g8-fixture-"));
    const entries = [
      {
        id: "meta-260606T0028Z-g8-subcommand-class-false-positive",
        entry_kind: "finding",
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        subtype: "gate-bug",
        status: "superseded",
        consolidated_into: "meta-260606T0028Z-g8-subcommand-class-false-positive-supersede",
        description: "G8 subcommand-class false positive: bare 'create' matched CLI subcommand names in the rule-no-new-artifact-types regex pattern. 7 recurrences before fix.",
        created_at: "2026-06-06T00:28:00.000Z",
      },
    ];
    writeFileSync(
      join(fixtureRoot, "meta-state.jsonl"),
      entries.map(JSON.stringify).join("\n") + "\n",
      "utf8"
    );

    const raw = readFileSync(join(fixtureRoot, "meta-state.jsonl"), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    const parsed = lines.map((l) => JSON.parse(l));

    const g8Entry = parsed.find(
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
