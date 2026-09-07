export default {
  id: 'never-invoked',
  title: 'Never invoked',
  severity: 'medium',
  run({ skills, hasInvocationData, options }) {
    if (!hasInvocationData) {
      return {
        severity: 'info',
        skipped: true,
        headline: 'No session transcripts found. Invocation counts are unavailable.',
        rule: 'not run — no input data',
        detail:
          'This check reads Claude Code session transcripts (~/.claude/projects/**/*.jsonl). ' +
          'Run with --debug-transcripts to list the paths searched. No value is estimated in their absence.',
        items: [],
      };
    }
    const dead = skills.filter((s) => s.invocations === 0);
    if (!dead.length) {
      return { severity: 'info', headline: `Every skill was invoked at least once in the last ${options.windowDays} days.`, rule: '0 skills at zero invocations', items: [] };
    }
    const pct = Math.round((dead.length / skills.length) * 100);
    return {
      severity: pct >= 40 ? 'high' : 'medium',
      headline: `${dead.length} of ${skills.length} skills (${pct}%) recorded zero invocations in the last ${options.windowDays} days.`,
      rule: `zero invocations in ${options.windowDays} days`,
      detail: 'Their description characters are still counted in the listing on every request.',
      items: dead
        .sort((a, b) => b.descriptionChars - a.descriptionChars)
        .map((s) => ({ name: s.name, note: `${s.descriptionChars} chars of description`, path: s.relPath })),
    };
  },
};
