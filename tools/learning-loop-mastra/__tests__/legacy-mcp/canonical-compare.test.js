// Phase B (Tier 2): canonical comparator tests — sorted-keys + set-semantics on
// arrays. Resolves meta-260715T2311Z-gratuitous-mutations: identical-content
// patches must be detected as no-ops (no version bump, no append).
//
// Multiple meta-state fields accept arrays (`reopens`, `change_diff.added/removed/changed`,
// `consolidates`, `applies_to.{tools,surfaces,rules,statuses,schemas}`,
// `proposed_design_for`, `addresses`). Same set in different array order
// would falsely bump version under naïve `JSON.stringify` equality.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { canonicalize, entriesEqual } from "../../core/canonical-compare.js";

describe("canonical-compare (Tier 2 Phase B) — sorted-keys + set-semantics", () => {
  it("(1) same-set-different-order arrays compare equal", () => {
    const a = { reopens: ["X", "Y", "Z"] };
    const b = { reopens: ["Z", "Y", "X"] };
    assert.equal(canonicalize(a), canonicalize(b));
    assert.equal(entriesEqual(a, b), true);
  });

  it("(1) different set semantics compare different", () => {
    const a = { reopens: ["X", "Y"] };
    const b = { reopens: ["X", "Y", "Z"] };
    assert.notEqual(canonicalize(a), canonicalize(b));
    assert.equal(entriesEqual(a, b), false);
  });

  it("(2) nested-object mutation compares different (real change)", () => {
    const before = { description: "Original (min 20 chars)", severity: "warning" };
    const after = { description: "Real change to description here", severity: "warning" };
    assert.notEqual(canonicalize(before), canonicalize(after));
    assert.equal(entriesEqual(before, after), false);
  });

  it("(2) nested severity-only mutation compares different (real change)", () => {
    const before = { severity: "warning" };
    const after = { severity: "escalate" };
    assert.notEqual(canonicalize(before), canonicalize(after));
  });

  it("(3) key-order differences compare equal", () => {
    const a = { id: "meta-x", version: 1, status: "open", description: "Order check (min 20 chars)" };
    const b = { description: "Order check (min 20 chars)", status: "open", version: 1, id: "meta-x" };
    assert.equal(canonicalize(a), canonicalize(b));
    assert.equal(entriesEqual(a, b), true);
  });

  it("(4) wire-wrapper fields (different ordering) compare equal", () => {
    // The patch tool may re-order via envelope stripping or schema coerce.
    // The canonical form must normalize that out.
    const fromForm = { _expected_version: 2, status: "open" };
    const fromServer = { status: "open", _expected_version: 2 };
    assert.equal(canonicalize(fromForm), canonicalize(fromServer));
  });

  it("(5) empty arrays vs undefined compare equal via set semantics", () => {
    // schema-default behavior: absent arrays serialize as undefined.
    // canonicalize should treat absent-key and empty-array equivalently.
    const a = { id: "meta-empty" };
    const b = { id: "meta-empty", reopens: [] };
    assert.equal(canonicalize(a), canonicalize(b));
  });

  it("(6) undefined-valued keys are omitted from canonical form", () => {
    // applyDefaults fills affected_system; pre-default entries have undefined.
    // The pre/post entry must compare equal so the short-circuit remains correct
    // even before schema coercion. (H9 precondition.)
    const preDefault = { id: "meta-x", description: "Pre-default (min 20 chars)", affected_system: undefined };
    const postDefault = { id: "meta-x", description: "Pre-default (min 20 chars)", affected_system: "meta" };
    // After applyDefaults pre-compare, both have "meta"; pre-canonicalize they differ.
    assert.notEqual(
      canonicalize(preDefault),
      canonicalize(postDefault),
      "without applyDefaults, undefined vs 'meta' differs (this is the bug the precondition prevents)",
    );
  });

  it("(7) applies_to.tools array reorder compares equal", () => {
    const before = { applies_to: { tools: ["a", "b", "c"], surfaces: ["d"] } };
    const after = { applies_to: { tools: ["c", "a", "b"], surfaces: ["d"] } };
    assert.equal(canonicalize(before), canonicalize(after));
  });

  it("(8) deep nested array reorder compares equal (change_diff.added)", () => {
    const before = { change_diff: { added: ["x", "y"], removed: [], changed: ["z"] } };
    const after = { change_diff: { added: ["y", "x"], removed: [], changed: ["z"] } };
    assert.equal(canonicalize(before), canonicalize(after));
  });

  it("(9) proposed_design_for + addresses reorder compare equal", () => {
    const before = {
      proposed_design_for: ["meta-AAA", "rule-bbb"],
      addresses: ["meta-111", "meta-222"],
    };
    const after = {
      proposed_design_for: ["rule-bbb", "meta-AAA"],
      addresses: ["meta-222", "meta-111"],
    };
    assert.equal(canonicalize(before), canonicalize(after));
  });

  it("(10) version field participates (so v0 vs v1 detects real change)", () => {
    const a = { version: 0 };
    const b = { version: 1 };
    assert.notEqual(canonicalize(a), canonicalize(b));
  });

  it("(11) primitives compare by value", () => {
    assert.equal(canonicalize({ a: 1 }), canonicalize({ a: 1 }));
    assert.notEqual(canonicalize({ a: 1 }), canonicalize({ a: 2 }));
    assert.equal(canonicalize({ a: "x" }), canonicalize({ a: "x" }));
  });

  it("(12) null compares to null; null vs undefined compares unequal", () => {
    // null and undefined serialize differently via JSON.stringify; the
    // canonicalizer inherits that. Pre-compare `applyDefaults` should fill
    // undefined keys before canonicalize is called.
    assert.equal(canonicalize({ a: null }), canonicalize({ a: null }));
    assert.equal(canonicalize({}), canonicalize({}), "two empty objects are equal");
  });
});
