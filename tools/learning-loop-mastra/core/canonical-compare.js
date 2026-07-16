// Tier 2 Phase B: canonical comparator for the no-op short-circuit.
//
// Resolves meta-260715T2311Z-gratuitous-mutations: when an `updateEntry` patch
// produces no field change, the write must be a no-op (no version bump, no
// append). Naïve `JSON.stringify(a) === JSON.stringify(b)` is wrong because
// multiple meta-state fields accept arrays (`reopens`, `change_diff.added/removed/changed`,
// `consolidates`, `applies_to.{tools,surfaces,rules,statuses,schemas}`,
// `proposed_design_for`, `addresses`); same set in different array order
// would falsely bump version.
//
// The canonical form sorts object keys recursively; arrays are sorted
// element-wise (set semantics). undefined-valued keys are dropped so a legacy
// entry lacking schema-defaulted fields canonicalizes identically to a
// post-default entry (the RT H9 precondition for the short-circuit to be
// correct regardless of whether the entry was read raw from disk or written
// through the schema).

// Sentinel returned for semantically-absent values; dropped from canonical form.
const ABSENT = "__ABSENT__";

function isAbsent(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    // Sort array elements so {a:[1,2]} and {a:[2,1]} canonicalize equal.
    // For primitive elements, lex-sort; for objects/arrays inside, recurse.
    return value
      .map((v) => sortKeys(v))
      .sort((a, b) => {
        const sa = stableStringify(a);
        const sb = stableStringify(b);
        if (sa < sb) return -1;
        if (sa > sb) return 1;
        return 0;
      });
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      // Drop semantically-absent values (undefined / null / empty array)
      // so legacy raw reads canonicalize identically to post-default reads
      // and a patch setting reopens=[] on a missing-reopens entry is a no-op
      // (RT H9 precondition).
      .filter((k) => !isAbsent(value[k]))
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(value[k]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(v) {
  // Stringify using JSON.parse(JSON.stringify(...)) which gives a deterministic
  // representation of the sorted-keys canonical form. Required for the
  // lex-sort comparator above (Array.prototype.sort's default comparator
  // coerces to string via toString, which is OK for primitives but unusable
  // for objects).
  return JSON.stringify(v);
}

function canonicalize(entry) {
  if (entry === undefined || entry === null) return JSON.stringify(entry ?? null);
  return JSON.stringify(sortKeys(entry));
}

function entriesEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  return canonicalize(a) === canonicalize(b);
}

export { canonicalize, entriesEqual };
