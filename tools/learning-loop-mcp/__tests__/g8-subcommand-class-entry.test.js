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
        e.description.includes("subcommand-class false positive")
    );

    assert.ok(g8Entry, "Expected a meta-state entry with subtype=gate-bug and description containing 'subcommand-class false positive'");
    assert.strictEqual(g8Entry.category, "loop-anti-pattern");
    assert.ok(["reported", "active"].includes(g8Entry.status), `Expected status reported or active, got ${g8Entry.status}`);
  });
});
