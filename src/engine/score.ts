import type {
  AuditFinding,
  AuditKind,
  PulseScore,
  ScoreBand,
  ScoreComponent,
} from './types.ts';
import { ENGINE_VERSION, SCORE_WEIGHTS } from './constants.ts';

/**
 * The Pulse Score.
 *
 * Built from the deterministic layer and nothing else. A model's judgment is
 * genuinely more insightful than any of these measurements, and it is
 * deliberately excluded: two runs over the same catalog have to produce the
 * same number, or the number cannot be published, compared or argued with.
 * `assertDeterministicOnly` below is not decoration — it is what stops a
 * future careless merge from folding reviewer findings back in.
 *
 * Each component reports its own basis so the total is readable. A bare 72
 * tells a reader nothing; "72 — security 25/25, tokens 9/30" tells them what
 * to do next.
 */

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ScoreInput {
  skillCount: number;
  listingTokens: number;
  listingBudgetTokens: number;
  /** Structure checks attempted and passed across the whole selection. */
  structureAttempted: number;
  structurePassed: number;
  staleSkills: number;
  /** Distinct skills involved in at least one duplicate pair. */
  skillsInDuplicatePairs: number;
  findings: AuditFinding[];
  /** Which audits actually ran. A component for an audit that did not run scores full. */
  audits: AuditKind[];
}

const NOT_RUN = 'Not measured in this run.';
const EMPTY = 'No skills selected.';

/**
 * How much of the always-on listing budget the selection spends. At or under
 * budget scores full marks — being frugal below the budget is not better, it
 * is just under. Over budget decays linearly and reaches zero at 2.5x, which
 * is roughly where a catalog's listing costs more than the work it enables.
 */
function tokens(input: ScoreInput): ScoreComponent {
  const max = SCORE_WEIGHTS.tokens;
  if (input.skillCount === 0 || input.listingBudgetTokens <= 0) {
    return { score: max, max, basis: EMPTY };
  }
  const ratio = input.listingTokens / input.listingBudgetTokens;
  const factor = clamp01(1 - Math.max(0, ratio - 1) / 1.5);
  return {
    score: round(max * factor),
    max,
    basis: `${input.listingTokens.toLocaleString()} of ${input.listingBudgetTokens.toLocaleString()} budgeted listing tokens (${Math.round(ratio * 100)}%).`,
  };
}

/** The share of the selection not implicated in a duplicate pair. */
function dedupe(input: ScoreInput): ScoreComponent {
  const max = SCORE_WEIGHTS.dedupe;
  if (input.skillCount === 0) return { score: max, max, basis: EMPTY };
  const factor = clamp01(1 - input.skillsInDuplicatePairs / input.skillCount);
  return {
    score: round(max * factor),
    max,
    basis: `${input.skillsInDuplicatePairs} of ${input.skillCount} skills appear in at least one duplicate pair.`,
  };
}

/**
 * Weighted findings per skill, steep on purpose: one hardcoded credential in
 * a catalog of ten is a bigger fact about that catalog than nine tidy
 * descriptions are. Security and vulnerability share this shape but are
 * scored apart — a leaked key and an unpinned install are different problems
 * with different fixes, and averaging them hides both.
 */
function penaltyComponent(
  input: ScoreInput,
  kind: 'security' | 'vulnerability',
  label: string,
): ScoreComponent {
  const max = SCORE_WEIGHTS[kind];
  if (input.skillCount === 0) return { score: max, max, basis: EMPTY };

  const relevant = input.findings.filter((f) => f.audit === kind);
  const high = relevant.filter((f) => f.severity === 'high').length;
  const medium = relevant.filter((f) => f.severity === 'medium').length;
  const low = relevant.filter((f) => f.severity === 'low').length;

  const weighted = 3 * high + 1 * medium + 0.25 * low;
  const penalty = clamp01(weighted / input.skillCount);
  return {
    score: round(max * (1 - penalty)),
    max,
    basis:
      relevant.length === 0
        ? `No ${label} findings.`
        : `${high} high, ${medium} medium, ${low} low ${label} findings across ${input.skillCount} skills.`,
  };
}

/**
 * The share of structural checks that passed, discounted by how much of the
 * catalog has gone untouched. Staleness is a modifier rather than its own
 * component because an old skill that is otherwise well-formed is a smaller
 * problem than a new one that nobody can trigger.
 */
function improvement(input: ScoreInput): ScoreComponent {
  const max = SCORE_WEIGHTS.improvement;
  if (input.structureAttempted === 0) {
    return { score: max, max, basis: EMPTY };
  }
  const passRate = input.structurePassed / input.structureAttempted;
  const staleShare = input.skillCount > 0 ? input.staleSkills / input.skillCount : 0;
  const factor = clamp01(passRate * (1 - 0.3 * staleShare));
  return {
    score: round(max * factor),
    max,
    basis: `${input.structurePassed} of ${input.structureAttempted} structure checks passed; ${input.staleSkills} of ${input.skillCount} unchanged beyond the staleness threshold.`,
  };
}

export function bandFor(total: number): ScoreBand {
  if (total >= 90) return '90+';
  if (total >= 75) return '75-89';
  if (total >= 60) return '60-74';
  return 'below-60';
}

/**
 * Guard, not decoration. The score may only ever see deterministic findings;
 * reviewer findings (`source: 'reviewer'`, added by the service layer) must
 * never be in this array. If one is, that is a bug that would make two runs
 * of the same catalog disagree, and it should fail loudly here rather than
 * quietly in production.
 */
export function assertDeterministicOnly(findings: AuditFinding[]): void {
  const leaked = findings.filter((f) => f.source !== undefined);
  if (leaked.length > 0) {
    throw new Error(
      `Pulse Score received ${leaked.length} non-deterministic finding(s): ${leaked
        .map((f) => f.check)
        .join(', ')}. Reviewer findings must never reach the score.`,
    );
  }
}

/**
 * A component for a dimension that did not run scores full marks and says so.
 * Correct — nothing was measured, so nothing was found wanting — but it does
 * mean a partial run's total is not comparable with a full run's, which is
 * why only full runs may be published as a card.
 */
function forKind(input: ScoreInput, kind: AuditKind): ScoreComponent {
  if (!input.audits.includes(kind)) {
    return { score: SCORE_WEIGHTS[kind], max: SCORE_WEIGHTS[kind], basis: NOT_RUN };
  }
  switch (kind) {
    case 'tokens':
      return tokens(input);
    case 'dedupe':
      return dedupe(input);
    case 'security':
      return penaltyComponent(input, 'security', 'security');
    case 'vulnerability':
      return penaltyComponent(input, 'vulnerability', 'supply-chain');
    case 'improvement':
      return improvement(input);
  }
}

export function computeScore(input: ScoreInput): PulseScore {
  assertDeterministicOnly(input.findings);

  const components: Record<AuditKind, ScoreComponent> = {
    tokens: forKind(input, 'tokens'),
    dedupe: forKind(input, 'dedupe'),
    security: forKind(input, 'security'),
    vulnerability: forKind(input, 'vulnerability'),
    improvement: forKind(input, 'improvement'),
  };

  const total = Math.round(
    Object.values(components).reduce((sum, c) => sum + c.score, 0),
  );

  return { engineVersion: ENGINE_VERSION, total, band: bandFor(total), components };
}
