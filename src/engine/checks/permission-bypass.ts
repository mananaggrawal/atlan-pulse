import type { AuditFinding, AuditSkillInput } from '../types.ts';

/**
 * Frontmatter that removes a human from the loop.
 *
 * This is the highest-signal static check in the whole engine, and it exists
 * because of a specific published finding: a skill that declares
 * `allowed-tools` can execute commands *without the user being shown a
 * permission prompt*, and an agent declaring `permissionMode:
 * bypassPermissions` does the same. The user's mental model — "it will ask me
 * before it runs anything" — is simply false for those files, and the only
 * place that fact is visible is a line of YAML most people skim past.
 *
 * So this check does not judge whether the bypass is justified. It reports
 * that the prompt is gone, and where. Deciding whether that is acceptable is
 * the reader's job; knowing it is happening is not optional.
 */

/** `Bash`, `Bash(*)`, `Bash(*:*)` — a shell with no command constraint at all. */
const UNCONSTRAINED_SHELL =
  /^(?:bash|shell|sh|zsh|exec|execute|run_command|terminal)(?:\(\s*\*?\s*(?::\s*\*\s*)?\))?$/i;

/** `Bash(git status:*)` — a shell, but scoped to something a reader can evaluate. */
const SCOPED_SHELL = /^(?:bash|shell|sh|zsh|exec|execute|run_command|terminal)\s*\(/i;

const BYPASS_VALUES = /^(?:bypasspermissions|bypass|accepted?edits|acceptedits|dontask|yolo)$/i;

export function checkPermissionBypass(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
} {
  const findings: AuditFinding[] = [];

  for (const s of skills) {
    // 1 — an explicit permission mode that skips the prompt.
    const modeRaw = s.frontmatter?.['permissionMode'] ?? s.frontmatter?.['permission-mode'];
    const mode = typeof modeRaw === 'string' ? modeRaw.replace(/[-_\s]/g, '') : '';
    if (mode && BYPASS_VALUES.test(mode)) {
      findings.push({
        audit: 'security',
        check: 'permission-bypass',
        severity: 'high',
        skillName: s.name,
        headline: `Declares permissionMode: ${String(modeRaw)} — actions run without a prompt`,
        rule: 'frontmatter permissionMode set to a value that suppresses the approval prompt',
        detail:
          'Anyone who installs this skill will see it act without being asked first. ' +
          'That may be intended; it is reported because it is invisible anywhere else.',
        evidence: [{ file: 'SKILL.md', line: 1, patternClass: 'permission-mode' }],
        stat: { permissionMode: String(modeRaw) },
      });
    }

    // 2 — an unconstrained shell in allowed-tools.
    const declared = (s.allowedTools ?? []).map((t) => String(t).trim()).filter(Boolean);
    const unconstrained = declared.filter((t) => UNCONSTRAINED_SHELL.test(t));
    const scoped = declared.filter((t) => SCOPED_SHELL.test(t) && !UNCONSTRAINED_SHELL.test(t));

    if (unconstrained.length > 0) {
      findings.push({
        audit: 'security',
        check: 'unconstrained-shell',
        severity: 'medium',
        skillName: s.name,
        headline: `Pre-approves a shell with no command constraint (${unconstrained.join(', ')})`,
        rule: 'allowed-tools grants a shell tool with no argument pattern',
        detail:
          'A scoped grant such as Bash(git status:*) is reviewable; an unscoped one pre-approves every ' +
          'command the skill decides to run, including commands chosen from content it reads at run time.',
        evidence: [{ file: 'SKILL.md', line: 1, patternClass: 'allowed-tools' }],
        stat: { unconstrained: unconstrained.join(', '), scoped: scoped.length },
      });
    }
  }

  return { findings };
}
