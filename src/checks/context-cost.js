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
      ? `Your skill listing costs about ${totalTokens.toLocaleString()} tokens on every request — ${pctOfBudget}% of its budget — and ${deadShare}% of that is skills you have never invoked.`
      : `Your skill listing costs about ${totalTokens.toLocaleString()} tokens on every request, roughly ${pctOfBudget}% of the budget it is allotted.`;

    return {
      severity,
      headline,
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
