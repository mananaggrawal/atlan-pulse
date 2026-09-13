import type { AuditFinding, AuditSkillInput } from '../types.ts';

/**
 * What a skill is allowed to reach for.
 *
 * Declaring a shell is not a problem — plenty of legitimate skills need one.
 * What this check reports is the *combination* a reviewer should look at: a
 * skill that can run commands or delete files, in a catalog where it may be
 * installed by someone who never read it. The severity difference between
 * "declares network access" and "declares a shell and takes remote input" is
 * the whole point, and it is why this is measured rather than banned.
 *
 * Deliberately narrow. An earlier version of this check fired on any skill
 * declaring `Write`, which is most of them, which meant it said nothing.
 */

const SHELL = /\b(bash|shell|sh|zsh|exec|execute|run[_-]?command|subprocess|terminal|command)\b/i;
const DELETE = /\b(delete|remove|rm|unlink|destroy|drop|purge|erase)\b/i;
const NETWORK = /\b(fetch|http|https|curl|wget|request|webhook|network|browser|navigate|download|upload|api)\b/i;

export type AccessClass = 'shell' | 'delete' | 'network';

/**
 * Tool names arrive as `WebFetch`, `run_command`, `bash-exec` — so matching on
 * word boundaries alone misses the camelCase half of them (`\bfetch\b` does
 * not match inside `WebFetch`). Split on case transitions and separators
 * first, then every pattern below sees ordinary spaced words.
 */
export function splitToolName(raw: string): string {
  return String(raw)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[._\-/]+/g, ' ')
    .trim();
}

export function classifyTools(allowedTools: string[]): AccessClass[] {
  const classes = new Set<AccessClass>();
  for (const raw of allowedTools) {
    const t = splitToolName(raw);
    if (SHELL.test(t)) classes.add('shell');
    if (DELETE.test(t)) classes.add('delete');
    if (NETWORK.test(t)) classes.add('network');
  }
  return [...classes].sort();
}

export function checkToolAccess(skills: AuditSkillInput[]): { findings: AuditFinding[] } {
  const findings: AuditFinding[] = [];

  for (const s of skills) {
    const declared = (s.allowedTools ?? []).filter(Boolean);
    if (declared.length === 0) continue;

    const classes = classifyTools(declared);
    const destructive = classes.filter((c) => c === 'shell' || c === 'delete');
    if (destructive.length === 0) continue;

    // A skill that can both act destructively and pull in outside content is
    // the shape worth flagging harder: the outside content can choose what the
    // destructive capability does.
    const alsoNetwork = classes.includes('network');

    findings.push({
      audit: 'security',
      check: 'declared-tool-access',
      severity: alsoNetwork ? 'medium' : 'low',
      skillName: s.name,
      headline: alsoNetwork
        ? `Declares ${destructive.join(' and ')} access alongside network access`
        : `Declares ${destructive.join(' and ')} access`,
      rule: 'declared tool name matches a shell, deletion or network pattern',
      detail: alsoNetwork
        ? 'Content fetched at run time can influence what a shell or deletion tool is asked to do.'
        : 'Declaring this is not itself a problem; it is listed so a reviewer can confirm it is intended.',
      stat: { declared: declared.join(', '), classes: classes.join(', ') },
    });
  }

  return { findings };
}
