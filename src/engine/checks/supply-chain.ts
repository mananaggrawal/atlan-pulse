import type { AuditFinding, AuditSkillInput, FindingEvidence } from '../types.ts';

/**
 * What a skill pulls in from outside itself.
 *
 * The published corpus audits of public skill collections found that the
 * malicious ones rarely look malicious in SKILL.md: the payload sits in a
 * bundled script, or arrives from an install command, or is written in a form
 * a reader's eye slides over. The three shapes below are the ones a static
 * pass can honestly claim to see.
 *
 * One of them — `hidden-path-file` — exists because of the evasion research:
 * scanners were beaten by moving the payload into directories scanners skip,
 * such as `.git/`. This engine does not skip them. It reports them, which is
 * the only defensible response to "the payload is somewhere you were not
 * looking".
 *
 * None of this proves a skill is safe. It reports what is visible in the
 * files you ship, which is a different and smaller claim.
 */

/** `curl … | sh`, `wget … | bash` — fetch and execute in one line, unreviewable by design. */
const PIPE_TO_SHELL =
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k|)sh\b/i;

/** Installs that resolve a version at run time, so what ran is not what was reviewed. */
const UNPINNED_INSTALL =
  /\b(?:npm\s+(?:i|install)|pnpm\s+add|yarn\s+add|pip3?\s+install|uv\s+pip\s+install|gem\s+install|cargo\s+install|go\s+install|brew\s+install)\b/i;
const PINNED = /(?:@\d|==\d|@[0-9a-f]{7,40}\b|--version[= ]\d|:\d+\.\d+)/i;

/** An install pointed somewhere other than the ecosystem's own registry. */
const OFF_REGISTRY =
  /(?:--registry[= ]|--index-url[= ]|--extra-index-url[= ]|-i\s+https?:\/\/)/i;

