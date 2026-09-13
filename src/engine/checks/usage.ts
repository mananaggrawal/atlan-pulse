import type { AuditFinding, AuditSkillInput } from '../types.ts';

/**
 * What the catalog actually gets used for.
 *
 * Reports `null` rather than zero when no telemetry was supplied. The
 * difference matters: "this skill was never called" and "we have no record of
 * calls" are completely different statements, and collapsing them into a zero
 * is how a report starts lying. Coverage is stated wherever these numbers are
 * rendered — they count calls that went through this server, and nothing else.
 */
export function checkUsage(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
  neverInvoked: number | null;
} {
  const withData = skills.filter((s) => typeof s.invocations === 'number');
  if (withData.length === 0) return { findings: [], neverInvoked: null };

  const findings: AuditFinding[] = [];
  const totals = withData
    .map((s) => ({ name: s.name, n: s.invocations as number }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  const total = totals.reduce((n, t) => n + t.n, 0);
  const never = totals.filter((t) => t.n === 0);

  if (never.length > 0) {
    findings.push({
      audit: 'tokens',
      check: 'never-invoked',
      severity: 'info',
      skillName: null,
      headline: `${never.length} of ${withData.length} skills have no recorded invocations`,
      rule: 'zero invocations recorded through this server in the telemetry window',
      detail:
        'Counts calls that passed through this server. A skill installed locally and used ' +
        'without touching it is not visible here.',
      stat: { neverInvoked: never.length, measured: withData.length },
    });
  }

  if (total > 0 && totals.length >= 3) {
    const top3 = totals.slice(0, 3);
    const top3Share = top3.reduce((n, t) => n + t.n, 0) / total;
    findings.push({
      audit: 'tokens',
      check: 'invocation-concentration',
      severity: 'info',
      skillName: null,
      headline: `3 skills account for ${Math.round(top3Share * 100)}% of recorded invocations`,
      rule: 'top 3 skills by invocation count, as a share of all recorded invocations',
      stat: {
        top3Share: Math.round(top3Share * 1000) / 10,
        total,
        leaders: top3.map((t) => `${t.name} (${t.n})`).join(', '),
      },
    });
  }

  return { findings, neverInvoked: never.length };
}
