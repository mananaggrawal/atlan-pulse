import { plural } from '../lib/text.js';

export default {
  id: 'concentration',
  title: 'Concentration',
  severity: 'info',
  run({ skills, hasInvocationData, options }) {
    if (!hasInvocationData) return null;
    const total = skills.reduce((n, s) => n + (s.invocations || 0), 0);
    if (!total) return null;

    const ranked = [...skills].sort((a, b) => b.invocations - a.invocations);
    const top = ranked.slice(0, 3).filter((s) => s.invocations > 0);
    const topTotal = top.reduce((n, s) => n + s.invocations, 0);
    const share = Math.round((topTotal / total) * 100);

    return {
      severity: 'info',
      headline: `${top.length} skills account for ${share}% of ${total.toLocaleString()} invocations in the last ${options.windowDays} days.`,
      rule: 'top 3 skills by invocation count',
      detail: 'Share of recorded invocations held by the three most-invoked skills.',
      stat: { totalInvocations: total, topShare: share },
      items: top.map((s) => ({ name: s.name, note: plural(s.invocations, 'invocation'), path: s.relPath })),
    };
  },
};
