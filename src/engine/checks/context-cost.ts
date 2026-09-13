import type { AuditFinding, AuditSkillInput } from '../types.ts';
import { DESCRIPTION_TOKEN_LIMIT, BODY_TOKEN_LIMIT } from '../constants.ts';
import { estimateTokens, listingTokensFor } from '../tokens.ts';

/**
 * What the catalog costs before anybody uses it.
 *
 * The distinction that makes this check worth having: a skill's *body* is
 * only read when the skill runs, but its *name and description* are carried
 * on every prompt so the model knows the skill exists. A catalog can be over
 * budget on the second while the first is irrelevant, and the two numbers
 * want reporting separately.
 */
export function checkContextCost(
  skills: AuditSkillInput[],
  budgetTokens: number,
): { findings: AuditFinding[]; listingTokens: number; bodyTokens: number } {
  const findings: AuditFinding[] = [];

  const perSkill = skills.map((s) => ({
    skill: s,
    listing: listingTokensFor(s.name, s.description),
    body: estimateTokens(s.body),
  }));

  const listingTokens = perSkill.reduce((n, p) => n + p.listing, 0);
  const bodyTokens = perSkill.reduce((n, p) => n + p.body, 0);

  // Catalog-level: this is the headline number on the card.
  const share = budgetTokens > 0 ? listingTokens / budgetTokens : 0;
  findings.push({
    audit: 'tokens',
    check: 'listing-cost',
    severity: share > 1 ? 'medium' : 'info',
    skillName: null,
    headline: `${listingTokens.toLocaleString()} tokens are loaded on every prompt to list ${skills.length} skills`,
    rule: `${listingTokens} of ${budgetTokens} budgeted listing tokens`,
    detail:
      'Counts each skill\'s name and description, which the model carries whether or not any skill runs. ' +
      'Token counts are estimated, not produced by a BPE tokenizer; the same estimator runs for every catalog.',
    stat: {
      listingTokens,
      budgetTokens,
      sharePct: Math.round(share * 1000) / 10,
      skillCount: skills.length,
    },
  });

  for (const p of perSkill) {
    if (p.listing > DESCRIPTION_TOKEN_LIMIT) {
      findings.push({
        audit: 'tokens',
        check: 'oversized-description',
        severity: 'low',
        skillName: p.skill.name,
        headline: `Description costs ${p.listing} tokens on every prompt`,
        rule: `>${DESCRIPTION_TOKEN_LIMIT} listing tokens`,
        detail: 'This cost is paid on every prompt, not only when the skill runs.',
        stat: { listingTokens: p.listing, limit: DESCRIPTION_TOKEN_LIMIT },
      });
    }
    if (p.body > BODY_TOKEN_LIMIT) {
      findings.push({
        audit: 'tokens',
        check: 'oversized-body',
        severity: 'low',
        skillName: p.skill.name,
        headline: `SKILL.md body is ${p.body.toLocaleString()} tokens`,
        rule: `>${BODY_TOKEN_LIMIT} body tokens`,
        detail: 'Body tokens are spent when the skill is invoked, not when it is listed.',
        stat: { bodyTokens: p.body, limit: BODY_TOKEN_LIMIT },
      });
    }
  }

  return { findings, listingTokens, bodyTokens };
}
