export default {
  id: 'never-invoked',
  title: 'Never invoked',
  severity: 'medium',
  run({ skills, hasInvocationData, options }) {
    if (!hasInvocationData) {
      return {
        severity: 'info',
        skipped: true,
        headline: 'No session transcripts found, so invocation counts are unavailable.',
        detail:
          'This check needs Claude Code session transcripts (~/.claude/projects/**/*.jsonl). ' +
          'Run with --debug-transcripts to see what was found. Nothing here is estimated in their absence.',
        items: [],
      };
    }
    const dead = skills.filter((s) => s.invocations === 0);
    if (!dead.length) {
      return { severity: 'info', headline: `Every skill was invoked at least once in the last ${options.windowDays} days.`, items: [] };
    }
    const pct = Math.round((dead.length / skills.length) * 100);
    return {
      severity: pct >= 40 ? 'high' : 'medium',
      headline: `${dead.length} of ${skills.length} skills (${pct}%) were never invoked in the last ${options.windowDays} days.`,
      detail: 'Each one still costs context on every request.',
      items: dead
        .sort((a, b) => b.descriptionChars - a.descriptionChars)
        .map((s) => ({ name: s.name, note: `${s.descriptionChars} chars of description`, path: s.relPath })),
    };
  },
};
