import { plural } from '../lib/text.js';

export default {
  id: 'stale',
  title: 'Modification age',
  severity: 'low',
  run({ skills, options }) {
    const days = options.staleDays;
    const old = skills.filter((s) => s.daysSinceModified > days);
    if (!old.length) return null;
    return {
      severity: old.length / skills.length > 0.5 ? 'medium' : 'low',
      headline: `${old.length} skill${old.length === 1 ? ' file has' : ' files have'} a modification date older than ${days} days.`,
      rule: `>${days} days since last modified`,
      detail: 'Age is file mtime. Git does not preserve mtime, so files in a fresh clone report the clone date rather than their real age.',
      items: old
        .sort((a, b) => b.daysSinceModified - a.daysSinceModified)
        .map((s) => ({
          name: s.name,
          note: s.invocations
            ? `${s.daysSinceModified} days old, ${plural(s.invocations, 'invocation')}`
            : `${s.daysSinceModified} days old`,
          path: s.relPath,
        })),
    };
  },
};
