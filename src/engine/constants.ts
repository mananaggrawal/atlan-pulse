/**
 * Every threshold in one file, so the `/method` page can be generated from
 * the same values the checks use rather than transcribed by hand and then
 * silently drifting. If you change a number here, bump ENGINE_VERSION.
 *
 * Where a number comes from a published source, the source is named. A
 * threshold nobody can trace is a threshold nobody can argue with, and the
 * whole claim of this product is that its numbers are arguable.
 */

/**
 * The version stamped onto every score and every published card. Bump on any
 * change to a check, a weight or a threshold below — scores are comparable
 * only within a version.
 */
export const ENGINE_VERSION = 'v1';

/**
 * The budget for the *listing* — the name and description of every skill,
 * which the model carries on every single prompt whether or not any skill is
 * used. 2,000 tokens is 1% of a 200k context window.
 *
 * Anthropic's own documentation caps the listing entry itself: description
 * and when_to_use are truncated at 1,536 characters "to reduce context
 * usage", and skill-creator budgets "~100 words always loaded" per skill.
 * This is the catalog-level equivalent of that per-skill rule.
 */
export const LISTING_BUDGET_TOKENS = 2_000;

/**
 * ~100 words of metadata, in tokens. Anthropic's skill-creator states the
 * budget in words; this is that budget expressed in the unit the rest of the
 * engine counts in.
 */
export const DESCRIPTION_TOKEN_LIMIT = 140;

/** A body above this costs more to invoke than most tasks can justify. */
export const BODY_TOKEN_LIMIT = 5_000;

/**
 * Anthropic documents a 500-line ceiling for SKILL.md. Past it, the guidance
 * is to move detail into reference files that load only when needed.
 */
export const BODY_LINE_LIMIT = 500;

/**
 * Aggregate bundled-reference weight past which a skill should be split.
 * Matches the threshold the one serious public skill linter uses.
 */
export const REFERENCE_TOKEN_LIMIT = 25_000;

/** Trigram overlap at or above this makes two descriptions a duplicate candidate. */
export const DESCRIPTION_SIMILARITY_THRESHOLD = 0.55;

/** Jaccard overlap of 5-word body shingles at or above this is a near-copy. */
export const BODY_SHINGLE_THRESHOLD = 0.5;

/** Days since the last commit before a skill is reported as unmodified. */
export const STALE_DAYS = 180;

/** Shannon entropy (bits/char) above which a quoted assignment value looks generated. */
export const SECRET_ENTROPY_THRESHOLD = 3.5;

/**
 * Keyword stuffing in a description: this many quoted trigger strings, or
 * this many comma-separated segments, buys recall by spending the always-on
 * budget. Both thresholds match the public skill-validator's.
 */
export const DESCRIPTION_QUOTED_TRIGGER_LIMIT = 5;
export const DESCRIPTION_SEGMENT_LIMIT = 8;

/**
 * Default assumptions behind the money estimate. Conservative on purpose:
 * an estimate that flatters the problem is worth less than one nobody can
 * accuse of inflation.
 */
export const COST_ASSUMPTIONS = {
  /** Turns per working day for one active user. */
  turnsPerDay: 120,
  daysPerMonth: 22,
  /** Input price per million tokens, in USD. */
  inputUsdPerMillionTokens: 3,
} as const;

/**
 * Weights sum to 100 and are published on `/method`. The split says what the
 * product believes: the always-on cost is the biggest lever, security is
 * heavier than tidiness, and vulnerability is scored separately from
 * security because a supply-chain finding and a leaked credential are not
 * the same kind of problem.
 */
export const SCORE_WEIGHTS = {
  tokens: 30,
  dedupe: 20,
  security: 25,
  vulnerability: 10,
  improvement: 15,
} as const;
