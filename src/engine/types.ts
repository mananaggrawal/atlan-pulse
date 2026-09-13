/**
 * The audit engine's vocabulary.
 *
 * Everything in `engine/` is pure: it imports nothing from express, no
 * database, no filesystem, no git. It takes a plain array of facts about
 * skills and returns findings and a score. That is what lets the same code
 * run behind the HTTP surface, behind an MCP tool, and inside a unit test
 * with no infrastructure at all.
 *
 * Three rules hold across every check in here and are enforced by tests:
 *
 *  1. **A finding never carries a secret value.** Checks that match on
 *     credential-shaped text report the file, the line and the *class* of
 *     pattern. They never echo what they matched. A report is something
 *     people paste into screenshots.
 *  2. **Determinism.** Same input, same output, byte for byte. The score is
 *     built only from this layer precisely because a model's judgment is not
 *     reproducible, and a score that moves on its own is worthless.
 *  3. **A finding states its rule, not a verdict.** `rule` is the criterion
 *     that fired. A reader who disagrees with a finding should be able to
 *     disagree with something specific.
 */

/**
 * The five dimensions. These are the product: the user asked for token
 * optimisation, dedupe, security, vulnerability and improvement, and the
 * engine is organised around exactly those words rather than around an
 * internal taxonomy nobody outside the code would recognise.
 */
export type AuditKind = 'tokens' | 'dedupe' | 'security' | 'vulnerability' | 'improvement';

export const ALL_AUDITS: AuditKind[] = [
  'tokens',
  'dedupe',
  'security',
  'vulnerability',
  'improvement',
];

/**
 * Ordering and weight only. Severity decides sort order and the score
 * penalty; it is never rendered as a verdict word on its own — the check's
 * `rule` says what the criterion was, which is the thing a reader can argue
 * with.
 */
export type FindingSeverity = 'info' | 'low' | 'medium' | 'high';

export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/**
 * One place in one file where something was observed. Carries a *class*, not
 * content — see rule 1 above.
 */
export interface FindingEvidence {
  /** Path relative to the skill folder, e.g. `SKILL.md` or `scripts/run.py`. */
  file: string;
  /** 1-indexed. */
  line: number;
  /** What kind of thing was seen, e.g. `aws-access-key-id`. Never the value. */
  patternClass: string;
}

export interface AuditFinding {
  audit: AuditKind;
  /** Stable machine name, e.g. `listing-cost`, `hardcoded-secret`. */
  check: string;
  severity: FindingSeverity;
  /** The skill this is about; `null` for a catalog-level finding. */
  skillName: string | null;
  /** For dedupe: the other skill in the pair. */
  relatedSkillName?: string | null;
  /** One line, factual, no adjectives. */
  headline: string;
  /** The criterion that produced this finding — the rule, not the verdict. */
  rule: string;
  /** Optional expansion: what was measured, or what the measurement cannot see. */
  detail?: string;
  evidence?: FindingEvidence[];
  /** Numbers behind the headline, for a UI that wants to render them. */
  stat?: Record<string, number | string>;
  /**
   * Present only on reviewer findings, which are added by the service after
   * the score is computed. The engine never sets this, and `score.ts` throws
   * if it ever sees one.
   */
  source?: 'reviewer';
  /** Reviewer findings must quote the line that convinced the reviewer. */
  evidenceQuote?: string;
}

/** A bundled file inside a skill folder. */
export interface AuditSkillFile {
  /** Relative to the skill folder. */
  file: string;
  content: string;
}

/**
 * Everything the engine needs to know about one skill. Assembled by the
 * caller — the engine itself never reads a file or runs a command.
 */
export interface AuditSkillInput {
  name: string;
  /** Where it came from, for display, e.g. `~/.claude/skills/rfi`. */
  path: string;
  description: string;
  /** The SKILL.md body, frontmatter already stripped. */
  body: string;
  /** `allowed-tools` from frontmatter, when declared. */
  allowedTools?: string[];
  /** Raw frontmatter keys the checks care about but the type does not model. */
  frontmatter?: Record<string, string | string[] | boolean | number | null>;
  /** Owners resolved from frontmatter. */
  owners?: string[];
  /** ISO timestamp of the last commit touching this skill, when known. */
  lastCommitAt?: string | null;
  files?: AuditSkillFile[];
  /** Invocations in the telemetry window, when telemetry is available. */
  invocations?: number | null;
}

export interface ScoreComponent {
  score: number;
  max: number;
  /** What drove this number, in one factual line. */
  basis: string;
}

/**
 * Bands are numeric on purpose. A score is defensible; an adjective attached
 * to it is an argument we would have to keep having.
 */
export type ScoreBand = '90+' | '75-89' | '60-74' | 'below-60';

export interface PulseScore {
  /**
   * Bumped whenever any check, weight or threshold changes. A score is only
   * comparable within one engine version, and every published card carries
   * this so an old card keeps meaning what it measured.
   */
  engineVersion: string;
  total: number;
  band: ScoreBand;
  /** One component per dimension, in the same vocabulary as `AuditKind`. */
  components: Record<AuditKind, ScoreComponent>;
}

/**
 * The always-on cost, expressed in money.
 *
 * This is an ESTIMATE and every surface that renders it has to say so. It is
 * here because "2,380 listing tokens" means nothing to most people and
 * "about $9 a month before a single skill runs" means something to everyone.
 * Assumptions are returned alongside the number so the reader can disagree
 * with the assumptions rather than with the number.
 */
export interface CostEstimate {
  monthlyUsd: number;
  assumptions: {
    turnsPerDay: number;
    daysPerMonth: number;
    inputUsdPerMillionTokens: number;
  };
  /** The share of that cost spent on skills that never fired, when telemetry exists. */
  dormantMonthlyUsd: number | null;
}

export interface AuditTotals {
  skillCount: number;
  /** Tokens spent listing every selected skill to the model on every prompt. */
  listingTokens: number;
  listingBudgetTokens: number;
  /** Tokens in the bodies — what invoking them costs, not what listing them costs. */
  bodyTokens: number;
  /** Tokens in bundled reference files, which cost nothing until they are read. */
  referenceTokens: number;
  duplicatePairs: number;
  secretFindings: number;
  supplyChainFindings: number;
  skillsWithoutOwner: number;
  staleSkills: number;
  /** Null when no telemetry was supplied, rather than a misleading zero. */
  neverInvoked: number | null;
  cost: CostEstimate;
}

export interface DeterministicAuditResult {
  engineVersion: string;
  audits: AuditKind[];
  findings: AuditFinding[];
  totals: AuditTotals;
  score: PulseScore;
}

export interface AuditOptions {
  /** Which audits to run. Defaults to all five. */
  audits?: AuditKind[];
  /** Listing-token budget. Defaults to LISTING_BUDGET_TOKENS. */
  listingBudgetTokens?: number;
  /** Treated as "now" for freshness. Injected so tests are deterministic. */
  now?: Date;
  /** Overrides for the cost estimate's assumptions. */
  cost?: Partial<CostEstimate['assumptions']>;
}
