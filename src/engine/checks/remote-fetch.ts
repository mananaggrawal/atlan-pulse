import type { AuditFinding, AuditSkillInput, FindingEvidence } from '../types.ts';

/**
 * Instructions that send the agent to fetch something and then act on it.
 *
 * This is the structural half of prompt-injection review: a skill that says
 * "read the page at <url> and follow the steps it lists" has handed control
 * of the agent to whoever controls that page. Finding the *shape* needs no
 * model — a fetch verb and a URL in the same instruction is enough to point a
 * reviewer at the line.
 *
 * Whether the fetched content actually reaches an instruction boundary is a
 * judgement call, and that half lives in the reviewer layer. This check
 * deliberately does not try to make it, which is why it is `low` severity: it
 * is a pointer, not a verdict.
 */

const FETCH_VERB =
  /\b(fetch|download|curl|wget|retrieve|scrape|load|read|open|visit|browse|GET)\b/i;
const URL_RE = /https?:\/\/[^\s)\]"'`<>]+/g;
const FOLLOW =
  /\b(follow|obey|execute|run|apply|do what|as instructed|according to|per the|use the instructions)\b/i;

/** Hosts that are documentation by nature — a link to these is a citation, not a control channel. */
const BENIGN_HOST = /^(?:www\.)?(?:docs?\.|developer\.)?(?:github\.com|gitlab\.com|stackoverflow\.com|wikipedia\.org|npmjs\.com|python\.org|mozilla\.org|w3\.org)/i;

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/:]+)/i.exec(url);
  return m ? m[1]! : '';
}

export function checkRemoteFetch(skills: AuditSkillInput[]): { findings: AuditFinding[] } {
  const findings: AuditFinding[] = [];

  for (const s of skills) {
    const evidence: FindingEvidence[] = [];
    const hosts = new Set<string>();

    const scan = (text: string, file: string): void => {
      text.split('\n').forEach((line, idx) => {
        URL_RE.lastIndex = 0;
        const urls = line.match(URL_RE);
        if (!urls) return;
        if (!FETCH_VERB.test(line) && !FOLLOW.test(line)) return;
        const interesting = urls.filter((u) => !BENIGN_HOST.test(hostOf(u)));
        if (interesting.length === 0) return;
        for (const u of interesting) hosts.add(hostOf(u));
        evidence.push({ file, line: idx + 1, patternClass: 'fetch-and-act' });
      });
    };

    scan(s.body ?? '', 'SKILL.md');
    for (const f of s.files ?? []) scan(f.content ?? '', f.file);

    if (evidence.length === 0) continue;

    findings.push({
      audit: 'security',
      check: 'remote-content-instruction',
      severity: 'low',
      skillName: s.name,
      headline: `${evidence.length} instruction${evidence.length === 1 ? '' : 's'} fetch remote content`,
      rule: 'a fetch or follow verb and a non-documentation URL on the same line',
      detail:
        'Content the agent fetches at run time is untrusted input. Whether it reaches an instruction ' +
        'boundary is a judgement this check does not make — it points at the line so a reviewer can.',
      evidence,
      stat: { hosts: [...hosts].sort().slice(0, 8).join(', '), occurrences: evidence.length },
    });
  }

  return { findings };
}
