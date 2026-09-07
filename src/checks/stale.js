import { plural } from '../lib/text.js';

export default {
  id: 'stale',
  title: 'Stale',
  severity: 'low',
  run({ skills, options }) {
    const days = options.staleDays;
    const old = skills.filter((s) => s.daysSinceModified > days);
    if (!old.length) return null;
    return {
      severity: old.length / skills.length > 0.5 ? 'medium' : 'low',
      headline: `${old.length} skill${old.length === 1 ? ' has' : 's have'} not been touched in over ${days} days.`,
      detail: 'Age alone is not decay — a stable skill is a good skill. It matters most where a stale skill is also heavily invoked, which is where drift shows up.',
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
