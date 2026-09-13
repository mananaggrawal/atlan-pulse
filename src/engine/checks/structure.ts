import type { AuditFinding, AuditSkillInput } from '../types.ts';

/**
 * Whether a skill is well-formed enough to be found and maintained.
 *
 * The trigger check is the one that earns its place. A description that
 * describes the skill ("Handles invoicing") tells the model what it IS; a
 * description that states a trigger ("Use when the user asks to raise or
 * chase an invoice") tells the model WHEN to reach for it. The second is what
 * actually makes a skill fire, and the absence of any trigger phrasing is the
 * most common reason a perfectly good skill never runs.
 *
 * This is a structural signal only — it asks whether trigger language is
 * present, not whether the trigger is any good. Judging the quality of a
 * trigger is a model's job and lives in the reviewer layer.
 */

const TRIGGER_CUES = [
  'use when',
  'use this when',
  'when the user',
  'whenever',
  'trigger',
  'for when',
  'invoke when',
  'call this when',
  'apply when',
  'use for',
  'use it when',
];

/** Markdown links and bare relative paths that point inside the skill folder. */
const REL_REF = /(?:\]\(|["'`])(\.\/[^)"'`\s]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)(?:\)|["'`])/g;

export function checkStructure(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
  skillsWithoutOwner: number;
  /** Checks attempted and checks passed, for the hygiene score. */
  attempted: number;
  passed: number;
} {
  const findings: AuditFinding[] = [];
  let skillsWithoutOwner = 0;
  let attempted = 0;
  let passed = 0;

  for (const s of skills) {
    // 1 — description present
    attempted += 1;
    const description = (s.description ?? '').trim();
    if (description.length === 0) {
      findings.push({
        audit: 'improvement',
        check: 'missing-description',
        severity: 'medium',
        skillName: s.name,
        headline: 'No description in frontmatter',
        rule: 'empty or absent description field',
        detail: 'Without a description the model has nothing to match a request against.',
      });
    } else {
      passed += 1;
    }

    // 2 — description states a trigger
    attempted += 1;
    const lower = description.toLowerCase();
    if (description.length > 0 && !TRIGGER_CUES.some((cue) => lower.includes(cue))) {
      findings.push({
        audit: 'improvement',
        check: 'no-trigger-in-description',
        severity: 'low',
        skillName: s.name,
        headline: 'Description names no triggering condition',
        rule: 'description contains none of the trigger phrasings checked for',
        detail:
          'Checked for phrasings such as "use when", "when the user", "whenever". ' +
          'This is a presence check on wording, not a judgement of whether the trigger is well chosen.',
      });
    } else if (description.length > 0) {
      passed += 1;
    }

    // 3 — an owner exists
    attempted += 1;
    const owners = (s.owners ?? []).filter((o) => o && o.trim().length > 0);
    if (owners.length === 0) {
      skillsWithoutOwner += 1;
      findings.push({
        audit: 'improvement',
        check: 'no-owner',
        severity: 'low',
        skillName: s.name,
        headline: 'No owner recorded',
        rule: 'no owner or author in frontmatter, and no owner grant resolved',
        detail: 'Nobody is named as answerable for this skill when it drifts.',
      });
    } else {
      passed += 1;
    }

    // 4 — relative references resolve to a bundled file
    attempted += 1;
    const bundled = new Set((s.files ?? []).map((f) => f.file.replace(/^\.\//, '')));
    const broken: string[] = [];
    for (const m of s.body.matchAll(REL_REF)) {
      const raw = m[1]!;
      if (/^https?:|^mailto:|^#/.test(raw)) continue;
      const rel = raw.replace(/^\.\//, '');
      // Only judge references that look like they mean a file in this folder.
      if (!/\.[A-Za-z0-9]{1,6}$/.test(rel)) continue;
      if (!bundled.has(rel)) broken.push(rel);
    }
    const uniqueBroken = [...new Set(broken)];
    if (uniqueBroken.length > 0) {
      findings.push({
        audit: 'improvement',
        check: 'broken-file-reference',
        severity: 'low',
        skillName: s.name,
        headline: `References ${uniqueBroken.length} file${uniqueBroken.length === 1 ? '' : 's'} that are not bundled with it`,
        rule: 'relative file reference in the body with no matching bundled file',
        detail: 'Only references that look like a filename are checked; URLs and anchors are ignored.',
        stat: { missing: uniqueBroken.slice(0, 10).join(', ') },
      });
    } else {
      passed += 1;
    }
  }

  return { findings, skillsWithoutOwner, attempted, passed };
}
