import type { AuditFinding, AuditSkillInput } from '../types.ts';
import { STALE_DAYS } from '../constants.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long since anyone touched a skill.
 *
 * Worth one note that the CLI version of this check got wrong for months:
 * age here is the last COMMIT date, not the file's mtime. Git does not
 * preserve mtime, so an mtime-based age reports the clone date for every file
 * in a fresh checkout — which is to say, it reports nothing, identically, for
 * every reviewer. Because this catalog is git-backed, the commit date is
 * available and correct.
 */
export function checkFreshness(
  skills: AuditSkillInput[],
  now: Date,
): { findings: AuditFinding[]; staleSkills: number } {
  const findings: AuditFinding[] = [];
  let staleSkills = 0;

  for (const s of skills) {
    if (!s.lastCommitAt) continue;
    const ts = Date.parse(s.lastCommitAt);
    if (Number.isNaN(ts)) continue;
    const days = Math.floor((now.getTime() - ts) / DAY_MS);
    if (days > STALE_DAYS) {
      staleSkills += 1;
      findings.push({
        audit: 'improvement',
        check: 'modification-age',
        severity: 'info',
        skillName: s.name,
        headline: `Last changed ${days} days ago`,
        rule: `>${STALE_DAYS} days since the last commit touching this skill`,
        detail: 'Age is taken from git history, not file mtime.',
        stat: { days, threshold: STALE_DAYS },
      });
    }
  }

  return { findings, staleSkills };
}
