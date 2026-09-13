import { randomUUID } from 'node:crypto';
import type {
  AuditFinding,
  AuditKind,
  AuditSkillInput,
  FindingSeverity,
} from '../engine/types.ts';
import { ALL_AUDITS } from '../engine/types.ts';
import { runDeterministicAudit } from '../engine/index.ts';
import {
  digestSkills,
  mintSlug,
  toPublicCard,
  type AuditRun,
  type RunStore,
} from '../store/runs.ts';
import { rubricFor, reviewerChecks, type RubricSection } from './rubric.ts';

/**
 * The audit service: three calls, and the order between them is the product.
 *
 * `start` measures and scores. `submit` accepts judgment. `finish` publishes.
 * The score is written by `start` and never touched again — which is what
 * makes it safe to let a model contribute to the report at all. A reviewer
 * finding arriving after the number is fixed cannot move it, by construction
 * rather than by discipline.
 */

export interface StartAuditInput {
  accountId: string;
  skills: AuditSkillInput[];
  audits?: AuditKind[];
  /** Number of turns per day to assume in the cost estimate. */
  turnsPerDay?: number;
}

export interface StartAuditResult {
  runId: string;
  engineVersion: string;
  audits: AuditKind[];
  score: AuditRun['deterministic']['score'];
  totals: AuditRun['deterministic']['totals'];
  findings: AuditFinding[];
  rubric: RubricSection[];
  skipped: string[];
  note: string;
}

export interface ReviewerFindingInput {
  check: string;
  skillName: string;
  relatedSkillName?: string;
  severity?: FindingSeverity;
  headline: string;
  evidenceQuote: string;
  detail?: string;
}

export class AuditService {
  private store: RunStore;
  private baseUrl: string;

  constructor(store: RunStore, baseUrl: string) {
    this.store = store;
    this.baseUrl = baseUrl;
  }

  async start(input: StartAuditInput): Promise<StartAuditResult> {
    const audits = input.audits?.length ? [...new Set(input.audits)].sort() : [...ALL_AUDITS];

    // A skill with no name cannot be reported on, and a silent drop is how a
    // report ends up describing a catalog that was never audited.
    const usable = input.skills.filter((s) => s.name?.trim());
    const skipped = input.skills.filter((s) => !s.name?.trim()).map((_, i) => `skill #${i + 1}`);

    const deterministic = runDeterministicAudit(usable, {
      audits,
      cost: input.turnsPerDay ? { turnsPerDay: input.turnsPerDay } : {},
    });

    const run: AuditRun = {
      runId: randomUUID(),
      accountId: input.accountId,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      status: 'open',
      engineVersion: deterministic.engineVersion,
      audits,
      skills: digestSkills(usable),
      deterministic,
      reviewerFindings: [],
      published: false,
      slug: null,
    };
    await this.store.create(run);

    return {
      runId: run.runId,
      engineVersion: run.engineVersion,
      audits,
      score: deterministic.score,
      totals: deterministic.totals,
      findings: deterministic.findings,
      rubric: rubricFor(audits),
      skipped,
      note:
        'The score is now fixed. Answer the rubric, submit findings with a quote each, then finish. ' +
        'Skill text is not retained — only findings, counts and a hash per skill.',
    };
  }

  /**
   * Reviewer findings are validated, not trusted. Three rules, each of which
   * exists because the alternative degrades the report in a way that is hard
   * to notice later: an unknown check name means the reviewer invented a
   * category; a missing quote means it invented a finding; a finding about a
   * skill that was not in the run means it is reviewing something else.
   */
  async submit(
    runId: string,
    findings: ReviewerFindingInput[],
  ): Promise<{ accepted: number; rejected: Array<{ headline: string; reason: string }> }> {
    const run = await this.store.get(runId);
    if (!run) throw new Error(`No such run: ${runId}`);
    if (run.status === 'finished') throw new Error('This run is finished; start a new one.');

    const allowed = reviewerChecks();
    const known = new Set(run.skills.map((s) => s.name));
    const accepted: AuditFinding[] = [];
    const rejected: Array<{ headline: string; reason: string }> = [];

    for (const f of findings) {
      if (!allowed.has(f.check)) {
        rejected.push({ headline: f.headline, reason: `unknown check "${f.check}"` });
        continue;
      }
      if (!f.evidenceQuote?.trim()) {
        rejected.push({ headline: f.headline, reason: 'no evidenceQuote' });
        continue;
      }
      if (!known.has(f.skillName)) {
        rejected.push({ headline: f.headline, reason: `"${f.skillName}" was not in this run` });
        continue;
      }
      accepted.push({
        audit: auditForCheck(f.check),
        check: f.check,
        severity: f.severity ?? 'low',
        skillName: f.skillName,
        relatedSkillName: f.relatedSkillName ?? null,
        headline: f.headline,
        rule: 'reviewer judgment, quoted',
        detail: f.detail,
        evidenceQuote: f.evidenceQuote,
        source: 'reviewer',
      });
    }

    await this.store.update(runId, {
      reviewerFindings: [...run.reviewerFindings, ...accepted],
    });

    return { accepted: accepted.length, rejected };
  }

  async finish(
    runId: string,
    options: { publish?: boolean } = {},
  ): Promise<{
    runId: string;
    score: number;
    band: string;
    reportUrl: string;
    pdfUrl: string;
    cardUrl: string | null;
    reviewerFindings: number;
    percentile: string | null;
  }> {
    const run = await this.store.get(runId);
    if (!run) throw new Error(`No such run: ${runId}`);

    const publish = options.publish ?? false;
    const slug = publish ? (run.slug ?? mintSlug()) : run.slug;

    const finished = await this.store.update(runId, {
      status: 'finished',
      finishedAt: new Date().toISOString(),
      published: publish,
      slug: publish ? slug : null,
    });

    // Suppressed below 30 published runs: a percentile computed against a
    // handful of runs is a number that will move for reasons that have nothing
    // to do with the user's skills.
    const published = await this.store.publishedCount();

    return {
      runId,
      score: finished.deterministic.score.total,
      band: finished.deterministic.score.band,
      reportUrl: `${this.baseUrl}/r/${runId}`,
      pdfUrl: `${this.baseUrl}/r/${runId}.pdf`,
      cardUrl: toPublicCard(finished) ? `${this.baseUrl}/c/${finished.slug}` : null,
      reviewerFindings: finished.reviewerFindings.length,
      percentile: published >= 30 ? 'available' : null,
    };
  }
}

const CHECK_AUDIT: Record<string, AuditKind> = {
  'injection-reachability': 'security',
  'false-positive': 'security',
  'undisclosed-capability': 'vulnerability',
  'intent-overlap': 'dedupe',
  'trigger-collision': 'dedupe',
  'description-can-be-shorter': 'tokens',
  'dormant-but-loaded': 'tokens',
  'trigger-quality': 'improvement',
  'instructions-are-unfollowable': 'improvement',
};

function auditForCheck(check: string): AuditKind {
  return CHECK_AUDIT[check] ?? 'improvement';
}
