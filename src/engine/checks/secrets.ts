import type { AuditFinding, AuditSkillInput, FindingEvidence } from '../types.ts';
import { SECRET_ENTROPY_THRESHOLD } from '../constants.ts';

/**
 * Credential-shaped text inside skill files.
 *
 * THE RULE THAT MATTERS MORE THAN THE DETECTION: this check reports a file, a
 * line and the class of pattern. It never puts the matched text into a
 * headline, a detail, a stat or an evidence record — not truncated, not
 * masked, not "first four characters". A report is a thing people screenshot
 * and paste into public channels, and a masked secret in a screenshot is
 * still a secret plus a map to it. There is a test asserting no matched value
 * can reach the output object.
 */

interface SecretPattern {
  patternClass: string;
  re: RegExp;
}

/**
 * Prefix-anchored shapes only. Each of these identifies a specific issuer, so
 * a match is meaningful on its own without any entropy check.
 */
const PATTERNS: SecretPattern[] = [
  { patternClass: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { patternClass: 'openai-api-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { patternClass: 'anthropic-api-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { patternClass: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { patternClass: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { patternClass: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { patternClass: 'stripe-key', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { patternClass: 'private-key-block', re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  { patternClass: 'json-web-token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

/**
 * The generic case: something *named* like a credential, assigned a quoted
 * value that looks generated rather than written. Both halves are required —
 * `api_key: "your-key-here"` is a placeholder and should not fire.
 */
const ASSIGNMENT =
  /\b(api[_-]?key|apikey|secret|password|passwd|token|access[_-]?key|auth)\b\s*[:=]\s*["']([^"'\n]{16,})["']/gi;

/** Obvious placeholder values, which are the whole reason this needs an allowlist. */
const PLACEHOLDER =
  /^(?:your|my|the|a|an|example|sample|placeholder|dummy|fake|test|xxx|change|replace|insert|todo|redacted|<)/i;

export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function scanText(text: string, file: string): FindingEvidence[] {
  const hits: FindingEvidence[] = [];
  const lines = text.split('\n');

  lines.forEach((line, idx) => {
    for (const { patternClass, re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        hits.push({ file, line: idx + 1, patternClass });
      }
    }

    ASSIGNMENT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASSIGNMENT.exec(line)) !== null) {
      const value = m[2] ?? '';
      if (PLACEHOLDER.test(value)) continue;
      if (/\s/.test(value)) continue; // a sentence, not a credential
      if (shannonEntropy(value) < SECRET_ENTROPY_THRESHOLD) continue;
      hits.push({ file, line: idx + 1, patternClass: 'high-entropy-assignment' });
    }
  });

  return hits;
}

export function checkSecrets(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
  secretFindings: number;
} {
  const findings: AuditFinding[] = [];

  for (const s of skills) {
    const evidence: FindingEvidence[] = [
      ...scanText(s.body ?? '', 'SKILL.md'),
      ...(s.files ?? []).flatMap((f) => scanText(f.content ?? '', f.file)),
    ];
    if (evidence.length === 0) continue;

    const classes = [...new Set(evidence.map((e) => e.patternClass))].sort();
    findings.push({
      audit: 'security',
      check: 'hardcoded-secret',
      severity: 'high',
      skillName: s.name,
      headline: `${evidence.length} credential-shaped value${evidence.length === 1 ? '' : 's'} in ${new Set(evidence.map((e) => e.file)).size} file${new Set(evidence.map((e) => e.file)).size === 1 ? '' : 's'}`,
      rule: 'text matching a known credential format, or a credential-named assignment with a high-entropy quoted value',
      detail:
        'Location and pattern class only — the matched values are never read into this report. ' +
        'Open the file yourself to confirm; a match can be a fixture or an example.',
      evidence,
      stat: { matches: evidence.length, patternClasses: classes.join(', ') },
    });
  }

  return { findings, secretFindings: findings.length };
}
