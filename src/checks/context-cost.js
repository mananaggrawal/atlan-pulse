import { ANCHORS, listingBudgetTokens, estimateTokens } from '../lib/constants.js';

// The headline. Every skill you keep costs context on every single request,
// whether or not it is ever used.
export default {
  id: 'context-cost',
  title: 'Context budget',
  severity: 'info',
  run({ skills, hasInvocationData }) {
    if (!skills.length) return null;

    const totalChars = skills.reduce((n, s) => n + s.descriptionChars, 0);
    const totalTokens = estimateTokens(totalChars);
    const budget = listingBudgetTokens();
    const pctOfBudget = budget ? Math.round((totalTokens / budget) * 100) : 0;

    const dead = hasInvocationData ? skills.filter((s) => s.invocations === 0) : [];
    const deadChars = dead.reduce((n, s) => n + s.descriptionChars, 0);
    const deadShare = totalChars ? Math.round((deadChars / totalChars) * 100) : 0;

    const severity = pctOfBudget > 100 ? 'high' : pctOfBudget > 60 ? 'medium' : 'info';

    const headline = hasInvocationData && dead.length
      ? `Skill descriptions total ~${totalTokens.toLocaleString()} tokens per request, ${pctOfBudget}% of the listing budget. ${deadShare}% of that belongs to skills with zero invocations.`
      : `Skill descriptions total ~${totalTokens.toLocaleString()} tokens per request, ${pctOfBudget}% of the listing budget.`;

    const rule = `${totalTokens.toLocaleString()} of ${budget.toLocaleString()} budgeted tokens`;

    return {
      severity,
      headline,
      rule,
      detail:
        `Estimated from ${totalChars.toLocaleString()} characters of skill descriptions at ~${ANCHORS.CHARS_PER_TOKEN} chars/token, ` +
        `against a listing budget of ${budget.toLocaleString()} tokens (${ANCHORS.LISTING_BUDGET_FRACTION * 100}% of a ${ANCHORS.CONTEXT_WINDOW_TOKENS.toLocaleString()}-token window). ` +
        `Token counts are estimates, not a tokeniser run.`,
      stat: {
        totalChars,
        totalTokens,
        budgetTokens: budget,
        pctOfBudget,
        deadChars,
        deadShare: hasInvocationData ? deadShare : null,
        deadCount: dead.length,
      },
      items: [],
    };
  },
};
