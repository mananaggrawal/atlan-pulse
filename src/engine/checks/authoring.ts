import type { AuditFinding, AuditSkillInput } from '../types.ts';
import {
  BODY_LINE_LIMIT,
  DESCRIPTION_QUOTED_TRIGGER_LIMIT,
  DESCRIPTION_SEGMENT_LIMIT,
  REFERENCE_TOKEN_LIMIT,
} from '../constants.ts';
import { estimateTokens } from '../tokens.ts';

/**
 * Whether a skill is written the way the published guidance says to write one.
 *
 * The interesting check here is `keyword-stuffed-description`, and it exists
 * because of a real contradiction in the guidance nobody has reconciled in
 * public. Anthropic's own skill-creator tells authors to make descriptions "a
 * little bit pushy" and to enumerate triggers, because the dominant failure
 * mode is a skill that never fires. The same documentation caps the listing
 * entry at 1,536 characters because every one of those characters is carried
 * on every prompt. Follow the first piece of advice hard enough and you break
 * the second.
 *
 * This engine takes a position on that trade-off rather than pretending it
 * does not exist: enumerate triggers until the near-misses are covered, then
 * stop. A description carrying a dozen quoted phrases is usually not buying
 * recall any more — it is paying rent on phrases that were already covered.
 */

const QUOTED = /["'“”][^"'“”\n]{2,}["'“”]/g;

export function checkAuthoring(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
  referenceTokens: number;
} {
  const findings: AuditFinding[] = [];
  let referenceTokens = 0;

  for (const s of skills) {
    const description = (s.description ?? '').trim();

    // 1 — recall bought by the yard.
    const quoted = description.match(QUOTED)?.length ?? 0;
    const segments = description.split(',').filter((p) => p.trim().length > 0).length;
    if (quoted >= DESCRIPTION_QUOTED_TRIGGER_LIMIT || segments >= DESCRIPTION_SEGMENT_LIMIT) {
      findings.push({
        audit: 'improvement',
        check: 'keyword-stuffed-description',
        severity: 'low',
        skillName: s.name,
        headline:
          quoted > 0
            ? `Description enumerates ${quoted} quoted trigger${quoted === 1 ? '' : 's'} across ${segments} clauses`
            : `Description runs to ${segments} clauses`,
        rule: `>=${DESCRIPTION_QUOTED_TRIGGER_LIMIT} quoted triggers or >=${DESCRIPTION_SEGMENT_LIMIT} comma-separated clauses`,
        detail:
          'Every clause is carried on every prompt. Keep the phrasings that win a near-miss the others would lose; ' +
          'drop the ones that only restate a phrasing already covered.',
        stat: { quotedTriggers: quoted, clauses: segments },
      });
    }

    // 2 — a body that should have become reference files.
    const lines = s.body.split('\n').length;
    if (lines > BODY_LINE_LIMIT) {
      findings.push({
        audit: 'improvement',
        check: 'body-over-line-limit',
        severity: 'low',
        skillName: s.name,
        headline: `SKILL.md is ${lines.toLocaleString()} lines`,
        rule: `>${BODY_LINE_LIMIT} lines in SKILL.md`,
        detail:
          'The documented ceiling is 500 lines. Past it, detail belongs in reference files the skill loads ' +
          'only when it needs them, so the common path stays cheap.',
        stat: { lines, limit: BODY_LINE_LIMIT },
      });
    }

    // 3 — reference weight. Costs nothing until read, which is exactly why it
    //     is reported separately from the always-on listing cost rather than
    //     folded into it.
    const refs = (s.files ?? []).filter((f) => f.file !== 'SKILL.md');
    const refTokens = refs.reduce((n, f) => n + estimateTokens(f.content), 0);
    referenceTokens += refTokens;
    if (refTokens > REFERENCE_TOKEN_LIMIT) {
      findings.push({
        audit: 'improvement',
        check: 'reference-weight',
        severity: 'info',
        skillName: s.name,
        headline: `Bundles ${refTokens.toLocaleString()} tokens across ${refs.length} reference files`,
        rule: `>${REFERENCE_TOKEN_LIMIT.toLocaleString()} tokens of bundled references`,
        detail:
          'Not an always-on cost. It becomes one the moment the skill tells the agent to read all of them, ' +
          'so check that the body points at one file at a time.',
        stat: { referenceTokens: refTokens, files: refs.length },
      });
    }
  }

  return { findings, referenceTokens };
}
