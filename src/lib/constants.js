// Anchors used by the context-cost check.
//
// Every number here is sourced, not invented. If you disagree with one, change
// it here — the report prints these values so a reader can audit the maths.
export const ANCHORS = {
  // Claude Code's skill listing is budgeted at roughly 1% of the context window.
  // Source: Anthropic skills documentation, retrieved 2026-09-05.
  LISTING_BUDGET_FRACTION: 0.01,

  // Assumed context window for the budget calculation.
  CONTEXT_WINDOW_TOKENS: 200_000,

  // Per-skill description cap in the listing. Source: same, 2026-09-05.
  MAX_DESCRIPTION_CHARS: 1536,

  // Rough chars-per-token for English prose. Used only for estimates, and the
  // report says so in as many words.
  CHARS_PER_TOKEN: 4,
};

// How to tell someone to run this.
//
// Nothing is published to npm yet, so `npx atlan-pulse` resolves only inside a
// clone and 404s for everyone else. The github: form works today. This is the
// one place it is written down: when the package is published, change this line
// to `npx atlan-pulse` and the report footer, the share card and the suggested
// post all follow.
export const RUN_COMMAND = 'npx atlan-pulse';

export const DEFAULTS = {
  STALE_DAYS: 180,
  WINDOW_DAYS: 90,
  PACK_TOP_N: 10,
  NEAR_DUPLICATE_THRESHOLD: 0.55,
};

export const listingBudgetTokens = () =>
  Math.round(ANCHORS.CONTEXT_WINDOW_TOKENS * ANCHORS.LISTING_BUDGET_FRACTION);

export const estimateTokens = (chars) => Math.round(chars / ANCHORS.CHARS_PER_TOKEN);