/** Payload written so a reader cannot read it. */
const OBFUSCATION = [
  { patternClass: 'base64-decode-to-shell', re: /\bbase64\s+(?:-d|--decode)\b[^\n]*\|\s*(?:ba|z|)sh\b/i },
  { patternClass: 'eval-of-fetched-content', re: /\beval\s*\(\s*(?:requests?\.|urllib|fetch\(|await\s+fetch)/i },
  { patternClass: 'python-exec-of-response', re: /\bexec\s*\(\s*(?:requests\.get|urlopen|response)/i },
];

/** Bundled files a reviewer will not open because they do not appear in a listing. */
const HIDDEN_PATH = /(?:^|\/)\.[^/]+\//;

const SCRIPT_EXT = /\.(?:sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|ps1)$/i;

function linesOf(content: string): string[] {
  return content.split('\n');
}

/**
 * Whether a line is a command rather than prose about a command.
 *
 * This gate was added because Pulse failed its own audit: a reference file
 * that *discusses* unpinned installs matched the same regex as a file that
 * *performs* one. A scanner that cannot tell documentation from instruction
 * will train its users to ignore it, so the install checks below fire only
 * inside a fenced block, an indented code block, or on a line that begins with
 * the command.
 *
 * Fetch-and-execute and obfuscation checks deliberately do NOT use this gate:
 * those constructions are worth a reviewer's eye wherever they appear.
 */
const COMMAND_START =
  /^\s*(?:[$>]\s*|`)?(?:sudo\s+)?(?:npm|pnpm|yarn|pip3?|uv|gem|cargo|go|brew|curl|wget)\b/i;

function commandLines(content: string): Set<number> {
  const lines = linesOf(content);
  const out = new Set<number>();
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence || /^ {4,}\S/.test(line) || COMMAND_START.test(line)) out.add(i + 1);
  });
  return out;
}

export function checkSupplyChain(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
  supplyChainFindings: number;
} {
  const findings: AuditFinding[] = [];

  for (const s of skills) {
    const sources: Array<{ file: string; content: string }> = [
      { file: 'SKILL.md', content: s.body },
      ...(s.files ?? []).map((f) => ({ file: f.file, content: f.content })),
    ];

    const pipeEvidence: FindingEvidence[] = [];
    const unpinnedEvidence: FindingEvidence[] = [];
    const offRegistryEvidence: FindingEvidence[] = [];
    const obfuscationEvidence: FindingEvidence[] = [];

    for (const src of sources) {
      const commands = commandLines(src.content);
      linesOf(src.content).forEach((line, i) => {
        const at = i + 1;
        if (PIPE_TO_SHELL.test(line)) {
          pipeEvidence.push({ file: src.file, line: at, patternClass: 'pipe-to-shell' });
        }
        if (commands.has(at) && UNPINNED_INSTALL.test(line) && !PINNED.test(line)) {
          unpinnedEvidence.push({ file: src.file, line: at, patternClass: 'unpinned-install' });
        }
        if (commands.has(at) && OFF_REGISTRY.test(line)) {
          offRegistryEvidence.push({ file: src.file, line: at, patternClass: 'off-registry-install' });
        }
        for (const o of OBFUSCATION) {
          if (o.re.test(line)) {
            obfuscationEvidence.push({ file: src.file, line: at, patternClass: o.patternClass });
          }
        }
      });
    }

    if (pipeEvidence.length > 0) {
      findings.push({
        audit: 'vulnerability',
        check: 'fetch-and-execute',
        severity: 'high',
        skillName: s.name,
        headline: `Fetches and executes a remote script in one step (${pipeEvidence.length} line${pipeEvidence.length === 1 ? '' : 's'})`,
        rule: 'a download command piped directly into a shell',
        detail:
          'What runs is whatever that URL serves at the moment it is called, which is not what anyone reviewed.',
        evidence: pipeEvidence.slice(0, 10),
      });
    }

    if (obfuscationEvidence.length > 0) {
      findings.push({
        audit: 'vulnerability',
        check: 'obfuscated-payload',
        severity: 'high',
        skillName: s.name,
        headline: 'Executes content that is decoded or fetched at run time',
        rule: 'a decode-then-execute or fetch-then-eval construction',
        detail: 'The instruction that runs cannot be read by reviewing this file.',
        evidence: obfuscationEvidence.slice(0, 10),
      });
    }

    if (offRegistryEvidence.length > 0) {
      findings.push({
        audit: 'vulnerability',
        check: 'off-registry-install',
        severity: 'medium',
        skillName: s.name,
        headline: 'Installs a dependency from a non-default index',
        rule: 'an install command carrying a registry or index-url override',
        detail:
          'A redirected index can serve a different package under a name the reader recognises.',
        evidence: offRegistryEvidence.slice(0, 10),
      });
    }

    if (unpinnedEvidence.length > 0) {
      findings.push({
        audit: 'vulnerability',
        check: 'unpinned-install',
        severity: 'low',
        skillName: s.name,
        headline: `Installs ${unpinnedEvidence.length} dependenc${unpinnedEvidence.length === 1 ? 'y' : 'ies'} without a pinned version`,
        rule: 'an install command with no version, tag or digest',
        detail: 'The version that runs next month is not the version that was reviewed today.',
        evidence: unpinnedEvidence.slice(0, 10),
      });
    }

    // Files that a reviewer scrolling the folder will never see.
    const hidden = (s.files ?? []).filter((f) => HIDDEN_PATH.test(`/${f.file}`));
    if (hidden.length > 0) {
      findings.push({
        audit: 'vulnerability',
        check: 'hidden-path-file',
        severity: hidden.some((f) => SCRIPT_EXT.test(f.file)) ? 'high' : 'medium',
        skillName: s.name,
        headline: `Ships ${hidden.length} file${hidden.length === 1 ? '' : 's'} inside a dot-directory`,
        rule: 'a bundled file whose path contains a directory beginning with a dot',
        detail:
          'Published evasion research hides payloads in exactly these directories because reviewers and ' +
          'scanners skip them. This engine does not skip them.',
        evidence: hidden
          .slice(0, 10)
          .map((f) => ({ file: f.file, line: 1, patternClass: 'hidden-path' })),
        stat: { files: hidden.slice(0, 5).map((f) => f.file).join(', ') },
      });
    }
  }

  return { findings, supplyChainFindings: findings.length };
}
