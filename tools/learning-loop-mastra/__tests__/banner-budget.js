// banner-budget.js — shared byte budget for the SessionStart transport banner.
//
// Single source of truth: every test that asserts the banner's wire size
// imports BANNER_BYTES_BUDGET from this helper. The value (4096 = 4 KiB)
// matches the harness-level cap on banner text and leaves headroom for
// future sketch additions without a code-search for the literal.
//
// Historical context: pre-Phase-1, the inline `4096` lived only in
// cli-sessionstart-banner.test.js. Adding a second invariant (the
// cli-context-savings floor test) without extracting this constant would
// have created a two-place update surface for a future budget bump.

export const BANNER_BYTES_BUDGET = 4096;
